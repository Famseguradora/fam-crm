'use client'

/* ============================================================================
   ANÁLISE DE CRÉDITO — a tela do menu Tomadores > Análise de crédito.

   ELA TEM DUAS CARAS, e o motivo é ONDE CADA COISA MORA.

   O motor da análise não é software de servidor: ele chama o Claude da máquina,
   lê PDF do OneDrive e faz OCR por PowerShell. Por isso ele continua rodando em
   127.0.0.1:7311, na máquina do Marco, e é lá que a análise é FEITA e EDITADA.
   Nesta máquina, esta tela é o sistema inteiro embutido — nada mudou.

   O QUE MUDOU EM 08/09/2026
   ---------------------------------------------------------------------------
   Até aqui esta tela era APENAS aquele iframe. Quem abrisse o CRM publicado (a
   subscritora, o celular, qualquer outro computador) recebia um recado dizendo
   que o sistema não respondeu — e não tinha o que fazer com aquilo. Na prática,
   a análise de crédito não existia fora da máquina do Marco.

   Agora, quando o sistema local não responde, a tela mostra O QUE O CRM TEM: as
   análises que a carga já publicou no banco. Vêm do Supabase, então abrem de
   qualquer lugar, inclusive do celular. Clicar numa delas abre a ficha do
   tomador, onde o relatório já é lido do banco (gaveta "Análise de crédito").

   ELA É A BASE DO PRÓXIMO SISTEMA (ordem dele, 08/09/2026)
   ---------------------------------------------------------------------------
   Por isso a lista não é uma tabela escrita à mão: as colunas são a lista
   `COLUNAS_TABELA`, e é dela que saem o cabeçalho, a ordenação por clique e a
   seta. Coluna nova = uma linha ali. Os filtros de situação são um só de cada
   vez, cada um com o seu número à vista.

   O QUE ESTA TELA NÃO FAZ, de propósito
   ---------------------------------------------------------------------------
    • não busca a lista em 127.0.0.1. A lista é banco, e só banco — é isso que
      faz ela funcionar fora da máquina onde o sistema roda;
    • não escreve nada. Editar a análise continua sendo no sistema, na máquina
      dele. Aqui é leitura;
    • não inventa o que o banco não tem: análise editada hoje só aparece depois
      que alguém rodar a carga (`npm run publicar`). Nada roda isso por horário.
   ============================================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtMoeda, fmtData, maskCNPJ, semEntidadesHtml } from '@/lib/utils'

/** O servidor de produção do Sistema de Análises. A oficina é a 7312. */
const SISTEMA = 'http://127.0.0.1:7311'

/** Onde a tela decidiu buscar o que mostra. */
type Onde = 'procurando' | 'local' | 'banco'

interface LinhaAnalise {
  id: string
  cnpj: string | null
  razao_social: string
  corretora: string | null
  grupo: string | null
  data_analise: string
  vigente: boolean
  revisada: boolean
  score_final: number | string | null
  rating_cod: string | null
  rating_txt: string | null
  recomendacao: string | null
  limite_recomendado_num: number | string | null
  limite_recomendado_motivo: string | null
  tomador_id: string | null
}

const COLUNAS = `
  id, cnpj, razao_social, corretora, grupo, data_analise, vigente, revisada,
  score_final, rating_cod, rating_txt, recomendacao,
  limite_recomendado_num, limite_recomendado_motivo, tomador_id
`

const num = (v: number | string | null): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Só os dígitos. "08.260.577/0001-44" e "08260577000144" são a mesma chave. */
const soDigitos = (cnpj: string | null | undefined) => String(cnpj ?? '').replace(/\D/g, '')

/** Sem acento e em minúscula, para a busca achar "São" digitando "sao". */
const chave = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** O texto como se lê. O relatório da análise era um HTML, e o que veio de
 *  dentro dele carrega marca de HTML: há razão social gravada como "Longitude
 *  Incorporação &Amp; Urbanismo". É defeito de EXIBIÇÃO, não de dado — o banco
 *  continua com o que a análise gravou, e desfazer isso na tela não perde nada. */
const limpo = (s: string | null | undefined) => semEntidadesHtml(s)

/** O Score FAM escrito como a própria análise publica: duas casas, vírgula. */
const fmtScore = (v: number | null): string => (v === null ? '—' : v.toFixed(2).replace('.', ','))

/** A TRAVA DO LIMITE, a mesma da ficha do tomador, repetida aqui de propósito.
 *  Motivo de anulação manda: quando ele existe, a carga ANULOU o número, e o
 *  campo não pode virar valor na tela. Afrouxar isto já pintou como limite um
 *  "R$ 727 milhões" que era outra coisa. Sem número, a célula manda ABRIR. */
const limiteConfiavel = (l: LinhaAnalise): number | null =>
  l.limite_recomendado_motivo ? null : num(l.limite_recomendado_num)

/* O vocabulário do acervo, conferido no banco: "Aprovar", "Reprovar", "Aprovar
   com ressalvas". A ressalva vem ANTES do aprovar de propósito: "Aprovar com
   ressalvas" contém "aprovar", e sem essa ordem sairia verde limpo. */
const corDaDecisao = (d: string | null): string => {
  const t = chave(d ?? '')
  if (/condicion|ressalva|restri/.test(t)) return 'badge-orange'
  if (/reprov|recus|negar|indefer/.test(t)) return 'badge-red'
  if (/aprovar|aprovad|defer/.test(t)) return 'badge-green'
  return 'badge-gray'
}

/* ── AS COLUNAS DA TABELA, e o que significa ordenar por cada uma ────────────

   A tabela é DESCRITA aqui, e não escrita à mão no cabeçalho. Quem criar uma
   coluna nova põe uma linha nesta lista e ganha o clique de ordenar junto, sem
   repetir JSX nem esquecer metade. Ele disse em 08/09/2026 que esta tela é a
   base do próximo sistema integrado: o que se repete tem que ser dado. */
type Coluna = 'empresa' | 'corretora' | 'data' | 'score' | 'rating' | 'decisao' | 'limite'
type Direcao = 'asc' | 'desc'

const COLUNAS_TABELA: {
  k: Coluna
  rotulo: string
  /** Coluna de número ou data: alinha à direita. */
  n?: boolean
  /** A direção do PRIMEIRO clique. Ninguém pede "o menor score primeiro" nem
   *  "a empresa de trás para a frente": o padrão é o que a pessoa quis dizer. */
  padrao: Direcao
  /** Por onde se ordena. `null` é ausência de dado, não o menor valor. */
  valor: (l: LinhaAnalise) => string | number | null
}[] = [
  { k: 'empresa', rotulo: 'Empresa', padrao: 'asc', valor: l => limpo(l.razao_social) || null },
  { k: 'corretora', rotulo: 'Corretora', padrao: 'asc', valor: l => limpo(l.corretora) || null },
  { k: 'data', rotulo: 'Data', n: true, padrao: 'desc', valor: l => l.data_analise || null },
  { k: 'score', rotulo: 'Score', n: true, padrao: 'desc', valor: l => num(l.score_final) },
  // Rating e decisão ordenam pela palavra, e a palavra já sai na ordem certa:
  // A3 antes de E6, e "Aprovar" · "Aprovar com ressalvas" · "Reprovar".
  { k: 'rating', rotulo: 'Rating', padrao: 'asc', valor: l => l.rating_cod ?? l.rating_txt ?? null },
  { k: 'decisao', rotulo: 'Decisão', padrao: 'asc', valor: l => l.recomendacao ?? null },
  { k: 'limite', rotulo: 'Limite recomendado', n: true, padrao: 'desc', valor: l => limiteConfiavel(l) },
]

/** Ordena por uma coluna, com os dois acertos que a lista pede:
 *  · linha SEM valor vai para o fim nos dois sentidos (ausência não é o menor
 *    número: inverter a ordem não pode jogar 26 traços para o alto da tela);
 *  · empate desempata pelo nome da empresa, para a lista não dançar sozinha a
 *    cada clique quando dez linhas têm o mesmo rating. */
function ordenar(linhas: LinhaAnalise[], k: Coluna, dir: Direcao): LinhaAnalise[] {
  const col = COLUNAS_TABELA.find(c => c.k === k) ?? COLUNAS_TABELA[2]
  const nome = (l: LinhaAnalise) => limpo(l.razao_social)
  const porNome = (a: LinhaAnalise, b: LinhaAnalise) => nome(a).localeCompare(nome(b), 'pt-BR')
  return [...linhas].sort((a, b) => {
    const va = col.valor(a)
    const vb = col.valor(b)
    if (va === null || vb === null) {
      if (va === vb) return porNome(a, b)
      return va === null ? 1 : -1
    }
    const r = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb), 'pt-BR')
    return (dir === 'desc' ? -r : r) || porNome(a, b)
  })
}

/** Os filtros de situação. "A revisar" é a análise que a máquina escreveu e
 *  ninguém conferiu ainda; "sem cadastro" é a que não chega em ficha nenhuma. */
type Situacao = 'todas' | 'revisadas' | 'a-revisar' | 'sem-cadastro'

export default function AnaliseCreditoPage() {
  const router = useRouter()
  const moldura = useRef<HTMLDivElement>(null)

  const [onde, setOnde] = useState<Onde>('procurando')

  /* POR QUE HÁ DOIS MOTIVOS DE FALHA, E NÃO UM (03/09/2026)

     A tela dizia sempre a mesma coisa: "o sistema não respondeu, dê duplo clique
     no Analisar.cmd". Em 03/09 o Marco viu isso com o sistema RODANDO, e o
     conselho o mandou fazer o que não resolvia.

     A causa era outra: o CRM publicado é https, o sistema é http em 127.0.0.1, e
     o Chrome trata isso como site público acessando a rede local. Ele bloqueia
     com "Permission was denied for this request to access the loopback address
     space", e o pedido nem chega ao servidor. Medido: o servidor mandando os
     cabeçalhos de Local Network Access ainda é bloqueado; só passa quando o
     usuário concede a permissão. Pelo localhost:3000 nada disso se aplica.

     Continua separado porque o recado de cada caso é diferente — e agora os dois
     são RODAPÉ, não parede: quem caiu aqui já está vendo as análises. */
  const [bloqueio, setBloqueio] = useState(false)

  const [linhas, setLinhas] = useState<LinhaAnalise[] | null>(null)
  const [erroBanco, setErroBanco] = useState('')
  /** CNPJ (só dígitos) → id do tomador, para a análise que ainda não foi ligada. */
  const [porCnpj, setPorCnpj] = useState<Map<string, string>>(new Map())

  const [busca, setBusca] = useState('')
  const [soVigentes, setSoVigentes] = useState(true)
  const [situacao, setSituacao] = useState<Situacao>('todas')
  const [coluna, setColuna] = useState<Coluna>('data')
  const [direcao, setDirecao] = useState<Direcao>('desc')

  // ── o sistema está no ar NESTA máquina? ──────────────────────────────────
  useEffect(() => {
    let vivo = true
    // Página servida por https só alcança 127.0.0.1 com permissão do navegador.
    const publicado = typeof window !== 'undefined' && window.location.protocol === 'https:'
    // 3s, e não 6: numa volta de loopback a resposta é instantânea, e quem vai
    // esperar esse tempo é justamente quem NÃO tem o sistema — a subscritora
    // olhando uma tela em branco antes da lista aparecer.
    const t = setTimeout(() => { if (vivo) { setOnde('banco'); setBloqueio(publicado) } }, 3000)

    fetch(`${SISTEMA}/api/status`)
      .then(r => r.json())
      .then(() => { if (vivo) { setOnde('local'); setBloqueio(false) } })
      .catch(() => { if (vivo) { setOnde('banco'); setBloqueio(publicado) } })
      .finally(() => clearTimeout(t))

    return () => { vivo = false; clearTimeout(t) }
  }, [])

  // ── as análises publicadas ───────────────────────────────────────────────
  // Buscadas JUNTO com a procura pelo sistema local, e não depois dela: quando
  // a procura falha, a lista já está pronta. São 147 linhas magras (sem o corpo
  // do relatório), então não há o que paginar.
  useEffect(() => {
    let vivo = true
    const supabase = createClient()

    supabase.from('analises').select(COLUNAS)
      .order('data_analise', { ascending: false }).limit(1000)
      .then(({ data, error }) => {
        if (!vivo) return
        if (error) setErroBanco(error.message)
        setLinhas((data ?? []) as unknown as LinhaAnalise[])
      })

    // A ponte com o cadastro. A carga liga a análise ao tomador por `tomador_id`,
    // mas análise publicada depois de 07/09/2026 nasce sem ele — casar por CNPJ
    // aqui é o que impede a lista de dizer "sem cadastro" para tomador que existe.
    supabase.from('tomadores').select('id, cnpj').limit(2000)
      .then(({ data }) => {
        if (!vivo) return
        const m = new Map<string, string>()
        for (const t of (data ?? []) as { id: string; cnpj: string | null }[]) {
          const d = soDigitos(t.cnpj)
          if (d.length === 14) m.set(d, t.id)
        }
        setPorCnpj(m)
      })

    return () => { vivo = false }
  }, [])

  // ── a altura do iframe ───────────────────────────────────────────────────
  // O sistema é uma tela inteira: precisa da janela menos tudo que está acima
  // dele. Esse "tudo" NÃO é um número fixo — são a barra do CRM, o ticker de
  // mercado, o de notícias (que tem um X e fecha) e as abas. Por isso é medido,
  // e não escrito no CSS. Só vale para a cara do iframe: a lista rola sozinha.
  useEffect(() => {
    if (onde !== 'local') return
    const el = moldura.current
    if (!el) return

    let ultima = -1
    const medir = () => {
      // `top` é medido contra a JANELA, não contra o documento: com a página
      // rolada ele encolhe, e a conta devolveria uma moldura alta demais. Somar
      // a rolagem devolve a distância de verdade até o topo, que não muda.
      const topo = Math.round(el.getBoundingClientRect().top + window.scrollY)
      // Sem piso de altura (01/09/2026). Havia um `Math.max(420, …)` aqui, e ele
      // era a segunda maneira de a página voltar a rolar: numa janela baixa, 420px
      // de moldura não cabiam nos ~330 que sobravam, o excedente virava rolagem e o
      // botão da IA sumia de novo. Esta tela é, por definição, a janela menos o que
      // está acima dela · pedir mais do que existe é o que não pode.
      const altura = Math.max(0, window.innerHeight - topo)
      // O GUARDA É A ALTURA, e não o topo (01/09/2026). Guardando o topo, mudar
      // só a ALTURA da janela não mexia nele: `medir` era chamado, saía na
      // primeira linha, e a moldura ficava com a altura da janela ANTIGA. A
      // página do CRM passava a rolar, e o botão da IA de Gestão — que é fixo no
      // rodapé do iframe, e não da janela — ia parar fora da tela.
      if (Math.abs(altura - ultima) < 1) return
      ultima = altura
      el.style.height = `${altura}px`
    }
    medir()

    // Não entra em laço: medir de novo dá a MESMA altura, e a segunda passada sai
    // no guarda acima.
    const ro = new ResizeObserver(medir)
    ro.observe(document.body)

    /* O CORPO SOZINHO NÃO CONTA A HISTÓRIA (01/09/2026). O container do CRM tem
       `min-height: 100vh`, então quando o ticker de notícias é FECHADO no X o corpo
       não encurta — ele já estava no mínimo —, o observador não acorda e a moldura
       fica com a altura de antes, deixando uma faixa morta no pé da janela.

       Quem empurra a moldura para baixo é tudo que vem ACIMA dela: a barra do CRM,
       o ticker de mercado, o de notícias e as abas. Então é isso que se observa —
       cada irmão anterior na cadeia de pais, que é exatamente o conjunto de quem
       muda o topo. Sem lista de seletores: o dia em que nascer mais uma faixa lá em
       cima, ela já entra sozinha. */
    for (let no: HTMLElement | null = el; no && no !== document.body; no = no.parentElement) {
      for (let irmao = no.previousElementSibling; irmao; irmao = irmao.previousElementSibling) {
        ro.observe(irmao)
      }
    }

    window.addEventListener('resize', medir)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', medir)
      el.style.height = ''
    }
  }, [onde])

  /** A ficha onde esta análise pode ser lida inteira, ou `null` se nenhum
   *  tomador do CRM alcança este CNPJ. */
  const fichaDe = useCallback((l: LinhaAnalise): string | null =>
    l.tomador_id ?? porCnpj.get(soDigitos(l.cnpj)) ?? null, [porCnpj])

  // O que os filtros contam: a lista com o interruptor das vigentes já aplicado,
  // mas SEM a busca. Contar só o que a busca deixou passar faria os números dos
  // filtros mudarem a cada letra digitada, e ninguém consegue mirar num alvo
  // que se mexe.
  const escopo = useMemo(
    () => (linhas ?? []).filter(l => (soVigentes ? l.vigente : true)),
    [linhas, soVigentes])

  const contagem = useMemo(() => ({
    total: linhas?.length ?? 0,
    vigentes: (linhas ?? []).filter(l => l.vigente).length,
    noEscopo: escopo.length,
    revisadas: escopo.filter(l => l.revisada).length,
    aRevisar: escopo.filter(l => !l.revisada).length,
    semCadastro: escopo.filter(l => !fichaDe(l)).length,
  }), [linhas, escopo, fichaDe])

  const vistas = useMemo(() => {
    const q = chave(busca.trim())
    const digitos = q.replace(/\D/g, '')

    let r = escopo
    if (situacao === 'revisadas') r = r.filter(l => l.revisada)
    if (situacao === 'a-revisar') r = r.filter(l => !l.revisada)
    if (situacao === 'sem-cadastro') r = r.filter(l => !fichaDe(l))
    if (q) {
      r = r.filter(l => {
        const texto = chave(limpo([l.razao_social, l.corretora, l.grupo].filter(Boolean).join(' ')))
        // CNPJ casa por dígito, para funcionar com ou sem máscara digitada.
        return texto.includes(q) || (digitos.length >= 3 && !!l.cnpj?.includes(digitos))
      })
    }
    return ordenar(r, coluna, direcao)
  }, [escopo, busca, situacao, coluna, direcao, fichaDe])

  /** Clicar no título: na mesma coluna, inverte; em outra, entra na direção que
   *  aquela coluna pede. */
  const clicarNoTitulo = (k: Coluna) => {
    if (k === coluna) { setDirecao(d => (d === 'asc' ? 'desc' : 'asc')); return }
    setColuna(k)
    setDirecao(COLUNAS_TABELA.find(c => c.k === k)?.padrao ?? 'asc')
  }

  return (
    <div ref={moldura} style={{ display: 'flex', flexDirection: 'column' }}>
      {onde === 'local' && (
        <iframe
          src={SISTEMA}
          title="Sistema de Análises de Crédito FAM"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
      )}

      {onde === 'procurando' && (
        <div style={{
          margin: 28, color: '#6080a0', fontSize: 14,
          fontFamily: "'Calibri','Segoe UI',sans-serif",
        }}>
          Procurando o sistema de análise…
        </div>
      )}

      {onde === 'banco' && (
        /* A tela é de largura cheia (está na lista TELA_CHEIA do DashboardShell),
           então o respiro é dela mesma. `clamp` para o celular não perder 32px de
           cada lado. */
        <div style={{ padding: 'clamp(16px, 3vw, 28px) clamp(12px, 3vw, 32px) 30px' }}>
          <div style={{ marginBottom: 14 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0a1628', margin: 0 }}>
              Análises de crédito
            </h1>
            <p style={{ color: 'var(--soft)', fontSize: 14, margin: '6px 0 0', maxWidth: '86ch', lineHeight: 1.6 }}>
              As análises publicadas no banco do CRM. Abrem de qualquer computador e do
              celular. Clique numa empresa para ler a análise inteira na ficha dela.
            </p>
          </div>

          {erroBanco && <div className="alert-error" style={{ marginBottom: 14 }}>{erroBanco}</div>}

          <div className="card-panel" style={{ padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <input
                type="search"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Empresa, CNPJ, corretora ou grupo"
                aria-label="Procurar uma análise"
                style={{
                  flex: '1 1 260px', minWidth: 0, padding: '8px 11px', fontSize: 13.5,
                  border: '1px solid var(--border)', borderRadius: 8, background: '#fff',
                }}
              />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#22344d' }}>
                <input type="checkbox" checked={soVigentes} onChange={e => setSoVigentes(e.target.checked)} />
                Só as vigentes
              </label>
              {linhas && (
                <span className="badge badge-blue">
                  {contagem.vigentes} vigentes · {contagem.total - contagem.vigentes} históricas
                </span>
              )}
            </div>

            {/* ── OS FILTROS DE SITUAÇÃO ──
                Um de cada vez, e não caixas que se somam: "revisadas E a revisar"
                é a lista inteira, e "revisadas E sem cadastro" é uma pergunta que
                ninguém faz. Cada botão traz o seu número, então dá para ver o
                tamanho de cada monte antes de clicar. */}
            {linhas && (
              <div role="group" aria-label="Filtrar por situação"
                style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 11 }}>
                {([
                  { s: 'todas', rotulo: 'Todas', conta: contagem.noEscopo, cor: 'badge-blue',
                    dica: 'Todas as análises da lista' },
                  { s: 'revisadas', rotulo: 'Revisadas', conta: contagem.revisadas, cor: 'badge-green',
                    dica: 'Você já conferiu e ajustou os números destas' },
                  { s: 'a-revisar', rotulo: 'Aguardando revisão', conta: contagem.aRevisar, cor: 'badge-yellow',
                    dica: 'Ainda são os números que a máquina gerou · ninguém conferiu' },
                  { s: 'sem-cadastro', rotulo: 'Sem cadastro no CRM', conta: contagem.semCadastro, cor: 'badge-orange',
                    dica: 'A empresa não tem tomador cadastrado, então a análise não chega em ficha nenhuma' },
                ] as { s: Situacao; rotulo: string; conta: number; cor: string; dica: string }[]).map(f => {
                  const ativo = situacao === f.s
                  return (
                    <button key={f.s} type="button" title={f.dica}
                      aria-pressed={ativo}
                      onClick={() => setSituacao(f.s)}
                      className={`badge ${ativo ? f.cor : 'badge-gray'}`}
                      style={{
                        cursor: 'pointer',
                        border: ativo ? '1px solid currentColor' : '1px solid transparent',
                        opacity: ativo || f.conta > 0 ? 1 : 0.55,
                      }}>
                      {f.rotulo} <b style={{ marginLeft: 3 }}>{f.conta}</b>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {linhas === null ? (
            <div className="card-panel">
              <p style={{ color: 'var(--soft)', fontSize: 14, margin: 0 }}>Carregando as análises…</p>
            </div>
          ) : vistas.length === 0 ? (
            <div className="card-panel">
              <p style={{ color: 'var(--soft)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                {contagem.total === 0
                  ? 'Nenhuma análise publicada no banco. Quem publica é a carga, na máquina onde as análises rodam.'
                  : situacao !== 'todas'
                    ? 'Nenhuma análise nesse filtro com essa busca. Clique em "Todas" para ver a lista inteira.'
                    : 'Nenhuma análise com essa busca. Tente outro nome, ou desligue "Só as vigentes" para ver as versões anteriores.'}
              </p>
            </div>
          ) : (
            <div className="card-panel" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="mt-tab-wrap">
                <table className="mt-tab">
                  {/* O título É o botão de ordenar: o `th` fica sem recheio e o
                      botão ocupa a célula inteira, para o alvo do clique ser a
                      coluna toda e não sete letras. A seta some quando a coluna
                      não é a ativa (fica fraca, não invisível: é ela que conta
                      que dá para clicar). */}
                  <thead>
                    <tr>
                      {COLUNAS_TABELA.map(c => {
                        const ativa = coluna === c.k
                        return (
                          <th key={c.k} style={{ padding: 0 }}
                            aria-sort={ativa ? (direcao === 'asc' ? 'ascending' : 'descending') : 'none'}>
                            <button type="button" onClick={() => clicarNoTitulo(c.k)}
                              title={`Ordenar por ${c.rotulo}`}
                              style={{
                                width: '100%', display: 'inline-flex', alignItems: 'center', gap: 5,
                                justifyContent: c.n ? 'flex-end' : 'flex-start',
                                padding: '11px 14px', background: 'none', border: 'none',
                                fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700,
                                textTransform: 'uppercase', letterSpacing: '.8px',
                                color: ativa ? '#1e4080' : '#8ba3c0',
                                whiteSpace: 'nowrap', cursor: 'pointer',
                              }}>
                              {c.rotulo}
                              <span aria-hidden style={{ fontSize: 8, opacity: ativa ? 1 : 0.35 }}>
                                {ativa && direcao === 'asc' ? '▲' : '▼'}
                              </span>
                            </button>
                          </th>
                        )
                      })}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {vistas.map(l => {
                      const ficha = fichaDe(l)
                      const lim = limiteConfiavel(l)
                      return (
                        <tr
                          key={l.id}
                          style={{ cursor: ficha ? 'pointer' : 'default' }}
                          onClick={ficha ? () => router.push(`/tomadores/${ficha}`) : undefined}
                          title={ficha
                            ? 'Abrir a ficha do tomador · a análise inteira está na gaveta "Análise de crédito"'
                            : 'Esta empresa ainda não tem cadastro de tomador no CRM, e por isso a análise não tem ficha para abrir'}
                        >
                          <td>
                            <div style={{ fontWeight: 700, color: '#0a1628' }}>
                              {limpo(l.razao_social)}
                              {!l.vigente && (
                                <span className="badge badge-gray" style={{ marginLeft: 7, fontSize: 10 }}>histórica</span>
                              )}
                              {l.vigente && !l.revisada && (
                                <span className="badge badge-yellow" style={{ marginLeft: 7, fontSize: 10 }}>a revisar</span>
                              )}
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--soft)', fontVariantNumeric: 'tabular-nums' }}>
                              {l.cnpj ? maskCNPJ(l.cnpj) : 'sem CNPJ'}
                              {l.grupo ? ` · ${limpo(l.grupo)}` : ''}
                            </div>
                          </td>
                          <td style={{ whiteSpace: 'normal', maxWidth: 190 }}>{limpo(l.corretora) || '—'}</td>
                          <td className="dim">{fmtData(l.data_analise)}</td>
                          <td className="n">{fmtScore(num(l.score_final))}</td>
                          <td>{l.rating_cod ?? l.rating_txt ?? '—'}</td>
                          <td>
                            {l.recomendacao
                              ? <span className={`badge ${corDaDecisao(l.recomendacao)}`}>{l.recomendacao}</span>
                              : '—'}
                          </td>
                          {/* Sem número confiável a célula manda ABRIR, e o motivo
                              fica no title. O texto inteiro está na análise; um
                              número inventado aqui viraria decisão errada. */}
                          <td className="n" title={lim === null ? (l.limite_recomendado_motivo ?? 'a análise não deu um número; abra para ler') : undefined}>
                            {lim === null ? <span style={{ color: '#a07b1e' }}>ver</span> : fmtMoeda(lim)}
                          </td>
                          <td className="seta" style={{ textAlign: 'right' }}>
                            {ficha
                              ? '›'
                              : <span className="badge badge-orange" style={{ fontSize: 10 }}>sem cadastro</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 12, lineHeight: 1.6, maxWidth: '92ch' }}>
            Mostrando {vistas.length} de {contagem.total}, ordenadas por{' '}
            <b>{(COLUNAS_TABELA.find(c => c.k === coluna)?.rotulo ?? '').toLowerCase()}</b>{' '}
            ({direcao === 'asc' ? 'crescente' : 'decrescente'}). Esta lista é o que a carga publicou no
            banco — <b>nada a roda por horário</b>, então uma análise editada hoje aparece aqui
            depois que alguém publicar.
          </div>

          {/* ── o rodapé de quem está NA máquina do sistema ──
              Rodapé, e não parede: para a subscritora isto é curiosidade, e para o
              Marco é o recado de por que o sistema não abriu embutido. */}
          <div style={{
            marginTop: 18, padding: '12px 14px', background: '#f7fafd',
            border: '1px solid var(--border)', borderRadius: 9,
            color: '#46617f', fontSize: 12.5, lineHeight: 1.65, maxWidth: '92ch',
          }}>
            {bloqueio ? (
              <>
                <b style={{ color: '#0a1628' }}>O sistema de análise não abriu aqui dentro.</b>{' '}
                Você abriu o CRM pelo endereço da internet, que é seguro (https), e o sistema roda
                na máquina do analista em <code>{SISTEMA}</code> — o Chrome bloqueia esse caminho
                até alguém autorizar, então <b>ele pode estar ligado normalmente</b>. Quem trabalha
                nele deve abrir o CRM em <code>http://localhost:3000</code>, na própria máquina.
              </>
            ) : (
              <>
                <b style={{ color: '#0a1628' }}>O sistema de análise não respondeu.</b>{' '}
                Ele roda na máquina do analista, em <code>{SISTEMA}</code>, e é lá que a análise é
                feita e editada. Nessa máquina, o caminho é dar duplo clique em{' '}
                <code>Analisar.cmd</code> e recarregar esta tela — o sistema aparece aqui dentro,
                no lugar desta lista.
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
