/* A TRIAGEM EM LOTE · o estado de cada caso, em uma palavra
   ═══════════════════════════════════════════════════════════════════════════

   Fase 4 do Carteiro gerencial (11/09/2026). A tela mostra, ao vivo, os casos
   trazidos do período passando pela conferência de documentos: "7 de 10
   conferidos". Esta é a leitura de cada linha de `analise_fila`, pura, para a
   tela e o teste concordarem.

   Não inventa estado novo: usa a situação da esteira (lib/analise/esteira.ts)
   e o status do cadastro que a triagem grava (`cadastro.status`), as mesmas
   duas réguas que a Mesa usa em `faseDe`. */

import { nomeDaEtapa, ordemVale, ORDEM, type Ordem } from '@/lib/analise/esteira'

export interface LinhaTriagem {
  id: string
  pasta: string
  situacao: string
  caso_id?: string | null
  cadastro?: { status?: string | null; motivo?: string | null } | null
  docs?: { falta?: number | null; feitos?: number | null; total?: number | null } | null
  documentos_faltando?: string[] | null
  ordem?: string | null
  ordem_por?: string | null
  ordem_em?: string | null
  etapa?: string | null
  etapa_texto?: string | null
  etapa_em?: string | null
  motivo?: string | null
  fora_do_disco_em?: string | null
}

export type EstadoTriagem = 'esperando' | 'na_fila' | 'falta' | 'verde' | 'analisando' | 'pronta' | 'parada' | 'erro'

export const ROTULO_TRIAGEM: Record<EstadoTriagem, string> = {
  esperando: 'Esperando o notebook',
  na_fila: 'Ainda não conferido',
  falta: 'Falta documento',
  verde: 'Documentos em ordem',
  analisando: 'Analisando',
  pronta: 'Análise pronta',
  parada: 'Parado por alguém',
  erro: 'Falhou',
}

export interface TriagemLida {
  estado: EstadoTriagem
  rotulo: string
  detalhe: string
  faltando: string[]
  /** Já passou pela triagem? É o que conta no "N de M conferidos". */
  conferida: boolean
}

export function lerTriagem(l: LinhaTriagem): TriagemLida {
  const faltando = (l.documentos_faltando ?? []).filter(Boolean)
  const status = l.cadastro?.status ?? null
  /* CONFERIDA é ter resultado de triagem (status do cadastro que não seja
     "pendente"), ou ter chegado à análise. Parada ou com erro ANTES da
     triagem não conta: a primeira versão contava, e o "2 de 2 conferidos"
     mentia (achado da revisão). */
  const triada = !!status && status !== 'pendente'
  const le = (estado: EstadoTriagem, detalhe = '', conferida = triada): TriagemLida =>
    ({ estado, rotulo: ROTULO_TRIAGEM[estado], detalhe, faltando, conferida })

  // A ordem pendente vem primeiro: a pessoa mandou, e o notebook ainda não pegou.
  if (l.ordem) {
    const nome = ORDEM[l.ordem as Ordem]?.rotulo ?? l.ordem
    return le('esperando', `${nome.toLowerCase()}${l.ordem_por ? `, pedido por ${l.ordem_por}` : ''}`, false)
  }
  if (l.situacao === 'em_andamento') return le('analisando', l.etapa_texto || nomeDaEtapa(l.etapa ?? null), true)
  if (l.situacao === 'concluida') return le('pronta', '', true)
  if (l.situacao === 'erro') return le('erro', l.motivo ?? '')
  if (l.situacao === 'pausada') return le('parada', l.motivo ?? '')
  /* Falta de documento vem ANTES do "não conferido": linha antiga sem
     `cadastro`, mas bloqueada pela esteira, perdia a lista do que falta. */
  if (l.situacao === 'bloqueada_documentos' || l.situacao === 'aguardando_documentos' || status === 'bloqueado') {
    return le('falta', faltando.length ? faltando.join(', ') : (l.cadastro?.motivo ?? ''), true)
  }
  if (!triada) return le('na_fila', 'a triagem ainda não leu esta pasta', false)
  if (status === 'aprovado' || status === 'em_conferencia') return le('verde', status === 'em_conferencia' ? 'conferido, com observação' : '')
  return le('na_fila', '', false)
}

/** Pode receber "reler a pasta" agora? A mesma regra do botão de um caso só, e
 *  a pasta tem que estar no disco: a que foi para a rede não tem o que reler. */
export const podeReconferir = (l: LinhaTriagem) => !l.ordem && !l.fora_do_disco_em && ordemVale('reconferir', l.situacao)

export interface ResumoLote {
  total: number
  /** Já passaram pela triagem, qualquer que tenha sido o resultado. */
  conferidos: number
  por: Record<EstadoTriagem, number>
}

export function resumirLote(linhas: readonly LinhaTriagem[]): ResumoLote {
  const por: Record<EstadoTriagem, number> = { esperando: 0, na_fila: 0, falta: 0, verde: 0, analisando: 0, pronta: 0, parada: 0, erro: 0 }
  let conferidos = 0
  for (const l of linhas) {
    const t = lerTriagem(l)
    por[t.estado]++
    if (t.conferida) conferidos++
  }
  return { total: linhas.length, conferidos, por }
}
