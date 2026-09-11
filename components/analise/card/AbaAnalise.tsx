'use client'

// ============================================================================
//  ABA 3: A ANÁLISE  ·  rodar, e saber por que parou
//
//  Porte do `painelAnalise` do card.js, bloco por bloco e na mesma ordem:
//
//    1. Precisa da sua autorização ...... os pedidos de alçada (agente_pedidos)
//       e a pergunta do motor (analise_pedidos), ANTES de tudo: enquanto há
//       pedido aberto nada mais nesta aba importa
//    2. Análise em andamento ............ a etapa e a barra
//    3. Por que parou ................... o erro, e quando
//    4. A triagem ....................... N de M conferidos, o que falta, produto
//    5. O portão do cadastro ............ bloqueada: Reler a pasta / Analisar mesmo assim
//    6. Rodar a análise de crédito ...... o resumo do que vai ser lido, o modo,
//       "o que observar", e o botão que muda de nome com o estado
//
//  OS BOTÕES NÃO EXECUTAM: gravam uma ORDEM que o agente do notebook busca e
//  executa pelo mesmo caminho do cockpit (POST /api/analisar, /api/destravar).
//  A tela diz que está esperando o notebook, e escreve o que voltou.
// ============================================================================

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ORDEM, ETAPAS, andamentoDaEtapa, SITUACAO, ordemVale, type Ordem } from '@/lib/analise/esteira'
import { dataCurta, desde } from '@/lib/analise/mesa'
import { maskCNPJ } from '@/lib/utils'
import { type PropsAba } from './comum'

const nomeEtapaOuTexto = (etapa: string | null | undefined, texto: string | null) =>
  texto || ETAPAS.find(([id]) => id === etapa)?.[1] || 'O Claude está lendo os documentos.'

interface PedidoAlcada {
  id: string; acao: string; acao_rotulo: string | null; motivo: string | null; quem: string
  pedido_em: string; status: string; args: Record<string, unknown> | null; decisao_crm: string | null
}
interface PedidoMotor {
  id: string; pasta: string; motivo: string; razao: string | null
  opcoes: { id: string; rotulo: string; detalhe: string | null }[]
  estado: string; resposta: string | null; observacao: string | null; respondido_em: string | null; respondido_por: string | null
}

export default function AbaAnalise({ f, quem, recarregar, aoMandar }: PropsAba & {
  aoMandar: (ordem: Ordem, dados?: Record<string, unknown>) => Promise<void>
}) {
  const [pedidos, setPedidos] = useState<PedidoAlcada[]>([])
  const [pedidoMotor, setPedidoMotor] = useState<PedidoMotor | null>(null)
  const [instrucao, setInstrucao] = useState(f.instrucao ?? '')
  const [modo, setModo] = useState(f.modo ?? '')
  const [obs, setObs] = useState('')
  const [resposta, setResposta] = useState('')
  const [ocupado, setOcupado] = useState('')
  // O relógio do andamento (10/09/2026): anda de segundo em segundo enquanto há algo acontecendo.
  const [agora, setAgora] = useState(() => Date.now())
  const [execucao, setExecucao] = useState<{ etapa: string; etapaTxt: string; mensagem: string; segundosDesde: number } | null>(null)

  useEffect(() => {
    let vivo = true
    const supabase = createClient()
    const ler = async () => {
      const [a, m] = await Promise.all([
        supabase.from('agente_pedidos').select('id, acao, acao_rotulo, motivo, quem, pedido_em, status, args, decisao_crm')
          .eq('status', 'aberto').or(`pasta.eq.${JSON.stringify(f.pasta)},chave.eq.${JSON.stringify(f.chave ?? '')}`)
          .order('pedido_em', { ascending: false }).limit(10),
        supabase.from('analise_pedidos').select('*').eq('pasta', f.pasta).order('criado_em', { ascending: false }).limit(1),
      ])
      if (!vivo) return
      setPedidos((a.data ?? []) as PedidoAlcada[])
      setPedidoMotor(((m.data ?? [])[0] ?? null) as PedidoMotor | null)
    }
    ler()
    const canal = supabase.channel(`card-analise-${f.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agente_pedidos' }, ler)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analise_pedidos' }, ler)
      .subscribe()
    return () => { vivo = false; supabase.removeChannel(canal) }
  }, [f.id, f.pasta, f.chave])

  const decidirAlcada = async (p: PedidoAlcada, decisao: 'autorizar' | 'autorizar_sempre' | 'negar') => {
    let motivo = ''
    if (decisao === 'negar') motivo = window.prompt('Por que não? (ele lê isto, e é assim que ele aprende o seu critério)') ?? ''
    setOcupado(p.id)
    const supabase = createClient()
    await supabase.from('agente_pedidos').update({
      decisao_crm: decisao, decisao_crm_por: quem.nome ?? 'marco', decisao_crm_em: new Date().toISOString(), decisao_crm_motivo: motivo || null,
    }).eq('id', p.id)
    setOcupado('')
  }

  const responderMotor = async (opcaoId: string) => {
    if (!pedidoMotor) return
    setOcupado(opcaoId)
    const nota = obs.trim()
    const rotulo = pedidoMotor.opcoes.find(o => o.id === opcaoId)?.rotulo ?? opcaoId
    const supabase = createClient()
    await supabase.from('analise_pedidos').update({
      estado: 'respondido', resposta: opcaoId, observacao: nota || null,
      respondido_em: new Date().toISOString(), respondido_por: quem.nome,
    }).eq('id', pedidoMotor.id)
    setObs(''); setOcupado('')
    // A opção que manda seguir vira a ordem de analisar, pelo mesmo caminho, e
    // a escolha viaja junto: é ela que o motor lê para não perguntar de novo.
    if (opcaoId !== 'deixar') await aoMandar('iniciar', { instrucao, modo, resposta: nota ? `${rotulo}. ${nota}` : rotulo })
    await recarregar()
  }

  /* A PERGUNTA QUE NÃO VIROU PEDIDO (10/09/2026). O motor parou em
     `aguardando_resposta` mas não abriu linha em `analise_pedidos`: a pergunta
     ficou só no disco, e o card não tinha botão nenhum. O texto dela chega no
     `motivo`, e liberar é dar a ordem de analisar com a decisão escrita. */
  const liberar = async () => {
    const decisao = resposta.trim()
    if (!window.confirm(`Liberar a análise de ${f.nome || f.pasta}?\n\n${decisao
      ? 'Ela volta a rodar com a sua decisão escrita junto.'
      : 'Sem decisão escrita, ela segue com os documentos que estão na pasta e o que ficou em aberto entra como ressalva.'}\n\nFica registrado que a liberação foi sua.`)) return
    setOcupado('liberar')
    await aoMandar('iniciar', { instrucao, modo, resposta: decisao })
    setResposta(''); setOcupado('')
  }

  const rodando = f.situacao === 'em_andamento'
  const parou = f.situacao === 'erro'
  const perguntando = f.situacao === 'aguardando_resposta'
  const cad = f.cadastro
  const bloqueado = cad?.status === 'bloqueado' && f.situacao !== 'concluida'
  const a = f.arquivos
  const escolhidos = a ? a.arquivos.filter(x => f.arquivos_fora_em ? !(f.arquivos_fora ?? []).includes(x.rel) && !x.ignorado : x.usar) : []
  const contabeis = escolhidos.filter(x => x.classe === 'contabil')
  const forasDaLista = a ? a.arquivos.filter(x => !escolhidos.includes(x)) : []
  const temPasta = !f.arquivada && a?.onde !== null && !!a
  const podeMandar = quem.podeEscrever && !f.ordem
  const impedido = rodando || perguntando || (a ? escolhidos.length === 0 : false)
  const oks = (cad?.itens ?? []).filter(i => i.situacao === 'ok' || i.situacao === 'dispensado').length
  const faltam = (cad?.itens ?? []).filter(i => !(i.situacao === 'ok' || i.situacao === 'dispensado'))
  // Na esteira automática, liberar a triagem leva ao Cadastro, e não direto à análise.
  const liberarNaTriagem: Ordem = f.automatica ? 'liberar_triagem' : 'forcar'
  const ordemPrincipal: Ordem = bloqueado ? liberarNaTriagem : (f.situacao === 'concluida' ? 'refazer' : 'iniciar')
  const rotuloPrincipal = bloqueado ? ORDEM[liberarNaTriagem].rotulo : parou ? '▶ Reiniciar a análise' : f.situacao === 'concluida' ? 'Refazer a análise' : 'Analisar agora'

  /* ── A ESTEIRA AUTOMÁTICA (10/09/2026) ─────────────────────────────────────
     As quatro fases, cada uma um funcionário, na ordem em que andam. É o que
     responde "onde está e quem está com ela" sem ler nada. */
  const ca = f.cadastro_agente ?? null
  const triagemVerde = cad?.status === 'aprovado' || cad?.status === 'em_conferencia'
  const triando = !cad || cad.status === 'pendente'
  const credito = f.situacao === 'concluida' ? { est: 'ok', rot: 'pronta', det: 'Análise entregue. O relatório está na aba Relatório.' }
    : rodando ? { est: 'a_caminho', rot: 'analisando', det: f.etapa_texto || 'O motor está trabalhando.' }
      : perguntando ? { est: 'duvida', rot: 'precisa de você', det: 'A análise parou para perguntar. A pergunta está logo abaixo.' }
        : parou ? { est: 'falta', rot: 'falhou', det: f.erro || f.motivo || 'A execução quebrou.' }
          : f.ordem === 'iniciar' ? { est: 'a_caminho', rot: 'começando', det: `Ordem dada por ${f.ordem_por ?? 'alguém'}, esperando o notebook.` }
            : f.situacao === 'pausada' ? { est: 'dispensado', rot: 'parada', det: f.motivo || 'Parada por você.' }
              : { est: 'dispensado', rot: 'aguardando', det: 'Começa sozinha quando o cadastro ficar verde.' }
  const fases = [
    {
      nome: 'Pasta no notebook',
      est: f.hash_documentos ? 'ok' : 'a_caminho', rot: f.hash_documentos ? 'montada' : 'aguardando',
      det: f.hash_documentos ? `${f.documentos} documento(s), com o e-mail dentro. Documento novo: cole na pasta.` : 'Esperando o notebook montar a pasta com o e-mail e os anexos.',
    },
    {
      nome: 'Triagem',
      est: triando ? 'a_caminho' : cad?.status === 'bloqueado' ? 'falta' : 'ok',
      rot: triando ? 'conferindo' : cad?.status === 'bloqueado' ? 'precisa de você' : (cad?.rotulo || 'aprovada'),
      det: triando ? 'O robô está abrindo o e-mail e conferindo os documentos.' : (cad?.motivo || ''),
    },
    {
      nome: 'Cadastro',
      est: !triagemVerde ? 'dispensado' : !ca ? 'a_caminho' : ca.status === 'ok' ? 'ok' : 'falta',
      rot: !triagemVerde ? 'aguardando' : !ca ? 'lendo' : ca.status === 'ok' ? 'conferido' : ca.status === 'erro' ? 'não conseguiu' : 'precisa de você',
      det: !triagemVerde ? 'Começa quando a triagem ficar verde.'
        : !ca ? 'O agente está lendo Serasa, contrato social e cartão CNPJ.'
          : ca.status === 'ok' ? `${ca.razao_social ?? ''} · ${ca.tomador_criado ? 'cadastrado agora' : 'já estava no CRM'}`
            : ca.motivos.join(' · '),
    },
    { nome: 'Análise de crédito', ...credito },
  ]

  /* ── O ANDAMENTO, COM RELÓGIO (10/09/2026) ─────────────────────────────────
     "O ser humano precisa sempre de visualização. Assim que clicar, tem que
     abrir o visual do relógio, mesmo que tenha que aguardar o agente ler antes
     de começar a análise, mas tem que ir me informando."

     Entre o clique e a primeira etapa da análise passam de 1 a 3 minutos que
     antes eram tela parada: o notebook pegar o pedido, o motor abrir o e-mail,
     conferir os documentos e subir o Claude. Cada um vira um passo com hora. */
  const RODAM: Ordem[] = ['iniciar', 'forcar', 'refazer', 'liberar_triagem', 'reconferir']
  const pedidoPendente = !!f.ordem && RODAM.includes(f.ordem)
  const aceitoEm = f.ultima_ordem_em ? new Date(f.ultima_ordem_em).getTime() : 0
  const comecouNoMotor = /^(Comecei|Subindo|Triagem liberada|De volta à fila para refazer)/.test(f.ultima_ordem_resultado ?? '')
  const preparando = !pedidoPendente && !rodando && comecouNoMotor && aceitoEm > 0
    && agora - aceitoEm < 20 * 60000 && !['concluida', 'erro', 'aguardando_resposta'].includes(f.situacao)
  const comRelogio = pedidoPendente || rodando || preparando
  const inicioMs = pedidoPendente && f.ordem_em ? new Date(f.ordem_em).getTime() : aceitoEm || (f.trava_em ? new Date(f.trava_em).getTime() : agora)
  const relogio = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000))
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0')
    return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}:${ss}`
  }

  useEffect(() => {
    if (!comRelogio) return
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [comRelogio])

  // A etapa ao vivo vem do retrato que o notebook grava (a mesma faixa da Mesa).
  useEffect(() => {
    if (!rodando) return
    let vivo = true
    const supabase = createClient()
    const ler = async () => {
      const { data } = await supabase.from('analise_estado').select('dados').eq('id', 'esteira').maybeSingle()
      const lista = ((data?.dados as { execucao?: { execucoes?: { pasta: string; etapa: string; etapaTxt: string; mensagem: string; segundosDesde: number }[] } } | null)?.execucao?.execucoes) ?? []
      if (vivo) setExecucao(lista.find(x => x.pasta === f.pasta) ?? null)
    }
    ler()
    const t = setInterval(ler, 10000)
    return () => { vivo = false; clearInterval(t) }
  }, [rodando, f.pasta])

  const etapaAtual = execucao?.etapa || f.etapa
  const nEtapa = Math.max(1, ETAPAS.findIndex(([id]) => id === etapaAtual) + 1)
  const passosAndamento = [
    { nome: 'Pedido enviado', est: 'ok', rot: dataCurta(pedidoPendente ? f.ordem_em : f.ultima_ordem_em), det: `por ${f.ordem_por ?? quem.nome ?? 'você'}` },
    pedidoPendente
      ? { nome: 'O notebook pega o pedido', est: 'a_caminho', rot: relogio(agora - inicioMs), det: 'O agente da esteira olha os pedidos a cada 10 segundos.' }
      : { nome: 'O notebook pegou o pedido', est: 'ok', rot: 'feito', det: f.ultima_ordem_resultado ?? '' },
    pedidoPendente
      ? { nome: 'Preparando a pasta', est: 'dispensado', rot: 'em seguida', det: 'Abrir o e-mail, conferir os documentos e subir o Claude.' }
      : rodando
        ? { nome: 'Pasta preparada', est: 'ok', rot: 'feito', det: 'E-mail aberto, documentos conferidos, Claude de pé.' }
        : { nome: 'Preparando a pasta', est: 'a_caminho', rot: relogio(agora - aceitoEm), det: 'O motor está abrindo o e-mail, conferindo os documentos e subindo o Claude. Leva de 1 a 3 minutos.' },
    rodando
      ? { nome: 'Analisando', est: 'a_caminho', rot: `etapa ${nEtapa} de ${ETAPAS.length - 1}`, det: execucao?.mensagem || execucao?.etapaTxt || nomeEtapaOuTexto(etapaAtual, f.etapa_texto) }
      : { nome: 'Analisando', est: 'dispensado', rot: 'em seguida', det: 'As 11 etapas da análise, com o nome de cada uma aqui.' },
  ]
  const avisoAndamento = pedidoPendente && agora - inicioMs > 60000
    ? 'O notebook ainda não pegou o pedido. Veja o botão Agente Esteira no topo: se ele disser "Ligar a Esteira", clique nele.'
    : preparando && agora - aceitoEm > 4 * 60000
      ? 'Está demorando mais que o normal para a primeira etapa. Se continuar assim, abra a Mesa: a análise pode estar aparecendo em outro card.'
      : ''

  const lerCadastroDeNovo = async () => {
    setOcupado('cadastro')
    const supabase = createClient()
    await supabase.from('analise_fila').update({ cadastro_agente: null, cadastro_agente_em: null }).eq('id', f.id)
    setOcupado('')
    await recarregar()
  }

  const mandar = async (ordem: Ordem, extra?: Record<string, unknown>) => {
    setOcupado(ordem)
    await aoMandar(ordem, { instrucao, modo, ...extra })
    setOcupado('')
    // O botão fica no pé da aba; o relógio aparece no topo. Levar o olho até ele.
    setTimeout(() => document.getElementById('an-andamento')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400)
  }

  return (
    <div>
      {/* ── o andamento, com relógio ── */}
      {comRelogio && (
        <div className="an-bloco" id="an-andamento">
          <h4>
            {rodando ? 'A análise está rodando' : pedidoPendente ? 'Pedido enviado ao notebook' : 'Preparando a análise'}
            <span className="dir" style={{ fontSize: 20, fontWeight: 700, color: '#1e4080', fontVariantNumeric: 'tabular-nums' }}>
              {relogio(agora - inicioMs)}
            </span>
          </h4>
          {passosAndamento.map(p => (
            <div key={p.nome} className="an-fam">
              <b style={{ flexShrink: 0 }}>{p.nome}</b>
              <span className="n" style={{ flex: 1, minWidth: 0 }}>{p.det}</span>
              <span className={`est ${p.est}`} style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{p.rot}</span>
            </div>
          ))}
          {rodando && <div className="an-barra"><i style={{ width: `${andamentoDaEtapa(etapaAtual)}%` }} /></div>}
          {avisoAndamento && <div className="an-aviso aviso"><span>!</span><span>{avisoAndamento}</span></div>}
          <div className="an-dica">A tela se atualiza sozinha. Pode sair e voltar: o relógio conta desde o clique.</div>
        </div>
      )}

      {/* ── 0. a esteira automática ── */}
      {f.automatica && (
        <div className="an-bloco">
          <h4>Esteira automática</h4>
          {fases.map(p => (
            <div key={p.nome} className="an-fam">
              <b style={{ flexShrink: 0 }}>{p.nome}</b>
              <span className="n" style={{ flex: 1, minWidth: 0 }}>{p.det}</span>
              <span className={`est ${p.est}`} style={{ flexShrink: 0 }}>{p.rot}</span>
            </div>
          ))}
        </div>
      )}

      {ca && (
        <div className="an-bloco">
          <h4>O que o agente de Cadastro achou<span className="dir">{dataCurta(ca.em)}</span></h4>
          {ca.motivos.map((m, i) => <div key={`m${i}`} className="an-aviso erro"><span>⛔</span><span>{m}</span></div>)}
          {ca.status === 'ok' && (
            <div className="an-aviso bom"><span>✓</span><span>
              Tomador <b>{ca.razao_social}</b>{ca.cnpj ? ` (${maskCNPJ(ca.cnpj)})` : ''} {ca.tomador_criado ? 'cadastrado agora' : 'já estava no CRM'},
              {ca.fonte === 'receita' ? ' com os dados da Receita' : ' com os dados do Serasa (a Receita não respondeu)'}.
              {ca.preenchidos.length ? ` Campos completados: ${ca.preenchidos.length}.` : ''}
              {ca.analise_mandada ? ' Mandado para a análise de crédito.' : ''}
            </span></div>
          )}
          {ca.atencao.map((m, i) => <div key={`a${i}`} className="an-aviso aviso"><span>!</span><span>{m}</span></div>)}
          {ca.conferencia.length > 0 && (
            <>
              <div className="an-dica" style={{ margin: '10px 0 6px' }}>Contrato social x Serasa</div>
              {ca.conferencia.map((c, i) => (
                <div key={`c${i}`} className="an-fam">
                  <b style={{ flexShrink: 0 }}>{c.campo}</b>
                  <span className="n" style={{ flex: 1, minWidth: 0 }}>
                    contrato: {c.contrato_social ?? 'não traz'} · Serasa: {c.serasa ?? 'não traz'}{c.nota ? ` · ${c.nota}` : ''}
                  </span>
                  <span className={`est ${c.gravidade === 'ok' ? 'ok' : c.gravidade === 'bloqueia' ? 'falta' : 'duvida'}`} style={{ flexShrink: 0 }}>
                    {c.gravidade === 'ok' ? 'confere' : c.gravidade === 'bloqueia' ? 'não confere' : 'atenção'}
                  </span>
                </div>
              ))}
            </>
          )}
          {ca.observacoes && <div className="an-explica">{ca.observacoes}</div>}
          {quem.podeEscrever && ca.status !== 'ok' && (
            <div className="an-bt-linha" style={{ marginTop: 8 }}>
              {ordemVale('iniciar', f.situacao) && (
                <button type="button" className="an-bt ouro" disabled={!podeMandar || !!ocupado}
                  onClick={() => { if (window.confirm('Mandar para a análise de crédito com o cadastro parado?\n\nFica registrado que a decisão foi sua.')) mandar('iniciar') }}>
                  Autorizar e mandar para o Crédito
                </button>
              )}
              <button type="button" className="an-bt" disabled={!!ocupado} onClick={lerCadastroDeNovo}>
                {ocupado === 'cadastro' ? 'Pedindo…' : 'Ler o cadastro de novo'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── 1. precisa da sua autorização ── */}
      {pedidos.length > 0 && (
        <div className="an-bloco">
          <h4>Precisa da sua autorização{pedidos.length > 1 && <span className="dir">{pedidos.length} pedidos</span>}</h4>
          {pedidos.map(p => (
            <div key={p.id} className="an-pedido">
              <div className="cab">{p.acao_rotulo || p.acao}</div>
              <div style={{ fontSize: 12, color: '#6080a0', marginBottom: 6 }}>pedido por <b>{p.quem || 'a IA'}</b> · {dataCurta(p.pedido_em)}</div>
              {p.motivo && <div className="raz">{p.motivo}</div>}
              {p.decisao_crm ? (
                <div className="an-aviso bom" style={{ marginTop: 10 }}><span>✓</span><span>Você decidiu: <b>{p.decisao_crm === 'negar' ? 'negar' : p.decisao_crm === 'autorizar_sempre' ? 'autorizar e liberar sempre' : 'autorizar'}</b>. O notebook aplica em segundos.</span></div>
              ) : quem.analista ? (
                <div className="an-bt-linha" style={{ marginTop: 10 }}>
                  <button type="button" className="an-bt ouro" disabled={!!ocupado} onClick={() => decidirAlcada(p, 'autorizar')}>Autorizar</button>
                  <button type="button" className="an-bt" disabled={!!ocupado} onClick={() => decidirAlcada(p, 'autorizar_sempre')}>Autorizar e liberar sempre</button>
                  <button type="button" className="an-bt forcar" disabled={!!ocupado} onClick={() => decidirAlcada(p, 'negar')}>Negar</button>
                </div>
              ) : <div className="an-dica">A decisão é do analista de crédito. Você está acompanhando.</div>}
            </div>
          ))}
        </div>
      )}

      {pedidoMotor && pedidoMotor.estado === 'aberto' && (
        <div className="an-bloco">
          <h4>A análise parou e precisa de você</h4>
          <div className="an-pedido">
            <div className="mot">{pedidoMotor.motivo}</div>
            {pedidoMotor.razao && <div className="raz">{pedidoMotor.razao}</div>}
            {quem.analista ? (
              <>
                <div className="an-campo" style={{ marginTop: 10, marginBottom: 8 }}>
                  <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="Quer dizer alguma coisa junto? (opcional)" />
                </div>
                <div className="an-bt-linha">
                  {pedidoMotor.opcoes.map(o => (
                    <button key={o.id} type="button" className="an-bt" title={o.detalhe ?? undefined} disabled={!!ocupado} onClick={() => responderMotor(o.id)}>
                      {ocupado === o.id ? 'Enviando…' : o.rotulo}
                    </button>
                  ))}
                </div>
              </>
            ) : <div className="an-dica">A decisão é do analista de crédito. Você está acompanhando.</div>}
          </div>
        </div>
      )}
      {pedidoMotor && pedidoMotor.estado === 'respondido' && (
        <div className="an-aviso"><span>✓</span><span><b>Você decidiu:</b> {pedidoMotor.opcoes.find(o => o.id === pedidoMotor.resposta)?.rotulo ?? pedidoMotor.resposta}
          {pedidoMotor.respondido_em ? ` · ${dataCurta(pedidoMotor.respondido_em)}` : ''}{pedidoMotor.observacao ? ` · “${pedidoMotor.observacao}”` : ''}</span></div>
      )}

      {perguntando && pedidoMotor?.estado !== 'aberto' && (
        <div className="an-bloco">
          <h4>A análise parou e precisa de você</h4>
          <div className="an-pedido">
            <div className="mot" style={{ whiteSpace: 'pre-wrap' }}>{f.motivo || 'A análise parou para perguntar e não escreveu a pergunta.'}</div>
            {quem.analista ? (
              <>
                <div className="an-campo" style={{ marginTop: 10, marginBottom: 8 }}>
                  <label htmlFor="an-resposta">Sua decisão</label>
                  <textarea id="an-resposta" value={resposta} onChange={e => setResposta(e.target.value)} rows={3} maxLength={600}
                    placeholder="Ex.: seguir com a opção B, o imóvel entra como ressalva. Em branco, segue com o que está na pasta." />
                </div>
                <div className="an-bt-linha">
                  <button type="button" className="an-bt ouro" disabled={!podeMandar || !!ocupado} onClick={liberar}>
                    {ocupado === 'liberar' ? 'Mandando…' : 'Liberar para análise'}
                  </button>
                  <span className="an-bt-nota">
                    {f.ordem ? `Esperando o notebook executar "${ORDEM[f.ordem].rotulo.toLowerCase()}".`
                      : 'A análise volta para a fila com a sua decisão escrita junto, e fica registrado que a liberação foi sua.'}
                  </span>
                </div>
              </>
            ) : <div className="an-dica">A decisão é do analista de crédito. Você está acompanhando.</div>}
          </div>
        </div>
      )}

      {/* ── 2. em andamento ── */}
      {rodando && (
        <div className="an-bloco">
          <h4>Análise em andamento</h4>
          <div className="an-pensando"><i className="an-girando" /><span><b>{f.etapa_texto || 'Trabalhando…'}</b>{f.trava_maquina ? ` · ${f.trava_maquina}` : ''}{f.etapa_em ? ` · ${desde(f.etapa_em)}` : ''}</span></div>
          <div className="an-barra"><i style={{ width: `${andamentoDaEtapa(f.etapa)}%` }} /></div>
          <div className="an-dica">Etapa {Math.max(1, ETAPAS.findIndex(([id]) => id === f.etapa) + 1)} de {ETAPAS.length - 1}. O andamento aparece na Mesa, na faixa de cima.</div>
          {quem.podeEscrever && (
            <div className="an-bt-linha" style={{ marginTop: 10 }}>
              <button type="button" className="an-bt forcar" disabled={!podeMandar || !!ocupado} onClick={() => mandar('parar')}>Interromper agora</button>
              <span className="an-bt-nota">Derruba a execução e devolve a pasta para a fila, sem apagar nada.</span>
            </div>
          )}
        </div>
      )}

      {/* ── 3. por que parou ── */}
      {parou && (
        <div className="an-bloco">
          <h4>Por que parou</h4>
          <div className="an-aviso erro"><span>⛔</span><span>{f.erro || f.motivo || 'A análise terminou em erro, sem motivo registrado.'}</span></div>
          <div className="an-dica">O que já tinha sido lido continua na pasta: reiniciar não joga fora o trabalho feito.</div>
        </div>
      )}
      {f.situacao === 'pausada' && (
        <div className="an-bloco">
          <h4>Parada por você</h4>
          <div className="an-aviso aviso"><span>⏸</span><span>{f.motivo}</span></div>
          {quem.podeEscrever && <div className="an-bt-linha" style={{ marginTop: 8 }}>
            <button type="button" className="an-bt" disabled={!podeMandar || !!ocupado} onClick={() => mandar('retomar')}>Voltar para a fila</button>
          </div>}
        </div>
      )}

      {/* ── 4. a triagem ── */}
      {cad && cad.itens?.length > 0 && (
        <div className="an-bloco">
          <h4>A triagem</h4>
          <div className="an-resumo">
            <b>{oks} de {cad.itens.length}</b> conferidos · {faltam.length ? <>falta {faltam.map(i => i.nome).join(', ')}</> : 'nada faltando'}.
            {(cad.produto || f.produto) && <><br />Produto: <b>{cad.produto || f.produto}</b></>}
            {(cad.corretora || f.corretora) && <> · Corretora: <b>{cad.corretora || f.corretora}</b></>}
          </div>
          {cad.itens.map(i => {
            const ok = i.situacao === 'ok' || i.situacao === 'dispensado'
            return (
              <div key={i.id} className="an-fam">
                <b>{i.nome}</b>
                <span className="n">{i.exigencia === 'bloqueia' ? 'obrigatório' : 'sinaliza'}</span>
                <span className={`est ${ok ? 'ok' : i.situacao === 'duvida' ? 'duvida' : i.situacao === 'a_caminho' ? 'a_caminho' : 'falta'}`}>
                  {i.situacao === 'ok' ? 'recebido' : i.situacao === 'dispensado' ? 'dispensado' : i.situacao === 'duvida' ? 'a confirmar' : i.situacao === 'a_caminho' ? 'vai chegar' : 'faltando'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── 5. o portão do cadastro ── */}
      {bloqueado && (
        <div className="an-bloco">
          <h4>Análise</h4>
          <div className="an-aviso erro"><span>⛔</span><span>{cad?.motivo || 'Falta documento obrigatório.'}</span></div>
          <div className="an-explica">
            {f.automatica
              ? <>Documento que faltava: <b>cole na pasta do tomador</b> no notebook (ou suba na tela do caso) e a triagem refaz sozinha. Se quer seguir com o que tem, autorize: o agente de Cadastro assume e a análise vem depois.</>
              : <>Se o documento <b>já está na pasta</b>, é a conferência que está velha: eu releio a pasta agora, abro o e-mail que estiver dentro e refaço a lista. Se você quer analisar assim mesmo, com o que tem, a decisão é sua.</>}
          </div>
          {quem.podeEscrever && (
            <div className="an-bt-linha">
              <button type="button" className="an-bt" disabled={!podeMandar || !!ocupado} onClick={() => mandar('reconferir')}>Reler a pasta agora</button>
              {f.automatica ? (
                <button type="button" className="an-bt ouro" disabled={!podeMandar || !!ocupado}
                  onClick={() => { if (window.confirm(`Seguir sem ${(cad?.bloqueios ?? []).map(b => b.nome).join(' e ') || 'os documentos obrigatórios'}?\n\nO agente de Cadastro assume em seguida e a análise sai apontando o que faltou. Fica registrado que a liberação foi sua.`)) mandar('liberar_triagem') }}>
                  Autorizar e seguir para o Cadastro
                </button>
              ) : (
                <button type="button" className="an-bt forcar" disabled={!podeMandar || !!ocupado}
                  onClick={() => { if (window.confirm(`Analisar sem ${(cad?.bloqueios ?? []).map(b => b.nome).join(' e ') || 'os documentos obrigatórios'}?\n\nVou reler a pasta primeiro. Se mesmo assim não achar, começo a análise do mesmo jeito e ela sai apontando o que faltou. Fica registrado que a liberação foi sua.`)) mandar('forcar') }}>
                  Analisar mesmo assim
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 6. rodar ── */}
      <div className="an-bloco">
        <h4>{temPasta || !a ? 'Rodar a análise de crédito' : 'Refazer a análise'}</h4>
        {a && !temPasta && f.situacao !== 'concluida' ? (
          <div className="an-vazio">A pasta deste tomador não está na raiz. Use o <b>Refazer</b>: ele traz a pasta de volta de <b>_concluidas</b>, junta o que chegou e devolve para a fila.</div>
        ) : null}

        {a && (
          <div className="an-resumo">
            Vou ler <b>{escolhidos.length}</b> arquivo{escolhidos.length === 1 ? '' : 's'}
            {contabeis.length ? <>, sendo <b>{contabeis.length}</b> {contabeis.length === 1 ? 'contábil' : 'contábeis'}</> : null}.
            {forasDaLista.length ? (
              <ul>{forasDaLista.slice(0, 5).map(x => <li key={x.rel}>fora: {x.nome}</li>)}{forasDaLista.length > 5 && <li>e mais {forasDaLista.length - 5}</li>}</ul>
            ) : ' Nada foi deixado de fora.'}
          </div>
        )}
        {(a?.avisos ?? []).filter(v => v.nivel === 'erro').map((v, i) => (
          <div key={i} className="an-aviso erro"><span>⛔</span><span>{v.txt}</span></div>
        ))}
        {!a && <div className="an-explica">A lista de arquivos chega pelo agente do notebook. Sem ela, a análise roda com tudo o que estiver na pasta.</div>}

        {quem.podeEscrever && (
          <>
            <div className="an-campo">
              <label htmlFor="an-modo">Como rodar</label>
              <select id="an-modo" value={modo} onChange={e => setModo(e.target.value)}>
                <option value="">Completa, no modelo forte (o de sempre)</option>
                <option value="rapida">Rápida, no modelo veloz</option>
              </select>
              <div className="an-dica" style={{ marginTop: 3 }}>A rápida serve para ver o retrato antes de decidir. Análise que vai para o comitê roda no forte.</div>
            </div>
            <div className="an-campo">
              <label htmlFor="an-instrucao">O que observar nesta análise</label>
              <textarea id="an-instrucao" value={instrucao} onChange={e => setInstrucao(e.target.value)}
                placeholder="Opcional. Ex.: o balanço de 2025 é consolidado, use o da controladora. A obra é em consórcio, considere só a parte da tomadora." />
              <div className="an-dica" style={{ marginTop: 3 }}>Isto vai junto com a sua seleção de arquivos, no mesmo recado que a análise lê antes de começar.</div>
            </div>

            <div className="an-bt-linha">
              <button type="button" className={`an-bt grande ${bloqueado ? 'forcar' : 'ouro'}`} disabled={!podeMandar || impedido || !!ocupado}
                onClick={() => {
                  if ((ordemPrincipal === 'forcar' || ordemPrincipal === 'liberar_triagem') && !window.confirm('Seguir mesmo faltando documento obrigatório? Fica registrado que a liberação foi sua.')) return
                  mandar(ordemPrincipal, ordemPrincipal === 'refazer' ? { escopo: 'completa' } : {})
                }}>
                {ocupado === ordemPrincipal ? 'Mandando…' : rotuloPrincipal}
              </button>
              <span className="an-bt-nota">
                {rodando ? 'Já tem uma análise desta pasta rodando.'
                  : perguntando ? 'Responda a pergunta lá em cima: é o "Liberar para análise" que faz ela voltar a rodar.'
                  : f.ordem ? `Esperando o notebook executar "${ORDEM[f.ordem].rotulo.toLowerCase()}".`
                    : a && !escolhidos.length ? 'Marque ao menos um arquivo na aba Arquivos.'
                      : bloqueado ? 'Vou reler a pasta, registrar o que você dispensou e começar.'
                        : parou ? 'Começa de novo, do zero, e você acompanha pela faixa da Mesa.'
                          : 'Começa agora e você acompanha pela faixa da Mesa. Quem executa é o notebook do analista.'}
              </span>
            </div>
            {f.situacao === 'concluida' && !f.ordem && (
              <div className="an-bt-linha" style={{ marginTop: 6 }}>
                <button type="button" className="an-bt mini" disabled={!!ocupado} onClick={() => mandar('refazer', { escopo: 'parcial' })}>Refazer só as partes relacionadas</button>
                <span className="an-bt-nota">Reaproveita a leitura dos documentos. Score, limite, rating e conclusão são sempre recalculados.</span>
              </div>
            )}
            {!bloqueado && !rodando && f.situacao !== 'concluida' && (
              <div className="an-bt-linha" style={{ marginTop: 6 }}>
                <button type="button" className="an-bt mini" disabled={!podeMandar || !!ocupado} onClick={() => mandar('reconferir')}>Reler a pasta agora</button>
                {f.situacao !== 'pausada' && <button type="button" className="an-bt mini" disabled={!podeMandar || !!ocupado} onClick={() => mandar('pausar')}>Parar</button>}
              </div>
            )}
          </>
        )}

        {f.ordem && (
          <div className="an-ordem">
            <b>{ORDEM[f.ordem].rotulo}</b> pedido por {f.ordem_por ?? 'alguém'} {desde(f.ordem_em)}. Quem executa é o notebook do analista, então isto leva alguns segundos. Com ele desligado, o pedido fica guardado e acontece assim que o agente subir.
          </div>
        )}
        {f.ultima_ordem_resultado && (
          <div className={`an-aviso ${f.ultima_ordem_resultado.startsWith('Não deu') ? 'erro' : 'bom'}`}>
            <span>{f.ultima_ordem_resultado.startsWith('Não deu') ? '⛔' : '✓'}</span>
            <span>{f.ultima_ordem_resultado}<br /><small style={{ opacity: .8 }}>{dataCurta(f.ultima_ordem_em)}</small></span>
          </div>
        )}
        <div className="an-dica">Situação no motor: <b>{SITUACAO[f.situacao]?.rotulo ?? f.situacao}</b>{f.motivo ? ` · ${f.motivo}` : ''}{f.sincronizado_em ? ` · sincronizado ${desde(f.sincronizado_em)}` : ''}</div>
      </div>
    </div>
  )
}
