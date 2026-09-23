// ============================================================================
//  /api/avisos-pedido  ·  a tela dos avisos da linha do tempo
//
//  GET   a régua (os 5 nós) + os avisos, já varridos na hora da abertura.
//  POST  { acao: 'varrer' | 'autorizar' | 'cancelar' | 'editar' | 'regua' }
//
//  QUEM PODE O QUÊ:
//    varrer, autorizar, cancelar, editar ... quem escreve no CRM (fam_pode_escrever)
//    mexer na régua ....................... só o proprietário, porque ligar
//      envio automático em nome da FAM não é ajuste de tela.
//
//  A criação do aviso é da varredura (service role): ninguém inventa aviso
//  pela tela, e por isso `avisos_pedido` não tem policy de INSERT.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'
import { varrerAvisos, NOS } from '@/lib/avisos/varrer'

export const runtime = 'nodejs'

/* SERVICE ROLE DE VERDADE, e não o `createAdminClient` do projeto: aquele leva
   os cookies da pessoa junto, então o PostgREST usa o token dela e a RLS
   continua valendo (foi o que barrou a primeira varredura do ensaio, com
   "new row violates row-level security policy"). Criar aviso é ato do sistema,
   não da tela: precisa de um cliente sem sessão. */
function servico() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const COLUNAS = 'id, no, chave, caso_id, analise_fila_id, operacao_id, tomador_id, email_caixa_id, empresa, cnpj, destinatarios, assunto, corpo, estado, modo, entregue_como, autorizado_por, autorizado_em, enviado_em, erro, maquina, ocorrido_em, criado_em'

async function quemE(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('usuarios').select('nome, proprietario').eq('auth_id', user.id).maybeSingle()
  return { user, nome: (data?.nome as string | null) ?? user.email ?? 'alguém', proprietario: !!data?.proprietario }
}

export async function GET() {
  const supabase = await createClient()
  const quem = await quemE(supabase)
  if (!quem) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  // A varredura roda na abertura da tela: é barata e deixa a lista em dia sem
  // depender do Carteiro estar de pé.
  let varredura = null
  try {
    varredura = await varrerAvisos(servico())
  } catch (e) {
    varredura = { criados: 0, ja_existiam: 0, sem_destinatario: 0, automaticos: 0, erros: [String((e as Error).message)] }
  }

  const [{ data: regua }, { data: avisos }] = await Promise.all([
    supabase.from('aviso_regras').select('*').order('ordem'),
    supabase.from('avisos_pedido').select(COLUNAS).order('criado_em', { ascending: false }).limit(200),
  ])

  return NextResponse.json({ ok: true, regua: regua ?? [], avisos: avisos ?? [], varredura, proprietario: quem.proprietario })
}

export async function POST(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa

  const supabase = await createClient()
  const quem = await quemE(supabase)
  if (!quem) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const corpo = await req.json().catch(() => ({})) as Record<string, unknown>
  const acao = String(corpo.acao ?? '')
  const agora = new Date().toISOString()

  if (acao === 'varrer') {
    const r = await varrerAvisos(servico())
    return NextResponse.json({ ok: true, ...r })
  }

  if (acao === 'autorizar' || acao === 'cancelar' || acao === 'editar') {
    const id = String(corpo.id ?? '')
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ erro: 'Falta dizer qual aviso.' }, { status: 422 })

    const { data: aviso } = await supabase.from('avisos_pedido').select('id, estado, destinatarios, assunto, corpo').eq('id', id).maybeSingle()
    if (!aviso) return NextResponse.json({ erro: 'Aviso não encontrado.' }, { status: 404 })
    // Aviso que já saiu não volta atrás: e-mail enviado não se desfaz.
    if (aviso.estado === 'enviado' || aviso.estado === 'enviando') {
      return NextResponse.json({ erro: 'Este aviso já está com o Outlook. Não dá para mexer nele agora.' }, { status: 409 })
    }

    if (acao === 'cancelar') {
      await supabase.from('avisos_pedido').update({ estado: 'cancelado', erro: null }).eq('id', id)
      return NextResponse.json({ ok: true })
    }

    if (acao === 'editar') {
      const mudanca: Record<string, unknown> = {}
      if (typeof corpo.assunto === 'string') mudanca.assunto = corpo.assunto.trim().slice(0, 300)
      if (typeof corpo.corpo === 'string') mudanca.corpo = corpo.corpo.slice(0, 20000)
      if (Array.isArray(corpo.destinatarios)) {
        mudanca.destinatarios = corpo.destinatarios.map(x => String(x).trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).slice(0, 20)
      }
      if (!Object.keys(mudanca).length) return NextResponse.json({ erro: 'Nada para mudar.' }, { status: 422 })
      const { error } = await supabase.from('avisos_pedido').update(mudanca).eq('id', id)
      if (error) return NextResponse.json({ erro: error.message }, { status: 403 })
      return NextResponse.json({ ok: true })
    }

    // autorizar
    const destinatarios = Array.isArray(corpo.destinatarios) && corpo.destinatarios.length
      ? corpo.destinatarios.map(x => String(x).trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).slice(0, 20)
      : (aviso.destinatarios as string[] | null) ?? []
    if (!destinatarios.length) {
      return NextResponse.json({ erro: 'Este aviso não tem destinatário. Escreva para quem ele vai antes de autorizar.' }, { status: 422 })
    }
    /* Marcador aberto não sai. "A análise de {empresa} foi concluída" enviado a
       alguém é pior do que aviso nenhum: o texto guarda a lacuna à vista, e a
       autorização só passa depois que alguém escreveu o que falta. */
    const aberto = /\{\w+\}/.exec(`${aviso.assunto} ${aviso.corpo}`)
    if (aberto) {
      return NextResponse.json({ erro: `O texto ainda tem ${aberto[0]} no lugar do dado. Escreva antes de autorizar.` }, { status: 422 })
    }
    const { error } = await supabase.from('avisos_pedido')
      .update({ estado: 'autorizado', destinatarios, autorizado_por: quem.nome, autorizado_em: agora, erro: null })
      .eq('id', id)
    if (error) return NextResponse.json({ erro: error.message }, { status: 403 })
    return NextResponse.json({ ok: true })
  }

  if (acao === 'regua') {
    if (!quem.proprietario) return NextResponse.json({ erro: 'Só o proprietário muda a régua dos avisos.' }, { status: 403 })
    const no = String(corpo.no ?? '')
    if (!(NOS as readonly string[]).includes(no)) return NextResponse.json({ erro: 'Nó desconhecido.' }, { status: 422 })

    const mudanca: Record<string, unknown> = { atualizado_em: agora, atualizado_por: quem.nome }
    if (typeof corpo.ligado === 'boolean') mudanca.ligado = corpo.ligado
    if (corpo.modo === 'pedir' || corpo.modo === 'automatico') mudanca.modo = corpo.modo
    if (typeof corpo.assunto === 'string') mudanca.assunto = corpo.assunto.trim().slice(0, 300)
    if (typeof corpo.texto === 'string') mudanca.texto = corpo.texto.slice(0, 20000)
    if (Array.isArray(corpo.destinatarios)) {
      mudanca.destinatarios = corpo.destinatarios.map(x => String(x).trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).slice(0, 20)
    }

    const { error } = await supabase.from('aviso_regras').update(mudanca).eq('no', no)
    if (error) return NextResponse.json({ erro: error.message }, { status: 403 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ erro: 'Ação desconhecida (varrer, autorizar, cancelar, editar, regua).' }, { status: 422 })
}
