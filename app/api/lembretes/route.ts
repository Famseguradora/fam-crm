// ============================================================================
//  /api/lembretes  ·  o lembrete do tomador, estilo Outlook/WhatsApp
//
//  GET    ?tomador_id=  ou  ?caso_id=   os lembretes, com quem acompanha e a trilha
//  POST   cria (quem cria já entra seguindo; os convidados recebem aviso na hora)
//  PATCH  { id, acao, ... }  editar · item · parcial · resolver · reabrir ·
//         cancelar · adiar · comentar · convidar · seguir · sair · visto
//
//  Pedido do Marco em 30/09/2026. Sessão + RLS: lê quem é do CRM, escreve quem
//  escreve. Toda mudança deixa um evento na trilha, com o nome de quem fez.
//  Resolvido total de um lembrete que repete já abre o próximo.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'
import { CATEGORIAS, RECORRENCIAS, statusDosItens, type ItemLembrete } from '@/lib/lembretes/regras'

export const runtime = 'nodejs'

const CAMPOS = 'id, tomador_id, caso_id, operacao_id, titulo, detalhe, categoria, area, quando, recorrencia, itens, status, prioridade, responsavel_auth_id, responsavel_nome, origem, resolucao, resolvido_em, resolvido_por, avisado_em, criado_por_nome, criado_em, atualizado_em, lembrete_seguidores(auth_id, nome, papel, visto_em, convidado_por), lembrete_eventos(id, tipo, texto, por_nome, criado_em)'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const texto = (v: unknown, max: number) => String(v ?? '').replace(/\s+$/g, '').trim().slice(0, max)

async function quem() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: u } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
  return { supabase, id: user.id, nome: (u as { nome: string | null } | null)?.nome ?? user.email ?? 'alguém' }
}

async function nomesDe(supabase: Awaited<ReturnType<typeof createClient>>, ids: string[]) {
  if (!ids.length) return new Map<string, string>()
  const { data } = await supabase.from('usuarios').select('auth_id, nome').in('auth_id', ids).eq('status', 'ativo')
  return new Map((data ?? []).map((u) => [u.auth_id as string, (u.nome as string) ?? '']))
}

export async function GET(req: NextRequest) {
  const eu = await quem()
  if (!eu) return NextResponse.json({ erro: 'Sessão expirada.' }, { status: 401 })
  const tomador = req.nextUrl.searchParams.get('tomador_id') ?? ''
  const caso = req.nextUrl.searchParams.get('caso_id') ?? ''
  const operacao = req.nextUrl.searchParams.get('operacao_id') ?? ''
  /* Os três endereços de um lembrete: o tomador, o caso (triagem) e a
     operação. A tela pede quantos tiver e recebe a união. Só UUID válido
     entra no filtro. */
  const filtros = [['tomador_id', tomador], ['caso_id', caso], ['operacao_id', operacao]]
    .filter(([, v]) => UUID.test(v)).map(([k, v]) => `${k}.eq.${v}`)
  if (!filtros.length) return NextResponse.json({ erro: 'Diga de qual tomador, caso ou operação.' }, { status: 422 })

  const { data, error } = await eu.supabase.from('lembretes').select(CAMPOS)
    .or(filtros.join(',')).order('quando', { ascending: true }).limit(300)
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  return NextResponse.json({ lembretes: data ?? [], eu: { id: eu.id, nome: eu.nome } })
}

export async function POST(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa
  const eu = await quem()
  if (!eu) return NextResponse.json({ erro: 'Sessão expirada.' }, { status: 401 })
  let c: Record<string, unknown> = {}
  try { c = await req.json() } catch { /* validação abaixo */ }

  let tomador_id = UUID.test(String(c.tomador_id ?? '')) ? String(c.tomador_id) : null
  const caso_id = UUID.test(String(c.caso_id ?? '')) ? String(c.caso_id) : null
  /* Lembrete criado dentro da OPERAÇÃO: fica ligado a ela e ao tomador dela,
     para aparecer também no card do tomador. O tomador vem do banco, não da tela. */
  let operacao_id: string | null = null
  if (UUID.test(String(c.operacao_id ?? ''))) {
    const { data: op } = await eu.supabase.from('operacoes').select('id, tomador_id').eq('id', String(c.operacao_id)).maybeSingle()
    if (!op) return NextResponse.json({ erro: 'Operação não encontrada.' }, { status: 404 })
    operacao_id = op.id as string
    tomador_id = (op.tomador_id as string | null) ?? tomador_id
  }
  if (!tomador_id && !caso_id) return NextResponse.json({ erro: 'O lembrete precisa de um tomador ou de um caso.' }, { status: 422 })
  const titulo = texto(c.titulo, 200)
  if (titulo.length < 2) return NextResponse.json({ erro: 'Escreva do que é o lembrete.' }, { status: 422 })
  const quando = new Date(String(c.quando ?? ''))
  if (Number.isNaN(quando.getTime())) return NextResponse.json({ erro: 'Escolha dia e hora do aviso.' }, { status: 422 })
  const categoria = CATEGORIAS.some((k) => k.id === c.categoria) ? String(c.categoria) : 'outro'
  const recorrencia = RECORRENCIAS.some((r) => r.id && r.id === c.recorrencia) ? String(c.recorrencia) : null
  const prioridade = ['baixa', 'normal', 'alta'].includes(String(c.prioridade)) ? String(c.prioridade) : 'normal'
  const itens: ItemLembrete[] = (Array.isArray(c.itens) ? c.itens : [])
    .map((i) => texto(i, 200)).filter(Boolean).slice(0, 30).map((nome) => ({ nome, ok: false, em: null }))

  const convidados = (Array.isArray(c.seguidores) ? c.seguidores : []).map(String).filter((x) => UUID.test(x)).slice(0, 30)
  const respId = UUID.test(String(c.responsavel_auth_id ?? '')) ? String(c.responsavel_auth_id) : eu.id
  const nomes = await nomesDe(eu.supabase, [...new Set([respId, ...convidados])])
  if (!nomes.has(respId) && respId !== eu.id) return NextResponse.json({ erro: 'O responsável não é um usuário ativo do CRM.' }, { status: 422 })

  const { data: l, error } = await eu.supabase.from('lembretes').insert({
    tomador_id, caso_id, operacao_id, titulo, detalhe: texto(c.detalhe, 2000) || null, categoria, quando: quando.toISOString(),
    recorrencia, prioridade, itens, responsavel_auth_id: respId, responsavel_nome: nomes.get(respId) ?? eu.nome,
    origem: 'humano', criado_por_auth_id: eu.id, criado_por_nome: eu.nome,
  }).select('id').single()
  if (error || !l) return NextResponse.json({ erro: error?.message ?? 'Sem permissão para criar lembrete.' }, { status: 403 })

  /* Quem acompanha: quem criou, o responsável e os convidados. O convite de
     cada colega vira notificação na hora (gatilho no banco). */
  const pessoas = new Map<string, { nome: string; papel: string }>()
  pessoas.set(eu.id, { nome: eu.nome, papel: respId === eu.id ? 'responsavel' : 'seguidor' })
  if (respId !== eu.id) pessoas.set(respId, { nome: nomes.get(respId) ?? '', papel: 'responsavel' })
  for (const id of convidados) if (!pessoas.has(id) && nomes.has(id)) pessoas.set(id, { nome: nomes.get(id)!, papel: 'seguidor' })
  await eu.supabase.from('lembrete_seguidores').insert([...pessoas].map(([auth_id, p]) => ({
    lembrete_id: l.id, auth_id, nome: p.nome, papel: p.papel,
    convidado_por: auth_id === eu.id ? null : eu.nome, convidado_por_auth_id: auth_id === eu.id ? null : eu.id,
  })))
  await eu.supabase.from('lembrete_eventos').insert({
    lembrete_id: l.id, tipo: 'criado', por_nome: eu.nome, por_auth_id: eu.id,
    texto: `Criado para ${quando.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}` +
      (pessoas.size > 1 ? `, com ${[...pessoas.values()].filter((p) => p.nome !== eu.nome).map((p) => p.nome).join(', ')}` : '') + '.',
  })
  return NextResponse.json({ ok: true, id: l.id })
}

export async function PATCH(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa
  const eu = await quem()
  if (!eu) return NextResponse.json({ erro: 'Sessão expirada.' }, { status: 401 })
  let c: Record<string, unknown> = {}
  try { c = await req.json() } catch { /* validação abaixo */ }
  const id = String(c.id ?? '')
  const acao = String(c.acao ?? '')
  if (!UUID.test(id)) return NextResponse.json({ erro: 'Qual lembrete?' }, { status: 422 })

  const sb = eu.supabase
  const { data: l } = await sb.from('lembretes').select('*').eq('id', id).maybeSingle()
  if (!l) return NextResponse.json({ erro: 'Lembrete não encontrado.' }, { status: 404 })
  const agora = new Date().toISOString()
  const nota = texto(c.nota, 1000)
  const evento = (tipo: string, t: string) =>
    sb.from('lembrete_eventos').insert({ lembrete_id: id, tipo, texto: t, por_nome: eu.nome, por_auth_id: eu.id })
  /* Escrita barrada por RLS volta sem linha e sem erro: a resposta é o que voltou. */
  const mudar = async (campos: Record<string, unknown>) => {
    const { data, error } = await sb.from('lembretes').update(campos).eq('id', id).select('id')
    if (error) return error.message
    if (!data?.length) return 'Você não tem permissão de escrita no CRM.'
    return null
  }
  const itensAtuais = (Array.isArray(l.itens) ? l.itens : []) as ItemLembrete[]

  if (acao === 'comentar') {
    const t = texto(c.texto, 2000)
    if (!t) return NextResponse.json({ erro: 'Escreva o comentário.' }, { status: 422 })
    const { error } = await evento('comentario', t)
    return error ? NextResponse.json({ erro: error.message }, { status: 403 }) : NextResponse.json({ ok: true })
  }

  if (acao === 'visto') {
    await sb.from('lembrete_seguidores').update({ visto_em: agora }).eq('lembrete_id', id).eq('auth_id', eu.id)
    return NextResponse.json({ ok: true })
  }

  if (acao === 'seguir') {
    const { error } = await sb.from('lembrete_seguidores').upsert({ lembrete_id: id, auth_id: eu.id, nome: eu.nome, papel: 'seguidor' }, { onConflict: 'lembrete_id,auth_id', ignoreDuplicates: true })
    if (error) return NextResponse.json({ erro: error.message }, { status: 403 })
    await evento('convite', `${eu.nome} passou a acompanhar.`)
    return NextResponse.json({ ok: true })
  }

  if (acao === 'sair') {
    if (l.responsavel_auth_id === eu.id) return NextResponse.json({ erro: 'Você é o responsável. Passe a responsabilidade para outra pessoa antes de sair.' }, { status: 409 })
    await sb.from('lembrete_seguidores').delete().eq('lembrete_id', id).eq('auth_id', eu.id)
    await evento('saiu', `${eu.nome} deixou de acompanhar.`)
    return NextResponse.json({ ok: true })
  }

  if (acao === 'convidar') {
    const ids = (Array.isArray(c.pessoas) ? c.pessoas : []).map(String).filter((x) => UUID.test(x)).slice(0, 30)
    const nomes = await nomesDe(sb, ids)
    const novos = ids.filter((x) => nomes.has(x))
    if (!novos.length) return NextResponse.json({ erro: 'Escolha pelo menos um colega.' }, { status: 422 })
    const { error } = await sb.from('lembrete_seguidores').upsert(
      novos.map((auth_id) => ({ lembrete_id: id, auth_id, nome: nomes.get(auth_id), papel: 'seguidor', convidado_por: eu.nome, convidado_por_auth_id: eu.id })),
      { onConflict: 'lembrete_id,auth_id', ignoreDuplicates: true },
    )
    if (error) return NextResponse.json({ erro: error.message }, { status: 403 })
    await evento('convite', `${eu.nome} chamou ${novos.map((x) => nomes.get(x)).join(', ')}.`)
    return NextResponse.json({ ok: true })
  }

  if (acao === 'adiar') {
    const minutos = Math.max(15, Math.min(60 * 24 * 90, Number(c.minutos) || 0))
    const base = Math.max(Date.now(), new Date(l.quando).getTime())
    const novo = new Date(base + minutos * 60000).toISOString()
    const erro = await mudar({ quando: novo })
    if (erro) return NextResponse.json({ erro }, { status: 403 })
    await evento('adiado', `Adiado para ${new Date(novo).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}${nota ? `: ${nota}` : '.'}`)
    return NextResponse.json({ ok: true })
  }

  if (acao === 'item') {
    const nome = texto(c.nome, 200)
    const itens = itensAtuais.map((i) => (i.nome === nome ? { ...i, ok: !!c.ok, em: c.ok ? agora : null, por: eu.nome } : i))
    if (!itens.some((i) => i.nome === nome)) return NextResponse.json({ erro: 'Item não encontrado.' }, { status: 404 })
    const st = statusDosItens(itens)
    const campos: Record<string, unknown> = { itens }
    if (st && l.status !== 'cancelado') {
      campos.status = st
      if (st === 'resolvido') { campos.resolvido_em = agora; campos.resolvido_por = eu.nome }
      else { campos.resolvido_em = null; campos.resolvido_por = null }
    }
    const erro = await mudar(campos)
    if (erro) return NextResponse.json({ erro }, { status: 403 })
    await evento(st === 'resolvido' ? 'resolvido' : 'parcial', `${c.ok ? 'Chegou' : 'Voltou a faltar'}: ${nome}.`)
    // Marcar o último item também é "resolvido total": se repete, o próximo nasce.
    const proximo = st === 'resolvido' && l.recorrencia ? (await sb.rpc('lembrete_repetir', { p_id: id })).data : null
    return NextResponse.json({ ok: true, proximo })
  }

  if (acao === 'parcial') {
    if (!nota) return NextResponse.json({ erro: 'Diga o que foi resolvido e o que ainda falta.' }, { status: 422 })
    const erro = await mudar({ status: 'parcial', resolucao: nota, resolvido_em: null, resolvido_por: null })
    if (erro) return NextResponse.json({ erro }, { status: 403 })
    await evento('parcial', `Resolvido parcial: ${nota}`)
    return NextResponse.json({ ok: true })
  }

  if (acao === 'resolver') {
    // Dois cliques (ou duas pessoas) não resolvem duas vezes.
    if (l.status === 'resolvido') return NextResponse.json({ erro: 'Este lembrete já está resolvido.' }, { status: 409 })
    const erro = await mudar({
      status: 'resolvido', resolvido_em: agora, resolvido_por: eu.nome, resolucao: nota || null,
      itens: itensAtuais.map((i) => (i.ok ? i : { ...i, ok: true, em: agora, por: eu.nome })),
    })
    if (erro) return NextResponse.json({ erro }, { status: 403 })
    await evento('resolvido', nota ? `Resolvido: ${nota}` : 'Resolvido.')

    /* REPETE: o próximo nasce no banco (`lembrete_repetir`), com as mesmas
       pessoas e a data contada no calendário de São Paulo. */
    const proximo = l.recorrencia ? (await sb.rpc('lembrete_repetir', { p_id: id })).data : null
    return NextResponse.json({ ok: true, proximo })
  }

  if (acao === 'reabrir' || acao === 'cancelar') {
    // Reaberto volta para o que os itens dizem, e nunca para "resolvido".
    const pelosItens = statusDosItens(itensAtuais)
    const erro = await mudar(acao === 'reabrir'
      ? { status: pelosItens && pelosItens !== 'resolvido' ? pelosItens : 'aberto', resolvido_em: null, resolvido_por: null }
      : { status: 'cancelado', resolucao: nota || null, resolvido_em: agora, resolvido_por: eu.nome })
    if (erro) return NextResponse.json({ erro }, { status: 403 })
    await evento(acao === 'reabrir' ? 'reaberto' : 'cancelado', acao === 'reabrir' ? 'Reaberto.' : `Cancelado${nota ? `: ${nota}` : '.'}`)
    return NextResponse.json({ ok: true })
  }

  if (acao === 'editar') {
    const campos: Record<string, unknown> = {}
    const mudou: string[] = []
    if (c.titulo !== undefined) { const t = texto(c.titulo, 200); if (t.length < 2) return NextResponse.json({ erro: 'O título ficou vazio.' }, { status: 422 }); if (t !== l.titulo) { campos.titulo = t; mudou.push('título') } }
    if (c.detalhe !== undefined) { const t = texto(c.detalhe, 2000) || null; if (t !== l.detalhe) { campos.detalhe = t; mudou.push('detalhe') } }
    if (c.categoria !== undefined && CATEGORIAS.some((k) => k.id === c.categoria) && c.categoria !== l.categoria) { campos.categoria = c.categoria; mudou.push('categoria') }
    if (c.prioridade !== undefined && ['baixa', 'normal', 'alta'].includes(String(c.prioridade)) && c.prioridade !== l.prioridade) { campos.prioridade = c.prioridade; mudou.push('prioridade') }
    if (c.recorrencia !== undefined) { const r = RECORRENCIAS.some((x) => x.id && x.id === c.recorrencia) ? String(c.recorrencia) : null; if (r !== l.recorrencia) { campos.recorrencia = r; mudou.push('repetição') } }
    if (c.quando !== undefined) {
      const q = new Date(String(c.quando))
      if (Number.isNaN(q.getTime())) return NextResponse.json({ erro: 'Data do aviso inválida.' }, { status: 422 })
      if (q.toISOString() !== new Date(l.quando).toISOString()) { campos.quando = q.toISOString(); mudou.push('data do aviso') }
    }
    if (c.responsavel_auth_id !== undefined && UUID.test(String(c.responsavel_auth_id)) && c.responsavel_auth_id !== l.responsavel_auth_id) {
      const nomes = await nomesDe(sb, [String(c.responsavel_auth_id)])
      const nome = nomes.get(String(c.responsavel_auth_id))
      if (!nome) return NextResponse.json({ erro: 'O responsável não é um usuário ativo do CRM.' }, { status: 422 })
      campos.responsavel_auth_id = c.responsavel_auth_id; campos.responsavel_nome = nome; mudou.push(`responsável (${nome})`)
    }
    if (Array.isArray(c.itens)) {
      const nomes = c.itens.map((i) => texto(i, 200)).filter(Boolean).slice(0, 30)
      const itens = nomes.map((nome) => itensAtuais.find((i) => i.nome === nome) ?? { nome, ok: false, em: null })
      if (JSON.stringify(itens) !== JSON.stringify(itensAtuais)) { campos.itens = itens; mudou.push('itens') }
    }
    if (!mudou.length) return NextResponse.json({ ok: true, nada: true })
    const erro = await mudar(campos)
    if (erro) return NextResponse.json({ erro }, { status: 403 })
    // Quem acompanha só muda depois que o lembrete gravou (a RLS pode barrar).
    if (campos.responsavel_auth_id) {
      await sb.from('lembrete_seguidores').update({ papel: 'seguidor' }).eq('lembrete_id', id).eq('papel', 'responsavel')
      await sb.from('lembrete_seguidores').upsert({ lembrete_id: id, auth_id: campos.responsavel_auth_id, papel: 'responsavel', convidado_por_auth_id: eu.id }, { onConflict: 'lembrete_id,auth_id' })
    }
    await evento('editado', `Editou ${mudou.join(', ')}.`)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ erro: `Ação desconhecida: "${acao}".` }, { status: 422 })
}
