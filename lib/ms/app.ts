/* O APLICATIVO REGISTRADO, LIDO DO BANCO  ·  23/09/2026
   ═══════════════════════════════════════════════════════════════════════════

   Uma função só, usada por todas as rotas que falam com a Microsoft. Existe
   para que o "de onde vem a configuração" seja decidido em UM lugar: antes era
   `process.env` espalhado por quatro rotas, e o registro pela tela teria que
   ser lembrado em cada uma delas.

   Devolve `null` quando ninguém registrou ainda — e aí `configMS` cai no
   ambiente, que é como estava antes e continua valendo. */

import type { SupabaseClient } from '@supabase/supabase-js'
import { decifrar, type AppRegistrado } from './graph'

export async function lerApp(admin: SupabaseClient): Promise<AppRegistrado | null> {
  const { data } = await admin
    .from('ms_app')
    .select('tenant_id, client_id, secret_cifrado')
    .eq('id', 'fam')
    .maybeSingle()

  if (!data?.secret_cifrado) return null

  try {
    return {
      tenant_id: String(data.tenant_id),
      client_id: String(data.client_id),
      secret: decifrar(String(data.secret_cifrado)),
    }
  } catch (e) {
    /* O segredo não abre: a chave que o cifrou mudou (trocaram a chave de
       serviço do Supabase, ou o MS_TOKEN_KEY). Registrar de novo pela tela
       resolve em um clique — e é melhor dizer isso do que devolver lixo. */
    console.error('[ms/app] não consegui decifrar o segredo do aplicativo:', e instanceof Error ? e.message : e)
    return null
  }
}
