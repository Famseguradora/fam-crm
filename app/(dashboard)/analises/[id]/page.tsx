'use client'

export const dynamic = 'force-dynamic'

// ============================================================================
//  O RELATÓRIO DA ANÁLISE, DENTRO DO CRM — /analises/<id>
//
//  O QUE ESTA TELA RESOLVE
//
//  Até aqui, ler uma análise de crédito exigia o Sistema de Análise no ar em
//  `127.0.0.1:7311`, na máquina do Marco. Fora dela — no CRM publicado, no
//  celular, no computador de outra pessoa — o navegador bloqueia endereço local
//  e a análise simplesmente não existia. As 146 análises do acervo só tinham
//  porta pelo tomador, e nenhuma estava ligada a um (`tomador_id` nulo nas 146,
//  medido em 07/09/2026 e corrigido no mesmo dia: 121 ligadas por CNPJ).
//
//  Esta página lê o SUPABASE, e por isso funciona de qualquer lugar. É o
//  relatório fracionado que ele pediu em 01/09/2026: seção por seção, campo,
//  tabela e tela, em vez de um documento inteiro guardado como arquivo.
//
//  O QUE ELA NÃO É, de propósito
//
//   • não substitui o `v13.html` do Sistema de Análise. Aquele relatório fica
//     como está, e é onde ele EDITA a análise. Esta tela é de LEITURA;
//   • não fala com 127.0.0.1. Nenhuma tela do CRM busca dado em outra porta —
//     regra dele de 31/08/2026. Quem leva a análise para o banco é a carga
//     (`npm run publicar`), e só o que está publicado aparece aqui.
//
//  As seções são as mesmas da Mesa do Tomador, do mesmo arquivo
//  (`components/analise/Relatorio.tsx`): uma análise não pode ter duas caras.
// ============================================================================

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fichaPorId, type FichaAnalise } from '@/lib/analise/ficha'
import { fmtMoeda, fmtData, maskCNPJ } from '@/lib/utils'
import OrganogramaAnalise from '@/components/tomador/OrganogramaAnalise'
import {
  Bloco, Campo, SecaoAnalise, SecaoTresCs, SecaoSerasa, SecaoDemonstracoes,
  SecaoDocumentos, fmtScore,
} from '@/components/analise/Relatorio'
import {
  IcoVisao, IcoDoc, IcoEscudo, IcoRede, IcoGrafico, IcoVoltar,
} from '@/components/tomador/icones'
import EditorAnalise from '@/components/analise/EditorAnalise'
import { usePermissoes } from '@/lib/context/permissoes-context'

type Secao = 'analise' | 'tres' | 'serasa' | 'grupo' | 'demonstracoes' | 'documentos'

/** As iniciais do brasão. Mesmo desenho da Mesa do Tomador. */
function iniciaisDe(nome: string): string {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '—'
}

export default function RelatorioDaAnalisePage({ params }: { params: Promise<{ id: string }> }) {
  // Next 16: `params` é Promise, e num Client Component quem resolve é `use()`.
  const { id } = use(params)
  const router = useRouter()

  const [ficha, setFicha] = useState<FichaAnalise | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [secao, setSecao] = useState<Secao>('analise')

  /* EDITAR AQUI DENTRO (08/09/2026). Era esta tela que terminava dizendo
     "editar continua sendo no Sistema de Análise, na máquina onde ele roda".
     Deixou de ser: quem é analista abre o editor e o que ele escreve já está no
     banco do CRM. Só o analista vê o botão, e a trava de verdade é a RLS. */
  const { editaAnalise } = usePermissoes()
  const [editando, setEditando] = useState(false)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    fichaPorId(id).then(f => {
      if (!vivo) return
      setFicha(f)
      setCarregando(false)
    })
    return () => { vivo = false }
  }, [id])

  /** Relê a análise depois de uma gravação, para o cabeçalho (Score, limite,
   *  etiquetas) contar a mesma história que os campos. */
  const reler = useCallback(() => {
    fichaPorId(id).then(f => { if (f) setFicha(f) })
  }, [id])

  if (carregando) {
    return (
      <div style={{ padding: '20px 0' }}>
        <div className="card-panel"><p style={{ color: 'var(--soft)', fontSize: 14 }}>Carregando a análise…</p></div>
      </div>
    )
  }

  if (!ficha) {
    return (
      <div style={{ padding: '20px 0' }}>
        <button type="button" className="mt-voltar" onClick={() => router.push('/analises/acervo')}>
          <IcoVoltar /> Acervo de análises
        </button>
        <div className="card-panel" style={{ marginTop: 14 }}>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            <b>Esta análise não está no banco do CRM.</b> Ou o endereço está errado, ou ela existe
            no disco e ainda não foi publicada. Quem publica é a carga, na máquina onde as análises
            rodam: <b>npm run publicar:ensaio</b> para conferir e depois <b>npm run publicar</b>.
          </p>
        </div>
      </div>
    )
  }

  const ITENS: { s: Secao; nome: string; ico: React.ReactNode; meta?: string }[] = [
    { s: 'analise', nome: 'A análise', ico: <IcoVisao /> },
    { s: 'tres', nome: "Os 3 C's", ico: <IcoEscudo />, meta: ficha.tres_cs ? undefined : 'sem registro' },
    { s: 'serasa', nome: 'Serasa', ico: <IcoGrafico />, meta: ficha.serasa ? (ficha.serasa.score !== null ? String(ficha.serasa.score) : undefined) : 'sem registro' },
    { s: 'grupo', nome: 'Grupo econômico', ico: <IcoRede />, meta: ficha.estrutura ? String(ficha.estrutura.entidades.length) : 'sem organograma' },
    { s: 'demonstracoes', nome: 'Demonstrações', ico: <IcoGrafico />, meta: ficha.exercicios.length ? String(ficha.exercicios.length) : 'sem exercício' },
    { s: 'documentos', nome: 'Documentos', ico: <IcoDoc />, meta: ficha.documentos.length ? String(ficha.documentos.length) : 'a indexar' },
  ]

  return (
    <div style={{ padding: '14px 0 26px' }}>
      <button type="button" className="mt-voltar" onClick={() => router.push('/analises/acervo')}>
        <IcoVoltar /> Acervo de análises
      </button>

      {/* ══════════ CABEÇALHO ══════════ */}
      <header className="mt-card mt-topo">
        <div className="mt-ident">
          <div className="mt-brasao">{iniciaisDe(ficha.nome_curto || ficha.razao_social)}</div>
          <div style={{ minWidth: 0 }}>
            <h1 className="mt-nome">{ficha.razao_social}</h1>
            <div className="mt-sub mt-num">{ficha.cnpj ? maskCNPJ(ficha.cnpj) : 'sem CNPJ apurado'}</div>
            <div className="mt-corretora">
              <IcoEscudo size={14} />{ficha.corretora ?? 'sem corretora na análise'}
            </div>
          </div>
        </div>

        <div className="mt-kpis">
          <div className="mt-kpi az">
            <div className="mt-lab">Score FAM</div>
            <div className="v">{fmtScore(ficha.score_final)}</div>
          </div>
          <div className="mt-kpi az">
            <div className="mt-lab">Rating</div>
            <div className="v">{ficha.rating_cod ?? ficha.rating_txt ?? '—'}</div>
          </div>
          <div className="mt-kpi vd">
            <div className="mt-lab">Limite recomendado</div>
            {/* Sem número confiável, aqui NÃO entra número: o aviso vai para a
                seção, onde há espaço para explicar por quê. Um KPI é lido de
                relance, e relance com número errado vira decisão errada. */}
            <div className="v">{ficha.limiteNum !== null ? fmtMoeda(ficha.limiteNum) : 'ver a análise'}</div>
          </div>
        </div>
      </header>

      {/* ── as etiquetas que dizem o que esta análise É ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '12px 0 14px', alignItems: 'center' }}>
        <span className={`badge ${ficha.revisada ? 'badge-green' : 'badge-yellow'}`}>
          {ficha.revisada ? 'Revisada por você' : 'Gerada, a revisar'}
        </span>
        {/* A histórica não é erro nem lixo: é a versão anterior do mesmo CNPJ, e
            continua valendo como registro. Mas quem abre precisa saber que não é
            a que vale hoje. */}
        <span className={`badge ${ficha.vigente ? 'badge-blue' : 'badge-gray'}`}>
          {ficha.vigente ? 'Vigente' : `Histórica · versão ${ficha.versao}`}
        </span>
        <span className="badge badge-gray">Análise de {fmtData(ficha.data_analise)}</span>
        {ficha.recomendacao && <span className="badge badge-purple">{ficha.recomendacao}</span>}
        <span style={{ flex: 1 }} />
        {editaAnalise && (
          <button type="button" className={editando ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '6px 13px', fontSize: 13 }}
            onClick={() => { setEditando(v => !v); if (editando) reler() }}>
            {editando ? 'Terminar a edição' : 'Editar a análise'}
          </button>
        )}
        {ficha.tomador_id ? (
          <button type="button" className="btn-secondary" style={{ padding: '6px 13px', fontSize: 13 }}
            onClick={() => router.push(`/tomadores/${ficha.tomador_id}`)}>
            Abrir o tomador no CRM
          </button>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--soft)' }}>
            Sem tomador ligado no CRM{ficha.cnpj ? ' para este CNPJ' : ' (a análise não apurou CNPJ)'}.
          </span>
        )}
      </div>

      {/* ══════════ RAIL + PAINEL ══════════ */}
      <div className="mt-corpo">
        <div className="mt-rail">
          <nav className="mt-card mt-menu" role="tablist" aria-label="Seções da análise">
            {/* Clicar numa seção SAI da edição: enquanto ela está aberta o painel
                é o editor, e um menu que não responde é pior que um menu que leva
                de volta para a leitura. O que foi digitado já está salvo, campo a
                campo, então sair não perde nada. */}
            {ITENS.map(it => (
              <button key={it.s} type="button" role="tab" className="mt-item"
                aria-selected={!editando && secao === it.s}
                onClick={() => { setEditando(false); setSecao(it.s) }}>
                <span className="mt-item-ico">{it.ico}</span>
                <span className="mt-item-nome">{it.nome}</span>
                {it.meta && <span className="mt-item-meta">{it.meta}</span>}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-painel">
          {editando && <EditorAnalise ficha={ficha} aoSalvar={reler} />}

          {!editando && secao === 'analise' && <SecaoAnalise ficha={ficha} />}
          {!editando && secao === 'tres' && <SecaoTresCs ficha={ficha} />}
          {!editando && secao === 'serasa' && <SecaoSerasa ficha={ficha} />}

          {!editando && secao === 'grupo' && (
            <Bloco titulo="Grupo econômico e organograma" cor="#e8b84b">
              {(ficha.grupo || ficha.segmento || ficha.setor) && (
                <div className="mt-campos" style={{ marginBottom: 10 }}>
                  {ficha.grupo && <Campo rotulo="Grupo econômico" valor={ficha.grupo} cls="forte" largo />}
                  {ficha.segmento && <Campo rotulo="Segmento" valor={ficha.segmento} largo />}
                  {ficha.setor && <Campo rotulo="Setor" valor={ficha.setor} />}
                </div>
              )}
              {ficha.estrutura ? (
                <OrganogramaAnalise estrutura={ficha.estrutura} dataAnalise={fmtData(ficha.data_analise)} />
              ) : (
                <div className="mt-nota at" style={{ marginTop: 0 }}>
                  <b>Esta análise não mapeou o organograma societário.</b> Nem toda análise traz o
                  bloco: ele depende do contrato social e do organograma que a empresa mandou.
                </div>
              )}
            </Bloco>
          )}

          {!editando && secao === 'demonstracoes' && <SecaoDemonstracoes ficha={ficha} />}
          {!editando && secao === 'documentos' && <SecaoDocumentos ficha={ficha} />}
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 16, lineHeight: 1.5, maxWidth: '90ch' }}>
        Esta análise vive <b>no banco do CRM</b>. O que o motor gerou na máquina chega aqui pela
        carga (<b>npm run publicar</b>); a partir do momento em que você edita aqui, esta análise
        passa a ser sua: a carga não a sobrescreve mais, e o que vier diferente do disco aparece
        como conflito, com os dois valores lado a lado.
        Chave do acervo: <span style={{ fontFamily: 'Consolas, monospace' }}>{ficha.chave_local}</span>.
      </div>
    </div>
  )
}
