// ============================================================================
//  AS REGRAS DE NEGÓCIO DE OPERAÇÃO  ·  num lugar só, sem dependência nenhuma
//
//  Copiadas da tela de Operações (app/(dashboard)/operacoes/page.tsx) em
//  09/09/2026, depois que o robô somou prêmio de operação recusada junto com
//  emitida e o Marco pegou. Moram aqui, e não dentro do robô, porque em
//  10/09/2026 a IA pela API passou a somar também, e duas cópias da mesma regra
//  divergem no primeiro ajuste.
//
//  Quem usa: lib/ia/robo.ts (os cartões) e lib/ia/agregar.ts (a ferramenta de
//  soma da IA). Este arquivo não importa nada de propósito: dá para testar com
//  `node` puro, sem o Next e sem o alias `@/`.
// ============================================================================

/** O limite que a FAM carrega por operação. Acima disso o excedente não é
 *  dela, e a tela de Operações capa em todo lugar. */
export const CAP_LMG = 80_000_000

const num = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/** O LMG que a FAM de fato carrega. Nunca some `o.lmg` cru. */
export const lmgFam = (o: { lmg?: number | string | null }): number =>
  Math.min(num(o.lmg), CAP_LMG)

/** As etapas em que a operação morreu e não volta. */
export const ENCERRADAS = ['Perdido', 'Recusado'] as const

export type Mundo = 'emitida' | 'funil' | 'encerrada'

/**
 * Os três mundos de uma operação, que NÃO se somam entre si:
 *   · emitida    status Emitido: o realizado, "fora do funil" na tela
 *   · encerrada  Perdido ou Recusado: morreu
 *   · funil      todo o resto: o único que ainda pode entrar
 * O funil é definido por EXCLUSÃO, como na tela: etapa nova entra nele sozinha.
 */
export function mundoDa(status: string | null | undefined): Mundo {
  if (status === 'Emitido') return 'emitida'
  if ((ENCERRADAS as readonly string[]).includes(status ?? '')) return 'encerrada'
  return 'funil'
}
