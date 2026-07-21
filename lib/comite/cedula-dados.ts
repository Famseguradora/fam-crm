// ============================================================================
//  Cédula — montagem do dossiê completo que o diretor vê no celular
//
//  Reproduz, com os MESMOS números, as quatro abas do card de Comitê do CRM:
//    📐 Cálculo   → demonstração + simulação de cenário
//    📊 Resultado → impacto sobre a meta mensal e anual
//    ⚡ Dados     → operação, tomador, corretora e organograma
//    ⚖️ Deliberação → parecer, placar, bancada, voto e comentários
//
//  Roda SÓ no servidor (service-role): o diretor não tem sessão no CRM, então
//  nada aqui pode ser buscado pelo browser.
// ============================================================================
import { adminClient } from '@/lib/comite/convites'
import { anosVig, vigenciaTxt, calcularCenario, calcularImpacto, COMISSAO_PADRAO } from '@/lib/comite/calculo'
import { montarArvore, extrairDiretores, contarSocios } from '@/lib/relatorio-socios'
import { fmtMoeda, fmtPercent, maskCNPJ, maskCEP, maskTelefone, fmtData } from '@/lib/utils'
import type { Operacao, Tomador, Socio, Corretora } from '@/types'

// ── O que a cédula recebe, já formatado (o client não recalcula nada) ───────

export interface CampoExibido {
  rotulo: string
  valor: string
}

export interface BlocoCalculo {
  lmg: string
  taxa: string
  vigencia: string
  premioPrevisto: string
  corretora: string
  estado: string
  dataEntrada: string
  // Números crus para o simulador interativo da cédula.
  lmgNum: number
  taxaNum: number
  anosNum: number
  comissaoPadrao: number
  cenarioPadrao: { premio: string; comissao: string; liquidoFAM: string; taxaLiquida: string }
}

export interface BlocoMeta {
  titulo: string
  temMeta: boolean
  meta: string
  realizado: string
  pctAtual: number
  pctNovo: number
  pctOperacao: number
  novoPatamar: string
  contribuicao: string
  gap: string
  temGap: boolean
  opsParaFechar: number
  ticketMedio: string
}

export interface BlocoDados {
  operacao: CampoExibido[]
  observacaoOperacao: string | null
  tomador: CampoExibido[]
  contato: CampoExibido[]
  endereco: CampoExibido[]
  observacaoTomador: string | null
  corretora: CampoExibido[]
  organograma: {
    tomadorNome: string
    tomadorDoc: string | null
    nSocios: number
    nDiretores: number
    // Árvore achatada em lista indentada — hierarquia legível no celular.
    linhas: { nome: string; doc: string; pct: string | null; nivel: number; ehPJ: boolean }[]
    diretores: { nome: string; cargo: string | null; doc: string }[]
  }
}

export interface ComentarioExibido {
  id: string
  autor: string
  cargo: string | null
  comentario: string
  quando: string
  ehMeu: boolean
}

export interface DossieCedula {
  calculo: BlocoCalculo
  metaMensal: BlocoMeta
  metaAnual: BlocoMeta
  dados: BlocoDados
}

// Mesma regra de fmtDocumentoSocio (lib/relatorio-socios), replicada aqui para
// não importar o módulo inteiro no servidor.
function docSocio(documento: string | null | undefined, tipo: string | null | undefined): string {
  const d = (documento ?? '').replace(/\D/g, '')
  if (!d) return '—'
  const ehPJ = tipo === 'PJ' || (tipo == null && d.length > 11)
  return ehPJ ? maskCNPJ(d) : d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

function ehPessoaJuridica(s: Socio): boolean {
  return s.tipo_pessoa === 'PJ' || (s.tipo_pessoa == null && (s.documento ?? '').replace(/\D/g, '').length > 11)
}

// Achata a árvore de sócios em lista indentada (pré-ordem), preservando o nível.
function achatar(
  nodes: ReturnType<typeof montarArvore>,
  nivel = 0,
  acc: BlocoDados['organograma']['linhas'] = [],
): BlocoDados['organograma']['linhas'] {
  for (const n of nodes) {
    acc.push({
      nome: n.nome_razao_social,
      doc: docSocio(n.documento, n.tipo_pessoa),
      pct: n.percentual != null ? `${Number(n.percentual).toLocaleString('pt-BR')}%` : null,
      nivel,
      ehPJ: ehPessoaJuridica(n),
    })
    achatar(n.filhos, nivel + 1, acc)
  }
  return acc
}

function campo(rotulo: string, valor: string | number | null | undefined): CampoExibido | null {
  if (valor === null || valor === undefined || valor === '' || valor === '—') return null
  return { rotulo, valor: String(valor) }
}

function limpar(campos: (CampoExibido | null)[]): CampoExibido[] {
  return campos.filter((c): c is CampoExibido => c !== null)
}

// ── Montagem ────────────────────────────────────────────────────────────────

export async function montarDossie(op: Operacao, usuarioId: string | null): Promise<DossieCedula> {
  const supabase = adminClient()

  const agora = new Date()
  const periodoMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
  const periodoAno = `${agora.getFullYear()}`

  const [
    { data: tomador },
    { data: socios },
    { data: corretora },
    { data: metas },
    { data: emitidas },
  ] = await Promise.all([
    op.tomador_id
      ? supabase.from('tomadores').select('*, corretora:corretoras(id,razao_social,nome_fantasia)').eq('id', op.tomador_id).maybeSingle()
      : Promise.resolve({ data: null }),
    op.tomador_id
      ? supabase.from('socios').select('*').eq('tomador_id', op.tomador_id).eq('ativo', true).order('ordem')
      : Promise.resolve({ data: [] }),
    op.corretora_id
      ? supabase.from('corretoras').select('*').eq('id', op.corretora_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('metas_negocio').select('*').in('periodo', [periodoMes, periodoAno]),
    // Realizado = operações EMITIDAS (modo 'emitidas', o default do CRM).
    supabase.from('operacoes').select('premio_previsto, data_emissao, status').eq('ativo', true).eq('status', 'Emitido'),
  ])

  const tom = tomador as Tomador | null
  const cor = (corretora as Corretora | null) ?? null
  const listaSocios = (socios ?? []) as Socio[]

  // ── 📐 Cálculo ────────────────────────────────────────────────────────────
  const lmg = op.lmg ?? 0
  const taxa = op.taxa ?? 0
  const anos = anosVig(op)
  const cenario = calcularCenario({ lmg, taxa, anos, comissaoPct: COMISSAO_PADRAO })

  const corretoraNome =
    op.corretora?.nome_fantasia ?? op.corretora?.razao_social ??
    cor?.nome_fantasia ?? cor?.razao_social ??
    tom?.corretora?.nome_fantasia ?? tom?.corretora?.razao_social ?? '—'

  const calculo: BlocoCalculo = {
    lmg: lmg ? fmtMoeda(lmg) : '—',
    taxa: taxa ? fmtPercent(taxa / 100) : '—',
    vigencia: vigenciaTxt(op),
    premioPrevisto: op.premio_previsto ? fmtMoeda(op.premio_previsto) : '—',
    corretora: corretoraNome,
    estado: op.estado ?? '—',
    dataEntrada: op.data_entrada ? fmtData(op.data_entrada) : '—',
    lmgNum: lmg,
    taxaNum: taxa,
    anosNum: anos,
    comissaoPadrao: COMISSAO_PADRAO,
    cenarioPadrao: {
      premio: fmtMoeda(cenario.premio),
      comissao: fmtMoeda(cenario.comissao),
      liquidoFAM: fmtMoeda(cenario.liquidoFAM),
      taxaLiquida: fmtPercent(cenario.taxaLiquida / 100),
    },
  }

  // ── 📊 Resultado ──────────────────────────────────────────────────────────
  const listaMetas = (metas ?? []) as { periodo: string; tipo: string; premio_meta: number | null }[]
  const metaM = listaMetas.find((m) => m.tipo === 'mensal' && m.periodo === periodoMes)?.premio_meta ?? 0
  const metaA = listaMetas.find((m) => m.tipo === 'anual' && m.periodo === periodoAno)?.premio_meta ?? 0

  const ops = (emitidas ?? []) as { premio_previsto: number | null; data_emissao: string | null }[]
  const realizadoMes = ops
    .filter((o) => (o.data_emissao ?? '').startsWith(periodoMes))
    .reduce((s, o) => s + (o.premio_previsto ?? 0), 0)
  const realizadoAno = ops
    .filter((o) => (o.data_emissao ?? '').startsWith(periodoAno))
    .reduce((s, o) => s + (o.premio_previsto ?? 0), 0)
  const totalBook = ops.reduce((s, o) => s + (o.premio_previsto ?? 0), 0)
  const ticketMedio = ops.length > 0 ? totalBook / ops.length : 0

  // O prêmio que entra no impacto é o do CENÁRIO (lmg × taxa × anos), igual ao
  // CRM — e não `premio_previsto`. Os dois divergem quando o gravado ficou
  // desatualizado; o CRM mostra o calculado, então a cédula mostra o mesmo.
  const premioImpacto = cenario.premio

  function bloco(titulo: string, meta: number, realizado: number): BlocoMeta {
    const i = calcularImpacto(meta, realizado, premioImpacto, ticketMedio)
    return {
      titulo,
      temMeta: meta > 0,
      meta: fmtMoeda(i.meta),
      realizado: fmtMoeda(i.realizado),
      pctAtual: i.pctAtual,
      pctNovo: i.pctNovo,
      pctOperacao: i.pctOperacao,
      novoPatamar: fmtMoeda(i.novoPatamar),
      contribuicao: fmtMoeda(premioImpacto),
      gap: fmtMoeda(i.gap),
      temGap: i.gap > 0,
      opsParaFechar: i.opsParaFechar,
      ticketMedio: fmtMoeda(ticketMedio),
    }
  }

  // ── ⚡ Dados ──────────────────────────────────────────────────────────────
  const arvore = montarArvore(listaSocios)
  const diretoresSocios = extrairDiretores(listaSocios)
  const tomNome = tom?.razao_social ?? op.tomador?.razao_social ?? '—'
  const tomCnpj = tom?.cnpj ?? op.tomador?.cnpj ?? null

  const enderecoTom = tom
    ? [tom.endereco, tom.numero ? `nº ${tom.numero}` : null, tom.complemento, tom.bairro].filter(Boolean).join(', ')
    : ''
  const cidadeUfTom = tom ? [tom.cidade, tom.estado].filter(Boolean).join('/') : ''

  const enderecoCor = cor
    ? [cor.endereco, cor.numero ? `nº ${cor.numero}` : null, cor.complemento, cor.bairro].filter(Boolean).join(', ')
    : ''
  const cidadeUfCor = cor ? [cor.cidade, cor.estado].filter(Boolean).join('/') : ''

  const dados: BlocoDados = {
    operacao: limpar([
      campo('Produto', op.produto?.nome),
      campo('Modalidade', op.modalidade),
      campo('Código da Cobertura', op.codigo_cobertura),
      campo('Estado (risco)', op.estado),
      campo('LMG (Limite Máximo de Garantia)', lmg ? fmtMoeda(lmg) : null),
      campo('Taxa', taxa ? fmtPercent(taxa / 100) : null),
      campo('Vigência', vigenciaTxt(op)),
      campo('Prêmio Previsto', op.premio_previsto ? fmtMoeda(op.premio_previsto) : null),
      campo('Temperatura', op.temperatura),
      campo('Prioridade da Operação', op.prioridade),
      campo('Data de Entrada', op.data_entrada ? fmtData(op.data_entrada) : null),
      campo('Data de Emissão', op.data_emissao ? fmtData(op.data_emissao) : null),
    ]),
    observacaoOperacao: op.observacao ?? null,
    tomador: limpar([
      campo('Razão Social', tomNome),
      campo('CNPJ', tomCnpj ? maskCNPJ(tomCnpj) : null),
      campo('Nome Fantasia', tom?.nome_fantasia),
      campo('Porte', tom?.porte ?? op.tomador?.porte),
      campo('Status do Tomador', tom?.status),
      campo('Limite Aprovado', tom?.limite_aprovado != null ? fmtMoeda(tom.limite_aprovado) : null),
      campo('Prioridade do Tomador', tom?.prioridade),
      campo('Data de Entrada (cadastro)', tom?.data_entrada ? fmtData(tom.data_entrada) : null),
    ]),
    contato: limpar([
      campo('Responsável', tom?.responsavel),
      campo('E-mail', tom?.email),
      campo('Telefone', tom?.telefone ? maskTelefone(tom.telefone) : null),
      campo('Celular', tom?.celular ? maskTelefone(tom.celular) : null),
    ]),
    endereco: limpar([
      campo('Logradouro', enderecoTom),
      campo('Cidade/UF', cidadeUfTom),
      campo('CEP', tom?.cep ? maskCEP(tom.cep) : null),
    ]),
    observacaoTomador: tom?.observacao ?? null,
    // A tela do CRM mostra só o NOME da corretora. Aqui o diretor vê o cadastro
    // — foi pedido explicitamente ("assim como do corretor também").
    corretora: limpar([
      campo('Razão Social', cor?.razao_social ?? corretoraNome),
      campo('Nome Fantasia', cor?.nome_fantasia),
      campo('CNPJ', cor?.cnpj ? maskCNPJ(cor.cnpj) : null),
      campo('Código SUSEP', cor?.codigo_susep),
      campo('Status', cor?.status),
      campo('Responsável', cor?.responsavel),
      campo('E-mail', cor?.email),
      campo('Telefone', cor?.telefone ? maskTelefone(cor.telefone) : null),
      campo('Celular', cor?.celular ? maskTelefone(cor.celular) : null),
      campo('Endereço', enderecoCor),
      campo('Cidade/UF', cidadeUfCor),
      campo('CEP', cor?.cep ? maskCEP(cor.cep) : null),
    ]),
    organograma: {
      tomadorNome: tomNome,
      tomadorDoc: tomCnpj ? maskCNPJ(tomCnpj) : null,
      nSocios: contarSocios(arvore),
      nDiretores: diretoresSocios.length,
      linhas: achatar(arvore),
      diretores: diretoresSocios.map((d) => ({
        nome: d.nome_razao_social,
        cargo: d.cargo ?? null,
        doc: docSocio(d.documento, d.tipo_pessoa),
      })),
    },
  }

  void usuarioId // reservado: destaque de "meu" conteúdo em blocos futuros

  return {
    calculo,
    metaMensal: bloco('Meta Mensal', metaM, realizadoMes),
    metaAnual: bloco('Meta Anual', metaA, realizadoAno),
    dados,
  }
}

// Comentários da operação, prontos para exibir.
export async function carregarComentarios(
  operacaoId: string,
  usuarioId: string | null,
): Promise<ComentarioExibido[]> {
  const { data } = await adminClient()
    .from('comite_comentarios')
    .select('*')
    .eq('operacao_id', operacaoId)
    .order('created_at', { ascending: true })

  return ((data ?? []) as {
    id: string; autor: string; cargo: string | null; comentario: string
    created_at: string; usuario_id: string | null
  }[]).map((c) => ({
    id: c.id,
    autor: c.autor,
    cargo: c.cargo ?? null,
    comentario: c.comentario,
    quando: new Date(c.created_at).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }),
    ehMeu: !!usuarioId && c.usuario_id === usuarioId,
  }))
}
