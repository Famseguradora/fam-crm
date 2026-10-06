'use client'

/* MESA DE TRIAGEM E CADASTRO — a segunda estação da esteira.

   VIROU BANCADA EM 28/09/2026. Ordem dele: "cada área dessa será uma bancada
   de um profissional, então Triagem/Cadastro será a bancada para realizar
   todo o cadastro e triagem do tomador, igual é hoje. A programação está toda
   correta, só tem que entrar no lugar certo." Por isso a tela saiu da página
   e mora aqui: a página /comercial/<id> e o nó "Cadastro e triagem" do card
   da Análise usam ESTA mesma peça. `embutida` só tira o que a moldura do card
   já mostra (voltar, título) e troca as saídas para o Funil por ficar no card.

   REFORMA DE 09/09/2026, e o motivo dela, nas palavras dele: "está muito
   confuso e complexo o primeiro passo; o Comercial pode não querer rodar nada".

   A tela virou TRÊS PASSOS NUMERADOS, um embaixo do outro, e cada um termina
   num botão só:

     1 · A empresa       digita o CNPJ, a Receita preenche, o TOMADOR JÁ NASCE
     2 · Os documentos   arrasta o Serasa e o que faltar, aqui dentro
     3 · Para a análise  quando quiser, e a pendência viaja junto

   O QUE MUDOU DE VERDADE, e não é só desenho:

   • O cadastro do tomador saiu do fim e veio para o passo 1. Antes ele só
     nascia no "Concluir", junto com o envio para a análise — então não havia
     como o Comercial deixar a empresa pré-cadastrada e ir embora. Agora há, e
     o passo 3 é opcional. Quem manda a empresa para o banco é o passo 1.
   • Documento entra pela tela. Antes só entrava o que veio dentro do e-mail, e
     o Serasa (que chega depois, quase sempre) não tinha porta nenhuma.
   • Nada aqui precisa de agente, de esteira ou de máquina ligada. Este caminho
     é o do teclado, e é o principal.

   As três regras antigas continuam valendo, e continuam desenhadas na tela:
   o CNPJ é a chave; pendência de documento NÃO trava a esteira; e o que a
   pessoa decide vence o que o robô achou. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { maskCNPJ, validarCNPJ, fmtData } from '@/lib/utils'
import { consultarCNPJpelaTela, nomeDeExibicao } from '@/lib/cnpj'
import { cor, raio } from '@/lib/ui/painel'
import SociosSerasa, { type ResumoSocios } from '@/components/serasa/SociosSerasa'
import { FaixaDaArea, Instrumentos, Instrumento } from '@/components/painel/Faixa'
import { type PedidoSerasa, SERASA_ABERTO, situacaoSerasa } from '@/lib/serasa/pedido'
import { lerArrastoDoOutlook, FORMATO_ARRASTO } from '@/lib/email/arrasto-outlook'
import ChegouParaOCaso from '@/components/triagem/ChegouParaOCaso'
import RetornoDaAnalise from '@/components/analise/RetornoDaAnalise'
import Lembretes from '@/components/lembretes/Lembretes'

/* Por onde o documento avulso chegou. É o que deixa histórico quando não há
   e-mail (pedido de 30/09/2026); o texto vai para o detalhe do documento. */
const MEIOS = ['WhatsApp', 'Entregue em mãos', 'Portal da corretora', 'Link de nuvem', 'Pendrive ou mídia', 'Outro meio']

const CLASSES: { valor: string; rotulo: string }[] = [
  { valor: 'contabil', rotulo: 'Demonstração contábil' },
  { valor: 'serasa_pj', rotulo: 'Serasa PJ (tomador)' },
  { valor: 'serasa_pf', rotulo: 'Serasa PF (sócio)' },
  { valor: 'contrato_social', rotulo: 'Contrato social' },
  { valor: 'acordo_socios', rotulo: 'Acordo de sócios' },
  { valor: 'cartao_cnpj', rotulo: 'Cartão CNPJ' },
  { valor: 'outro', rotulo: 'Outro documento' },
]

const SITUACOES: { valor: string; rotulo: string; badge: string }[] = [
  { valor: 'ok', rotulo: 'Recebido', badge: 'badge-green' },
  { valor: 'a_caminho', rotulo: 'A caminho', badge: 'badge-blue' },
  { valor: 'duvida', rotulo: 'Em dúvida', badge: 'badge-yellow' },
  { valor: 'dispensado', rotulo: 'Dispensado', badge: 'badge-gray' },
  { valor: 'faltando', rotulo: 'Faltando', badge: 'badge-red' },
]

interface Caso {
  id: string; numero: number; assunto: string
  remetente_nome: string | null; remetente_email: string | null
  recebido_em: string | null; corpo: string | null
  cnpj: string | null; razao_social: string | null
  corretora_texto: string | null; produto: string | null
  corretora_id: string | null; identificado_por: string | null
  etapa: string; tomador_id: string | null; criado_em: string
  criado_por_nome: string | null
  analise_fila_id: string | null
}

interface Documento {
  id: string; nome: string; classe: string; certeza: string
  nao_lido: boolean; bytes: number | null; anexo_id: string | null
  anexos: { storage_path: string } | null
}

interface Item {
  id: string; item: string; situacao: string; por: string
  detalhe: string | null
  caso_item_catalogo: { nome: string; exigencia: string; frase_falta: string | null; ordem: number }
}

const fmtBytes = (b: number | null) =>
  !b ? '' : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

/** O cabeçalho de um passo: o número, o título e a linha que explica o que
 *  aquele passo faz. Passo cumprido fica verde — é o único jeito de bater o
 *  olho na tela e saber onde o caso parou sem ler nada. */
function Passo({ n, titulo, pronto, acao, children }: {
  n: number; titulo: string; pronto: boolean; acao?: ReactNode; children: ReactNode
}) {
  return (
    <div className="bt-passo">
      <span className={`bt-n${pronto ? ' ok' : ''}`}>{pronto ? '✓' : n}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <h4>{titulo}</h4>
        <p>{children}</p>
      </div>
      {acao}
    </div>
  )
}

/* O VISUAL DA BANCADA  ·  30/09/2026
   Pedido dele, olhando a tela no notebook e no monitor grande: "os quadros não
   estão condizentes com a estrutura da tela", "os botões são muito grandes",
   "o nome do tomador está maiúsculo". E a referência que ele escolheu foi a
   Mesa da Subscrição (mockup v2 de 29/09): a faixa marinho com a conclusão da
   área, uma fileira de instrumentos, e embaixo duas colunas, o trabalho à
   esquerda e o que falta à direita.

   A largura manda por CONTAINER, e não pela janela: a mesma peça mora na
   página do Funil (larga) e dentro do card da Análise (estreita, entre os dois
   trilhos laterais). Com `@container`, no notebook o card empilha em uma coluna
   e no monitor grande abre em duas, sem a tela precisar saber onde está.

   A faixa e os instrumentos são peças de components/painel/Faixa.tsx, as
   mesmas da Visão geral do Crédito: o pedido foi PADRONIZAR, e duas cópias
   da mesma faixa divergiriam no primeiro ajuste.

   Folha própria com prefixo `bt-`, pelo mesmo motivo do `an-` da Análise
   (docs/DESIGN-PAINEL.md, exceção 1): estilo inline não faz `@container` nem
   `:hover`. Os valores vêm de lib/ui/painel.ts por interpolação: nenhum hex
   redigitado. Só a lógica ficou onde estava; aqui nada muda dado nenhum. */
const FOLHA = `
.bt { container-type: inline-size; color: ${cor.texto}; font-size: 12.5px; }
.bt-topo { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.bt-topo h1 { font-size: 19px; font-weight: 700; color: ${cor.tinta}; margin: 0; }

.bt-grade { display: grid; grid-template-columns: minmax(0,1.45fr) minmax(0,1fr); gap: 14px; align-items: start; }
.bt-bloco { background: ${cor.papel}; border: 1px solid ${cor.borda}; border-radius: ${raio.cartao}px; padding: 14px 16px; margin-bottom: 14px; }
.bt-bloco.vez { border-color: ${cor.acao}; box-shadow: inset 3px 0 0 ${cor.acao}; }
.bt-bloco.ouro { border-color: ${cor.ouro}; box-shadow: inset 3px 0 0 ${cor.ouro}; }
.bt-passo { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
.bt-passo h4 { margin: 0; font-size: 13.5px; font-weight: 700; color: ${cor.tinta}; }
.bt-passo p { margin: 1px 0 0; font-size: 12px; color: ${cor.textoSub}; line-height: 1.45; }
.bt-n { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0;
  font-size: 11.5px; font-weight: 800; color: ${cor.branco}; background: ${cor.acao}; margin-top: 1px; }
.bt-n.ok { background: ${cor.areaOperacao}; }

.bt-campos { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px 14px; }
.bt-campo { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.bt-campo > label { font-size: 11.5px; color: ${cor.textoFraco}; }
.bt-campo .dica { font-size: 11.5px; color: ${cor.textoSub}; }
.bt-campo .dica.at { color: ${cor.ouroTexto}; }
.bt-linha { display: flex; gap: 6px; align-items: center; min-width: 0; }
.bt-in { font: inherit; font-size: 13px; padding: 6px 10px; border: 1px solid ${cor.borda}; border-radius: ${raio.controle}px;
  background: ${cor.papel}; color: ${cor.tinta}; outline: none; width: 100%; min-width: 0; }
.bt-in:focus { border-color: ${cor.bordaAtiva}; }
.bt-in:disabled { background: ${cor.papelZebra}; color: ${cor.textoSub}; cursor: default; }
select.bt-in { padding-right: 6px; }
.bt-in.mini { font-size: 12px; padding: 4px 6px; }

.bt-bt { font: inherit; font-size: 12.5px; font-weight: 600; padding: 6px 12px; border-radius: ${raio.controle}px;
  border: 1px solid ${cor.borda}; background: ${cor.papel}; color: ${cor.texto}; cursor: pointer; white-space: nowrap;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; text-decoration: none; }
.bt-bt:hover:not(:disabled) { border-color: ${cor.acaoClara}; color: ${cor.acao}; }
.bt-bt:disabled { opacity: .5; cursor: default; }
.bt-bt.cheio { background: ${cor.acao}; border-color: ${cor.acao}; color: ${cor.branco}; }
.bt-bt.cheio:hover:not(:disabled) { background: ${cor.tinta2}; color: ${cor.branco}; }
.bt-bt.mini { font-size: 12px; padding: 4px 10px; }
.bt-bt.perigo { color: ${cor.alerta}; border-color: ${cor.alertaBorda}; }
.bt-bt.perigo:hover:not(:disabled) { background: ${cor.alertaFundo}; color: ${cor.alerta}; border-color: ${cor.alerta}; }
.bt-bts { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 12px; }
.bt-nota { font-size: 12px; color: ${cor.textoSub}; line-height: 1.5; }

.bt-aviso { border: 1px solid ${cor.borda}; background: ${cor.papelZebra}; border-radius: ${raio.controle}px; padding: 8px 11px;
  margin-top: 12px; color: ${cor.textoSub}; font-size: 12px; line-height: 1.5; }
.bt-aviso.erro { border-color: ${cor.alertaBorda}; background: ${cor.alertaFundo}; color: ${cor.alerta}; }
.bt-aviso.at { border-color: ${cor.ouro}; background: ${cor.papel}; color: ${cor.ouroTexto}; }

.bt-solta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; border: 1.5px dashed ${cor.borda};
  background: ${cor.papelZebra}; border-radius: ${raio.controle}px; padding: 9px 12px; margin-bottom: 12px; cursor: pointer; }
.bt-solta.em { border-color: ${cor.acao}; background: ${cor.destaque}; }
.bt-solta b { font-size: 12.5px; color: ${cor.tinta}; }
.bt-solta span { font-size: 11.5px; color: ${cor.textoFraco}; }
.bt-solta select { width: auto; max-width: 220px; }

.bt-tab-caixa { border: 1px solid ${cor.bordaSuave}; border-radius: ${raio.controle}px; overflow-x: auto; }
.bt-tab { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.bt-tab th { background: ${cor.papelZebra}; color: ${cor.tinta}; font-size: 11.5px; font-weight: 700; text-align: left;
  padding: 7px 10px; border-bottom: 1px solid ${cor.bordaSuave}; white-space: nowrap; }
.bt-tab td { padding: 6px 10px; border-bottom: 1px solid ${cor.bordaSuave}; vertical-align: middle; }
.bt-tab tr:last-child td { border-bottom: none; }
.bt-tab tbody tr:hover { background: ${cor.papelZebra}; }
.bt-tab .arq { font-weight: 600; color: ${cor.tinta}; overflow-wrap: anywhere; }
.bt-tab .tam { color: ${cor.textoFraco}; white-space: nowrap; font-variant-numeric: tabular-nums; }
.bt-tab select { min-width: 150px; }

.bt-exig { padding: 9px 0; border-bottom: 1px solid ${cor.bordaSuave}; }
.bt-exig:last-of-type { border-bottom: none; }
.bt-exig-cab { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.bt-exig-cab b { font-size: 12.5px; color: ${cor.tinta}; }
.bt-exig .falta { font-size: 11.5px; color: ${cor.alerta}; flex-basis: 100%; }
.bt-exig .pessoa { font-size: 11px; color: ${cor.textoFraco}; margin-left: auto; }
.bt-seg { display: inline-flex; flex-wrap: wrap; border: 1px solid ${cor.borda}; border-radius: ${raio.controle}px; overflow: hidden; margin-top: 6px; }
.bt-seg button { font: inherit; font-size: 11.5px; padding: 3px 9px; border: none; border-left: 1px solid ${cor.bordaSuave};
  background: ${cor.papel}; color: ${cor.textoSub}; cursor: pointer; }
.bt-seg button:first-child { border-left: none; }
.bt-seg button:hover { color: ${cor.acao}; background: ${cor.papelZebra}; }
.bt-seg button.on { background: ${cor.acao}; color: ${cor.branco}; }

.bt-email dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0; font-size: 12px; }
.bt-email dt { color: ${cor.textoFraco}; }
.bt-email dd { margin: 0; color: ${cor.texto}; overflow-wrap: anywhere; }
.bt-email pre { white-space: pre-wrap; word-break: break-word; font-family: inherit; font-size: 12.5px; color: ${cor.texto};
  margin: 10px 0 0; max-height: 340px; overflow-y: auto; border-top: 1px solid ${cor.bordaSuave}; padding-top: 10px; }
.bt-abre { background: none; border: none; padding: 0; font: inherit; font-size: 13.5px; font-weight: 700; color: ${cor.tinta};
  cursor: pointer; display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; }
.bt-abre small { margin-left: auto; font-size: 11.5px; font-weight: 600; color: ${cor.acao}; }

.bt-tl { list-style: none; margin: 0; padding: 0 0 0 14px; border-left: 2px solid ${cor.bordaSuave}; }
.bt-tl li { position: relative; padding: 0 0 12px 10px; }
.bt-tl li:last-child { padding-bottom: 0; }
.bt-tl li::before { content: ''; position: absolute; left: -21px; top: 4px; width: 10px; height: 10px; border-radius: 50%;
  background: ${cor.papel}; border: 2px solid ${cor.acaoClara}; }
.bt-tl li.matriz::before { border-color: ${cor.ouro}; background: ${cor.ouro}; }
.bt-tl li.avulso::before { border-color: ${cor.textoFraco}; }
.bt-tl-cab { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.bt-tl-selo { font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 999px; border: 1px solid ${cor.borda}; color: ${cor.textoSub}; }
.bt-tl-selo.matriz { border-color: ${cor.ouro}; color: ${cor.ouroTexto}; }
.bt-tl-selo.email { border-color: ${cor.acaoClara}; color: ${cor.acao}; }
.bt-tl-quando { font-size: 11.5px; color: ${cor.textoFraco}; font-variant-numeric: tabular-nums; }
.bt-tl-titulo { font-size: 12.5px; font-weight: 600; color: ${cor.tinta}; margin-top: 3px; overflow-wrap: anywhere; }
.bt-tl-quem, .bt-tl-trouxe { font-size: 11.5px; color: ${cor.textoSub}; margin-top: 2px; overflow-wrap: anywhere; }

@container (max-width: 980px) {
  .bt-grade { grid-template-columns: minmax(0,1fr); }
}
@container (max-width: 560px) {
  .bt-campos { grid-template-columns: minmax(0,1fr); }
  /* No celular a tabela vira lista: o nome do arquivo na linha de cima, inteiro,
     e o tipo, o tamanho e o Abrir embaixo. Em colunas, o nome virava uma
     tira de três letras por linha. */
  .bt-tab thead { display: none; }
  .bt-tab, .bt-tab tbody { display: block; }
  .bt-tab tr { display: grid; grid-template-columns: minmax(0,1fr) auto auto; gap: 6px 8px; align-items: center;
    padding: 8px 10px; border-bottom: 1px solid ${cor.bordaSuave}; }
  .bt-tab tr:last-child { border-bottom: none; }
  .bt-tab td { display: block; padding: 0; border: none; }
  .bt-tab td:first-child { grid-column: 1 / -1; }
  .bt-tab select { min-width: 0; width: 100%; }
}
/* No celular o dedo precisa de alvo maior: o botão compacto é para o mouse. */
@media (pointer: coarse) {
  .bt-bt { min-height: 40px; }
  .bt-in { font-size: 16px; min-height: 40px; }
  .bt-seg button { min-height: 36px; }
}
`

/** Dia e hora curtos, no mesmo formato do aviso do Serasa (`situacaoSerasa`). */
const hora =(iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** O pedaço da linha da esteira que a triagem precisa para saber se a análise andou. */
type NaEsteira = {
  pasta: string
  situacao: string | null
  ordem: string | null
  analise_id: string | null
  automatica: boolean | null
  cadastro_agente: { status?: string; motivos?: string[] } | null
}

export default function BancadaTriagem({ id, embutida = false, aoMudar }: {
  /** o id do caso (`casos.id`) */
  id: string
  /** dentro do card da Análise: sem o "voltar" e sem o título da página */
  embutida?: boolean
  /** avisa o card que o caso mudou (concluiu, excluiu), para ele recarregar */
  aoMudar?: () => void
}) {
  const router = useRouter()
  const { somenteLeitura } = usePermissoes()

  const [caso, setCaso] = useState<Caso | null>(null)
  const [docs, setDocs] = useState<Documento[]>([])
  const [itens, setItens] = useState<Item[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [recado, setRecado] = useState('')
  const [verCorpo, setVerCorpo] = useState(false)
  const [buscandoReceita, setBuscandoReceita] = useState(false)

  // o Serasa pelo robô, ao lado da Receita
  const [serasa, setSerasa] = useState<PedidoSerasa | null>(null)
  const [pedindoSerasa, setPedindoSerasa] = useState(false)
  const [pasta, setPasta] = useState<string | null>(null)
  // Como o card está na esteira: é o que diz se a análise começou ou parou.
  const [naEsteira, setNaEsteira] = useState<NaEsteira | null>(null)
  // Depois do clique o botão não volta: entre o notebook aceitar e a situação virar "rodando", ele piscaria.
  const [ordemDada, setOrdemDada] = useState(false)
  const [quem, setQuem] = useState<{ nome: string | null; analista: boolean }>({ nome: null, analista: false })
  const serasaAntes = useRef<PedidoSerasa | null>(null)
  // A contagem dos sócios, vinda da própria lista (SociosSerasa), para o cartão.
  const [socios, setSocios] = useState<ResumoSocios | null>(null)

  // rascunho da identificação
  const [cnpj, setCnpj] = useState('')
  const [razao, setRazao] = useState('')
  // A corretora é da LISTA do CRM (10/09/2026), a mesma do cadastro do tomador.
  const [corretoraId, setCorretoraId] = useState('')
  const [corretoras, setCorretoras] = useState<{ id: string; razao_social: string }[]>([])
  const [produto, setProduto] = useState('')

  // passo 2: anexar à mão
  const [classeNova, setClasseNova] = useState('serasa_pj')
  const [subindo, setSubindo] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const seletor = useRef<HTMLInputElement>(null)
  // Por onde o documento avulso chegou: sem e-mail, é isto que deixa histórico.
  const [meio, setMeio] = useState('')
  // Sobe a cada entrada nova, para a linha do tempo recarregar.
  const [versaoChegadas, setVersaoChegadas] = useState(0)

  /* Documentos e checklist, sem tocar no rascunho do passo 1: é o que recarrega
     quando o PDF do Serasa chega, com a pessoa talvez digitando lá em cima. */
  const carregarDocumentos = useCallback(async () => {
    const supabase = createClient()
    const { data: d } = await supabase
      .from('caso_documentos')
      .select('id, nome, classe, certeza, nao_lido, bytes, anexo_id, anexos(storage_path)')
      .eq('caso_id', id)
      .order('criado_em')
    setDocs((d ?? []) as unknown as Documento[])

    const { data: i } = await supabase
      .from('caso_itens')
      .select('id, item, situacao, por, detalhe, caso_item_catalogo!inner(nome, exigencia, frase_falta, ordem)')
      .eq('caso_id', id)
    const lista = ((i ?? []) as unknown as Item[]).sort(
      (a, b) => a.caso_item_catalogo.ordem - b.caso_item_catalogo.ordem,
    )
    setItens(lista)
  }, [id])

  const carregar = useCallback(async () => {
    const supabase = createClient()
    const { data: c } = await supabase.from('casos').select('*').eq('id', id).maybeSingle()
    if (!c) { setErro('Caso não encontrado.'); setCarregando(false); return }
    setCaso(c as Caso)
    setCnpj((c as Caso).cnpj ?? '')
    setRazao((c as Caso).razao_social ?? '')
    setCorretoraId((c as Caso).corretora_id ?? '')
    setProduto((c as Caso).produto ?? '')
    // A pasta da análise, quando a esteira já abriu uma: o PDF do Serasa também cai nela.
    if ((c as Caso).analise_fila_id) {
      const { data: f } = await supabase.from('analise_fila')
        .select('pasta, situacao, ordem, analise_id, automatica, cadastro_agente')
        .eq('id', (c as Caso).analise_fila_id as string).maybeSingle()
      setPasta((f?.pasta as string | undefined) ?? null)
      setNaEsteira((f as NaEsteira | null) ?? null)
    }
    await carregarDocumentos()
    setCarregando(false)
  }, [id, carregarDocumentos])

  useEffect(() => { carregar() }, [carregar])

  // A mesma consulta do Cadastro do tomador: ativas, em ordem de razão social.
  useEffect(() => {
    const supabase = createClient()
    supabase.from('corretoras').select('id, razao_social').eq('status', 'ativo').order('razao_social')
      .then(({ data }) => setCorretoras((data ?? []) as { id: string; razao_social: string }[]))
    // Quem pede o Serasa e quem decide os sócios (a função do banco confere de novo).
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('usuarios').select('nome, email, analista_credito').eq('auth_id', user.id).maybeSingle()
        .then(({ data }) => setQuem({ nome: data?.nome ?? data?.email ?? user.email ?? null, analista: !!data?.analista_credito }))
    })
  }, [])

  /* O SERASA NA TRIAGEM (15/09/2026), ao lado da Receita. É o mesmo pedido do
     cadastro do tomador e do card da análise (`serasa_pedidos`): a esteira do
     notebook consulta pelo robô, o PDF vira anexo do tomador, cai na pasta da
     análise e entra no passo 2 com o item do checklist marcado (quem liga ao
     caso é `/api/esteira/serasa`). Cada consulta é cobrada da FAM: por isso a
     confirmação, e só com o tomador salvo, porque é o CNPJ dele que a esteira
     confere antes de gastar. */
  const tomadorId = caso?.tomador_id ?? null
  const carregarSerasa = useCallback(async () => {
    if (!tomadorId) return
    let q = createClient().from('serasa_pedidos')
      .select('id, estado, criado_em, feito_em, resultado, pedido_por')
      .eq('camada', 'empresa').order('criado_em', { ascending: false }).limit(1)
    q = pasta ? q.or(`tomador_id.eq.${tomadorId},pasta.eq.${JSON.stringify(pasta)}`) : q.eq('tomador_id', tomadorId)
    const { data } = await q.maybeSingle()
    const novo = (data as PedidoSerasa | null) ?? null
    const velho = serasaAntes.current
    if (velho && novo && velho.id === novo.id && SERASA_ABERTO.includes(velho.estado) && !SERASA_ABERTO.includes(novo.estado)) carregarDocumentos()
    serasaAntes.current = novo
    setSerasa(novo)
  }, [tomadorId, pasta, carregarDocumentos])

  useEffect(() => { carregarSerasa() }, [carregarSerasa])
  const serasaAberto = !!serasa && SERASA_ABERTO.includes(serasa.estado)
  useEffect(() => {
    if (!serasaAberto) return
    const t = setInterval(carregarSerasa, 5000)
    return () => clearInterval(t)
  }, [serasaAberto, carregarSerasa])

  async function pedirSerasa() {
    const doc = (caso?.cnpj ?? '').replace(/\D/g, '')
    if (!caso?.tomador_id || doc.length !== 14) return
    const jaTem = docs.some((d) => d.classe === 'serasa_pj')
    if (!window.confirm(`Buscar o Serasa de ${caso.razao_social || 'esta empresa'} (CNPJ ${maskCNPJ(doc)})?\n\n${jaTem
      ? 'O caso já tem um Serasa. Se este CNPJ foi consultado nos últimos 30 dias, o robô reaproveita sem cobrar; senão é uma consulta nova, cobrada.'
      : 'É uma consulta cobrada da FAM (Relatório Avançado, sem nenhum extra).'}\n\nO robô roda no notebook. O PDF entra no passo 2 em 1 a 2 minutos, e os sócios aparecem aqui para a decisão do analista.`)) return
    setPedindoSerasa(true); setErro(''); setRecado('')
    const { error } = await createClient().from('serasa_pedidos').insert({
      tomador_id: caso.tomador_id,
      pasta,
      cnpj: doc,
      documento: doc,
      pedido_por: quem.nome,
    })
    if (error) setErro(error.code === '23505' ? 'Já há um pedido de Serasa em andamento para esta empresa.' : error.message)
    await carregarSerasa()
    setPedindoSerasa(false)
  }

  // Usa a MESMA consulta do botão Receita do Cadastro e da tela de Operações
  // (`lib/cnpj.ts`). Escrever um fetch próprio aqui traria dois defeitos de
  // graça: a razão social viria em CAIXA ALTA (o `tituloReceita` é que a põe em
  // Título) e "CNPJ inexistente" ficaria com a mesma mensagem de "a Receita caiu".
  async function buscarNaReceita() {
    const digitos = cnpj.replace(/\D/g, '')
    if (digitos.length !== 14) { setErro('Digite o CNPJ completo para buscar.'); return }
    setBuscandoReceita(true); setErro('')
    try {
      const cartao = await consultarCNPJpelaTela(digitos)
      setRazao(cartao.razao_social)
      setRecado(`Receita: ${cartao.razao_social}${cartao.situacao ? ' · ' + cartao.situacao : ''}`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui consultar a Receita agora.')
    }
    setBuscandoReceita(false)
  }

  /* PASSO 1. Grava a identificação E cria o cadastro do tomador, numa ida só.
     O cadastro é o mesmo `acharOuCriarTomadorPorCnpj` do resto do CRM: se o
     CNPJ já existe, ele reaproveita e não sobrescreve nada. */
  async function preCadastrar() {
    setSalvando(true); setErro(''); setRecado('')
    const digitos = cnpj.replace(/\D/g, '')
    if (!validarCNPJ(digitos)) {
      setErro('CNPJ inválido: confira os dígitos.'); setSalvando(false); return
    }
    try {
      const r = await fetch(`/api/casos/${id}/pre-cadastro`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cnpj: digitos, razao_social: razao, corretora_id: corretoraId || null, produto }),
      })
      const j = await r.json()
      if (!r.ok) { setErro(j.erro ?? 'Não consegui salvar.'); setSalvando(false); return }
      setRecado(
        (j.criado ? 'Tomador cadastrado' : 'Tomador já existia e foi vinculado') +
        `: ${j.tomador.razao_social}.` +
        (j.receita?.ok === false ? ` A Receita não respondeu (${j.receita.motivo}): confira endereço e contato na ficha.` : ''),
      )
      await carregar()
    } catch {
      setErro('A conexão caiu. Tente de novo.')
    }
    setSalvando(false)
  }

  /* PASSO 2. Os arquivos que chegaram depois do e-mail. A classe é escolhida
     ANTES de soltar o arquivo, de propósito: é ela que faz o item do checklist
     cair, e adivinhar pelo nome é justamente o que erra. */
  /* E-MAIL SOLTO AQUI VIRA E-MAIL DO CASO (30/09/2026), e não "outro
     documento". Pedido dele: a resposta da corretora com o que faltava entra
     NO MESMO card, com os anexos abertos e o texto guardado. Quem decide se é
     e-mail é o servidor, pelo conteúdo; aqui só se separa pelo nome o que vai
     para cada rota. Sem extensão (o arrasto do Outlook clássico) vai como
     e-mail: é o formato que ele monta. */
  const pareceEmail = (f: File) => /\.(msg|eml)$/i.test(f.name) || !/\.[^.\s]+$/.test(f.name)

  const recadoDoJuntar = (j: {
    documentos?: number; resolveu?: string[]; analise_concluida?: boolean; ja_estava?: boolean
    caso?: { numero?: number }; falhas?: string[]
  }) => {
    if (j.ja_estava) return 'Este e-mail já estava neste caso: nada foi duplicado.'
    return `E-mail juntado ao caso, com ${j.documentos ?? 0} anexo(s)` +
      (j.resolveu?.length ? `. Resolveu: ${j.resolveu.join(', ')}.` : '.') +
      (j.analise_concluida
        ? ' A análise deste caso já está pronta: os documentos foram para a ficha do tomador. Para lê-los contra a análise, use a Análise complementar no relatório.'
        : ' A esteira baixa os arquivos para a pasta e refaz a triagem sozinha.')
  }

  const juntarEmails = useCallback(async (emails: File[] | null, bilhete?: string) => {
    const recados: string[] = []
    const erros: string[] = []
    /* Arquivo sem extensão que o servidor disse NÃO ser e-mail volta para o
       caminho do documento avulso, em vez de se perder com um erro. */
    const naoEram: File[] = []
    const pedidos: { rotulo: string; arquivo?: File; init: RequestInit }[] = bilhete
      ? [{ rotulo: 'e-mail do Outlook', init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ arrasto: bilhete }) } }]
      : (emails ?? []).map((f) => {
          const corpo = new FormData()
          corpo.append('email', f)
          return { rotulo: f.name || 'e-mail', arquivo: f, init: { method: 'POST', body: corpo } }
        })
    for (const p of pedidos) {
      try {
        const r = await fetch(`/api/casos/${id}/email`, p.init)
        const j = await r.json()
        if (!r.ok && p.arquivo && !/\.(msg|eml)$/i.test(p.arquivo.name) && /não é um e-mail/.test(j.erro ?? '')) {
          naoEram.push(p.arquivo)
          continue
        }
        if (!r.ok) {
          erros.push(j.conectar
            ? 'Sua caixa do Outlook ainda não está ligada ao CRM. Salve o e-mail e solte o arquivo aqui, ou ligue a caixa na Entrada de pedidos.'
            : `${p.rotulo}: ${j.erro ?? 'não consegui juntar.'}`)
          continue
        }
        recados.push(recadoDoJuntar(j))
        if (j.falhas?.length) erros.push(`Ficaram de fora: ${j.falhas.join(' · ')}`)
      } catch {
        erros.push(`${p.rotulo}: a conexão caiu no meio do envio.`)
      }
    }
    return { recados, erros, naoEram }
  }, [id])

  const anexar = useCallback(async (arquivos: FileList | File[], bilhete?: string) => {
    const lista = Array.from(arquivos)
    if (!lista.length && !bilhete) return
    setSubindo(true); setErro(''); setRecado('')
    const emails = lista.filter(pareceEmail)
    const avulsos = lista.filter((f) => !pareceEmail(f))
    const recados: string[] = []
    const erros: string[] = []

    if (emails.length || bilhete) {
      const r = await juntarEmails(emails, bilhete)
      recados.push(...r.recados); erros.push(...r.erros)
      avulsos.push(...r.naoEram)
    }

    if (avulsos.length) {
      const corpo = new FormData()
      corpo.append('classe', classeNova)
      if (meio) corpo.append('meio', meio)
      for (const a of avulsos) corpo.append('arquivo', a)
      try {
        const r = await fetch(`/api/casos/${id}/documentos`, { method: 'POST', body: corpo })
        const j = await r.json()
        if (!r.ok) erros.push(j.erro ?? 'Não consegui anexar.')
        else {
          recados.push(
            `${j.entraram} documento(s) anexado(s)` +
            (j.itens_marcados?.length ? ', e a exigência correspondente foi marcada como recebida.' : '.') +
            (j.no_tomador ? ' Como a triagem já foi concluída, eles nasceram direto na ficha do tomador.' : ''),
          )
          if (j.aviso) erros.push(j.aviso)
        }
      } catch {
        erros.push('A conexão caiu no meio do envio. Confira a lista e tente de novo.')
      }
    }

    setRecado(recados.join(' '))
    setErro(erros.join(' '))
    setVersaoChegadas((v) => v + 1)
    await carregar()
    setSubindo(false)
  }, [classeNova, meio, id, carregar, juntarEmails])

  /* O QUE CAIU NA ÁREA, procurado nos DOIS lugares, como na Entrada de
     pedidos: o e-mail do Outlook clássico às vezes só vem em `items`, e o do
     Novo Outlook não vem como arquivo, vem como bilhete com o id da mensagem. */
  const soltou = (dt: DataTransfer) => {
    const caiu: File[] = dt.files?.length ? Array.from(dt.files) : []
    if (!caiu.length) {
      for (const item of Array.from(dt.items ?? [])) {
        if (item.kind !== 'file') continue
        const f = item.getAsFile()
        if (f) caiu.push(f)
      }
    }
    if (caiu.length) { anexar(caiu); return }
    let bilhete = ''
    try { bilhete = dt.getData(FORMATO_ARRASTO) } catch { /* segue */ }
    if (lerArrastoDoOutlook(bilhete).length) { anexar([], bilhete); return }
    setErro('Nada chegou do que foi solto. Se veio do Outlook, salve o e-mail e solte o arquivo, ou use o clique para escolher.')
  }

  // As duas funções abaixo pintam a tela antes de a gravação voltar (a espera
  // por clique tornaria o checklist arrastado). Mas se a gravação falhar, a tela
  // VOLTA ao que era e diz o motivo: senão o item ficaria "Recebido" aqui e
  // reapareceria como pendência na hora de concluir, sem explicação nenhuma.
  async function trocarClasse(docId: string, classe: string) {
    const supabase = createClient()
    const antes = docs
    setDocs((ds) => ds.map((d) => (d.id === docId ? { ...d, classe, certeza: 'alta' } : d)))
    const { data, error } = await supabase
      .from('caso_documentos')
      .update({ classe, certeza: 'alta', classificado_por: 'humano' })
      .eq('id', docId)
      .select('id')
    if (error || !data?.length) {
      setDocs(antes)
      setErro(error?.message ?? 'Não consegui gravar o tipo do documento (sem permissão de escrita).')
    }
  }

  async function marcarItem(itemId: string, situacao: string) {
    const supabase = createClient()
    const antes = itens
    setItens((is) => is.map((i) => (i.id === itemId ? { ...i, situacao, por: 'humano' } : i)))
    const { data: sessao } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('caso_itens')
      .update({
        situacao,
        por: 'humano',
        decidido_em: new Date().toISOString(),
        decidido_por: sessao.user?.email ?? null,
      })
      .eq('id', itemId)
      .select('id')
    if (error || !data?.length) {
      setItens(antes)
      setErro(error?.message ?? 'Não consegui gravar esta decisão (sem permissão de escrita).')
    }
  }

  async function abrirDocumento(doc: Documento) {
    if (!doc.anexos?.storage_path) { setErro('Este documento não tem arquivo guardado.'); return }
    const supabase = createClient()
    const { data, error } = await supabase.storage
      .from('fam-anexos')
      .createSignedUrl(doc.anexos.storage_path, 300)
    if (error || !data) { setErro('Não consegui abrir o arquivo: ' + (error?.message ?? '')); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  /* MANDAR PARA A ANÁLISE À MÃO. O caminho normal é o `concluir` aqui embaixo,
     que já põe o caso na esteira. Este botão é a saída para os casos concluídos
     ANTES de a esteira existir (07/09/2026), e para quando a criação da linha
     falhou no meio do concluir e o cadastro ficou feito sem a análise entrar.
     A regra é a mesma dos dois lados (`lib/analise/abrir-fila.ts`). */
  async function mandarParaAnalise() {
    setSalvando(true); setErro(''); setRecado('')
    try {
      const r = await fetch(`/api/casos/${id}/analisar`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) { setErro(j.erro ?? 'Não consegui mandar para a análise.'); setSalvando(false); return }
      setRecado(j.ja_existia
        ? 'Este caso já estava na esteira da análise.'
        : `Entrou na esteira da análise, na pasta "${j.fila.pasta}".`)
      await carregar()
      aoMudar?.()
    } catch {
      setErro('A conexão caiu. Tente de novo.')
    }
    setSalvando(false)
  }

  /* INICIAR DAQUI (01/10/2026). Caso #93: o Agente de Cadastro falhou, a
     ordem de analisar nunca saiu e esta tela dizia "Já foi", sem botão. A
     ordem é a mesma do card da Mesa (`/api/esteira/ordem`), com a mesma regra. */
  async function iniciarAnalise() {
    if (!caso?.analise_fila_id) return
    if (!window.confirm('Iniciar a análise de crédito agora?\n\nFica registrado que a ordem foi sua.')) return
    setSalvando(true); setErro(''); setRecado('')
    try {
      const r = await fetch('/api/esteira/ordem', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: caso.analise_fila_id, ordem: 'iniciar', dados: { escopo: 'completa', motivo: 'Mandada da tela de triagem.' } }),
      })
      const j = await r.json()
      if (!r.ok) { setErro(j.erro ?? 'Não consegui dar a ordem de iniciar.'); setSalvando(false); return }
      setRecado('Ordem dada. O notebook começa a análise em alguns segundos.')
      setOrdemDada(true)
      await carregar()
      aoMudar?.()
    } catch {
      setErro('A conexão caiu. Tente de novo.')
    }
    setSalvando(false)
  }

  /* EXCLUIR (10/09/2026): "às vezes vem tomadores repetidos". Só na triagem,
     com a trava repetida no servidor. O caso sai do funil e fica no histórico;
     a pasta do notebook vai para _excluidas; o tomador não é apagado. */
  async function excluirCaso() {
    const motivo = window.prompt('Por que excluir este caso?\n\nEx.: repetido do caso #17.')
    if (motivo === null) return
    if (!window.confirm(`Excluir o caso #${caso?.numero}?\n\nEle sai da triagem e do funil, e a pasta do notebook vai para _excluidas. Nada é apagado de vez e o tomador continua no cadastro.`)) return
    setSalvando(true); setErro(''); setRecado('')
    try {
      const r = await fetch(`/api/casos/${id}/excluir`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ motivo }),
      })
      const j = await r.json()
      if (!r.ok) { setErro(j.erro ?? 'Não consegui excluir.'); setSalvando(false); return }
      router.push(embutida ? '/analises' : '/fluxo')
      return
    } catch {
      setErro('A conexão caiu. Tente de novo.')
    }
    setSalvando(false)
  }

  async function concluir() {
    setSalvando(true); setErro(''); setRecado('')
    try {
      const r = await fetch(`/api/casos/${id}/concluir`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) { setErro(j.erro ?? 'Não consegui concluir.'); setSalvando(false); return }
      const falta = j.bloqueios?.length ? ` Falta ainda: ${j.bloqueios.join(' · ')}.` : ''
      setRecado(
        (j.criado ? 'Tomador cadastrado' : 'Tomador já existia e foi vinculado') +
        `: ${j.tomador.razao_social}. ${j.documentos_movidos} documento(s) foram para a ficha dele.` +
        ` O caso entrou na fila de análise.${falta}`,
      )
      // O cadastro deu certo, mas se os documentos não migraram isso NÃO pode
      // sair calado: a ficha do tomador ficaria vazia sem ninguém saber por quê.
      if (j.aviso_documentos) setErro(j.aviso_documentos)
      await carregar()
      aoMudar?.()
    } catch {
      setErro('A conexão caiu. Tente de novo.')
    }
    setSalvando(false)
  }

  if (carregando) return <div style={{ padding: 24, color: 'var(--soft)' }}>Carregando…</div>
  if (!caso) return <div style={{ padding: 24 }} className="alert-error">{erro || 'Caso não encontrado.'}</div>

  /* QUEM DIZ QUE ACABOU É A ETAPA, e não o `tomador_id`: desde o pré-cadastro,
     ter tomador é o estado normal de um caso ainda em triagem. */
  const naAnalise = caso.etapa === 'analise'
  const excluido = caso.etapa === 'descartado'
  const naTriagem = caso.etapa === 'comercial' || caso.etapa === 'triagem'
  const podeEditar = !somenteLeitura && !naAnalise && !excluido
  const cnpjOk = cnpj.replace(/\D/g, '').length === 14
  const salvo = cnpjOk && caso.cnpj === cnpj.replace(/\D/g, '')
  const cadastrado = !!caso.tomador_id && salvo
  const pendentes = itens.filter((i) => !['ok', 'dispensado'].includes(i.situacao))
  const bloqueando = pendentes.filter((i) => i.caso_item_catalogo.exigencia === 'bloqueia')
  const avisoSerasa = serasa ? situacaoSerasa(serasa, 'nos documentos do passo 2') : null

  /* A ANÁLISE NÃO COMEÇOU, E NINGUÉM VAI COMEÇAR SOZINHO: o card está na
     esteira, sem ordem, sem análise, e ou o Agente de Cadastro parou ou o card
     não é da esteira automática (esse sempre esperou um clique). */
  const agente = naEsteira?.cadastro_agente ?? null
  const agenteParou = !!agente?.status && agente.status !== 'ok'
  const analiseParada = naAnalise && !!naEsteira && naEsteira.situacao === 'pendente'
    && !naEsteira.ordem && !naEsteira.analise_id && (agenteParou || !naEsteira.automatica)
  const linkEsteira = caso.analise_fila_id ? `/analises/mesa/${caso.analise_fila_id}` : '/analises'

  /* ── O QUE A FAIXA E OS INSTRUMENTOS DIZEM ─────────────────────────────────
     Tudo derivado do que esta tela JÁ lia: caso, documentos, checklist, pedido
     do Serasa e a lista de sócios. Nenhuma consulta nova, nenhum dado novo. */
  const motivoExcluido = (caso as Caso & { motivo_descarte?: string | null }).motivo_descarte ?? null
  const nomeCorretora = corretoras.find((c) => c.id === corretoraId)?.razao_social ?? null
  const nomeTomador = nomeDeExibicao(caso.razao_social || razao)
  const temSerasaPdf = docs.some((d) => d.classe === 'serasa_pj')
  const recebidos = itens.filter((i) => i.situacao === 'ok').length

  const veredito: ReactNode = excluido ? <>Caso <i className="at">excluído</i></>
    : naAnalise ? <>Cadastro <i>concluído</i></>
      : cadastrado ? <>Tomador <i>pré-cadastrado</i></>
        : cnpjOk ? <>Pronto para <i className="at">cadastrar</i></>
          : <>Falta <i className="at">o CNPJ</i></>

  const pontos: string[] = []
  if (excluido && motivoExcluido) pontos.push(`Excluído: ${motivoExcluido}`)
  if (!excluido) {
    if (!cnpjOk) pontos.push('Digite o CNPJ e busque na Receita')
    else if (!cadastrado) pontos.push('Salve o passo 1 para o tomador entrar no cadastro do CRM')
    if (socios?.aguardando) pontos.push(`${socios.aguardando} sócio${socios.aguardando === 1 ? '' : 's'} do Serasa esperando a autorização do analista`)
    if (cadastrado && !temSerasaPdf && !serasa) pontos.push('Sem o Serasa da empresa nos documentos')
    for (const i of pendentes) {
      const s = SITUACOES.find((x) => x.valor === i.situacao) ?? SITUACOES[4]
      pontos.push(`${i.caso_item_catalogo.nome}: ${s.rotulo.toLowerCase()}`)
    }
    if (analiseParada) pontos.unshift(agenteParou ? 'A análise NÃO começou: o Agente de Cadastro parou' : 'A análise NÃO começou: falta a ordem de iniciar')
    if (!pontos.length) pontos.push(naAnalise ? 'Tudo recebido. A próxima área é o Crédito' : 'Nada pendente nesta bancada')
  }

  // Serasa da empresa: o pedido do robô manda; sem pedido, vale o PDF anexado.
  const serasaCartao: { num: string; tom: 'ok' | 'at' | 'al' | ''; ap: string } = !serasa
    ? temSerasaPdf
      ? { num: 'Anexado', tom: 'ok', ap: 'o PDF está nos documentos do passo 2' }
      : { num: 'Não consultado', tom: '', ap: cadastrado ? 'use o botão Serasa, no passo 1' : 'o Serasa depende do tomador salvo' }
    : serasa.estado === 'pendente' ? { num: 'Pedido', tom: 'at', ap: `em ${hora(serasa.criado_em)}, esperando o notebook` }
      : serasa.estado === 'consultando' ? { num: 'Consultando', tom: 'at', ap: 'o robô está no Serasa agora' }
        : serasa.estado === 'falhou' ? { num: 'O robô parou', tom: 'al', ap: serasa.resultado ?? 'sem motivo registrado' }
          : { num: 'Consultado', tom: 'ok', ap: `${serasa.feito_em ? `em ${hora(serasa.feito_em)}` : ''}${serasa.estado === 'reaproveitado' ? ' · reaproveitado, sem cobrança' : ''}` }

  const porClasse = CLASSES.map((c) => ({ c, n: docs.filter((d) => d.classe === c.valor).length })).filter((x) => x.n > 0)
  const CURTO: Record<string, [string, string]> = {
    contabil: ['contábil', 'contábeis'], serasa_pj: ['Serasa', 'Serasa'], serasa_pf: ['Serasa de sócio', 'Serasa de sócios'],
    contrato_social: ['contrato social', 'contratos sociais'], acordo_socios: ['acordo de sócios', 'acordos de sócios'],
    cartao_cnpj: ['cartão CNPJ', 'cartões CNPJ'], outro: ['outro', 'outros'],
  }

  return (
    <div className="bt" style={{ padding: embutida ? 0 : '20px 0' }}>
      <style href="bancada-triagem" precedence="default">{FOLHA}</style>

      {/* ── cabeçalho da página (só fora do card: lá a moldura já diz quem é) ── */}
      {!embutida && (
        <div className="bt-topo">
          <button type="button" className="bt-bt mini" onClick={() => router.push('/fluxo')}>← Voltar para o funil</button>
          <h1>Triagem e cadastro · caso #{caso.numero}</h1>
          {naAnalise && <span className="badge badge-green">na fila de análise</span>}
          {!naAnalise && !excluido && cadastrado && <span className="badge badge-blue">pré-cadastrado</span>}
          {excluido && <span className="badge badge-gray">excluído</span>}
        </div>
      )}

      {/* ══ A FAIXA: a conclusão da área, quem é o tomador e o que fazer ══════ */}
      <FaixaDaArea
        rotulo={`Cadastro e triagem · caso #${caso.numero} · entrou em ${fmtData(caso.criado_em)}${caso.criado_por_nome ? ` por ${caso.criado_por_nome}` : ''}`}
        veredito={veredito}
        pontos={pontos}
        meio={{
          rotulo: 'Tomador',
          titulo: nomeTomador || 'Ainda não identificado',
          sub: (cnpjOk ? `CNPJ ${maskCNPJ(cnpj)}` : 'o CNPJ liga caso, cadastro e análise')
            + (nomeCorretora ? ` · ${nomeDeExibicao(nomeCorretora)}` : caso.corretora_texto ? ` · ${caso.corretora_texto} (no e-mail)` : ''),
        }}
        acoes={(caso.tomador_id || naTriagem || (!embutida && caso.analise_fila_id)) ? (
          <>
            {caso.tomador_id && (
              <button type="button" className="pf-bt ouro" onClick={() => router.push(`/tomadores/${caso.tomador_id}`)}>
                Abrir a ficha do tomador
              </button>
            )}
            {!embutida && caso.analise_fila_id && (
              <button type="button" className="pf-bt" onClick={() => router.push(linkEsteira)}
                title="O card deste tomador na esteira, com a régua das áreas">
                Ver o card na esteira
              </button>
            )}
            {naTriagem && !somenteLeitura && (
              <button type="button" className="pf-bt" onClick={excluirCaso} disabled={salvando}
                title="Para caso repetido: sai da triagem e do funil, a pasta vai para _excluidas, o tomador fica.">
                Excluir o caso
              </button>
            )}
          </>
        ) : undefined}
      />

      {erro && <div className="bt-aviso erro" style={{ margin: '0 0 14px' }}>{erro}</div>}
      {recado && <div className="alert-success" style={{ marginBottom: 14, fontSize: 13 }}>{recado}</div>}

      {/* ══ OS INSTRUMENTOS: um número por cartão, com a origem embaixo ═══════ */}
      <Instrumentos>
        <Instrumento titulo="Serasa da empresa" marca="robô" numero={serasaCartao.num} tom={serasaCartao.tom}
          apoio={serasaCartao.ap} origem="pedido do Serasa deste tomador" />
        <Instrumento titulo="Sócios no Serasa" marca="1ª camada"
          numero={socios?.aguardando ? `${socios.aguardando} esperando`
            : socios?.falhou ? `${socios.falhou} com falha`
              : socios?.andando ? `${socios.andando} consultando`
                : socios?.decididos ? `${socios.decididos} decidido${socios.decididos === 1 ? '' : 's'}` : 'Nenhum'}
          tom={socios?.falhou ? 'al' : socios?.aguardando || socios?.andando ? 'at' : ''}
          apoio={socios?.aguardando ? 'a decisão é do analista de crédito'
            : socios?.falhou ? 'o robô parou; o motivo está na lista'
              : socios?.andando ? 'aprovados, na fila do notebook'
                : socios?.decididos ? 'nos últimos 7 dias'
                  : caso.tomador_id ? 'nenhum sócio a consultar' : 'depende do tomador salvo'}
          origem="quadro societário do Serasa" />
        <Instrumento titulo="Documentos" marca="no caso" numero={String(docs.length)}
          apoio={porClasse.length
            ? porClasse.map(({ c, n }) => `${n} ${CURTO[c.valor]?.[n === 1 ? 0 : 1] ?? c.rotulo}`).join(' · ')
            : 'nenhum ainda'}
          origem="anexos do e-mail e da tela" />
        <Instrumento titulo="Exigências" marca="para a análise"
          numero={itens.length ? `${recebidos} de ${itens.length}` : '—'}
          tom={itens.length && !pendentes.length ? 'ok' : bloqueando.length ? 'at' : ''}
          apoio={!itens.length ? 'o checklist nasce com o caso'
            : bloqueando.length ? `falta ${bloqueando.map((i) => i.caso_item_catalogo.nome).join(' · ')}`
              : pendentes.length ? `${pendentes.length} a confirmar, nada trava`
                : 'todas recebidas ou dispensadas'}
          origem="checklist da triagem" />
      </Instrumentos>

      <div className="bt-grade">
        {/* ══ ESQUERDA: o trabalho (a empresa e os documentos) ═══════════════ */}
        <div style={{ minWidth: 0 }}>
          <div className={`bt-bloco${cadastrado || excluido ? '' : ' vez'}`}>
            <Passo n={1} titulo="A empresa" pronto={cadastrado}>
              {cadastrado
                ? 'O tomador está no banco. Dá para parar aqui: o resto é quando quiser.'
                : 'Digite o CNPJ e clique em Receita. Ao salvar, o tomador já entra no cadastro do CRM.'}
            </Passo>

            <div className="bt-campos">
              <div className="bt-campo">
                <label htmlFor={`cnpj-${id}`}>CNPJ</label>
                <div className="bt-linha">
                  <input
                    id={`cnpj-${id}`} className="bt-in" value={maskCNPJ(cnpj)} disabled={!podeEditar}
                    onChange={(e) => setCnpj(e.target.value.replace(/\D/g, '').slice(0, 14))}
                    placeholder="00.000.000/0000-00" inputMode="numeric"
                  />
                  <button type="button" className="bt-bt" onClick={buscarNaReceita}
                    disabled={!podeEditar || !cnpjOk || buscandoReceita}
                    title="Consulta o cartão CNPJ na Receita e preenche a razão social">
                    {buscandoReceita ? '…' : 'Receita'}
                  </button>
                  {!somenteLeitura && !excluido && (
                    <button type="button" className="bt-bt" onClick={pedirSerasa}
                      disabled={!cadastrado || serasaAberto || pedindoSerasa}
                      title={!cadastrado
                        ? 'Salve o passo 1 antes: o Serasa consulta o CNPJ do tomador cadastrado'
                        : 'Consulta o Serasa pelo robô do notebook; o PDF entra nos documentos deste caso'}>
                      {serasaAberto || pedindoSerasa ? '…' : 'Serasa'}
                    </button>
                  )}
                </div>
              </div>

              <div className="bt-campo">
                <label htmlFor={`razao-${id}`}>Razão social</label>
                <input id={`razao-${id}`} className="bt-in" value={razao} disabled={!podeEditar}
                  onChange={(e) => setRazao(e.target.value)} placeholder="a Receita preenche" />
              </div>

              <div className="bt-campo">
                <label htmlFor={`corretora-${id}`}>Corretora</label>
                <select id={`corretora-${id}`} className="bt-in" value={corretoraId} disabled={!podeEditar}
                  onChange={(e) => setCorretoraId(e.target.value)}>
                  <option value="">Selecione a corretora</option>
                  {corretoras.map((c) => <option key={c.id} value={c.id}>{c.razao_social}</option>)}
                </select>
                {caso.corretora_id && corretoraId === caso.corretora_id && caso.identificado_por !== 'humano' && (
                  <span className="dica">identificada pelo agente no e-mail</span>
                )}
                {!caso.corretora_id && !corretoraId && caso.corretora_texto && (
                  <span className="dica at">no e-mail aparece &quot;{caso.corretora_texto}&quot;, que não está no cadastro de corretoras</span>
                )}
              </div>

              <div className="bt-campo">
                <label htmlFor={`produto-${id}`}>Produto</label>
                <input id={`produto-${id}`} className="bt-in" value={produto} disabled={!podeEditar}
                  onChange={(e) => setProduto(e.target.value)}
                  placeholder={podeEditar ? 'Garantia Executante, Judicial…' : 'não informado'} />
              </div>
            </div>

            {avisoSerasa && <div className={`bt-aviso${avisoSerasa.erro ? ' erro' : ''}`}>{avisoSerasa.texto}</div>}

            {(podeEditar || !cnpjOk) && (
              <div className="bt-bts">
                {podeEditar && (
                  <button type="button" className="bt-bt cheio" onClick={preCadastrar} disabled={!cnpjOk || salvando}>
                    {salvando ? 'Salvando…' : cadastrado ? 'Salvar de novo' : 'Salvar e cadastrar o tomador'}
                  </button>
                )}
                {!cnpjOk && <span className="bt-nota">Sem o CNPJ nada anda: é ele que liga caso, cadastro e análise.</span>}
              </div>
            )}

            {/* O resto do Cadastro Básico (endereço, contato, porte, limite) vive
                na ficha do tomador e é preenchido pela Receita neste momento.
                Repetir aqueles campos aqui criaria uma segunda tela de cadastro,
                que é exatamente o que este CRM não pode ter. */}
            {cadastrado && (
              <p className="bt-nota" style={{ margin: '10px 0 0' }}>
                Endereço, contato e sócios vieram do cartão CNPJ e estão na ficha. Porte, limite e
                observações se editam lá, no Cadastro do tomador.
              </p>
            )}
          </div>

          {/* ══ PASSO 2 · OS DOCUMENTOS ════════════════════════════════════ */}
          <div className="bt-bloco">
            <Passo n={2} titulo="Os documentos" pronto={docs.length > 0}>
              O que veio no e-mail já está aqui. A resposta da corretora com o que faltava, solte o
              e-mail inteiro: ele entra neste caso, não abre análise nova. Veio por outro meio? Solte o
              arquivo e diga por onde chegou.
            </Passo>

            {podeEditar && (
              <div
                className={`bt-solta${arrastando ? ' em' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e) => { e.preventDefault(); setArrastando(false); soltou(e.dataTransfer) }}
                onClick={() => seletor.current?.click()}
                style={{ cursor: subindo ? 'progress' : 'pointer' }}
              >
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <b>{subindo ? 'Enviando…' : 'Solte o e-mail ou os arquivos aqui, ou clique para escolher'}</b>
                  <div><span>E-mail direto do Outlook (.msg, .eml). PDF, Excel, imagem. Até 50 MB cada.</span></div>
                </div>
                {/* A classe é escolhida ANTES de soltar: é ela que marca o item do checklist. */}
                <label className="bt-campo" onClick={(e) => e.stopPropagation()} style={{ flex: '0 1 200px' }}>
                  <span style={{ fontSize: 11.5, color: cor.textoFraco }}>O que você vai anexar</span>
                  <select className="bt-in mini" value={classeNova} onChange={(e) => setClasseNova(e.target.value)}>
                    {CLASSES.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
                  </select>
                </label>
                {/* Só vale para arquivo avulso: o e-mail já carrega o próprio histórico. */}
                <label className="bt-campo" onClick={(e) => e.stopPropagation()} style={{ flex: '0 1 180px' }}>
                  <span style={{ fontSize: 11.5, color: cor.textoFraco }}>Chegou por (sem e-mail)</span>
                  <select className="bt-in mini" value={meio} onChange={(e) => setMeio(e.target.value)}>
                    <option value="">Não informar</option>
                    {MEIOS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <input
                  ref={seletor} type="file" multiple hidden
                  onChange={(e) => { if (e.target.files) anexar(e.target.files); e.target.value = '' }}
                />
              </div>
            )}

            {docs.length === 0 ? (
              <p className="bt-nota" style={{ margin: 0 }}>Nenhum documento ainda.</p>
            ) : (
              <div className="bt-tab-caixa">
                <table className="bt-tab">
                  <thead>
                    <tr>
                      <th>Arquivo</th>
                      <th style={{ width: 190 }}>É o quê</th>
                      <th style={{ width: 70 }}>Tamanho</th>
                      <th style={{ width: 60 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <div className="arq">{d.nome}</div>
                          {d.certeza === 'nula' && <div style={{ fontSize: 11.5, color: cor.alerta }}>não consegui abrir</div>}
                        </td>
                        <td>
                          <select className="bt-in mini" value={d.classe} disabled={!podeEditar}
                            onChange={(e) => trocarClasse(d.id, e.target.value)} aria-label={`Tipo de ${d.nome}`}>
                            {CLASSES.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
                          </select>
                        </td>
                        <td className="tam">{fmtBytes(d.bytes)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button type="button" className="bt-bt mini" onClick={() => abrirDocumento(d)}>Abrir</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ══ O QUE CHEGOU · a matriz com o selo, os e-mails juntados e os avulsos ══ */}
          <div className="bt-bloco">
            <div className="bt-passo" style={{ marginBottom: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h4>O que chegou para este caso</h4>
                <p>O e-mail que abriu o caso leva o selo de matriz. Tudo que chega depois fica aqui, com quem trouxe e o que veio.</p>
              </div>
            </div>
            <ChegouParaOCaso casoId={id} versao={versaoChegadas} />
          </div>

          {/* ══ A RESPOSTA · o fim da linha que começa no e-mail de entrada (06/10/2026) ══ */}
          <div className="bt-bloco">
            <div className="bt-passo" style={{ marginBottom: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h4>Retorno da Análise</h4>
                <p>A resposta ao e-mail de entrada: o que foi analisado, os documentos e a conclusão. Copie e responda pelo Outlook; o sistema não envia e-mail.</p>
              </div>
            </div>
            <RetornoDaAnalise casoId={id} />
          </div>
        </div>

        {/* ══ DIREITA: o que falta decidir e a saída para a análise ═══════════ */}
        <div style={{ minWidth: 0 }}>
          {caso.tomador_id && (
            <SociosSerasa tomadorId={caso.tomador_id} pasta={pasta} analista={quem.analista}
              classeBotao="bt-bt mini" aoResumir={setSocios} />
          )}

          {/* ══ PASSO 3 · PARA A ANÁLISE ══════════════════════════════════════ */}
          <div className={`bt-bloco${!naAnalise && !excluido && cadastrado ? ' ouro' : ''}`}>
            <Passo n={3} titulo="Mandar para a análise de crédito" pronto={naAnalise && !analiseParada}>
              {analiseParada
                ? 'O caso está na esteira, mas a análise não começou.'
                : naAnalise
                ? 'Já foi. A análise é feita no Sistema de Análise, dentro do CRM.'
                : caso.analise_fila_id
                  ? 'A esteira automática já está com este caso: a pasta foi criada no notebook, e a triagem, o cadastro e a análise andam sozinhos. Este botão só é preciso para concluir à mão.'
                  : 'Opcional agora. Pendência de documento não trava: ela viaja junto e o analista decide.'}
            </Passo>

            <div style={{ marginBottom: 12 }}>
              {itens.map((i) => {
                const s = SITUACOES.find((x) => x.valor === i.situacao) ?? SITUACOES[4]
                return (
                  <div key={i.id} className="bt-exig">
                    <div className="bt-exig-cab">
                      <b>{i.caso_item_catalogo.nome}</b>
                      <span className={`badge ${s.badge}`}>{s.rotulo}</span>
                      {i.por === 'humano' && <span className="pessoa">decidido por pessoa</span>}
                      {i.caso_item_catalogo.exigencia === 'bloqueia' && !['ok', 'dispensado'].includes(i.situacao) && (
                        <span className="falta">{i.caso_item_catalogo.frase_falta}</span>
                      )}
                    </div>
                    {podeEditar && (
                      <div className="bt-seg" role="group" aria-label={`Situação de ${i.caso_item_catalogo.nome}`}>
                        {SITUACOES.map((op) => (
                          <button key={op.valor} type="button" onClick={() => marcarItem(i.id, op.valor)}
                            className={i.situacao === op.valor ? 'on' : ''} aria-pressed={i.situacao === op.valor}>
                            {op.rotulo}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {!naAnalise ? (
              <>
                {bloqueando.length > 0 && salvo && (
                  <div className="bt-aviso at" style={{ margin: '0 0 12px' }}>
                    Falta {bloqueando.map((i) => i.caso_item_catalogo.nome).join(' · ')}. Dá para mandar assim
                    mesmo: a pendência viaja junto e quem decide se a análise começa é o analista.
                  </div>
                )}
                <button type="button" className="bt-bt cheio" onClick={concluir} disabled={!podeEditar || !salvo || salvando}>
                  {salvando ? 'Enviando…' : 'Concluir e enviar para análise'}
                </button>
                {!salvo && <div className="bt-nota" style={{ marginTop: 6 }}>Termine o passo 1 primeiro.</div>}
              </>
            ) : caso.analise_fila_id ? (
              <>
                {analiseParada && (
                  <div className="bt-aviso at" style={{ margin: '0 0 12px' }}>
                    {agenteParou
                      ? <>O Agente de Cadastro parou e a análise não começou{agente?.motivos?.length ? `: ${agente.motivos.join(' · ')}` : '.'} Confira os dados e inicie à mão.</>
                      : <>O caso está na esteira, mas a análise ainda não recebeu a ordem de começar.</>}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {/* Iniciar é ordem de analista (`ORDENS_DO_ANALISTA`); os outros veem o aviso. */}
                  {analiseParada && quem.analista && (
                    <button type="button" className="bt-bt cheio" onClick={iniciarAnalise} disabled={somenteLeitura || salvando || ordemDada}>
                      {salvando ? 'Mandando…' : ordemDada ? 'Ordem dada' : 'Iniciar a análise'}
                    </button>
                  )}
                  {analiseParada && !quem.analista && (
                    <span className="bt-nota">Quem inicia é um analista de crédito.</span>
                  )}
                  {embutida
                    ? !analiseParada && <span className="bt-nota">O caso já está na esteira: a próxima área é o Crédito, na régua acima.</span>
                    : <button type="button" className="bt-bt" onClick={() => router.push(linkEsteira)}>Ver o card na esteira</button>}
                </div>
              </>
            ) : (
              <button type="button" className="bt-bt cheio" onClick={mandarParaAnalise} disabled={somenteLeitura || salvando}>
                {salvando ? 'Mandando…' : 'Mandar para a análise'}
              </button>
            )}
          </div>

          {/* LEMBRETES DO CASO (30/09/2026): o do robô nasce do documento que falta
              aqui no checklist e fecha sozinho quando ele chega. Com o tomador já
              cadastrado, mostra também os lembretes da ficha dele. */}
          <div className="bt-bloco">
            <Lembretes casoId={id} tomadorId={caso.tomador_id} titulo="Lembretes" />
          </div>

          {/* O e-mail que abriu o caso: é onde moram corretora, produto e condições.
              O assunto vai aqui, como citação do e-mail, e não mais no título:
              ele vem em caixa alta do remetente e não é o nome de ninguém. */}
          <div className="bt-bloco bt-email">
            <button type="button" className="bt-abre" onClick={() => setVerCorpo((v) => !v)} aria-expanded={verCorpo}
              disabled={!caso.corpo}>
              O e-mail que abriu o caso
              {caso.corpo && <small>{verCorpo ? 'Esconder o texto' : 'Ler o texto'}</small>}
            </button>
            <dl style={{ marginTop: 10 }}>
              <dt>Assunto</dt><dd>{caso.assunto}</dd>
              {(caso.remetente_nome || caso.remetente_email) && (
                <><dt>De</dt><dd>{caso.remetente_nome ?? ''}{caso.remetente_email ? ` (${caso.remetente_email})` : ''}</dd></>
              )}
              {caso.recebido_em && <><dt>Recebido</dt><dd>{fmtData(caso.recebido_em)}</dd></>}
            </dl>
            {verCorpo && caso.corpo && <pre>{caso.corpo}</pre>}
          </div>
        </div>
      </div>
    </div>
  )
}
