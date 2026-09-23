'use client'

// ============================================================================
//  OS AVISOS DA LINHA DO TEMPO DO PEDIDO
//
//  Pedido do Marco em 17/09/2026: "é possível responder de forma automática ou
//  com minha autorização a linha de tempo da análise? Quando chega, avisa que
//  recebemos e vamos iniciar as tratativas; passo seguinte triagem/cadastro;
//  outro nó: análise de crédito; outro nó: subscrição."
//
//  A TELA TEM DOIS LADOS, e essa separação é a regra:
//    · A FILA .... o que aconteceu e ainda não foi avisado. Cada linha mostra o
//      texto que sairia, e o botão "Autorizar e enviar" é dele.
//    · A RÉGUA ... um nó por linha: ligado, para quem vai, se pede autorização
//      ou sai sozinho, e se o Outlook grava em Rascunhos ou envia. Só o
//      proprietário mexe aqui: ligar envio automático em nome da FAM não é
//      ajuste de tela.
//
//  DE ONDE O AVISO NASCE: da linha do tempo que o banco já grava
//  (`email_fluxo_eventos` e `fam_historico`), lida por `lib/avisos/varrer.ts`.
//  Quem entrega é o Carteiro, na máquina do Outlook.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { SecaoPainel, Moldura, Aviso } from '@/components/painel/Painel'
import { cor, raio, texto, botaoCheio, botaoVazado, corDaArea } from '@/lib/ui/painel'

type Estado = 'a_autorizar' | 'autorizado' | 'enviando' | 'enviado' | 'cancelado' | 'erro'

interface AvisoPedido {
  id: string
  no: string
  empresa: string | null
  cnpj: string | null
  destinatarios: string[]
  assunto: string
  corpo: string
  estado: Estado
  modo: 'pedir' | 'automatico'
  entregue_como: 'rascunho' | 'enviado' | null
  autorizado_por: string | null
  enviado_em: string | null
  erro: string | null
  ocorrido_em: string
  criado_em: string
}

interface Regra {
  no: string
  ordem: number
  titulo: string
  ligado: boolean
  modo: 'pedir' | 'automatico'
  entrega: 'rascunho' | 'enviar'
  destinatarios: string[]
  assunto: string
  texto: string
  atualizado_por: string | null
}

const quando = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—'

const NOME_ESTADO: Record<Estado, string> = {
  a_autorizar: 'Esperando você',
  autorizado: 'Na fila do Outlook',
  enviando: 'Saindo agora',
  enviado: 'Pronto',
  cancelado: 'Cancelado',
  erro: 'Não deu',
}

const COR_ESTADO: Record<Estado, string> = {
  a_autorizar: cor.ouroTexto,
  autorizado: cor.acao,
  enviando: cor.acao,
  enviado: cor.areaOperacao,
  cancelado: cor.textoFraco,
  erro: cor.alerta,
}

export default function AvisosDoPedido() {
  const [avisos, setAvisos] = useState<AvisoPedido[]>([])
  const [regua, setRegua] = useState<Regra[]>([])
  const [proprietario, setProprietario] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const [mostrarProntos, setMostrarProntos] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/avisos-pedido')
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.erro || `HTTP ${r.status}`)
      setAvisos(j.avisos as AvisoPedido[])
      setRegua(j.regua as Regra[])
      setProprietario(!!j.proprietario)
      setErro('')
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
    const t = setInterval(carregar, 30000)
    return () => clearInterval(t)
  }, [carregar])

  const mandar = async (corpo: Record<string, unknown>) => {
    setErro('')
    const r = await fetch('/api/avisos-pedido', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.ok) { setErro(j.erro || `HTTP ${r.status}`); return false }
    await carregar()
    return true
  }

  const fila = avisos.filter(a => a.estado === 'a_autorizar' || a.estado === 'erro')
  const andando = avisos.filter(a => a.estado === 'autorizado' || a.estado === 'enviando')
  const prontos = avisos.filter(a => a.estado === 'enviado' || a.estado === 'cancelado')
  const semDestino = regua.filter(r => r.ligado && !r.destinatarios.length)

  return (
    <div>
      {erro && <div style={{ marginBottom: 12 }}><Aviso tom="erro">{erro}</Aviso></div>}

      {semDestino.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Aviso>
            <b>Falta dizer para quem vão os avisos.</b> {semDestino.length === regua.length ? 'Nenhum nó' : `${semDestino.length} nó(s)`} ainda
            está sem destinatário, e nada sai sem isso. Escreva os e-mails na régua, aqui embaixo.
          </Aviso>
        </div>
      )}

      {/* ── a fila: o que espera a ordem dele ── */}
      <SecaoPainel nome={`Esperando você (${fila.length})`} cor={corDaArea('comercial')}>
        {carregando ? (
          <div style={texto.nota}>Lendo a linha do tempo…</div>
        ) : fila.length === 0 ? (
          <Aviso>Nenhum aviso esperando. Quando um pedido andar de etapa, ele aparece aqui.</Aviso>
        ) : fila.map(a => (
          <LinhaAviso key={a.id} a={a} regua={regua} aberto={aberto === a.id}
            aoAbrir={() => setAberto(aberto === a.id ? null : a.id)} aoMandar={mandar} />
        ))}
      </SecaoPainel>

      {andando.length > 0 && (
        <SecaoPainel nome={`Com o Outlook (${andando.length})`} cor={corDaArea('analise')}>
          {andando.map(a => (
            <LinhaAviso key={a.id} a={a} regua={regua} aberto={aberto === a.id}
              aoAbrir={() => setAberto(aberto === a.id ? null : a.id)} aoMandar={mandar} />
          ))}
        </SecaoPainel>
      )}

      {prontos.length > 0 && (
        <SecaoPainel nome={`Já avisados (${prontos.length})`} cor={corDaArea('operacoes')}
          acao={<button type="button" onClick={() => setMostrarProntos(v => !v)}
            style={{ background: 'none', border: 'none', color: cor.acao, cursor: 'pointer', fontSize: 12 }}>
            {mostrarProntos ? 'esconder' : 'mostrar'}
          </button>}>
          {mostrarProntos && prontos.map(a => (
            <LinhaAviso key={a.id} a={a} regua={regua} aberto={aberto === a.id}
              aoAbrir={() => setAberto(aberto === a.id ? null : a.id)} aoMandar={mandar} />
          ))}
        </SecaoPainel>
      )}

      {/* ── a régua ── */}
      <SecaoPainel nome="A régua dos avisos" cor={corDaArea('tomadores')}>
        <Moldura titulo="Um nó por linha" origem="aviso_regras · o aviso nasce da linha do tempo que o banco já grava (email_fluxo_eventos e fam_historico)">
          {!proprietario && (
            <div style={{ ...texto.nota, marginBottom: 8 }}>
              Você pode ler a régua. Mudar destinatário, texto e envio automático é do proprietário do CRM.
            </div>
          )}
          {regua.map(r => (
            <LinhaRegua key={r.no} r={r} podeMexer={proprietario} aoMandar={mandar} />
          ))}
        </Moldura>
      </SecaoPainel>
    </div>
  )
}

// ── um aviso ────────────────────────────────────────────────────────────────

function LinhaAviso({ a, regua, aberto, aoAbrir, aoMandar }: {
  a: AvisoPedido
  regua: Regra[]
  aberto: boolean
  aoAbrir: () => void
  aoMandar: (c: Record<string, unknown>) => Promise<boolean>
}) {
  const [para, setPara] = useState(a.destinatarios.join(', '))
  const [assunto, setAssunto] = useState(a.assunto)
  const [corpo, setCorpo] = useState(a.corpo)
  const [ocupado, setOcupado] = useState(false)
  const regra = regua.find(r => r.no === a.no)
  const podeMexer = a.estado === 'a_autorizar' || a.estado === 'erro'
  const lista = (s: string) => s.split(/[;,\s]+/).map(x => x.trim()).filter(Boolean)

  const autorizar = async () => {
    setOcupado(true)
    const mudou = assunto !== a.assunto || corpo !== a.corpo
    if (mudou) await aoMandar({ acao: 'editar', id: a.id, assunto, corpo })
    await aoMandar({ acao: 'autorizar', id: a.id, destinatarios: lista(para) })
    setOcupado(false)
  }

  return (
    <div style={{ background: cor.papel, border: `1px solid ${cor.borda}`, borderLeft: `3px solid ${COR_ESTADO[a.estado]}`, borderRadius: raio.cartao, padding: '10px 12px', marginBottom: 7 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ ...texto.titulo }}>{regra?.titulo ?? a.no}</span>
        <span style={{ ...texto.corpo, color: cor.textoSub, flex: 1, minWidth: 140 }}>{a.empresa ?? 'sem empresa'}</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: COR_ESTADO[a.estado] }}>
          {NOME_ESTADO[a.estado]}
          {a.estado === 'enviado' && a.entregue_como === 'rascunho' ? ' (rascunho no Outlook)' : ''}
        </span>
        <button type="button" onClick={aoAbrir} style={{ background: 'none', border: 'none', color: cor.acao, cursor: 'pointer', fontSize: 12 }}>
          {aberto ? 'fechar' : 'ver o texto'}
        </button>
      </div>
      <div style={{ ...texto.nota, marginTop: 3 }}>
        aconteceu {quando(a.ocorrido_em)}
        {a.destinatarios.length ? ` · para ${a.destinatarios.join(', ')}` : ' · sem destinatário'}
        {a.autorizado_por ? ` · autorizado por ${a.autorizado_por}` : ''}
        {a.enviado_em ? ` · saiu ${quando(a.enviado_em)}` : ''}
      </div>
      {a.erro && <div style={{ ...texto.corpo, color: cor.alerta, marginTop: 4 }}>{a.erro}</div>}

      {aberto && (
        <div style={{ marginTop: 9, borderTop: `1px solid ${cor.bordaSuave}`, paddingTop: 9 }}>
          <label style={{ display: 'block', marginBottom: 7 }}>
            <span style={texto.rotulo}>Para</span>
            <input value={para} onChange={e => setPara(e.target.value)} disabled={!podeMexer}
              placeholder="e-mails separados por vírgula"
              style={campo} />
          </label>
          <label style={{ display: 'block', marginBottom: 7 }}>
            <span style={texto.rotulo}>Assunto</span>
            <input value={assunto} onChange={e => setAssunto(e.target.value)} disabled={!podeMexer} style={campo} />
          </label>
          <label style={{ display: 'block' }}>
            <span style={texto.rotulo}>Mensagem</span>
            <textarea value={corpo} onChange={e => setCorpo(e.target.value)} disabled={!podeMexer} rows={9}
              style={{ ...campo, fontFamily: 'inherit', resize: 'vertical' }} />
          </label>
          {podeMexer && (
            <div style={{ display: 'flex', gap: 8, marginTop: 9, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" style={{ ...botaoCheio, opacity: ocupado ? 0.6 : 1 }} disabled={ocupado} onClick={autorizar}>
                {regra?.entrega === 'enviar' ? 'Autorizar e enviar' : 'Autorizar (vai para Rascunhos)'}
              </button>
              <button type="button" style={botaoVazado} disabled={ocupado} onClick={() => aoMandar({ acao: 'cancelar', id: a.id })}>
                Não avisar
              </button>
              <span style={texto.nota}>
                Quem entrega é o Carteiro, no seu Outlook. Com ele parado, o aviso espera na fila.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const campo: React.CSSProperties = {
  width: '100%', marginTop: 3, border: `1px solid ${cor.borda}`, borderRadius: raio.controle,
  padding: '7px 9px', fontSize: 12.5, boxSizing: 'border-box', background: cor.papel, color: cor.texto,
}

// ── um nó da régua ──────────────────────────────────────────────────────────

function LinhaRegua({ r, podeMexer, aoMandar }: {
  r: Regra; podeMexer: boolean; aoMandar: (c: Record<string, unknown>) => Promise<boolean>
}) {
  const [abrir, setAbrir] = useState(false)
  const [para, setPara] = useState(r.destinatarios.join(', '))
  const [assunto, setAssunto] = useState(r.assunto)
  const [corpoTxt, setCorpoTxt] = useState(r.texto)
  const [salvando, setSalvando] = useState(false)

  const salvar = async (extra: Record<string, unknown> = {}) => {
    if (!podeMexer) return
    setSalvando(true)
    await aoMandar({
      acao: 'regua', no: r.no,
      destinatarios: para.split(/[;,\s]+/).map(x => x.trim()).filter(Boolean),
      assunto, texto: corpoTxt, ...extra,
    })
    setSalvando(false)
  }

  return (
    <div style={{ border: `1px solid ${cor.borda}`, borderRadius: raio.cartao, padding: '9px 11px', marginBottom: 7, background: r.ligado ? cor.papel : cor.fundo }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ ...texto.titulo, minWidth: 190 }}>{r.ordem}. {r.titulo}</span>
        <span style={{ ...texto.nota, flex: 1, minWidth: 160 }}>
          {r.destinatarios.length ? r.destinatarios.join(', ') : 'sem destinatário'}
        </span>
        <Chave rotulo="Ligado" ligado={r.ligado} podeMexer={podeMexer} aoTrocar={v => aoMandar({ acao: 'regua', no: r.no, ligado: v })} />
        <Chave rotulo="Sai sozinho" ligado={r.modo === 'automatico'} podeMexer={podeMexer}
          aoTrocar={v => aoMandar({ acao: 'regua', no: r.no, modo: v ? 'automatico' : 'pedir' })} />
        <Chave rotulo="Envia de verdade" ligado={r.entrega === 'enviar'} podeMexer={podeMexer}
          aoTrocar={v => aoMandar({ acao: 'regua', no: r.no, entrega: v ? 'enviar' : 'rascunho' })} />
        <button type="button" onClick={() => setAbrir(v => !v)} style={{ background: 'none', border: 'none', color: cor.acao, cursor: 'pointer', fontSize: 12 }}>
          {abrir ? 'fechar' : 'texto'}
        </button>
      </div>
      <div style={{ ...texto.nota, marginTop: 3 }}>
        {r.modo === 'automatico'
          ? (r.entrega === 'enviar'
            ? 'Sai sozinho e é enviado, sem passar por você.'
            : 'Sai sozinho e fica em Rascunhos, no seu Outlook, para você mandar.')
          : (r.entrega === 'enviar'
            ? 'Espera a sua autorização e, autorizado, é enviado.'
            : 'Espera a sua autorização e vai para Rascunhos, no seu Outlook.')}
        {r.atualizado_por ? ` · última mudança por ${r.atualizado_por}` : ''}
      </div>

      {abrir && (
        <div style={{ marginTop: 9, borderTop: `1px solid ${cor.bordaSuave}`, paddingTop: 9 }}>
          <label style={{ display: 'block', marginBottom: 7 }}>
            <span style={texto.rotulo}>Para quem vai</span>
            <input value={para} onChange={e => setPara(e.target.value)} disabled={!podeMexer} style={campo}
              placeholder="e-mails separados por vírgula" />
          </label>
          <label style={{ display: 'block', marginBottom: 7 }}>
            <span style={texto.rotulo}>Assunto</span>
            <input value={assunto} onChange={e => setAssunto(e.target.value)} disabled={!podeMexer} style={campo} />
          </label>
          <label style={{ display: 'block' }}>
            <span style={texto.rotulo}>Mensagem</span>
            <textarea value={corpoTxt} onChange={e => setCorpoTxt(e.target.value)} disabled={!podeMexer} rows={10}
              style={{ ...campo, fontFamily: 'inherit', resize: 'vertical' }} />
          </label>
          <div style={{ ...texto.nota, marginTop: 5 }}>
            Marcadores: {'{empresa}'}, {'{saudacao}'}, {'{cnpj}'}, {'{data}'}. Eles são trocados quando o aviso nasce.
          </div>
          {podeMexer && (
            <button type="button" style={{ ...botaoCheio, marginTop: 9, opacity: salvando ? 0.6 : 1 }} disabled={salvando} onClick={() => salvar()}>
              {salvando ? 'Guardando…' : 'Guardar este nó'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Chave({ rotulo, ligado, podeMexer, aoTrocar }: {
  rotulo: string; ligado: boolean; podeMexer: boolean; aoTrocar: (v: boolean) => void
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: cor.textoSub, cursor: podeMexer ? 'pointer' : 'default' }}>
      <input type="checkbox" checked={ligado} disabled={!podeMexer} onChange={e => aoTrocar(e.target.checked)}
        style={{ width: 15, height: 15, accentColor: cor.acao }} />
      {rotulo}
    </label>
  )
}
