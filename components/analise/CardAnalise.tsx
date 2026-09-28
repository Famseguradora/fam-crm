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
import { soDigitos } from '@/lib/analise/local'
import { faseDe, nomeDaFase, SITUACAO, type Ordem } from '@/lib/analise/esteira'
import { COLUNAS_FILA, nomeDaFicha, iniciaisDe, corDoNome, COLUNAS_ANALISE_MESA, casaRegra, type FilaRica, type AnaliseDaMesa } from '@/lib/analise/mesa'
import { IcoVoltar } from '@/components/tomador/icones'
import BarraAnalises, { useContagensBarra } from './BarraAnalises'
import EstiloAnalises from './Estilo'
import RelatorioNoFluxo from './RelatorioNoFluxo'
import VisaoGeral from './card/VisaoGeral'
import Arquivos from './card/Arquivos'
import AbaAnalise from './card/AbaAnalise'
import AbaIA from './card/AbaIA'
import Encaminhar from './card/Encaminhar'
import Atividades from './card/Atividades'
import { SISTEMA_LOCAL, type Quem } from './card/comum'
import { PortaDoRelatorio, SemSistemaLocal } from './PortaDoRelatorio'
import Reanalisar from './Reanalisar'
import ReguaDoCard, { PalcoDaRegua, type EstadoNo } from '@/components/card/ReguaDoCard'
import { etapaDoCard, nomeArea, type PostoCentral } from '@/lib/card/secoes'
import { fmtData } from '@/lib/utils'
import BancadaTriagem from '@/components/triagem/BancadaTriagem'

type Aba = 'triagem' | 'geral' | 'arquivos' | 'analise' | 'relatorio' | 'ia' | 'encaminhar' | 'atividades'

/* CADA ABA MORA NA ÁREA DONA DELA  ·  28/09/2026
   Antes as sete abas ficavam todas numa tela que parecia do Crédito, e a
   Eldorado, que ainda esperava balanços, Serasa e contrato social, abria "no
   Crédito". Agora o card abre no nó da etapa em que está, e cada nó mostra só
   o que é dele: conferir documentos e arquivos é Cadastro e triagem; rodar a
   análise, ler o relatório e perguntar à IA é Crédito. Visão geral (a nota da
   equipe, o substatus), Encaminhar e Atividades são do card inteiro e
   aparecem nas duas. */
const ABAS_DO_POSTO: Partial<Record<PostoCentral, Aba[]>> = {
  cadastro: ['triagem', 'geral', 'arquivos', 'encaminhar', 'atividades'],
  credito: ['geral', 'analise', 'relatorio', 'ia', 'encaminhar', 'atividades'],
}

interface SecaoDoCard {
  area: string
  estado: string
  texto: string | null
  pendencia_texto: string | null
  paralisa: boolean
  paralisa_motivo: string | null
  concluida_em: string | null
  concluida_por: string | null
}

/* AS DUAS SAÍDAS DA MESA  ·  28/09/2026
   "Aprovar definitivo": a ressalva virou aprovação. Grava quem e quando em
   `analises.aprovado_definitivo_*`, e o card sai da coluna para o Acervo. A
   recomendação da análise NÃO muda: o relatório é a foto do dia.
   "Tirar da Mesa": o card vai para o Acervo sem decisão nenhuma. Quem tem
   pasta no disco volta à coluna da fase até a pasta ir para a rede.
   Grava quem pode editar a análise (a RLS de `analises` é a trava). */
function SaidasDaMesa({ f, analiseId, quem, aoMudar }: { f: FilaRica; analiseId: string | null; quem: Quem; aoMudar: () => void }) {
  const router = useRouter()
  const [a, setA] = useState<AnaliseDaMesa | null>(null)
  const [mandando, setMandando] = useState(false)
  const [erro, setErro] = useState('')


  useEffect(() => {
    if (!analiseId) return
    let vivo = true
    createClient().from('analises').select(COLUNAS_ANALISE_MESA).eq('id', analiseId).maybeSingle()
      .then(({ data }) => { if (vivo) setA((data as AnaliseDaMesa | null) ?? null) })
    return () => { vivo = false }
  }, [analiseId])

  if (!quem.analista) return null
  const ressalva = casaRegra({ recomendacao_contem: 'ressalva' }, a?.recomendacao)
  /* Só aprova definitivo o que ele já leu e editou: "a revisar" fica na Pronta. */
  const podeAprovar = ressalva && !!a?.revisada
  const naMesaPorMim = f.semEsteira ? !!a && !a.fora_da_mesa_em && !a.aprovado_definitivo_em : !!f.coluna_id

  const gravar = async (tipo: 'aprovar' | 'tirar') => {
    if (tipo === 'aprovar' && !window.confirm(`Aprovar definitivo ${nomeDaFicha(f)}?\n\nA análise recomendava "${a?.recomendacao}". Fica gravado quem aprovou e quando, e o card vai para o Acervo.`)) return
    setMandando(true); setErro('')
    const supabase = createClient()
    const agora = new Date().toISOString()
    const nome = quem.nome ?? 'alguém'
    if (analiseId) {
      const { data, error } = await supabase.from('analises').update(tipo === 'aprovar'
        ? { aprovado_definitivo_em: agora, aprovado_definitivo_por: nome, mesa_coluna_id: null }
        : { fora_da_mesa_em: agora, fora_da_mesa_por: nome, mesa_coluna_id: null },
      ).eq('id', analiseId).select('id')
      if (error || !data?.length) { setErro(error?.message ?? 'Sem permissão para mudar esta análise.'); setMandando(false); return }
    }
    // A pasta que ele tinha segurado numa coluna solta junto.
    if (!f.semEsteira && f.coluna_id) await supabase.from('analise_fila').update({ coluna_id: null, coluna_por: null, coluna_em: null }).eq('id', f.id)
    if (tipo === 'aprovar' && f.tomador_id) {
      await supabase.from('card_eventos').insert({
        tomador_id: f.tomador_id, tipo: 'evento', area: 'credito', autor_nome: nome,
        texto: `Aprovado definitivo por ${nome}. A análise${a?.data_analise ? ` de ${fmtData(a.data_analise)}` : ''} recomendava "${a?.recomendacao}".`,
      })
    }
    setMandando(false)
    if (tipo === 'tirar') { router.push('/analises'); return }
    aoMudar()
    setA(x => (x ? { ...x, aprovado_definitivo_em: agora } : x))
  }

  if (a?.aprovado_definitivo_em) {
    return <span className="an-tag pronta" title="A ressalva virou aprovação definitiva">Aprovado definitivo</span>
  }
  return (
    <>
      {podeAprovar && (
        <button type="button" className="an-bt mini azul" disabled={mandando} onClick={() => gravar('aprovar')}
          title="A ressalva foi atendida: grava a aprovação definitiva e manda o card para o Acervo">Aprovar definitivo</button>
      )}
      {(naMesaPorMim || ressalva) && (
        <button type="button" className="an-bt mini" disabled={mandando} onClick={() => gravar('tirar')}
          title="Tira o card da Mesa e manda para o Acervo. Nada é apagado.">Tirar da Mesa</button>
      )}
      {erro && <span style={{ fontSize: 12, color: '#a02020' }}>{erro}</span>}
    </>
  )
}

/* A BANCADA DE TRIAGEM DENTRO DO CARD. Com caso, é a tela do Funil inteira
   (components/triagem/BancadaTriagem.tsx). Sem caso (pasta que chegou direto
   no notebook, como a Eldorado), um clique cria o caso ligado a este card, com
   o checklist que o agente já leu. Criar sozinho ao abrir seria escrever no
   banco só porque alguém olhou. */
function BancadaDoCard({ f, aoMudar }: { f: FilaRica; aoMudar: () => void }) {
  const { ajudaAnalise } = usePermissoes()
  const [abrindo, setAbrindo] = useState(false)
  const [erro, setErro] = useState('')

  if (f.caso_id) return <BancadaTriagem id={f.caso_id} embutida aoMudar={aoMudar} />
  if (f.semEsteira) {
    return (
      <div className="an-bloco" style={{ maxWidth: '78ch' }}>
        <h4>A triagem desta análise já passou</h4>
        <p className="an-explica">Esta análise foi entregue e a pasta saiu da esteira. O cadastro da empresa está no tomador.</p>
      </div>
    )
  }

  const abrir = async () => {
    setAbrindo(true); setErro('')
    try {
      const r = await fetch('/api/casos/da-fila', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fila_id: f.id }),
      })
      const j = await r.json()
      if (!r.ok) setErro(j.erro ?? 'Não consegui abrir a bancada.')
      else if (j.aviso) setErro(j.aviso)
      aoMudar()
    } catch {
      setErro('A conexão caiu. Tente de novo.')
    }
    setAbrindo(false)
  }

  return (
    <div className="an-bloco" style={{ maxWidth: '78ch' }}>
      <h4>Bancada de triagem e cadastro</h4>
      <p className="an-explica">
        Este card chegou direto pela pasta, sem caso de triagem. Abra a bancada para confirmar o CNPJ, cadastrar o
        tomador, conferir os documentos e soltar o que faltar. O checklist já vem com o que o agente leu da pasta.
      </p>
      {erro && <div className="an-aviso aviso">{erro}</div>}
      <div className="an-bt-linha">
        <button type="button" className="an-bt azul" disabled={!ajudaAnalise || abrindo} onClick={abrir}>
          {abrindo ? 'Abrindo…' : 'Abrir a bancada de triagem'}
        </button>
      </div>
      {!ajudaAnalise && <div className="an-dica">Você tem permissão só de leitura na Análise.</div>}
    </div>
  )
}

/* AS ÁREAS QUE TRABALHAM NO CADASTRO DO TOMADOR (Comercial, Subscrição,
   Emissão) aparecem aqui como LEITURA: o registro delas mora no Fluxo por área
   do tomador, com as regras de quem escreve (lib/card/secoes.ts). Copiar o
   editor para cá seria a segunda tela escrevendo a mesma seção. */
function AreaNoCadastro({ posto, tomadorId, secao, atual }: {
  posto: PostoCentral; tomadorId: string | null; secao: SecaoDoCard | null; atual: PostoCentral
}) {
  const router = useRouter()
  const aqui = posto === atual
  return (
    <div className="an-bloco" style={{ maxWidth: '80ch' }}>
      <h4>{nomeArea(posto)}</h4>
      {!tomadorId ? (
        <p className="an-explica">
          Este card ainda não tem cadastro de tomador. Ele nasce quando a triagem confirmar o CNPJ, e é lá que{' '}
          {nomeArea(posto)} registra o trabalho dela. Até lá, o caso anda em Cadastro e triagem.
        </p>
      ) : posto === 'emissao' ? (
        <p className="an-explica">
          {aqui
            ? 'O card chegou à Emissão: a Subscrição concluiu. As operações e as apólices estão no cadastro do tomador.'
            : 'A Emissão é o fim da linha: o card chega aqui quando a Subscrição conclui.'}
        </p>
      ) : (
        <>
          <p className="an-explica">
            {secao?.estado === 'concluida'
              ? `Concluída${secao.concluida_por ? ` por ${secao.concluida_por}` : ''}${secao.concluida_em ? ` em ${fmtData(secao.concluida_em)}` : ''}.`
              : aqui ? 'O card está nesta área agora.' : 'O card ainda não chegou aqui, ou já passou sem concluir.'}
          </p>
          {secao?.texto?.trim()
            ? <div className="an-explica" style={{ whiteSpace: 'pre-wrap', color: 'inherit' }}>{secao.texto}</div>
            : <div className="an-dica">{nomeArea(posto)} ainda não escreveu o registro oficial.</div>}
          {secao?.pendencia_texto?.trim() && <div className="an-dica">Pendência: {secao.pendencia_texto}</div>}
        </>
      )}
      {tomadorId && (
        <div className="an-bt-linha" style={{ marginTop: 10 }}>
          <button type="button" className="an-bt azul" onClick={() => router.push(`/tomadores/${tomadorId}?g=fluxo`)}>
            Abrir o Fluxo por área do tomador
          </button>
        </div>
      )}
    </div>
  )
}

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
      {/* A porta some fora da máquina dele; a frase diz por quê. Sem ela o
          colega só via um botão a menos. (23/09/2026) */}
      <SemSistemaLocal chave={chave} />
    </div>
  )
}

/* REFAZER UMA ANÁLISE QUE SÓ ESTÁ NO ACERVO  ·  14/09/2026
   "Tinha um botão de refazer análise dentro de cada análise", na Obrascon. O
   Refazer da aba Análise só existia para pasta com linha na esteira, e as
   análises de antes de 08/09 nunca tiveram. Aqui ele volta, e dá a mesma ordem:
   a rota cria a linha que faltava e o notebook traz a pasta de _concluidas.

   EM 24/09/2026 ELE VIROU REANÁLISE. O bloco antigo mandava, com todas as
   letras, "cole o documento na pasta, dentro de _concluidas no notebook": o
   CRM não tinha por onde receber documento novo, e a análise anterior não ia
   junto para quem reanalisava. Agora o pedido é um só (motivo + documentos +
   a análise anterior inteira), e quem o monta é `Reanalisar`. */
function RefazerDoAcervo({ f, quem, aoIrParaAba }: { f: FilaRica; quem: Quem; aoIrParaAba: (a: string) => void }) {
  const nome = nomeDaFicha(f)

  return (
    <div className="an-bloco" style={{ maxWidth: '80ch' }}>
      <h4>Reanalisar</h4>
      {f.analise_id ? (
        <Reanalisar analiseId={f.analise_id} pasta={f.pasta} nome={nome} podeEscrever={quem.podeEscrever} />
      ) : (
        <div className="an-dica">Esta pasta ainda não tem análise publicada para reanalisar.</div>
      )}
      <div className="an-bt-linha" style={{ marginTop: 10 }}>
        <button type="button" className="an-bt" onClick={() => aoIrParaAba('relatorio')}>Abrir o Relatório</button>
        {f.chave_local && <PortaDoRelatorio chave={f.chave_local} />}
      </div>
      <SemSistemaLocal chave={f.chave_local} />
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
    // A pasta de verdade, quando a análise gravou: é ela que o Refazer mostra.
    pasta: fi.pasta || fi.nome_curto || fi.razao_social,
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
    // A chave do TOMADOR, como na Mesa (é por ela que notas e o cofre se acham),
    // e não a da análise: com chave_local as notas da empresa não apareciam.
    chave: (fi.cnpj && fi.cnpj.length === 14 ? fi.cnpj : '') || fi.chave_local,
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
  /* DENTRO DA ANÁLISE, "só leitura" passou a ser "não ajuda" (23/09/2026).
     A conta é a mesma de antes para as 8 pessoas da FAM — todas ajudam —, e o
     que muda é quem foi marcado só para VER: perfil `leitura` com acesso
     enxerga a Mesa inteira e não arrasta card, que foi o pedido literal dele.
     Um `const` só, para as dezenas de usos abaixo não mudarem de forma.
     A trava de verdade é a RLS `fam_ajuda_analise()`. */
  const { ajudaAnalise, editaAnalise } = usePermissoes()
  const somenteLeitura = !ajudaAnalise
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
  const [aba, setAba] = useState<Aba | null>(null)
  /* Uma REF, e não estado: a carga do card precisa saber se ele já escolheu uma
     aba, mas essa resposta não pode entrar nas dependências do `useCallback` —
     isso recriaria a função a cada clique e a carga rodaria de novo à toa. */
  const abaEscolhida = useRef(false)
  const [quem, setQuem] = useState<Quem>({ nome: null, authId: null, podeEscrever: !somenteLeitura, analista: editaAnalise })
  const [abertos, setAbertos] = useState(0)
  /* ONDE O CARD ESTÁ: a central do tomador e as seções dele. Sem tomador
     ligado (CNPJ ainda a confirmar), fica nulo e a esteira fala sozinha. */
  const [central, setCentral] = useState<string | null>(null)
  const [secoes, setSecoes] = useState<SecaoDoCard[]>([])
  /** A área aberta na tela. Nula = a etapa em que o card está. */
  const [vendo, setVendo] = useState<PostoCentral | null>(null)

  // `?aba=analise`: quem pediu o Refazer do Acervo chega direto no relógio.
  useEffect(() => {
    const pedida = new URLSearchParams(window.location.search).get('aba')
    if (pedida !== 'analise') return
    abaEscolhida.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAba('analise')
    setVendo('credito')
  }, [])

  const tomadorId = f?.tomador_id ?? null
  useEffect(() => {
    if (!tomadorId) return
    let vivo = true
    const supabase = createClient()
    Promise.all([
      supabase.from('tomadores').select('central_area').eq('id', tomadorId).maybeSingle(),
      supabase.from('card_secoes')
        .select('area, estado, texto, pendencia_texto, paralisa, paralisa_motivo, concluida_em, concluida_por')
        .eq('tomador_id', tomadorId),
    ]).then(([t, s]) => {
      if (!vivo) return
      setCentral((t.data?.central_area as string | null) ?? null)
      setSecoes((s.data as SecaoDoCard[]) ?? [])
    })
    return () => { vivo = false }
  }, [tomadorId])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('usuarios').select('nome, analista_credito').eq('auth_id', user.id).maybeSingle().then(({ data }) => {
        setQuem({ nome: data?.nome ?? user.email ?? null, authId: user.id, podeEscrever: !somenteLeitura, analista: !!data?.analista_credito || editaAnalise })
      })
    })
  }, [somenteLeitura, editaAnalise])

  /* QUEM ABRIU ESTE CARD FICA REGISTRADO  ·  23/09/2026
     Ordem dele ao abrir a Análise para a equipe: "tem que registrar o que cada
     um fez. Trabalho em fluxo, no histórico de cada card tem que ter a
     informação do que cada um acessou."

     Quem grava é o BANCO, numa função `security definer`: o nome e o
     `auth.uid()` saem da sessão, nunca do que esta tela mandar. Por isso o
     navegador pode chamar direto e ainda assim ninguém forjar acesso alheio.

     UMA LINHA POR JANELA DE 30 MINUTOS, e não por abertura. Abrir o card,
     voltar para a Mesa e entrar de novo produziria oito linhas iguais que
     afogariam o encaminhamento e a nota no meio da linha do tempo.

     Falhar aqui NÃO pode atrapalhar quem está lendo: o registro é para o
     histórico, e um card que não abre porque a auditoria caiu seria o remédio
     pior que a doença. Por isso só avisa no console.

     `f?.id` e não `f`: o objeto muda a cada recarga da ficha, o id não. */
  useEffect(() => {
    const fila = f?.id
    if (!fila) return
    createClient()
      .rpc('registrar_visita_analise', { p_fila: fila })
      .then(({ error }) => {
        if (error) console.warn('[analise] não consegui registrar a visita:', error.message)
      })
  }, [f?.id])

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
        /* A PASTA DESTA ANÁLISE PODE EXISTIR (28/09/2026). O Acervo navega com o
           id da análise, e a Alphaville abria "sem esteira": sem notas, sem
           documentos, sem substatus, embora a linha da fila apontasse para essa
           mesma análise. Achando a pasta, o card vira o da Mesa, com a URL dela. */
        const { data: pastas } = await supabase.from('analise_fila').select('id, cnpj')
          .or(`analise_id.eq.${fi.id},analise_chave.eq.${fi.chave_local}`)
          .order('atualizado_em', { ascending: false }).limit(5)
        // Ponteiro trocado (Power IV) não leva ao card de outra empresa.
        const daPasta = (pastas ?? []).find(p => !p.cnpj || !fi.cnpj || p.cnpj === fi.cnpj)
        if (daPasta?.id && daPasta.id !== id) { router.replace(`/analises/mesa/${daPasta.id}`); return }
        setFicha(fi)
        linha = fichaVirandoFila(fi)
        setF(linha)
        setAbertos(0)
        setAba(a => (abaEscolhida.current ? a : 'relatorio'))
        // O Relatório é do Crédito: vindo do Acervo, a tela abre nesse nó.
        setVendo(v => v ?? 'credito')
        setCarregando(false)
        return
      }
    }

    setF(linha)
    if (linha) {
      /* O RESULTADO É A VIGENTE DO CNPJ (28/09/2026). O ponteiro `analise_id`
         ficava na versão velha depois da reanálise (Alphaville, Obrascon,
         Globalx, Usiblend, NC, Setra), e o card mostrava a análise de antes.
         Com CNPJ confirmado, vale a vigente; o ponteiro é só o plano B. */
      const cnpjFirme = (linha.cnpj_confiavel || !!linha.tomador_id) && soDigitos(linha.cnpj).length === 14
      const vigente = cnpjFirme ? await fichaDaAnalise(null, linha.cnpj) : null
      const fi = vigente ?? (linha.analise_id ? await fichaPorId(linha.analise_id) : await fichaDaAnalise(linha.tomador_id, linha.cnpj))
      setFicha(fi)
      const { count } = await supabase.from('analise_encaminhamentos').select('id', { count: 'exact', head: true }).eq('fila_id', linha.id).eq('estado', 'aberto')
      setAbertos(count ?? 0)
    }
    setCarregando(false)
  }, [id, router])

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
    /* A BANCADA DA TRIAGEM (28/09/2026): a mesma tela do caso no Funil, que
       ele pediu "no lugar certo". É a primeira aba de Cadastro e triagem. */
    { id: 'triagem', txt: 'Triagem e cadastro' },
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

  /* A etapa e a área aberta. O card abre onde ESTÁ; a régua deixa olhar as
     outras sem mover nada. */
  const etapa = etapaDoCard(f.tomador_id ? central : null, fase)
  const posto: PostoCentral = vendo ?? etapa
  const doPosto = ABAS_DO_POSTO[posto]
  const abasVisiveis = doPosto ? ABAS.filter(a => !a.some && doPosto.includes(a.id)) : []
  // Sem aba escolhida (ou escolhida em outra área), abre a primeira da área.
  const abaNaTela: Aba = aba && (!doPosto || doPosto.includes(aba)) ? aba : (doPosto?.[0] ?? 'geral')
  const secaoDe = (p: PostoCentral) => secoes.find(s => s.area === p) ?? null
  const estados: Partial<Record<PostoCentral, EstadoNo>> = {}
  for (const s of secoes) {
    estados[s.area as PostoCentral] = s.paralisa ? 'parada' : s.estado === 'concluida' ? 'feita' : null
  }
  /* Etapa que o caso já deixou para trás aparece como PASSOU, e não como
     "concluída": concluir é gesto de gente, e ninguém clicou. */
  const ordemDe = (p: PostoCentral) => (['comercial', 'cadastro', 'credito', 'subscricao', 'emissao'] as PostoCentral[]).indexOf(p)
  const legenda = (p: PostoCentral): string => {
    const s = secaoDe(p)
    if (s?.paralisa) return 'paralisada'
    if (p === etapa) return 'está aqui'
    if (s?.estado === 'concluida') return 'concluída'
    return ordemDe(p) < ordemDe(etapa) ? 'passou' : 'aguarda'
  }
  const escolher = (p: PostoCentral) => {
    setVendo(p)
    const lista = ABAS_DO_POSTO[p]
    if (lista && aba && !lista.includes(aba)) setAba(null)
  }
  /** Um botão dentro de uma aba manda para outra (Arquivos, Relatório): se ela
   *  é de outra área, a régua acompanha. */
  const irParaAba = (a: string) => {
    const alvo = a as Aba
    abaEscolhida.current = true
    if (!ABAS_DO_POSTO[posto]?.includes(alvo)) setVendo(ABAS_DO_POSTO.cadastro?.includes(alvo) ? 'cadastro' : 'credito')
    setAba(alvo)
  }

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
              {/* CNPJ ligado a um tomador do CRM foi conferido por gente (pré-cadastro) ou pela Receita. */}
              {f.cnpj && (f.cnpj_confiavel || f.analise_id || f.tomador_id) ? maskCNPJ(f.cnpj) : 'CNPJ a confirmar'}
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
            <SaidasDaMesa f={f} analiseId={f.analise_id ?? ficha?.id ?? null} quem={quem} aoMudar={carregar} />
            {f.tomador_id && (
              <button type="button" className="an-bt mini" onClick={() => router.push(`/tomadores/${f.tomador_id}`)} title="O cadastro deste tomador no CRM, com as operações">Cadastro no CRM</button>
            )}
            {/* Vindo do Acervo o card abre no Relatório: o Refazer precisa estar à vista. */}
            {f.semEsteira && quem.podeEscrever && (
              <button type="button" className="an-bt mini" onClick={() => irParaAba('analise')} title="Traz a pasta de volta de _concluidas e roda a análise de novo">Refazer a análise</button>
            )}
          </div>
        </div>

        <ReguaDoCard atual={etapa} vendo={posto} estados={estados} legenda={legenda} aoEscolher={escolher} />

        <PalcoDaRegua vendo={posto} aoEscolher={escolher}>
        {abasVisiveis.length > 0 && (
        <nav className="an-card-abas" role="tablist" aria-label={`O card em ${nomeArea(posto)}`}>
          {abasVisiveis.map(a => (
            <button key={a.id} type="button" role="tab" aria-selected={abaNaTela === a.id} className={`an-card-aba${abaNaTela === a.id ? ' on' : ''}`}
              onClick={() => { abaEscolhida.current = true; setAba(a.id) }}>
              {a.txt}{a.n ? <i>{a.n}</i> : null}{a.alerta ? <b className="ponto" /> : null}
            </button>
          ))}
        </nav>
        )}

        <div className="an-card-corpo">
          {erro && <div className="alert-error" style={{ marginBottom: 12 }}>{erro}</div>}
          {!doPosto && <AreaNoCadastro posto={posto} tomadorId={f.tomador_id} secao={secaoDe(posto)} atual={etapa} />}
          {doPosto && <>
          {abaNaTela === 'triagem' && <BancadaDoCard f={f} aoMudar={carregar} />}
          {abaNaTela === 'geral' && <VisaoGeral {...props} aoIrParaAba={irParaAba} />}
          {abaNaTela === 'arquivos' && (f.semEsteira
            ? <SemPasta aba="arquivos" chave={f.chave_local} docs={ficha?.documentos.length ?? 0} aoIrParaAba={irParaAba} />
            : <Arquivos {...props} aoMandar={o => mandar(o)} />)}
          {abaNaTela === 'analise' && (f.semEsteira
            ? <RefazerDoAcervo f={f} quem={quem} aoIrParaAba={irParaAba} />
            : <AbaAnalise {...props} aoMandar={mandar} />)}
          {abaNaTela === 'relatorio' && (ficha
            ? <RelatorioNoFluxo ficha={ficha} chave={f.chave_local || ficha.chave_local} sistemaLocal={local}
                aoCarregar={fi => { if (fi) setFicha(fi) }} />
            : <RelatorioAPublicar f={f} quem={quem} aoMandar={mandar} />)}
          {abaNaTela === 'ia' && <AbaIA {...props} />}
          {abaNaTela === 'encaminhar' && (f.semEsteira
            ? <SemPasta aba="encaminhar" chave={f.chave_local} docs={0} aoIrParaAba={irParaAba} />
            : <Encaminhar {...props} />)}
          {abaNaTela === 'atividades' && (f.semEsteira
            ? <SemPasta aba="atividades" chave={f.chave_local} docs={0} aoIrParaAba={irParaAba} />
            : <Atividades {...props} />)}
          </>}
        </div>
        </PalcoDaRegua>
      </div>
    </div>
  )
}
