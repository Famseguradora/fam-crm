'use client'

/* O PAINEL DO E-MAIL · o Carteiro gerencial
   ═══════════════════════════════════════════════════════════════════════════

   Ordem do Marco, 10/09/2026: "NÃO QUERO MAIS UMA TELA DE OUTLOOK (...)
   E-mail vivo, analítico, capaz de aumentar a minha capacidade de
   performance."

   E a de 11/09/2026, que virou esta tela: "eu peço uma análise ao Agente de IA
   carteiro sobre os e-mails recebidos na data de 10/09, então ele me informa:
   você recebeu 50 e-mails, dos quais 35 são demandas... a conclusão é que você
   tem 10 análises de crédito para fazer hoje com data de ontem". E, sobre o
   número: "a contagem é sempre o resultado matemático".

   A ORDEM DA TELA:
     1. o período (hoje, ontem, 7 dias, 30 dias, tudo, ou um dia escolhido)
     2. A PONTE: dos recebidos até o que há a fazer, fechando a conta
     3. o passivo de qualquer data, numa linha
     4. a fila do degrau escolhido, um pedido por linha, com teclado e recibo
     5. a caixa de e-mail (a visualização do Outlook, aberta)
     6. a porta de entrada no período (tempo até ser resolvido)
     7. os mais antigos parados, recolhidos

   QUEM FAZ A CONTA: lib/email/ponte.ts, lib/email/classificar.ts e
   lib/email/regua.ts, puros e testados (npm run email:ponte:test). Esta tela
   só busca, desenha e manda as ações.

   Design: components/painel/Painel.tsx e lib/ui/painel.ts, conforme
   docs/DESIGN-PAINEL.md. Nenhum hex redigitado aqui. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { SecaoPainel, Moldura, Aviso } from '@/components/painel/Painel'
import { cor, corDaArea, texto, raio, botaoCheio, botaoVazado } from '@/lib/ui/painel'
import { lerPedido, resumir, horasTexto, estadoDoPedido, METAS_PADRAO, type LinhaPedido, type MetasEmail } from '@/lib/email/metricas'
import { lerVersao, reguaVigente, type VersaoRegua } from '@/lib/email/regua'
import type { ClassificacaoGravada } from '@/lib/email/classificar'
import { janelaDoPeriodo, montarPonte, passivoDa, PERIODOS_PONTE, type Demanda, type PeriodoId } from '@/lib/email/ponte'
import PonteDoDia, { type Selecao } from './PonteDoDia'
import FilaPedidos, { type AcoesFila, type TipoDecisao } from './FilaPedidos'
import TriagemEmLote from './TriagemEmLote'

type LinhaPonte = LinhaPedido & { previa?: string | null; anexos?: { nome?: string | null }[] | null }

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/* A ORDEM DA TELA, trocada em 11/09/2026 ("a visualização dos e-mails igual o
   outlook deve ficar em cima, aberta"): a caixa vem de fora, em `caixa`,
   porque é a página que sabe recarregar os casos quando um e-mail vira caso. */
export default function PainelEmail({ aoMudar, caixa }: {
  aoMudar?: () => void
  /** A caixa de e-mail crua, desenhada logo abaixo da fila. */
  caixa?: React.ReactNode
}) {
  const router = useRouter()
  const { somenteLeitura } = usePermissoes()

  const [linhas, setLinhas] = useState<LinhaPonte[]>([])
  const [versoes, setVersoes] = useState<VersaoRegua[]>([])
  const [modalidades, setModalidades] = useState<string[]>([])
  const [gravadas, setGravadas] = useState<ClassificacaoGravada[]>([])
  const [metas, setMetas] = useState<MetasEmail>(METAS_PADRAO)

  /* "Ontem" é o período de entrada: é o ritual que ele descreveu ("10 análises
     para fazer hoje com data de ontem"). */
  const [periodo, setPeriodo] = useState<PeriodoId>('ontem')
  const [dia, setDia] = useState('')
  const [selecao, setSelecao] = useState<Selecao>('a_fazer')

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [semRegua, setSemRegua] = useState(false)
  const [ocupado, setOcupado] = useState('')
  const [chegouAgora, setChegouAgora] = useState(0)
  const [verCaixa, setVerCaixa] = useState(true)
  const [verAntigos, setVerAntigos] = useState(false)
  const [iaLigada, setIaLigada] = useState(false)
  const [iaLendo, setIaLendo] = useState('')
  const [iaRecado, setIaRecado] = useState('')
  const conhecidos = useRef<Set<string> | null>(null)

  /* UM INSTANTE SÓ PARA A TELA INTEIRA. Se cada peça chamasse `new Date()`, um
     e-mail poderia estar vencido na ponte e no prazo na fila. */
  const [agora, setAgora] = useState(() => new Date())

  const carregar = useCallback(async () => {
    const supabase = createClient()
    const [pedidos, m, regua, mods, classes, iaCfg] = await Promise.all([
      /* 3.000 e não 1.000: com o limite baixo, "tudo" deixava de ser tudo, e o
         RE cujo primeiro e-mail ficava de fora virava pedido novo. Em 11/09 são
         278 e-mails; o dia em que isso apertar, a conta vai para o servidor. */
      supabase.from('painel_pedidos').select('*').order('recebido_em', { ascending: false, nullsFirst: false }).limit(3000),
      supabase.from('email_metas').select('*').eq('id', true).maybeSingle(),
      supabase.from('email_regua').select('versao, parametros, motivo, criada_por_nome, criada_em').order('versao'),
      supabase.from('modalidades').select('nome'),
      supabase.from('email_classificacao').select('*').limit(5000),
      supabase.from('ia_config').select('api_ligada').eq('id', 1).maybeSingle(),
    ])
    if (pedidos.error) setErro(pedidos.error.message)
    const lista = (pedidos.data ?? []) as LinhaPonte[]

    /* "CHEGOU E-MAIL NOVO", pela IDENTIDADE e não pela contagem: pela contagem,
       um e-mail que sai junto com outro que entra passaria calado. */
    const candidatos = new Set(lista.filter((l) => estadoDoPedido(l) === 'a_classificar').map((l) => l.id))
    if (conhecidos.current) {
      let novos = 0
      for (const id of candidatos) if (!conhecidos.current.has(id)) novos++
      if (novos) setChegouAgora((n) => n + novos)
    }
    conhecidos.current = candidatos

    setLinhas(lista)
    if (m.data) setMetas({ ...METAS_PADRAO, ...m.data })
    // Sem a migration do Carteiro gerencial a tela segue: a ponte fica sem régua e diz isso.
    setSemRegua(!!regua.error || !(regua.data ?? []).length)
    // Lida com desconfiança: uma versão malformada gravada por fora não derruba a tela.
    setVersoes(((regua.data ?? []) as Parameters<typeof lerVersao>[0][]).map(lerVersao) as VersaoRegua[])
    setModalidades([...new Set((mods.data ?? []).map((x) => String(x.nome)))])
    setGravadas((classes.data ?? []) as ClassificacaoGravada[])
    setIaLigada(!!iaCfg.data?.api_ligada)
    setAgora(new Date())
    setCarregando(false)
  }, [])

  /* AO VIVO PELA TRILHA, E NÃO PELAS TABELAS. `emails_caixa` recebe UPDATE em
     massa a cada varredura do Carteiro; a trilha só ganha linha quando algo de
     verdade muda (inclusive uma classificação). A régua nova também chega sozinha.
     A espera de 1,5 s junta uma rajada numa recarga só. */
  useEffect(() => {
    const supabase = createClient()
    let espera: ReturnType<typeof setTimeout> | null = null
    const recarregarLogo = () => {
      if (espera) clearTimeout(espera)
      espera = setTimeout(() => { espera = null; carregar() }, 1500)
    }
    const canal = supabase
      .channel('painel-email')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'email_fluxo_eventos' }, recarregarLogo)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'email_regua' }, recarregarLogo)
      .subscribe()
    // A primeira leitura sai no próximo tique, fora do corpo do efeito.
    const primeira = setTimeout(carregar, 0)
    const t = setInterval(carregar, 60_000)
    return () => {
      if (espera) clearTimeout(espera)
      clearTimeout(primeira)
      supabase.removeChannel(canal)
      clearInterval(t)
    }
  }, [carregar])

  const janela = useMemo(() => janelaDoPeriodo(periodo, agora, dia), [periodo, agora, dia])
  const vigente = reguaVigente(versoes)
  const excluidas = vigente?.parametros.excluidas ?? []

  const { ponte, ponteTudo, resumo } = useMemo(() => {
    const entrada = { versoes, modalidades, gravadas, metas, agora }
    return {
      ponte: montarPonte(linhas, { ...entrada, janela }),
      ponteTudo: montarPonte(linhas, { ...entrada, janela: janelaDoPeriodo('tudo', agora) }),
      resumo: resumir(linhas.map((l) => lerPedido(l, metas, agora)), metas, janela.desde, janela.ate),
    }
  }, [linhas, versoes, modalidades, gravadas, metas, agora, janela])

  const passivo = passivoDa(ponteTudo, agora)
  const maisAntigos: Demanda[] = useMemo(
    () => ponteTudo.demandas
      .filter((d) => (d.balde === 'a_fazer' || d.balde === 'sem_classificacao') && d.parado)
      .sort((a, b) => b.horas - a.horas)
      .slice(0, 5),
    [ponteTudo],
  )

  /* OS CASOS DO PERÍODO, para a triagem em lote: os pedidos resolvidos que
     viraram caso. É "os 10 elegíveis de ontem que eu trouxe". */
  const casosDoPeriodo = useMemo(() => {
    const mapa: Record<string, { titulo: string; numero?: number | null }> = {}
    for (const d of ponte.demandas) {
      if (!d.resolvido) continue
      for (const e of d.emails) {
        if (e.caso_id) mapa[e.caso_id] = { titulo: e.razao_social || d.tomador || String(d.primeiro.assunto ?? ''), numero: e.caso_numero ?? null }
      }
    }
    return mapa
  }, [ponte])

  /* O QUE A IA PODE LER: os pedidos sem classificação do período que ainda não
     passaram por ela. Vai o e-mail representante de cada pedido (o mais
     recente com anexo), que é o que costuma trazer mais contexto. */
  const alvosDaIA = useMemo(() => {
    const comIA = new Set(gravadas.filter((g) => g.origem === 'ia').map((g) => g.email_id))
    return ponte.demandas
      .filter((d) => d.balde === 'sem_classificacao' && !d.emails.some((e) => comIA.has(e.id)))
      .map((d) => d.representante.id)
  }, [ponte, gravadas])

  async function pedirIA() {
    const ids = alvosDaIA
    if (!ids.length) return
    setErro('')
    setIaRecado('')
    let lidos = 0
    let semCerteza = 0
    let custo = 0
    for (let i = 0; i < ids.length; i += 40) {
      setIaLendo(`A IA está lendo ${Math.min(i + 40, ids.length)} de ${ids.length}…`)
      try {
        const r = await fetch('/api/email/classificar-ia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: ids.slice(i, i + 40) }),
        })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) { setErro(j.erro ?? 'A IA não conseguiu classificar.'); break }
        lidos += j.classificados ?? 0
        semCerteza += j.sem_certeza ?? 0
        custo += j.custo_usd ?? 0
        if (j.parou) { setErro(j.parou); break }
      } catch {
        setErro('A conexão caiu no meio da leitura da IA. O que já foi lido ficou gravado.')
        break
      }
    }
    setIaLendo('')
    if (lidos) {
      setIaRecado(
        `A IA leu ${plural(lidos, 'pedido', 'pedidos')}` +
        (semCerteza ? `; ${semCerteza} sem certeza continuam sem classificação` : '') +
        ` · US$ ${custo.toFixed(2).replace('.', ',')}`,
      )
    }
    await carregar()
  }

  /* ── as ações ────────────────────────────────────────────────────────────── */

  const postar = useCallback(async (url: string, corpo: Record<string, unknown>): Promise<boolean> => {
    setErro('')
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(j.erro ?? 'Não consegui.'); return false }
      return true
    } catch {
      setErro('A conexão caiu. Tente de novo.')
      return false
    }
  }, [])

  const acoes: AcoesFila = useMemo(() => {
    const comOcupado = async (chave: string, fazer: () => Promise<boolean>) => {
      setOcupado(chave)
      const ok = await fazer()
      setOcupado('')
      await carregar()
      aoMudar?.()
      return ok
    }
    return {
      trazer: (d) => {
        const rep = d.representante
        // Na hora: a linha já diz "trazendo" antes do servidor responder.
        setLinhas((ls) => ls.map((l) => (l.id === rep.id ? { ...l, estado: 'a_trazer' } : l)))
        comOcupado(d.id, () => postar('/api/caixa', { acao: 'trazer', ids: [rep.id] }))
      },
      classificar: async (ids, tipo: TipoDecisao | null, extra) => {
        const antes = gravadas
        const agoraIso = new Date().toISOString()
        setGravadas((gs) => [
          ...gs.filter((g) => !(g.origem === 'humano' && ids.includes(g.email_id))),
          ...(tipo === null ? [] : ids.map((email_id) => ({
            email_id, origem: 'humano' as const, tipo, modalidade: extra?.modalidade ?? null, cnpj: null, tomador: null,
            confianca: 'seguro' as const, motivo: extra?.motivo ?? null, recibo: null, regua_versao: vigente?.versao ?? null,
            classificado_por: 'você', classificado_em: agoraIso,
          }))),
        ])
        const ok = await comOcupado(ids[0], () => postar('/api/email/classificar', { ids, tipo, ...extra }))
        if (!ok) setGravadas(antes)
        return ok
      },
      jaAnalisado: (ids, desfazer) => comOcupado(ids[0], () => postar('/api/caixa', { acao: 'ja_analisado', ids, desfazer: !!desfazer })),
      aguardar: (ids, motivo) => comOcupado(ids[0], () => postar('/api/caixa', { acao: 'aguardar', ids, motivo })),
      voltarDoAguardo: (ids) => comOcupado(ids[0], () => postar('/api/caixa', { acao: 'aguardar', ids, voltar: true })),
      cobrar: (ids) => comOcupado(ids[0], () => postar('/api/caixa', { acao: 'cobrar', ids })),
      abrirCaso: (id) => router.push(`/comercial/${id}`),
    }
  }, [carregar, aoMudar, postar, gravadas, vigente, router])

  const cores = corDaArea('comercial')
  const pctNoPrazo = resumo.com_tempo ? Math.round((resumo.no_prazo / resumo.com_tempo) * 100) : null
  const hojeISO = new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10)

  return (
    <div>
      {/* ── o período ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div role="group" aria-label="Período" style={{ display: 'flex', gap: 2, background: cor.bordaSuave, padding: 3, borderRadius: raio.controle }}>
          {PERIODOS_PONTE.map((p) => {
            const ativo = periodo === p.id
            return (
              <button
                key={p.id}
                type="button"
                className="painel-alvo"
                aria-pressed={ativo}
                onClick={() => { setPeriodo(p.id); setDia('') }}
                style={{
                  border: 'none', cursor: 'pointer', padding: '5px 11px',
                  borderRadius: raio.controle - 2, fontSize: 12.5, fontWeight: 600,
                  background: ativo ? cor.papel : 'transparent',
                  color: ativo ? cor.tinta : cor.textoSub,
                }}
              >
                {p.nome}
              </button>
            )
          })}
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...texto.apoio }}>
          <span>ou o dia</span>
          <input
            type="date"
            className="fam-input painel-alvo"
            value={periodo === 'dia' ? dia : ''}
            max={hojeISO}
            onChange={(ev) => { if (ev.target.value) { setDia(ev.target.value); setPeriodo('dia') } }}
            style={{ width: 'auto', padding: '4px 8px', fontSize: 16 }}
          />
        </label>

        <span style={{ flex: 1 }} />

        {chegouAgora > 0 && (
          <button
            type="button"
            className="painel-alvo"
            onClick={() => { setChegouAgora(0); setPeriodo('hoje'); setSelecao('sem_classificacao') }}
            style={{ ...botaoCheio, display: 'inline-flex', alignItems: 'center', gap: 7, background: cor.areaOperacao }}
          >
            <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: cor.papel }} />
            {plural(chegouAgora, 'e-mail novo', 'e-mails novos')}
          </button>
        )}
      </div>

      {erro && <div style={{ marginBottom: 12 }}><Aviso tom="erro">{erro}</Aviso></div>}

      {/* ══ A PONTE ═════════════════════════════════════════════════════════ */}
      <SecaoPainel
        nome={`E-mails de pedido de análise · ${janela.frase}`}
        cor={cores}
        acao={
          <Link
            href="/comercial/regua"
            style={{ ...texto.apoio, fontWeight: 600, color: cor.tinta2, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
            title="Os parâmetros que decidem o que é pedido, a modalidade e o apetite"
          >
            {vigente ? `Régua v${vigente.versao}` : 'Régua'} <span aria-hidden>›</span>
          </Link>
        }
      >
        {carregando ? (
          <Aviso>Lendo os e-mails e a régua…</Aviso>
        ) : (
          <div style={{ background: cor.papel, border: `1px solid ${cor.borda}`, borderRadius: raio.cartao, padding: '10px 8px 8px' }}>
            {semRegua && (
              <div style={{ margin: '0 4px 10px' }}>
                <Aviso>A régua ainda não existe no banco: sem ela, nenhum pedido é classificado e todos ficam sem classificação.</Aviso>
              </div>
            )}
            {!ponte.fecha && (
              <div style={{ margin: '0 4px 10px' }}>
                <Aviso tom="erro">A conta da ponte não fechou neste período. Isso é defeito do sistema, e não do e-mail: avise.</Aviso>
              </div>
            )}
            <PonteDoDia ponte={ponte} selecionado={selecao} aoSelecionar={setSelecao} excluidas={excluidas} />

            {/* A IA NA PONTE: um botão, e só quando há o que ela ler. A régua
                continua decidindo o apetite; a IA só diz o que o e-mail é. */}
            {!somenteLeitura && (alvosDaIA.length > 0 || !!iaLendo || !!iaRecado) && (
              <div style={{ margin: '10px 12px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                {(alvosDaIA.length > 0 || !!iaLendo) && (
                  <button
                    type="button"
                    className="painel-alvo"
                    disabled={!iaLigada || !!iaLendo}
                    onClick={pedirIA}
                    title={iaLigada
                      ? 'A IA lê o assunto, o nome dos anexos e o começo do e-mail (sem CPF, telefone nem endereço de pessoa) e diz o tipo e a modalidade, com o trecho que sustenta.'
                      : 'A IA pela API está desligada. Quem liga é o proprietário, no painel da IA (Ctrl+I).'}
                    style={{ ...botaoVazado, padding: '5px 12px', fontSize: 12, borderColor: cor.ouro, opacity: !iaLigada || iaLendo ? 0.6 : 1, cursor: !iaLigada ? 'not-allowed' : iaLendo ? 'progress' : 'pointer' }}
                  >
                    {iaLendo || `Pedir à IA para ler ${alvosDaIA.length === 1 ? 'o pedido' : `os ${alvosDaIA.length} pedidos`} sem classificação`}
                  </button>
                )}
                <span style={texto.nota}>
                  {iaRecado || (iaLigada ? 'A régua decide o apetite; a IA só diz o que o e-mail é, e cada decisão fica com recibo.' : 'A IA pela API está desligada.')}
                </span>
              </div>
            )}
            <div style={{ ...texto.nota, margin: '8px 12px 2px', display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
              <span>
                origem: e-mails da caixa por data de chegada; pedido = o e-mail que abriu o assunto; julgados pela régua que valia quando chegaram
                {ponte.versoes_usadas.length ? ` (v${ponte.versoes_usadas.join(', v')})` : ''}
              </span>
            </div>
          </div>
        )}
      </SecaoPainel>

      {/* ── o passivo de qualquer data, numa linha ── */}
      {!carregando && passivo.abertos > 0 && periodo !== 'tudo' && (
        <div style={{ margin: '-6px 0 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, ...texto.apoio }}>
          <span>
            De qualquer data: <b style={{ color: cor.tinta }}>{plural(passivo.abertos, 'pedido aberto', 'pedidos abertos')}</b>
            {passivo.sem_classificacao ? ` (${passivo.sem_classificacao} sem classificação)` : ''}
            {passivo.parados ? <> · <b style={{ color: cor.alerta }}>{plural(passivo.parados, 'parado', 'parados')}</b></> : ''}
            {passivo.mais_velho_dias !== null ? ` · o mais velho chegou há ${Math.floor(passivo.mais_velho_dias)} dias` : ''}
          </span>
          <button
            type="button"
            className="painel-alvo"
            onClick={() => { setPeriodo('tudo'); setDia(''); setSelecao('a_fazer') }}
            style={{ ...botaoVazado, padding: '3px 10px', fontSize: 11.5 }}
          >
            ver todos
          </button>
        </div>
      )}

      {/* ══ A FILA DO DEGRAU ESCOLHIDO ══════════════════════════════════════ */}
      {!carregando && linhas.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <FilaPedidos
            ponte={ponte}
            selecionado={selecao}
            metas={metas}
            modalidades={modalidades}
            excluidas={excluidas}
            somenteLeitura={somenteLeitura}
            ocupado={ocupado}
            acoes={acoes}
          />
        </div>
      )}

      {/* ══ A TRIAGEM EM LOTE, AO VIVO ══════════════════════════════════════
          Os casos que vieram dos pedidos do período, passando pela conferência
          de documentos no notebook. Some quando não há caso no período. */}
      {!carregando && Object.keys(casosDoPeriodo).length > 0 && (
        <TriagemEmLote casos={casosDoPeriodo} somenteLeitura={somenteLeitura} />
      )}

      {/* ══ A CAIXA DE E-MAIL ══════════════════════════════════════════════
          Aberta (11/09/2026): é onde se lê o e-mail inteiro. Recolher desliga
          o relógio dela junto. */}
      {caixa && (
        <SecaoPainel
          nome="A caixa de e-mail"
          cor={cores}
          acao={<BotaoRecolher aberto={verCaixa} aoAlternar={() => setVerCaixa((v) => !v)} />}
        >
          {verCaixa ? (
            <div className="card-panel">{caixa}</div>
          ) : (
            <div style={texto.nota}>
              Recolhida. É aqui que se lê um e-mail inteiro, se traz para a esteira e se ligam as caixas.
            </div>
          )}
        </SecaoPainel>
      )}

      {/* ══ A PORTA DE ENTRADA ═════════════════════════════════════════════
          Mede só quanto o e-mail esperou para ser resolvido. O tempo da
          análise em si é da esteira, e fica na Análise. */}
      {!carregando && resumo.resolvidos > 0 && (
        <SecaoPainel nome={`A porta de entrada · e-mails que viraram caso ${janela.frase}`} cor={cores}>
          <Moldura
            titulo="Do e-mail até ser resolvido"
            origem="recebido_em do e-mail até casos.criado_em, em horas úteis (9h às 18h, sem fim de semana)"
          >
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
              <Numerinho rotulo="Trazidos" valor={String(resumo.trazidos)} />
              <Numerinho rotulo="Já analisados" valor={String(resumo.ja_analisados)} sub="por fora do sistema" />
              <Numerinho rotulo="Mediana" valor={resumo.mediana_horas !== null ? horasTexto(resumo.mediana_horas, metas) : 'sem dado'} />
              <Numerinho rotulo="Média" valor={resumo.media_horas !== null ? horasTexto(resumo.media_horas, metas) : 'sem dado'} />
              <Numerinho
                rotulo="No prazo"
                valor={pctNoPrazo !== null ? `${pctNoPrazo}%` : 'sem dado'}
                sub={resumo.com_tempo ? `${resumo.no_prazo} de ${resumo.com_tempo}` : undefined}
              />
            </div>
            <div style={{ ...texto.nota, marginTop: 10 }}>
              A meta é o e-mail entrar no sistema em {metas.horas_primeira_resposta} h úteis, com o relógio
              correndo das {metas.hora_inicio}h às {metas.hora_fim}h{metas.conta_fim_de_semana ? '' : ', de segunda a sexta'}.
              Mediana, média e prazo contam só os trazidos: o “já analisado” entra no total, mas não no
              tempo, porque a hora do clique não é a hora da análise.
            </div>
          </Moldura>
        </SecaoPainel>
      )}

      {/* ══ OS MAIS ANTIGOS PARADOS ═════════════════════════════════════════
          De qualquer data, e recolhidos (11/09/2026): o número deles já está
          no título e no passivo, lá em cima. */}
      {!carregando && maisAntigos.length > 0 && (
        <SecaoPainel
          nome={`Os ${plural(maisAntigos.length, 'mais antigo parado', 'mais antigos parados')}`}
          cor={cores}
          acao={<BotaoRecolher aberto={verAntigos} aoAlternar={() => setVerAntigos((v) => !v)} />}
        >
          {verAntigos && (
            <FilaPedidos
              ponte={ponteTudo}
              selecionado="a_fazer"
              fixos={maisAntigos}
              titulo="De qualquer data"
              metas={metas}
              modalidades={modalidades}
              excluidas={excluidas}
              somenteLeitura={somenteLeitura}
              ocupado={ocupado}
              acoes={acoes}
            />
          )}
        </SecaoPainel>
      )}

      {!carregando && linhas.length === 0 && (
        <Aviso>
          Nenhum e-mail na sua caixa ainda. Ligue a caixa em ⚙ Caixas, na caixa de e-mail aqui em
          cima, e deixe o Carteiro rodando na máquina onde o Outlook está aberto.
        </Aviso>
      )}
    </div>
  )
}

/* ── as peças pequenas ─────────────────────────────────────────────────── */

function Numerinho({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div>
      <div style={texto.rotulo}>{rotulo}</div>
      <div style={{ ...texto.numero, fontSize: 18 }}>{valor}</div>
      {sub && <div style={texto.nota}>{sub}</div>}
    </div>
  )
}

/** "mostrar" e "recolher", encostado à direita do título de uma seção. */
function BotaoRecolher({ aberto, aoAlternar }: { aberto: boolean; aoAlternar: () => void }) {
  return (
    <button
      type="button"
      className="painel-alvo"
      aria-expanded={aberto}
      onClick={aoAlternar}
      style={{ ...botaoVazado, padding: '3px 10px', fontSize: 11.5, fontWeight: 600 }}
    >
      {aberto ? 'recolher' : 'mostrar'}
    </button>
  )
}
