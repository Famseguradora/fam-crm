// ============================================================================
//  Comitê — Convites e cédula de votação por link
//
//  O diretor abre `/voto/<token>` no celular, direto do WhatsApp, SEM conta no
//  CRM. Toda a autenticação mora aqui:
//    1) o token (256 bits de CSPRNG) prova que a pessoa recebeu o convite;
//    2) para o link GERAL (lista de transmissão), o diretor ainda se identifica
//       escolhendo o próprio nome na bancada e confirmando os 4 últimos dígitos
//       do celular cadastrado.
//
//  Roda SÓ no servidor (usa a service-role key). Nunca importe daqui em
//  componente client — o token e a chave não podem chegar ao browser.
// ============================================================================
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { membrosComite, calcularPlacar, type PlacarComite } from '@/lib/comite/votacao'
import type { Operacao, Usuario, ComiteVoto, ComiteConvite, Anexo } from '@/types'

// Client service-role sem sessão — mesmo padrão de app/api/whatsapp/webhook.
export function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// 32 bytes = 256 bits. base64url para caber na URL sem escape.
// Espaço de busca inviável de enumerar; não deriva de id de usuário nem de
// timestamp, então não dá para adivinhar a partir de outro token conhecido.
export function gerarToken(): string {
  return randomBytes(32).toString('base64url')
}

// Nunca logar o token inteiro: logs de request ficam retidos na Vercel.
export function tokenCurto(token: string): string {
  return `${token.slice(0, 6)}…`
}

export type MotivoInvalido =
  | 'inexistente'   // token não existe, malformado ou revogado
  | 'expirado'
  | 'fora_de_comite'
  | 'encerrada'
  | 'em_vista'

export interface DadosCedula {
  convite: ComiteConvite
  operacao: Operacao
  membros: Usuario[]
  votos: ComiteVoto[]
  placar: PlacarComite
  anexoSubscricao: Anexo | null
  anexoCredito: Anexo | null
  // Diretor já identificado — só quando o convite é pessoal.
  diretor: Usuario | null
}

export type ResultadoConvite =
  | { ok: true; dados: DadosCedula }
  | { ok: false; motivo: MotivoInvalido; operacao?: Operacao; placar?: PlacarComite }

// Anexos que pertencem ao dossiê desta operação. MESMO predicado usado na aba
// Deliberação do CRM (operacoes/page.tsx) — anexos do tomador OU da operação.
// É esta função que impede um token válido de virar leitor universal de anexos.
export function anexoPertenceAoDossie(anexo: Anexo, op: Operacao): boolean {
  if (anexo.entidade_tipo === 'tomador') return anexo.entidade_id === op.tomador_id
  if (anexo.entidade_tipo === 'operacao') {
    return anexo.entidade_id === op.id || anexo.tomador_id === op.tomador_id
  }
  return false
}

// O documento mais recente de cada categoria. Substitui a antiga heurística de
// "pega o anexo mais novo do tomador e torce para ser a análise de crédito".
function maisRecente(anexos: Anexo[], categoria: Anexo['categoria']): Anexo | null {
  const doTipo = anexos
    .filter((a) => a.categoria === categoria)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  return doTipo[0] ?? null
}

// Compara os 4 últimos dígitos em tempo constante. O telefone do banco vem
// mascarado ((11) 99999-8888); o diretor digita só os 4 finais.
export function confereDigitos(telefoneCadastrado: string | null, digitados: string): boolean {
  const tel = (telefoneCadastrado ?? '').replace(/\D/g, '')
  const dig = (digitados ?? '').replace(/\D/g, '')
  if (tel.length < 4 || dig.length !== 4) return false
  const a = Buffer.from(tel.slice(-4))
  const b = Buffer.from(dig)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Carrega tudo o que a cédula precisa e aplica as travas de estado.
export async function resolverConvite(token: string): Promise<ResultadoConvite> {
  if (!token || token.length < 20 || token.length > 100) {
    return { ok: false, motivo: 'inexistente' }
  }

  const supabase = adminClient()

  const { data: convite } = await supabase
    .from('comite_convites')
    .select('*')
    .eq('token', token)
    .is('revogado_em', null)
    .maybeSingle()

  // Revogado e inexistente devolvem o MESMO motivo de propósito: a tela não
  // deve confirmar que um token existiu.
  if (!convite) return { ok: false, motivo: 'inexistente' }
  if (new Date(convite.expira_em).getTime() < Date.now()) {
    return { ok: false, motivo: 'expirado' }
  }

  const { data: operacao } = await supabase
    .from('operacoes')
    .select('*, tomador:tomadores(*), produto:produtos(*), corretora:corretoras(*)')
    .eq('id', convite.operacao_id)
    .maybeSingle()
  if (!operacao) return { ok: false, motivo: 'inexistente' }

  const [{ data: usuarios }, { data: votos }, { data: anexos }] = await Promise.all([
    supabase.from('usuarios').select('*').eq('comite', true).eq('status', 'ativo'),
    supabase.from('comite_votos').select('*').eq('operacao_id', convite.operacao_id),
    supabase
      .from('anexos')
      .select('*')
      .neq('categoria', 'outro')
      .or(
        `and(entidade_tipo.eq.tomador,entidade_id.eq.${operacao.tomador_id}),` +
        `and(entidade_tipo.eq.operacao,tomador_id.eq.${operacao.tomador_id}),` +
        `and(entidade_tipo.eq.operacao,entidade_id.eq.${operacao.id})`,
      ),
  ])

  const membros = membrosComite((usuarios ?? []) as Usuario[])
  const listaVotos = (votos ?? []) as ComiteVoto[]
  const placar = calcularPlacar(listaVotos, membros)
  const listaAnexos = (anexos ?? []) as Anexo[]

  const dados: DadosCedula = {
    convite: convite as ComiteConvite,
    operacao: operacao as Operacao,
    membros,
    votos: listaVotos,
    placar,
    anexoSubscricao: maisRecente(listaAnexos, 'analise_subscricao'),
    anexoCredito: maisRecente(listaAnexos, 'analise_credito'),
    diretor: convite.usuario_id
      ? membros.find((m) => m.id === convite.usuario_id) ?? null
      : null,
  }

  // Travas de estado — a cédula abre em modo leitura, mas não aceita voto.
  if (operacao.status !== 'Comitê') {
    return { ok: false, motivo: 'fora_de_comite', operacao: dados.operacao, placar }
  }
  if (operacao.comite_encerrado) {
    return { ok: false, motivo: 'encerrada', operacao: dados.operacao, placar }
  }
  if (operacao.comite_vista_por) {
    return { ok: false, motivo: 'em_vista', operacao: dados.operacao, placar }
  }

  return { ok: true, dados }
}

// Bots que buscam a URL para montar o card de preview no chat. Eles abrem o
// link assim que a mensagem é enviada — antes de qualquer diretor tocar nela.
// Sem este filtro, o painel mostraria "🟡 Abriu" para todo mundo na hora do
// envio e a auditoria de abertura perderia o sentido.
const BOTS_PREVIEW = /WhatsApp|facebookexternalhit|Facebot|TelegramBot|Slackbot|Twitterbot|LinkedInBot|Discordbot|SkypeUriPreview|Googlebot|bingbot|preview/i

export function ehBotDePreview(userAgent: string | null | undefined): boolean {
  return !userAgent || BOTS_PREVIEW.test(userAgent)
}

// Marca a abertura do link (auditoria: detecta link repassado a terceiros).
export async function registrarAbertura(conviteId: string, jaAberto: boolean): Promise<void> {
  const supabase = adminClient()
  const { data: atual } = await supabase
    .from('comite_convites').select('aberturas').eq('id', conviteId).maybeSingle()

  await supabase
    .from('comite_convites')
    .update({
      ...(jaAberto ? {} : { aberto_em: new Date().toISOString() }),
      ultimo_acesso_em: new Date().toISOString(),
      aberturas: ((atual?.aberturas as number) ?? 0) + 1,
    })
    .eq('id', conviteId)
}

// Quantas tentativas de PIN erradas cabem antes de travar, e por quanto tempo.
export const MAX_TENTATIVAS = 5
export const JANELA_MINUTOS = 15

// Anti-força-bruta do PIN. Sem isto, 10.000 combinações são testáveis por
// script em minutos — e o link geral circula numa lista de transmissão, então
// vazar é plausível. Conta as falhas recentes DESTE convite (qualquer diretor):
// um atacante não escapa trocando de alvo.
export async function pinBloqueado(conviteId: string): Promise<boolean> {
  const desde = new Date(Date.now() - JANELA_MINUTOS * 60_000).toISOString()
  const { count } = await adminClient()
    .from('comite_convite_acessos')
    .select('*', { count: 'exact', head: true })
    .eq('convite_id', conviteId)
    .eq('sucesso', false)
    .eq('motivo', 'digitos_incorretos')
    .gte('created_at', desde)
  return (count ?? 0) >= MAX_TENTATIVAS
}

// Trilha de quem tentou se identificar como quem (inclusive as falhas).
export async function registrarAcesso(
  conviteId: string,
  usuarioId: string | null,
  sucesso: boolean,
  motivo: string | null,
  req?: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  await adminClient().from('comite_convite_acessos').insert({
    convite_id: conviteId,
    usuario_id: usuarioId,
    sucesso,
    motivo,
    ip: req?.ip ?? null,
    user_agent: (req?.userAgent ?? '').slice(0, 300) || null,
  })
}
