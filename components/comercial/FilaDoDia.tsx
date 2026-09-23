'use client'

/* A FILA DO DIA · o relatório do Carteiro, para as análises começarem
   ═══════════════════════════════════════════════════════════════════════════

   Ordem do Marco em 17/09/2026: "preciso que ele me ajude a zerar a fila de
   análises... o carteiro deve me apresentar todos os e-mails da minha caixa de
   entrada dos últimos 7 dias que foram enviados para mim de [quatro
   endereços]. Pode inserir a opção de eu criar novos e-mails, já que teremos
   novos funcionários na FAM. Até porque esse sistema Comercial (e-mail será
   usado por outro colega futuramente) e ele pode selecionar remetentes de fora
   da FAM."

   O QUE ESTA TELA FAZ, e nada além disso:
     1. o corte à vista: até o fim do último dia útil (o de hoje não entra)
     2. um bloco por remetente, com os e-mails que faltam tratar
     3. marcar e trazer para a esteira em lote, ou dispensar o que não é pedido
     4. a lista de remetentes editável AQUI, com sugestão de quem escreveu

   A CONTA NÃO MORA AQUI: está em `lib/email/fila.ts`, pura e testada
   (`npm run fila:test`). Esta tela busca, desenha e manda as ações — do mesmo
   jeito que o PainelEmail faz com a ponte.

   A LISTA DESTA TELA É SÓ DESTA TELA (`email_contas.fila_remetentes`). Ela
   chegou a ser a mesma da régua do Carteiro (`remetentes`) e voltou atrás no
   mesmo dia: `remetentes` é o que grava `emails_caixa.serve`, então montar a
   MINHA fila mudaria o que a FAM inteira conta como pedido de análise naquela
   caixa — e mudaria calada, na aba "Para análise" e no relatório gerencial.
   São duas perguntas diferentes: "de quem eu quero ver" e "de quem a FAM
   aceita pedido". Ver supabase-migration-fila-remetentes.sql.

   Design: components/painel/Painel.tsx e lib/ui/painel.ts. Nenhum hex aqui. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { SecaoPainel, CartaoNumero, GradeCartoes, Moldura, Aviso } from '@/components/painel/Painel'
import { cor, corDaArea, texto, raio, botaoCheio, botaoVazado } from '@/lib/ui/painel'
import { REGRAS_PADRAO, type RegrasEmail } from '@/lib/email/regras'
import {
  janelaDaFila, montarFila, montarBoletim, chegaramDepoisDoCorte, remetenteValido, enderecoDe,
  acharAnalise, type EmailDaFila, type LinhaBoletim, type AnaliseConhecida,
} from '@/lib/email/fila'
import BoletimDoDia from './BoletimDoDia'

interface Conta {
  id: string
  conta: string
  apelido: string | null
  dono_nome: string | null
  sou_dono: boolean
  ligado: boolean
  /** A régua do Carteiro: de quem a FAM aceita pedido. NÃO é o que esta tela filtra. */
  remetentes: string[] | null
  /** De quem EU quero ver na fila. É esta que a tela mexe. */
  fila_remetentes: string[] | null
  so_com_anexo: boolean
  so_nao_lidos: boolean
  so_remetente_interno: boolean
  assunto_contem: string[] | null
  assunto_ignora: string[] | null
  ultima_varredura: string | null
}

type EmailLinha = EmailDaFila & { conta?: string | null }

const CAMPOS =
  'id, assunto, de, email_de, recebido_em, nao_lido, previa, anexos, anexos_uteis, ' +
  'estado, estado_erro, caso_id, conta_id, conta, analisado_fora_em'

const PERIODOS = [
  { dias: 7, nome: '7 dias' },
  { dias: 15, nome: '15 dias' },
  { dias: 30, nome: '30 dias' },
  { dias: 0, nome: 'tudo' },
] as const

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
const nomeDaCaixa = (c: Conta) => c.apelido || c.dono_nome || c.conta
const dataCurta = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
      ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function FilaDoDia({ aoMudar, aoContar, aoVerCaixa }: {
  aoMudar?: () => void
  /** O tamanho da fila, para a aba mostrar o número sem refazer a consulta. */
  aoContar?: (quantos: number) => void
  /** Troca para a aba da caixa (o e-mail de hoje é lido lá). */
  aoVerCaixa?: () => void
}) {
  const router = useRouter()
  const { somenteLeitura } = usePermissoes()

  const [emails, setEmails] = useState<EmailLinha[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [caixaId, setCaixaId] = useState('')
  const [dias, setDias] = useState<number>(7)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [recado, setRecado] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const [verForaDaRegua, setVerForaDaRegua] = useState(false)
  const [editandoLista, setEditandoLista] = useState(false)
  const [novoRemetente, setNovoRemetente] = useState('')
  const [cartaoAberto, setCartaoAberto] = useState<string | null>(null)
  /* O DIA FECHADO vem da view `painel_pedidos`, e não de `emails_caixa`: é ela
     que sabe se o e-mail virou caso, qual a razão social e se a análise já foi
     concluída. São poucas linhas (um dia só), e é o que permite o boletim
     dizer "2 já foram, faltam 3" em vez de só contar e-mail parado. */
  const [doDia, setDoDia] = useState<LinhaBoletim[]>([])
  /* AS ANÁLISES QUE JÁ EXISTEM, para a tela poder dizer "esta empresa já foi
     analisada" antes de ele abrir um caso repetido. Vêm UMA vez: a lista muda
     quando uma análise é publicada, não de minuto em minuto. */
  const [analises, setAnalises] = useState<AnaliseConhecida[]>([])

  /* UM INSTANTE SÓ para a tela inteira: se cada peça chamasse `new Date()`, o
     corte poderia virar no meio de um render e a lista discordaria do título. */
  const [agora, setAgora] = useState(() => new Date())
  const janela = useMemo(() => janelaDaFila(agora, dias), [agora, dias])

  /* AS CAIXAS VÊM ANTES, E SEPARADO DOS E-MAILS: é a caixa escolhida que diz
     quais e-mails buscar, e uma busca só, misturada, teria que trazer tudo e
     filtrar depois no navegador. */
  const carregarContas = useCallback(async () => {
    const supabase = createClient()
    const [r, { data }] = await Promise.all([
      fetch('/api/caixa/contas').then((x) => x.json()).catch(() => ({})),
      supabase
        .from('analises')
        .select('cnpj, razao_social, nome_curto, data_analise')
        .eq('vigente', true)
        .order('data_analise', { ascending: false })
        .limit(1000),
    ])
    if (r?.contas) setContas(r.contas as Conta[])
    else setErro('Não consegui ler as suas caixas de e-mail.')
    setAnalises((data ?? []) as AnaliseConhecida[])
  }, [])

  useEffect(() => {
    const primeira = setTimeout(carregarContas, 0)
    return () => clearTimeout(primeira)
  }, [carregarContas])

  const caixa = useMemo(() => {
    if (!contas.length) return null
    return contas.find((c) => c.id === caixaId) ?? contas.find((c) => c.sou_dono) ?? contas[0]
  }, [contas, caixaId])

  /* CADA BUSCA LEVA UM NÚMERO, e só a mais recente pode escrever na tela. A
     tela se recarrega sozinha a cada minuto e a cada troca de período: sem
     isto, a resposta de "7 dias" chegando depois da de "30 dias" pintaria a
     janela errada, e só o próximo tique do relógio consertaria. */
  const pedido = useRef(0)

  const carregar = useCallback(async () => {
    if (!caixa) return
    const meu = ++pedido.current
    const supabase = createClient()
    let busca = supabase
      .from('emails_caixa')
      .select(CAMPOS)
      /* SEM CORTE SUPERIOR, de propósito: o e-mail de HOJE não entra na fila
         (quem corta é `montarFila`), mas é ele que alimenta o aviso "chegaram
         3 e-mails hoje". Cortar aqui deixaria a tela sem saber que chegaram. */
      .gte('recebido_em', (janela.desde ?? new Date(0)).toISOString())
      /* SÓ O QUE ESTÁ NA CAIXA DE ENTRADA (17/09/2026). Ordem dele: "eu retiro
         alguns e-mails para outras caixas". Quem saiu da Inbox ganha `saiu_em`
         na varredura completa do Carteiro e some daqui — sem ser apagado. */
      .is('saiu_em', null)
      .order('recebido_em', { ascending: false, nullsFirst: false })
      .limit(1000)

    /* O FILTRO DA CAIXA VAI NO BANCO, e não depois, no navegador. Quem
       administra o CRM enxerga TODAS as caixas: filtrando só no cliente, as
       1.000 linhas do corte seriam repartidas entre todas elas, e a caixa
       escolhida perderia e-mail antigo sem nada na tela dizendo isso — o
       cartão "A tratar" mostraria um número menor que o real.

       Casa por `conta_id` OU pelo endereço: a coluna `conta_id` nasceu depois,
       e o e-mail guardado antes dela ainda tem só o texto da conta. */
    if (contas.length > 1) busca = busca.or(`conta_id.eq.${caixa.id},conta.eq.${caixa.conta}`)

    /* O DIA DO BOLETIM, numa busca à parte e pequena (24 h). Vai junto para a
       tela não piscar com o boletim chegando depois da fila. Se a view não
       existir (migration atrasada), o boletim fica sem os nomes firmes e a
       tela segue: `painel_pedidos` é um luxo, não um requisito. */
    let doDiaBusca = supabase
      .from('painel_pedidos')
      .select('id, assunto, de, email_de, recebido_em, anexos_uteis, estado, caso_id, caso_numero, caso_etapa, cnpj, razao_social, fila_situacao, fila_concluido_em, analisado_fora_em, conta_id, conta')
      .gte('recebido_em', janela.corte.toISOString())
      .lte('recebido_em', janela.ate.toISOString())
      .is('saiu_em', null)
      .limit(300)
    if (contas.length > 1) doDiaBusca = doDiaBusca.or(`conta_id.eq.${caixa.id},conta.eq.${caixa.conta}`)

    const [{ data, error }, dia] = await Promise.all([busca, doDiaBusca])
    if (meu !== pedido.current) return
    setDoDia((dia.data ?? []) as unknown as LinhaBoletim[])
    if (error) setErro(error.message)
    // A lista de colunas é montada em texto, e aí o PostgREST não sabe o formato
    // do que volta (é o mesmo `as unknown` que /api/caixa/contas precisa fazer).
    setEmails((data ?? []) as unknown as EmailLinha[])
    setCarregando(false)
  }, [janela, caixa, contas.length])

  /* O RELÓGIO É SEPARADO DA BUSCA, e isto não é estilo: `carregar` depende da
     janela, que depende de `agora`. Se a busca também empurrasse o relógio, cada
     carga geraria uma janela nova, que geraria outra carga — a tela ficaria
     buscando para sempre. Aqui o relógio anda de minuto em minuto, a janela
     acompanha, e a busca sai atrás dela.

     A primeira leitura sai no próximo tique, fora do corpo do efeito, como o
     PainelEmail já faz. */
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const primeira = setTimeout(carregar, 0)
    return () => clearTimeout(primeira)
  }, [carregar])

  const regras: RegrasEmail = useMemo(() => ({
    ...REGRAS_PADRAO,
    ...(caixa
      ? {
          so_com_anexo: caixa.so_com_anexo,
          so_nao_lidos: caixa.so_nao_lidos,
          so_remetente_interno: caixa.so_remetente_interno,
          assunto_contem: caixa.assunto_contem ?? [],
          assunto_ignora: caixa.assunto_ignora ?? [],
        }
      : {}),
  }), [caixa])

  /* A LISTA DA FILA É SÓ DA FILA (17/09/2026). Ela chegou a ser a mesma da
     régua (`remetentes`), e o revisor pegou no mesmo dia: montar a minha fila
     mudaria o que a FAM inteira conta como pedido naquela caixa, porque é com
     `remetentes` que o Carteiro grava `serve`. São duas perguntas diferentes —
     "de quem eu quero ver" e "de quem a FAM aceita pedido" — e agora são dois
     campos. Ver supabase-migration-fila-remetentes.sql. */
  const lista = useMemo(() => (caixa?.fila_remetentes ?? []).filter(Boolean), [caixa])

  /* Os e-mails DESTA caixa. Filtrar no banco por `conta_id` esconderia os
     e-mails guardados antes da coluna existir (ela nasceu depois), então o
     casamento é por id OU pelo endereço da conta, e só quando há mais de uma
     caixa à vista — com uma só, tudo que a RLS deixou passar é dela. */
  const daCaixa = useMemo(() => {
    if (!caixa || contas.length < 2) return emails
    return emails.filter((e) => e.conta_id === caixa.id || (e.conta ?? '').toLowerCase() === caixa.conta.toLowerCase())
  }, [emails, caixa, contas.length])
  /* Sim, o filtro da caixa é feito duas vezes: no banco (acima, no `or`) e
     aqui. O de cá é rede de segurança para o instante entre trocar de caixa e
     a resposta nova chegar — sem ele, a tela mostraria por um segundo os
     e-mails da caixa anterior sob o nome da nova. */

  const fila = useMemo(
    () => montarFila(daCaixa, { remetentes: lista, janela, regras, incluirForaDaRegua: verForaDaRegua }),
    [daCaixa, lista, janela, regras, verForaDaRegua],
  )

  const boletim = useMemo(
    () => montarBoletim(doDia, { remetentes: lista, dia: janela.corte, regras }),
    [doDia, lista, janela.corte, regras],
  )

  const chegaramHoje = useMemo(
    () => chegaramDepoisDoCorte(daCaixa, { janela, remetentes: lista, regras }).length,
    [daCaixa, janela, lista, regras],
  )

  /* O VÍNCULO É POR E-MAIL, calculado uma vez para a fila inteira. Sem análise
     nenhuma carregada o mapa fica vazio e a tela não muda em nada. */
  const vinculos = useMemo(() => {
    const mapa = new Map<string, ReturnType<typeof acharAnalise>>()
    if (!analises.length) return mapa
    for (const g of fila.grupos) {
      for (const e of g.emails) {
        const achado = acharAnalise({ assunto: e.assunto }, analises)
        if (achado) mapa.set(e.id, achado)
      }
    }
    return mapa
  }, [fila, analises])

  const cores = corDaArea('comercial')
  const podeEditar = !!caixa && !somenteLeitura && (caixa.sou_dono || !caixa.dono_nome)

  // O número vai para a aba só depois da primeira leitura: durante o
  // carregamento a fila está vazia, e uma aba dizendo "0" por meio segundo é a
  // tela afirmando que a fila zerou quando ela nem foi lida ainda.
  useEffect(() => {
    if (carregando) return
    const t = setTimeout(() => aoContar?.(fila.total), 0)
    return () => clearTimeout(t)
  }, [fila.total, carregando, aoContar])

  /* ── as ações ─────────────────────────────────────────────────────────── */

  async function mandar(acao: 'trazer' | 'tratar' | 'ja_analisado', ids: string[]) {
    if (!ids.length) return
    setErro('')
    setRecado('')
    setOcupado(true)
    try {
      const r = await fetch('/api/caixa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // A rota aceita 100 de uma vez; acima disso ela recusa o lote inteiro.
        body: JSON.stringify({ acao, ids: ids.slice(0, 100) }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setErro(j.erro ?? 'Não consegui.')
      else {
        const quantos = j.marcados ?? ids.length
        setRecado(
          acao === 'trazer'
            ? `${plural(quantos, 'e-mail está', 'e-mails estão')} a caminho da esteira. O Carteiro abre o caso na próxima batida.`
            : acao === 'ja_analisado'
              ? `${plural(quantos, 'e-mail ficou', 'e-mails ficaram')} marcado como já analisado por fora. Entra na conta do dia como feito.`
              : `${plural(quantos, 'e-mail saiu', 'e-mails saíram')} da fila.`,
        )
        /* A LINHA SOME NA HORA, sem esperar a volta do banco. O `carregar()`
           logo abaixo confirma; sem isto, o e-mail que ele acabou de marcar
           fica meio segundo na tela ainda pedindo para ser tratado — que é
           exatamente a confusão que ele reclamou em 17/09/2026. */
        const idsFeitos = new Set(ids)
        setEmails((es) => es.map((e) => (
          !idsFeitos.has(e.id)
            ? e
            : acao === 'ja_analisado'
              ? { ...e, analisado_fora_em: new Date().toISOString() }
              : acao === 'tratar'
                ? { ...e, estado: 'tratado' }
                : { ...e, estado: 'a_trazer' }
        )))
        setMarcados(new Set())
      }
    } catch {
      setErro('A conexão caiu. Tente de novo.')
    }
    setOcupado(false)
    await carregar()
    aoMudar?.()
  }

  async function salvarRemetentes(novos: string[]) {
    if (!caixa) return
    setErro('')
    const antes = contas
    // Na hora: a lista muda na tela antes do servidor responder, e volta atrás
    // se ele recusar (a RLS deixa gravar só o dono da caixa).
    setContas((cs) => cs.map((c) => (c.id === caixa.id ? { ...c, fila_remetentes: novos } : c)))
    const r = await fetch('/api/caixa/contas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conta_id: caixa.id, fila_remetentes: novos }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setContas(antes); setErro(j.erro ?? 'Não consegui salvar a lista.') }
  }

  function adicionar(valor: string) {
    const x = valor.trim().toLowerCase()
    if (!x) return
    if (!remetenteValido(x)) {
      setErro(`"${x}" não parece um e-mail nem um domínio. Use fulano@empresa.com.br ou @empresa.com.br.`)
      return
    }
    if (lista.some((y) => y.toLowerCase() === x)) { setNovoRemetente(''); return }
    setErro('')
    setNovoRemetente('')
    salvarRemetentes([...lista, x])
  }

  const alternar = (id: string) => setMarcados((m) => {
    const n = new Set(m)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const idsDoGrupo = (ids: string[]) => setMarcados((m) => {
    const n = new Set(m)
    const todos = ids.every((i) => n.has(i))
    for (const i of ids) { if (todos) n.delete(i); else n.add(i) }
    return n
  })

  /* ── os números ───────────────────────────────────────────────────────── */

  const maisAntigo = useMemo(() => {
    const datas = fila.grupos.flatMap((g) => g.emails.map((e) => new Date(e.recebido_em ?? 0).getTime()))
      .filter((t) => t > 0)
    if (!datas.length) return null
    return Math.floor((agora.getTime() - Math.min(...datas)) / 86_400_000)
  }, [fila, agora])

  const todosIds = useMemo(() => fila.grupos.flatMap((g) => g.emails.map((e) => e.id)), [fila])

  /* A SELEÇÃO QUE VALE É A QUE ESTÁ NA TELA. Marcar cinco, trocar o período e
     ver "Trazer 5" com três caixinhas marcadas seria a tela contando um
     e-mail que o usuário não está mais vendo — e o mesmo vale para o e-mail
     que o Carteiro trouxe sozinho no meio do caminho (a tela se recarrega a
     cada minuto). Em vez de limpar a seleção a cada mudança, o que sobra do
     que foi marcado continua marcado: ele volta a contar se o período voltar. */
  const marcadosVivos = useMemo(
    () => todosIds.filter((id) => marcados.has(id)),
    [todosIds, marcados],
  )
  const tudoMarcado = todosIds.length > 0 && marcadosVivos.length === todosIds.length

  return (
    <div>
      {/* ── o corte e o período ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div role="group" aria-label="Período" style={{ display: 'flex', gap: 2, background: cor.bordaSuave, padding: 3, borderRadius: raio.controle }}>
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              className="painel-alvo"
              aria-pressed={dias === p.dias}
              onClick={() => setDias(p.dias)}
              style={{
                border: 'none', cursor: 'pointer', padding: '5px 11px',
                borderRadius: raio.controle - 2, fontSize: 12.5, fontWeight: 600,
                background: dias === p.dias ? cor.papel : 'transparent',
                color: dias === p.dias ? cor.tinta : cor.textoSub,
              }}
            >
              {p.nome}
            </button>
          ))}
        </div>

        {contas.length > 1 && (
          <select
            className="fam-input painel-alvo"
            value={caixa?.id ?? ''}
            onChange={(ev) => { setCaixaId(ev.target.value); setMarcados(new Set()) }}
            style={{ width: 'auto', padding: '5px 8px', fontSize: 12.5 }}
          >
            {contas.map((c) => <option key={c.id} value={c.id}>{nomeDaCaixa(c)}</option>)}
          </select>
        )}

        <span style={{ flex: 1 }} />
        {/* O período já está no título da seção logo abaixo; aqui fica só a
            regra, que é a parte que alguém pode estranhar ao olhar a tela. */}
        <span style={texto.apoio}>o e-mail de hoje não entra: ele é do dia de hoje</span>
      </div>

      {erro && <div style={{ marginBottom: 12 }}><Aviso tom="erro">{erro}</Aviso></div>}
      {recado && <div style={{ marginBottom: 12 }}><Aviso>{recado}</Aviso></div>}

      {/* O BOLETIM ABRE A TELA (17/09/2026): é o "bom dia" do Comercial — o dia
          anterior fechado, com nome de empresa, e o que chegou hoje. */}
      {!carregando && (
        <BoletimDoDia
          boletim={boletim}
          chegaramHoje={chegaramHoje}
          agora={agora}
          aoVerCaixa={aoVerCaixa}
        />
      )}

      {/* ── os números ───────────────────────────────────────────────────── */}
      <SecaoPainel nome={`A fila de análises · ${janela.frase}`} cor={cores}>
        <GradeCartoes>
          <CartaoNumero
            rotulo="A tratar"
            numero={String(fila.total)}
            sub="e-mails que ainda não viraram caso nem foram dispensados"
            alerta={fila.total > 0}
          />
          <CartaoNumero
            rotulo="Remetentes"
            numero={String(fila.grupos.length)}
            sub={lista.length ? `de ${plural(lista.length, 'endereço na lista', 'endereços na lista')}` : 'a lista está vazia: a fila mostra todo mundo'}
          />
          <CartaoNumero
            rotulo="O mais antigo"
            numero={maisAntigo === null ? '–' : `${maisAntigo} d`}
            sub={maisAntigo === null ? 'nada parado' : 'parado desde que chegou'}
            alerta={(maisAntigo ?? 0) >= 3}
          />
          <CartaoNumero
            rotulo="Fora da régua"
            numero={String(fila.foraDaRegua.length)}
            sub="destes remetentes, recusados por anexo ou assunto"
            aberto={cartaoAberto === 'fora'}
            aoAlternar={() => setCartaoAberto(cartaoAberto === 'fora' ? null : 'fora')}
          >
            {fila.foraDaRegua.length === 0 ? (
              <div style={texto.nota}>Nenhum e-mail destes remetentes ficou de fora no período.</div>
            ) : (
              <div>
                {fila.foraDaRegua.slice(0, 10).map(({ email, motivo }) => (
                  <div key={email.id} style={{ ...texto.corpo, padding: '3px 0', borderBottom: `1px solid ${cor.bordaSuave}` }}>
                    <span style={{ fontWeight: 600 }}>{email.assunto || '(sem assunto)'}</span>
                    <span style={texto.nota}> · {enderecoDe(email)} · {motivo}</span>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setVerForaDaRegua((v) => !v)}
                  style={{ ...botaoVazado, marginTop: 8, padding: '4px 10px', fontSize: 11.5 }}
                >
                  {verForaDaRegua ? 'tirar da fila de novo' : 'mostrar estes na fila também'}
                </button>
              </div>
            )}
          </CartaoNumero>
        </GradeCartoes>
      </SecaoPainel>

      {/* ── de quem eu quero ver ─────────────────────────────────────────── */}
      <SecaoPainel
        nome="De quem eu quero ver"
        cor={cores}
        acao={
          podeEditar ? (
            <button
              type="button"
              className="painel-alvo"
              onClick={() => setEditandoLista((v) => !v)}
              style={{ ...botaoVazado, padding: '3px 10px', fontSize: 11.5 }}
            >
              {editandoLista ? 'pronto' : 'mexer na lista'}
            </button>
          ) : undefined
        }
      >
        <Moldura
          titulo={caixa ? nomeDaCaixa(caixa) : 'Nenhuma caixa'}
          origem="email_contas.fila_remetentes · só esta tela; a régua do Carteiro não muda"
        >
          {lista.length === 0 ? (
            <Aviso>
              A lista está vazia, então a fila mostra todo mundo que escreveu.
              {podeEditar ? ' Escolha abaixo de quem você quer ver.' : ''}
            </Aviso>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {lista.map((x) => (
                <span
                  key={x}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: cor.destaque, border: `1px solid ${cor.borda}`,
                    borderRadius: raio.controle, padding: '3px 8px', fontSize: 12,
                    color: cor.tinta2,
                  }}
                >
                  {x}
                  {editandoLista && podeEditar && (
                    <button
                      type="button"
                      aria-label={`Tirar ${x} da lista`}
                      onClick={() => salvarRemetentes(lista.filter((y) => y !== x))}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: cor.textoFraco, padding: 0, fontSize: 13, lineHeight: 1 }}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          {editandoLista && podeEditar && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <input
                  className="fam-input painel-alvo"
                  value={novoRemetente}
                  onChange={(ev) => setNovoRemetente(ev.target.value)}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); adicionar(novoRemetente) } }}
                  placeholder="fulano@famseguradora.com.br ou @corretora.com.br"
                  style={{ width: 'auto', minWidth: 280, flex: '1 1 280px', padding: '6px 9px', fontSize: 13 }}
                />
                <button type="button" onClick={() => adicionar(novoRemetente)} style={{ ...botaoCheio, padding: '6px 13px' }}>
                  Adicionar
                </button>
              </div>
              <div style={{ ...texto.nota, marginTop: 6 }}>
                Vale o endereço inteiro ou o domínio com @ na frente, que pega a corretora toda.
                Pode ser gente de fora da FAM: esta lista é só de quem VOCÊ quer ver aqui, e não
                mexe na régua que decide o que a FAM aceita como pedido de análise.
              </div>

              {fila.sugestoes.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={texto.rotulo}>Escreveram no período e não estão na lista</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
                    {fila.sugestoes.map((s) => (
                      <button
                        key={s.remetente}
                        type="button"
                        onClick={() => adicionar(s.remetente)}
                        title={`${s.nome} · ${plural(s.quantos, 'e-mail', 'e-mails')}`}
                        style={{ ...botaoVazado, padding: '3px 9px', fontSize: 11.5, fontWeight: 500 }}
                      >
                        + {s.remetente} <span style={{ color: cor.textoFraco }}>({s.quantos})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {caixa && !caixa.ligado && (
            <div style={{ marginTop: 10 }}>
              <Aviso tom="erro">
                Esta caixa está desligada: o Carteiro não está lendo nada dela. Ligue em ⚙ Caixas, na aba Caixa.
              </Aviso>
            </div>
          )}
        </Moldura>
      </SecaoPainel>

      {/* ── a fila, um bloco por remetente ───────────────────────────────── */}
      <SecaoPainel
        nome="O que falta tratar"
        cor={cores}
        acao={
          !somenteLeitura && fila.total > 0 ? (
            /* `flexWrap` porque são TRÊS botões ao lado do título: em 390px
               eles não cabem numa linha só, e sem isto o grupo vazaria para
               fora da tela em vez de descer. */
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="painel-alvo"
                onClick={() => setMarcados(new Set(tudoMarcado ? [] : todosIds))}
                style={{ ...botaoVazado, padding: '3px 10px', fontSize: 11.5 }}
              >
                {tudoMarcado ? 'desmarcar tudo' : 'marcar tudo'}
              </button>
              <button
                type="button"
                className="painel-alvo"
                disabled={!marcadosVivos.length || ocupado}
                onClick={() => mandar('trazer', marcadosVivos)}
                style={{ ...botaoCheio, padding: '4px 12px', fontSize: 11.5, opacity: !marcadosVivos.length || ocupado ? 0.55 : 1 }}
              >
                {ocupado ? 'mandando…' : `Trazer ${marcadosVivos.length || ''} para a esteira`}
              </button>
              {/* JÁ ANALISEI (17/09/2026). Ordem dele: "tem análises que foram
                  feitas... insere uma opção de eu informar que já foi feita".
                  Grava `analisado_fora_em`, que é o campo que a caixa já usava
                  para isso, e o boletim passa a contar a empresa como feita —
                  sem inventar um caso que nunca existiu no CRM. */}
              <button
                type="button"
                className="painel-alvo"
                disabled={!marcadosVivos.length || ocupado}
                onClick={() => mandar('ja_analisado', marcadosVivos)}
                title="A análise desta empresa já foi feita (aqui antes, ou por fora do sistema). Sai da fila e conta como feita no boletim."
                style={{ ...botaoVazado, padding: '4px 12px', fontSize: 11.5, opacity: !marcadosVivos.length || ocupado ? 0.55 : 1 }}
              >
                Já analisei
              </button>
              <button
                type="button"
                className="painel-alvo"
                disabled={!marcadosVivos.length || ocupado}
                onClick={() => mandar('tratar', marcadosVivos)}
                title="Sai da fila sem virar caso: não era pedido de análise."
                style={{ ...botaoVazado, padding: '4px 12px', fontSize: 11.5, opacity: !marcadosVivos.length || ocupado ? 0.55 : 1 }}
              >
                Não é pedido
              </button>
            </span>
          ) : undefined
        }
      >
        {carregando ? (
          <Aviso>Lendo a caixa…</Aviso>
        ) : fila.total === 0 ? (
          <Aviso>
            Fila zerada {janela.frase}. Nada destes remetentes está esperando decisão.
          </Aviso>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {fila.grupos.map((g) => {
              const ids = g.emails.map((e) => e.id)
              const todosMarcados = ids.every((i) => marcados.has(i))
              return (
                <Moldura
                  key={g.remetente}
                  titulo={`${g.nome} · ${plural(g.emails.length, 'e-mail', 'e-mails')}`}
                  origem={g.remetente}
                  acao={
                    !somenteLeitura ? (
                      <button
                        type="button"
                        onClick={() => idsDoGrupo(ids)}
                        style={{ ...botaoVazado, padding: '3px 10px', fontSize: 11.5 }}
                      >
                        {todosMarcados ? 'desmarcar' : 'marcar os ' + g.emails.length}
                      </button>
                    ) : undefined
                  }
                >
                  <div>
                    {g.emails.map((e) => {
                      const aberto = abertos.has(e.id)
                      const anexos = (e.anexos ?? []).map((a) => a?.nome).filter(Boolean) as string[]
                      return (
                        <div key={e.id} style={{ borderBottom: `1px solid ${cor.bordaSuave}`, padding: '6px 0' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            {!somenteLeitura && (
                              <input
                                type="checkbox"
                                checked={marcados.has(e.id)}
                                onChange={() => alternar(e.id)}
                                aria-label={`Marcar ${e.assunto ?? 'e-mail'}`}
                                style={{ marginTop: 3, flexShrink: 0 }}
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => setAbertos((s) => {
                                const n = new Set(s)
                                if (n.has(e.id)) n.delete(e.id); else n.add(e.id)
                                return n
                              })}
                              style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}
                            >
                              <div style={{ ...texto.corpo, fontWeight: 600, color: cor.tinta }}>
                                {e.assunto || '(sem assunto)'}
                              </div>
                              <div style={texto.nota}>
                                {dataCurta(e.recebido_em)}
                                {e.anexos_uteis ? ` · ${plural(e.anexos_uteis, 'anexo', 'anexos')}` : ' · sem anexo'}
                                {e.estado === 'a_trazer' ? ' · a caminho da esteira' : ''}
                                {e.estado === 'erro' ? ` · falhou: ${e.estado_erro ?? 'sem motivo'}` : ''}
                              </div>
                              {/* A PONTE COM O ACERVO (17/09/2026): quando já
                                  existe análise para esta empresa, a tela diz
                                  antes de ele abrir um caso repetido. O
                                  casamento por CNPJ é afirmação; o por nome é
                                  pista, e vai escrito que é. */}
                              {vinculos.get(e.id) && (
                                <div style={{ ...texto.nota, color: cor.ouroTexto }}>
                                  {vinculos.get(e.id)!.firme ? 'já analisada' : 'parece já analisada'}
                                  {': '}
                                  {vinculos.get(e.id)!.analise.razao_social ?? vinculos.get(e.id)!.analise.nome_curto}
                                  {vinculos.get(e.id)!.analise.data_analise
                                    ? ` · ${new Date(`${vinculos.get(e.id)!.analise.data_analise}T12:00:00`).toLocaleDateString('pt-BR')}`
                                    : ''}
                                  {vinculos.get(e.id)!.firme ? ' (pelo CNPJ do assunto)' : ' (pelo nome — confira antes)'}
                                </div>
                              )}
                            </button>
                            {e.caso_id ? (
                              <button
                                type="button"
                                onClick={() => router.push(`/comercial/${e.caso_id}`)}
                                style={{ ...botaoVazado, padding: '3px 10px', fontSize: 11.5, flexShrink: 0 }}
                              >
                                ver o caso
                              </button>
                            ) : !somenteLeitura && (
                              <span style={{ display: 'inline-flex', gap: 6, flexShrink: 0 }}>
                                <button
                                  type="button"
                                  disabled={ocupado || e.estado === 'a_trazer'}
                                  onClick={() => mandar('trazer', [e.id])}
                                  style={{ ...botaoVazado, padding: '3px 10px', fontSize: 11.5, opacity: ocupado || e.estado === 'a_trazer' ? 0.55 : 1 }}
                                >
                                  trazer
                                </button>
                                <button
                                  type="button"
                                  disabled={ocupado}
                                  onClick={() => mandar('ja_analisado', [e.id])}
                                  title="Esta já foi analisada. Sai da fila e conta como feita no boletim do dia."
                                  style={{ ...botaoVazado, padding: '3px 10px', fontSize: 11.5, opacity: ocupado ? 0.55 : 1 }}
                                >
                                  já analisei
                                </button>
                              </span>
                            )}
                          </div>
                          {aberto && (
                            <div style={{ margin: '6px 0 4px 26px' }}>
                              {anexos.length > 0 && (
                                <div style={{ ...texto.apoio, marginBottom: 4 }}>
                                  Anexos: {anexos.join(' · ')}
                                </div>
                              )}
                              <div style={{ ...texto.corpo, color: cor.textoSub, whiteSpace: 'pre-wrap' }}>
                                {e.previa || 'Sem prévia guardada. O e-mail inteiro está na aba Caixa.'}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </Moldura>
              )
            })}
          </div>
        )}

        <div style={{ ...texto.nota, marginTop: 8 }}>
          origem: e-mails da caixa por data de chegada, dos remetentes da lista, que ainda não viraram caso
          nem foram dispensados. O corte é o fim do último dia útil (sem contar feriado), em horário de Brasília.
        </div>
      </SecaoPainel>
    </div>
  )
}
