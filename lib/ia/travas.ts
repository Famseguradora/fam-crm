// ============================================================================
//  AS TRAVAS DA IA PELA API  ·  num lugar só
//
//  Toda rota que fala com a Anthropic passa pelas mesmas três perguntas, nesta
//  ordem: o interruptor está ligado? a chave está no ambiente? o teto do dia
//  ainda tem folga? Até 11/09/2026 cada rota escrevia as três do seu jeito, e a
//  soma do gasto era feita pela sessão: com a pergunta de cada pessoa fechada
//  para as outras, o teto de US$ 5 da empresa teria virado US$ 5 por pessoa.
//  Agora a soma é a da função `ia_gasto_24h()` (supabase-migration-ia-equipe.sql),
//  que devolve só o total, sem pergunta de ninguém.
//
//  QUANDO A API NÃO ESTÁ DISPONÍVEL, a resposta diz o motivo, e as telas que
//  têm o notebook como segundo motor (IA de Gestão e a IA do card) mandam a
//  pergunta para a fila dele, como sempre foi.
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'

export interface GastoDoDia { usd: number; perguntas: number; com_cache: number }

/** O gasto das últimas 24 h, da FAM inteira. */
export async function gastoDoDia(sb: SupabaseClient): Promise<GastoDoDia> {
  const { data, error } = await sb.rpc('ia_gasto_24h')
  if (!error) {
    const l = ((Array.isArray(data) ? data[0] : data) ?? {}) as Partial<Record<keyof GastoDoDia, unknown>>
    return { usd: Number(l.usd ?? 0), perguntas: Number(l.perguntas ?? 0), com_cache: Number(l.com_cache ?? 0) }
  }
  /* Sem a função (migration ainda não aplicada), soma pelo que a sessão vê:
     é o comportamento antigo, e é melhor que travar a IA inteira. */
  console.error('[ia/travas] ia_gasto_24h:', error.message)
  const desde = new Date(Date.now() - 86_400_000).toISOString()
  const { data: linhas } = await sb.from('ia_pedidos').select('custo_usd, cache_leitura').gte('criado_em', desde).not('custo_usd', 'is', null)
  const l = linhas ?? []
  return {
    usd: l.reduce((s, x) => s + Number(x.custo_usd ?? 0), 0),
    perguntas: l.length,
    com_cache: l.filter((x) => Number(x.cache_leitura ?? 0) > 0).length,
  }
}

export type MotivoSemApi = 'desligada' | 'sem_chave' | 'teto'

export type Travas =
  | { ok: true; modelo: string; esforco: string; teto: number; gasto: number }
  | { ok: false; status: number; motivo: MotivoSemApi; erro: string }

/**
 * As três travas. `reserva` é o custo máximo que a chamada pode ter, quando se
 * sabe (o lote do Carteiro reserva antes de chamar); sem reserva, basta o teto
 * ainda não ter sido atingido.
 */
export async function travasDaIA(sb: SupabaseClient, reserva = 0): Promise<Travas> {
  const { data: cfg } = await sb.from('ia_config').select('api_ligada, modelo, esforco, teto_diario_usd').eq('id', 1).maybeSingle()
  if (!cfg?.api_ligada) {
    return { ok: false, status: 409, motivo: 'desligada', erro: 'A IA pela API está desligada. Quem liga é o proprietário, no painel da IA (Ctrl+I).' }
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, status: 503, motivo: 'sem_chave', erro: 'A IA está ligada, mas a chave não está no ambiente deste CRM (ANTHROPIC_API_KEY).' }
  }
  const teto = Number(cfg.teto_diario_usd ?? 0)
  let gasto = 0
  if (teto > 0) {
    gasto = (await gastoDoDia(sb)).usd
    if (reserva > 0 ? gasto + reserva > teto : gasto >= teto) {
      return {
        ok: false, status: 402, motivo: 'teto',
        erro: reserva > 0
          ? `Esta chamada pode custar até US$ ${reserva.toFixed(2)} e passaria do teto do dia (US$ ${teto.toFixed(2)}, já gastos US$ ${gasto.toFixed(2)}).`
          : `O teto de gasto do dia (US$ ${teto.toFixed(2)}) foi atingido: já saíram US$ ${gasto.toFixed(2)} nas últimas 24 h. Quem aumenta o teto é o proprietário, no painel da IA.`,
      }
    }
  }
  return { ok: true, modelo: String(cfg.modelo || 'claude-sonnet-5'), esforco: String(cfg.esforco || 'medium'), teto, gasto }
}

/* Quem chama a API também fecha o pedido: a pergunta NUNCA fica em
   "respondendo" para sempre (achado da revisão de 11/09/2026). */
export const QUEDA_NO_MEIO = 'A resposta caiu no meio. Tente de novo.'

/**
 * Grava o fim de um pedido de IA e confere que gravou. Se o banco recusar (a
 * trava de US$ 5 por linha, por exemplo), grava de novo com o custo limitado a
 * US$ 5 e, se ainda assim não der, sem o custo: o gasto a menos fica no log, e
 * a pergunta não fica pendurada na tela de ninguém.
 */
export async function fecharPedido(sb: SupabaseClient, id: string, campos: Record<string, unknown>): Promise<void> {
  const { error } = await sb.from('ia_pedidos').update(campos).eq('id', id)
  if (!error) return
  console.error('[ia] fechar o pedido', id, error.message, 'custo', campos.custo_usd)
  const custo = Number(campos.custo_usd)
  if (Number.isFinite(custo) && custo > 5) {
    const { error: e2 } = await sb.from('ia_pedidos').update({ ...campos, custo_usd: 5 }).eq('id', id)
    if (!e2) return
  }
  const semCusto = { ...campos }
  delete semCusto.custo_usd
  await sb.from('ia_pedidos').update(semCusto).eq('id', id)
}

/** Texto do banco que entra na instrução da IA: sem sinais de marcação, entre aspas e curto. É dado, não ordem. */
export const comoDado = (v: unknown, max = 120) => `"${String(v ?? '').replace(/[<>"`\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)}"`

/** O corpo de erro padrão quando a API não pode responder. `motor: 'notebook'` é o sinal para a tela usar a fila do notebook. */
export const semApi = (t: Extract<Travas, { ok: false }>) => ({
  erro: t.erro,
  motivo: t.motivo,
  motor: 'notebook' as const,
  desligada: t.motivo === 'desligada',
  sem_chave: t.motivo === 'sem_chave',
  teto_estourado: t.motivo === 'teto',
})
