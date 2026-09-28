// ============================================================================
//  O DOSSIÊ DA ANÁLISE ANTERIOR  ·  o que o analista recebe antes de reanalisar
//
//  24/09/2026, depois da NC Holding: "eu fui muito claro o que tinha que
//  analisar, e o Analista não considerou o último relatório completo de 2026".
//
//  ELE ESTAVA CERTO, E A CULPA NÃO ERA DO ANALISTA: o `_instrucoes.txt` que
//  chegava ao notebook levava só o que ele digitou na caixa. A análise
//  anterior existia inteira no banco (78 colunas, conclusão, condições,
//  pontos de atenção, Serasa, exercícios) e NADA disso era entregue a quem ia
//  reanalisar. A reanálise começava do zero, como se a empresa fosse nova.
//
//  Este módulo monta o texto que passa a ir junto com a ordem de refazer. Não
//  é um resumo: é a decisão anterior inteira, com o fundamento dela, e o
//  fecho que transforma a reanálise num confronto ponto a ponto.
//
//  O BLOCO QUE MUDA O RESULTADO É O ÚLTIMO. A análise anterior recusou por
//  motivos que ela escreveu, um a um, nos pontos de atenção. A reanálise é
//  obrigada a responder cada um: mantido, mitigado ou superado, e com qual
//  documento. Sem isso, "chegaram documentos novos" vira uma análise nova que
//  por acaso repete a recusa antiga, que foi exatamente o que aconteceu.
//
//  Texto puro, sem IA e sem rede: é montado no CRM, viaja na ordem e é gravado
//  no `_instrucoes.txt` da pasta, que é o arquivo que o comando `/analise` já
//  lê antes de tudo. Nenhum canal novo.
// ============================================================================

import type { LinhaComparavel } from '@/lib/analise/comparativo'
import { situacaoDe, nivelLimpo } from '@/lib/analise/retrato'
import { fmtMoeda } from '@/lib/utils'

/** Um exercício como a carga gravou, em reais. */
export interface ExercicioDossie {
  rotulo: string | null
  exercicio: number | null
  base: string | null
  patrimonio_liquido: number | string | null
  receita_operacional: number | string | null
  lucro_liquido: number | string | null
  ativo_total: number | string | null
  exigivel_total: number | string | null
}

export const COLUNAS_EXERCICIO_DOSSIE =
  'rotulo, exercicio, base, patrimonio_liquido, receita_operacional, lucro_liquido, ativo_total, exigivel_total'

const txt = (v: unknown): string => String(v ?? '').trim()
const limpo = (v: unknown): string =>
  txt(v).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s{2,}/g, ' ').trim()

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const dinheiro = (v: number | string | null): string => {
  const n = num(v)
  return n === null ? 'sem dado' : fmtMoeda(n)
}

const pct = (v: number | string | null): string => {
  const n = num(v)
  return n === null ? 'sem taxa' : `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`
}

const dataBr = (v: string | null): string => {
  const t = txt(v).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return t || 'sem data'
  const [a, m, d] = t.split('-')
  return `${d}/${m}/${a}`
}

const listaDe = (v: string[] | null | undefined): string[] =>
  Array.isArray(v) ? v.map(x => limpo(x)).filter(Boolean) : []

/** Os 3 C's como a análise gravou, em qualquer um dos formatos que já
 *  apareceram no acervo (objeto com as três chaves, ou lista de blocos). */
function tresCsTexto(v: unknown): string[] {
  if (!v) return []
  const linhas: string[] = []
  if (Array.isArray(v)) {
    for (const item of v) {
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>
        const nome = limpo(o.nome ?? o.titulo ?? o.c ?? '')
        const corpo = limpo(o.texto ?? o.conteudo ?? o.analise ?? o.descricao ?? '')
        if (nome || corpo) linhas.push(`${nome ? nome + ': ' : ''}${corpo}`)
      } else if (limpo(item)) linhas.push(limpo(item))
    }
    return linhas
  }
  if (typeof v === 'object') {
    for (const [k, valor] of Object.entries(v as Record<string, unknown>)) {
      const corpo = typeof valor === 'string' ? limpo(valor)
        : (valor && typeof valor === 'object' ? limpo((valor as Record<string, unknown>).texto ?? (valor as Record<string, unknown>).analise ?? '') : '')
      if (corpo) linhas.push(`${k}: ${corpo}`)
    }
  }
  return linhas
}

export interface PedidoDeReanalise {
  /** O que ele escreveu na caixa. O motivo é obrigatório na tela. */
  motivo: string
  /** Nomes dos arquivos que ele subiu agora, na ordem em que entraram. */
  documentosNovos: string[]
  escopo: 'completa' | 'parcial'
  /** Quem pediu, para o carimbo. */
  quem: string
}

/**
 * O texto inteiro que vai para o `_instrucoes.txt` da pasta.
 *
 * Sem quebra de linha com barra invertida e sem acento em chave: este texto
 * atravessa a ordem (JSON), o agente do notebook e o `fs.writeFileSync`, e o
 * que chega tem que ser exatamente o que saiu.
 */
export function montarDossie(
  anterior: LinhaComparavel,
  exercicios: ExercicioDossie[],
  pedido: PedidoDeReanalise,
): string {
  const L: string[] = []
  const nome = txt(anterior.razao_social) || txt(anterior.nome_curto) || 'a empresa'
  const decisao = situacaoDe(anterior.recomendacao)

  L.push(`[REANÁLISE pedida por ${pedido.quem} no CRM, ${new Date().toLocaleString('pt-BR')}]`)
  L.push('')
  L.push('ESTA EMPRESA JÁ FOI ANALISADA. Isto não é uma análise nova: é uma REANÁLISE.')
  L.push('A análise anterior inteira está abaixo. Leia antes de abrir qualquer documento.')
  L.push('')

  L.push('══════════════════════════════════════════════════════════════════')
  L.push('1. O QUE VOCÊ PRECISA RESOLVER AGORA')
  L.push('══════════════════════════════════════════════════════════════════')
  L.push('')
  L.push('O QUE ELE ESCREVEU, e que tem prioridade sobre qualquer default:')
  L.push('')
  L.push(pedido.motivo || '(não escreveu motivo)')
  L.push('')
  if (pedido.documentosNovos.length) {
    L.push('DOCUMENTOS NOVOS apresentados com este pedido, já dentro da pasta:')
    pedido.documentosNovos.forEach((d, i) => L.push(`  ${i + 1}. ${d}`))
    L.push('')
    L.push('Cada um destes documentos tem que aparecer citado no relatório final,')
    L.push('dizendo o que ele provou ou deixou de provar. Documento novo que o')
    L.push('relatório não menciona é documento que não foi lido.')
  } else {
    L.push('Nenhum documento novo foi anexado a este pedido: o que mudou é o')
    L.push('entendimento, e não o acervo. A pasta continua com os documentos de')
    L.push('sempre, mais o que estiver no cofre do tomador.')
  }
  L.push('')
  L.push(pedido.escopo === 'parcial'
    ? 'ESCOPO: REFAZER SÓ AS PARTES RELACIONADAS AO QUE MUDOU. Reaproveite a leitura\n'
      + 'dos documentos que já está em _extraido (ler-pdfs.mjs com --se-preciso). NÃO\n'
      + 'reaproveite número: Score FAM, Classe, Porte, limite, Rating, taxas, 3 C\'s e\n'
      + 'conclusão são SEMPRE recalculados do zero, porque documento novo pode mexer no\n'
      + 'PL e o limite é calculado sobre o PL.'
    : 'ESCOPO: ANÁLISE COMPLETA, do zero, com a metodologia inteira.')
  L.push('')

  L.push('══════════════════════════════════════════════════════════════════')
  L.push(`2. A ANÁLISE ANTERIOR  ·  ${nome}`)
  L.push('══════════════════════════════════════════════════════════════════')
  L.push('')
  L.push(`Data da análise anterior: ${dataBr(anterior.data_analise)}`)
  if (txt(anterior.cnpj)) L.push(`CNPJ: ${txt(anterior.cnpj)}`)
  if (txt(anterior.corretora)) L.push(`Corretora: ${txt(anterior.corretora)}`)
  if (anterior.revisada) L.push('Esta análise foi REVISADA E EDITADA por ele depois de pronta: o texto abaixo é o que ficou valendo, não o que a IA escreveu.')
  L.push('')
  L.push('A DECISÃO QUE ESTÁ VALENDO HOJE, e que você vai confirmar ou reverter:')
  L.push('')
  L.push(`  Decisão ............. ${decisao}${txt(anterior.recomendacao) && txt(anterior.recomendacao) !== decisao ? `  (escrito: ${txt(anterior.recomendacao)})` : ''}`)
  L.push(`  Nível de risco ...... ${nivelLimpo(anterior.nivel_risco)}`)
  L.push(`  Score FAM ........... ${num(anterior.score_final)?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) ?? 'sem score'}`)
  L.push(`  Classe / Porte ...... ${txt(anterior.classe) || '?'} / ${txt(anterior.porte) || '?'}`)
  L.push(`  Rating FAM .......... ${txt(anterior.rating_txt) || 'sem rating'}`)
  const anulado = !!txt(anterior.limite_recomendado_motivo)
  const limiteNum = anulado ? null : num(anterior.limite_recomendado_num)
  L.push(`  Limite .............. ${limiteNum !== null ? fmtMoeda(limiteNum) : (limpo(anterior.limite_recomendado_txt) || 'sem limite')}`)
  if (txt(anterior.limite_base) || num(anterior.limite_perc) !== null) {
    L.push(`  Base do limite ...... ${txt(anterior.limite_base) || 'não escrita'}${num(anterior.limite_perc) !== null ? ` · ${num(anterior.limite_perc)}%` : ''}`)
  }
  L.push(`  Taxas ............... tradicional ${pct(anterior.taxa_tradicional)} · judicial ${pct(anterior.taxa_judicial)} · estruturada ${pct(anterior.taxa_estruturada)}`)
  L.push(`  Base das DFs ........ ${txt(anterior.base_df) || 'não informada'}`)
  L.push('')

  const atencao = listaDe(anterior.pontos_atencao)
  L.push('──────────────────────────────────────────────────────────────────')
  L.push(`2.1  O QUE PESOU CONTRA (${atencao.length} ponto${atencao.length === 1 ? '' : 's'} de atenção da análise anterior)`)
  L.push('──────────────────────────────────────────────────────────────────')
  L.push('')
  if (atencao.length) {
    atencao.forEach((p, i) => { L.push(`  A${i + 1}. ${p}`); L.push('') })
  } else {
    L.push('  A análise anterior não registrou pontos de atenção.')
    L.push('')
  }

  const positivos = listaDe(anterior.pontos_positivos)
  if (positivos.length) {
    L.push('──────────────────────────────────────────────────────────────────')
    L.push('2.2  O QUE PESOU A FAVOR')
    L.push('──────────────────────────────────────────────────────────────────')
    L.push('')
    positivos.forEach((p, i) => L.push(`  P${i + 1}. ${p}`))
    L.push('')
  }

  const conclusao = limpo(anterior.conclusao)
  if (conclusao) {
    L.push('──────────────────────────────────────────────────────────────────')
    L.push('2.3  A CONCLUSÃO ANTERIOR, na íntegra')
    L.push('──────────────────────────────────────────────────────────────────')
    L.push('')
    L.push(conclusao)
    L.push('')
  }

  const condicoes = limpo(anterior.condicoes)
  if (condicoes) {
    L.push('──────────────────────────────────────────────────────────────────')
    L.push('2.4  AS CONDIÇÕES QUE ELA IMPÔS')
    L.push('──────────────────────────────────────────────────────────────────')
    L.push('')
    L.push(condicoes)
    L.push('')
  }

  const cs = tresCsTexto(anterior.tres_cs)
  if (cs.length) {
    L.push('──────────────────────────────────────────────────────────────────')
    L.push("2.5  OS 3 C'S DA ANÁLISE ANTERIOR")
    L.push('──────────────────────────────────────────────────────────────────')
    L.push('')
    cs.forEach(c => { L.push(`  ${c}`); L.push('') })
  }

  const temSerasa = anterior.serasa_score !== null || txt(anterior.serasa_risco) || txt(anterior.serasa_pefin)
  if (temSerasa) {
    L.push('──────────────────────────────────────────────────────────────────')
    L.push('2.6  O BUREAU, COMO ESTAVA')
    L.push('──────────────────────────────────────────────────────────────────')
    L.push('')
    L.push(`  Score Serasa ........ ${anterior.serasa_score ?? 'sem consulta'}`)
    if (txt(anterior.serasa_risco)) L.push(`  Risco ............... ${txt(anterior.serasa_risco)}`)
    if (txt(anterior.serasa_pefin)) L.push(`  Pefin ............... ${txt(anterior.serasa_pefin)}`)
    if (txt(anterior.serasa_protestos)) L.push(`  Protestos ........... ${txt(anterior.serasa_protestos)}`)
    if (txt(anterior.serasa_acoes)) L.push(`  Ações judiciais ..... ${txt(anterior.serasa_acoes)}`)
    L.push('')
    L.push('  Consulte o bureau de novo: este retrato é do dia da análise anterior.')
    L.push('')
  }

  if (exercicios.length) {
    L.push('──────────────────────────────────────────────────────────────────')
    L.push('2.7  OS NÚMEROS QUE ELA USOU (em reais)')
    L.push('──────────────────────────────────────────────────────────────────')
    L.push('')
    for (const e of exercicios) {
      const rot = txt(e.rotulo) || (e.exercicio ? String(e.exercicio) : 'exercício')
      L.push(`  ${rot}${txt(e.base) ? ` (${txt(e.base)})` : ''}`)
      L.push(`      PL ${dinheiro(e.patrimonio_liquido)} · Receita ${dinheiro(e.receita_operacional)} · Lucro ${dinheiro(e.lucro_liquido)}`)
      L.push(`      Ativo ${dinheiro(e.ativo_total)} · Exigível ${dinheiro(e.exigivel_total)}`)
    }
    L.push('')
    L.push('  Se a sua leitura de um destes números divergir, diga qual, quanto e por quê.')
    L.push('  Número que muda sozinho, sem documento que o explique, é erro de leitura.')
    L.push('')
  }

  L.push('══════════════════════════════════════════════════════════════════')
  L.push('3. O QUE ESTA REANÁLISE É OBRIGADA A ENTREGAR')
  L.push('══════════════════════════════════════════════════════════════════')
  L.push('')
  L.push('Além da análise completa de sempre, escreva no relatório final uma seção')
  L.push('chamada "O que mudou desde a análise anterior", com estes três itens:')
  L.push('')
  L.push(`  (a) PONTO A PONTO. Para CADA ponto de atenção A1..A${Math.max(atencao.length, 1)} da seção 2.1, diga`)
  L.push('      se ele está MANTIDO, MITIGADO ou SUPERADO, e com qual documento ou')
  L.push('      fato você concluiu isso. Nenhum pode ficar sem resposta. Ponto que')
  L.push('      você considerar superado sem documento que o sustente, deixe MANTIDO.')
  L.push('')
  L.push('  (b) O MOTIVO DA NOVA DECISÃO, em uma frase direta. Se a decisão mudou,')
  L.push(`      diga o que a fez mudar (saiu de "${decisao}" para qual, e por quê). Se`)
  L.push('      NÃO mudou, diga por que os documentos novos não foram suficientes:')
  L.push('      é a resposta que ele vai ler, e ela não pode faltar.')
  L.push('')
  L.push('  (c) O QUE ELE PEDIU. Repita cada ponto do item 1 e diga o que você fez')
  L.push('      com ele. Pedido que você decidiu não seguir, diga qual e por quê.')
  L.push('')
  L.push('AS TRAVAS DA METODOLOGIA CONTINUAM VALENDO, e elas ganham da vontade de')
  L.push('reverter: Score, Classe, Porte, limite, Rating e taxas saem da COD-EEC')
  L.push('V001-2025, calculados do zero sobre os números de hoje. Se o resultado da')
  L.push('conta contrariar o que ele espera, entregue a conta e explique a distância.')
  L.push('Análise não é o lugar de agradar: é o lugar de errar para o lado de')
  L.push('desconfiar, porque o número errado vira garantia errada.')
  L.push('')
  L.push('SE O ITEM 1 MANDA CONSIDERAR ALGO FORA DA METODOLOGIA (subtrair uma dívida,')
  L.push('desconsiderar uma conta dos DFs, aceitar premissa de reunião ou de e-mail),')
  L.push('entregue AS DUAS análises: a oficial, pela metodologia, e a COM A DETERMINAÇÃO,')
  L.push('com PL, Score, Classe, Rating, limite, decisão e risco recalculados. A segunda')
  L.push('vai no bloco `determinacao` na raiz do JSON (formato no item 2.2 do /analise),')
  L.push('e NUNCA só na memória de cálculo: o CRM monta com ela o Parecer Complementar')
  L.push('que segue por e-mail para a Subscrição.')
  L.push('')
  L.push('O CRM já calcula sozinho a tabela "antes x depois" (decisão, limite,')
  L.push('score, classe, rating, taxas, pontos) comparando as duas análises no')
  L.push('banco. Você não precisa montar tabela: escreva o julgamento.')
  L.push('')

  return L.join('\n')
}
