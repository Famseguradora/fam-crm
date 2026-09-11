'use client'

// ============================================================================
//  O RELATÓRIO GERENCIAL DO MÊS  ·  a tela
//
//  Pedido do Marco em 11/09/2026: a Gestão da Análise de Crédito vira o
//  relatório de performance da FAM inteira, por mês, com a entrada de e-mails,
//  as análises e o funil, por modalidade e corretora, "com um design lindo,
//  estilo o da IA Gestão que está em todo o CRM".
//
//  A ORDEM DA TELA É A ORDEM DO TRABALHO: chegou e-mail, virou pedido, virou
//  análise, virou operação, emitiu. Quem lê de cima para baixo lê a esteira.
//
//  O DESENHO É O DO PAINEL (docs/DESIGN-PAINEL.md): o cabeçalho marinho com o
//  filete dourado da janela da IA Gestor, um número grande por cartão, o
//  detalhe só quando alguém pede, e todo número dizendo de onde veio.
//
//  Nada é contado aqui: a conta é de lib/gestao/relatorio-mensal.ts, servida
//  por /api/gestao/relatorio. Esta tela só formata e desenha.
// ============================================================================

import { useEffect, useState } from 'react'
import BlocoIA from '@/components/ia/BlocoIA'
import PonteDoDia from '@/components/comercial/PonteDoDia'
import { Aviso, Barras, CartaoNumero, GradeCartoes, Moldura, SecaoPainel } from '@/components/painel/Painel'
import { botaoVazado, cabecalhoEscuro, cor, corDaArea, raio, texto } from '@/lib/ui/painel'
import { COR_DECISAO, reaisMi } from '@/lib/analise/retrato'
import { horasTexto } from '@/lib/email/metricas'
import { rotuloMesCurto, somarMeses, type PontoMes, type RelatorioMensal as Relatorio } from '@/lib/gestao/relatorio-mensal'

interface Resposta { relatorio: Relatorio; primeiro_mes: string; mes_atual: string }

type Cartao = 'emails' | 'elegiveis' | 'atendidos' | 'analises' | 'entraram' | 'premio'

/* ── formatos ──────────────────────────────────────────────────────────────── */
const inteiro = (n: number) => n.toLocaleString('pt-BR')
const pct = (x: number | null) => (x === null ? 'sem dado' : `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`)
const taxa = (x: number | null) => (x === null ? 'sem dado' : `${x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`)
const reais = (v: number) => (v === 0 ? 'R$ 0' : reaisMi(v))
const plural = (n: number, um: string, varios: string) => `${inteiro(n)} ${n === 1 ? um : varios}`
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "+12 sobre ago/26", "igual a ago/26". Sem cor: variação não é decisão. */
function variacao(atual: number, anterior: PontoMes | undefined, campo: keyof PontoMes, dinheiro = false): string {
  if (!anterior) return ''
  const antes = Number(anterior[campo]) || 0
  const d = atual - antes
  if (d === 0) return `igual a ${anterior.rotulo}`
  const valor = dinheiro ? reais(Math.abs(d)) : inteiro(Math.abs(d))
  return `${d > 0 ? '+' : '−'}${valor} sobre ${anterior.rotulo}`
}

export default function RelatorioMensal() {
  const [mes, setMes] = useState<string | null>(null)
  const [dados, setDados] = useState<Resposta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [tentativa, setTentativa] = useState(0)
  const [aberto, setAberto] = useState<Cartao | null>(null)
  const [todasModalidades, setTodasModalidades] = useState(false)
  const [todasCorretoras, setTodasCorretoras] = useState(false)

  useEffect(() => {
    let vivo = true
    fetch(`/api/gestao/relatorio${mes ? `?mes=${mes}` : ''}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!vivo) return
        if (!r.ok) { setErro(j.erro ?? 'Não consegui montar o relatório.'); setCarregando(false); return }
        setDados(j as Resposta)
        setErro('')
        setCarregando(false)
      })
      .catch(() => { if (vivo) { setErro('A conexão caiu. Tente de novo.'); setCarregando(false) } })
    return () => { vivo = false }
  }, [mes, tentativa])

  const trocarMes = (novo: string) => {
    setCarregando(true)
    setAberto(null)
    setMes(novo)
  }

  if (!dados) {
    return erro
      ? <Aviso tom="erro">{erro} <button type="button" style={{ ...botaoVazado, marginLeft: 8 }} onClick={() => { setCarregando(true); setTentativa((t) => t + 1) }}>Tentar de novo</button></Aviso>
      : <Aviso>Montando o relatório do mês…</Aviso>
  }

  const r = dados.relatorio
  const s = r.serie
  const ant = s[s.length - 2]
  const mesAtual = r.mes
  const opcoes: string[] = []
  for (let m = dados.mes_atual; m >= dados.primeiro_mes && opcoes.length < 60; m = somarMeses(m, -1)) opcoes.push(m)

  const at = r.email.atendimento
  const an = r.analise.resumo
  const fu = r.funil
  const hoje = new Date(r.gerado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

  const serieBloco = (campo: keyof PontoMes, rotulo: string, origem: string) => (
    <BlocoIA bloco={{
      tipo: 'grafico', formato: 'barra', titulo: `${rotulo} · 12 meses até ${rotuloMesCurto(mesAtual)}`,
      dados: { eixo: 'rotulo', series: [{ campo, rotulo }], dados: s }, origem,
    }} />
  )
  const detalhe: Record<Cartao, React.ReactNode> = {
    emails: serieBloco('emails', 'E-mails recebidos', 'painel_pedidos.recebido_em, no mês de São Paulo'),
    elegiveis: serieBloco('elegiveis', 'Pedidos elegíveis', 'a ponte do e-mail de cada mês (lib/email/ponte.ts)'),
    atendidos: serieBloco('atendidos', 'Atendidos', 'trazidos pela data do caso e analisados por fora pela chegada (lib/email/metricas.ts)'),
    analises: serieBloco('analises', 'Análises feitas', 'analises.data_analise, todas as versões'),
    entraram: serieBloco('entraram', 'Entraram no funil', 'operacoes.data_entrada'),
    premio: serieBloco('premio', 'Prêmio emitido', 'operacoes.premio_previsto das emitidas, pela data_emissao'),
  }
  const alternar = (c: Cartao) => setAberto(aberto === c ? null : c)

  const totalEntraram = Math.max(1, fu.entraram.n)
  const mundos: { id: keyof typeof fu.entraram.porMundo; nome: string; cor: string }[] = [
    { id: 'emitida', nome: 'emitidas', cor: cor.areaOperacao },
    { id: 'funil', nome: 'no funil', cor: cor.acao },
    { id: 'encerrada', nome: 'encerradas', cor: cor.borda },
  ]

  const modalidades = todasModalidades ? r.modalidades : r.modalidades.slice(0, 10)
  const corretoras = todasCorretoras ? r.corretoras : r.corretoras.slice(0, 12)
  const premioTotal = fu.emitidas.premio
  const top5Premio = r.corretoras.slice(0, 5).reduce((soma, c) => soma + c.premio, 0)
  const comPremio = r.corretoras.filter((c) => c.premio > 0).length

  return (
    <div className="rg" style={{ opacity: carregando ? 0.55 : 1, transition: 'opacity .15s' }} aria-busy={carregando}>
      <style jsx global>{`
        .rg-duas { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr)); align-items: start; }
        .rg-tres { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); align-items: start; }
        .rg-seletor { font-size: 13px; }
        .rg-tabela { width: 100%; border-collapse: collapse; font-size: 12px; }
        .rg-tabela th { text-align: left; padding: 6px 8px; color: ${cor.tinta2}; font-weight: 700; border-bottom: 1px solid ${cor.borda}; white-space: nowrap; }
        .rg-tabela td { padding: 6px 8px; color: ${cor.texto}; border-bottom: 1px solid ${cor.bordaSuave}; white-space: nowrap; }
        .rg-tabela tbody tr:nth-child(even) td { background: ${cor.papelZebra}; }
        .rg-tabela .n { text-align: right; font-variant-numeric: tabular-nums; }
        .rg-tabela .zero { color: ${cor.textoFraco}; }
        @media (max-width: 900px) {
          .rg-seletor { font-size: 16px; }
          .rg-alvo { min-height: 44px; min-width: 44px; }
        }
      `}</style>

      {/* ── o cabeçalho: o mês, e para onde ir ─────────────────────────────── */}
      <div style={{
        ...cabecalhoEscuro, borderRadius: raio.janela, padding: '14px 18px', marginBottom: 14,
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
      }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 11.5, color: cor.textoSobreEscuro }}>Relatório gerencial · a FAM inteira</div>
          <div style={{ fontSize: 23, fontWeight: 800, color: cor.branco, lineHeight: 1.2, marginTop: 2 }}>{maiuscula(r.rotulo)}</div>
          <div style={{ fontSize: 11.5, color: cor.textoClaroSobreEscuro, marginTop: 2 }}>
            {r.emCurso ? `mês em curso: os números vão até hoje, ${hoje}` : 'mês fechado'}
          </div>
        </div>
        <nav aria-label="Escolher o mês" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button" className="rg-alvo" aria-label="Mês anterior"
            disabled={mesAtual <= dados.primeiro_mes || carregando}
            onClick={() => trocarMes(somarMeses(mesAtual, -1))}
            style={{ ...botaoEscuro, opacity: mesAtual <= dados.primeiro_mes ? 0.4 : 1 }}
          >‹</button>
          <select
            className="rg-seletor rg-alvo" aria-label="Mês do relatório" value={mesAtual} disabled={carregando}
            onChange={(ev) => trocarMes(ev.target.value)}
            style={{ ...botaoEscuro, padding: '7px 10px', fontWeight: 600 }}
          >
            {opcoes.map((m) => <option key={m} value={m}>{rotuloMesCurto(m)}</option>)}
          </select>
          <button
            type="button" className="rg-alvo" aria-label="Próximo mês"
            disabled={mesAtual >= dados.mes_atual || carregando}
            onClick={() => trocarMes(somarMeses(mesAtual, 1))}
            style={{ ...botaoEscuro, opacity: mesAtual >= dados.mes_atual ? 0.4 : 1 }}
          >›</button>
        </nav>
      </div>

      {erro && <div style={{ marginBottom: 12 }}><Aviso tom="erro">{erro}</Aviso></div>}

      {/* ── 1. o mês em números ────────────────────────────────────────────── */}
      <SecaoPainel nome="O mês em números" cor={cor.acao}>
        <GradeCartoes minimo={175} detalhe={aberto && detalhe[aberto]}>
          <CartaoNumero rotulo="E-mails recebidos" numero={inteiro(r.email.ponte.recebidos)}
            sub={variacao(r.email.ponte.recebidos, ant, 'emails')}
            aberto={aberto === 'emails'} aoAlternar={() => alternar('emails')} />
          <CartaoNumero rotulo="Pedidos elegíveis" numero={inteiro(r.email.ponte.elegiveis.total)}
            sub={`${plural(r.email.pedidos, 'pedido novo', 'pedidos novos')} · ${variacao(r.email.ponte.elegiveis.total, ant, 'elegiveis')}`}
            aberto={aberto === 'elegiveis'} aoAlternar={() => alternar('elegiveis')} />
          <CartaoNumero rotulo="Atendidos" numero={inteiro(at.resolvidos)}
            sub={at.com_tempo ? `${pct(at.no_prazo / at.com_tempo)} no prazo de ${at.meta_horas} h úteis` : variacao(at.resolvidos, ant, 'atendidos')}
            aberto={aberto === 'atendidos'} aoAlternar={() => alternar('atendidos')} />
          <CartaoNumero rotulo="Análises feitas" numero={inteiro(r.analise.feitas)}
            sub={variacao(r.analise.feitas, ant, 'analises')}
            aberto={aberto === 'analises'} aoAlternar={() => alternar('analises')} />
          <CartaoNumero rotulo="Entraram no funil" numero={inteiro(fu.entraram.n)}
            sub={variacao(fu.entraram.n, ant, 'entraram')}
            aberto={aberto === 'entraram'} aoAlternar={() => alternar('entraram')} />
          <CartaoNumero rotulo="Prêmio emitido" numero={reais(premioTotal)}
            sub={`${plural(fu.emitidas.n, 'emitida', 'emitidas')} · ${variacao(premioTotal, ant, 'premio', true)}`}
            aberto={aberto === 'premio'} aoAlternar={() => alternar('premio')} />
        </GradeCartoes>
      </SecaoPainel>

      {/* ── 2. a entrada de e-mails ────────────────────────────────────────── */}
      <SecaoPainel nome="Entrada de e-mails" cor={cor.ouroTexto}>
        <div className="rg-duas">
          <Moldura
            titulo={`A ponte de ${r.rotulo}`}
            origem="e-mails da caixa pela data de chegada; cada pedido na situação de hoje; julgados pela régua que valia quando chegaram"
          >
            {!r.email.ponte.fecha && <div style={{ marginBottom: 8 }}><Aviso tom="erro">A soma dos degraus não deu os recebidos. É defeito: avise o suporte.</Aviso></div>}
            <PonteDoDia ponte={r.email.ponte} excluidas={r.email.excluidas} />
          </Moldura>

          <Moldura titulo="O atendimento" origem="do e-mail até virar caso, em horas úteis (a mesma conta da porta de entrada do Comercial)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 14 }}>
              <Dado rotulo="Trazidos" valor={inteiro(at.trazidos)} sub="viraram caso no mês" />
              <Dado rotulo="Já analisados" valor={inteiro(at.ja_analisados)} sub="por fora do sistema" />
              <Dado rotulo="Mediana" valor={at.mediana_horas === null ? 'sem dado' : horasTexto(at.mediana_horas)} sub={`média ${at.media_horas === null ? 'sem dado' : horasTexto(at.media_horas)}`} />
              <Dado rotulo="No prazo" valor={at.com_tempo ? pct(at.no_prazo / at.com_tempo) : 'sem dado'} sub={at.com_tempo ? `${at.no_prazo} de ${at.com_tempo}` : 'nenhum trazido com hora'} />
            </div>
            <Subtitulo>Pedidos por modalidade</Subtitulo>
            <Barras cor={cor.ouro} vazio="nenhum pedido neste mês"
              itens={r.email.porModalidade.slice(0, 8).map((c) => ({ nome: c.nome, valor: c.n }))} />
            <div style={{ height: 12 }} />
            <Subtitulo>Pedidos por corretora</Subtitulo>
            <Barras cor={cor.ouro} vazio="nenhuma corretora identificada nos pedidos deste mês"
              itens={r.email.porCorretora.slice(0, 8).map((c) => ({ nome: c.nome, valor: c.n }))} />
            {r.email.semCorretora > 0 && (
              <div style={{ ...texto.nota, marginTop: 6 }}>
                {plural(r.email.semCorretora, 'pedido ainda sem corretora identificada', 'pedidos ainda sem corretora identificada')} (a corretora é lida do caso ou do e-mail).
              </div>
            )}
          </Moldura>
        </div>
      </SecaoPainel>

      {/* ── 3. a análise de crédito ────────────────────────────────────────── */}
      <SecaoPainel nome="Análise de crédito" cor={corDaArea('analise')}>
        <GradeCartoes minimo={190}>
          <CartaoNumero rotulo="Análises feitas" numero={inteiro(r.analise.feitas)}
            sub={r.analise.feitas ? `${plural(an.empresas, 'empresa', 'empresas')} · ${plural(r.analise.refeitas, 'refeita', 'refeitas')}` : 'nenhuma análise com data neste mês'} />
          <CartaoNumero rotulo="Aprovação" numero={an.total ? `${an.aprovacao.totalPct.toLocaleString('pt-BR')}%` : 'sem dado'}
            sub={an.total ? `${an.aprovacao.limpoPct.toLocaleString('pt-BR')}% limpa · ${plural(an.aprovacao.comRessalva, 'com ressalva', 'com ressalva')}` : 'sem análise para medir'} />
          <CartaoNumero rotulo="Limite efetivo mediano" numero={reaisMi(an.limite.mediana)}
            sub={an.total ? `${an.limite.efetivos} de ${an.total} com limite em número` : 'sem análise para medir'} />
          <CartaoNumero rotulo="Esteira do CRM" numero={inteiro(r.analise.esteira.concluidas)}
            sub={r.analise.esteira.mediana_horas === null ? 'nenhuma concluída pela esteira neste mês' : `concluídas · mediana de ${horasTexto(r.analise.esteira.mediana_horas)} corridas`} />
        </GradeCartoes>
        <div className="rg-tres">
          <Moldura titulo="Decisão" origem="analises.recomendacao, lida pelo vocabulário do Acervo">
            <Barras itens={an.decisao.map((d) => ({ nome: d.rot, valor: d.n, cor: COR_DECISAO[d.rot] }))} />
          </Moldura>
          <Moldura titulo="Nível de risco" origem="analises.nivel_risco, com as grafias unificadas">
            <Barras cor={cor.acaoClara} itens={an.nivel.map((d) => ({ nome: d.rot, valor: d.n }))} />
          </Moldura>
          <Moldura titulo="Setores" origem="analises.setor, os oito com mais análises">
            <Barras cor={cor.tinta2} itens={an.setor.map((d) => ({ nome: d.rot, valor: d.n }))} />
          </Moldura>
        </div>
      </SecaoPainel>

      {/* ── 4. o funil de operações ────────────────────────────────────────── */}
      <SecaoPainel nome="Funil de operações" cor={corDaArea('operacoes')}>
        <GradeCartoes minimo={175}>
          <CartaoNumero rotulo="Entraram no funil" numero={inteiro(fu.entraram.n)} sub="pela data de entrada da operação" />
          <CartaoNumero rotulo="Emitidas" numero={inteiro(fu.emitidas.n)}
            sub={fu.emitidas.n ? `LMG ${reais(fu.emitidas.lmg)} · ticket ${reais(fu.emitidas.ticket ?? 0)}` : 'nenhuma emissão neste mês'} />
          <CartaoNumero rotulo="Taxa média ponderada" numero={taxa(fu.emitidas.taxa)} sub="das emitidas no mês, base anual" />
          <CartaoNumero rotulo="Conversão das decididas" numero={pct(fu.conversao)}
            sub={`${fu.emitidas.n} emitidas · ${fu.encerradas.perdidas} perdidas · ${fu.encerradas.recusadas} recusadas`} />
          <CartaoNumero rotulo="Prazo até emitir" numero={fu.emitidas.dias_mediana === null ? 'sem dado' : plural(Math.round(fu.emitidas.dias_mediana), 'dia', 'dias')}
            sub="mediana, da entrada à emissão" />
        </GradeCartoes>
        <div className="rg-duas">
          <Moldura titulo="O que entrou no mês, e onde está hoje"
            origem="operacoes.data_entrada no mês, pela etapa atual; os três mundos lado a lado, sem somar prêmio entre eles">
            {fu.entraram.n ? (
              <>
                <div role="img" aria-label={mundos.map((m) => `${fu.entraram.porMundo[m.id]} ${m.nome}`).join(', ')}
                  style={{ display: 'flex', height: 16, borderRadius: 5, overflow: 'hidden', background: cor.bordaSuave }}>
                  {mundos.map((m) => fu.entraram.porMundo[m.id] > 0 && (
                    <span key={m.id} style={{ width: `${(fu.entraram.porMundo[m.id] / totalEntraram) * 100}%`, background: m.cor }} />
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 10 }}>
                  {mundos.map((m) => (
                    <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: cor.texto }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: m.cor }} />
                      <b style={{ color: cor.tinta }}>{fu.entraram.porMundo[m.id]}</b> {m.nome}
                    </span>
                  ))}
                </div>
              </>
            ) : <div style={texto.nota}>nenhuma operação entrou neste mês</div>}
          </Moldura>
          <Moldura titulo="Movimento do funil no mês"
            origem="fam_historico: cada vez que uma operação entrou numa etapa, na ordem das etapas">
            {fu.movimentos
              ? <Barras cor={cor.areaOperacao} vazio="nenhuma troca de etapa neste mês"
                  itens={fu.movimentos.map((m) => ({ nome: m.nome, valor: m.n }))} />
              : <div style={texto.nota}>
                  O histórico de etapas começou em {fu.historico_desde ? new Date(fu.historico_desde).toLocaleDateString('pt-BR') : 'data sem registro'}: antes disso, a troca de etapa não era gravada.
                </div>}
          </Moldura>
        </div>
      </SecaoPainel>

      {/* ── 5. por modalidade ──────────────────────────────────────────────── */}
      <SecaoPainel nome="Por modalidade" cor={cor.tinta2}
        acao={r.modalidades.length > 10 && <BotaoTodas aberto={todasModalidades} total={r.modalidades.length} aoTrocar={() => setTodasModalidades(!todasModalidades)} />}>
        <Moldura titulo={`Modalidades em ${r.rotulo}`}
          origem="pedidos: modalidades lidas dos e-mails (um pedido pode citar mais de uma); entraram e emitidas: operacoes.modalidade; taxa: a média ponderada das emitidas">
          {modalidades.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="rg-tabela">
                <thead><tr><th>Modalidade</th><th className="n">Pedidos</th><th className="n">Entraram</th><th className="n">Emitidas</th><th className="n">Prêmio emitido</th><th className="n">Taxa pond.</th></tr></thead>
                <tbody>
                  {modalidades.map((m) => (
                    <tr key={m.nome}>
                      <td>{m.nome}</td>
                      <Num n={m.pedidos} /><Num n={m.entraram} /><Num n={m.emitidas} />
                      <td className={`n${m.premio ? '' : ' zero'}`}>{m.premio ? reais(m.premio) : '0'}</td>
                      <td className={`n${m.taxa === null ? ' zero' : ''}`}>{m.taxa === null ? 'sem emissão' : taxa(m.taxa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div style={texto.nota}>nenhuma modalidade com movimento neste mês</div>}
        </Moldura>
      </SecaoPainel>

      {/* ── 6. por corretora ───────────────────────────────────────────────── */}
      <SecaoPainel nome="Por corretora" cor={cor.tinta2}
        acao={r.corretoras.length > 12 && <BotaoTodas aberto={todasCorretoras} total={r.corretoras.length} aoTrocar={() => setTodasCorretoras(!todasCorretoras)} />}>
        <Moldura titulo={
          premioTotal <= 0 ? `Corretoras em ${r.rotulo}`
          : comPremio <= 5 ? `Corretoras em ${r.rotulo} · ${plural(comPremio, 'corretora fez', 'corretoras fizeram')} todo o prêmio emitido`
          : `Corretoras em ${r.rotulo} · as 5 maiores fazem ${pct(top5Premio / premioTotal)} do prêmio emitido`}
          origem="nome do cadastro do CRM (a análise e o e-mail casados pela regra única de lib/analise/corretoras.mjs); prêmio: operações emitidas no mês">
          {corretoras.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="rg-tabela">
                <thead><tr><th>Corretora</th><th className="n">Pedidos</th><th className="n">Análises</th><th className="n">Entraram</th><th className="n">Emitidas</th><th className="n">Prêmio emitido</th></tr></thead>
                <tbody>
                  {corretoras.map((c) => (
                    <tr key={c.nome}>
                      <td title={c.nome} style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</td>
                      <Num n={c.pedidos} /><Num n={c.analises} /><Num n={c.entraram} /><Num n={c.emitidas} />
                      <td className={`n${c.premio ? '' : ' zero'}`}>{c.premio ? reais(c.premio) : '0'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div style={texto.nota}>nenhuma corretora com movimento neste mês</div>}
        </Moldura>
      </SecaoPainel>

      {/* ── 7. a evolução ──────────────────────────────────────────────────── */}
      <SecaoPainel nome="Evolução em 12 meses" cor={cor.acao}>
        <div className="rg-duas">
          <BlocoIA bloco={{
            tipo: 'grafico', formato: 'linha', titulo: 'Da caixa ao funil',
            dados: {
              eixo: 'rotulo',
              series: [
                { campo: 'emails', rotulo: 'E-mails' },
                { campo: 'elegiveis', rotulo: 'Pedidos elegíveis' },
                { campo: 'analises', rotulo: 'Análises' },
                { campo: 'entraram', rotulo: 'Entraram no funil' },
              ],
              dados: s,
            },
            origem: 'a mesma conta dos cartões do topo, mês a mês',
          }} />
          <BlocoIA bloco={{
            tipo: 'grafico', formato: 'barra', titulo: 'Prêmio emitido',
            dados: { eixo: 'rotulo', series: [{ campo: 'premio', rotulo: 'Prêmio emitido' }], dados: s },
            origem: 'operacoes.premio_previsto das emitidas, pela data_emissao',
          }} />
        </div>
      </SecaoPainel>
    </div>
  )
}

/* ── peças da tela ─────────────────────────────────────────────────────────── */

const botaoEscuro: React.CSSProperties = {
  background: cor.tinta2, color: cor.branco, border: `1px solid ${cor.acao}`,
  borderRadius: raio.controle, padding: '6px 12px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
}

function Dado({ rotulo, valor, sub }: { rotulo: string; valor: string; sub: string }) {
  return (
    <div>
      <div style={texto.rotulo}>{rotulo}</div>
      <div style={{ ...texto.numero, fontSize: 19 }}>{valor}</div>
      <div style={{ ...texto.nota, marginTop: 1 }}>{sub}</div>
    </div>
  )
}

function Subtitulo({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: cor.tinta2, marginBottom: 7 }}>{children}</div>
}

function Num({ n }: { n: number }) {
  return <td className={`n${n ? '' : ' zero'}`}>{n.toLocaleString('pt-BR')}</td>
}

function BotaoTodas({ aberto, total, aoTrocar }: { aberto: boolean; total: number; aoTrocar: () => void }) {
  return (
    <button type="button" className="rg-alvo" onClick={aoTrocar}
      style={{ ...botaoVazado, padding: '4px 10px', fontSize: 11.5 }}>
      {aberto ? 'mostrar as principais' : `mostrar todas (${total})`}
    </button>
  )
}
