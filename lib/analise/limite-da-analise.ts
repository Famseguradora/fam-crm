// ============================================================
//  O LIMITE DA ANÁLISE PRONTO PARA LER  ·  fonte única
//
//  Saiu de `ficha.ts` em 06/10/2026 para o Retorno da Análise (servidor) e a
//  Mesa do Tomador (navegador) dizerem o MESMO limite. A regra é a de
//  `banco.ts`, e não pode ser afrouxada: `limite_recomendado_num` só vale
//  quando existe E quando não há motivo de anulação. Sem número, sai o texto
//  com o aviso do que ele é, nunca um número bonito que não é limite.
// ============================================================

import { semEntidadesHtml } from '@/lib/utils'

const AVISO_TIPO: Record<string, string> = {
  teorico: 'teórico',
  teto: 'teto da FAM',
  sem_limite: 'sem limite, por decisão',
  vazio: 'sem número',
}

const curto = (s: string, n = 150) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

/** O Postgres devolve `numeric` como string. Converter sem inventar zero. */
const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** A frase da análise já diz o que este tipo de limite é? Serve para não
 *  escrever "R$ 80.000.000,00 (Teto FAM) (teto da FAM)", que foi o que
 *  apareceu na tela da Engie: a análise já tinha dito, e o rótulo repetiu. */
function jaDizOTipo(txt: string, tipo: string): boolean {
  const t = txt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (tipo === 'teto') return t.includes('teto')
  if (tipo === 'teorico') return t.includes('teorico')
  if (tipo === 'sem_limite') return t.includes('sem limite')
  return false
}

export interface LimiteCru {
  limite_recomendado_txt: string | null
  limite_recomendado_num: number | string | null
  limite_recomendado_tipo: string | null
  limite_recomendado_motivo: string | null
}

/**
 * `limiteNum`: o número, só quando é confiável. `limiteAviso`: a frase a
 * mostrar quando não há número confiável (vazia quando há).
 *
 * O motivo manda: quando ele existe, a carga ANULOU o número, e o campo sai
 * como aviso escrito, jamais como valor confirmado. Um tipo novo que este
 * arquivo não conheça também cai no aviso: errar para o lado de desconfiar
 * custa um susto, errar para o outro custa dinheiro.
 */
export function limiteDaAnalise(l: LimiteCru): { limiteNum: number | null; limiteAviso: string } {
  const anulado = !!l.limite_recomendado_motivo
  const limiteNum = anulado ? null : num(l.limite_recomendado_num)
  const tipo = l.limite_recomendado_tipo ?? 'vazio'

  let limiteAviso = ''
  if (limiteNum === null) {
    if (anulado) {
      limiteAviso = `Sem número confiável. ${l.limite_recomendado_motivo}`
        + (l.limite_recomendado_txt
          ? ` A análise escreveu: “${curto(l.limite_recomendado_txt)}”` : '')
    } else if (l.limite_recomendado_txt) {
      const frase = curto(semEntidadesHtml(l.limite_recomendado_txt))
      limiteAviso = frase
        + (AVISO_TIPO[tipo] && !jaDizOTipo(frase, tipo) ? ` (${AVISO_TIPO[tipo]})` : '')
    } else {
      limiteAviso = 'A análise não registrou limite.'
    }
  }
  return { limiteNum, limiteAviso }
}
