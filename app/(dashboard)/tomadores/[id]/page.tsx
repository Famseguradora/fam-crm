'use client'

export const dynamic = 'force-dynamic'

// ============================================================================
//  MESA DO TOMADOR — /tomadores/<id>
//
//  A tela única do tomador, no layout que o Marco desenhou e mandou em
//  30/08/2026: cabeçalho com os três números à direita, a faixa de
//  comprometimento do limite ao lado dos quatro cartões-resumo, e embaixo o
//  rail de navegação com o painel largo à direita.
//
//  DE ONDE VEM CADA COISA
//   • cadastro, limite aprovado e status ....... `tomadores`
//   • operações, LMG, prêmio e a carteira ...... `operacoes`
//   • organograma .............................. `socios` (o mesmo componente do Comitê)
//   • score, rating, taxas, 3 C's, exercícios .. `analises` + filhas, via lib/analise/ficha
//
//  O QUE ESTA TELA NÃO FAZ, de propósito:
//   • não escreve em `status`. Os dois vocabulários de status (o do Sistema de
//     Análise e o do CRM) não batem, e o Marco decidiu em 29/08 que a
//     reconciliação fica para depois. Escrever aqui seria criar dado errado.
//   • não sobrescreve o limite aprovado calado. Quando a análise recomenda um
//     valor diferente do que está no cadastro (que pode ter vindo do Cadastro
//     Básico), a tela mostra OS DOIS, com a data de cada um, e espera ele.
// ============================================================================

import { use, useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Tomador, Corretora, Operacao, Socio } from '@/types'
import { fmtMoeda, fmtMoedaCurta, fmtData, maskCNPJ, maskTelefone } from '@/lib/utils'
import { montarArvore, extrairDiretores, contarSocios } from '@/lib/relatorio-socios'
import OrganogramaView from '@/components/OrganogramaView'
import { fichaDaAnalise, type FichaAnalise, type SerasaFicha } from '@/lib/analise/ficha'
import CadastroTomador from '@/components/tomador/CadastroTomador'
import OrganogramaModal from '@/components/OrganogramaModal'
import OrganogramaAnalise from '@/components/tomador/OrganogramaAnalise'
import { montarDossieHtml, baixarDossie, type SecaoDossie } from '@/lib/tomador/dossie-html'
import {
  IcoVisao, IcoDoc, IcoEscudo, IcoCheck, IcoCalendario, IcoRede, IcoGrafico,
  IcoRelogio, IcoBalanca, IcoPercent, IcoCarteira, IcoInfo, IcoBaixar, IcoVoltar,
} from '@/components/tomador/icones'

type Gaveta = 'visao' | 'cadastro' | 'operacoes' | 'analise' | 'serasa' | 'grupo' | 'demonstracoes' | 'documentos' | 'linha'

/** Operações que COMPROMETEM limite. As demais (Em Análise, Para Analisar,
 *  Recusado, Perdido) não seguram capacidade e não entram na barra. */
const EMITIDO = 'Emitido'
const APROVADO = 'Aprovado'

// ── peças pequenas ──────────────────────────────────────────────────────────

function Campo({ rotulo, valor, cls, largo }: {
  rotulo: string; valor: React.ReactNode; cls?: string; largo?: boolean
}) {
  return (
    <div className={`mt-campo${largo ? ' largo' : ''}`}>
      <span className="mt-lab">{rotulo}</span>
      <span className={`v${cls ? ' ' + cls : ''}`}>{valor || '—'}</span>
    </div>
  )
}

function Sub({ texto, cor }: { texto: string; cor: string }) {
  return <div className="mt-sub"><span className="pt" style={{ background: cor }} />{texto}</div>
}

function Bloco({ titulo, cor, acao, onAcao, children }: {
  titulo: string; cor?: string; acao?: string; onAcao?: () => void; children: React.ReactNode
}) {
  return (
    <section className="mt-card mt-bloco">
      <header className="mt-bloco-cab">
        <span className="pt" style={cor ? { background: cor } : undefined} />
        <span className="mt-bloco-tit">{titulo}</span>
        {acao && <button type="button" className="mt-bloco-acao" onClick={onAcao}>{acao}</button>}
      </header>
      <div className="mt-bloco-corpo">{children}</div>
    </section>
  )
}

// ── a página ────────────────────────────────────────────────────────────────

export default function MesaDoTomadorPage({ params }: { params: Promise<{ id: string }> }) {
  // Next 16: `params` é Promise, e num Client Component quem resolve é `use()`.
  const { id } = use(params)
  const router = useRouter()

  const [tomador, setTomador] = useState<Tomador | null>(null)
  const [operacoes, setOperacoes] = useState<Operacao[]>([])
  const [socios, setSocios] = useState<Socio[]>([])
  const [ficha, setFicha] = useState<FichaAnalise | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [gaveta, setGaveta] = useState<Gaveta>('visao')
  // O editor do organograma (sócios, diretores, PDF, Excel): o mesmo de sempre,
  // aberto daqui de dentro. Ele pediu em 30/08 que voltasse para o tomador.
  const [editorOrg, setEditorOrg] = useState(false)
  const [usuarioInfo, setUsuarioInfo] = useState<{ authId: string; nome: string | null; email: string | null } | null>(null)
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('usuarios').select('nome, email').eq('auth_id', user.id).single()
        .then(({ data }) => setUsuarioInfo({ authId: user.id, nome: data?.nome ?? null, email: data?.email ?? null }))
    })
  }, [])

  // ── carga ──
  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null)
    const supabase = createClient()

    const { data: tom, error: errTom } = await supabase
      .from('tomadores')
      .select('*, corretora:corretoras(id,razao_social,nome_fantasia)')
      .eq('id', id).maybeSingle()

    if (errTom || !tom) {
      setErro(errTom?.message ?? 'Tomador não encontrado.')
      setCarregando(false)
      return
    }
    const t = tom as Tomador
    setTomador(t)

    const [{ data: ops }, { data: socs }] = await Promise.all([
      supabase.from('operacoes')
        .select('*, corretora:corretoras(id,razao_social,nome_fantasia), produto:produtos(id,nome)')
        .eq('tomador_id', id).eq('ativo', true)
        .order('lmg', { ascending: false }),
      supabase.from('socios')
        .select('*').eq('tomador_id', id).eq('ativo', true).order('ordem'),
    ])
    setOperacoes((ops as Operacao[]) ?? [])
    setSocios((socs as Socio[]) ?? [])

    // A análise vem depois e sozinha: ela pode não existir, e a falta dela não
    // pode impedir a ficha de aparecer.
    setFicha(await fichaDaAnalise(t.id, t.cnpj))
    setCarregando(false)
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  // ── contas ──
  const c = useMemo(() => {
    const soma = (f: (o: Operacao) => boolean) =>
      operacoes.filter(f).reduce((s, o) => s + (Number(o.lmg) || 0), 0)

    const emitidas = operacoes.filter(o => o.status === EMITIDO)
    const aprovadas = operacoes.filter(o => o.status === APROVADO)
    const emitido = soma(o => o.status === EMITIDO)
    const aprovado = soma(o => o.status === APROVADO)
    const comprometido = emitido + aprovado
    const limite = Number(tomador?.limite_aprovado) || 0
    const premio = operacoes.reduce((s, o) => s + (Number(o.premio_previsto) || 0), 0)

    return {
      emitidas, aprovadas, emitido, aprovado, comprometido, limite, premio,
      lmgTotal: operacoes.reduce((s, o) => s + (Number(o.lmg) || 0), 0),
      livre: limite > 0 ? limite - comprometido : 0,
      pct: limite > 0 ? (comprometido / limite) * 100 : 0,
      // O ESTOURO só conta o EMITIDO: apólice aprovada e não emitida ainda pode
      // não sair. É a regra registrada quando a Nova Tech apareceu estourada.
      estourou: limite > 0 && emitido > limite,
    }
  }, [operacoes, tomador])

  const arvore = useMemo(() => montarArvore(socios), [socios])
  const diretores = useMemo(() => extrairDiretores(socios), [socios])
  const nSocios = useMemo(() => contarSocios(arvore), [arvore])

  const corretoraNome = (tomador?.corretora as Corretora | undefined)?.nome_fantasia
    ?? (tomador?.corretora as Corretora | undefined)?.razao_social ?? null

  /** O limite da análise bate com o do cadastro? Só é conflito quando existem
   *  os dois números e eles diferem em mais de um real (evita ruído de
   *  arredondamento). */
  const conflitoLimite = !!ficha?.limiteNum && c.limite > 0
    && Math.abs(ficha.limiteNum - c.limite) > 1

  // ── o que precisa dele ──
  const pendencias = useMemo(() => {
    const p: { txt: React.ReactNode; cor: string; ir: Gaveta }[] = []
    if (c.estourou) p.push({
      cor: '#d64545', ir: 'operacoes',
      txt: <>Limite <b>estourado</b>: {fmtMoeda(c.emitido - c.limite)} emitidos acima do aprovado</>,
    })
    if (conflitoLimite && ficha?.limiteNum) p.push({
      cor: '#e8b84b', ir: 'analise',
      txt: <>Confirmar o limite: <b>{fmtMoedaCurta(c.limite)}</b> ou <b>{fmtMoedaCurta(ficha.limiteNum)}</b></>,
    })
    if (!tomador?.cnpj) p.push({
      cor: '#e8b84b', ir: 'visao',
      txt: <>Sem <b>CNPJ</b> no cadastro: a análise não consegue se ligar a este tomador</>,
    })
    if (!ficha) p.push({
      cor: '#3070c8', ir: 'analise',
      txt: <>Nenhuma <b>análise de crédito</b> publicada para este CNPJ</>,
    })
    if (ficha && !ficha.estrutura && nSocios === 0) p.push({
      cor: '#3070c8', ir: 'grupo',
      txt: <>Esta análise não trouxe organograma, e ele <b>não está montado</b> no CRM</>,
    })
    if (ficha && !ficha.revisada) p.push({
      cor: '#3070c8', ir: 'analise',
      txt: <>A análise de {fmtData(ficha.data_analise)} <b>ainda não foi revisada</b> por você</>,
    })
    return p
  }, [c, conflitoLimite, ficha, tomador, nSocios])

  // ── baixar HTML, para mandar à equipe ──
  const baixar = useCallback(() => {
    if (!tomador) return
    const secoes: SecaoDossie[] = []

    secoes.push({
      titulo: 'Cadastro',
      campos: [
        { rotulo: 'Razão social', valor: tomador.razao_social },
        { rotulo: 'Nome fantasia', valor: tomador.nome_fantasia ?? '—' },
        { rotulo: 'CNPJ', valor: tomador.cnpj ? maskCNPJ(tomador.cnpj) : '—' },
        { rotulo: 'Corretora', valor: corretoraNome ?? '—' },
        { rotulo: 'Porte', valor: tomador.porte ?? '—' },
        { rotulo: 'Status no fluxo', valor: tomador.status },
        { rotulo: 'Limite aprovado', valor: c.limite ? fmtMoeda(c.limite) : '—' },
        { rotulo: 'Entrada na FAM', valor: tomador.data_entrada ? fmtData(tomador.data_entrada) : '—' },
        { rotulo: 'Responsável', valor: tomador.responsavel ?? '—' },
        { rotulo: 'E-mail', valor: tomador.email ?? '—' },
        { rotulo: 'Telefone', valor: tomador.telefone ? maskTelefone(tomador.telefone) : '—' },
        {
          rotulo: 'Endereço',
          valor: [tomador.endereco, tomador.numero, tomador.bairro, tomador.cidade, tomador.estado]
            .filter(Boolean).join(', ') || '—',
        },
      ],
    })

    secoes.push({
      titulo: 'Capacidade e operações',
      campos: [
        { rotulo: 'Limite aprovado', valor: c.limite ? fmtMoeda(c.limite) : '—' },
        { rotulo: 'Emitido', valor: `${fmtMoeda(c.emitido)} (${c.emitidas.length} apólices)` },
        { rotulo: 'Aprovado a emitir', valor: `${fmtMoeda(c.aprovado)} (${c.aprovadas.length})` },
        { rotulo: 'Comprometido', valor: `${fmtMoeda(c.comprometido)} (${c.pct.toFixed(1).replace('.', ',')}%)` },
        { rotulo: 'Livre para emitir', valor: c.limite ? fmtMoeda(c.livre) : '—' },
        { rotulo: 'Prêmio da carteira', valor: fmtMoeda(c.premio) },
      ],
      tabela: operacoes.length ? {
        cabecalho: ['Modalidade', 'Situação', 'LMG', 'Taxa', 'Entrada'],
        linhas: operacoes.map(o => [
          o.modalidade ?? '—',
          o.status,
          fmtMoeda(o.lmg),
          o.taxa ? `${Number(o.taxa).toFixed(2).replace('.', ',')}%` : '—',
          o.data_entrada ? fmtData(o.data_entrada) : '—',
        ]),
      } : undefined,
      vazio: 'Nenhuma operação cadastrada.',
    })

    if (ficha) {
      secoes.push({
        titulo: `Análise de crédito · ${fmtData(ficha.data_analise)}`,
        campos: [
          { rotulo: 'Score FAM', valor: ficha.score_final === null ? '—' : String(ficha.score_final).replace('.', ',') },
          { rotulo: 'Rating', valor: ficha.rating_cod ?? ficha.rating_txt ?? '—' },
          { rotulo: 'Classe / Porte', valor: [ficha.classe, ficha.porte].filter(Boolean).join(' · ') || '—' },
          { rotulo: 'Nível de risco', valor: ficha.nivel_risco ?? '—' },
          { rotulo: 'Decisão', valor: ficha.recomendacao ?? '—' },
          {
            rotulo: 'Limite recomendado',
            valor: ficha.limiteNum !== null ? fmtMoeda(ficha.limiteNum) : ficha.limiteAviso,
          },
          { rotulo: 'Taxa tradicional', valor: ficha.taxa_tradicional ? `${String(ficha.taxa_tradicional).replace('.', ',')}%` : '—' },
          { rotulo: 'Taxa judicial', valor: ficha.taxa_judicial ? `${String(ficha.taxa_judicial).replace('.', ',')}%` : '—' },
          { rotulo: 'Taxa estruturada', valor: ficha.taxa_estruturada ? `${String(ficha.taxa_estruturada).replace('.', ',')}%` : '—' },
          { rotulo: 'Grupo econômico', valor: ficha.grupo ?? '—' },
          { rotulo: 'Segmento', valor: ficha.segmento ?? '—' },
          { rotulo: 'Situação', valor: ficha.revisada ? 'Editada por você' : 'Gerada, a revisar' },
        ],
        textos: [
          { titulo: 'Conclusão', itens: ficha.conclusao ? [ficha.conclusao] : [] },
          { titulo: 'Condições', itens: ficha.condicoes ? [ficha.condicoes] : [] },
          { titulo: 'Pontos positivos', itens: ficha.pontos_positivos },
          { titulo: 'Pontos de atenção', itens: ficha.pontos_atencao },
        ],
      })

      if (ficha.exercicios.length) {
        secoes.push({
          titulo: 'Demonstrações financeiras',
          tabela: {
            cabecalho: ['Exercício', 'Ativo total', 'Patrimônio líquido', 'Receita', 'Lucro líquido', 'Caixa'],
            linhas: ficha.exercicios.map(e => [
              `${e.rotulo}${e.base ? ` (${e.base})` : ''}`,
              e.ativo_total === null ? '—' : fmtMoeda(e.ativo_total),
              e.patrimonio_liquido === null ? '—' : fmtMoeda(e.patrimonio_liquido),
              e.receita_operacional === null ? '—' : fmtMoeda(e.receita_operacional),
              e.lucro_liquido === null ? '—' : fmtMoeda(e.lucro_liquido),
              e.caixa === null ? '—' : fmtMoeda(e.caixa),
            ]),
          },
        })
      }

      if (ficha.documentos.length) {
        secoes.push({
          titulo: 'Documentos lidos pela análise',
          tabela: {
            cabecalho: ['Documento', 'Tamanho'],
            linhas: ficha.documentos.map(d => [
              d.nome, d.bytes ? `${Math.round(d.bytes / 1024).toLocaleString('pt-BR')} KB` : '—',
            ]),
          },
        })
      }
    }

    if (nSocios > 0 || diretores.length > 0) {
      secoes.push({
        titulo: 'Organograma societário',
        tabela: {
          cabecalho: ['Nome', 'Documento', 'Participação'],
          linhas: socios.filter(s => s.categoria !== 'diretor').map(s => [
            s.nome_razao_social,
            s.documento ?? '—',
            s.percentual !== null && s.percentual !== undefined
              ? `${String(s.percentual).replace('.', ',')}%` : '—',
          ]),
        },
      })
    }

    const html = montarDossieHtml({
      razaoSocial: tomador.razao_social,
      cnpj: tomador.cnpj,
      subtitulo: [corretoraNome, tomador.cidade && `${tomador.cidade}/${tomador.estado ?? ''}`]
        .filter(Boolean).join(' · '),
      chips: [
        ficha?.rating_cod && `Rating ${ficha.rating_cod}`,
        ficha?.score_final !== null && ficha?.score_final !== undefined && `Score FAM ${String(ficha.score_final).replace('.', ',')}`,
        ficha?.recomendacao ?? undefined,
        tomador.status,
      ].filter(Boolean) as string[],
      kpis: [
        { rotulo: 'Limite aprovado', valor: c.limite ? fmtMoeda(c.limite) : '—' },
        { rotulo: 'Livre para emitir', valor: c.limite ? fmtMoeda(c.livre) : '—' },
        { rotulo: 'Prêmio da carteira', valor: fmtMoeda(c.premio) },
      ],
      secoes,
      rodape: `Dossiê gerado pelo FAM CRM em ${fmtData(new Date().toISOString().slice(0, 10))}. `
        + `Os números vêm do banco do CRM e da análise de crédito vigente. `
        + `Documento interno da FAM Seguradora.`,
    })
    baixarDossie(html, tomador.razao_social)
  }, [tomador, operacoes, ficha, socios, nSocios, diretores, corretoraNome, c])

  // ── estados de carga ──
  if (carregando) {
    return <div className="mt-card" style={{ padding: 44, textAlign: 'center', color: '#6080a0' }}>Carregando a mesa do tomador…</div>
  }
  if (erro || !tomador) {
    return (
      <div className="mt-card" style={{ padding: 34, textAlign: 'center' }}>
        <div style={{ fontSize: 15, color: '#a3282a', fontWeight: 600 }}>{erro ?? 'Tomador não encontrado.'}</div>
        <button className="mt-btn" style={{ marginTop: 16 }} onClick={() => router.push('/tomadores')}>
          Voltar para a lista
        </button>
      </div>
    )
  }

  const iniciais = tomador.razao_social.split(/\s+/).filter(p => p.length > 2)
    .slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'FM'

  const anosAtividade = tomador.data_entrada
    ? new Date().getFullYear() - new Date(tomador.data_entrada).getFullYear() : null

  const ITENS: { g: Gaveta; nome: string; ico: React.ReactNode; meta?: string; badge?: string }[] = [
    { g: 'visao', nome: 'Visão geral', ico: <IcoVisao /> },
    // A edição do cadastro mora AQUI desde 30/08/2026, e não mais no modal da
    // lista: ordem dele, "tudo deve ser feito na tela quando clicar na linha".
    { g: 'cadastro', nome: 'Cadastro', ico: <IcoCarteira /> },
    { g: 'operacoes', nome: 'Operações', ico: <IcoDoc />, badge: String(operacoes.length) },
    { g: 'analise', nome: 'Análise de crédito', ico: <IcoDoc />, meta: ficha ? fmtData(ficha.data_analise) : 'sem análise' },
    {
      g: 'serasa', nome: 'Serasa', ico: <IcoEscudo />,
      meta: ficha?.serasa
        ? (ficha.serasa.score !== null ? `score ${ficha.serasa.score}` : 'sem score')
        : 'sem análise',
    },
    {
      g: 'grupo', nome: 'Grupo e organograma', ico: <IcoRede />,
      meta: ficha?.estrutura ? `${ficha.estrutura.entidades.filter(e => e.tipo === 'emp').length} empresas`
        : nSocios ? `${nSocios} sócios` : 'a montar',
    },
    { g: 'demonstracoes', nome: 'Demonstrações', ico: <IcoGrafico />, meta: ficha ? `${ficha.exercicios.length} exercícios` : '—' },
    // "0" ao lado de Documentos leria como "este tomador não mandou nada".
    // Enquanto o índice não subir, o rótulo honesto é "a indexar".
    { g: 'documentos', nome: 'Documentos', ico: <IcoDoc />, meta: ficha && ficha.documentos.length > 0 ? String(ficha.documentos.length) : 'a indexar' },
    { g: 'linha', nome: 'Linha do tempo', ico: <IcoRelogio /> },
  ]

  return (
    <div className="mt-shell">
      <button className="mt-voltar" onClick={() => router.push('/tomadores')}>
        <IcoVoltar /> Todos os tomadores
      </button>

      {/* ══════════ 1. CABEÇALHO ══════════ */}
      <header className="mt-card mt-topo">
        <div className="mt-ident">
          <div className="mt-brasao">{iniciais}</div>
          <div style={{ minWidth: 0 }}>
            <h1 className="mt-nome">{tomador.razao_social}</h1>
            {/* Ordem dele, 30/08: CNPJ colado na razão social, e embaixo só a
                corretora. Rating, score, risco e status foram para a Visão geral. */}
            <div className="mt-sub mt-num">{tomador.cnpj ? maskCNPJ(tomador.cnpj) : 'sem CNPJ'}</div>
            <div className="mt-corretora">
              <IcoEscudo size={14} />{corretoraNome ?? 'sem corretora vinculada'}
            </div>
          </div>
        </div>

        <div className="mt-kpis">
          <div className="mt-kpi az">
            <div className="mt-lab">Limite aprovado</div>
            <div className="v">{c.limite ? fmtMoeda(c.limite) : '—'}</div>
          </div>
          <div className="mt-kpi vd">
            <div className="mt-lab">Livre para emitir</div>
            <div className="v">{c.limite ? fmtMoeda(c.livre) : '—'}</div>
          </div>
          <div className="mt-kpi ou">
            <div className="mt-lab">Prêmio da carteira</div>
            <div className="v">{fmtMoeda(c.premio)}</div>
          </div>
        </div>
      </header>

      {/* ══════════ 2. LIMITE + RESUMOS ══════════ */}
      <div className="mt-faixa">
        <section className="mt-card mt-limite">
          <div className="mt-lab">Comprometimento do limite</div>

          <div className="mt-barra" role="img" aria-label={
            c.limite
              ? `${c.pct.toFixed(1)}% do limite comprometido: ${fmtMoeda(c.emitido)} emitidos e ${fmtMoeda(c.aprovado)} aprovados a emitir, de ${fmtMoeda(c.limite)}.`
              : 'Sem limite aprovado cadastrado.'
          }>
            {c.limite > 0 && <>
              <i className="mt-b-emit" style={{ width: `${Math.min(100, (c.emitido / c.limite) * 100)}%` }} />
              <i className="mt-b-aprov" style={{ width: `${Math.min(100 - Math.min(100, (c.emitido / c.limite) * 100), (c.aprovado / c.limite) * 100)}%` }} />
            </>}
          </div>

          <div className="mt-limite-corpo">
            <div className="mt-pct">
              <div className="n" style={c.estourou ? { color: '#a3282a' } : undefined}>
                {c.limite ? `${c.pct.toFixed(1).replace('.', ',')}%` : '—'}
              </div>
              <div className="t">comprometido</div>
            </div>
            <div className="mt-risca" />
            <div className="mt-legenda">
              <div className="mt-leg">
                <span className="pt" style={{ background: '#27a96c' }} />
                <span className="nm">Emitido</span>
                <span className="vl">{fmtMoeda(c.emitido)} ({c.emitidas.length} apólices)</span>
              </div>
              <div className="mt-leg">
                <span className="pt" style={{ background: '#e8b84b' }} />
                <span className="nm">Aprovado a emitir</span>
                <span className="vl">{fmtMoeda(c.aprovado)} ({c.aprovadas.length})</span>
              </div>
              <div className="mt-leg">
                <span className="pt" style={{ background: ficha?.limiteNum ? '#d64545' : '#c5d5e8' }} />
                <span className="nm">Recomendado pela análise</span>
                <span className="vl">
                  {ficha?.limiteNum ? fmtMoeda(ficha.limiteNum) : 'sem número'}
                </span>
              </div>
            </div>
            <div className="mt-total">
              <div className="a">{fmtMoeda(c.comprometido)}</div>
              <div className="b">de {c.limite ? fmtMoeda(c.limite) : '—'}</div>
              <div className="b">({c.limite ? `${c.pct.toFixed(1).replace('.', ',')}%` : '—'})</div>
            </div>
          </div>

          {c.estourou && (
            <div className="mt-nota at" style={{ borderColor: '#e3b0b0', background: '#fdf2f2', color: '#a3282a' }}>
              <b>Limite estourado.</b> {fmtMoeda(c.emitido)} emitidos contra {fmtMoeda(c.limite)} aprovados:
              {' '}{fmtMoeda(c.emitido - c.limite)} acima.
            </div>
          )}
        </section>

        <div className="mt-resumos">
          <div className="mt-card mt-resumo">
            <div className="mt-ico"><IcoDoc size={18} /></div>
            <div>
              <div className="v">{operacoes.length}</div>
              <div className="t">operações</div>
              <div className="s">{fmtMoedaCurta(c.lmgTotal)}</div>
            </div>
          </div>
          <div className="mt-card mt-resumo">
            <div className="mt-ico"><IcoEscudo size={18} /></div>
            <div>
              <div className="v">{c.emitidas.length}</div>
              <div className="t">apólices</div>
              <div className="s">{fmtMoedaCurta(c.emitido)}</div>
            </div>
          </div>
          <div className="mt-card mt-resumo">
            <div className="mt-ico vd"><IcoCheck size={18} /></div>
            <div>
              <div className="v">{c.aprovadas.length}</div>
              <div className="t">a emitir</div>
              <div className="s">{fmtMoedaCurta(c.aprovado)}</div>
            </div>
          </div>
          <div className="mt-card mt-resumo">
            <div className="mt-ico"><IcoCalendario size={18} /></div>
            <div>
              <div className="v data">{ficha ? fmtData(ficha.data_analise) : '—'}</div>
              <div className="s">Última análise</div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════ 3. RAIL + PAINEL ══════════ */}
      <div className="mt-corpo">
        <div className="mt-rail">
          <nav className="mt-card mt-menu" role="tablist" aria-label="Seções do tomador">
            {ITENS.map(it => (
              <button key={it.g} type="button" role="tab" className="mt-item"
                aria-selected={gaveta === it.g}
                onClick={() => setGaveta(it.g)}>
                <span className="mt-item-ico">{it.ico}</span>
                <span className="mt-item-nome">{it.nome}</span>
                {it.badge && <span className="mt-item-badge">{it.badge}</span>}
                {it.meta && <span className="mt-item-meta">{it.meta}</span>}
              </button>
            ))}
          </nav>

          <div className="mt-card mt-pend">
            <div className="mt-pend-cab">
              Precisa de você
              <span className="mt-pend-n" style={pendencias.length === 0 ? { background: '#27a96c' } : undefined}>
                {pendencias.length}
              </span>
            </div>
            {pendencias.length === 0 ? (
              <div style={{ padding: '2px 11px 10px', fontSize: 12.5, color: '#8ba3c0' }}>
                Nada pendente nesta ficha.
              </div>
            ) : pendencias.map((p, i) => (
              <button key={i} type="button" className="mt-pend-item" onClick={() => setGaveta(p.ir)}>
                <span className="mt-pend-pt" style={{ background: p.cor }} />
                <span>{p.txt}</span>
              </button>
            ))}
            <div style={{ padding: '8px 11px 4px', borderTop: '1px solid #eef3f9', marginTop: 6 }}>
              <button type="button" className="mt-btn" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }} onClick={baixar}>
                <IcoBaixar /> Baixar HTML
              </button>
              <div style={{ fontSize: 11.5, color: '#8ba3c0', marginTop: 7, lineHeight: 1.4 }}>
                Um arquivo só, com tudo aberto, para mandar à equipe.
              </div>
            </div>
          </div>
        </div>

        <div className="mt-painel">
          {gaveta === 'visao' && <GavetaVisao
            operacoes={operacoes} lmgTotal={c.lmgTotal} pct={c.pct} livre={c.livre} temLimite={c.limite > 0}
            tomador={tomador} ficha={ficha} anosAtividade={anosAtividade} estourou={c.estourou}
          />}

          {gaveta === 'cadastro' && (
            <CadastroTomador tomador={tomador} onSalvo={carregar} />
          )}

          {gaveta === 'operacoes' && (
            <Bloco titulo={`Todas as operações · ${operacoes.length}`}>
              {operacoes.length === 0
                ? <div className="mt-vazio">Nenhuma operação cadastrada para este tomador.</div>
                : <div className="mt-tab-wrap"><TabelaOps ops={operacoes} /></div>}
            </Bloco>
          )}

          {gaveta === 'analise' && <GavetaAnalise
            ficha={ficha} limiteCadastro={c.limite} emitido={c.emitido}
            conflito={conflitoLimite}
            dataCadastro={tomador.data_entrada}
          />}

          {gaveta === 'serasa' && <GavetaSerasa ficha={ficha} />}

          {gaveta === 'grupo' && (
            <Bloco titulo="Grupo econômico e organograma" cor="#e8b84b"
              acao={nSocios === 0 && diretores.length === 0 ? 'Montar organograma' : 'Editar organograma'}
              onAcao={() => setEditorOrg(true)}>
              {ficha?.grupo && (
                <div className="mt-campos" style={{ marginBottom: 8 }}>
                  <Campo rotulo="Grupo econômico" valor={ficha.grupo} cls="forte" largo />
                  {ficha.segmento && <Campo rotulo="Segmento" valor={ficha.segmento} largo />}
                </div>
              )}
              {/* Primeiro o organograma que a ANÁLISE mapeou (sem retrabalho:
                  é o que ele monta na análise). Só quando a análise não tem,
                  cai na tabela `socios` digitada no CRM. */}
              {ficha?.estrutura ? (
                <OrganogramaAnalise estrutura={ficha.estrutura} dataAnalise={fmtData(ficha.data_analise)} />
              ) : (nSocios === 0 && diretores.length === 0) ? (
                <div className="mt-nota">
                  <b>Organograma ainda não montado para este tomador.</b> Hoje 13 dos tomadores têm
                  sócios cadastrados. Clique em <b>Montar organograma</b> acima para montar aqui
                  mesmo, com sócios, diretores, PDF e Excel.
                </div>
              ) : (
                <div style={{ overflow: 'auto', background: '#fff', padding: 12, borderRadius: 9 }}>
                  <OrganogramaView
                    tomadorNome={tomador.razao_social} tomadorDoc={tomador.cnpj}
                    arvore={arvore} diretores={diretores} readOnly
                  />
                </div>
              )}
            </Bloco>
          )}

          {gaveta === 'demonstracoes' && (
            <Bloco titulo="Demonstrações financeiras" cor="#27a96c">
              {!ficha || ficha.exercicios.length === 0
                ? <div className="mt-vazio">Nenhum exercício publicado para este tomador.</div>
                : <TabelaExercicios ficha={ficha} />}
            </Bloco>
          )}

          {gaveta === 'documentos' && (
            <Bloco titulo="Documentos lidos pela análise" cor="#27a96c">
              {!ficha || ficha.documentos.length === 0 ? (
                /* NUNCA escrever "este tomador não tem documento": seria mentira.
                   Conferido em 30/08/2026 no banco: `analise_documentos` está com
                   ZERO linhas para as 131 análises. A tabela existe e a carga a
                   limpa, mas nada nunca a preencheu. O dado está no disco, nos
                   `_status.json` de cada pasta (62 pastas, 830 arquivos). */
                <div className="mt-nota at" style={{ marginTop: 0 }}>
                  <b>Os documentos ainda não foram indexados.</b> A análise leu os arquivos da
                  pasta do tomador, mas esse índice nunca foi publicado no banco: a tabela está
                  vazia para todas as 131 análises, não só para este tomador.
                  {' '}É a próxima carga a rodar.
                </div>
              ) : (
                <div className="mt-tab-wrap">
                  <table className="mt-tab">
                    <thead><tr><th>Documento</th><th style={{ textAlign: 'right' }}>Tamanho</th><th style={{ textAlign: 'right' }}>Hash</th></tr></thead>
                    <tbody>
                      {ficha.documentos.map((d, i) => (
                        <tr key={i}>
                          <td>{d.nome}</td>
                          <td className="n">{d.bytes ? `${Math.round(d.bytes / 1024).toLocaleString('pt-BR')} KB` : '—'}</td>
                          <td className="dim" style={{ fontFamily: 'Consolas, monospace', fontSize: 11.5 }}>{d.hash16 ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-nota">
                Estes são os arquivos que a análise LEU, com o retrato de quando ela começou.
                O arquivo em si fica no disco; aqui está o índice, com o hash para conferir que
                não mudou.
              </div>
            </Bloco>
          )}

          {editorOrg && (
            <OrganogramaModal
              tomador={tomador}
              usuarioInfo={usuarioInfo}
              onClose={() => { setEditorOrg(false); carregar() }}
            />
          )}

          {gaveta === 'linha' && <GavetaLinha
            tomador={tomador} ficha={ficha} operacoes={operacoes}
          />}
        </div>
      </div>
    </div>
  )
}

// ── gavetas ─────────────────────────────────────────────────────────────────

function TabelaOps({ ops }: { ops: Operacao[] }) {
  const pill = (s: string) =>
    s === EMITIDO ? 'vd' : s === APROVADO ? 'ou' : s === 'Recusado' || s === 'Perdido' ? 'cz' : 'az'
  return (
    <table className="mt-tab">
        <thead>
          <tr>
            <th>Modalidade</th><th>Situação</th>
            <th style={{ textAlign: 'right' }}>LMG</th>
            <th style={{ textAlign: 'right' }}>Taxa</th>
            <th style={{ textAlign: 'right' }}>Prêmio</th>
            <th style={{ textAlign: 'right' }}>Entrada</th>
          </tr>
        </thead>
        <tbody>
          {ops.map(o => (
            <tr key={o.id}>
              <td>{o.modalidade ?? '—'}</td>
              <td><span className={`mt-pill ${pill(o.status)}`}>{o.status}</span></td>
              <td className="n">{fmtMoeda(o.lmg)}</td>
              <td className="n">{o.taxa ? `${Number(o.taxa).toFixed(2).replace('.', ',')}%` : '—'}</td>
              <td className="n">{fmtMoeda(o.premio_previsto)}</td>
              <td className="dim">{o.data_entrada ? fmtData(o.data_entrada) : '—'}</td>
            </tr>
          ))}
        </tbody>
    </table>
  )
}

/** O painel de indicadores no alto da Visão geral: o que antes eram chips
 *  embaixo do nome, agora com número grande e leitura executiva. */
function Indicadores({ tomador, ficha, estourou, pct, temLimite }: {
  tomador: Tomador; ficha: FichaAnalise | null
  estourou: boolean; pct: number; temLimite: boolean
}) {
  const risco = ficha?.nivel_risco?.toLowerCase() ?? null
  const corRisco = !risco ? '#8ba3c0' : /alto|crit/.test(risco) ? '#a3282a' : /m[eé]dio|moder/.test(risco) ? '#a07b1e' : '#1a7a50'
  const corPct = !temLimite ? '#8ba3c0' : estourou ? '#a3282a' : pct >= 90 ? '#a07b1e' : '#1a7a50'
  const itens: { lab: string; v: React.ReactNode; s?: string; cor?: string; txt?: boolean }[] = [
    { lab: 'Rating FAM', v: ficha?.rating_cod ?? '—', s: ficha?.rating_txt && ficha.rating_txt !== ficha.rating_cod ? ficha.rating_txt : undefined, cor: '#1e4080' },
    { lab: 'Score FAM', v: ficha?.score_final !== null && ficha?.score_final !== undefined ? String(ficha.score_final).replace('.', ',') : '—', s: ficha ? `análise de ${fmtData(ficha.data_analise)}` : 'sem análise', cor: '#1e4080' },
    { lab: 'Nível de risco', v: ficha?.nivel_risco ?? '—', s: ficha?.recomendacao ?? undefined, cor: corRisco, txt: true },
    { lab: 'Limite usado', v: temLimite ? `${pct.toFixed(1).replace('.', ',')}%` : '—', s: estourou ? 'estourado' : temLimite ? 'do aprovado' : 'sem limite', cor: corPct },
    { lab: 'Status no fluxo', v: tomador.status, s: tomador.porte ?? undefined, txt: true },
  ]
  return (
    <section className="mt-card mt-indic">
      {itens.map(i => (
        <div key={i.lab} className="mt-indic-i">
          <div className="mt-lab">{i.lab}</div>
          <div className={`v${i.txt ? ' txt' : ''}`} style={i.cor ? { color: i.cor } : undefined} title={typeof i.v === 'string' ? i.v : undefined}>{i.v}</div>
          {i.s && <div className="s">{i.s}</div>}
        </div>
      ))}
    </section>
  )
}

function GavetaVisao({ operacoes, lmgTotal, pct, livre, temLimite, tomador, ficha, anosAtividade, estourou }: {
  operacoes: Operacao[]; lmgTotal: number; pct: number; livre: number; temLimite: boolean
  tomador: Tomador; ficha: FichaAnalise | null; anosAtividade: number | null; estourou: boolean
}) {
  // A concentração é medida, não chutada. E basta UMA das duas pontas estar
  // sozinha para ser concentração: 16 apólices numa corretora só já é
  // dependência de um canal, mesmo que as modalidades sejam duas.
  const corretoras = new Set(operacoes.map(o =>
    (o.corretora as Corretora | undefined)?.razao_social ?? o.corretora_id ?? '—'))
  const modalidades = new Set(operacoes.map(o => o.modalidade ?? '—'))

  const umaCorretora = operacoes.length >= 3 && corretoras.size === 1
  const umaModalidade = operacoes.length >= 3 && modalidades.size === 1
  const concentrado = umaCorretora || umaModalidade

  const titulo = umaCorretora && umaModalidade ? 'Todas na mesma corretora e modalidade'
    : umaCorretora ? 'Todas na mesma corretora'
      : umaModalidade ? 'Todas na mesma modalidade'
        : 'Composição da carteira'

  const detalhe = concentrado
    ? `As ${operacoes.length} operações passam por ${corretoras.size} corretora(s) e `
      + `${modalidades.size} modalidade(s). Concentração que pede acompanhamento.`
    : `${operacoes.length} operações, ${corretoras.size} corretoras e ${modalidades.size} `
      + `modalidades. Sem dependência de uma só ponta.`

  return (
    <>
      <Indicadores tomador={tomador} ficha={ficha} estourou={estourou} pct={pct} temLimite={temLimite} />

      <section className="mt-card mt-bloco">
        <header className="mt-bloco-cab">
          <span className="pt" />
          {/* Ordem dele, 30/08/2026: aqui não se pergunta se ele quer ver todas.
              Traz TODAS as operações do tomador, com o status de cada uma, e não
              só as emitidas. */}
          <span className="mt-bloco-tit">Operações do tomador · {operacoes.length}</span>
        </header>

        {operacoes.length === 0 ? (
          <div className="mt-vazio">Nenhuma operação cadastrada para este tomador.</div>
        ) : (
          <>
            <div className="mt-tab-wrap mt-rolagem">
              <TabelaOps ops={operacoes} />
            </div>
            <div className="mt-rodape-tab">
              <span>
                {operacoes.length} operações, {fmtMoeda(lmgTotal)} em LMG somado
              </span>
            </div>
          </>
        )}
      </section>

      <section className="mt-card mt-leitura">
        <div className="mt-aviso">
          <span className="mt-aviso-ico"><IcoInfo /></span>
          <div>
            <div className="mt-aviso-tit">{titulo}</div>
            <div className="mt-aviso-txt">{detalhe}</div>
          </div>
        </div>
        <div className="mt-tres">
          <div className="mt-tres-i">
            <span className="mt-ico"><IcoBalanca size={17} /></span>
            <div><div className="v">{fmtMoedaCurta(lmgTotal)}</div><div className="t">Total das operações</div></div>
          </div>
          <div className="mt-tres-i">
            <span className="mt-ico ou"><IcoPercent size={17} /></span>
            <div><div className="v">{temLimite ? `${pct.toFixed(1).replace('.', ',')}%` : '—'}</div><div className="t">Do limite aprovado</div></div>
          </div>
          <div className="mt-tres-i">
            <span className="mt-ico vd"><IcoCarteira size={17} /></span>
            <div><div className="v">{temLimite ? fmtMoedaCurta(livre) : '—'}</div><div className="t">Disponível para emitir</div></div>
          </div>
        </div>
      </section>
    </>
  )
}

function GavetaAnalise({ ficha, limiteCadastro, emitido, conflito, dataCadastro }: {
  ficha: FichaAnalise | null; limiteCadastro: number; emitido: number
  conflito: boolean; dataCadastro: string | null
}) {
  if (!ficha) {
    return (
      <Bloco titulo="Análise de crédito">
        <div className="mt-vazio">
          Nenhuma análise publicada para este CNPJ.
        </div>
        <div className="mt-nota">
          A ficha procura a análise vigente pelo CNPJ. Se a análise existe no seu sistema mas não
          aparece aqui, ou o CNPJ do cadastro está diferente, ou ela ainda não foi publicada no banco.
        </div>
      </Bloco>
    )
  }

  const pct = (v: number | null) => v === null ? '—' : `${String(v).replace('.', ',')}%`

  return (
    <>
      <Bloco titulo={`Análise de crédito · ${fmtData(ficha.data_analise)}`} cor="#1e4080">
        <div className="mt-campos">
          <Campo rotulo="Score FAM" valor={ficha.score_final === null ? '—' : String(ficha.score_final).replace('.', ',')} cls="az" />
          <Campo rotulo="Rating" valor={ficha.rating_cod ?? ficha.rating_txt} cls="az" />
          <Campo rotulo="Classe / Porte" valor={[ficha.classe, ficha.porte].filter(Boolean).join(' · ')} />
          <Campo rotulo="Nível de risco" valor={ficha.nivel_risco} />
          <Campo rotulo="Decisão" valor={ficha.recomendacao} cls="forte" />
          <Campo rotulo="Situação" valor={ficha.revisada ? 'Editada por você' : 'Gerada, a revisar'} />
          <Campo
            rotulo="Limite recomendado"
            valor={ficha.limiteNum !== null ? fmtMoeda(ficha.limiteNum) : ficha.limiteAviso}
            cls={ficha.limiteNum !== null ? 'vd' : 'ou'}
            largo={ficha.limiteNum === null}
          />
          <Campo rotulo="Taxa tradicional" valor={pct(ficha.taxa_tradicional)} />
          <Campo rotulo="Taxa judicial" valor={pct(ficha.taxa_judicial)} />
          <Campo rotulo="Taxa estruturada" valor={pct(ficha.taxa_estruturada)} />
        </div>

        {/* O confronto: o limite do cadastro contra o da análise. */}
        {conflito && ficha.limiteNum !== null && (
          <div className="mt-confronto">
            <div className="mt-conf-cab">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e8b84b' }} />
              Limite aprovado · dois valores, e a decisão é sua
            </div>
            <div className="mt-conf-lados">
              <div className="mt-lado">
                <div className="mt-lab">Está no cadastro</div>
                <div className="lv">{fmtMoeda(limiteCadastro)}</div>
                <div className="lq">
                  Cadastro do CRM{dataCadastro ? ` · desde ${fmtData(dataCadastro)}` : ''}
                </div>
              </div>
              <div className="mt-lado novo">
                <div className="mt-lab">A análise recomenda</div>
                <div className="lv">{fmtMoeda(ficha.limiteNum)}</div>
                <div className="lq">Análise de {fmtData(ficha.data_analise)}</div>
              </div>
            </div>
            <div className="mt-conf-acoes">
              <span className="mt-conf-obs">
                Emitido hoje: {fmtMoeda(emitido)}.
                {emitido <= Math.min(limiteCadastro, ficha.limiteNum)
                  ? ' Cabe nos dois.'
                  : ' NÃO cabe no menor dos dois.'}
              </span>
            </div>
            <div className="mt-nota" style={{ marginTop: 12 }}>
              A tela <b>não muda o limite sozinha</b>. Enquanto a regra de publicação não estiver
              ligada, o valor do cadastro continua valendo, e a mudança é feita por você na edição
              do tomador.
            </div>
          </div>
        )}
      </Bloco>

      {(ficha.pontos_positivos.length > 0 || ficha.pontos_atencao.length > 0) && (
        <Bloco titulo="Pontos da análise" cor="#e8b84b">
          {ficha.pontos_positivos.length > 0 && <>
            <Sub texto="Pontos positivos" cor="#27a96c" />
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.55 }}>
              {ficha.pontos_positivos.map((p, i) => <li key={i} style={{ marginBottom: 5 }}>{p}</li>)}
            </ul>
          </>}
          {ficha.pontos_atencao.length > 0 && <>
            <Sub texto="Pontos de atenção" cor="#e8b84b" />
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.55 }}>
              {ficha.pontos_atencao.map((p, i) => <li key={i} style={{ marginBottom: 5 }}>{p}</li>)}
            </ul>
          </>}
        </Bloco>
      )}

      {(ficha.conclusao || ficha.condicoes) && (
        <Bloco titulo="Conclusão e condições" cor="#1e4080">
          {ficha.conclusao && <>
            <Sub texto="Conclusão" cor="#3070c8" />
            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '4px 0 0' }}>{ficha.conclusao}</p>
          </>}
          {ficha.condicoes && <>
            <Sub texto="Condições" cor="#e8b84b" />
            {/* O texto vem do editor antigo com marcação HTML dentro. Aqui ele é
                mostrado como TEXTO, sem interpretar as marcas: é conteúdo de
                banco, e não pode virar HTML numa tela do CRM. */}
            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '4px 0 0' }}>
              {ficha.condicoes.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()}
            </p>
          </>}
        </Bloco>
      )}
    </>
  )
}

function TabelaExercicios({ ficha }: { ficha: FichaAnalise }) {
  const LINHAS: { rot: string; k: keyof typeof ficha.exercicios[number] }[] = [
    { rot: 'Ativo total', k: 'ativo_total' },
    { rot: 'Ativo circulante', k: 'ativo_circulante' },
    { rot: 'Passivo circulante', k: 'passivo_circulante' },
    { rot: 'Exigível total', k: 'exigivel_total' },
    { rot: 'Patrimônio líquido', k: 'patrimonio_liquido' },
    { rot: 'Receita operacional', k: 'receita_operacional' },
    { rot: 'EBITDA', k: 'ebitda' },
    { rot: 'Lucro líquido', k: 'lucro_liquido' },
    { rot: 'Caixa', k: 'caixa' },
    { rot: 'Estoques', k: 'estoques' },
  ]
  const exs = ficha.exercicios

  return (
    <>
      <div className="mt-tab-wrap">
        <table className="mt-tab">
          <thead>
            <tr>
              <th>Conta</th>
              {exs.map(e => <th key={e.rotulo} style={{ textAlign: 'right' }}>{e.rotulo}</th>)}
            </tr>
          </thead>
          <tbody>
            {LINHAS.map(l => {
              // Conta que está vazia em TODOS os exercícios não vira linha em branco.
              if (exs.every(e => e[l.k] === null)) return null
              return (
                <tr key={l.rot}>
                  <td>{l.rot}</td>
                  {exs.map(e => {
                    const v = e[l.k] as number | null
                    return <td key={e.rotulo} className="n">{v === null ? '—' : fmtMoeda(v)}</td>
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-nota">
        <b>Valores em reais.</b> A carga converteu a escala de cada demonstração (havia balanço em
        milhares e em milhões no acervo), então as colunas podem ser comparadas direto.
        {exs.some(e => e.base) && <> A base de cada uma está no rótulo: {exs.filter(e => e.base).map(e => `${e.rotulo} (${e.base})`).join(', ')}.</>}
      </div>
    </>
  )
}

function GavetaLinha({ tomador, ficha, operacoes }: {
  tomador: Tomador; ficha: FichaAnalise | null; operacoes: Operacao[]
}) {
  // A linha do tempo é MONTADA do que existe, e não digitada: entrada no
  // cadastro, cada emissão, e a análise vigente.
  const eventos: { data: string; txt: string; forte?: boolean }[] = []

  if (tomador.data_entrada) eventos.push({ data: tomador.data_entrada, txt: 'Entrada no cadastro da FAM' })

  for (const o of operacoes) {
    if (o.status === EMITIDO && o.data_entrada) {
      eventos.push({
        data: o.data_entrada,
        txt: `Apólice emitida · ${o.modalidade ?? 'operação'} · ${fmtMoeda(o.lmg)}`,
      })
    }
  }
  if (ficha) eventos.push({
    data: ficha.data_analise,
    txt: `Análise de crédito vigente · Score ${ficha.score_final === null ? '—' : String(ficha.score_final).replace('.', ',')} · ${ficha.recomendacao ?? ''}`,
    forte: true,
  })

  eventos.sort((a, b) => a.data.localeCompare(b.data))

  return (
    <Bloco titulo={`Linha do tempo · ${eventos.length} eventos`} cor="#e8b84b">
      {eventos.length === 0 ? (
        <div className="mt-vazio">Sem data de entrada, sem apólice emitida e sem análise. Nada a mostrar ainda.</div>
      ) : (
        <div className="mt-tab-wrap">
          <table className="mt-tab">
            <tbody>
              {eventos.map((e, i) => (
                <tr key={i}>
                  <td className="dim" style={{ width: 110, fontWeight: e.forte ? 700 : 400, color: e.forte ? '#0a1628' : undefined }}>
                    {fmtData(e.data)}
                  </td>
                  <td style={{ fontWeight: e.forte ? 700 : 400 }}>{e.txt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-nota">
        Esta linha é montada do que o banco tem: entrada no cadastro, cada apólice emitida e a
        análise vigente. <b>O vencimento das apólices ainda não entra</b>, porque a data de fim de
        vigência não está preenchida nas operações. É o que falta para o limite voltar sozinho
        quando uma apólice vence.
      </div>
    </Bloco>
  )
}

// ── Serasa ──────────────────────────────────────────────────────────────────
//  O Serasa passou a ter coluna no banco em 30/08/2026 (migration
//  `analises_serasa` + `scripts/carga-serasa.mjs`): 130 das 131 análises. O que
//  a análise NÃO registrou continua ficando de fora, escrito como tal: PEFIN,
//  protestos e ações só existem no vocabulário revisado, e inventar
//  "sem registros" onde a análise não olhou seria dizer que a empresa está
//  limpa sem prova.

function faixaDoScore(score: number): { cor: string; texto: string } {
  if (score >= 700) return { cor: '#1a7a50', texto: 'faixa alta' }
  if (score >= 500) return { cor: '#27a96c', texto: 'faixa boa' }
  if (score >= 400) return { cor: '#a07b1e', texto: 'faixa média' }
  if (score >= 250) return { cor: '#c06a1e', texto: 'faixa baixa' }
  return { cor: '#a3282a', texto: 'faixa crítica' }
}

/** A análise escreveu que este campo está zerado? Serve para separar o que ela
 *  OLHOU e achou limpo do que ela simplesmente não olhou.
 *
 *  O acervo escreve isso de muitas formas ("R$ 0", "0 ação(ões)",
 *  "Sem registros", "Nada consta"), então a regra é a mais burra que funciona:
 *  frase de negação, ou nenhum algarismo diferente de zero no texto todo.
 *  "R$ 7.751,21" tem 7, logo NÃO está zerado. */
function zerado(v: string): boolean {
  const t = v.trim()
  if (/^(sem registro|nada consta|nenhum|não consta|nao consta|inexistente)/i.test(t)) return true
  return !/[1-9]/.test(t)
}

/** A cor do cabeçalho das anotações negativas, e ela diz TRÊS coisas
 *  diferentes: vermelho quando há anotação, verde quando a análise afirmou que
 *  está zerado, e cinza quando ela não registrou nada. O cinza é o ponto:
 *  campo em branco não é empresa limpa, e verde ali afirmaria o que o dado não
 *  sustenta. */
function corDasAnotacoes(s: SerasaFicha): string {
  const campos = [s.pefin, s.protestos, s.acoes].filter(Boolean) as string[]
  if (campos.length === 0) return '#8ba3c0'
  return campos.every(zerado) ? '#27a96c' : '#d64545'
}

function GavetaSerasa({ ficha }: { ficha: FichaAnalise | null }) {
  if (!ficha) {
    return (
      <Bloco titulo="Serasa" cor="#e8b84b">
        <div className="mt-vazio">Nenhuma análise publicada para este CNPJ.</div>
        <div className="mt-nota">
          O Serasa que a Mesa mostra é o que a análise de crédito leu e registrou. Sem análise
          publicada, não há de onde tirar.
        </div>
      </Bloco>
    )
  }

  const s = ficha.serasa
  if (!s) {
    return (
      <Bloco titulo={`Serasa · análise de ${fmtData(ficha.data_analise)}`} cor="#e8b84b">
        <div className="mt-nota at" style={{ marginTop: 0 }}>
          <b>Esta análise não registrou Serasa.</b> Ela existe e está publicada, mas o bloco do
          Serasa veio vazio: ou o relatório não foi anexado, ou não foi preenchido.
        </div>
      </Bloco>
    )
  }

  const faixa = s.score !== null ? faixaDoScore(s.score) : null
  const naoOlhados = [
    !s.pefin && 'PEFIN',
    !s.protestos && 'protestos',
    !s.acoes && 'ações judiciais',
  ].filter(Boolean) as string[]

  return (
    <>
      <Bloco titulo={`Serasa · análise de ${fmtData(ficha.data_analise)}`} cor="#e8b84b">
        <div className="mt-serasa-topo">
          <div className="mt-serasa-score">
            <div className="mt-lab">Serasa Score Empresas</div>
            <div className="n" style={faixa ? { color: faixa.cor } : { color: '#8ba3c0' }}>
              {s.score !== null ? s.score : '—'}
            </div>
            <div className="t">{faixa ? `de 1.000 · ${faixa.texto}` : 'a análise não registrou o número'}</div>
          </div>
          <div className="mt-risca" />
          <div className="mt-campos" style={{ flex: '1 1 320px' }}>
            <Campo rotulo="Risco" valor={s.risco} cls="forte" />
            <Campo rotulo="Probabilidade de inadimplência" valor={s.prob} />
            <Campo rotulo="Limite sugerido pelo Serasa" valor={s.limite_num !== null ? fmtMoeda(s.limite_num) : s.limite_txt} />
            <Campo rotulo="Falência e recuperação" valor={s.recuperacao} />
          </div>
        </div>

        {s.interpretacao && (
          <>
            <Sub texto="Leitura da análise" cor="#3070c8" />
            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '4px 0 0' }}>{s.interpretacao}</p>
          </>
        )}

        <div className="mt-nota">
          <b>Este Serasa é o que a análise tinha em mãos em {fmtData(ficha.data_analise)}</b>, e não uma
          consulta de hoje: o relatório em si pode ser mais velho que a análise. Score de crédito
          envelhece, e a data de quando ele foi puxado não é um campo que a análise registra.
        </div>
      </Bloco>

      <Bloco titulo="Anotações negativas" cor={corDasAnotacoes(s)}>
        {(s.pefin || s.protestos || s.acoes) ? (
          <div className="mt-campos">
            {s.pefin && <Campo rotulo="PEFIN" valor={s.pefin} />}
            {s.protestos && <Campo rotulo="Protestos" valor={s.protestos} />}
            {s.acoes && <Campo rotulo="Ações judiciais" valor={s.acoes} />}
            {s.recuperacao && <Campo rotulo="Falência / recuperação" valor={s.recuperacao} />}
          </div>
        ) : (
          <div className="mt-vazio" style={{ padding: '16px 20px' }}>
            A análise não registrou estes campos.
          </div>
        )}
        {naoOlhados.length > 0 && (
          <div className="mt-nota">
            Sem registro de <b>{naoOlhados.join(', ')}</b> nesta análise. Isso quer dizer que o campo
            não foi preenchido, e <b>não</b> que a empresa está limpa: para afirmar isso é preciso o
            relatório do Serasa em mãos.
          </div>
        )}
      </Bloco>

      <Bloco titulo={`Consultas recentes ao CNPJ · ${s.consultas.length}`} cor="#e8b84b">
        {s.consultas.length === 0 ? (
          <div className="mt-vazio">A análise não listou consultas.</div>
        ) : (
          <div className="mt-tab-wrap">
            <table className="mt-tab">
              <thead><tr><th>Data</th><th>Quem consultou</th><th>Segmento</th></tr></thead>
              <tbody>
                {s.consultas.map((c, i) => (
                  <tr key={i}>
                    <td className="dim" style={{ width: 110 }}>{c.data ?? '—'}</td>
                    <td>{c.empresa ?? '—'}</td>
                    <td className="dim" style={{ whiteSpace: 'normal' }}>{c.tipo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-nota">
          Esta é a lista que a análise transcreveu do relatório, e costuma ser <b>uma amostra</b> das
          consultas mais recentes, não o total do período. O número cheio, quando existe, está na
          leitura acima.
          {s.fonte && <> Origem: versão <b>{s.fonte === 'revisada' ? 'revisada por você' : 'gerada pela análise'}</b>.</>}
        </div>
      </Bloco>
    </>
  )
}
