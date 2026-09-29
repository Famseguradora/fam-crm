'use client'

// ============================================================================
//  O FLUXO POR ÁREA, SÓ DE LEITURA  ·  "como está o tomador"
//
//  Ordem dele em 29/09/2026, olhando o formulário de Comercial aberto dentro do
//  tomador: "essa parte ai, não vou preencher, assim como ninguém vai preencher.
//  O sistema já reconhece quando mudamos de área." Então esta aba deixou de ser
//  lugar de ESCREVER e virou o RETRATO: onde o card está e o que cada área já
//  deixou de resultado. Clicou numa área, aparece o que ela produziu (no
//  Crédito, o relatório da análise), sempre só visual.
//
//  O QUE FICOU DE FORA, de propósito: temperatura para escolher, registro para
//  digitar, Concluir, Reabrir, Paralisar e a conversa entre áreas. O componente
//  antigo (components/tomador/SecoesDoCard.tsx) continua no repositório, inteiro:
//  voltar é trocar uma linha na página do tomador.
//
//  DE ONDE VEM CADA RESULTADO
//   • Comercial ........... cadastro do tomador + o que a seção tiver gravado
//   • Cadastro e triagem .. arquivos do tomador contra caso_item_catalogo
//   • Crédito ............. a análise vigente (a mesma ficha da aba Análise)
//   • Subscrição .......... taxa e voto, que moram na OPERAÇÃO
//   • Emissão ............. só as operações Emitido (os três mundos não se
//                           somam: ver o cabeçalho de lib/ia/robo.ts)
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Operacao, Tomador } from '@/types'
import { fmtData, fmtMoeda, fmtMoedaCurta } from '@/lib/utils'
import { cor, texto, botaoVazado } from '@/lib/ui/painel'
import { CartaoNumero, GradeCartoes, Moldura, Aviso } from '@/components/painel/Painel'
import ReguaDoCard from '@/components/card/ReguaDoCard'
import { SecaoAnalise, SecaoTresCs, SecaoSerasa, fmtScore } from '@/components/analise/Relatorio'
import type { FichaAnalise } from '@/lib/analise/ficha'
import { OrigemDoCard, FichaDoCadastro } from '@/components/tomador/RetratoAreas'
import {
  REGUA, nomeArea, temItem, ESPERAM_SUBSCRICAO,
  type PostoCentral, type Secao, type EventoCard, type ItemCatalogo,
} from '@/lib/card/secoes'

interface Props {
  tomador: Tomador
  tomadorId: string
  cnpj: string | null
  /** onde o card está (etapaDoCard: a central corrigida pela esteira) */
  etapa: PostoCentral
  corretora: string | null
  dataEntrada: string | null
  operacoes: Operacao[]
  ficha: FichaAnalise | null
  /** a ficha acima é da holding vinculada, e não do próprio tomador */
  fichaDaHolding?: string | null
}

type Momento = 'passou' | 'aqui' | 'adiante'

const pctTaxa = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === '' ? null : `${Number(v).toFixed(2).replace('.', ',')}%`

export default function RetratoDoFluxo({
  tomador, tomadorId, cnpj, etapa, corretora, dataEntrada, operacoes, ficha, fichaDaHolding,
}: Props) {
  const router = useRouter()
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [eventos, setEventos] = useState<EventoCard[]>([])
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([])
  const [arquivos, setArquivos] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)
  // Abre na área onde o card está: é a pergunta que traz alguém aqui.
  const [vendo, setVendo] = useState<PostoCentral | null>(etapa)
  const [historicoTodo, setHistoricoTodo] = useState(false)

  useEffect(() => {
    let vivo = true
    const supabase = createClient()
    Promise.all([
      supabase.from('card_secoes').select('*').eq('tomador_id', tomadorId),
      supabase.from('card_eventos').select('*').eq('tomador_id', tomadorId).eq('tipo', 'evento')
        .order('criado_em', { ascending: false }).limit(60),
      supabase.from('caso_item_catalogo').select('*').eq('ativo', true).order('ordem'),
      supabase.from('anexos').select('nome_original').eq('tomador_id', tomadorId),
      supabase.from('analise_documentos').select('nome').eq('tomador_id', tomadorId),
    ]).then(([secs, evs, cat, anx, docs]) => {
      if (!vivo) return
      setSecoes((secs.data ?? []) as Secao[])
      setEventos((evs.data ?? []) as EventoCard[])
      setCatalogo((cat.data ?? []) as ItemCatalogo[])
      setArquivos([
        ...((anx.data ?? []) as { nome_original: string }[]).map(a => a.nome_original),
        ...((docs.data ?? []) as { nome: string }[]).map(d => d.nome),
      ])
      setCarregando(false)
    })
    return () => { vivo = false }
  }, [tomadorId])

  const secao = (p: PostoCentral) => secoes.find(s => s.area === p)
  const momento = (p: PostoCentral): Momento => {
    const i = REGUA.indexOf(p), a = REGUA.indexOf(etapa)
    return i < a ? 'passou' : i === a ? 'aqui' : 'adiante'
  }
  const onde = (p: PostoCentral) => {
    const m = momento(p)
    return m === 'aqui' ? 'está aqui' : m === 'passou' ? 'já passou' : 'ainda não chegou'
  }

  // ── o resultado de cada área, calculado do dado (nunca digitado) ──
  // Os documentos que a análise leu também contam: é a mesma pasta do tomador.
  const docs = useMemo(() => {
    const todos = [...arquivos, ...(ficha?.documentos ?? []).map(d => d.nome)]
    return catalogo.map(item => ({ item, tem: temItem(item, todos) }))
  }, [catalogo, arquivos, ficha])
  const faltaTrava = docs.filter(d => !d.tem && d.item.exigencia === 'bloqueia')
  const recebidos = docs.filter(d => d.tem).length

  const emSubscricao = operacoes.filter(o => ESPERAM_SUBSCRICAO.has(o.status ?? ''))
  const comVoto = emSubscricao.filter(o => o.taxa && o.voto_subscricao)
  const emitidas = operacoes.filter(o => o.status === 'Emitido')
  const lmgEmitido = emitidas.reduce((s, o) => s + (Number(o.lmg) || 0), 0)

  const temperatura = String(secao('comercial')?.campos?.['temperatura'] ?? '') || null
  const paralisada = secoes.find(s => s.paralisa) ?? null
  const juridico = secao('juridico')

  const resumo: Record<PostoCentral, { numero: string; sub: string; alerta?: boolean }> = {
    comercial: {
      numero: temperatura ?? corretora ?? '—',
      sub: [temperatura ? corretora : 'corretora', dataEntrada ? `desde ${fmtData(dataEntrada)}` : null].filter(Boolean).join(' · '),
    },
    cadastro: {
      numero: catalogo.length ? `${recebidos} de ${catalogo.length}` : '—',
      sub: !cnpj ? 'sem CNPJ no cadastro'
        : faltaTrava.length ? `falta ${faltaTrava.length} que trava` : 'documentos que travam: ok',
      alerta: !cnpj || (faltaTrava.length > 0 && momento('cadastro') === 'aqui'),
    },
    credito: ficha ? {
      numero: ficha.recomendacao ?? 'Sem decisão',
      sub: [ficha.rating_cod && `rating ${ficha.rating_cod}`, `score ${fmtScore(ficha.score_final)}`, fmtData(ficha.data_analise)]
        .filter(Boolean).join(' · '),
      alerta: /reprov|recus/i.test(ficha.recomendacao ?? ''),
    } : { numero: 'Sem análise', sub: 'nenhuma publicada para este CNPJ' },
    subscricao: {
      numero: emSubscricao.length ? `${comVoto.length} de ${emSubscricao.length}` : '—',
      sub: emSubscricao.length ? 'operações com taxa e voto' : 'nenhuma operação esperando',
    },
    emissao: {
      numero: String(emitidas.length),
      sub: emitidas.length ? `apólices · ${fmtMoedaCurta(lmgEmitido)} em LMG` : 'nenhuma apólice emitida',
    },
    juridico: { numero: '—', sub: '' },
  }

  // A frase do topo: onde está, e o resultado mais recente que já existe.
  const frase = (() => {
    const partes: string[] = [`Está em ${nomeArea(etapa)}`]
    if (ficha) {
      partes.push(`a análise de ${fmtData(ficha.data_analise)} ${ficha.recomendacao ? `recomenda ${ficha.recomendacao.toLowerCase()}` : 'não registrou decisão'}`
        + (ficha.limiteNum ? `, com limite de ${fmtMoedaCurta(ficha.limiteNum)}` : ''))
    }
    if (emitidas.length) partes.push(`${emitidas.length} apólice${emitidas.length > 1 ? 's' : ''} emitida${emitidas.length > 1 ? 's' : ''}`)
    return partes.join(' · ')
  })()

  const alternar = (p: PostoCentral) => setVendo(v => (v === p ? null : p))

  return (
    <div>
      {/* ══ onde está ══ */}
      <div className="cs-painel">
        <div style={{ ...texto.titulo, fontSize: 14 }}>{frase}</div>
        <div style={{ ...texto.apoio, marginTop: 3 }}>
          A etapa anda sozinha com a esteira. Clique numa área para ver o que ela deixou.
        </div>

        <ReguaDoCard
          atual={etapa}
          vendo={vendo}
          estados={Object.fromEntries(REGUA.map(p => [p, secao(p)?.paralisa ? 'parada' : momento(p) === 'passou' ? 'feita' : null]))}
          legenda={onde}
          aoEscolher={p => setVendo(p)}
        />

        {paralisada && (
          <Aviso tom="erro">
            <b>{nomeArea(paralisada.area)} paralisou o fluxo</b>
            {paralisada.paralisa_por ? ` (${paralisada.paralisa_por})` : ''}: “{paralisada.paralisa_motivo || 'sem motivo escrito'}”.
          </Aviso>
        )}
        {!paralisada && juridico && juridico.estado !== 'dormente' && (
          <Aviso>O Jurídico foi acionado neste card{juridico.texto ? `: “${juridico.texto}”` : '.'}</Aviso>
        )}
      </div>

      {/* ══ o resultado de cada área ══ */}
      <div style={{ marginTop: 14 }}>
        <GradeCartoes minimo={170} detalhe={vendo && (
          <Detalhe
            tomador={tomador} posto={vendo} onde={onde(vendo)} secao={secao(vendo)} carregando={carregando}
            corretora={corretora} temperatura={temperatura} docs={docs} ficha={ficha} fichaDaHolding={fichaDaHolding ?? null}
            emSubscricao={emSubscricao} emitidas={emitidas} lmgEmitido={lmgEmitido}
            fechar={() => setVendo(null)}
            abrirRelatorio={ficha ? () => router.push(`/analises/${ficha.id}`) : undefined}
          />
        )}>
          {REGUA.map(p => (
            <CartaoNumero key={p}
              rotulo={`${nomeArea(p)} · ${onde(p)}`}
              numero={carregando && (p === 'comercial' || p === 'cadastro') ? '…' : resumo[p].numero}
              sub={resumo[p].sub}
              alerta={resumo[p].alerta}
              aberto={vendo === p}
              aoAlternar={() => alternar(p)}
              compacto
            />
          ))}
        </GradeCartoes>
      </div>

      {/* ══ o que aconteceu, gravado pelo sistema ══ */}
      {eventos.length > 0 && (
        <Moldura titulo={`Histórico do card · ${eventos.length}`} origem="card_eventos, gravado pelo sistema a cada mudança"
          acao={eventos.length > 6 && (
            <button type="button" style={{ ...botaoVazado, padding: '4px 10px', fontSize: 11.5 }}
              onClick={() => setHistoricoTodo(v => !v)}>
              {historicoTodo ? 'Mostrar menos' : 'Mostrar tudo'}
            </button>
          )}>
          {(historicoTodo ? eventos : eventos.slice(0, 6)).map(e => (
            <div key={e.id} style={{ ...texto.corpo, display: 'flex', gap: 12, padding: '5px 0', borderTop: `1px solid ${cor.bordaSuave}` }}>
              <span style={{ ...texto.nota, width: 74, flexShrink: 0, paddingTop: 2 }}>{fmtData(e.criado_em)}</span>
              <span><b style={{ color: cor.tinta }}>{nomeArea(e.area)}</b> · {e.texto}</span>
            </div>
          ))}
        </Moldura>
      )}
    </div>
  )
}

// ── o que aparece ao clicar numa área ───────────────────────────────────────

function Detalhe({
  tomador, posto, onde, secao, carregando, corretora, temperatura, docs,
  ficha, fichaDaHolding, emSubscricao, emitidas, lmgEmitido, fechar, abrirRelatorio,
}: {
  tomador: Tomador; posto: PostoCentral; onde: string; secao: Secao | undefined; carregando: boolean
  corretora: string | null; temperatura: string | null
  docs: { item: ItemCatalogo; tem: boolean }[]
  ficha: FichaAnalise | null; fichaDaHolding: string | null
  emSubscricao: Operacao[]; emitidas: Operacao[]; lmgEmitido: number
  fechar: () => void; abrirRelatorio?: () => void
}) {
  const fecharBt = (
    <button type="button" style={{ ...botaoVazado, padding: '4px 10px', fontSize: 11.5 }} onClick={fechar}>Fechar</button>
  )
  // O que alguém tenha escrito na seção antes de 29/09 continua visível.
  const registro = secao?.texto?.trim() ? (
    <div style={{ marginTop: 12 }}>
      <div style={{ ...texto.rotulo, marginBottom: 3 }}>
        Registro da área{secao.concluida_por ? ` · ${secao.concluida_por}${secao.concluida_em ? ` em ${fmtData(secao.concluida_em)}` : ''}` : ''}
      </div>
      <div style={{ ...texto.corpo, whiteSpace: 'pre-wrap' }}>{secao.texto}</div>
    </div>
  ) : null

  if (posto === 'credito') {
    return (
      <div style={{ marginTop: 10 }}>
        <Moldura titulo={`Crédito · ${onde}`} acao={<span style={{ display: 'flex', gap: 6 }}>
          {abrirRelatorio && (
            <button type="button" style={{ ...botaoVazado, padding: '4px 10px', fontSize: 11.5 }} onClick={abrirRelatorio}>
              Relatório completo
            </button>
          )}
          {fecharBt}
        </span>}>
          {fichaDaHolding && (
            <div style={{ ...texto.apoio, marginBottom: 8 }}>
              Sem análise própria: o que aparece abaixo é da holding vinculada, <b>{fichaDaHolding}</b>.
            </div>
          )}
          {ficha ? (
            <div style={texto.apoio}>
              O relatório da análise de {fmtData(ficha.data_analise)}, como foi publicado. Só leitura.
            </div>
          ) : null}
          {registro}
        </Moldura>
        <div style={{ marginTop: 10 }}>
          <SecaoAnalise ficha={ficha} />
          {ficha && <SecaoTresCs ficha={ficha} />}
          {ficha?.serasa && <SecaoSerasa ficha={ficha} />}
        </div>
      </div>
    )
  }

  return (
    <Moldura titulo={`${nomeArea(posto)} · ${onde}`} acao={fecharBt} origem={ORIGEM[posto]}>
      {posto === 'comercial' && <OrigemDoCard tomador={tomador} corretora={corretora} temperatura={temperatura} />}

      {posto === 'cadastro' && (carregando ? <div style={texto.apoio}>Lendo os arquivos do tomador…</div> : (
        <FichaDoCadastro tomador={tomador}
          checklist={docs.map(d => ({ id: d.item.id, nome: d.item.nome, tem: d.tem, trava: d.item.exigencia === 'bloqueia' }))} />
      ))}

      {posto === 'subscricao' && (emSubscricao.length === 0
        ? <div style={texto.apoio}>Nenhuma operação esperando decisão da Subscrição.</div>
        : <TabelaOperacoes ops={emSubscricao} voto />)}

      {posto === 'emissao' && (emitidas.length === 0
        ? <div style={texto.apoio}>Nenhuma apólice emitida para este tomador.</div>
        : <>
          <TabelaOperacoes ops={emitidas} />
          <div style={{ ...texto.apoio, marginTop: 6 }}>
            {emitidas.length} apólice{emitidas.length > 1 ? 's' : ''} · {fmtMoeda(lmgEmitido)} em LMG emitido
          </div>
        </>)}

      {registro}
    </Moldura>
  )
}

const ORIGEM: Partial<Record<PostoCentral, string>> = {
  comercial: 'cadastro do tomador e o caso aberto pelo e-mail do pedido',
  cadastro: 'cadastro do tomador, triagem e conferência da esteira da análise',
  subscricao: 'taxa e voto gravados em cada operação',
  emissao: 'operações com situação Emitido',
}

function TabelaOperacoes({ ops, voto }: { ops: Operacao[]; voto?: boolean }) {
  return (
    <div className="mt-tab-wrap">
      <table className="mt-tab">
        <thead>
          <tr>
            <th>Modalidade</th><th>Situação</th>
            <th style={{ textAlign: 'right' }}>LMG</th>
            <th style={{ textAlign: 'right' }}>Taxa</th>
            {voto ? <th>Voto</th> : <th style={{ textAlign: 'right' }}>Entrada</th>}
          </tr>
        </thead>
        <tbody>
          {ops.map(o => (
            <tr key={o.id}>
              <td>{o.modalidade ?? '—'}</td>
              <td>{o.status}</td>
              <td className="n">{fmtMoeda(o.lmg)}</td>
              <td className="n">{pctTaxa(o.taxa) ?? '—'}</td>
              {voto
                ? <td>{o.voto_subscricao ?? '—'}</td>
                : <td className="dim" style={{ textAlign: 'right' }}>{o.data_entrada ? fmtData(o.data_entrada) : '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
