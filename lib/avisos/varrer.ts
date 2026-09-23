// ============================================================================
//  A VARREDURA DOS AVISOS DO PEDIDO  ·  17/09/2026
//
//  Pedido do Marco: avisar por e-mail a cada nó da linha do tempo do pedido,
//  com a ordem dele por padrão e a opção de automático por nó.
//
//  A DECISÃO QUE ORGANIZA TUDO: o aviso é DERIVADO das trilhas que já existem,
//  e não de um gatilho novo.
//
//    nó 1  recebido ........... email_fluxo_eventos · caso/nasceu
//    nó 2  triagem ............ email_fluxo_eventos · caso/etapa -> analise
//    nó 3  analise_iniciada ... email_fluxo_eventos · fila/situacao -> em_andamento
//    nó 4  analise_concluida .. email_fluxo_eventos · fila/situacao -> concluida
//    nó 5  subscricao ......... fam_historico · operacoes.status -> Em Análise
//
//  Por que assim, e não com gatilho novo: quase toda etapa acontece FORA do
//  servidor (o motor roda no notebook e manda retratos). Quem enxerga todas
//  elas é o banco, depois do fato. Trilha já existe, e duplicá-la seria criar
//  uma segunda verdade sobre a mesma etapa.
//
//  DUAS TRAVAS, porque aviso é coisa que sai da FAM:
//    · `chave` é única por transição: a varredura pode rodar a cada minuto e a
//      mesma etapa nunca vira dois e-mails;
//    · nada nasce antes de `aviso_regras.avisar_a_partir_de`. Sem isso, a
//      primeira varredura escreveria para o acervo inteiro (139 análises).
//
//  Quem envia é o Carteiro, na máquina do Outlook. Aqui só se decide O QUE
//  seria dito, e para quem.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { preencherTexto } from '@/lib/email/regras'

export const NOS = ['recebido', 'triagem', 'analise_iniciada', 'analise_concluida', 'subscricao'] as const
export type No = typeof NOS[number]

export interface ReguaAviso {
  no: No
  ordem: number
  titulo: string
  ligado: boolean
  modo: 'pedir' | 'automatico'
  destinatarios: string[]
  assunto: string
  texto: string
  avisar_a_partir_de: string
}

/** Uma transição lida de uma das duas trilhas, antes de virar aviso. */
interface Transicao {
  no: No
  chave: string
  em: string
  caso_id?: string | null
  analise_fila_id?: string | null
  operacao_id?: string | null
}

/** O status do funil que significa "entrou na subscrição" (decisão dele em
 *  17/09/2026). Trocar aqui muda o nó 5 inteiro. */
export const STATUS_SUBSCRICAO = 'Em Análise'

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/* ── 1. as transições que ainda não viraram aviso ──────────────────────────── */

async function daTrilhaDoFluxo(sb: SupabaseClient, regua: ReguaAviso[]): Promise<Transicao[]> {
  const ligados = new Map(regua.filter(r => r.ligado).map(r => [r.no, r]))
  if (!ligados.size) return []
  // A trilha guarda entidade/campo/para; o de-para dos quatro primeiros nós é este.
  const desde = [...ligados.values()].reduce((m, r) => (r.avisar_a_partir_de < m ? r.avisar_a_partir_de : m), '9999')
  const { data } = await sb
    .from('email_fluxo_eventos')
    .select('entidade, entidade_id, campo, para, em')
    .in('entidade', ['caso', 'fila'])
    .gte('em', desde)
    .order('em', { ascending: true })
    .limit(500)

  const saida: Transicao[] = []
  for (const e of data ?? []) {
    let no: No | null = null
    if (e.entidade === 'caso' && e.campo === 'nasceu') no = 'recebido'
    else if (e.entidade === 'caso' && e.campo === 'etapa' && e.para === 'analise') no = 'triagem'
    else if (e.entidade === 'fila' && e.campo === 'situacao' && e.para === 'em_andamento') no = 'analise_iniciada'
    else if (e.entidade === 'fila' && e.campo === 'situacao' && e.para === 'concluida') no = 'analise_concluida'
    if (!no) continue
    const r = ligados.get(no)
    if (!r || e.em < r.avisar_a_partir_de) continue
    saida.push({
      no,
      chave: `${no}:${e.entidade_id}`,
      em: e.em,
      caso_id: e.entidade === 'caso' ? e.entidade_id : null,
      analise_fila_id: e.entidade === 'fila' ? e.entidade_id : null,
    })
  }
  return saida
}

async function daTrilhaDaOperacao(sb: SupabaseClient, regua: ReguaAviso[]): Promise<Transicao[]> {
  const r = regua.find(x => x.no === 'subscricao')
  if (!r?.ligado) return []
  const { data } = await sb
    .from('fam_historico')
    .select('registro_id, valor_depois, mudou_em')
    .eq('tabela', 'operacoes')
    .eq('campo', 'status')
    .eq('valor_depois', STATUS_SUBSCRICAO)
    .gte('mudou_em', r.avisar_a_partir_de)
    .order('mudou_em', { ascending: true })
    .limit(200)
  return (data ?? []).map(h => ({
    no: 'subscricao' as const,
    // A operação pode ir e voltar de status; o aviso é do PRIMEIRO ingresso.
    chave: `subscricao:${h.registro_id}`,
    em: h.mudou_em as string,
    operacao_id: h.registro_id as string,
  }))
}

/* ── 2. de quem é o pedido: empresa, CNPJ e os elos ────────────────────────── */

interface Quem {
  empresa: string | null
  cnpj: string | null
  tomador_id: string | null
  caso_id: string | null
  email_caixa_id: string | null
  de: string | null
}

async function quemE(sb: SupabaseClient, t: Transicao): Promise<Quem> {
  const vazio: Quem = { empresa: null, cnpj: null, tomador_id: null, caso_id: t.caso_id ?? null, email_caixa_id: null, de: null }

  if (t.caso_id) {
    const { data: c } = await sb.from('casos')
      .select('id, assunto, cnpj, tomador_id, email_caixa_id, remetente_nome, tomador:tomadores(razao_social)')
      .eq('id', t.caso_id).maybeSingle()
    if (!c) return vazio
    const tom = c.tomador as unknown as { razao_social: string } | { razao_social: string }[] | null
    const razao = Array.isArray(tom) ? tom[0]?.razao_social : tom?.razao_social
    return {
      empresa: razao ?? c.assunto ?? null,
      cnpj: digitos(c.cnpj) || null,
      tomador_id: c.tomador_id ?? null,
      caso_id: c.id,
      email_caixa_id: c.email_caixa_id ?? null,
      de: c.remetente_nome ?? null,
    }
  }

  if (t.analise_fila_id) {
    const { data: f } = await sb.from('analise_fila')
      .select('id, pasta, cnpj, razao_social, tomador_id, caso_id, caso:casos(email_caixa_id, remetente_nome)')
      .eq('id', t.analise_fila_id).maybeSingle()
    if (!f) return vazio
    const cs = f.caso as unknown as { email_caixa_id: string | null; remetente_nome: string | null } | { email_caixa_id: string | null; remetente_nome: string | null }[] | null
    const caso = Array.isArray(cs) ? cs[0] : cs
    return {
      empresa: f.razao_social ?? f.pasta ?? null,
      cnpj: digitos(f.cnpj) || null,
      tomador_id: f.tomador_id ?? null,
      caso_id: f.caso_id ?? null,
      email_caixa_id: caso?.email_caixa_id ?? null,
      de: caso?.remetente_nome ?? null,
    }
  }

  if (t.operacao_id) {
    const { data: o } = await sb.from('operacoes')
      .select('id, tomador_id, tomador:tomadores(razao_social, cnpj)')
      .eq('id', t.operacao_id).maybeSingle()
    if (!o) return vazio
    const tom = o.tomador as unknown as { razao_social: string; cnpj: string } | { razao_social: string; cnpj: string }[] | null
    const dono = Array.isArray(tom) ? tom[0] : tom
    /* A operação não guarda de que pedido veio (`casos.operacao_id` existe e
       está morta). O elo possível hoje é o CNPJ, e é por ele que o aviso da
       subscrição acha o caso e o fio do e-mail original. */
    let caso_id: string | null = null
    let email_caixa_id: string | null = null
    let de: string | null = null
    if (dono?.cnpj) {
      const { data: c } = await sb.from('casos')
        .select('id, email_caixa_id, remetente_nome')
        .eq('cnpj', digitos(dono.cnpj))
        .order('criado_em', { ascending: false }).limit(1).maybeSingle()
      caso_id = c?.id ?? null
      email_caixa_id = c?.email_caixa_id ?? null
      de = c?.remetente_nome ?? null
    }
    return { empresa: dono?.razao_social ?? null, cnpj: digitos(dono?.cnpj) || null, tomador_id: o.tomador_id ?? null, caso_id, email_caixa_id, de }
  }

  return vazio
}

/* ── 3. a varredura ───────────────────────────────────────────────────────── */

export interface ResultadoVarredura {
  criados: number
  ja_existiam: number
  sem_destinatario: number
  /** Nasceram com marcador aberto (a empresa não foi apurada): nunca saem sozinhos. */
  sem_texto: number
  automaticos: number
  erros: string[]
}

/** Lê as duas trilhas e cria o que faltar. Idempotente: pode rodar a cada
 *  minuto. Precisa de um cliente com service role (a criação de aviso não é
 *  ato de tela). */
export async function varrerAvisos(sb: SupabaseClient): Promise<ResultadoVarredura> {
  const r: ResultadoVarredura = { criados: 0, ja_existiam: 0, sem_destinatario: 0, sem_texto: 0, automaticos: 0, erros: [] }

  const { data: reguaCrua, error: erroRegua } = await sb.from('aviso_regras').select('*').order('ordem')
  if (erroRegua) { r.erros.push(erroRegua.message); return r }
  const regua = (reguaCrua ?? []) as unknown as ReguaAviso[]

  const transicoes = [...await daTrilhaDoFluxo(sb, regua), ...await daTrilhaDaOperacao(sb, regua)]
  if (!transicoes.length) return r

  // O que já virou aviso não é buscado de novo, um por um: uma consulta só.
  const { data: jaTem } = await sb.from('avisos_pedido').select('chave').in('chave', transicoes.map(t => t.chave))
  const existentes = new Set((jaTem ?? []).map(x => x.chave as string))

  for (const t of transicoes) {
    if (existentes.has(t.chave)) { r.ja_existiam++; continue }
    const regra = regua.find(x => x.no === t.no)
    if (!regra) continue
    const quem = await quemE(sb, t)
    const dados = { empresa: quem.empresa ?? undefined, cnpj: quem.cnpj ?? undefined, de: quem.de ?? undefined }
    const assunto = preencherTexto(regra.assunto, dados)
    const corpo = preencherTexto(regra.texto, dados)

    /* Automático SÓ sai quando há para quem mandar E o texto está completo.
       Sem destinatário, o aviso nasce esperando ele: um automático que não sai
       em silêncio seria pior do que um pedido de autorização. E texto com
       marcador aberto ("a análise de {empresa} foi concluída") é pior ainda:
       sairia assim para a pessoa. Quando a empresa não foi apurada, o marcador
       FICA VISÍVEL de propósito, e o aviso espera alguém escrever o nome. */
    const temPara = regra.destinatarios.length > 0
    const completo = !/\{\w+\}/.test(assunto) && !/\{\w+\}/.test(corpo)
    if (!temPara) r.sem_destinatario++
    if (!completo) r.sem_texto++
    const estado = regra.modo === 'automatico' && temPara && completo ? 'autorizado' : 'a_autorizar'
    if (estado === 'autorizado') r.automaticos++

    const { error } = await sb.from('avisos_pedido').insert({
      no: t.no,
      chave: t.chave,
      caso_id: quem.caso_id,
      analise_fila_id: t.analise_fila_id ?? null,
      operacao_id: t.operacao_id ?? null,
      tomador_id: quem.tomador_id,
      email_caixa_id: quem.email_caixa_id,
      empresa: quem.empresa,
      cnpj: quem.cnpj,
      destinatarios: regra.destinatarios,
      assunto,
      corpo,
      estado,
      modo: regra.modo,
      ocorrido_em: t.em,
    })
    // Corrida com outra varredura: a chave única recusa a segunda, e isso é sucesso.
    if (error) {
      if (error.code === '23505') r.ja_existiam++
      else r.erros.push(`${t.chave}: ${error.message}`)
      continue
    }
    r.criados++
  }
  return r
}
