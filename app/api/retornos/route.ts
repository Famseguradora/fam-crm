// ============================================================================
//  /api/retornos  ·  o Retorno da Análise (06/10/2026)
//
//  GET  ?caso=<id>     os retornos do caso (o mais novo primeiro). Se o caso
//                      tem análise concluída e ainda não tem retorno, ele nasce
//                      aqui, sem tocar o sino.
//       ?analise=<id>  os retornos daquela análise (a gaveta do tomador). Sem
//                      nenhum, nasce o da análise (com o caso dela, se houver).
//  POST { acao: 'gerar', analise_id, caso_id? }         só o analista
//       { acao: 'editar', id, texto_corretora?, texto_equipe? }  só o analista
//       { acao: 'respondido', id, desfazer? }           quem escreve no CRM
//
//  O SISTEMA SÓ LÊ E-MAIL (ordem do Marco, 06/10/2026, até segunda ordem):
//  nada aqui responde, rascunha ou envia. Ele copia o texto e responde pelo
//  Outlook; "respondido" é a anotação disso, à mão ou percebida pelo Carteiro
//  lendo os Itens Enviados.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'
import { COLUNAS_RETORNO, gerarRetorno, type Retorno } from '@/lib/analise/retorno-servidor'

export const runtime = 'nodejs'

/* Chave de serviço de verdade, sem os cookies da pessoa (o `createAdminClient`
   do projeto leva a sessão junto e a RLS continua valendo). */
function servico() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const UUID = /^[0-9a-f-]{36}$/i

async function quemE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const [{ data: u }, { data: ve }, { data: analista }, { data: escreve }] = await Promise.all([
    supabase.from('usuarios').select('nome, email').eq('auth_id', user.id).maybeSingle(),
    supabase.rpc('fam_ve_analise'),
    supabase.rpc('fam_e_analista'),
    supabase.rpc('fam_pode_escrever'),
  ])
  return {
    supabase,
    nome: (u?.nome as string | null) ?? (u?.email as string | null) ?? user.email ?? 'alguém',
    ve: !!ve, analista: !!analista, escreve: !!escreve,
  }
}

export async function GET(req: NextRequest) {
  const quem = await quemE()
  if (!quem) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })
  if (!quem.ve) return NextResponse.json({ retornos: [], pode: { editar: false, responder: false }, sem_acesso: true })

  const url = new URL(req.url)
  const casoId = url.searchParams.get('caso') ?? ''
  const analiseId = url.searchParams.get('analise') ?? ''
  if (!UUID.test(casoId) && !UUID.test(analiseId)) return NextResponse.json({ erro: 'Falta o caso ou a análise.' }, { status: 422 })

  const ler = async () => {
    let q = quem.supabase.from('analise_retornos').select(COLUNAS_RETORNO).order('gerado_em', { ascending: false })
    q = UUID.test(casoId) ? q.eq('caso_id', casoId) : q.eq('analise_id', analiseId)
    const { data } = await q
    return (data ?? []) as Retorno[]
  }

  let retornos = await ler()

  /* Nasce na primeira abertura. A análise vem da esteira (o caso aponta a
     linha da fila, e a linha aponta a análise publicada). Sem análise
     publicada ainda, não há o que responder: a lista volta vazia. */
  if (!retornos.length) {
    const sb = servico()
    let alvo: { analise: string; caso: string | null } | null = null
    if (UUID.test(casoId)) {
      const { data: f } = await sb.from('analise_fila').select('analise_id')
        .eq('caso_id', casoId).eq('situacao', 'concluida').not('analise_id', 'is', null)
        .order('concluido_em', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
      if (f?.analise_id) alvo = { analise: f.analise_id as string, caso: casoId }
    } else {
      const { data: f } = await sb.from('analise_fila').select('caso_id')
        .eq('analise_id', analiseId).not('caso_id', 'is', null)
        .order('concluido_em', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
      alvo = { analise: analiseId, caso: (f?.caso_id as string | null) ?? null }
    }
    if (alvo) {
      const r = await gerarRetorno(sb, { analiseId: alvo.analise, casoId: alvo.caso, por: 'sistema', avisar: false })
      if (r.ok) retornos = await ler()
    }
  }

  // O número do caso, para a gaveta do tomador dizer "caso nº 99" quando a análise responde a mais de um.
  const casos = [...new Set(retornos.map(r => r.caso_id).filter((x): x is string => !!x))]
  if (casos.length) {
    const { data: ns } = await quem.supabase.from('casos').select('id, numero').in('id', casos)
    const num = new Map((ns ?? []).map(c => [c.id as string, c.numero as number | null]))
    retornos = retornos.map(r => ({ ...r, caso_numero: r.caso_id ? num.get(r.caso_id) ?? null : null }))
  }

  return NextResponse.json({ retornos, pode: { editar: quem.analista, responder: quem.escreve } })
}

export async function POST(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa
  const quem = await quemE()
  if (!quem) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })
  if (!quem.ve) return NextResponse.json({ erro: 'Sem acesso à análise de crédito.' }, { status: 403 })

  const corpo = await req.json().catch(() => ({})) as Record<string, unknown>
  const acao = String(corpo.acao ?? '')
  const sb = servico()

  if (acao === 'gerar') {
    if (!quem.analista) return NextResponse.json({ erro: 'Só o analista de crédito gera o retorno de novo.' }, { status: 403 })
    const analiseId = String(corpo.analise_id ?? '')
    const casoId = corpo.caso_id ? String(corpo.caso_id) : null
    if (!UUID.test(analiseId) || (casoId && !UUID.test(casoId))) return NextResponse.json({ erro: 'Falta a análise.' }, { status: 422 })
    /* Só o par que a esteira ligou (achado da revisão): sem isto, a análise de
       um tomador viraria resposta do e-mail de outro caso. */
    if (casoId) {
      const { data: par } = await sb.from('analise_fila').select('id').eq('caso_id', casoId).eq('analise_id', analiseId).limit(1).maybeSingle()
      if (!par) return NextResponse.json({ erro: 'Esta análise não é a do caso.' }, { status: 422 })
    }
    const r = await gerarRetorno(sb, { analiseId, casoId, por: quem.nome, avisar: false, forcar: true })
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 422 })
    return NextResponse.json({ ok: true, retorno: r.retorno })
  }

  const id = String(corpo.id ?? '')
  if (!UUID.test(id)) return NextResponse.json({ erro: 'Falta dizer qual retorno.' }, { status: 422 })
  // Confere pela sessão que a pessoa enxerga este retorno antes de mexer com a chave de serviço.
  const { data: existe } = await quem.supabase.from('analise_retornos').select('id').eq('id', id).maybeSingle()
  if (!existe) return NextResponse.json({ erro: 'Retorno não encontrado.' }, { status: 404 })

  if (acao === 'editar') {
    if (!quem.analista) return NextResponse.json({ erro: 'Só o analista de crédito ajusta o texto.' }, { status: 403 })
    const mudanca: Record<string, unknown> = { editado_em: new Date().toISOString(), editado_por: quem.nome }
    if (typeof corpo.texto_corretora === 'string' && corpo.texto_corretora.trim()) mudanca.texto_corretora = corpo.texto_corretora.slice(0, 40000)
    if (typeof corpo.texto_equipe === 'string' && corpo.texto_equipe.trim()) mudanca.texto_equipe = corpo.texto_equipe.slice(0, 60000)
    if (Object.keys(mudanca).length === 2) return NextResponse.json({ erro: 'Nada para mudar.' }, { status: 422 })
    const { data, error } = await sb.from('analise_retornos').update(mudanca).eq('id', id).select(COLUNAS_RETORNO).single()
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, retorno: data })
  }

  if (acao === 'respondido') {
    if (!quem.escreve) return NextResponse.json({ erro: 'Seu acesso é só de leitura.' }, { status: 403 })
    /* Desfazer à mão para de perguntar ao Outlook: sem `nao_conferir`, o
       Carteiro acharia a mesma mensagem e marcaria de novo em 20 minutos. */
    const mudanca = corpo.desfazer === true
      ? { respondido_em: null, respondido_por: null, respondido_como: null, nao_conferir: true }
      : { respondido_em: new Date().toISOString(), respondido_por: quem.nome, respondido_como: 'manual' }
    const { data, error } = await sb.from('analise_retornos').update(mudanca).eq('id', id).select(COLUNAS_RETORNO).single()
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, retorno: data })
  }

  return NextResponse.json({ erro: 'Ação desconhecida (gerar, editar, respondido).' }, { status: 422 })
}
