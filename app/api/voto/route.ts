// ============================================================================
//  Voto por cédula (link) — `/api/voto`
//
//  Rota PÚBLICA (liberada no proxy.ts). Não confia em NADA vindo do client:
//  token, identidade e estado da operação são revalidados a cada chamada.
//  Espelha registrarVotoWhats() de app/api/whatsapp/webhook/route.ts, que é o
//  caminho de voto mais defendido do sistema.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import {
  resolverConvite, adminClient, confereDigitos, registrarAcesso, tokenCurto,
  pinBloqueado, JANELA_MINUTOS,
} from '@/lib/comite/convites'
import { calcularPlacar, membrosComite, resolverVotoSeguindo } from '@/lib/comite/votacao'
import { montarDossie, carregarComentarios } from '@/lib/comite/cedula-dados'
import { vigenciaTxt } from '@/lib/comite/calculo'
import { fmtMoeda, fmtPercent } from '@/lib/utils'
import type { VotoComite, Usuario, ComiteVoto } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VOTOS_VALIDOS: VotoComite[] = ['aprovado', 'aprovado_ressalva', 'reprovado']

interface Corpo {
  acao?: 'identificar' | 'votar' | 'comentar'
  token?: string
  usuarioId?: string
  digitos?: string
  opcao?: VotoComite | 'segue'
  argumentacao?: string | null
  comentario?: string
}

const ACOES = ['identificar', 'votar', 'comentar'] as const

function erro(msg: string, status = 400) {
  return NextResponse.json({ ok: false, erro: msg }, { status })
}

export async function POST(request: NextRequest) {
  let body: Corpo
  try {
    body = await request.json()
  } catch {
    return erro('Requisição inválida.')
  }

  const { acao, token, usuarioId, digitos } = body
  if (!token || !usuarioId || !acao || !ACOES.includes(acao)) {
    return erro('Requisição inválida.')
  }

  const res = await resolverConvite(token)
  if (!res.ok) {
    const msgs: Record<string, string> = {
      inexistente: 'Link inválido ou cancelado.',
      expirado: 'Este link expirou. Peça um novo à Subscrição.',
      fora_de_comite: 'Esta operação não está mais em Comitê.',
      encerrada: 'A votação desta operação já foi encerrada.',
      em_vista: 'A deliberação está suspensa por pedido de vista.',
    }
    return erro(msgs[res.motivo] ?? 'Link indisponível.', 403)
  }

  const { convite, membros, votos, operacao, anexoSubscricao, anexoCredito } = res.dados
  const req = {
    ip: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  }

  // ── Identidade ────────────────────────────────────────────────────────────
  // O usuário precisa ser membro ATIVO da bancada AGORA — a flag `comite` pode
  // ter sido revogada depois de o convite ter sido emitido.
  const membro = membros.find((m: Usuario) => m.id === usuarioId)
  if (!membro) {
    await registrarAcesso(convite.id, null, false, 'nao_e_membro', req)
    return erro('Você não consta na bancada desta operação.', 403)
  }

  if (convite.escopo === 'pessoal') {
    // Link pessoal: o próprio token já prova a identidade.
    if (convite.usuario_id !== usuarioId) {
      await registrarAcesso(convite.id, usuarioId, false, 'usuario_diverge_do_convite', req)
      return erro('Este link pertence a outro diretor.', 403)
    }
  } else {
    // Link geral (lista de transmissão): exige os 4 últimos dígitos do celular.
    // Trava antes de conferir — o atacante não ganha nem o sinal de acerto.
    if (await pinBloqueado(convite.id)) {
      await registrarAcesso(convite.id, usuarioId, false, 'bloqueado_por_tentativas', req)
      console.warn(`[voto] PIN bloqueado por tentativas: token=${tokenCurto(token)}`)
      return erro(
        `Muitas tentativas incorretas. Aguarde ${JANELA_MINUTOS} minutos ou peça um novo link à Subscrição.`,
        429,
      )
    }
    if (!confereDigitos(membro.telefone ?? null, digitos ?? '')) {
      await registrarAcesso(convite.id, usuarioId, false, 'digitos_incorretos', req)
      console.warn(`[voto] dígitos incorretos: token=${tokenCurto(token)} usuario=${usuarioId}`)
      return erro('Dígitos não conferem com o celular cadastrado.', 403)
    }
  }

  const votoAtual = (votos as ComiteVoto[]).find((v) => v.usuario_id === usuarioId) ?? null

  // ── Ação: identificar ─────────────────────────────────────────────────────
  // Só AQUI o dossiê é montado para o link geral — depois de confereDigitos e
  // pinBloqueado. É o que impede o CPF dos sócios, os contatos do tomador e as
  // metas comerciais de irem para o HTML de quem só tem a URL.
  if (acao === 'identificar') {
    await registrarAcesso(convite.id, usuarioId, true, 'identificado', req)

    const [dossie, comentarios] = await Promise.all([
      montarDossie(operacao, usuarioId),
      carregarComentarios(operacao.id, usuarioId),
    ])

    return NextResponse.json({
      ok: true,
      nome: membro.nome,
      dossie,
      comentarios,
      operacao: {
        tomador: operacao.tomador?.razao_social ?? 'Tomador',
        modalidade: operacao.modalidade ?? operacao.produto?.nome ?? '—',
        lmg: operacao.lmg ? fmtMoeda(operacao.lmg) : '—',
        premio: operacao.premio_previsto ? fmtMoeda(operacao.premio_previsto) : '—',
        taxa: operacao.taxa ? fmtPercent(operacao.taxa / 100) : '—',
        prazo: vigenciaTxt(operacao),
        parecer: operacao.parecer_subscricao ?? null,
        subscritor: operacao.subscritor_nome ?? null,
        votoSubscricao: operacao.voto_subscricao ?? null,
      },
      docs: {
        subscricao: anexoSubscricao
          ? { id: anexoSubscricao.id, nome: anexoSubscricao.nome_original, bytes: anexoSubscricao.tamanho_bytes }
          : null,
        credito: anexoCredito
          ? { id: anexoCredito.id, nome: anexoCredito.nome_original, bytes: anexoCredito.tamanho_bytes }
          : null,
      },
      votoExistente: votoAtual
        ? {
            voto: votoAtual.voto,
            argumentacao: votoAtual.argumentacao,
            segueSubscritor: votoAtual.segue_subscritor,
          }
        : null,
    })
  }

  // ── Ação: comentar ────────────────────────────────────────────────────────
  // Debate da bancada, independente do voto: o diretor pode comentar sem votar
  // e comentar quantas vezes quiser. Fica visível para todos, aqui e no CRM.
  if (acao === 'comentar') {
    const txt = (body.comentario ?? '').toString().trim().slice(0, 2000)
    if (!txt) return erro('Comentário vazio.')

    const supabase = adminClient()
    const { data: novo, error: erroCom } = await supabase
      .from('comite_comentarios')
      .insert({
        operacao_id: operacao.id,
        usuario_id: usuarioId,
        autor: membro.nome,
        cargo: membro.cargo ?? null,
        comentario: txt,
        tipo: 'geral',
        canal: 'link',
      })
      .select('*')
      .maybeSingle()

    if (erroCom || !novo) {
      console.error('[voto] falha ao comentar:', erroCom?.message)
      return erro('Não consegui publicar seu comentário.', 500)
    }

    await registrarAcesso(convite.id, usuarioId, true, 'comentario', req)

    return NextResponse.json({
      ok: true,
      comentario: {
        id: novo.id,
        autor: novo.autor,
        cargo: novo.cargo ?? null,
        comentario: novo.comentario,
        quando: new Date(novo.created_at).toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        }),
        ehMeu: true,
      },
    })
  }

  // ── Ação: votar ───────────────────────────────────────────────────────────
  const opcao = body.opcao
  const voto: VotoComite | null =
    opcao === 'segue'
      ? resolverVotoSeguindo(operacao.voto_subscricao ?? null)
      : VOTOS_VALIDOS.includes(opcao as VotoComite)
        ? (opcao as VotoComite)
        : null
  if (!voto) return erro('Voto inválido.')

  const supabase = adminClient()
  const argumentacao = (body.argumentacao ?? '').toString().trim().slice(0, 2000) || null

  // Reconfirma o estado NO BANCO no instante da escrita (o resolverConvite leu
  // há alguns milissegundos; a operação pode ter sido encerrada nesse meio).
  const { data: opAgora } = await supabase
    .from('operacoes')
    .select('id')
    .eq('id', operacao.id)
    .eq('status', 'Comitê')
    .eq('comite_encerrado', false)
    .is('comite_vista_por', null)
    .maybeSingle()
  if (!opAgora) return erro('A votação foi encerrada ou suspensa. Seu voto não foi registrado.', 409)

  // Retratação: arquiva o voto anterior antes de sobrescrever — mesma trilha
  // de auditoria do CRM e do WhatsApp.
  if (votoAtual) {
    await supabase.from('comite_votos_historico').insert({
      operacao_id: votoAtual.operacao_id,
      usuario_id: votoAtual.usuario_id,
      autor: votoAtual.autor,
      cargo: votoAtual.cargo,
      voto: votoAtual.voto,
      segue_subscritor: votoAtual.segue_subscritor,
      argumentacao: votoAtual.argumentacao,
      canal: votoAtual.canal,
      votado_em: votoAtual.created_at,
    })
  }

  const { error: erroVoto } = await supabase.from('comite_votos').upsert(
    {
      operacao_id: operacao.id,
      usuario_id: usuarioId,
      autor: membro.nome,
      cargo: membro.cargo ?? null,
      voto,
      segue_subscritor: opcao === 'segue',
      argumentacao,
      canal: 'link',
    },
    { onConflict: 'operacao_id,usuario_id' },
  )
  if (erroVoto) {
    console.error('[voto] falha ao gravar:', erroVoto.message)
    return erro('Não consegui registrar seu voto. Tente novamente.', 500)
  }

  // Recalcula o placar com a MESMA função do CRM/WhatsApp — fonte única.
  const [{ data: votosAgora }, { data: usuariosAgora }] = await Promise.all([
    supabase.from('comite_votos').select('*').eq('operacao_id', operacao.id),
    supabase.from('usuarios').select('*').eq('comite', true).eq('status', 'ativo'),
  ])
  const placar = calcularPlacar(
    (votosAgora ?? []) as ComiteVoto[],
    membrosComite((usuariosAgora ?? []) as Usuario[]),
  )

  if (placar.completo && placar.parecerFinal) {
    await supabase
      .from('operacoes')
      .update({ comite_parecer_final: placar.parecerFinal, comite_encerrado: true })
      .eq('id', operacao.id)
  }

  await Promise.all([
    supabase.from('comite_convites').update({ votado_em: new Date().toISOString() }).eq('id', convite.id),
    registrarAcesso(convite.id, usuarioId, true, `voto:${voto}`, req),
  ])

  return NextResponse.json({
    ok: true,
    voto,
    placar,
    parecerFinal: placar.completo ? placar.parecerFinal : null,
  })
}
