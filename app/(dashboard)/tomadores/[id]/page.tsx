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
import { fichaDaAnalise, type FichaAnalise } from '@/lib/analise/ficha'
/* As seções do relatório moram em `components/analise/Relatorio.tsx`, porque
   agora têm dois leitores: esta Mesa e o acervo (`/analises/<id>`). Uma cópia
   aqui e outra lá seriam duas verdades sobre a mesma análise. */
import {
  Bloco, Campo, SecaoAnalise, SecaoSerasa, SecaoTresCs, SecaoDocumentos,
  SecaoDemonstracoes, fmtScore,
} from '@/components/analise/Relatorio'
import CadastroTomador from '@/components/tomador/CadastroTomador'
import VinculoHolding from '@/components/tomador/VinculoHolding'
import OrganogramaModal from '@/components/OrganogramaModal'
import OrganogramaAnalise from '@/components/tomador/OrganogramaAnalise'
// A análise deste tomador, ao vivo, com a caixa de autorização. Tudo do tomador
// dentro do card dele: ordem do Marco em 31/08/2026.
import { montarDossieHtml, baixarDossie, type SecaoDossie } from '@/lib/tomador/dossie-html'
import {
  IcoVisao, IcoDoc, IcoEscudo, IcoCheck, IcoCalendario, IcoRede, IcoGrafico,
  IcoRelogio, IcoBalanca, IcoPercent, IcoCarteira, IcoInfo, IcoBaixar, IcoVoltar,
} from '@/components/tomador/icones'

// O fluxo por área entrou em 08/09/2026: é a tela "mesa" do protótipo, com as
// cinco seções nascendo juntas dentro do card. Ver components/tomador/SecoesDoCard.
import SecoesDoCard from '@/components/tomador/SecoesDoCard'
import { nomeArea } from '@/lib/card/secoes'

type Gaveta = 'visao' | 'fluxo' | 'cadastro' | 'operacoes' | 'analise' | 'serasa' | 'grupo' | 'demonstracoes' | 'documentos' | 'linha'

/** Operações que COMPROMETEM limite. As demais (Em Análise, Para Analisar,
 *  Recusado, Perdido) não seguram capacidade e não entram na barra. */
const EMITIDO = 'Emitido'
const APROVADO = 'Aprovado'

// ── a página ────────────────────────────────────────────────────────────────

export default function MesaDoTomadorPage({ params }: { params: Promise<{ id: string }> }) {
  // Next 16: `params` é Promise, e num Client Component quem resolve é `use()`.
  const { id } = use(params)
  const router = useRouter()

  const [tomador, setTomador] = useState<Tomador | null>(null)
  const [operacoes, setOperacoes] = useState<Operacao[]>([])
  const [socios, setSocios] = useState<Socio[]>([])
  const [ficha, setFicha] = useState<FichaAnalise | null>(null)
  // Quando este tomador é uma SPE sem análise própria, a ficha acima pode vir
  // da holding vinculada (ver components/tomador/VinculoHolding). Esta flag é
  // o que liga o aviso "estes dados são da holding" nas gavetas que os mostram.
  const [fichaDaHolding, setFichaDaHolding] = useState(false)
  // Só a contagem, para o selo ao lado do nome — a lista em si mora na gaveta
  // Grupo (components/tomador/VinculoHolding), que não precisa subir pro topo.
  const [nEmpresasDoGrupo, setNEmpresasDoGrupo] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [gaveta, setGaveta] = useState<Gaveta>('visao')
  // O editor do organograma (sócios, diretores, PDF, Excel): o mesmo de sempre,
  // aberto daqui de dentro. Ele pediu em 30/08 que voltasse para o tomador.
  const [editorOrg, setEditorOrg] = useState(false)
  const [usuarioInfo, setUsuarioInfo] = useState<{ authId: string; nome: string | null; email: string | null } | null>(null)
  // Quem pode AUTORIZAR o que a análise pergunta. Não é `perfil`: a análise tem
  // um analista só, e os sete admins não passam (ver lib/analise/acesso.ts).
  // Isto aqui só decide se o botão APARECE; a trava de verdade é a RLS.
  const [analistaCredito, setAnalistaCredito] = useState(false)
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('usuarios').select('nome, email, analista_credito').eq('auth_id', user.id).single()
        .then(({ data }) => {
          setUsuarioInfo({ authId: user.id, nome: data?.nome ?? null, email: data?.email ?? null })
          setAnalistaCredito(!!data?.analista_credito)
        })
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

    // A holding é buscada à parte (não embutida no select acima): PostgREST
    // exige um hint explícito de FK para auto-referência, e uma segunda
    // consulta simples evita esse acoplamento.
    if (t.holding_id) {
      const { data: hold } = await supabase.from('tomadores')
        .select('id,razao_social,cnpj').eq('id', t.holding_id).maybeSingle()
      t.holding = hold ?? null
    }
    setTomador(t)

    const { count: nGrupo } = await supabase.from('tomadores')
      .select('id', { count: 'exact', head: true }).eq('holding_id', t.id).eq('ativo', true)
    setNEmpresasDoGrupo(nGrupo ?? 0)

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
    // pode impedir a ficha de aparecer. Quando este tomador é uma SPE sem
    // análise própria, cai para a análise vigente da holding vinculada.
    const fichaPropria = await fichaDaAnalise(t.id, t.cnpj)
    if (fichaPropria) {
      setFicha(fichaPropria); setFichaDaHolding(false)
    } else if (t.holding) {
      setFicha(await fichaDaAnalise(t.holding.id, t.holding.cnpj)); setFichaDaHolding(true)
    } else {
      setFicha(null); setFichaDaHolding(false)
    }
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
          { rotulo: 'Score FAM', valor: fmtScore(ficha.score_final) },
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
        ficha?.score_final !== null && ficha?.score_final !== undefined && `Score FAM ${fmtScore(ficha.score_final)}`,
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
    // A esteira do card: onde ele está e quem escreve o quê agora.
    { g: 'fluxo', nome: 'Fluxo por área', ico: <IcoCheck />, meta: nomeArea(tomador.central_area ?? 'comercial') },
    // A edição do cadastro mora AQUI desde 30/08/2026, e não mais no modal da
    // lista: ordem dele, "tudo deve ser feito na tela quando clicar na linha".
    { g: 'cadastro', nome: 'Cadastro', ico: <IcoCarteira /> },
    { g: 'operacoes', nome: 'Operações', ico: <IcoDoc />, badge: String(operacoes.length) },
    {
      g: 'analise', nome: 'Análise de crédito', ico: <IcoDoc />,
      meta: ficha ? `${fmtData(ficha.data_analise)}${fichaDaHolding ? ' · da holding' : ''}` : 'sem análise',
    },
    {
      g: 'serasa', nome: 'Serasa', ico: <IcoEscudo />,
      meta: ficha?.serasa
        ? `${ficha.serasa.score !== null ? `score ${ficha.serasa.score}` : 'sem score'}${fichaDaHolding ? ' · da holding' : ''}`
        : 'sem análise',
    },
    {
      g: 'grupo', nome: 'Grupo e organograma', ico: <IcoRede />,
      meta: tomador.holding ? `holding: ${tomador.holding.razao_social.split(' ')[0]}…`
        : ficha?.estrutura ? `${ficha.estrutura.entidades.filter(e => e.tipo === 'emp').length} empresas`
        : nSocios ? `${nSocios} sócios` : 'a montar',
    },
    {
      g: 'demonstracoes', nome: 'Demonstrações', ico: <IcoGrafico />,
      meta: ficha ? `${ficha.exercicios.length} exercícios${fichaDaHolding ? ' · da holding' : ''}` : '—',
    },
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 className="mt-nome">{tomador.razao_social}</h1>
              {/* O vínculo de grupo econômico precisa aparecer AQUI, sem clicar em
                  nada: pedido do Marco em 18/09/2026, depois do caso Yuny (a SPE
                  Yuny Stan não mostrava, de forma nenhuma, que pertencia à holding). */}
              {tomador.holding ? (
                <button type="button" className="mt-chip co" style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/tomadores/${tomador.holding!.id}`)}
                  title={`Abrir a holding: ${tomador.holding.razao_social}`}>
                  <IcoRede size={12} /> Grupo: {tomador.holding.razao_social}
                </button>
              ) : nEmpresasDoGrupo > 0 ? (
                <button type="button" className="mt-chip co" style={{ cursor: 'pointer' }}
                  onClick={() => setGaveta('grupo')}
                  title="Ver as empresas vinculadas a esta holding">
                  <IcoRede size={12} /> Holding · {nEmpresasDoGrupo} empresa{nEmpresasDoGrupo > 1 ? 's' : ''} do grupo
                </button>
              ) : null}
            </div>
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
          {/* A ANÁLISE SAIU DAQUI EM 31/08/2026, e o componente continua no repositório.

              Ela lia o Supabase e, na maioria dos cards, aparecia vazia — porque o
              Supabase só tem a análise DEPOIS que a carga a publica. A triagem, que
              ela também mostrava, nunca esteve no banco: mora no motor.

              O mesmo conteúdo (por que parou, a triagem, reiniciar e a autorização)
              foi feito na aba **Análise** do card do Sistema de Análises, que lê o
              motor e por isso tem o dado de verdade. Decisão dele, perguntado em
              31/08/2026: a do cockpit manda.

              O que esta Mesa mostra da análise vem do BANCO, e chega lá por
              `scripts/carga-analises.mjs`. Ver a memória `publicar-a-analise-no-crm`. */}

          {gaveta === 'visao' && <GavetaVisao
            operacoes={operacoes} lmgTotal={c.lmgTotal} pct={c.pct} livre={c.livre} temLimite={c.limite > 0}
            tomador={tomador} ficha={ficha} anosAtividade={anosAtividade} estourou={c.estourou}
          />}

          {gaveta === 'fluxo' && <SecoesDoCard
            tomadorId={tomador.id}
            cnpj={tomador.cnpj}
            centralInicial={tomador.central_area}
            operacoes={operacoes.map(o => ({
              id: o.id, modalidade: o.modalidade, status: o.status,
              lmg: o.lmg, taxa: o.taxa, voto_subscricao: o.voto_subscricao ?? null,
            }))}
            analise={ficha ? {
              recomendacao: ficha.recomendacao,
              data_analise: ficha.data_analise,
              // `limiteNum` já vem null quando o motivo escrito anula o número:
              // a regra mora em lib/analise/ficha.ts, e não é refeita aqui.
              limite: ficha.limiteNum,
              limiteAnulado: !!ficha.limiteAviso,
            } : null}
            onMudou={carregar}
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

          {/* O confronto do limite só existe aqui: é o valor do CADASTRO contra o
              que a análise recomenda, e no acervo não há cadastro para confrontar.
              Sem conflito, `confronto` vai nulo e a seção sai igual à do acervo. */}
          {gaveta === 'analise' && <>
            {fichaDaHolding && tomador.holding && <AvisoFichaHolding nome={tomador.holding.razao_social} />}
            <SecaoAnalise
              ficha={ficha}
              confronto={conflitoLimite ? {
                limiteCadastro: c.limite, emitido: c.emitido, dataCadastro: tomador.data_entrada,
              } : null}
            />
            <SecaoTresCs ficha={ficha} />
            {/* A porta para a análise inteira, dentro do CRM. A Mesa mostra o
                que interessa ao TOMADOR; o relatório mostra a análise como ela
                foi publicada, com Serasa, organograma e demonstrações juntos. */}
            {ficha && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" style={{ padding: '7px 14px', fontSize: 13 }}
                  onClick={() => router.push(`/analises/${ficha.id}`)}>
                  Abrir o relatório completo da análise
                </button>
              </div>
            )}
          </>}

          {gaveta === 'serasa' && <>
            {fichaDaHolding && tomador.holding && <AvisoFichaHolding nome={tomador.holding.razao_social} />}
            <SecaoSerasa ficha={ficha} />
          </>}

          {gaveta === 'grupo' && (<>
            <VinculoHolding tomador={tomador} usuarioInfo={usuarioInfo} onMudou={carregar} />
            <Bloco titulo="Organograma societário" cor="#e8b84b"
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
          </>)}

          {gaveta === 'demonstracoes' && <>
            {fichaDaHolding && tomador.holding && <AvisoFichaHolding nome={tomador.holding.razao_social} />}
            <SecaoDemonstracoes ficha={ficha} />
          </>}

          {gaveta === 'documentos' && <>
            {fichaDaHolding && tomador.holding && <AvisoFichaHolding nome={tomador.holding.razao_social} />}
            <SecaoDocumentos ficha={ficha} />
          </>}

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

/** O aviso em toda gaveta que, sem análise própria, está mostrando a da
 *  holding vinculada (ver components/tomador/VinculoHolding). */
function AvisoFichaHolding({ nome }: { nome: string }) {
  return (
    <div className="mt-nota at" style={{ marginBottom: 10 }}>
      Este tomador não tem análise própria: os dados abaixo são da holding vinculada, <b>{nome}</b>.
    </div>
  )
}

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
    { lab: 'Score FAM', v: fmtScore(ficha?.score_final), s: ficha ? `análise de ${fmtData(ficha.data_analise)}` : 'sem análise', cor: '#1e4080' },
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
    txt: `Análise de crédito vigente · Score ${fmtScore(ficha.score_final)} · ${ficha.recomendacao ?? ''}`,
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
