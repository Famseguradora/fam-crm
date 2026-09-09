'use client'

// ============================================================================
//  O RELATÓRIO DA ANÁLISE, INTEIRO  ·  fonte única para duas portas
//
//  Nasceu dentro de `app/(dashboard)/analises/[id]/page.tsx` e saiu de lá para
//  cá em 09/09/2026 porque ganhou um segundo leitor: a aba Relatório do card
//  do tomador (`/analises/mesa/<id>`). O cockpit mostra o template num iframe
//  dentro do card; aqui o card mostra o relatório fracionado, lendo o banco.
//  Uma peça, dois lugares, o mesmo desenho.
//
//  O QUE ELA NÃO É, de propósito: não substitui o `v13.html` do Sistema de
//  Análise, que fica como está e é onde a análise é EDITADA no template. Isto
//  é a leitura nativa, com a edição campo a campo do CRM para o analista.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fichaPorId, type FichaAnalise } from '@/lib/analise/ficha'
import { fmtMoeda, fmtData, maskCNPJ } from '@/lib/utils'
import OrganogramaAnalise from '@/components/tomador/OrganogramaAnalise'
import {
  Bloco, Campo, SecaoAnalise, SecaoTresCs, SecaoSerasa, SecaoDemonstracoes,
  SecaoDocumentos, fmtScore,
} from '@/components/analise/Relatorio'
import {
  IcoVisao, IcoDoc, IcoEscudo, IcoRede, IcoGrafico,
} from '@/components/tomador/icones'
import EditorAnalise from '@/components/analise/EditorAnalise'
import { usePermissoes } from '@/lib/context/permissoes-context'

type Secao = 'analise' | 'tres' | 'serasa' | 'grupo' | 'demonstracoes' | 'documentos'

/** As iniciais do brasão. Mesmo desenho da Mesa do Tomador. */
function iniciaisDe(nome: string): string {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '—'
}

export default function RelatorioCompleto({ analiseId, semCabecalho, aoCarregar }: {
  analiseId: string
  /** Dentro do card o nome do tomador já está escrito dois centímetros acima. */
  semCabecalho?: boolean
  aoCarregar?: (f: FichaAnalise | null) => void
}) {
  const router = useRouter()
  const [ficha, setFicha] = useState<FichaAnalise | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [secao, setSecao] = useState<Secao>('analise')

  /* EDITAR AQUI DENTRO (08/09/2026). Quem é analista abre o editor e o que ele
     escreve já está no banco do CRM. Só o analista vê o botão, e a trava de
     verdade é a RLS. */
  const { editaAnalise } = usePermissoes()
  const [editando, setEditando] = useState(false)

  useEffect(() => {
    let vivo = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCarregando(true)
    fichaPorId(analiseId).then(f => {
      if (!vivo) return
      setFicha(f)
      setCarregando(false)
      aoCarregar?.(f)
    })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analiseId])

  /** Relê a análise depois de uma gravação, para o cabeçalho contar a mesma
   *  história que os campos. */
  const reler = useCallback(() => {
    fichaPorId(analiseId).then(f => { if (f) { setFicha(f); aoCarregar?.(f) } })
  }, [analiseId, aoCarregar])

  if (carregando) {
    return <div className="card-panel"><p style={{ color: 'var(--soft)', fontSize: 14 }}>Carregando a análise…</p></div>
  }

  if (!ficha) {
    return (
      <div className="card-panel">
        <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          <b>Esta análise não está no banco do CRM.</b> Ou o endereço está errado, ou ela existe
          no disco e ainda não foi publicada. Quem publica é a carga, na máquina onde as análises
          rodam: <b>npm run publicar:ensaio</b> para conferir e depois <b>npm run publicar</b>.
        </p>
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
    <div>
      {!semCabecalho && (
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
                  seção, onde há espaço para explicar por quê. */}
              <div className="v">{ficha.limiteNum !== null ? fmtMoeda(ficha.limiteNum) : 'ver a análise'}</div>
            </div>
          </div>
        </header>
      )}

      {/* ── as etiquetas que dizem o que esta análise É ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '12px 0 14px', alignItems: 'center' }}>
        <span className={`badge ${ficha.revisada ? 'badge-green' : 'badge-yellow'}`}>
          {ficha.revisada ? 'Revisada por você' : 'Gerada, a revisar'}
        </span>
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
