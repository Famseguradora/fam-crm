// ============================================================
//  A ANÁLISE DE CRÉDITO LIDA DO BANCO — e não da máquina do Marco.
//
//  Este arquivo é o motivo de toda a carga ter sido feita. Antes dele, a ficha
//  do tomador só mostrava a análise no computador onde o sistema local roda
//  (é 127.0.0.1, e o navegador bloqueia endereço local dentro de página
//  segura). Agora o dado está no Supabase: a ficha funciona de qualquer
//  máquina, e no celular.
//
//  Só leitura, e a mesma forma que a ponte local devolve, de propósito: quem
//  desenha a ficha não precisa saber de onde o dado veio.
//
//  A REGRA DO LIMITE, que vale aqui como vale no banco: `limite_recomendado_num`
//  só existe quando o tipo é `efetivo` ou `zero`. Quando é `teorico`, `teto` ou
//  `vazio`, mostra-se o TEXTO que a análise escreveu, com o aviso do que ele é.
//  Nunca um número bonito que não é limite.
// ============================================================

import { createClient } from '@/lib/supabase/client'
import type { AnaliseDoTomador, DadoAnalise } from './local'
import { soDigitos } from './local'

/** O que a ficha mostra quando o número não é limite de verdade. */
const AVISO_TIPO: Record<string, string> = {
  teorico: 'teórico',
  teto: 'teto da FAM',
  sem_limite: 'sem limite, por decisão',
  vazio: 'sem número',
}

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Texto longo cabe na ficha cortado, e o valor inteiro fica no title do bloco. */
const curto = (s: string, n = 64) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

interface LinhaAnalise {
  chave_local: string
  razao_social: string
  corretora: string | null
  score_final: number | null
  rating_txt: string | null
  rating_cod: string | null
  recomendacao: string | null
  limite_recomendado_txt: string | null
  limite_recomendado_num: number | null
  limite_recomendado_tipo: string | null
  limite_recomendado_motivo: string | null
  grupo: string | null
  data_analise: string
  revisada: boolean
  pasta: string | null
}

/**
 * A análise vigente deste CNPJ, lida do banco. `null` quando não há nenhuma.
 * Nunca lança: falha de rede devolve `null` e o bloco some da ficha, igual à
 * ponte local.
 */
export async function analiseDoBanco(
  cnpj: string | null | undefined,
): Promise<AnaliseDoTomador | null> {
  const chave = soDigitos(cnpj)
  if (chave.length !== 14) return null

  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('analises')
      .select('chave_local, razao_social, corretora, score_final, rating_txt, rating_cod, recomendacao, limite_recomendado_txt, limite_recomendado_num, limite_recomendado_tipo, limite_recomendado_motivo, grupo, data_analise, revisada, pasta')
      .eq('cnpj', chave)
      .eq('vigente', true)
      .maybeSingle()

    if (error || !data) return null
    const a = data as LinhaAnalise

    // ── O LIMITE. Aqui esteve o furo mais perigoso desta frente. ──────────
    //
    // A carga tem três travas que ANULAM o número quando ele não é confiável.
    // Mas `limite_recomendado_tipo` guarda o que a análise escreveu, e continua
    // `efetivo` mesmo depois da anulação. Esta tela lia só o tipo: com número
    // nulo e tipo `efetivo`, caía no texto cru SEM aviso, pintado de verde como
    // um limite confirmado. O texto da Conasa começa com "R$ 727.192.500,00",
    // que é exatamente o número que a trava tinha tirado. A trava funcionava no
    // banco e esta linha a desfazia.
    //
    // Agora quem manda é `limite_recomendado_motivo`: quando ele existe, o
    // valor sai como ALERTA, com o motivo escrito, e nunca com a cor de número
    // confirmado. Sem número e sem motivo, vale o aviso do tipo, como antes.
    const tipo = a.limite_recomendado_tipo ?? 'vazio'
    const anulado = !!a.limite_recomendado_motivo
    const temNumero = a.limite_recomendado_num !== null

    // O motivo NUNCA se perde. Antes ele dependia de haver texto ao lado: com
    // `limite_recomendado_txt` vazio, a explicação inteira sumia e a ficha
    // mostrava só um travessão, escondendo que houve recusa.
    const limite = temNumero
      ? brl(Number(a.limite_recomendado_num))
      : anulado
        ? `Sem número confiável. ${a.limite_recomendado_motivo}` +
          (a.limite_recomendado_txt ? ` A análise escreveu: “${curto(a.limite_recomendado_txt, 150)}”` : '')
        : a.limite_recomendado_txt
          ? `${curto(a.limite_recomendado_txt, 150)}${AVISO_TIPO[tipo] ? ` (${AVISO_TIPO[tipo]})` : ''}`
          : ''

    // `alerta` em vez de `limite`: o verde de valor confirmado não pode pintar
    // um campo que a carga recusou. Ver o mapa COR em AnaliseDoTomadorSection.
    //
    // O PADRÃO SEGURO É `alerta`, e não `limite`. Só ganha o verde quem TEM
    // número: se amanhã aparecer um tipo novo que este arquivo não conhece, ele
    // cai no aviso, e não na cor de valor confirmado. Errar para o lado de
    // desconfiar custa um susto; errar para o outro custa dinheiro.
    const tipoLimite = temNumero ? 'limite' : 'alerta'

    const dados: DadoAnalise[] = [
      ['Score FAM', a.score_final === null ? '' : String(Number(a.score_final)).replace('.', ',')],
      ['Rating', a.rating_cod || a.rating_txt || ''],
      ['Decisão', a.recomendacao || '', 'decisao'],
      ['Limite recomendado', limite, tipoLimite],
      ['Grupo econômico', a.grupo || ''],
      ['Última análise', a.data_analise
        ? a.data_analise.split('-').reverse().join('/')
        : ''],
    ]

    return {
      nome: a.razao_social,
      cnpj: chave,
      corretora: a.corretora ?? '',
      dados,
      analiseAtual: a.chave_local,
      revisada: !!a.revisada,
      rotuloSituacao: a.revisada ? 'Editada por você' : 'Análise feita, a editar',
      pasta: a.pasta,
    }
  } catch {
    return null
  }
}
