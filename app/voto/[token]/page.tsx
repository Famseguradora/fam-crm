// ============================================================================
//  Cédula de Votação do Comitê — página pública (`/voto/<token>`)
//
//  Server Component: TODA a leitura acontece aqui, com service-role. O diretor
//  não tem sessão no CRM, então nada pode ser buscado do browser — a ilha
//  client (Cedula.tsx) recebe tudo pronto por props.
// ============================================================================
import { headers } from 'next/headers'
import { resolverConvite, registrarAbertura, ehBotDePreview, type MotivoInvalido } from '@/lib/comite/convites'
import { montarDossie, carregarComentarios } from '@/lib/comite/cedula-dados'
import { vigenciaTxt } from '@/lib/comite/calculo'
import { fmtMoeda, fmtPercent } from '@/lib/utils'
import Cedula from './Cedula'
import type { Usuario } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// O prazo NÃO pode ser derivado só de vigencia_anos: essa coluna guarda o valor
// na unidade escolhida em `periodicidade_vigencia` (22 com 'Meses' = 22 meses,
// não 22 anos). Quem resolve isso é vigenciaTxt() — a mesma função que as abas
// Cálculo e Dados usam, para a cédula não se contradizer.

const MSG_INVALIDO: Record<MotivoInvalido, { emoji: string; titulo: string; texto: string }> = {
  // Inexistente e revogado caem aqui juntos, de propósito: a tela não confirma
  // que um token existiu.
  inexistente: {
    emoji: '🔒',
    titulo: 'Link inválido',
    texto: 'Este link de votação não é válido ou foi cancelado. Peça um novo à Subscrição.',
  },
  expirado: {
    emoji: '⏳',
    titulo: 'Link expirado',
    texto: 'O prazo deste link terminou. Peça um novo à Subscrição para registrar seu voto.',
  },
  fora_de_comite: {
    emoji: '📋',
    titulo: 'Operação fora de Comitê',
    texto: 'Esta operação não está mais em fase de Comitê. Não há votação em andamento.',
  },
  encerrada: {
    emoji: '⚖️',
    titulo: 'Votação encerrada',
    texto: 'A bancada já concluiu o julgamento desta operação.',
  },
  em_vista: {
    emoji: '⏸️',
    titulo: 'Deliberação suspensa',
    texto: 'Um diretor pediu vista do processo. A votação está pausada até a retomada.',
  },
}

function TelaAviso({ motivo, parecerFinal }: { motivo: MotivoInvalido; parecerFinal?: string | null }) {
  const m = MSG_INVALIDO[motivo]
  return (
    <div className="voto-wrap">
      <div className="voto-brasao">
        <div className="voto-selo-topo">⚖️</div>
        <div className="voto-marca">FAM</div>
        <div className="voto-marca-sub">Seguradora</div>
      </div>
      <div className="voto-card">
        <div className="voto-card-topo" />
        <div className="voto-card-corpo" style={{ textAlign: 'center', padding: '38px 22px' }}>
          <div style={{ fontSize: 46, marginBottom: 14 }}>{m.emoji}</div>
          <div className="voto-selo-titulo">{m.titulo}</div>
          <p className="voto-selo-sub" style={{ marginTop: 8 }}>{m.texto}</p>
          {parecerFinal && (
            <div style={{ marginTop: 18, padding: '11px 15px', borderRadius: 11, background: '#f0f4f8', fontSize: 13.5 }}>
              Parecer final registrado: <strong>{parecerFinal}</strong>
            </div>
          )}
        </div>
      </div>
      <div className="voto-rodape">
        <strong>FAM Seguradora</strong> · Comitê de Subscrição
      </div>
    </div>
  )
}

export default async function PaginaVoto({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const res = await resolverConvite(token)

  if (!res.ok) {
    return <TelaAviso motivo={res.motivo} parecerFinal={res.operacao?.comite_parecer_final ?? null} />
  }

  const { convite, operacao, membros, votos, placar, anexoSubscricao, anexoCredito, diretor } = res.dados

  // Auditoria de abertura — detecta link repassado a terceiros. Ignora os bots
  // de preview do WhatsApp & cia., que abrem o link no instante do envio.
  const ua = (await headers()).get('user-agent')
  if (!ehBotDePreview(ua)) {
    await registrarAbertura(convite.id, !!convite.aberto_em)
  }

  // Só o necessário vai para o client. Nada de token de outros diretores,
  // e-mail, ou qualquer campo que a cédula não use.
  const bancada = membros.map((m: Usuario) => ({
    id: m.id,
    nome: m.nome,
    cargo: m.cargo ?? null,
    // NENHUM dígito do telefone vai para o browser. Uma "dica" com os 2 últimos
    // dígitos reduziria o espaço de busca do PIN de 10.000 para 100, porque os
    // 4 dígitos exigidos terminam exatamente nesses 2. Só o DDD é mostrado —
    // basta para o diretor lembrar qual número está cadastrado.
    ddd: (m.telefone ?? '').replace(/\D/g, '').slice(0, 2),
    temTelefone: !!(m.telefone ?? '').replace(/\D/g, ''),
    jaVotou: votos.some((v) => v.usuario_id === m.id),
  }))

  const meuVoto = diretor ? votos.find((v) => v.usuario_id === diretor.id) ?? null : null

  // ⚠ O dossiê SÓ é montado quando a identidade já está provada.
  //
  // Toda prop que um Server Component passa a um Client Component é serializada
  // no payload do Next dentro do próprio HTML. Se montássemos o dossiê aqui
  // para o link GERAL, o CPF dos sócios, os contatos do tomador, o cadastro da
  // corretora e as metas comerciais estariam no fonte da página para qualquer
  // um com a URL — sem digitar um dígito do PIN. A tela de identificação é um
  // early-return de renderização no client, NÃO uma barreira de dados.
  //
  // Link 'pessoal': o token já prova quem é → pode montar aqui.
  // Link 'operacao' (lista de transmissão): o dossiê só chega pela resposta de
  // /api/voto na ação 'identificar', depois de confereDigitos + pinBloqueado.
  const identificado = convite.escopo === 'pessoal' && !!diretor
  const [dossie, comentarios] = identificado
    ? await Promise.all([
        montarDossie(operacao, diretor.id),
        carregarComentarios(operacao.id, diretor.id),
      ])
    : [null, []]

  return (
    <Cedula
      token={token}
      escopo={convite.escopo}
      diretorId={diretor?.id ?? null}
      diretorNome={diretor?.nome ?? null}
      bancada={bancada}
      dossie={dossie}
      comentariosIniciais={comentarios}
      // Antes da identificação vai só o mínimo para a pessoa reconhecer QUAL
      // operação é (nome do tomador e modalidade). Valores, parecer e anexos
      // seguem o dossiê: só depois do PIN.
      operacao={identificado ? {
        tomador: operacao.tomador?.razao_social ?? 'Tomador',
        modalidade: operacao.modalidade ?? operacao.produto?.nome ?? '—',
        lmg: operacao.lmg ? fmtMoeda(operacao.lmg) : '—',
        premio: operacao.premio_previsto ? fmtMoeda(operacao.premio_previsto) : '—',
        taxa: operacao.taxa ? fmtPercent(operacao.taxa / 100) : '—',
        prazo: vigenciaTxt(operacao),
        parecer: operacao.parecer_subscricao ?? null,
        subscritor: operacao.subscritor_nome ?? null,
        votoSubscricao: operacao.voto_subscricao ?? null,
      } : {
        tomador: operacao.tomador?.razao_social ?? 'Tomador',
        modalidade: operacao.modalidade ?? operacao.produto?.nome ?? '—',
        lmg: '—', premio: '—', taxa: '—', prazo: '—',
        parecer: null, subscritor: null, votoSubscricao: null,
      }}
      docs={identificado ? {
        subscricao: anexoSubscricao
          ? { id: anexoSubscricao.id, nome: anexoSubscricao.nome_original, bytes: anexoSubscricao.tamanho_bytes }
          : null,
        credito: anexoCredito
          ? { id: anexoCredito.id, nome: anexoCredito.nome_original, bytes: anexoCredito.tamanho_bytes }
          : null,
      } : { subscricao: null, credito: null }}
      placarInicial={placar}
      votoExistente={
        meuVoto
          ? {
              voto: meuVoto.voto,
              argumentacao: meuVoto.argumentacao ?? '',
              segueSubscritor: meuVoto.segue_subscritor,
            }
          : null
      }
    />
  )
}
