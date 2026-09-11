'use client'

/* A FILA DE PEDIDOS · o degrau escolhido na ponte, um pedido por linha
   ═══════════════════════════════════════════════════════════════════════════

   O molde é a fila de triagem do Linear e o Screener do HEY, adaptados:

   · UM PEDIDO POR LINHA, e não um e-mail. Os RE e ENC do mesmo assunto vêm
     juntos ("3 e-mails"), e o "trazer" leva o mais recente com anexo.
   · TECLADO ANTES DO MOUSE. Com o foco na fila: J/K ou as setas andam,
     Enter abre o recibo, T traz, C classifica, E tira da conta, ? mostra os
     atalhos. O Superhuman mede isso em 100 ms, e é o que faz a fila andar.
   · O PORQUÊ À VISTA, RECOLHIDO. Cada linha diz em uma palavra quão certa é
     a decisão (seguro, revisar, incerto: nunca um percentual, que parece
     preciso sem ser), e o recibo abre com os passos e o trecho do e-mail.
   · CONTESTAR VIRA DECISÃO. Classificar à mão é a decisão individual que
     vence a régua, e fica gravada com nome e hora.

   Nada aqui soma nada: os números vêm de lib/email/ponte.ts. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { cor, raio, texto, botaoCheio, botaoVazado } from '@/lib/ui/painel'
import { horasTexto, ROTULO_MOTIVO, type MetasEmail } from '@/lib/email/metricas'
import { ROTULO_BALDE, type Balde, type Demanda, type EmailNaPonte, type Ponte } from '@/lib/email/ponte'
import type { Passo } from '@/lib/email/classificar'
import type { Selecao } from './PonteDoDia'

export type TipoDecisao = 'operacao' | 'so_credito' | 'nao_demanda' | 'sem_apetite'

export interface AcoesFila {
  trazer: (d: Demanda) => void
  classificar: (ids: string[], tipo: TipoDecisao | null, extra?: { modalidade?: string; motivo?: string }) => Promise<boolean>
  jaAnalisado: (ids: string[], desfazer?: boolean) => Promise<boolean>
  aguardar: (ids: string[], motivo: string) => Promise<boolean>
  voltarDoAguardo: (ids: string[]) => Promise<boolean>
  cobrar: (ids: string[]) => Promise<boolean>
  abrirCaso: (casoId: string) => void
}

type Item =
  | { tipo: 'pedido'; chave: string; d: Demanda }
  | { tipo: 'email'; chave: string; e: EmailNaPonte; balde: Balde; pedido?: Demanda }

type Painel = null | 'recibo' | 'classificar' | 'aguardar'

const ETAPA_NOME: Record<string, string> = {
  comercial: 'no Comercial', triagem: 'na Triagem', analise: 'na Análise', encerrado: 'encerrado', descartado: 'descartado na triagem',
}

const semPrefixo = (s: string | null | undefined) =>
  String(s ?? '').replace(/^\s*((re|res|enc|fw|fwd|tr)\s*:\s*)+/i, '').trim() || '(sem assunto)'

const dataCurta = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** "Executante (família)", "Judicial (família)" ou o nome da modalidade. */
export function rotuloModalidades(mods: string[]): string {
  if (!mods.length) return ''
  if (mods.length === 1) return mods[0]
  const prefixos = new Set(mods.map((m) => m.split(/\s+-\s+|\s+para\s+|\s+/)[0]))
  if (prefixos.size === 1) return `${[...prefixos][0]} (família)`
  return `${mods.length} modalidades`
}

export default function FilaPedidos({
  ponte, selecionado, metas, modalidades, excluidas, somenteLeitura, ocupado, acoes, fixos, titulo,
}: {
  ponte: Ponte
  selecionado: Selecao
  metas: MetasEmail
  modalidades: string[]
  excluidas: string[]
  somenteLeitura: boolean
  ocupado: string
  acoes: AcoesFila
  /** Uma lista pronta, no lugar do degrau (a seção "mais antigos parados"). */
  fixos?: Demanda[]
  titulo?: string
}) {
  const itens: Item[] = useMemo(() => {
    const pedidos = (ds: Demanda[]): Item[] => ds.map((d) => ({ tipo: 'pedido', chave: d.id, d }))
    const emails = (es: EmailNaPonte[], balde: Balde): Item[] =>
      es.map((e) => ({ tipo: 'email', chave: e.id, e, balde, pedido: balde === 'continuacao' ? ponte.pedido_da_continuacao[e.id] : undefined }))
    const maisVelhoPrimeiro = (a: Demanda, b: Demanda) => Number(b.parado) - Number(a.parado) || b.horas - a.horas
    const maisNovoPrimeiro = (a: { recebido_em: string | null }, b: { recebido_em: string | null }) =>
      String(b.recebido_em ?? '').localeCompare(String(a.recebido_em ?? ''))

    if (fixos) return pedidos(fixos)
    if (selecionado === 'nao_demanda') return emails([...ponte.emails_nao_demanda].sort(maisNovoPrimeiro), 'nao_demanda')
    if (selecionado === 'continuacao') return emails([...ponte.emails_continuacao].sort(maisNovoPrimeiro), 'continuacao')
    if (selecionado === 'recebidos') {
      return [
        ...pedidos([...ponte.demandas].sort(maisNovoPrimeiro)),
        ...emails(ponte.emails_continuacao, 'continuacao'),
        ...emails(ponte.emails_nao_demanda, 'nao_demanda'),
      ]
    }
    if (selecionado === 'elegiveis') {
      return pedidos(ponte.demandas.filter((d) => d.balde === 'a_fazer' || d.balde === 'resolvido').sort(maisVelhoPrimeiro))
    }
    const lista = ponte.demandas.filter((d) => d.balde === selecionado)
    return pedidos(selecionado === 'a_fazer' || selecionado === 'sem_classificacao' ? lista.sort(maisVelhoPrimeiro) : lista.sort(maisNovoPrimeiro))
  }, [ponte, selecionado, fixos])

  const [foco, setFoco] = useState(0)
  const [aberto, setAberto] = useState<{ chave: string; painel: Painel } | null>(null)
  const [ajuda, setAjuda] = useState(false)
  const [limite, setLimite] = useState(40)
  const lista = useRef<HTMLDivElement>(null)

  const [trocaDe, setTrocaDe] = useState(selecionado)
  if (trocaDe !== selecionado) {
    // Trocar de degrau volta ao topo, sem efeito: é derivado de uma troca de prop.
    setTrocaDe(selecionado)
    setFoco(0)
    setAberto(null)
    setLimite(40)
  }

  const visiveis = itens.slice(0, limite)
  const focoSeguro = Math.min(foco, Math.max(0, visiveis.length - 1))

  useEffect(() => {
    const el = lista.current?.querySelector<HTMLElement>(`[data-indice="${focoSeguro}"]`)
    if (el && lista.current?.contains(document.activeElement)) el.scrollIntoView({ block: 'nearest' })
  }, [focoSeguro])

  const idsDo = (it: Item) => (it.tipo === 'pedido' ? it.d.emails.map((e) => e.id) : [it.e.id])

  function teclado(ev: React.KeyboardEvent<HTMLDivElement>) {
    const alvo = ev.target as HTMLElement
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return
    if (alvo.closest('input, textarea, select')) {
      if (ev.key === 'Escape') { setAberto(null); lista.current?.focus() }
      return
    }
    const it = visiveis[focoSeguro]
    const tecla = ev.key.toLowerCase()
    const abrir = (painel: Painel) => it && setAberto(aberto?.chave === it.chave && aberto.painel === painel ? null : { chave: it.chave, painel })

    if (tecla === 'j' || ev.key === 'ArrowDown') { ev.preventDefault(); setFoco(Math.min(visiveis.length - 1, focoSeguro + 1)) }
    else if (tecla === 'k' || ev.key === 'ArrowUp') { ev.preventDefault(); setFoco(Math.max(0, focoSeguro - 1)) }
    else if (ev.key === 'Enter' || tecla === 'o') { ev.preventDefault(); abrir('recibo') }
    else if (ev.key === 'Escape') { setAberto(null); setAjuda(false) }
    else if (ev.key === '?') { setAjuda((v) => !v) }
    else if (!somenteLeitura && it && (tecla === 'c' || tecla === 'e')) { ev.preventDefault(); abrir('classificar') }
    else if (!somenteLeitura && it && tecla === 't' && it.tipo === 'pedido' && podeTrazer(it.d)) { ev.preventDefault(); acoes.trazer(it.d) }
  }

  if (!itens.length) {
    return (
      <div style={{ ...texto.corpo, color: cor.textoFraco, padding: '14px 4px' }}>
        {fixos ? 'Nenhum pedido parado.' : vazioDo(selecionado)}
      </div>
    )
  }

  return (
    <div>
      {/* GLOBAL, com prefixo `fp-`: as linhas são componentes filhos, e o
          estilo com escopo do styled-jsx não chega nelas (medido na foto do
          ensaio: a coluna da direita caía embaixo do título). */}
      <style jsx global>{`
        .fp-linha { outline: none; }
        .fp-linha[data-foco='true'] { box-shadow: inset 3px 0 0 ${cor.bordaAtiva}; background: ${cor.papelZebra}; }
        .fp-grade {
          display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; gap: 4px 12px; align-items: start;
        }
        .fp-lado { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        @media (max-width: 760px) {
          .fp-grade { grid-template-columns: 14px minmax(0, 1fr); }
          .fp-lado { grid-column: 2; justify-content: flex-start; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ ...texto.titulo, fontSize: 13.5 }}>
          {titulo ?? (selecionado === 'recebidos' ? 'Tudo o que chegou' : selecionado === 'elegiveis' ? 'Elegíveis' : ROTULO_BALDE[selecionado])}
          <span style={{ color: cor.textoFraco, fontWeight: 600 }}> · {itens.length}</span>
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setAjuda((v) => !v)}
          style={{ ...botaoVazado, padding: '3px 9px', fontSize: 11.5, color: cor.textoSub }}
          aria-expanded={ajuda}
        >
          atalhos
        </button>
      </div>

      {ajuda && (
        <div style={{
          ...texto.nota, fontSize: 11.5, marginBottom: 8, padding: '8px 11px', background: cor.papelZebra,
          border: `1px solid ${cor.bordaSuave}`, borderRadius: raio.controle, display: 'flex', flexWrap: 'wrap', gap: '4px 16px',
        }}>
          {[['J  K', 'andar'], ['Enter', 'abrir o porquê'], ['T', 'trazer para a esteira'], ['C', 'classificar'], ['E', 'tirar da conta'], ['Esc', 'fechar']].map(([k, o]) => (
            <span key={k}><Tecla>{k}</Tecla> {o}</span>
          ))}
          <span>Clique na lista antes, para o teclado valer aqui.</span>
        </div>
      )}

      <div
        ref={lista}
        tabIndex={0}
        role="list"
        aria-label="Pedidos"
        onKeyDown={teclado}
        style={{ background: cor.papel, border: `1px solid ${cor.borda}`, borderRadius: raio.cartao, overflow: 'hidden', outline: 'none' }}
      >
        {visiveis.map((it, i) => {
          const painel = aberto?.chave === it.chave ? aberto.painel : null
          const emFoco = i === focoSeguro
          return (
            <div
              key={it.chave}
              role="listitem"
              data-indice={i}
              data-foco={emFoco}
              className="fp-linha"
              onMouseDown={() => setFoco(i)}
              style={{ borderTop: i ? `1px solid ${cor.bordaSuave}` : undefined }}
            >
              {it.tipo === 'pedido'
                ? <LinhaPedido
                    d={it.d} metas={metas} somenteLeitura={somenteLeitura} ocupado={ocupado} acoes={acoes}
                    painel={painel}
                    alternar={(p) => setAberto(painel === p ? null : { chave: it.chave, painel: p })}
                  />
                : <LinhaEmail
                    e={it.e} balde={it.balde} pedido={it.pedido} somenteLeitura={somenteLeitura} ocupado={ocupado}
                    painel={painel}
                    alternar={(p) => setAberto(painel === p ? null : { chave: it.chave, painel: p })}
                  />}

              {painel === 'recibo' && <Recibo it={it} />}
              {painel === 'classificar' && !somenteLeitura && (
                <Classificar
                  it={it} modalidades={modalidades} excluidas={excluidas} ocupado={ocupado === it.chave}
                  fechar={() => { setAberto(null); lista.current?.focus() }}
                  decidir={async (tipo, extra) => {
                    const ok = await acoes.classificar(idsDo(it), tipo, extra)
                    if (ok) { setAberto(null); lista.current?.focus() }
                  }}
                  jaAnalisado={async () => {
                    if (await acoes.jaAnalisado(idsDo(it))) { setAberto(null); lista.current?.focus() }
                  }}
                />
              )}
              {painel === 'aguardar' && !somenteLeitura && it.tipo === 'pedido' && (
                <Aguardar
                  fechar={() => setAberto(null)}
                  salvar={async (motivo) => { if (await acoes.aguardar(idsDo(it), motivo)) setAberto(null) }}
                />
              )}
            </div>
          )
        })}
      </div>

      {itens.length > visiveis.length && (
        <button
          type="button"
          className="painel-alvo"
          onClick={() => setLimite((l) => l + 60)}
          style={{ ...botaoVazado, marginTop: 8, padding: '5px 11px', fontSize: 12 }}
        >
          mostrar mais {Math.min(60, itens.length - visiveis.length)} de {itens.length - visiveis.length}
        </button>
      )}
    </div>
  )
}

function vazioDo(s: Selecao): string {
  switch (s) {
    case 'a_fazer': return 'Nada a fazer neste período. Tudo o que chegou foi resolvido, está fora do apetite ou não era pedido.'
    case 'sem_classificacao': return 'Nenhum pedido sem classificação: a régua soube dizer o que é cada um.'
    case 'fora_apetite': return 'Nenhum pedido fora do apetite neste período.'
    case 'resolvido': return 'Nenhum pedido resolvido neste período.'
    case 'continuacao': return 'Nenhuma resposta ou encaminhamento de pedido que já tinha chegado.'
    case 'nao_demanda': return 'Nenhum e-mail fora da conta neste período.'
    default: return 'Nenhum e-mail neste período.'
  }
}

const podeTrazer = (d: Demanda) =>
  !d.resolvido && d.estado !== 'trazendo' && (d.balde === 'a_fazer' || d.balde === 'sem_classificacao')

/* ── uma linha de pedido ─────────────────────────────────────────────────── */

function LinhaPedido({ d, metas, somenteLeitura, ocupado, acoes, painel, alternar }: {
  d: Demanda
  metas: MetasEmail
  somenteLeitura: boolean
  ocupado: string
  acoes: AcoesFila
  painel: Painel
  alternar: (p: Painel) => void
}) {
  const ocup = ocupado === d.id
  const rep = d.representante
  const casoId = d.emails.find((e) => e.caso_id)?.caso_id ?? null
  const esperando = !!rep.aguardando_desde && !d.resolvido
  const ids = d.emails.map((e) => e.id)

  const ponto =
    d.balde === 'resolvido' ? cor.areaOperacao
    : d.balde === 'fora_apetite' ? cor.borda
    : d.parado ? cor.alerta
    : d.balde === 'sem_classificacao' || d.em_risco ? cor.ouro
    : cor.acao

  const titulo = d.resolvido && rep.razao_social ? rep.razao_social : semPrefixo(d.primeiro.assunto)
  const modalidade = rotuloModalidades(d.modalidades)
  const caso = d.emails.find((e) => e.caso_numero)

  const mais: { valor: string; nome: string; fazer: () => void }[] = somenteLeitura || d.resolvido ? [] : [
    { valor: 'classificar', nome: 'Classificar…', fazer: () => alternar('classificar') },
    ...(esperando
      ? [
          { valor: 'chegou', nome: 'Chegou o documento', fazer: () => { acoes.voltarDoAguardo(ids) } },
          { valor: 'trazer', nome: 'Trazer para a esteira', fazer: () => acoes.trazer(d) },
        ]
      : [{ valor: 'aguardar', nome: 'Aguardando documento…', fazer: () => alternar('aguardar') }]),
    { valor: 'ja', nome: 'Já analisado por fora', fazer: () => { acoes.jaAnalisado(ids) } },
  ]

  return (
    <div className="fp-grade" style={{ padding: '10px 12px' }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: ponto, marginTop: 6 }} />

      <button
        type="button"
        onClick={() => alternar('recibo')}
        aria-expanded={painel === 'recibo'}
        style={{ all: 'unset', cursor: 'pointer', minWidth: 0, display: 'block' }}
      >
        <span style={{
          display: 'block', fontSize: 13.5, fontWeight: 650, color: cor.tinta, lineHeight: 1.35,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {titulo}
        </span>
        <span style={{ ...texto.nota, fontSize: 11.5, display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[
            d.primeiro.de ?? d.primeiro.email_de ?? 'sem remetente',
            d.corretora,
            d.emails.length > 1 ? `${d.emails.length} e-mails` : null,
            d.anexos_uteis ? `${d.anexos_uteis} anexo${d.anexos_uteis === 1 ? '' : 's'}` : null,
            dataCurta(d.recebido_em),
          ].filter(Boolean).join(' · ')}
        </span>
        {esperando && rep.aguardando_motivo && (
          <span style={{ ...texto.nota, display: 'block', color: cor.ouroTexto }}>falta: {rep.aguardando_motivo}</span>
        )}
      </button>

      <div className="fp-lado">
        {modalidade && <Chip tom={d.apetite === 'fora' ? 'cinza' : 'azul'} title={d.modalidades.join(', ')}>{modalidade}</Chip>}
        {!modalidade && d.tipo === 'so_credito' && <Chip tom="azul">Só crédito</Chip>}
        {d.valor && <Chip tom="neutro">{d.valor}</Chip>}
        {d.motivos.map((m) => <Chip key={m} tom="alerta" title={ROTULO_MOTIVO[m].acao}>{ROTULO_MOTIVO[m].nome}</Chip>)}
        <Confianca d={d} />
        <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: d.parado ? cor.alerta : cor.textoSub, fontWeight: d.parado ? 700 : 500, minWidth: 44, textAlign: 'right' }}>
          {d.resolvido ? (caso ? `#${caso.caso_numero}` : 'feito') : horasTexto(d.horas, metas)}
        </span>

        {d.resolvido ? (
          casoId
            ? <BotaoMini onClick={() => acoes.abrirCaso(casoId)}>abrir o caso{caso?.caso_etapa ? ` · ${ETAPA_NOME[caso.caso_etapa] ?? caso.caso_etapa}` : ''}</BotaoMini>
            : (!somenteLeitura && d.estado === 'ja_analisado'
                ? <BotaoMini ocupado={ocup} onClick={() => acoes.jaAnalisado(ids, true)}>desfazer já analisado</BotaoMini>
                : null)
        ) : somenteLeitura ? null : d.estado === 'trazendo' ? (
          <span style={{ ...texto.nota, color: cor.textoSub }}>trazendo…</span>
        ) : esperando ? (
          <BotaoMini tom="cheio" ocupado={ocup} onClick={() => acoes.cobrar(ids)}>{rep.cobrado_em ? 'cobrei de novo' : 'cobrei'}</BotaoMini>
        ) : d.balde === 'fora_apetite' ? (
          <BotaoMini ocupado={ocup} onClick={() => alternar('classificar')}>contestar</BotaoMini>
        ) : (
          <BotaoMini tom="cheio" ocupado={ocup} onClick={() => acoes.trazer(d)}>
            {d.motivos.includes('falhou') ? 'tentar de novo' : 'trazer'}
          </BotaoMini>
        )}

        {mais.length > 0 && (
          /* Lista NATIVA de propósito: menu flutuante some cortado dentro de
             quadro que rola, e no celular a nativa abre o seletor do telefone. */
          <select
            aria-label="Mais ações para este pedido"
            className="painel-alvo"
            value=""
            disabled={ocup}
            onChange={(ev) => mais.find((o) => o.valor === ev.target.value)?.fazer()}
            style={{ ...botaoVazado, padding: '4px 6px', fontSize: 11.5, width: 64 }}
          >
            <option value="" disabled>mais…</option>
            {mais.map((o) => <option key={o.valor} value={o.valor}>{o.nome}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}

/* ── uma linha de e-mail (não é pedido, continuação) ─────────────────────── */

function LinhaEmail({ e, balde, pedido, somenteLeitura, ocupado, painel, alternar }: {
  e: EmailNaPonte
  balde: Balde
  pedido?: Demanda
  somenteLeitura: boolean
  ocupado: string
  painel: Painel
  alternar: (p: Painel) => void
}) {
  const motivo = e.classe.passos[e.classe.passos.length - 1]?.texto
  return (
    <div className="fp-grade" style={{ padding: '9px 12px' }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: cor.borda, marginTop: 6 }} />
      <button type="button" onClick={() => alternar('recibo')} aria-expanded={painel === 'recibo'} style={{ all: 'unset', cursor: 'pointer', minWidth: 0, display: 'block' }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: cor.texto, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {e.assunto ? semPrefixo(e.assunto) : '(e-mail que só o dono da caixa lê)'}
        </span>
        <span style={{ ...texto.nota, fontSize: 11.5, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {balde === 'continuacao' && pedido
            ? `do pedido de ${dataCurta(pedido.recebido_em)}: ${semPrefixo(pedido.primeiro.assunto)}`
            : [e.de ?? e.email_de, motivo, dataCurta(e.recebido_em)].filter(Boolean).join(' · ')}
        </span>
      </button>
      <div className="fp-lado">
        <Chip tom="cinza">{ROTULO_BALDE[balde]}</Chip>
        {!somenteLeitura && balde === 'nao_demanda' && (
          <BotaoMini ocupado={ocupado === e.id} onClick={() => alternar('classificar')}>é pedido</BotaoMini>
        )}
      </div>
    </div>
  )
}

/* ── o recibo da decisão ─────────────────────────────────────────────────── */

const NOME_FONTE: Record<Passo['fonte'], string> = {
  caixa: 'Caixa', assunto: 'Assunto', previa: 'Corpo', anexo: 'Anexo', remetente: 'Remetente',
  humano: 'Decisão', ia: 'IA', regua: 'Régua', sistema: 'Sistema',
}

function Recibo({ it }: { it: Item }) {
  const passos = it.tipo === 'pedido' ? it.d.passos : it.e.classe.passos
  const confianca = it.tipo === 'pedido' ? it.d.confianca : it.e.classe.confianca
  const origem = it.tipo === 'pedido' ? it.d.origem : it.e.classe.origem
  const versao = it.tipo === 'pedido' ? it.d.regua_versao : it.e.classe.regua_versao
  const quem = origem === 'humano' ? 'decisão individual' : origem === 'ia' ? 'IA' : origem === 'caixa' ? 'régua da caixa' : 'régua'

  /* O recibo é escuro de propósito: é o único bloco da tela que fala pela
     máquina, e ele não pode se confundir com o dado do e-mail em volta. O
     dourado aqui é texto sobre marinho, onde ele se lê (sobre branco, não). */
  return (
    <div style={{ margin: '0 12px 12px 34px', background: cor.tinta, borderRadius: raio.cartao, padding: '12px 14px', color: cor.textoClaroSobreEscuro }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: cor.branco, marginBottom: 8, flexWrap: 'wrap' }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: confianca === 'seguro' ? cor.areaOperacao : confianca === 'revisar' ? cor.ouro : cor.textoSobreEscuro }} />
        Decidido em {passos.length} {passos.length === 1 ? 'passo' : 'passos'} · {confianca} · {quem}{versao ? ` · régua v${versao}` : ''}
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {passos.map((p, i) => (
          <li key={i} style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, fontSize: 12.5, lineHeight: 1.5 }}>
            <span style={{ fontSize: 11, color: cor.textoSobreEscuro, paddingTop: 1 }}>▸ {NOME_FONTE[p.fonte]}</span>
            <span>
              {p.texto}
              {p.trecho && (
                <span style={{ display: 'block', marginTop: 2, color: cor.ouro, fontSize: 12 }}>“{p.trecho}”</span>
              )}
            </span>
          </li>
        ))}
      </ol>
      {it.tipo === 'pedido' && it.d.emails.length > 1 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${cor.tinta2}`, fontSize: 11.5, color: cor.textoSobreEscuro }}>
          {it.d.emails.map((e) => (
            <div key={e.id} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {dataCurta(e.recebido_em)} · {e.assunto}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── classificar: a decisão individual ───────────────────────────────────── */

function Classificar({ it, modalidades, excluidas, ocupado, fechar, decidir, jaAnalisado }: {
  it: Item
  modalidades: string[]
  excluidas: string[]
  ocupado: boolean
  fechar: () => void
  decidir: (tipo: TipoDecisao | null, extra?: { modalidade?: string; motivo?: string }) => void
  jaAnalisado: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const origem = it.tipo === 'pedido' ? it.d.origem : it.e.classe.origem
  const resolvido = it.tipo === 'pedido' && it.d.resolvido
  const fora = new Set(excluidas)
  const ordenadas = [...modalidades].sort((a, b) => Number(fora.has(a)) - Number(fora.has(b)) || a.localeCompare(b, 'pt-BR'))

  return (
    <div style={{
      margin: '0 12px 12px 34px', padding: '11px 12px', background: cor.papelZebra,
      border: `1px solid ${cor.borda}`, borderRadius: raio.cartao, display: 'flex', flexDirection: 'column', gap: 9,
    }}>
      <div style={{ ...texto.titulo, fontSize: 12.5 }}>O que é este pedido?</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <BotaoMini ocupado={ocupado} onClick={() => decidir('so_credito')}>Só análise de crédito</BotaoMini>
        <select
          aria-label="Operação de qual modalidade"
          className="painel-alvo"
          value=""
          disabled={ocupado}
          onChange={(ev) => ev.target.value && decidir('operacao', { modalidade: ev.target.value === '__qualquer' ? undefined : ev.target.value })}
          style={{ ...botaoVazado, padding: '4px 8px', fontSize: 12 }}
        >
          <option value="" disabled>Operação de…</option>
          <option value="__qualquer">Operação com apetite (modalidade a ver)</option>
          {ordenadas.map((m) => <option key={m} value={m}>{m}{fora.has(m) ? ' (sem apetite)' : ''}</option>)}
        </select>
        {!resolvido && <BotaoMini ocupado={ocupado} onClick={() => decidir('nao_demanda')}>Não é pedido</BotaoMini>}
        {!resolvido && it.tipo === 'pedido' && <BotaoMini ocupado={ocupado} onClick={jaAnalisado}>Já analisado por fora</BotaoMini>}
      </div>
      <form
        onSubmit={(ev) => { ev.preventDefault(); if (motivo.trim()) decidir('sem_apetite', { motivo: motivo.trim() }) }}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}
      >
        <input
          value={motivo}
          onChange={(ev) => setMotivo(ev.target.value)}
          placeholder="Sem apetite porque… (ex.: garantia de transporte, a FAM não opera)"
          maxLength={500}
          aria-label="Motivo de estar fora do apetite"
          className="fam-input"
          style={{ flex: '1 1 260px', padding: '6px 9px', fontSize: 16, minHeight: 34 }}
        />
        <button type="submit" disabled={ocupado || !motivo.trim()} style={{ ...botaoVazado, padding: '5px 11px', fontSize: 12, opacity: motivo.trim() ? 1 : 0.5 }}>
          Fora do apetite
        </button>
      </form>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {origem === 'humano' && (
          <button type="button" onClick={() => decidir(null)} disabled={ocupado} style={{ ...botaoVazado, padding: '4px 10px', fontSize: 11.5 }}>
            Desfazer a decisão individual
          </button>
        )}
        <span style={{ ...texto.nota, flex: 1 }}>
          A decisão vale para este pedido (todos os e-mails dele) e vence a régua. A régua não muda: para
          ensinar a régua, mude-a na tela da régua.
        </span>
        <button type="button" onClick={fechar} style={{ ...botaoVazado, padding: '4px 10px', fontSize: 11.5 }}>fechar</button>
      </div>
    </div>
  )
}

function Aguardar({ fechar, salvar }: { fechar: () => void; salvar: (motivo: string) => void }) {
  const [falta, setFalta] = useState('')
  return (
    <form
      onSubmit={(ev) => { ev.preventDefault(); if (falta.trim()) salvar(falta.trim()) }}
      style={{
        margin: '0 12px 12px 34px', padding: '10px 12px', background: cor.papelZebra, border: `1px solid ${cor.borda}`,
        borderRadius: raio.cartao, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
      }}
    >
      <input
        autoFocus
        value={falta}
        onChange={(ev) => setFalta(ev.target.value)}
        placeholder="O que está faltando? É o que vai aparecer para ser cobrado."
        maxLength={300}
        className="fam-input"
        style={{ flex: '1 1 280px', padding: '6px 9px', fontSize: 16, minHeight: 34 }}
      />
      <button type="submit" disabled={!falta.trim()} style={{ ...botaoCheio, padding: '6px 12px', fontSize: 12, opacity: falta.trim() ? 1 : 0.5 }}>Aguardando</button>
      <button type="button" onClick={fechar} style={{ ...botaoVazado, padding: '5px 11px', fontSize: 12 }}>cancelar</button>
    </form>
  )
}

/* ── peças pequenas ──────────────────────────────────────────────────────── */

function Confianca({ d }: { d: Demanda }) {
  if (d.origem === 'humano') return <Chip tom="neutro" title="Decisão individual: vence a régua">decisão sua</Chip>
  if (d.resolvido) return null
  const tom = d.confianca === 'seguro' ? 'verde' : d.confianca === 'revisar' ? 'ouro' : 'tracejado'
  const dica = d.confianca === 'seguro'
    ? 'A régua achou no assunto o que decide o pedido.'
    : d.confianca === 'revisar'
      ? 'Achado fora do assunto: vale conferir.'
      : 'A régua não soube decidir: classifique.'
  return <Chip tom={tom} title={dica}>{d.confianca}</Chip>
}

type Tom = 'azul' | 'cinza' | 'neutro' | 'alerta' | 'verde' | 'ouro' | 'tracejado'

function Chip({ tom, title, children }: { tom: Tom; title?: string; children: React.ReactNode }) {
  const t: Record<Tom, React.CSSProperties> = {
    azul: { background: cor.destaque, color: cor.tinta2, border: `1px solid ${cor.destaque}` },
    cinza: { background: cor.bordaSuave, color: cor.textoSub, border: `1px solid ${cor.bordaSuave}` },
    neutro: { background: cor.papel, color: cor.textoSub, border: `1px solid ${cor.borda}` },
    alerta: { background: cor.alertaFundo, color: cor.alerta, border: `1px solid ${cor.alertaBorda}` },
    verde: { background: cor.papel, color: cor.areaOperacao, border: `1px solid ${cor.borda}` },
    ouro: { background: cor.papel, color: cor.ouroTexto, border: `1px solid ${cor.ouro}` },
    tracejado: { background: cor.papel, color: cor.textoFraco, border: `1px dashed ${cor.textoFraco}` },
  }
  return (
    <span title={title} style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap',
      maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', ...t[tom],
    }}>
      {children}
    </span>
  )
}

function Tecla({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700, color: cor.tinta2, background: cor.papel,
      border: `1px solid ${cor.borda}`, borderBottomWidth: 2, borderRadius: 4, padding: '0 5px',
    }}>
      {children}
    </kbd>
  )
}

function BotaoMini({ children, onClick, tom, ocupado }: {
  children: React.ReactNode
  onClick: () => void
  tom?: 'cheio'
  ocupado?: boolean
}) {
  return (
    <button
      type="button"
      className="painel-alvo"
      onClick={onClick}
      disabled={ocupado}
      style={{
        ...(tom === 'cheio' ? botaoCheio : botaoVazado),
        padding: '4px 10px', fontSize: 11.5, whiteSpace: 'nowrap',
        opacity: ocupado ? 0.5 : 1, cursor: ocupado ? 'progress' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}
