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

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { maskCNPJ } from '@/lib/utils'
import { fichaPorId, fichaDaAnalise, semMarcador, type FichaAnalise } from '@/lib/analise/ficha'
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
import { PortaDoRelatorio } from './PortaDoRelatorio'

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

/* A ABA EXISTE, MAS A PASTA NÃO ESTÁ MAIS NA ESTEIRA.
   Quatro abas do card trabalham sobre a PASTA no disco: Arquivos lê os
   documentos, Análise manda o motor rodar, Encaminhar e Atividades vivem do
   histórico daquela pasta. Uma análise publicada já terminou e a pasta foi
   arquivada — então elas não têm sobre o que agir.

   A aba continua aí (ordem dele: todas as opções na mesma tela), e diz em uma
   frase o que houve e para onde ir. Silêncio aqui leria como defeito. */
function SemPasta({ aba, chave, docs, aoIrParaAba }: {
  aba: 'arquivos' | 'analise' | 'encaminhar' | 'atividades'
  chave: string | null
  docs: number
  aoIrParaAba: (a: string) => void
}) {
  const TEXTO = {
    arquivos: {
      titulo: 'Os arquivos desta análise estão no Relatório',
      corpo: docs
        ? `Esta aba lê a pasta do disco enquanto a análise está na esteira. Esta já terminou e a pasta foi arquivada, mas os ${docs} documentos que a análise LEU continuam registrados, com nome e hash.`
        : 'Esta aba lê a pasta do disco enquanto a análise está na esteira. Esta já terminou e a pasta foi arquivada. O índice dos documentos que ela leu não chegou a ser publicado.',
      leva: 'relatorio', rotulo: 'Ver em Relatório · Documentos',
    },
    analise: {
      titulo: 'Esta análise já foi entregue',
      corpo: 'As ordens desta aba (analisar, refazer, parar, reler a pasta) valem enquanto a pasta está na esteira. Esta análise terminou; para mexer nos números dela, use o relatório.',
      leva: 'relatorio', rotulo: 'Abrir o Relatório',
    },
    encaminhar: {
      titulo: 'Encaminhar vale para o que está andando',
      corpo: 'Passar adiante e cobrar resposta são gestos sobre um caso em curso, e este já foi entregue. Para falar sobre esta empresa, o caminho é o card dela no CRM.',
      leva: 'geral', rotulo: 'Voltar para a visão geral',
    },
    atividades: {
      titulo: 'O histórico é da pasta na esteira',
      corpo: 'Esta linha do tempo registra o que aconteceu com a pasta enquanto ela andava. A história da EMPRESA, essa sim, está no relatório.',
      leva: 'relatorio', rotulo: 'Abrir o Relatório',
    },
  }[aba]

  return (
    <div className="an-bloco" style={{ maxWidth: '78ch' }}>
      <h4>{TEXTO.titulo}</h4>
      <p className="an-explica">{TEXTO.corpo}</p>
      <div className="an-bt-linha">
        <button type="button" className="an-bt azul" onClick={() => aoIrParaAba(TEXTO.leva)}>{TEXTO.rotulo}</button>
        {chave && <PortaDoRelatorio chave={chave} />}
      </div>
    </div>
  )
}

/* UMA ANÁLISE DO ACERVO VIRANDO FICHA DE CARD.
   O card foi desenhado sobre uma PASTA da esteira. Uma análise publicada não
   tem pasta: já terminou. O que ela tem é tudo o que importa para ler — razão,
   CNPJ, tomador, decisão — e é isso que é copiado aqui.

   O que NÃO é inventado: documentos, ordens, histórico e triagem ficam vazios,
   e a bandeira `semEsteira` faz as abas dizerem por quê. Preencher isso com
   zero seria a tela afirmando "esta análise não tem documento", que é falso: a
   pasta é que não está mais na esteira. */
function fichaVirandoFila(fi: FichaAnalise): FilaRica {
  const agora = fi.data_analise ? `${fi.data_analise}T12:00:00.000Z` : new Date().toISOString()
  return {
    semEsteira: true,
    id: fi.id,
    caso_id: null,
    analise_id: fi.id,
    tomador_id: fi.tomador_id,
    cnpj: fi.cnpj,
    cnpj_confiavel: !!fi.cnpj,
    razao_social: fi.razao_social,
    chave_local: fi.chave_local,
    pasta: fi.nome_curto || fi.razao_social,
    situacao: 'concluida',
    motivo: null,
    etapa: null, etapa_texto: null, etapa_em: null,
    documentos: fi.documentos.length,
    documentos_faltando: [],
    hash_documentos: null,
    trava_maquina: null, trava_em: null,
    ordem: null, ordem_por: null, ordem_em: null, ordem_dados: null,
    erro: null,
    criado_em: agora,
    criado_por: null,
    concluido_em: agora,
    atualizado_em: agora,
    chave: fi.chave_local,
    fase: 'pronta',
    nome: fi.nome_curto || fi.razao_social,
    corretora: fi.corretora,
    produto: null,
    docs: null,
    cadastro: null,
    arquivos: null,
    biblioteca: null,
    linha: [],
    parado_desde: null,
    analise_chave: fi.chave_local,
    substatus: null, substatus_por: null, substatus_em: null,
    instrucao: null, modo: null,
    arquivos_fora: [], arquivos_fora_em: null,
    arquivada: false,
    sincronizado_em: null,
    ultima_ordem_resultado: null, ultima_ordem_em: null,
  }
}

/* A ANÁLISE SAIU, MAS NÃO ESTÁ NO BANCO DO CRM.
   Esta tela é o que ele via como uma aba faltando. Ela diz exatamente onde a
   análise está (no disco da máquina, entregue), por que o CRM ainda não a
   mostra (a carga não rodou), e dá o botão que resolve — em vez de mandar
   abrir o outro sistema. */
function RelatorioAPublicar({ f, quem, aoMandar }: {
  f: FilaRica; quem: Quem; aoMandar: (ordem: Ordem) => Promise<void>
}) {
  const [mandando, setMandando] = useState(false)
  const temChave = !!f.analise_chave
  const pedida = f.ordem === 'publicar'

  return (
    <div className="an-bloco" style={{ maxWidth: '80ch' }}>
      <h4>Esta análise está chegando ao CRM</h4>
      <p className="an-explica">
        O motor terminou a análise e gravou o resultado no disco da máquina onde ela rodou. O agente
        da esteira <b>publica sozinho</b> assim que vê uma análise entregue, e a aba passa a mostrar o
        relatório inteiro — normalmente em menos de dois minutos. Se o notebook estiver desligado, ela
        espera ele voltar; o botão abaixo serve para não esperar.
      </p>

      {!temChave ? (
        <div className="an-aviso aviso">
          Esta pasta não tem análise no acervo do disco (<b>analise_chave</b> vazia). Não há o que
          publicar: ou a análise não chegou a gravar o resultado, ou a pasta foi renomeada depois.
          O caminho aqui é <b>Refazer</b>, na aba Análise.
        </div>
      ) : pedida ? (
        <div className="an-aviso">
          Já pedi a publicação. O agente do notebook pega a ordem na próxima rodada e a aba se
          atualiza sozinha quando terminar.
        </div>
      ) : (
        <>
          <div className="an-bt-linha">
            <button type="button" className="an-bt azul" disabled={!quem.podeEscrever || mandando}
              onClick={async () => { setMandando(true); await aoMandar('publicar'); setMandando(false) }}>
              {mandando ? 'Pedindo…' : 'Publicar agora'}
            </button>
            <span className="an-bt-nota">
              Roda a carga só para esta empresa, na máquina onde a análise está.
              Leva alguns segundos e nada é sobrescrito sem registro.
            </span>
          </div>
          {!quem.podeEscrever && (
            <div className="an-dica">Você tem permissão só de leitura: quem publica é um analista.</div>
          )}
        </>
      )}

      {f.ultima_ordem_resultado && (
        <div className="an-dica">Última ordem: {f.ultima_ordem_resultado}</div>
      )}
    </div>
  )
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
  /* VINDO DO ACERVO, A ABA QUE ABRE É O RELATÓRIO. Ele clica numa análise
     publicada para LER a análise; cair na Visão geral obrigaria um clique a
     mais toda vez. Vindo da Mesa, continua na Visão geral, que é onde se
     decide o que fazer com a pasta. */
  const [aba, setAba] = useState<Aba>('geral')
  /* Uma REF, e não estado: a carga do card precisa saber se ele já escolheu uma
     aba, mas essa resposta não pode entrar nas dependências do `useCallback` —
     isso recriaria a função a cada clique e a carga rodaria de novo à toa. */
  const abaEscolhida = useRef(false)
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

  /* O CARD ABRE POR DOIS CAMINHOS  ·  09/09/2026
     Ordem dele: "acessando tanto pela opção Mesa quanto pela opção do Acervo,
     as duas devem abrir nessa tela, onde tem visão geral, arquivos, análise,
     Relatório e mais". Antes, o Acervo levava para o relatório pelado e a Mesa
     para o card de sete abas — duas telas para a mesma empresa, e ele
     precisava lembrar por onde tinha entrado.

     Agora o `id` da rota pode ser das duas coisas:
       · o id de uma PASTA da esteira (`analise_fila`), como sempre foi;
       · o id de uma ANÁLISE do acervo (`analises`), e aí a ficha é montada a
         partir dela. São 137 das 139 vigentes: a análise terminou e a pasta
         foi arquivada, então esteira não existe mais para elas.

     A pasta é procurada primeiro. Se ela existir, nada muda. */
  const carregar = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase.from('analise_fila').select(COLUNAS_FILA).eq('id', id).maybeSingle()
    if (error) { setErro(error.message); setCarregando(false); return }
    let linha = (data as unknown as FilaRica | null)

    if (!linha) {
      // Não é pasta da esteira: será uma análise do acervo?
      const fi = await fichaPorId(id)
      if (fi) {
        setFicha(fi)
        linha = fichaVirandoFila(fi)
        setF(linha)
        setAbertos(0)
        setAba(a => (abaEscolhida.current ? a : 'relatorio'))
        setCarregando(false)
        return
      }
    }

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
  /** A análise já saiu? É o que decide se existe relatório para procurar. */
  const entregue = f.situacao === 'concluida' || fase === 'pronta'
  const ABAS: { id: Aba; txt: string; n?: number | null; alerta?: boolean; some?: boolean }[] = [
    { id: 'geral', txt: 'Visão geral' },
    /* AS SETE ABAS APARECEM SEMPRE. Ordem dele em 09/09/2026: "ficaremos com
       todas as opções nessa tela". Uma aba que some conforme o caminho de
       entrada é exatamente a confusão que ele mandou acabar.

       O que muda quando a pasta não está mais na esteira é o CONTEÚDO: Arquivos
       e Análise leem a pasta do disco, e ela foi arquivada quando a análise
       terminou. Em vez de aparecerem vazias — o que a tela leria como "esta
       análise não tem documento", que é falso — elas dizem o que houve e para
       onde ir. */
    { id: 'arquivos', txt: 'Arquivos', n: total, alerta: !!(f.arquivos?.avisos ?? []).some(v => v.nivel === 'erro') },
    { id: 'analise', txt: 'Análise', alerta: f.situacao === 'aguardando_resposta' || f.situacao === 'erro' },
    /* A ABA RELATÓRIO APARECE QUANDO A ANÁLISE FOI ENTREGUE, e não quando ela
       já está publicada no banco (09/09/2026). Escondê-la por falta de linha em
       `analises` fazia a Rialma abrir sem Relatório nenhum: a análise tinha
       rodado, concluído e ficado invisível, e o único caminho era abrir o outro
       sistema. Agora a aba existe e diz o que falta — publicar. */
    { id: 'relatorio', txt: 'Relatório', some: !ficha && !entregue, alerta: !ficha && entregue },
    { id: 'ia', txt: 'IA' },
    { id: 'encaminhar', txt: 'Encaminhar', n: abertos || null, alerta: abertos > 0 },
    { id: 'atividades', txt: 'Atividades' },
  ]

  const props = { f, ficha, quem, local, recarregar: carregar }

  return (
    <div className="an-area" style={{ padding: 'clamp(12px, 2vw, 20px) clamp(10px, 2.5vw, 28px) 30px' }}>
      <EstiloAnalises />
      <BarraAnalises atual="mesa" contagens={contagens} />

      <div className="mt-card" style={{ marginTop: 12 }}>
        <div className="an-card-topo">
          {/* Volta para de onde ele veio: análise sem esteira só existe no
              Acervo, e mandá-lo para a Mesa seria devolver a uma lista que não
              contém o que ele estava vendo. */}
          <button type="button" className="an-bt"
            onClick={() => router.push(f.semEsteira ? '/analises?aba=acervo' : '/analises')}
            title={f.semEsteira ? 'Voltar para o acervo' : 'Voltar para a Mesa'}>← Voltar</button>
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
            {semMarcador(f.corretora || ficha?.corretora) && <span style={{ fontSize: 13, color: '#6080a0' }}>{semMarcador(f.corretora || ficha?.corretora)}</span>}
            {f.tomador_id && (
              <button type="button" className="an-bt mini" onClick={() => router.push(`/tomadores/${f.tomador_id}`)} title="O cadastro deste tomador no CRM, com as operações">Cadastro no CRM</button>
            )}
          </div>
        </div>

        <nav className="an-card-abas" role="tablist" aria-label="O card do tomador">
          {ABAS.filter(a => !a.some).map(a => (
            <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} className={`an-card-aba${aba === a.id ? ' on' : ''}`}
              onClick={() => { abaEscolhida.current = true; setAba(a.id) }}>
              {a.txt}{a.n ? <i>{a.n}</i> : null}{a.alerta ? <b className="ponto" /> : null}
            </button>
          ))}
        </nav>

        <div className="an-card-corpo">
          {erro && <div className="alert-error" style={{ marginBottom: 12 }}>{erro}</div>}
          {aba === 'geral' && <VisaoGeral {...props} aoIrParaAba={a => setAba(a as Aba)} />}
          {aba === 'arquivos' && (f.semEsteira
            ? <SemPasta aba="arquivos" chave={f.chave_local} docs={ficha?.documentos.length ?? 0} aoIrParaAba={a => { abaEscolhida.current = true; setAba(a as Aba) }} />
            : <Arquivos {...props} aoMandar={o => mandar(o)} />)}
          {aba === 'analise' && (f.semEsteira
            ? <SemPasta aba="analise" chave={f.chave_local} docs={ficha?.documentos.length ?? 0} aoIrParaAba={a => { abaEscolhida.current = true; setAba(a as Aba) }} />
            : <AbaAnalise {...props} aoMandar={mandar} />)}
          {aba === 'relatorio' && (ficha
            ? <RelatorioCompleto analiseId={ficha.id} semCabecalho aoCarregar={fi => { if (fi) setFicha(fi) }} />
            : <RelatorioAPublicar f={f} quem={quem} aoMandar={mandar} />)}
          {aba === 'ia' && <AbaIA {...props} />}
          {aba === 'encaminhar' && (f.semEsteira
            ? <SemPasta aba="encaminhar" chave={f.chave_local} docs={0} aoIrParaAba={a => { abaEscolhida.current = true; setAba(a as Aba) }} />
            : <Encaminhar {...props} />)}
          {aba === 'atividades' && (f.semEsteira
            ? <SemPasta aba="atividades" chave={f.chave_local} docs={0} aoIrParaAba={a => { abaEscolhida.current = true; setAba(a as Aba) }} />
            : <Atividades {...props} />)}
        </div>
      </div>
    </div>
  )
}
