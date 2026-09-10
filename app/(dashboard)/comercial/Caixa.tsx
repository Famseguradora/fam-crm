'use client'

/* A CAIXA DE ENTRADA, DENTRO DO CRM.

   Porte da tela `_sistema/cockpit/outlook.html` (o Carteiro), que sai do ar
   junto com o Sistema de Análise de Crédito. O que ela fazia e continua
   fazendo: mostrar a caixa de e-mail na tela, deixar ler o e-mail e os anexos,
   e escolher qual vira demanda.

   O QUE MUDOU DE LUGAR, E POR QUÊ:

   - a lista não vem mais de 127.0.0.1. Vem do Supabase. O CRM nunca busca dado
     na máquina de ninguém para preencher tela dele, e essa regra não muda.
   - "Trazer" virou intenção, não execução: a tela marca, o Carteiro executa em
     seguida. O preço é levar alguns segundos, e a tela DIZ isso em vez de
     fingir que já foi.
   - a régua (o que serve) é aplicada no servidor, e é uma POR CAIXA.

   MUITAS CAIXAS, UMA ESTEIRA (07/09/2026). Todo profissional da FAM pode ligar
   a própria caixa aqui. Duas coisas seguram isso de pé:

     quem liga a caixa é o DONO dela, nunca um colega e nunca o sistema;
     o que a régua RECUSOU só o dono enxerga.

   A segunda é a que importa: caixa de e-mail de uma pessoa tem RH, salário,
   médico e família dentro. O que passou na régua é trabalho e a FAM inteira vê,
   porque é o pedido de análise que vira caso. O que não passou fica com quem é.
   Isso é a RLS que garante, não esta tela.

   O MOTIVO VIAJA SEMPRE, inclusive para quem passou. Sem ele a tela diria "3 de
   27 e-mails" e ninguém saberia se os outros 24 eram propaganda ou a análise
   que se está esperando. Regra que não se explica vira suspeita, e regra em que
   ninguém confia acaba contornada por fora do sistema. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { pistasDoEmail } from '@/lib/casos/pistas'
import { lerChecklistPorNome, type ItemCatalogo } from '@/lib/casos/checklist'

export interface EmailCaixa {
  id: string
  origem: string
  conta_id: string | null
  conta: string | null
  entry_id: string | null
  assunto: string
  de: string | null
  email_de: string | null
  recebido_em: string | null
  nao_lido: boolean
  previa: string | null
  corpo: string | null
  corpo_pedido_em: string | null
  corpo_em: string | null
  anexos: { nome: string; kb: number; tipo?: number }[]
  anexos_uteis: number
  serve: boolean
  motivo: string | null
  estado: string
  estado_em: string | null
  estado_por: string | null
  estado_erro: string | null
  caso_id: string | null
  visto_em: string
}

/* UMA CAIXA POR PROFISSIONAL. Cada uma com o seu dono, o seu liga-desliga e a
   sua régua. Ver o cabeçalho para por que o dono manda. */
interface Conta {
  id: string
  conta: string
  apelido: string | null
  dono_nome: string | null
  sou_dono: boolean
  ligado: boolean
  pasta: string
  so_com_anexo: boolean
  so_nao_lidos: boolean
  dias_para_tras: number
  max_por_rodada: number
  remetentes: string[]
  assunto_contem: string[]
  assunto_ignora: string[]
  maquina: string | null
  ultimo_contato: string | null
  ultima_varredura: string | null
  ultimo_erro: string | null
}

/* "Todos" É A ABA DE ENTRADA (08/09/2026). Ordem dele: "eu preciso ver todos os
   e-mails e a meu critério eu trago para a esteira de análise". A régua continua
   valendo, e continua marcando o que é pedido de análise, mas quem abre a tela
   vê a caixa inteira que a RLS entrega — para o dono da caixa, ela inteira. */
type Aba = 'tudo' | 'serve' | 'trazidos'

const UTEIS = /\.(pdf|docx?|xlsx?|xlsm|pptx?|zip|rar|7z|csv|txt|xml|ofx|rem|p7s|msg|eml)$/i

/* ANEXO ÚTIL É O QUE TEM CARA DE DOCUMENTO, e a lista é por INCLUSÃO, não por
   exclusão. Excluindo só imagem, o aviso do OneDrive ("você excluiu muitos
   arquivos") entrava na caixa com "3 anexos úteis": eram imagens embutidas no
   corpo, com nome de GUID e SEM extensão nenhuma, que a regra de exclusão por
   extensão não pegava. Numa tela que vai ser mostrada para a diretoria, lixo na
   lista de "chegaram para análise" custa caro. */
const anexosReais = (e: EmailCaixa) => (e.anexos ?? []).filter((a) => UTEIS.test(a?.nome ?? ''))

/* O CARTEIRO DAQUELA CAIXA ESTÁ DE PÉ? Quinze minutos sem falar com o CRM e a
   tela já avisa. Fica aqui fora, junto de `desde` e `hora`, porque ler o
   relógio no meio do corpo do componente é leitura impura no React 19. */
const PARADO_APOS_MIN = 15
const estaParado = (quando: string | null) =>
  !quando || Date.now() - new Date(quando).getTime() > PARADO_APOS_MIN * 60000

const hora = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const mesmoDia = d.toDateString() === new Date().toDateString()
  return mesmoDia
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const desde = (iso: string | null) => {
  if (!iso) return ''
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(min)) return ''
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`
}

const nomeDaCaixa = (c: Conta) => c.apelido || c.dono_nome || c.conta

/* QUANTO TEMPO UM PEDIDO FEITO À MÁQUINA PODE FICAR SEM RESPOSTA antes de a
   tela chamar de falha. O Carteiro atende a tela a cada 5 segundos e o Outlook
   às vezes recusa a primeira chamada enquanto sincroniza (ele tenta 3 vezes,
   com pausa), então meio minuto ainda é espera legítima. Passou disso, é falha:
   e falha calada com botão desabilitado foi exatamente o "Buscando na
   máquina…" eterno que ele viu no print de 08/09/2026. */
const ESPERA_MAXIMA_SEG = 45
const segundosDesde = (iso: string | null) => {
  if (!iso) return 0
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  return Number.isFinite(s) ? s : 0
}
/* O carteiro escreve isto no corpo quando o Outlook recusa o e-mail (movido,
   apagado, perfil fora do ar). Vem como texto, e sem esta checagem a tela
   mostraria a mensagem de erro como se fosse o conteúdo do e-mail. */
const NAO_CONSEGUI = /^\[não consegui ler:/i

export default function Caixa({ aoAbrirCaso }: { aoAbrirCaso: () => void }) {
  const router = useRouter()
  const { somenteLeitura } = usePermissoes()

  const [emails, setEmails] = useState<EmailCaixa[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([])
  const [aba, setAba] = useState<Aba>('tudo')
  const [filtroCaixa, setFiltroCaixa] = useState('')
  const [aberto, setAberto] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [verCaixas, setVerCaixas] = useState(false)
  const [possoGerenciar, setPossoGerenciar] = useState(false)
  const [pessoas, setPessoas] = useState<{ auth_id: string; nome: string }[]>([])
  const primeiraCarga = useRef(true)
  // Ref, e não estado, de propósito: se `carregar` dependesse do tamanho da
  // lista de gente, carregá-la dispararia outro carregamento inteiro da tela.
  const pessoasBuscadas = useRef(false)

  /* UM CARREGAMENTO SÓ. As caixas vinham num efeito separado, e o React 19
     reclama com razão: dois efeitos disparando setState no mesmo render é o
     caminho curto para a tela piscar duas vezes a cada volta do relógio. */
  const carregar = useCallback(async () => {
    const supabase = createClient()
    const [{ data: e, error: erroE }, { data: c }, respostaContas] = await Promise.all([
      supabase
        .from('emails_caixa')
        .select('id, origem, conta_id, conta, entry_id, assunto, de, email_de, recebido_em, nao_lido, previa, corpo, corpo_pedido_em, corpo_em, anexos, anexos_uteis, serve, motivo, estado, estado_em, estado_por, estado_erro, caso_id, visto_em')
        /* 500, e não 300: a régua de fábrica passou a trazer 200 por rodada e
           7 dias para trás, e uma lista que corta antes disso seria a tela
           escondendo e-mail de novo, agora por outro motivo. */
        .order('recebido_em', { ascending: false, nullsFirst: false })
        .limit(500),
      primeiraCarga.current
        ? supabase
            .from('caso_item_catalogo')
            .select('id, nome, exigencia, frase_falta, ordem, padroes_nome')
            .eq('ativo', true)
            .order('ordem')
        : Promise.resolve({ data: null }),
      fetch('/api/caixa/contas').then((r) => r.json()).catch(() => ({})),
    ])
    if (erroE) setErro(erroE.message)
    setEmails((e ?? []) as EmailCaixa[])
    if (c) setCatalogo(c as ItemCatalogo[])
    if (respostaContas?.contas) setContas(respostaContas.contas as Conta[])
    if (typeof respostaContas?.posso_gerenciar === 'boolean') setPossoGerenciar(respostaContas.posso_gerenciar)
    /* A lista de gente só é buscada por quem vai atribuir dono. Quem não
       administra não precisa dela na tela nem no HTML. */
    if (respostaContas?.posso_gerenciar && !pessoasBuscadas.current) {
      pessoasBuscadas.current = true
      const { data: u } = await supabase
        .from('usuarios').select('auth_id, nome').eq('status', 'ativo').not('auth_id', 'is', null).order('nome')
      setPessoas((u ?? []) as { auth_id: string; nome: string }[])
    }
    primeiraCarga.current = false
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function salvarCaixa(contaId: string, mudanca: Record<string, string | number | boolean | string[]>) {
    setErro('')
    const r = await fetch('/api/caixa/contas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conta_id: contaId, ...mudanca }),
    })
    const j = await r.json()
    if (!r.ok) return setErro(j.erro ?? 'Não consegui salvar.')
    setContas((antes) => antes.map((c) => (c.id === contaId ? (j.conta as Conta) : c)))
  }

  /* A TELA SE ATUALIZA SOZINHA, e o ritmo depende do que está acontecendo.

     Enquanto há coisa em voo (um Trazer pedido, um texto que a máquina está
     buscando) ela olha de 6 em 6 segundos, porque tem gente esperando na
     frente da tela. Com alguma caixa DE PÉ e nada em voo, ela olha de 20 em
     20: é o "e-mail que chega aparece sozinho" que ele pediu, sem transformar
     a tela num pedido por segundo ao banco.

     COM TODAS AS MÁQUINAS PARADAS ela desacelera para um minuto, e não para de
     vez: é assim que a tela percebe sozinha o Carteiro voltando. O laço antigo
     fazia o contrário: um pedido de texto feito com o Carteiro desligado
     deixava `em voo` ligado para sempre, e a tela recarregava de 6 em 6
     segundos pelo resto do dia esperando uma máquina que não ia responder. */
  /* POR QUE A LISTA ESTÁ VAZIA  ·  09/09/2026
     A frase antiga ("o que a régua recusou na caixa de um colega só ele
     enxerga") era de quando TODO e-mail marcado como serve era legível por
     qualquer usuário do CRM. Desde que o acesso passou a ser por caixa, ela
     virou uma explicação errada — e foi o que ele leu ao abrir a caixa do
     Comercial, que estava vazia por um motivo completamente diferente:
     ninguém a está lendo ainda.

     Vazio tem quatro motivos, e a tela deve dizer QUAL: nenhuma caixa
     autorizada, caixa desligada, caixa ligada que nenhuma máquina leu ainda,
     ou lida mesmo e sem nada que a régua aceitasse. */
  const vazioTudo = () => {
    if (!contas.length) {
      return 'Você não tem acesso a nenhuma caixa. Quem libera é o dono da caixa, na tela de Usuários.'
    }
    const desligadas = contas.filter((c) => !c.ligado)
    if (!contas.some((c) => c.ligado)) {
      return desligadas.length === 1
        ? `A caixa ${nomeDaCaixa(desligadas[0])} está desligada: ninguém a está lendo. Ligue em ⚙ Caixas.`
        : 'Nenhuma das suas caixas está ligada. Enquanto estiverem desligadas, ninguém as lê. Ligue em ⚙ Caixas.'
    }
    const nuncaLidas = contas.filter((c) => c.ligado && !c.ultima_varredura)
    if (nuncaLidas.length) {
      return `${nomeDaCaixa(nuncaLidas[0])} está ligada, mas nenhuma máquina a leu ainda: o Carteiro precisa estar rodando no computador que tem essa caixa aberta no Outlook.`
    }
    return 'A caixa foi lida e não havia nada que a régua aceitasse. A régua está em ⚙ Caixas.'
  }

  const ligadas = contas.filter((c) => c.ligado)
  const dePe = ligadas.filter((c) => !estaParado(c.ultimo_contato))
  const minhas = contas.filter((c) => c.sou_dono)

  const emVoo = useMemo(
    () =>
      emails.some((e) => e.estado === 'a_trazer' || (e.corpo_pedido_em && !e.corpo_em)) ||
      contas.some((c) => c.ligado && !c.ultima_varredura),
    [emails, contas],
  )
  const algumaDePe = dePe.length > 0
  useEffect(() => {
    const t = setInterval(carregar, !algumaDePe ? 60000 : emVoo ? 6000 : 20000)
    return () => clearInterval(t)
  }, [emVoo, algumaDePe, carregar])

  const listas = useMemo(() => {
    const daCaixa = filtroCaixa ? emails.filter((e) => e.conta_id === filtroCaixa) : emails
    return {
      serve: daCaixa.filter((e) => e.serve && ['novo', 'a_trazer', 'erro'].includes(e.estado)),
      tudo: daCaixa,
      trazidos: daCaixa.filter((e) => e.estado === 'trazido'),
    }
  }, [emails, filtroCaixa])

  const lista = listas[aba]
  const atual = emails.find((e) => e.id === aberto) ?? lista[0] ?? null

  async function agir(acao: string, ids: string[], extra: Record<string, unknown> = {}) {
    setErro('')
    setOcupado(ids[0] ?? acao)
    try {
      const r = await fetch('/api/caixa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao, ids, ...extra }),
      })
      const j = await r.json()
      if (!r.ok) setErro(j.erro ?? 'Não consegui.')
    } catch {
      setErro('A conexão caiu. Tente de novo.')
    }
    setOcupado('')
    await carregar()
  }

  const pistas = atual ? pistasDoEmail(atual) : null
  const leitura = atual && catalogo.length
    ? lerChecklistPorNome(anexosReais(atual).map((a) => a.nome), catalogo)
    : null
  const caixaDoAtual = atual ? contas.find((c) => c.id === atual.conta_id) : null

  /* O ESTADO DO PEDIDO DE TEXTO, em quatro palavras e não em uma.
     Antes havia só "pediu ou não pediu", e por isso um pedido feito com o
     Carteiro parado virava "Buscando na máquina…" para sempre, com o botão
     desabilitado e nenhum caminho de volta. */
  const maquinaParada = !caixaDoAtual || estaParado(caixaDoAtual.ultimo_contato)
  const corpoFalhou = !!atual?.corpo && NAO_CONSEGUI.test(atual.corpo)
  const temCorpoInteiro = !!atual?.corpo_em && !corpoFalhou
  const esperando = !!atual?.corpo_pedido_em && !atual?.corpo_em
  // Enquanto a máquina está de pé e a espera é curta, é espera mesmo.
  const buscandoCorpo =
    esperando && !maquinaParada && segundosDesde(atual?.corpo_pedido_em ?? null) < ESPERA_MAXIMA_SEG
  const corpoDemorou = esperando && !buscandoCorpo

  return (
    <div>
      {/* ── o estado das caixas, antes de tudo ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {contas.length === 0 ? (
          <span className="badge badge-gray">Nenhuma caixa</span>
        ) : (
          <span className={`badge ${dePe.length ? 'badge-green' : 'badge-gray'}`}>
            {ligadas.length === 0
              ? `${contas.length} caixa${contas.length === 1 ? '' : 's'}, nenhuma ligada`
              : `${dePe.length} de ${ligadas.length} caixa${ligadas.length === 1 ? '' : 's'} de pé`}
          </span>
        )}

        <span style={{ fontSize: 12.5, color: 'var(--soft)', flex: 1, minWidth: 200 }}>
          {contas.length === 0
            ? 'Nenhuma máquina se apresentou ainda. Rode o Carteiro (CARTEIRO.cmd) na máquina onde o Outlook está aberto.'
            : ligadas.length === 0
              ? 'Todas desligadas. Cada pessoa liga a própria caixa em ⚙ Caixas.'
              : ligadas.length > dePe.length
                ? `${ligadas
                    .filter((c) => estaParado(c.ultimo_contato))
                    .map((c) => `${nomeDaCaixa(c)}: a máquina parou ${desde(c.ultimo_contato) || 'faz tempo'}`)
                    .join(' · ')}. Abra o CARTEIRO.cmd nela: até lá não chega e-mail novo, e o texto inteiro de um e-mail não pode ser buscado.`
                : 'Lendo as caixas ligadas. E-mail que chega aparece aqui sozinho.'}
        </span>

        {contas.length > 1 && (
          <select
            className="fam-input"
            style={{ width: 'auto', minWidth: 170, padding: '6px 10px', fontSize: 13 }}
            value={filtroCaixa}
            onChange={(ev) => { setFiltroCaixa(ev.target.value); setAberto('') }}
          >
            <option value="">Todas as caixas</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>{nomeDaCaixa(c)}</option>
            ))}
          </select>
        )}

        <button
          type="button"
          className="btn-secondary"
          style={{ padding: '6px 12px', fontSize: 13 }}
          onClick={() => setVerCaixas(true)}
        >
          ⚙ Caixas{minhas.some((c) => !c.ligado) ? ' •' : ''}
        </button>
      </div>

      {erro && <div className="alert-error" style={{ marginBottom: 12 }}>{erro}</div>}

      {/* A sua caixa esperando você ligar. Some assim que ligar. */}
      {minhas.some((c) => !c.ligado) && (
        <div style={{
          marginBottom: 12, fontSize: 13, lineHeight: 1.5,
          background: '#fdf6e3', border: '1px solid #e8d9a8', color: '#6b5310',
          borderRadius: 8, padding: '10px 13px',
        }}>
          A sua caixa ({minhas.filter((c) => !c.ligado).map((c) => c.conta).join(', ')}) apareceu aqui e
          está <b>desligada</b>. Ninguém lê a caixa de e-mail de alguém sem essa pessoa ligar.
          {' '}
          <button
            type="button"
            onClick={() => setVerCaixas(true)}
            style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Abrir ⚙ Caixas
          </button>
        </div>
      )}

      {/* ── abas ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {([
          ['tudo', 'Todos os e-mails', listas.tudo.length],
          ['serve', 'Para análise', listas.serve.length],
          ['trazidos', 'Trazidos', listas.trazidos.length],
        ] as [Aba, string, number][]).map(([id, rotulo, n]) => (
          <button
            key={id}
            type="button"
            onClick={() => { setAba(id); setAberto('') }}
            className={aba === id ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '7px 14px', fontSize: 13.5 }}
          >
            {rotulo} <span style={{ opacity: 0.75 }}>{n}</span>
          </button>
        ))}
      </div>

      <div className="caixa-grade">
        {/* ── a lista ── */}
        <div className="card-panel caixa-lista" style={{ padding: 0, overflow: 'hidden' }}>
          {carregando ? (
            <p style={{ color: 'var(--soft)', fontSize: 14, padding: 16 }}>Carregando…</p>
          ) : lista.length === 0 ? (
            <p style={{ color: 'var(--soft)', fontSize: 14, padding: 16 }}>
              {aba === 'serve'
                ? 'Nenhum e-mail marcado como pedido de análise. Todos continuam em "Todos os e-mails".'
                : aba === 'tudo'
                  ? vazioTudo()
                  : 'Nenhum e-mail trazido ainda.'}
            </p>
          ) : (
            <div className="caixa-rolagem">
              {lista.map((e) => {
                const anx = anexosReais(e)
                const ativo = atual?.id === e.id
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setAberto(e.id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                      padding: '11px 13px', border: 'none',
                      borderLeft: `3px solid ${ativo ? '#1e4080' : 'transparent'}`,
                      borderBottom: '1px solid var(--border)',
                      background: ativo ? '#eef4fc' : 'transparent',
                      font: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontWeight: e.nao_lido ? 700 : 600, color: '#0a1628', fontSize: 13.5, lineHeight: 1.35 }}>
                        {e.assunto}
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--soft)', whiteSpace: 'nowrap' }}>{hora(e.recebido_em)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--soft)', marginTop: 3 }}>
                      {e.de ?? e.email_de ?? 'sem remetente'}
                      {anx.length > 0 && ` · ${anx.length} anexo${anx.length === 1 ? '' : 's'}`}
                      {!filtroCaixa && contas.length > 1 && e.conta && ` · caixa de ${e.conta.split('@')[0]}`}
                    </div>
                    {e.estado === 'a_trazer' && (
                      <div style={{ fontSize: 11.5, color: '#8a5a00', marginTop: 4 }}>
                        Esperando a máquina trazer…
                      </div>
                    )}
                    {e.estado === 'erro' && (
                      <div style={{ fontSize: 11.5, color: '#a02020', marginTop: 4 }}>{e.estado_erro}</div>
                    )}
                    {e.estado === 'trazido' && (
                      <div style={{ fontSize: 11.5, color: 'var(--green)', marginTop: 4 }}>
                        Virou caso{e.estado_por ? ` · ${e.estado_por}` : ''}
                      </div>
                    )}
                    {e.estado === 'tratado' && (
                      <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 4 }}>
                        Marcado como tratado{e.estado_por ? ` por ${e.estado_por}` : ''}
                      </div>
                    )}
                    {!e.serve && e.estado === 'novo' && (
                      <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 4 }}>{e.motivo}</div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── o e-mail aberto, e o que dá para ler dele ── */}
        <div className="card-panel caixa-aberto">
          {!atual ? (
            <p style={{ color: 'var(--soft)', fontSize: 14 }}>Escolha um e-mail à esquerda.</p>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 15.5, color: '#0a1628', lineHeight: 1.35 }}>{atual.assunto}</div>
              <div style={{ fontSize: 12.5, color: 'var(--soft)', margin: '5px 0 12px' }}>
                {atual.de}{atual.email_de ? ` · ${atual.email_de}` : ''}
                {atual.recebido_em ? ` · ${new Date(atual.recebido_em).toLocaleString('pt-BR')}` : ''}
                {caixaDoAtual && ` · chegou na caixa de ${nomeDaCaixa(caixaDoAtual)}`}
              </div>

              {!somenteLeitura && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  {atual.caso_id ? (
                    <button type="button" className="btn-primary" onClick={() => router.push(`/comercial/${atual.caso_id}`)}>
                      Abrir o caso
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={atual.estado === 'a_trazer' || ocupado === atual.id}
                      onClick={() => agir('trazer', [atual.id]).then(aoAbrirCaso)}
                    >
                      {atual.estado === 'a_trazer' ? 'Trazendo…' : 'Trazer para a esteira'}
                    </button>
                  )}
                  {!atual.caso_id && (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={ocupado === atual.id}
                      onClick={() => agir('tratar', [atual.id], { desfazer: atual.estado === 'tratado' })}
                    >
                      {atual.estado === 'tratado' ? 'Desfazer "tratado"' : 'Marcar como tratado'}
                    </button>
                  )}
                </div>
              )}

              {atual.estado === 'a_trazer' && (
                <div style={{
                  marginBottom: 12, fontSize: 13, lineHeight: 1.5,
                  background: '#fdf6e3', border: '1px solid #e8d9a8', color: '#6b5310',
                  borderRadius: 8, padding: '9px 12px',
                }}>
                  Pedido feito. Quem busca o e-mail é a máquina onde a caixa está aberta, então isto
                  leva alguns segundos.
                  {caixaDoAtual && estaParado(caixaDoAtual.ultimo_contato) &&
                    ' Essa máquina não está respondendo agora: use o envio à mão aqui embaixo.'}
                </div>
              )}

              {/* ── o que dá para ler do e-mail, com a origem de cada pista ── */}
              {pistas && (
                <div style={{ background: '#f6f9fd', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1a3560', marginBottom: 8 }}>
                    O QUE DÁ PARA LER DAQUI
                  </div>
                  {([
                    ['Tomador', pistas.tomador],
                    ['CNPJ', pistas.cnpj],
                    ['Corretora', pistas.corretora],
                    ['Valor', pistas.valor],
                  ] as const).map(([rotulo, p]) => (
                    <div key={rotulo} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '3px 0' }}>
                      <span style={{ color: 'var(--soft)', width: 78, flexShrink: 0 }}>{rotulo}</span>
                      <span style={{ color: p ? '#0a1628' : 'var(--soft)', fontWeight: p ? 600 : 400 }}>
                        {p ? p.valor : 'não dá para saber pelo e-mail'}
                      </span>
                      {p && <span style={{ color: 'var(--soft)', fontSize: 11.5 }}>({p.origem})</span>}
                    </div>
                  ))}
                  <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 8, lineHeight: 1.45 }}>
                    Tudo aqui é palpite lido do assunto e do remetente. Quem confirma é a triagem, e o
                    que a pessoa decidir vence o palpite.
                  </div>
                </div>
              )}

              {/* ── o checklist da política, pelo nome dos anexos ── */}
              {leitura && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1a3560', marginBottom: 6 }}>
                    O QUE A POLÍTICA PEDE ({leitura.tem.length} de {catalogo.length} pelo nome dos anexos)
                  </div>
                  {[...leitura.tem, ...leitura.faltam]
                    .sort((a, b) => a.ordem - b.ordem)
                    .map((i) => {
                      const veio = leitura.tem.some((t) => t.id === i.id)
                      return (
                        <div key={i.id} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '3px 0', alignItems: 'baseline' }}>
                          <span style={{ color: veio ? 'var(--green)' : i.exigencia === 'bloqueia' ? 'var(--red)' : '#c78a00', fontWeight: 700 }}>
                            {veio ? '✔' : '✖'}
                          </span>
                          <span style={{ color: '#0a1628' }}>{i.nome}</span>
                          <span style={{ color: 'var(--soft)', fontSize: 11.5 }}>
                            {veio ? 'no e-mail' : i.exigencia === 'bloqueia' ? 'trava a esteira' : 'só sinaliza'}
                          </span>
                        </div>
                      )
                    })}
                </div>
              )}

              {/* ── os anexos ── */}
              {(atual.anexos ?? []).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1a3560', marginBottom: 6 }}>
                    ANEXOS ({anexosReais(atual).length} documento{anexosReais(atual).length === 1 ? '' : 's'}
                    {atual.anexos.length > anexosReais(atual).length &&
                      `, ${atual.anexos.length - anexosReais(atual).length} de enfeite`})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {atual.anexos.map((a, i) => {
                      const util = UTEIS.test(a?.nome ?? '')
                      const ext = (a.nome.match(/\.([a-z0-9]+)$/i) ?? [])[1]?.toUpperCase() ?? 'ARQ'
                      return (
                        <span
                          key={i}
                          title={`${a.nome} · ${a.kb || 0} KB`}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%',
                            padding: '4px 9px', borderRadius: 7, fontSize: 12,
                            border: '1px solid var(--border)',
                            background: util ? '#fff' : '#f2f4f7',
                            color: util ? '#0a1628' : 'var(--soft)',
                          }}
                        >
                          <b style={{ fontSize: 10, letterSpacing: 0.4, color: util ? '#1a3560' : 'var(--soft)' }}>{ext}</b>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                            {a.nome.replace(/\.[a-z0-9]+$/i, '')}
                          </span>
                          <span style={{ color: 'var(--soft)', fontSize: 11 }}>{a.kb || 0} KB</span>
                        </span>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 6 }}>
                    Os arquivos só saem da máquina quando o e-mail é trazido. Aqui é só a lista.
                  </div>
                </div>
              )}

              {/* ── o corpo ── */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1a3560' }}>O E-MAIL</span>
                  {!somenteLeitura && atual.entry_id && (!atual.corpo_em || corpoFalhou) && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '5px 11px', fontSize: 12.5 }}
                      disabled={buscandoCorpo || ocupado === atual.id}
                      onClick={() => agir('corpo', [atual.id])}
                    >
                      {buscandoCorpo
                        ? 'Buscando na máquina…'
                        : corpoFalhou || corpoDemorou
                          ? 'Tentar de novo'
                          : 'Ler o e-mail inteiro'}
                    </button>
                  )}
                </div>

                {/* POR QUE NÃO VEIO, com o nome de quem tem que estar de pé.
                    O aviso é o conserto do print de 08/09/2026: o botão dizia
                    "Buscando na máquina…" para sempre, sem dizer que máquina,
                    nem que ela estava parada havia horas. */}
                {(corpoDemorou || corpoFalhou) && (
                  <div style={{
                    marginBottom: 10, fontSize: 12.5, lineHeight: 1.5,
                    background: '#fdf6e3', border: '1px solid #e8d9a8', color: '#6b5310',
                    borderRadius: 8, padding: '9px 12px',
                  }}>
                    {corpoFalhou ? (
                      <>
                        A máquina respondeu, mas não conseguiu ler este e-mail no Outlook:
                        {' '}<b>{String(atual.corpo).replace(NAO_CONSEGUI, '').replace(/]$/, '').trim()}</b>.
                        {' '}Ele pode ter sido movido de pasta ou apagado. A prévia abaixo é a que já estava guardada.
                      </>
                    ) : maquinaParada ? (
                      <>
                        O texto inteiro fica na máquina onde esta caixa está aberta
                        {caixaDoAtual?.maquina ? ` (${caixaDoAtual.maquina})` : ''}, e ela não responde
                        {caixaDoAtual?.ultimo_contato ? ` ${desde(caixaDoAtual.ultimo_contato)}` : ' agora'}.
                        {' '}Abra o <b>CARTEIRO.cmd</b> nela e o texto chega em segundos. Enquanto isso, o que
                        aparece abaixo é a prévia que já veio.
                      </>
                    ) : (
                      <>
                        Pedido feito {desde(atual.corpo_pedido_em)}, e a máquina ainda não respondeu.
                        {' '}Ela busca de 5 em 5 segundos; se não vier, clique em <b>Tentar de novo</b>.
                      </>
                    )}
                  </div>
                )}

                <pre style={{
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
                  font: 'inherit', fontSize: 13, lineHeight: 1.5, color: '#22344d',
                  maxHeight: 300, overflowY: 'auto',
                }}>
                  {(corpoFalhou ? atual.previa : atual.corpo || atual.previa) || '(sem corpo)'}
                </pre>
                {!temCorpoInteiro && atual.previa && (
                  <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 6 }}>
                    Isto é só o começo. O e-mail inteiro fica na máquina até alguém pedir.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── as caixas da FAM, e a régua de cada uma ── */}
      {verCaixas && (
        <div className="modal-overlay" onClick={() => setVerCaixas(false)}>
          <div className="modal-box" style={{ maxWidth: 680 }} onClick={(ev) => ev.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Caixas de e-mail da FAM</span>
              <button type="button" className="btn-secondary" style={{ padding: '5px 11px' }} onClick={() => setVerCaixas(false)}>
                Fechar
              </button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--soft)', lineHeight: 1.5, marginTop: 0 }}>
              Cada caixa aparece aqui sozinha, na primeira vez que o Carteiro roda na máquina onde
              ela está aberta, e aparece <b>desligada</b>. Quem liga é o dono dela.
              {' '}O que a régua aprovar, a FAM inteira vê, porque é o pedido de análise que vira caso.
              {' '}O que ela recusar fica só com o dono da caixa.
            </p>

            {contas.length === 0 && (
              <p style={{ fontSize: 13.5, color: '#0a1628', background: '#f6f9fd', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                Nenhuma máquina se apresentou ainda. Na máquina onde o Outlook clássico está aberto,
                rode o <b>CARTEIRO.cmd</b> e deixe a janela aberta.
              </p>
            )}

            {contas.map((c) => (
              <div key={c.id} style={{ borderTop: '1px solid var(--border)', padding: '14px 0' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 14.5, color: '#0a1628' }}>{nomeDaCaixa(c)}</b>
                  <span style={{ fontSize: 12.5, color: 'var(--soft)' }}>{c.conta}</span>
                  <span className={`badge ${c.ligado ? (estaParado(c.ultimo_contato) ? 'badge-orange' : 'badge-green') : 'badge-gray'}`}>
                    {!c.ligado ? 'desligada' : estaParado(c.ultimo_contato) ? 'máquina parada' : 'lendo'}
                  </span>
                  {c.sou_dono && <span className="badge badge-blue">sua</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--soft)', marginTop: 3 }}>
                  {c.maquina ? `${c.maquina} · ` : ''}
                  {c.ultimo_contato ? `falou com o CRM ${desde(c.ultimo_contato)}` : 'nunca falou com o CRM'}
                  {c.ultima_varredura ? ` · leu a caixa ${desde(c.ultima_varredura)}` : ''}
                </div>
                {c.ultimo_erro && (
                  <div style={{ fontSize: 12, color: '#a02020', marginTop: 4 }}>{c.ultimo_erro}</div>
                )}

                {possoGerenciar && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <span className="form-label" style={{ margin: 0 }}>Dono</span>
                    <select
                      className="fam-input"
                      style={{ width: 'auto', minWidth: 200, padding: '5px 9px', fontSize: 13 }}
                      value={pessoas.find((p) => p.nome === c.dono_nome)?.auth_id ?? ''}
                      disabled={somenteLeitura}
                      onChange={(ev) => salvarCaixa(c.id, { dono_auth_id: ev.target.value })}
                    >
                      <option value="">sem dono</option>
                      {pessoas.map((p) => (
                        <option key={p.auth_id} value={p.auth_id}>{p.nome}</option>
                      ))}
                    </select>
                    <span style={{ fontSize: 11.5, color: 'var(--soft)' }}>
                      atribuir dono é seu; ligar a caixa é só do dono
                    </span>
                  </div>
                )}

                {!c.sou_dono ? (
                  <div style={{ fontSize: 12.5, color: 'var(--soft)', marginTop: 8 }}>
                    Quem liga esta caixa é {c.dono_nome ?? 'o dono dela, que ainda não foi definido'}.
                  </div>
                ) : (
                  <div style={{ marginTop: 10 }}>
                    <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                      <input
                        type="checkbox" checked={c.ligado} style={{ marginTop: 3 }}
                        disabled={somenteLeitura}
                        onChange={(ev) => salvarCaixa(c.id, { ligado: ev.target.checked })}
                      />
                      <span>
                        <b style={{ fontSize: 13.5, color: '#0a1628' }}>Ler esta caixa</b>
                        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--soft)' }}>
                          Desligada, nada é varrido e só o envio à mão funciona.
                        </span>
                      </span>
                    </label>

                    {c.ligado && c.remetentes.length === 0 && (
                      <div style={{
                        marginTop: 8, fontSize: 12.5, lineHeight: 1.5,
                        background: '#fdf6e3', border: '1px solid #e8d9a8', color: '#6b5310',
                        borderRadius: 8, padding: '9px 11px',
                      }}>
                        <b>Sem lista de remetentes.</b> Assim, todo e-mail com anexo desta caixa
                        aparece para a FAM inteira, inclusive um de RH ou do contador. Preenchendo
                        os domínios das corretoras aqui embaixo, só eles passam.
                      </div>
                    )}

                    <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 8 }}>
                      <input
                        type="checkbox" checked={c.so_com_anexo} style={{ marginTop: 3 }}
                        disabled={somenteLeitura}
                        onChange={(ev) => salvarCaixa(c.id, { so_com_anexo: ev.target.checked })}
                      />
                      <span>
                        <b style={{ fontSize: 13.5, color: '#0a1628' }}>
                          Só e-mail com anexo conta como pedido de análise
                        </b>
                        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--soft)' }}>
                          Isto NÃO esconde e-mail de você: em &quot;Todos os e-mails&quot; a sua caixa
                          aparece inteira. O que ele decide é o que entra em &quot;Para análise&quot; e o
                          que a FAM inteira enxerga. Desmarcado, todo e-mail seu (RH, médico, casa)
                          fica visível para os colegas.
                        </span>
                      </span>
                    </label>

                    <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 8 }}>
                      <input
                        type="checkbox" checked={c.so_nao_lidos} style={{ marginTop: 3 }}
                        disabled={somenteLeitura}
                        onChange={(ev) => salvarCaixa(c.id, { so_nao_lidos: ev.target.checked })}
                      />
                      <span>
                        <b style={{ fontSize: 13.5, color: '#0a1628' }}>Só e-mail não lido</b>
                        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--soft)' }}>
                          Cuidado: quem abre o e-mail no Outlook antes some da lista.
                        </span>
                      </span>
                    </label>

                    <div className="form-grid" style={{ marginTop: 12 }}>
                      <div className="form-field">
                        <span className="form-label">Dias para trás</span>
                        <input
                          className="fam-input" type="number" min={1} max={365} defaultValue={c.dias_para_tras}
                          disabled={somenteLeitura}
                          onBlur={(ev) => salvarCaixa(c.id, { dias_para_tras: Number(ev.target.value) })}
                        />
                      </div>
                      <div className="form-field">
                        <span className="form-label">Máximo por rodada</span>
                        <input
                          className="fam-input" type="number" min={1} max={400} defaultValue={c.max_por_rodada}
                          disabled={somenteLeitura}
                          onBlur={(ev) => salvarCaixa(c.id, { max_por_rodada: Number(ev.target.value) })}
                        />
                      </div>
                      <div className="form-field full">
                        <span className="form-label">Pasta do Outlook (vazio = Caixa de Entrada)</span>
                        <input
                          className="fam-input" defaultValue={c.pasta} placeholder="Caixa de Entrada\Analises"
                          disabled={somenteLeitura}
                          onBlur={(ev) => salvarCaixa(c.id, { pasta: ev.target.value })}
                        />
                      </div>
                      <div className="form-field full">
                        <span className="form-label">Só destes remetentes (um por linha; vazio = qualquer um)</span>
                        <textarea
                          className="fam-input" rows={2} defaultValue={c.remetentes.join('\n')}
                          placeholder="@atix.com.br&#10;fulano@corretora.com.br"
                          disabled={somenteLeitura}
                          onBlur={(ev) => salvarCaixa(c.id, { remetentes: ev.target.value })}
                        />
                      </div>
                      <div className="form-field full">
                        <span className="form-label">Ignorar assunto que contenha (um por linha)</span>
                        <textarea
                          className="fam-input" rows={3} defaultValue={c.assunto_ignora.join('\n')}
                          disabled={somenteLeitura}
                          onBlur={(ev) => salvarCaixa(c.id, { assunto_ignora: ev.target.value })}
                        />
                      </div>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--soft)', margin: '6px 0 0', lineHeight: 1.5 }}>
                      Cada campo salva ao sair dele. A régua vale para a caixa de e-mail; o e-mail
                      subido à mão não passa por ela de propósito, porque quem arrasta o arquivo já
                      decidiu.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        /* AS DUAS COLUNAS TERMINAM JUNTAS (08/09/2026).
           Era \`align-items: start\`, e com isso a lista de e-mails parava na
           altura dela e deixava um buraco branco até o pé do painel do e-mail
           aberto — foi o que ele apontou no print: "a caixa fica para cima,
           sobrando espaço vazio". Com \`stretch\`, a coluna da esquerda ocupa a
           altura da direita e a rolagem acontece DENTRO da lista. */
        .caixa-grade {
          display: grid;
          grid-template-columns: minmax(280px, 380px) 1fr;
          gap: 14px;
          align-items: stretch;
          /* ALTURA DE JANELA, e a rolagem por DENTRO de cada coluna, como no
             Outlook. Sem o teto, a lista de 200 e-mails esticava a página para
             quatro mil pixels e as duas colunas iam junto: medido em
             08/09/2026, 3.618px de grade. O 420 é o que fica acima dela (topo
             fixo, título, o estado das caixas e as abas), medido na tela, e o
             min-height e para o notebook baixo nao espremer a lista. */
          height: calc(100vh - 420px);
          min-height: 460px;
        }
        /* O card da lista é uma coluna: cabeçalho nenhum, e a área rolável come
           todo o resto. \`min-height: 0\` é o que faz um filho de flex poder
           encolher e rolar — sem ele o card cresce com a lista inteira e a
           rolagem volta a ser a da página. */
        .caixa-lista { display: flex; flex-direction: column; min-height: 0; }
        .caixa-rolagem { flex: 1; min-height: 0; overflow-y: auto; }
        /* O e-mail aberto rola dentro do próprio painel. É o que permite ler um
           e-mail comprido sem a lista da esquerda sumir da tela. */
        .caixa-aberto { overflow-y: auto; min-height: 0; }

        @media (max-width: 900px) {
          /* No celular não há duas colunas: a grade volta a crescer com o
             conteúdo, e cada pedaço rola com a página. Altura de janela aqui
             daria duas rolagens dentro de uma tela de cinco polegadas. */
          .caixa-grade { grid-template-columns: 1fr; height: auto; min-height: 0; }
          .caixa-rolagem { max-height: 60vh; }
          .caixa-aberto { overflow: visible; }
        }
      `}</style>
    </div>
  )
}
