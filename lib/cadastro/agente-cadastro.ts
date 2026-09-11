// ============================================================================
//  O AGENTE DE CADASTRO  ·  a metade que mora no CRM  ·  10/09/2026
//
//  Ordem do Marco: depois da triagem, "o agente de cadastro deve abrir todos os
//  documentos, identificar o tomador e realizar o cadastro dos dados
//  cadastrais, conferir Contrato Social com Serasa, quando se aplicar; quando
//  não tiver contrato social, apenas informar, mas usar o Serasa como fonte de
//  cadastro". Sem nada faltando, manda para a análise de crédito.
//
//  AS DUAS METADES:
//    no notebook (`scripts/esteira.mjs`)  a IA lê o Serasa, o contrato social e
//                                         o cartão CNPJ que a triagem já
//                                         extraiu, e devolve a leitura em JSON
//    aqui                                 o que é regra, e não opinião: CNPJ
//                                         válido, Receita, criar ou completar o
//                                         tomador, decidir se segue, e dar a
//                                         ordem de analisar
//
//  POR QUE A DECISÃO É DAQUI E NÃO DA IA: "segue ou não segue" gasta uma análise
//  de crédito inteira. A IA aponta divergência; quem transforma divergência em
//  parada é esta regra, escrita e auditável.
//
//  O QUE PARA A ESTEIRA (e só isto):
//    · sem CNPJ válido nos documentos
//    · a Receita diz que a empresa não está ATIVA
//    · a IA marcou algo como `bloqueia` (documento de outra empresa, CNPJ que
//      não bate entre os documentos)
//  O resto (capital diferente, sócio que saiu, contrato ausente) é ATENÇÃO:
//  vai escrito no card e a análise segue, porque é exatamente o que a análise
//  de crédito existe para pesar.
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { consultarCNPJ, type CartaoCNPJ } from '@/lib/cnpj'
import { validarCNPJ } from '@/lib/utils'
import { acharOuCriarTomadorPorCnpj } from '@/lib/tomador/criar-por-cnpj'
import { complementarTomador, dadosDoCartao, sociosDoCartao, type DadosCadastrais, type SocioEntrada } from '@/lib/tomador/complementar'
import { passarCasoParaTomador } from '@/lib/casos/concluir'
import { ordemVale } from '@/lib/analise/esteira'
import { casarCorretora } from '@/lib/analise/corretoras.mjs'
import type { CadastroAgente } from '@/lib/analise/mesa'

export interface LeituraDoAgente {
  cnpj?: string | null
  razao_social?: string | null
  nome_fantasia?: string | null
  endereco?: { logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null; cep?: string | null } | null
  capital_social?: number | string | null
  data_abertura?: string | null
  cnae?: string | null
  socios?: { nome?: string; documento?: string | null; tipo?: string | null; percentual?: number | null; cargo?: string | null }[]
  fontes?: { contrato_social?: boolean; serasa?: boolean; cartao_cnpj?: boolean }
  conferencia?: { campo?: string; contrato_social?: string | null; serasa?: string | null; confere?: boolean; gravidade?: string; nota?: string | null }[]
  bloqueios?: string[]
  observacoes?: string | null
  corretora?: string | null
}

export interface EntradaCadastro {
  id: string
  hash?: string | null
  leitura?: LeituraDoAgente | null
  triagem?: { cnpj?: string | null; empresa?: string | null; corretora?: string | null } | null
  erro?: string | null
}

const txt = (v: unknown, max = 500) => {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : null
}
const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/** Razão social para comparar: sem acento, sem pontuação, sem o tipo societário. */
function chaveDoNome(s: string | null | undefined) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\b(ltda|limitada|s\.?\s?a\.?|eireli|me|epp|sociedade anonima|em recuperacao judicial)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

export async function aplicarCadastroDoAgente(sb: SupabaseClient, e: EntradaCadastro) {
  const { data: fila } = await sb
    .from('analise_fila')
    .select('id, pasta, caso_id, tomador_id, situacao, ordem, automatica, corretora')
    .eq('id', e.id)
    .maybeSingle()
  if (!fila) return { ok: false as const, status: 404, erro: 'Análise não está na fila.' }

  const agora = new Date().toISOString()
  const base: CadastroAgente = {
    status: 'ok', hash: txt(e.hash, 100), em: agora, motivos: [], atencao: [],
    tomador_id: null, tomador_criado: false, razao_social: null, cnpj: null,
    receita: { ok: false }, fonte: null, preenchidos: [], conferencia: [],
    fontes: { contrato_social: false, serasa: false, cartao_cnpj: false },
    observacoes: null, analise_mandada: false,
  }

  // ── a IA não conseguiu ler: fica escrito, e não se tenta de novo sozinho ──
  if (e.erro || !e.leitura) {
    const r: CadastroAgente = { ...base, status: 'erro', motivos: [txt(e.erro, 600) ?? 'O agente não devolveu a leitura dos documentos.'] }
    await sb.from('analise_fila').update({ cadastro_agente: r, cadastro_agente_em: agora }).eq('id', fila.id)
    return { ok: true as const, cadastro: r }
  }

  const L = e.leitura
  const r: CadastroAgente = {
    ...base,
    fontes: { contrato_social: !!L.fontes?.contrato_social, serasa: !!L.fontes?.serasa, cartao_cnpj: !!L.fontes?.cartao_cnpj },
    observacoes: txt(L.observacoes, 1500),
    conferencia: (Array.isArray(L.conferencia) ? L.conferencia : []).slice(0, 30).map((c) => ({
      campo: txt(c.campo, 80) ?? 'campo',
      contrato_social: txt(c.contrato_social, 300),
      serasa: txt(c.serasa, 300),
      confere: !!c.confere,
      gravidade: c.gravidade === 'bloqueia' ? 'bloqueia' : c.gravidade === 'atencao' ? 'atencao' : 'ok',
      nota: txt(c.nota, 400),
    })),
  }

  // ── 1. o CNPJ: o da leitura, senão o da triagem, e só com dígito certo ──
  const candidatos = [digitos(L.cnpj), digitos(e.triagem?.cnpj)].filter((c) => c.length === 14 && validarCNPJ(c))
  const cnpj = candidatos[0] ?? ''
  if (!cnpj) {
    r.status = 'bloqueado'
    r.motivos.push('Não achei um CNPJ válido do tomador nos documentos. Confira se veio o Serasa ou o cartão CNPJ da empresa.')
    await sb.from('analise_fila').update({ cadastro_agente: r, cadastro_agente_em: agora }).eq('id', fila.id)
    return { ok: true as const, cadastro: r }
  }
  r.cnpj = cnpj
  if (candidatos.length === 2 && candidatos[0] !== candidatos[1]) {
    r.atencao.push(`A triagem tinha apontado outro CNPJ (${candidatos[1]}). Vale o que os documentos do tomador dizem (${cnpj}).`)
  }

  /* O CASO JÁ FOI LIGADO À MÃO A OUTRA EMPRESA (achado da revisão, 10/09/2026).
     A tela do caso (passo 1) cria o tomador pelo CNPJ digitado, e ela continua
     valendo em paralelo com a esteira. Se a pessoa ligou o caso a um CNPJ e os
     documentos dizem outro, quem decide é ela: o agente não amarra o caso a um
     segundo tomador nem cria cadastro novo por cima da decisão humana. */
  const { data: casoAtual } = fila.caso_id
    ? await sb.from('casos').select('id, etapa, tomador_id, corretora_id').eq('id', fila.caso_id).maybeSingle()
    : { data: null }
  if (casoAtual?.tomador_id) {
    const { data: ligado } = await sb.from('tomadores').select('id, razao_social, cnpj').eq('id', casoAtual.tomador_id).maybeSingle()
    const cnpjLigado = digitos(ligado?.cnpj)
    if (cnpjLigado.length === 14 && cnpjLigado !== cnpj) {
      r.status = 'bloqueado'
      r.motivos.push(`O caso foi ligado à mão a ${ligado?.razao_social ?? 'outro tomador'} (CNPJ ${cnpjLigado}), mas os documentos são do CNPJ ${cnpj}. Confira qual é o tomador antes de seguir.`)
      await sb.from('analise_fila').update({ cadastro_agente: r, cadastro_agente_em: agora }).eq('id', fila.id)
      return { ok: true as const, cadastro: r }
    }
  }

  // ── 2. a Receita: sempre tentada; fora do ar, o cadastro nasce do Serasa ──
  let cartao: CartaoCNPJ | null = null
  let receitaErro: string | null = null
  try { cartao = await consultarCNPJ(cnpj) } catch (x) { receitaErro = x instanceof Error ? x.message : 'a Receita não respondeu' }
  r.receita = { ok: !!cartao, motivo: receitaErro, situacao: cartao?.situacao ?? null }
  r.fonte = cartao ? 'receita' : 'serasa'
  if (!cartao) r.atencao.push(`A Receita não respondeu (${receitaErro}). O cadastro nasceu com os dados do Serasa e dos documentos: confira o endereço.`)
  if (cartao?.situacao && !/^ativa$/i.test(cartao.situacao.trim())) {
    r.status = 'bloqueado'
    r.motivos.push(`A Receita diz que a empresa está ${cartao.situacao.toUpperCase()}.`)
  }

  const reserva: DadosCadastrais = {
    nome_fantasia: txt(L.nome_fantasia, 200),
    endereco: txt(L.endereco?.logradouro, 300), numero: txt(L.endereco?.numero, 30),
    complemento: txt(L.endereco?.complemento, 120), bairro: txt(L.endereco?.bairro, 120),
    cidade: txt(L.endereco?.cidade, 120), estado: txt(L.endereco?.uf, 2), cep: txt(L.endereco?.cep, 12),
    cnae: txt(L.cnae, 300),
    capital_social: typeof L.capital_social === 'number' ? L.capital_social : (txt(L.capital_social, 40) as unknown as number | null),
    data_abertura: txt(L.data_abertura, 20),
  }
  const sociosLidos: SocioEntrada[] = (Array.isArray(L.socios) ? L.socios : [])
    .filter((s) => txt(s.nome))
    .map((s) => ({
      nome: String(s.nome), documento: txt(s.documento, 30),
      tipo: s.tipo === 'PJ' ? 'PJ' : s.tipo === 'PF' ? 'PF' : null,
      percentual: typeof s.percentual === 'number' ? s.percentual : null, cargo: txt(s.cargo, 120),
    }))

  // ── 3. o tomador: acha pelo CNPJ ou cria; e completa o que estiver vazio ──
  /* A CORRETORA: a do caso (achada no e-mail ou escolhida na lista) vale mais;
     sem ela, o nome que a IA leu, casado com o cadastro pela regra única. */
  let corretoraId = (casoAtual?.corretora_id as string | null) ?? null
  if (!corretoraId && txt(L.corretora, 120)) {
    const { data: cs } = await sb.from('corretoras').select('id, razao_social, nome_fantasia, cnpj').eq('status', 'ativo')
    const par = casarCorretora(txt(L.corretora, 120), cs ?? [])
    if (par.achou) corretoraId = par.corretora_id
    else r.atencao.push(`A corretora "${txt(L.corretora, 120)}" do e-mail não está no cadastro de corretoras do CRM.`)
  }

  const razaoDocs = txt(L.razao_social, 300) ?? txt(e.triagem?.empresa, 300)
  const t = await acharOuCriarTomadorPorCnpj(sb, {
    cnpj,
    razao_social: razaoDocs ?? undefined,
    corretora_id: corretoraId,
    corretora: txt(e.triagem?.corretora, 200) ?? txt(fila.corretora, 200) ?? undefined,
    origem: 'Cadastro criado pelo agente de Cadastro da esteira, a partir dos documentos do e-mail',
    cartao,
    receitaErro,
    reserva,
    socios: sociosLidos,
  })
  if (!t.ok) {
    r.status = 'erro'
    r.motivos.push(`Não consegui criar o cadastro do tomador: ${t.erro}`)
    await sb.from('analise_fila').update({ cadastro_agente: r, cadastro_agente_em: agora }).eq('id', fila.id)
    return { ok: true as const, cadastro: r }
  }
  r.tomador_id = t.tomador.id
  r.tomador_criado = t.criado
  r.razao_social = t.tomador.razao_social
  if (corretoraId) {
    // Só onde está vazio: corretora escolhida à mão no tomador não é trocada.
    await sb.from('tomadores').update({ corretora_id: corretoraId }).eq('id', t.tomador.id).is('corretora_id', null)
    if (fila.caso_id && !casoAtual?.corretora_id) await sb.from('casos').update({ corretora_id: corretoraId }).eq('id', fila.caso_id)
  }

  // Tomador que já existia também ganha o que faltava nele (nunca por cima).
  const comp = await complementarTomador(sb, t.tomador.id, cartao ? dadosDoCartao(cartao) : reserva, {
    socios: sociosLidos.length ? sociosLidos : (cartao ? sociosDoCartao(cartao) : []),
    fonte: cartao ? 'receita' : 'serasa',
    receitaConsultada: !!cartao,
  })
  r.preenchidos = comp.preenchidos
  if (!comp.ok && comp.erro) r.atencao.push(`O cadastro existe, mas não consegui completar os campos vazios: ${comp.erro}`)

  // ── 4. a conferência: o que a IA marcou, e a razão social contra a Receita ──
  for (const c of r.conferencia) {
    if (c.gravidade === 'bloqueia') { r.status = 'bloqueado'; r.motivos.push(`${c.campo}: ${c.nota ?? 'não confere entre os documentos.'}`) }
    else if (c.gravidade === 'atencao') r.atencao.push(`${c.campo}: ${c.nota ?? `contrato "${c.contrato_social ?? '-'}", Serasa "${c.serasa ?? '-'}"`}`)
  }
  for (const b of (Array.isArray(L.bloqueios) ? L.bloqueios : []).slice(0, 10)) {
    const m = txt(b, 400)
    if (m) { r.status = 'bloqueado'; r.motivos.push(m) }
  }
  if (!r.fontes.contrato_social) r.atencao.push('Não veio contrato social: o cadastro usou o Serasa como fonte, e a conferência contrato x Serasa não foi feita.')
  if (cartao && razaoDocs) {
    const a = chaveDoNome(razaoDocs), b = chaveDoNome(cartao.razao_social)
    if (a && b && !a.includes(b) && !b.includes(a)) {
      r.atencao.push(`A razão social nos documentos ("${razaoDocs}") é diferente da Receita ("${cartao.razao_social}"). Pode ser nome antigo.`)
    }
  }

  // ── 5. o caso passa para o tomador, como no Concluir ──────────────────────
  if (fila.caso_id) {
    const caso = casoAtual
    await sb.from('casos').update({
      cnpj, razao_social: t.tomador.razao_social, razao_social_confiavel: true,
    }).eq('id', fila.caso_id)
    if (caso && ['comercial', 'triagem'].includes(String(caso.etapa))) {
      const p = await passarCasoParaTomador(sb, fila.caso_id, t.tomador.id)
      if (!p.ok) r.atencao.push(`O caso não passou para o tomador: ${p.erro}`)
      else if (p.aviso_documentos) r.atencao.push(p.aviso_documentos)
    }
  }

  // ── 6. sinal verde: a ordem de analisar sai sozinha ───────────────────────
  const mudanca: Record<string, unknown> = {
    tomador_id: t.tomador.id, cnpj, cnpj_confiavel: true, razao_social: t.tomador.razao_social,
    cadastro_agente: r, cadastro_agente_em: agora,
  }
  if (r.status === 'ok' && fila.automatica && !fila.ordem && ordemVale('iniciar', fila.situacao)) {
    r.analise_mandada = true
    Object.assign(mudanca, {
      cadastro_agente: r,
      ordem: 'iniciar', ordem_em: agora, ordem_por: 'Agente de Cadastro',
      ordem_dados: { instrucao: null, modo: null, escopo: 'completa', motivo: 'Cadastro conferido pelo agente, sem pendência.', auto: true },
      ultima_ordem_resultado: null, ultima_ordem_em: null,
    })
  }
  const { error } = await sb.from('analise_fila').update(mudanca).eq('id', fila.id)
  if (error) return { ok: false as const, status: 500, erro: error.message }

  // O avatar do agente na Equipe conta o que ele fez.
  await sb.from('agente_eventos').insert({
    agente: 'cadastro', acao: r.status === 'ok' ? 'terminou' : 'falhou',
    tarefa: r.status === 'ok' ? 'Cadastro conferido' : 'Cadastro parado', alvo: fila.pasta, cnpj,
    detalhe: r.status === 'ok'
      ? `${t.criado ? 'Tomador criado' : 'Tomador já existia'}${r.preenchidos.length ? `, ${r.preenchidos.length} campo(s) completado(s)` : ''}. ${r.analise_mandada ? 'Mandei para a análise de crédito.' : ''}`.trim()
      : r.motivos.join(' · ').slice(0, 500),
  })

  return { ok: true as const, cadastro: r }
}
