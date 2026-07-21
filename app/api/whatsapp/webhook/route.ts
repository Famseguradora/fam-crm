import { NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendMenu, sendKpiCard, sendBotoesVoto, sendTextoWhats, BTN } from '@/lib/whatsapp/client'
import { getKpisPorStatus } from '@/lib/operacoes/kpis'
import { calcularPlacar } from '@/lib/comite/votacao'
import { montarConfirmacaoVoto, montarVeredito } from '@/lib/comite/whatsapp-sim'
import type { VotoComite } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Menu (botão/intenção) → status real no banco + título exibido no card.
const STATUS_MAP: Record<string, { status: string; titulo: string }> = {
  [BTN.comite]: { status: 'Comitê', titulo: 'Operações em Comitê' },
  [BTN.aprovadas]: { status: 'Aprovado', titulo: 'Operações Aprovadas' },
  [BTN.emitidas]: { status: 'Emitido', titulo: 'Operações Emitidas' },
}

// Resposta numérica de voto (fallback p/ aparelhos que não renderizam botão).
const VOTO_NUMERICO: Record<string, VotoComite> = {
  '1': 'aprovado',
  '2': 'aprovado_ressalva',
  '3': 'reprovado',
}

// Payload plano do webhook "Ao receber" da Z-API (campos que usamos).
interface ZapiInbound {
  phone?: string
  fromMe?: boolean
  text?: { message?: string }
  buttonsResponseMessage?: { buttonId?: string; message?: string }
  listResponseMessage?: { selectedRowId?: string }
}

// Client service-role sem sessão — padrão usado em app/api/usuarios/route.ts.
function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// ── POST: eventos de mensagem (webhook "Ao receber" da Z-API) ──────────────
export async function POST(request: NextRequest) {
  // 1) Segurança: a Z-API não assina como a Meta (HMAC). Protegemos com um
  //    segredo compartilhado na query string do webhook (?secret=...).
  const secret = request.nextUrl.searchParams.get('secret')
  if (!process.env.ZAPI_WEBHOOK_SECRET || secret !== process.env.ZAPI_WEBHOOK_SECRET) {
    return new Response('Invalid secret', { status: 401 })
  }

  let body: ZapiInbound
  try {
    body = await request.json()
  } catch {
    return new Response('Bad body', { status: 400 })
  }

  // 2) Ignora ecos das nossas próprias mensagens e eventos sem remetente.
  if (body?.fromMe === true) return new Response('ok', { status: 200 })
  const from: string = (body?.phone ?? '').replace(/\D/g, '') // só dígitos, com DDI 55...
  if (from.length < 10) return new Response('ok', { status: 200 })

  try {
    const supabase = adminClient()
    const buttonId = getButtonId(body)
    const texto = getTexto(body)

    // 3a) Fluxo do COMITÊ por botão — autorização própria por membro do comitê.
    if (buttonId && buttonId.startsWith('cv_')) {
      await handleComite(supabase, from, buttonId)
      return new Response('ok', { status: 200 })
    }

    // 3b) Fallback: voto por texto numérico (1/2/3) de um membro do comitê.
    if (texto && VOTO_NUMERICO[texto.trim()]) {
      const tratado = await tentarVotoNumerico(supabase, from, VOTO_NUMERICO[texto.trim()])
      if (tratado) return new Response('ok', { status: 200 })
    }

    // 3c) Fluxo do MENU KPI — autorização por admin ativo.
    const autorizado = await usuarioAutorizado(supabase, from)
    if (!autorizado) {
      // Número desconhecido / não-admin → silêncio (decisão de produto).
      return new Response('ok', { status: 200 })
    }

    // 4) Roteamento da intenção.
    //    Clique em botão conhecido → card de KPI.
    //    Qualquer texto (ex.: "FAM") → menu.
    const alvo = buttonId && STATUS_MAP[buttonId] ? STATUS_MAP[buttonId] : null
    if (alvo) {
      const kpi = await getKpisPorStatus(supabase, alvo.status)
      await sendKpiCard(from, kpi, alvo.titulo)
    } else {
      // "Voltar ao menu" (btn_menu), gatilho "FAM" ou qualquer outro texto → menu.
      await sendMenu(from)
    }
  } catch (e) {
    console.error('[whatsapp] Erro ao processar evento:', e)
  }

  // Sempre 200 para a Z-API não reenfileirar.
  return new Response('ok', { status: 200 })
}

// id do botão de resposta da Z-API (button list), ou null.
function getButtonId(body: ZapiInbound): string | null {
  return body?.buttonsResponseMessage?.buttonId ?? body?.listResponseMessage?.selectedRowId ?? null
}

// Texto puro de uma mensagem da Z-API, ou null.
function getTexto(body: ZapiInbound): string | null {
  const t = body?.text?.message
  return typeof t === 'string' ? t : null
}

// ── Votação do Comitê via WhatsApp ─────────────────────────────────────────
type MembroComite = { id: string; nome: string; cargo: string | null }

async function handleComite(supabase: SupabaseClient, from: string, buttonId: string): Promise<void> {
  const membro = await usuarioComite(supabase, from)
  if (!membro) return // não é membro do comitê → silêncio

  if (buttonId.startsWith('cv_votar:')) {
    await sendBotoesVoto(from, buttonId.slice('cv_votar:'.length))
    return
  }
  if (buttonId.startsWith('cv_anexo:')) {
    await enviarAnaliseCredito(supabase, from, buttonId.slice('cv_anexo:'.length))
    return
  }
  if (buttonId.startsWith('cv_voto:')) {
    // formato: cv_voto:<voto>:<operacao_id>
    const rest = buttonId.slice('cv_voto:'.length)
    const sep = rest.indexOf(':')
    if (sep < 0) return
    const voto = rest.slice(0, sep) as VotoComite
    const opId = rest.slice(sep + 1)
    await registrarVotoWhats(supabase, from, membro, voto, opId)
  }
}

// Voto por texto "1/2/3": resolve a operação em Comitê aberta mais recente que
// este diretor ainda não votou (cobre aparelhos sem botão interativo).
async function tentarVotoNumerico(
  supabase: SupabaseClient,
  from: string,
  voto: VotoComite,
): Promise<boolean> {
  const membro = await usuarioComite(supabase, from)
  if (!membro) return false

  const { data: ops, error } = await supabase
    .from('operacoes')
    .select('id, created_at')
    .eq('status', 'Comitê')
    .eq('comite_encerrado', false)
    .order('created_at', { ascending: false })
  if (error || !ops || ops.length === 0) return false

  const { data: votos } = await supabase
    .from('comite_votos')
    .select('operacao_id')
    .eq('usuario_id', membro.id)
  const votadas = new Set((votos ?? []).map((v: { operacao_id: string }) => v.operacao_id))

  const alvo = ops.find((o: { id: string }) => !votadas.has(o.id)) ?? ops[0]
  await registrarVotoWhats(supabase, from, membro, voto, alvo.id)
  return true
}

// Membro do comitê ativo, casado pelos dígitos finais do telefone (Z-API manda com DDI 55...).
async function usuarioComite(supabase: SupabaseClient, fromE164: string): Promise<MembroComite | null> {
  const fromDigitos = fromE164.replace(/\D/g, '')
  if (fromDigitos.length < 10) return null

  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome, cargo, telefone')
    .eq('comite', true)
    .eq('status', 'ativo')
    .not('telefone', 'is', null)

  if (error || !data) return null

  const u = data.find((x: { telefone: string | null }) => {
    const tel = (x.telefone ?? '').replace(/\D/g, '')
    return tel.length >= 10 && (fromDigitos.endsWith(tel) || tel.endsWith(fromDigitos))
  }) as { id: string; nome: string; cargo: string | null } | undefined
  return u ? { id: u.id, nome: u.nome, cargo: u.cargo ?? null } : null
}

// Registra/atualiza o voto (UPSERT idempotente), recalcula o placar e responde.
async function registrarVotoWhats(
  supabase: SupabaseClient,
  from: string,
  membro: MembroComite,
  voto: VotoComite,
  opId: string,
): Promise<void> {
  if (!['aprovado', 'aprovado_ressalva', 'reprovado'].includes(voto)) return

  // Defesa: só aceita voto em operação realmente em Comitê e ainda aberta —
  // impede voto via buttonId forjado em operação inexistente/encerrada.
  const { data: op } = await supabase
    .from('operacoes')
    .select('id')
    .eq('id', opId)
    .eq('status', 'Comitê')
    .eq('comite_encerrado', false)
    .maybeSingle()
  if (!op) return

  // Retratação por WhatsApp: se já existe voto, arquiva o anterior no histórico
  // antes de sobrescrever — preserva a trilha de auditoria como no CRM.
  const { data: votoAtual } = await supabase
    .from('comite_votos').select('*')
    .eq('operacao_id', opId).eq('usuario_id', membro.id).maybeSingle()
  if (votoAtual) {
    await supabase.from('comite_votos_historico').insert({
      operacao_id: votoAtual.operacao_id, usuario_id: votoAtual.usuario_id,
      autor: votoAtual.autor, cargo: votoAtual.cargo, voto: votoAtual.voto,
      segue_subscritor: votoAtual.segue_subscritor, argumentacao: votoAtual.argumentacao,
      canal: votoAtual.canal, votado_em: votoAtual.created_at,
    })
  }

  await supabase.from('comite_votos').upsert(
    {
      operacao_id: opId,
      usuario_id: membro.id,
      autor: membro.nome,
      cargo: membro.cargo,
      voto,
      segue_subscritor: false,
      canal: 'whatsapp',
    },
    { onConflict: 'operacao_id,usuario_id' },
  )

  const [{ data: votos }, { data: membros }] = await Promise.all([
    supabase.from('comite_votos').select('*').eq('operacao_id', opId),
    supabase.from('usuarios').select('*').eq('comite', true).eq('status', 'ativo'),
  ])
  const placar = calcularPlacar(votos ?? [], membros ?? [])

  if (placar.completo && placar.parecerFinal) {
    await supabase
      .from('operacoes')
      .update({ comite_parecer_final: placar.parecerFinal, comite_encerrado: true })
      .eq('id', opId)
  }

  await sendTextoWhats(from, montarConfirmacaoVoto(membro.nome, voto, placar))
  if (placar.completo && placar.parecerFinal) {
    await sendTextoWhats(from, montarVeredito(membro.nome, placar.parecerFinal))
  }
}

// Envia o link assinado da análise de crédito (anexo do tomador da operação).
async function enviarAnaliseCredito(supabase: SupabaseClient, from: string, opId: string): Promise<void> {
  const { data: op } = await supabase.from('operacoes').select('tomador_id').eq('id', opId).maybeSingle()
  if (!op?.tomador_id) {
    await sendTextoWhats(from, '📄 Análise de crédito ainda não disponível para esta operação.')
    return
  }

  // Antes isto pegava o anexo MAIS RECENTE do tomador e torcia para ser a
  // análise de crédito. Agora a categoria é declarada no upload.
  const { data: anexos } = await supabase
    .from('anexos')
    .select('storage_path, nome_original')
    .eq('categoria', 'analise_credito')
    .eq('entidade_tipo', 'tomador')
    .eq('entidade_id', op.tomador_id)
    .order('created_at', { ascending: false })

  const anexo = (anexos ?? [])[0]
  if (!anexo) {
    await sendTextoWhats(from, '📄 Nenhum documento de análise de crédito anexado a este tomador ainda.')
    return
  }

  const { data: signed } = await supabase.storage.from('fam-anexos').createSignedUrl(anexo.storage_path, 3600)
  if (!signed?.signedUrl) {
    await sendTextoWhats(from, '📄 Não consegui gerar o link da análise agora. Consulte pelo CRM.')
    return
  }
  await sendTextoWhats(from, `📄 *Análise de crédito* — ${anexo.nome_original}\n${signed.signedUrl}`)
}

// Verifica se o remetente é um usuário cadastrado e ATIVO (qualquer perfil),
// casando pelos dígitos finais do telefone. Assim o menu "FAM"/relatórios fica
// liberado a qualquer pessoa da empresa cadastrada — nunca a externos.
// A Z-API envia com DDI (55...); o banco guarda mascarado sem DDI ((11) 99999-8888).
async function usuarioAutorizado(supabase: SupabaseClient, fromE164: string): Promise<boolean> {
  const fromDigitos = fromE164.replace(/\D/g, '')
  if (fromDigitos.length < 10) return false

  const { data, error } = await supabase
    .from('usuarios')
    .select('telefone')
    .eq('status', 'ativo')
    .not('telefone', 'is', null)

  if (error || !data) return false

  return data.some((u) => {
    const telDigitos = (u.telefone ?? '').replace(/\D/g, '')
    if (telDigitos.length < 10) return false
    // Casa pelos últimos 10–11 dígitos (DDD + número), tolerando o DDI extra.
    return fromDigitos.endsWith(telDigitos) || telDigitos.endsWith(fromDigitos)
  })
}
