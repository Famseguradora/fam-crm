/* O TOKEN DO MICROSOFT 365 DA PESSOA, pedido agora e esquecido depois.

   Saiu de `/api/casos/do-outlook` em 30/09/2026, quando o arrasto do Novo
   Outlook passou a servir também para JUNTAR e-mail a um caso que já existe
   (`/api/casos/<id>/email`). Duas rotas renovando token cada uma do seu jeito
   divergiriam no primeiro ajuste; por isso mora aqui. */

import type { SupabaseClient } from '@supabase/supabase-js'
import { configMS, renovar, decifrar, cifrar } from '@/lib/ms/graph'
import { lerApp } from '@/lib/ms/app'

export type AcessoMS =
  | { ok: true; acesso: string; conta: string }
  | { ok: false; status: number; corpo: Record<string, unknown> }

/** `admin` é o cliente de serviço: `ms_conexoes` não tem policy de leitura. */
export async function acessoDaPessoa(admin: SupabaseClient, authId: string): Promise<AcessoMS> {
  const cfg = configMS(undefined, await lerApp(admin))
  if (!cfg.ok) {
    return { ok: false, status: 503, corpo: { erro: 'A busca no Outlook ainda não foi ligada neste CRM.', falta: cfg.falta } }
  }
  const { data: conexao } = await admin
    .from('ms_conexoes').select('conta, refresh_cifrado').eq('auth_id', authId).maybeSingle()
  if (!conexao) {
    return { ok: false, status: 428, corpo: { erro: 'Sua caixa do Outlook ainda não está ligada ao CRM.', conectar: true } }
  }

  try {
    const tok = await renovar(cfg.cfg, decifrar(conexao.refresh_cifrado as string))
    if (tok.error || !tok.access_token) {
      await admin.from('ms_conexoes')
        .update({ falha: tok.error_description ?? tok.error ?? 'refresh recusado' })
        .eq('auth_id', authId)
      return { ok: false, status: 428, corpo: { erro: 'A permissão da sua caixa expirou. Conecte de novo (é um clique).', conectar: true } }
    }
    /* A Microsoft costuma devolver um refresh NOVO a cada renovação, e o
       antigo morre em algumas rodadas. Não guardar o novo é ver a conexão
       "expirar sozinha" dali a alguns dias, sem explicação. */
    await admin.from('ms_conexoes')
      .update({
        ...(tok.refresh_token ? { refresh_cifrado: cifrar(tok.refresh_token) } : {}),
        usado_em: new Date().toISOString(),
        falha: null,
      })
      .eq('auth_id', authId)
    return { ok: true, acesso: tok.access_token, conta: String(conexao.conta ?? '').toLowerCase() }
  } catch (e) {
    return {
      ok: false, status: 428,
      corpo: { erro: 'Não consegui usar a permissão guardada. Conecte a caixa de novo.', conectar: true, detalhe: e instanceof Error ? e.message : '' },
    }
  }
}
