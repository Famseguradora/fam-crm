'use client'

// ============================================================================
//  O CARD DO TOMADOR  ·  a mesa de trabalho, dentro do CRM
//
//  Porte do card.js do cockpit, que virou a mesa de trabalho em 27/08/2026 com
//  a palavra dele: "Dentro dos cards dos tomadores tem que ter mais
//  informações, a lista dos arquivos, eu poder selecionar quais arquivos usar
//  para análise de crédito, tem que ter a IA dentro de cada Card, o mesmo
//  agente que fica dentro do relatório. A Análise de crédito deve ser feita
//  dentro de cada card, assim como o fluxo operacional, poder direcionar para
//  outras áreas e colegas."
//
//  A IDEIA QUE ORGANIZA TUDO, vinda do Pipefy: o quadro não é a ferramenta, é
//  só onde os cards moram. A ferramenta é o CARD ABERTO, e nada obriga a sair
//  dele. As sete abas, na ordem do dia dele: entender (Visão geral), conferir
//  o que chegou (Arquivos), rodar (Análise), trabalhar o documento
//  (Relatório), perguntar (IA), passar adiante (Encaminhar), o histórico
//  (Atividades).
//
//  DE ONDE VEM CADA COISA (e nada vem de 127.0.0.1):
//    a ficha da esteira, os arquivos, a triagem, a linha .... `analise_fila`
//    o resultado (Score, Rating, limite, 3 C's) ............. `analises`, pela ficha
//    as notas, o encaminhamento, a IA, as alçadas ........... as tabelas da Mesa
//  Os botões que dependem da máquina dele (Abrir no template, Abrir a pasta)
//  só aparecem quando o Sistema de Análise responde nesta máquina.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { maskCNPJ } from '@/lib/utils'
import { fichaPorId, fichaDaAnalise, type FichaAnalise } from '@/lib/analise/ficha'
import { faseDe, nomeDaFase, SITUACAO, type Ordem } from '@/lib/analise/esteira'
import { COLUNAS_FILA, nomeDaFicha, iniciaisDe, corDoNome, type FilaRica } from '@/lib/analise/mesa'
import { IcoVoltar } from '@/components/tomador/icones'
import BarraAnalises, { useContagensBarra } from './BarraAnalises'
import EstiloAnalises from './Estilo'
import RelatorioCompleto from './RelatorioCompleto'
import VisaoGeral from './card/VisaoGeral'
import Arquivos from './card/Arquivos'
import AbaAnalise from './card/AbaAnalise'
import AbaIA from './card/AbaIA'
import Encaminhar from './card/Encaminhar'
import Atividades from './card/Atividades'
import { SISTEMA_LOCAL, type Quem } from './card/comum'

type Aba = 'geral' | 'arquivos' | 'analise' | 'relatorio' | 'ia' | 'encaminhar' | 'atividades'

/** O Sistema de Análise responde nesta máquina? Uma pergunta só, na abertura.
 *  Serve para mostrar ou esconder os botões que dependem dele; nunca para
 *  encher tela com dado. */
function useSistemaLocal(): boolean {
  const [local, setLocal] = useState(false)
  useEffect(() => {
    let vivo = true
    fetch(`${SISTEMA_LOCAL}/api/status`, { signal: AbortSignal.timeout(2500) })
      .then(r => r.json()).then(() => { if (vivo) setLocal(true) }).catch(() => { })
    return () => { vivo = false }
  }, [])
  return local
}

export default function CardAnalise({ id }: { id: string }) {
  const router = useRouter()
  const { somenteLeitura, editaAnalise } = usePermissoes()
  const contagens = useContagensBarra()
  const local = useSistemaLocal()

  const [f, setF] = useState<FilaRica | null>(null)
  const [ficha, setFicha] = useState<FichaAnalise | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aba, setAba] = useState<Aba>('geral')
  const [quem, setQuem] = useState<Quem>({ nome: null, authId: null, podeEscrever: !somenteLeitura, analista: editaAnalise })
  const [abertos, setAbertos] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('usuarios').select('nome, analista_credito').eq('auth_id', user.id).maybeSingle().then(({ data }) => {
        setQuem({ nome: data?.nome ?? user.email ?? null, authId: user.id, podeEscrever: !somenteLeitura, analista: !!data?.analista_credito || editaAnalise })
      })
    })
  }, [somenteLeitura, editaAnalise])

  const carregar = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase.from('analise_fila').select(COLUNAS_FILA).eq('id', id).maybeSingle()
    if (error) { setErro(error.message); setCarregando(false); return }
    const linha = (data as unknown as FilaRica | null)
    setF(linha)
    if (linha) {
      // O resultado: pela ligação direta quando existe, senão pelo tomador/CNPJ.
      const fi = linha.analise_id ? await fichaPorId(linha.analise_id) : await fichaDaAnalise(linha.tomador_id, linha.cnpj)
      setFicha(fi)
      const { count } = await supabase.from('analise_encaminhamentos').select('id', { count: 'exact', head: true }).eq('fila_id', linha.id).eq('estado', 'aberto')
      setAbertos(count ?? 0)
    }
    setCarregando(false)
  }, [id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
    const supabase = createClient()
    const canal = supabase.channel(`card-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'analise_fila', filter: `id=eq.${id}` }, () => carregar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analise_encaminhamentos' }, () => carregar())
      .subscribe()
    const t = setInterval(carregar, 15000)
    return () => { clearInterval(t); supabase.removeChannel(canal) }
  }, [id, carregar])

  /** Toda ordem do card passa por aqui: grava a intenção e a tela avisa. */
  const mandar = async (ordem: Ordem, dados?: Record<string, unknown>) => {
    setErro('')
    try {
      const r = await fetch('/api/esteira/ordem', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ordem, dados: dados ?? {} }),
      })
      const j = await r.json()
      if (!r.ok) setErro(j.erro ?? 'Não consegui.')
    } catch {
      setErro('A conexão caiu. Tente de novo.')
    }
    await carregar()
  }

  if (carregando) {
    return <div style={{ padding: 20 }}><EstiloAnalises /><div className="card-panel"><p style={{ color: 'var(--soft)', fontSize: 14 }}>Abrindo o card…</p></div></div>
  }
  if (!f) {
    return (
      <div style={{ padding: 20 }}>
        <EstiloAnalises />
        <button type="button" className="mt-voltar" onClick={() => router.push('/analises')}><IcoVoltar /> Mesa</button>
        <div className="card-panel" style={{ marginTop: 12 }}><p style={{ margin: 0 }}><b>Este card não está na esteira.</b> {erro || 'Ou o endereço está errado, ou a análise saiu da mesa.'}</p></div>
      </div>
    )
  }

  const nome = nomeDaFicha(f)
  const fase = f.fase || faseDe(f.situacao, f.cadastro?.status)
  const total = f.arquivos?.total ?? null
  const situacao = SITUACAO[f.situacao]
  const ABAS: { id: Aba; txt: string; n?: number | null; alerta?: boolean; some?: boolean }[] = [
    { id: 'geral', txt: 'Visão geral' },
    { id: 'arquivos', txt: 'Arquivos', n: total, alerta: !!(f.arquivos?.avisos ?? []).some(v => v.nivel === 'erro') },
    { id: 'analise', txt: 'Análise', alerta: f.situacao === 'aguardando_resposta' || f.situacao === 'erro' },
    { id: 'relatorio', txt: 'Relatório', some: !ficha },
    { id: 'ia', txt: 'IA' },
    { id: 'encaminhar', txt: 'Encaminhar', n: abertos || null, alerta: abertos > 0 },
    { id: 'atividades', txt: 'Atividades' },
  ]

  const props = { f, ficha, quem, local, recarregar: carregar }

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 20px) clamp(10px, 2.5vw, 28px) 30px' }}>
      <EstiloAnalises />
      <BarraAnalises atual="mesa" contagens={contagens} />

      <div className="mt-card" style={{ marginTop: 12 }}>
        <div className="an-card-topo">
          <button type="button" className="an-bt" onClick={() => router.push('/analises')} title="Voltar para a Mesa (a página anterior)">← Voltar</button>
          <span className="an-selo gr" style={{ ['--cor' as string]: corDoNome(nome) }}>{iniciaisDe(nome)}</span>
          <div style={{ minWidth: 0 }}>
            <h1 className="an-card-nome">{nome}</h1>
            <div className="an-card-cnpj">
              {f.cnpj && (f.cnpj_confiavel || f.analise_id) ? maskCNPJ(f.cnpj) : 'CNPJ a confirmar'}
              {f.razao_social && f.razao_social !== nome ? ` · ${f.razao_social}` : ''}
              {f.pasta !== nome ? <span title="A pasta no disco"> · pasta “{f.pasta}”</span> : null}
            </div>
          </div>
          <div className="an-card-fita">
            {ficha
              ? <span className="an-tag banco" title="Esta empresa tem análise publicada no banco do CRM">No banco</span>
              : <span className={`an-tag ${f.situacao === 'em_andamento' ? 'rodando' : f.situacao === 'erro' ? 'ruim' : fase === 'conferencia' ? 'voce' : fase === 'pronta' ? 'pronta' : ''}`}>{situacao?.rotulo ?? nomeDaFase(fase)}</span>}
            <span className="an-tag">{nomeDaFase(fase)}</span>
            {f.substatus && <span className="an-tag sub" title={`Substatus escrito por ${f.substatus_por ?? 'Marco'}`}>📌 {f.substatus}</span>}
            {(f.corretora || ficha?.corretora) && <span style={{ fontSize: 13, color: '#6080a0' }}>{f.corretora || ficha?.corretora}</span>}
            {f.tomador_id && (
              <button type="button" className="an-bt mini" onClick={() => router.push(`/tomadores/${f.tomador_id}`)} title="O cadastro deste tomador no CRM, com as operações">Cadastro no CRM</button>
            )}
          </div>
        </div>

        <nav className="an-card-abas" role="tablist" aria-label="O card do tomador">
          {ABAS.filter(a => !a.some).map(a => (
            <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} className={`an-card-aba${aba === a.id ? ' on' : ''}`} onClick={() => setAba(a.id)}>
              {a.txt}{a.n ? <i>{a.n}</i> : null}{a.alerta ? <b className="ponto" /> : null}
            </button>
          ))}
        </nav>

        <div className="an-card-corpo">
          {erro && <div className="alert-error" style={{ marginBottom: 12 }}>{erro}</div>}
          {aba === 'geral' && <VisaoGeral {...props} aoIrParaAba={a => setAba(a as Aba)} />}
          {aba === 'arquivos' && <Arquivos {...props} aoMandar={o => mandar(o)} />}
          {aba === 'analise' && <AbaAnalise {...props} aoMandar={mandar} />}
          {aba === 'relatorio' && ficha && <RelatorioCompleto analiseId={ficha.id} semCabecalho aoCarregar={fi => { if (fi) setFicha(fi) }} />}
          {aba === 'ia' && <AbaIA {...props} />}
          {aba === 'encaminhar' && <Encaminhar {...props} />}
          {aba === 'atividades' && <Atividades {...props} />}
        </div>
      </div>
    </div>
  )
}
