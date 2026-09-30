// ============================================================================
//  /api/casos/<id>/email  ·  o que chegou para este caso, e juntar mais
//
//  GET   a linha do tempo do caso: o e-mail MATRIZ (o que abriu o caso, com o
//        selo), os e-mails FILHOS juntados depois, e os documentos avulsos que
//        chegaram por outro meio (WhatsApp, em mãos), cada um com o que trouxe.
//  POST  junta um e-mail a este caso, sem abrir análise nova. Aceita o arquivo
//        (.msg/.eml, ou o que o Outlook clássico monta no arrasto) em `email`,
//        ou o bilhete do Novo Outlook em JSON `{ arrasto }`.
//
//  Pedido do Marco em 30/09/2026: "a ideia não é uma nova análise, a ideia é
//  um complemento". A regra mora em `lib/casos/juntar-email.ts`.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'
import { juntarEmailAoCaso, type ReciboDeJuntar } from '@/lib/casos/juntar-email'
import { MAX_BYTES_EMAIL } from '@/lib/casos/abrir-por-email'
import { lerArrastoDoOutlook, MAX_BYTES_ARRASTO } from '@/lib/email/arrasto-outlook'
import { acessoDaPessoa } from '@/lib/ms/acesso'
import { baixarMIME } from '@/lib/ms/graph'

export const runtime = 'nodejs'
export const maxDuration = 120

export interface EventoDoCaso {
  tipo: 'matriz' | 'email' | 'avulso'
  quando: string | null
  titulo: string
  de: string | null
  por: string | null
  /** Os arquivos que aquele e-mail ou aquela entrega trouxe. */
  trouxe: string[]
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada.' }, { status: 401 })

  const { data: caso } = await supabase
    .from('casos').select('id, email_caixa_id, recebido_em, assunto, remetente_nome, criado_por_nome').eq('id', id).maybeSingle()
  if (!caso) return NextResponse.json({ erro: 'Caso não encontrado.' }, { status: 404 })

  /* A RLS de `emails_caixa` vale aqui (sessão, não serviço): e-mail que a
     régua recusou só o dono da caixa vê. O juntado nasce `serve`, então todo
     mundo que trabalha no caso o enxerga. */
  const [{ data: emails }, { data: avulsos }] = await Promise.all([
    supabase
      .from('emails_caixa')
      .select('id, assunto, de, email_de, recebido_em, anexos, juntado_em, juntado_por, estado_por')
      .eq('caso_id', id),
    supabase
      .from('caso_documentos')
      .select('nome, detalhe, criado_em')
      .eq('caso_id', id)
      .like('detalhe', 'Anexado à mão%')
      .order('criado_em'),
  ])

  const uteis = (anexos: unknown) =>
    (Array.isArray(anexos) ? anexos : [])
      .filter((a: { embutido?: boolean; nome?: string }) => !a?.embutido && a?.nome && !/^image\d{3}\./i.test(a.nome))
      .map((a: { nome: string }) => a.nome)

  const eventos: EventoDoCaso[] = []
  for (const e of emails ?? []) {
    const matriz = e.id === caso.email_caixa_id
    eventos.push({
      tipo: matriz ? 'matriz' : 'email',
      quando: (e.recebido_em as string | null) ?? (e.juntado_em as string | null),
      titulo: (e.assunto as string) || '(sem assunto)',
      de: (e.de as string | null) || (e.email_de as string | null),
      por: matriz ? (caso.criado_por_nome as string | null) : (e.juntado_por as string | null) ?? (e.estado_por as string | null),
      trouxe: uteis(e.anexos),
    })
  }

  /* Documento avulso: agrupa pela mesma entrega (mesmo detalhe, no mesmo
     minuto). O detalhe carrega "como chegou" e quem subiu. */
  const grupos = new Map<string, EventoDoCaso>()
  for (const d of avulsos ?? []) {
    const chave = `${d.detalhe}|${String(d.criado_em).slice(0, 16)}`
    const g = grupos.get(chave) ?? {
      tipo: 'avulso' as const,
      quando: d.criado_em as string,
      titulo: String(d.detalhe ?? 'Anexado à mão').replace(/\.$/, ''),
      de: null, por: null, trouxe: [],
    }
    g.trouxe.push(d.nome as string)
    grupos.set(chave, g)
  }
  eventos.push(...grupos.values())
  eventos.sort((a, b) => (a.tipo === 'matriz' ? -1 : b.tipo === 'matriz' ? 1 : String(a.quando ?? '').localeCompare(String(b.quando ?? ''))))

  return NextResponse.json({ eventos, tem_matriz: !!caso.email_caixa_id })
}

function resposta(r: ReciboDeJuntar) {
  if (!r.ok) return NextResponse.json({ erro: r.erro, falhas: r.falhas }, { status: r.erro?.includes('permissão') ? 403 : 422 })
  return NextResponse.json({ ...r, recibos: [r] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const { data: quem } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
  const autor = { auth_id: user.id, nome: (quem as { nome: string | null } | null)?.nome ?? user.email ?? null }

  /* ── o arrasto do Novo Outlook: o CRM busca o e-mail pelo Graph ───────── */
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    let corpo: Record<string, unknown> = {}
    try { corpo = await req.json() } catch { /* cai na validação */ }
    const arrastados = lerArrastoDoOutlook(String(corpo.arrasto ?? ''))
    if (!arrastados.length) {
      return NextResponse.json({ erro: 'Não reconheci o e-mail arrastado. Salve o e-mail e solte o arquivo.' }, { status: 422 })
    }
    const ms = await acessoDaPessoa(await createAdminClient(), user.id)
    if (!ms.ok) return NextResponse.json(ms.corpo, { status: ms.status })

    type Recibo = ReciboDeJuntar & { assunto?: string | null }
    const recibos: Recibo[] = []
    const falhou = (erro: string, assunto: string | null): Recibo => ({
      ok: false, erro, assunto, documentos: 0, ignorados: 0, falhas: [], resolveu: [],
      no_tomador: false, analise_concluida: false, tomador_id: null,
    })
    for (const alvo of arrastados) {
      // A mesma trava do `do-outlook`: só a caixa que a pessoa ligou.
      if (alvo.caixa && alvo.caixa !== ms.conta) {
        recibos.push(falhou(`Este e-mail está na caixa ${alvo.caixa}, e a sua ligada ao CRM é ${ms.conta}.`, alvo.assunto))
        continue
      }
      if (alvo.bytes && alvo.bytes > MAX_BYTES_ARRASTO) {
        recibos.push(falhou(`O e-mail tem ${(alvo.bytes / 1024 / 1024).toFixed(1)} MB e o limite é 50 MB.`, alvo.assunto))
        continue
      }
      const baixado = await baixarMIME(ms.acesso, alvo.id)
      if (!baixado.ok) {
        recibos.push(falhou(baixado.erro, alvo.assunto))
        continue
      }
      recibos.push({
        ...(await juntarEmailAoCaso(supabase, {
          casoId: id, bruto: baixado.mime, autor, origem: 'graph',
          nomeArquivo: `${(alvo.assunto || 'e-mail').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').slice(0, 90).trim() || 'e-mail'}.eml`,
        })),
        assunto: alvo.assunto,
      })
    }
    const algum = recibos.find((r) => r.ok)
    if (!algum) return NextResponse.json({ erro: recibos.map((r) => r.erro).join(' · '), recibos }, { status: 422 })
    return NextResponse.json({ ...algum, recibos })
  }

  /* ── o arquivo do e-mail ─────────────────────────────────────────────── */
  let form: FormData
  try { form = await req.formData() } catch {
    return NextResponse.json({ erro: 'O e-mail não chegou inteiro. Passa de 50 MB?' }, { status: 413 })
  }
  const arquivo = form.get('email')
  if (!(arquivo instanceof File)) return NextResponse.json({ erro: 'Nenhum e-mail veio.' }, { status: 400 })
  if (arquivo.size > MAX_BYTES_EMAIL) {
    return NextResponse.json({ erro: `E-mail de ${(arquivo.size / 1024 / 1024).toFixed(1)} MB. O limite é 50 MB.` }, { status: 413 })
  }

  return resposta(await juntarEmailAoCaso(supabase, {
    casoId: id,
    bruto: Buffer.from(await arquivo.arrayBuffer()),
    nomeArquivo: arquivo.name,
    autor,
  }))
}
