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
     1. o aviso de e-mail novo, quando chega algo sem classificação
     2. a caixa de e-mail (a visualização do Outlook, aberta)
     3. os mais antigos parados, recolhidos

   O QUE SAIU DAQUI, e por quê: em 17/09/2026 a triagem em lote e a lista
   "Tudo o que chegou" foram para PainelGestaoEsteira.tsx, a aba Painel — em
   período grande (30 dias, tudo) viravam parede de informação no meio do
   posto de trabalho do dia. Em 18/09/2026 foi a vez da ponte inteira ("E-mails
   de pedido de análise"), a fila do degrau escolhido, o período e o botão da
   IA: ordem do Marco, olhando a ponte RECOLHIDA nesta tela — "não está legal
   (...) essas informações são mesmo necessárias nessa tela?". Não eram: a
   Painel já tinha uma ponte equivalente (mais completa, cobre qualquer
   período), então manter as duas aqui era duplicar a mesma informação.

   O QUE FICOU: a caixa de e-mail e "os mais antigos parados" são o trabalho
   de olhar o e-mail em si, não de classificar pela régua — isso continua
   fazendo sentido nesta tela. `ponteTudo` (para o passivo e os mais antigos)
   segue calculada aqui, com a MESMA régua da Painel, só que sempre no
   período "tudo": não há seletor de período nesta tela porque não há mais
   nada aqui que dependa dele.

   QUEM FAZ A CONTA: lib/email/ponte.ts, lib/email/classificar.ts e
   lib/email/regua.ts, puros e testados (npm run email:ponte:test). Esta tela
   só busca, desenha e manda as ações.

   Design: components/painel/Painel.tsx e lib/ui/painel.ts, conforme
   docs/DESIGN-PAINEL.md. Nenhum hex redigitado aqui. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { SecaoPainel, Aviso } from '@/components/painel/Painel'
import { cor, corDaArea, texto, botaoCheio, botaoVazado } from '@/lib/ui/painel'
import { estadoDoPedido, METAS_PADRAO, type LinhaPedido, type MetasEmail } from '@/lib/email/metricas'
import { lerVersao, reguaVigente, type VersaoRegua } from '@/lib/email/regua'
import type { ClassificacaoGravada } from '@/lib/email/classificar'
import { janelaDoPeriodo, montarPonte, passivoDa, type Demanda } from '@/lib/email/ponte'
import { useLembrado } from '@/lib/ui/lembrar'
import FilaPedidos, { type AcoesFila, type TipoDecisao } from './FilaPedidos'

const ehBooleano = (v: unknown): v is boolean => typeof v === 'boolean'

type LinhaPonte = LinhaPedido & { previa?: string | null; anexos?: { nome?: string | null }[] | null }

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/* A ORDEM DA TELA, trocada em 11/09/2026 ("a visualização dos e-mails igual o
   outlook deve ficar em cima, aberta"): a caixa vem de fora, em `caixa`,
   porque é a página que sabe recarregar os casos quando um e-mail vira caso. */
export default function PainelEmail({ aoMudar, caixa, aoAbrirGestao }: {
  aoMudar?: () => void
  /** A caixa de e-mail crua, desenhada logo abaixo dos mais antigos parados. */
  caixa?: React.ReactNode
  /** Leva para a aba Painel: é para onde a ponte, a fila do degrau, a triagem
   *  em lote e "Tudo o que chegou" se mudaram (17 e 18/09/2026). */
  aoAbrirGestao?: () => void
}) {
  const router = useRouter()
  const { somenteLeitura } = usePermissoes()

  const [linhas, setLinhas] = useState<LinhaPonte[]>([])
  const [versoes, setVersoes] = useState<VersaoRegua[]>([])
  const [modalidades, setModalidades] = useState<string[]>([])
  const [gravadas, setGravadas] = useState<ClassificacaoGravada[]>([])
  const [metas, setMetas] = useState<MetasEmail>(METAS_PADRAO)

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [chegouAgora, setChegouAgora] = useState(0)
  /* O QUE ESTÁ OCULTO FICA OCULTO ATÉ ELE MUDAR DE VOLTA (18/09/2026): "a
     forma que eu sair dessa página é a mesma forma que quando eu voltar".
     Cada seção que se mostra/recolhe lembra o estado no navegador, na sua
     própria chave — ocultar uma não deveria mexer no que ele fez com a outra. */
  const [verCaixa, setVerCaixa] = useLembrado('fam:comercial-email:ver-caixa', true, ehBooleano)
  const [verAntigos, setVerAntigos] = useLembrado('fam:comercial-email:ver-antigos', false, ehBooleano)
  const conhecidos = useRef<Set<string> | null>(null)

  /* UM INSTANTE SÓ PARA A TELA INTEIRA. Se cada peça chamasse `new Date()`, um
     e-mail poderia estar com a idade errada nos mais antigos parados. */
  const [agora, setAgora] = useState(() => new Date())

  const carregar = useCallback(async () => {
    const supabase = createClient()
    const [pedidos, m, regua, mods, classes] = await Promise.all([
      /* 3.000 e não 1.000: com o limite baixo, "tudo" deixava de ser tudo, e o
         RE cujo primeiro e-mail ficava de fora virava pedido novo. Em 11/09 são
         278 e-mails; o dia em que isso apertar, a conta vai para o servidor. */
      supabase.from('painel_pedidos').select('*').order('recebido_em', { ascending: false, nullsFirst: false }).limit(3000),
      supabase.from('email_metas').select('*').eq('id', true).maybeSingle(),
      supabase.from('email_regua').select('versao, parametros, motivo, criada_por_nome, criada_em').order('versao'),
      supabase.from('modalidades').select('nome'),
      supabase.from('email_classificacao').select('*').limit(5000),
    ])
    if (pedidos.error) setErro(pedidos.error.message)
    const lista = (pedidos.data ?? []) as LinhaPonte[]

    /* "CHEGOU E-MAIL NOVO", pela IDENTIDADE e não pela contagem: pela contagem,
       um e-mail que sai junto com outro que entra passaria calado. */
    // Quem saiu da caixa não conta como "chegou e-mail novo": ele saiu, não chegou.
    const candidatos = new Set(
      lista.filter((l) => !l.saiu_em && estadoDoPedido(l) === 'a_classificar').map((l) => l.id),
    )
    if (conhecidos.current) {
      let novos = 0
      for (const id of candidatos) if (!conhecidos.current.has(id)) novos++
      if (novos) setChegouAgora((n) => n + novos)
    }
    conhecidos.current = candidatos

    setLinhas(lista)
    if (m.data) setMetas({ ...METAS_PADRAO, ...m.data })
    // Lida com desconfiança: uma versão malformada gravada por fora não derruba a tela.
    setVersoes(((regua.data ?? []) as Parameters<typeof lerVersao>[0][]).map(lerVersao) as VersaoRegua[])
    setModalidades([...new Set((mods.data ?? []).map((x) => String(x.nome)))])
    setGravadas((classes.data ?? []) as ClassificacaoGravada[])
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

  const vigente = reguaVigente(versoes)
  const excluidas = vigente?.parametros.excluidas ?? []

  /* SÓ "TUDO", SEMPRE. Sem ponte de período nesta tela, `ponteTudo` alimenta
     só o passivo e os mais antigos parados — os dois são fotografia do agora,
     não recorte de um período escolhido. */
  const naCaixa = useMemo(() => linhas.filter((l) => !l.saiu_em), [linhas])
  const ponteTudo = useMemo(
    () => montarPonte(naCaixa, { versoes, modalidades, gravadas, metas, agora, janela: janelaDoPeriodo('tudo', agora) }),
    [naCaixa, versoes, modalidades, gravadas, metas, agora],
  )

  const passivo = passivoDa(ponteTudo, agora)
  const maisAntigos: Demanda[] = useMemo(
    () => ponteTudo.demandas
      .filter((d) => (d.balde === 'a_fazer' || d.balde === 'sem_classificacao') && d.parado)
      .sort((a, b) => b.horas - a.horas)
      .slice(0, 5),
    [ponteTudo],
  )

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

  return (
    <div>
      {/* ── o aviso de e-mail novo, quando há algo sem classificação ── */}
      {chegouAgora > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            type="button"
            className="painel-alvo"
            onClick={() => { setChegouAgora(0); aoAbrirGestao?.() }}
            title="Abre a aba Painel, onde a ponte mostra os pedidos sem classificação"
            style={{ ...botaoCheio, display: 'inline-flex', alignItems: 'center', gap: 7, background: cor.areaOperacao }}
          >
            <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: cor.papel }} />
            {plural(chegouAgora, 'e-mail novo', 'e-mails novos')}
          </button>
        </div>
      )}

      {erro && <div style={{ marginBottom: 12 }}><Aviso tom="erro">{erro}</Aviso></div>}

      {/* ── o passivo de qualquer data, numa linha ── */}
      {!carregando && passivo.abertos > 0 && (
        <div style={{ margin: '0 0 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, ...texto.apoio }}>
          <span>
            De qualquer data: <b style={{ color: cor.tinta }}>{plural(passivo.abertos, 'pedido aberto', 'pedidos abertos')}</b>
            {passivo.sem_classificacao ? ` (${passivo.sem_classificacao} sem classificação)` : ''}
            {passivo.parados ? <> · <b style={{ color: cor.alerta }}>{plural(passivo.parados, 'parado', 'parados')}</b></> : ''}
            {passivo.mais_velho_dias !== null ? ` · o mais velho chegou há ${Math.floor(passivo.mais_velho_dias)} dias` : ''}
          </span>
          {aoAbrirGestao && (
            <button type="button" className="painel-alvo" onClick={aoAbrirGestao} style={{ ...botaoVazado, padding: '3px 10px', fontSize: 11.5 }}>
              ver na Painel
            </button>
          )}
        </div>
      )}

      {/* ══ A CAIXA DE E-MAIL ══════════════════════════════════════════════
          Aberta (11/09/2026): é onde se lê o e-mail inteiro. Recolher desliga
          o relógio dela junto. */}
      {caixa && (
        <SecaoPainel
          nome="A caixa de e-mail"
          cor={cores}
          acao={<BotaoRecolher aberto={verCaixa} aoAlternar={() => setVerCaixa(!verCaixa)} />}
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

      {/* ══ OS MAIS ANTIGOS PARADOS ═════════════════════════════════════════
          De qualquer data, e recolhidos (11/09/2026): o número deles já está
          no título e no passivo, lá em cima. */}
      {!carregando && maisAntigos.length > 0 && (
        <SecaoPainel
          nome={`Os ${plural(maisAntigos.length, 'mais antigo parado', 'mais antigos parados')}`}
          cor={cores}
          acao={<BotaoRecolher aberto={verAntigos} aoAlternar={() => setVerAntigos(!verAntigos)} />}
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
