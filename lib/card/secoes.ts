// ============================================================================
//  AS SEÇÕES DO CARD DO TOMADOR  ·  fonte única
//
//  Porta para o CRM o miolo da tela "mesa" do protótipo
//  (`prototipo/prototipo-crm-fam.html`): as constantes SECOES e ORDEM, e as
//  funções souDaArea / temCentral / podeOficial / pendencias.
//
//  POR QUE ESTE ARQUIVO EXISTE, e não código solto na tela: a Mesa mostra a
//  pendência dentro da seção e o Funil mostra a MESMA pendência no cartão. Se a
//  regra morar nos dois lugares, um dia o cartão vai dizer "travado" e a seção
//  vai deixar concluir. A regra mora aqui, e as duas telas importam.
//
//  A PENDÊNCIA NUNCA É GRAVADA. É sempre calculada do dado real (tomador,
//  operações, documentos, análise), como o `situacaoCadastro()` do motor. Dado
//  derivado que vira coluna é dado que um dia discorda da origem.
// ============================================================================

export type AreaId = 'comercial' | 'cadastro' | 'credito' | 'subscricao' | 'juridico'
export type EstadoSecao = 'dormente' | 'aberta' | 'concluida'
/** A régua do card. "emissao" não é seção: é o fim da linha. */
export type PostoCentral = AreaId | 'emissao'

export interface Area {
  id: AreaId
  nome: string
  /** Ordem na régua. O Jurídico fica fora dela (ordem 0) porque entra a
   *  qualquer momento, por decisão dele em 08/09/2026. */
  ordem: number
  icone: string
  dormente?: boolean
}

/** As cinco seções que nascem juntas em todo card. Espelha o `SECOES` do
 *  protótipo, e a mesma lista está no CHECK de `card_secoes.area`. */
export const AREAS: Area[] = [
  { id: 'comercial', nome: 'Comercial', ordem: 1, icone: '📋' },
  { id: 'cadastro', nome: 'Cadastro e triagem', ordem: 2, icone: '🗃️' },
  { id: 'credito', nome: 'Crédito', ordem: 3, icone: '📈' },
  { id: 'subscricao', nome: 'Subscrição', ordem: 4, icone: '✍️' },
  { id: 'juridico', nome: 'Jurídico', ordem: 0, icone: '⚖️', dormente: true },
]

/** A esteira: por onde a central passa. O Jurídico não está aqui de propósito. */
export const ORDEM: AreaId[] = ['comercial', 'cadastro', 'credito', 'subscricao']
export const REGUA: PostoCentral[] = [...ORDEM, 'emissao']

/** Operações que ainda esperam decisão da Subscrição. Emitida já foi, e morta
 *  (Perdido, Recusado) não espera ninguém. A Mesa e o Funil leem daqui. */
export const ESPERAM_SUBSCRICAO = new Set([
  'Para Analisar', 'Em Análise', 'Minuta Enviada para Corretor', 'Comitê',
])

export function nomeArea(id: string | null | undefined): string {
  if (id === 'emissao') return 'Emissão'
  return AREAS.find(a => a.id === id)?.nome ?? String(id ?? '—')
}

export function proximaArea(id: AreaId): PostoCentral {
  const i = ORDEM.indexOf(id)
  if (i < 0) return 'emissao'
  return ORDEM[i + 1] ?? 'emissao'
}

// ── as peças de dado que a regra precisa ────────────────────────────────────

export interface Secao {
  id: string
  tomador_id: string
  area: AreaId
  estado: EstadoSecao
  texto: string | null
  rascunho: string | null
  rascunho_por: string | null
  rascunho_em: string | null
  campos: Record<string, unknown>
  pendencia_texto: string | null
  concluida_em: string | null
  concluida_por: string | null
  reaberta_em: string | null
  reaberta_por: string | null
  reaberta_motivo: string | null
  paralisa: boolean
  paralisa_motivo: string | null
  paralisa_por: string | null
  paralisa_em: string | null
}

export interface EventoCard {
  id: string
  tomador_id: string
  tipo: 'evento' | 'mensagem' | 'pedido'
  area: string | null
  para_area: string | null
  texto: string
  autor_nome: string | null
  resolvido_em: string | null
  resolvido_por: string | null
  resposta: string | null
  criado_em: string
}

/** Quem está olhando o card. `areas` vem de `usuarios.areas`, e é lista porque
 *  o Crédito acumula o Cadastro (decisão dele em 08/09/2026). */
export interface Quem {
  nome: string
  areas: AreaId[]
  diretoria: boolean
  podeEscrever: boolean
}

/** O que a pendência precisa saber do resto do card. */
export interface DadosDoCard {
  cnpj: string | null
  /** nomes de arquivo que o tomador já tem (anexos + documentos da análise) */
  arquivos: string[]
  /** análise vigente publicada no banco, se houver */
  analise: { recomendacao: string | null; data_analise: string | null } | null
  /** operações que ainda esperam decisão da Subscrição */
  operacoesVivas: { id: string; modalidade: string | null; taxa: number | null; voto: string | null }[]
}

/** O checklist de documentos vem de `caso_item_catalogo`, e não de uma lista
 *  fixa aqui: era isso que ele pedia ao dizer que campo e política têm que ser
 *  configuráveis. `exigencia = 'bloqueia'` trava o concluir; 'sinaliza' só
 *  aparece. */
export interface ItemCatalogo {
  id: string
  nome: string
  exigencia: string
  frase_falta: string | null
  padroes_nome: string[] | null
  ativo: boolean
  ordem: number | null
}

// Mesmo normalizador da busca do Funil: "São" e "sao" têm que casar.
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Um item do checklist está atendido quando algum arquivo do tomador casa com
 *  um dos padrões de nome do catálogo. É a mesma leitura por nome que a triagem
 *  do motor faz. */
export function temItem(item: ItemCatalogo, arquivos: string[]): boolean {
  const padroes = (item.padroes_nome ?? []).map(semAcento)
  if (!padroes.length) return false
  return arquivos.some(a => { const n = semAcento(a); return padroes.some(p => n.includes(p)) })
}

// ── quem escreve o quê ──────────────────────────────────────────────────────

export const souDaArea = (quem: Quem, area: AreaId) => quem.areas.includes(area) || quem.diretoria
export const temCentral = (central: PostoCentral, area: AreaId) => central === area

/** Escrever o registro OFICIAL exige as três coisas juntas: a seção aberta, a
 *  central na área e a pessoa ser da área. Sem uma delas, o que ela escrever
 *  fica como rascunho. */
export function podeOficial(secao: Secao, central: PostoCentral, quem: Quem): boolean {
  if (!quem.podeEscrever) return false
  if (secao.estado !== 'aberta') return false
  return temCentral(central, secao.area) && souDaArea(quem, secao.area)
}

/** O Jurídico não depende da central: ele foi chamado (ou se chamou) e escreve
 *  na própria seção a qualquer momento. Decisão dele em 08/09/2026. */
export function podeEscreverNaSecao(secao: Secao, central: PostoCentral, quem: Quem): boolean {
  if (!quem.podeEscrever || secao.estado === 'concluida') return false
  if (secao.area === 'juridico') return souDaArea(quem, 'juridico') && secao.estado === 'aberta'
  return souDaArea(quem, secao.area)
}

/** Reabrir é do dono da seção ou da diretoria (decisão dele em 08/09/2026). */
export function podeReabrir(secao: Secao, quem: Quem): boolean {
  return quem.podeEscrever && (quem.diretoria || quem.areas.includes(secao.area))
}

/** A seção que está segurando o card. Nasceu para o Jurídico, mas a coluna não
 *  é dele: qualquer área pode ganhar esse poder amanhã. */
export const quemParalisa = (secoes: Secao[]) => secoes.find(s => s.paralisa) ?? null

// ── o que trava o concluir ──────────────────────────────────────────────────

export interface Pendencia {
  txt: string
  /** 'trava' impede concluir; 'avisa' só aparece. */
  peso: 'trava' | 'avisa'
}

export function pendencias(
  area: AreaId,
  secao: Secao,
  card: DadosDoCard,
  catalogo: ItemCatalogo[],
): Pendencia[] {
  const f: Pendencia[] = []
  const campos = secao.campos ?? {}

  if (area === 'comercial') {
    if (!campos['temperatura']) f.push({ txt: 'a temperatura da conta', peso: 'trava' })
    if (!(secao.texto ?? '').trim()) f.push({ txt: 'o registro do comercial', peso: 'trava' })
  }

  if (area === 'cadastro') {
    // O CNPJ é a chave que liga o card à análise: sem ele nada casa depois.
    if (!card.cnpj) f.push({ txt: 'o CNPJ (é a chave que liga o card à análise)', peso: 'trava' })
    catalogo.filter(i => i.ativo).forEach(i => {
      if (!temItem(i, card.arquivos)) {
        f.push({
          txt: i.frase_falta || i.nome.toLowerCase(),
          peso: i.exigencia === 'bloqueia' ? 'trava' : 'avisa',
        })
      }
    })
  }

  if (area === 'credito') {
    // Decisão dele em 08/09/2026: o Crédito conclui com pendência ESCRITA. Por
    // isso aqui nada trava; o que falta vira aviso, e o botão só libera quando
    // a pendência estiver escrita (ver `travaConcluir`).
    if (!card.analise) f.push({ txt: 'a análise publicada no CRM', peso: 'avisa' })
    if (!card.analise?.recomendacao && !campos['recomendacao'])
      f.push({ txt: 'a recomendação', peso: 'avisa' })
    if (!(secao.texto ?? '').trim()) f.push({ txt: 'o parecer de crédito', peso: 'trava' })
  }

  if (area === 'subscricao') {
    if (!card.operacoesVivas.length)
      f.push({ txt: 'uma operação viva para analisar', peso: 'trava' })
    card.operacoesVivas.forEach(o => {
      const nome = o.modalidade || 'operação'
      if (!o.taxa) f.push({ txt: `a taxa da ${nome}`, peso: 'trava' })
      if (!o.voto) f.push({ txt: `o voto da ${nome}`, peso: 'trava' })
    })
  }

  return f
}

/** O que impede a seção de ser concluída AGORA, já considerando a pendência
 *  escrita do Crédito e a paralisação do Jurídico. Devolve o motivo, ou null
 *  quando dá para concluir. */
export function travaConcluir(
  secao: Secao,
  card: DadosDoCard,
  catalogo: ItemCatalogo[],
  quem: Quem,
  central: PostoCentral,
  secoes: Secao[],
): string | null {
  const parada = quemParalisa(secoes)
  if (parada) return `${nomeArea(parada.area)} paralisou o fluxo: ${parada.paralisa_motivo || 'sem motivo escrito'}`

  if (secao.area === 'juridico') return null
  if (!souDaArea(quem, secao.area)) return `só ${nomeArea(secao.area)} (ou a diretoria) conclui esta seção`
  if (!temCentral(central, secao.area)) return `a central está com ${nomeArea(central)}`

  const p = pendencias(secao.area, secao, card, catalogo)
  const travas = p.filter(x => x.peso === 'trava')
  if (travas.length) return `falta ${travas.map(x => x.txt).join(', ')}`

  const avisos = p.filter(x => x.peso === 'avisa')
  if (avisos.length && !(secao.pendencia_texto ?? '').trim())
    return `escreva a pendência: falta ${avisos.map(x => x.txt).join(', ')}`

  return null
}

/** O resumo que o cartão do Funil mostra: em que área o card está e o que
 *  trava. Mesma regra da Mesa, porque vem daqui. */
export function resumoDoCard(
  secoes: Secao[],
  central: PostoCentral,
  card: DadosDoCard,
  catalogo: ItemCatalogo[],
): { area: string; trava: string | null; paralisado: boolean } {
  const parada = quemParalisa(secoes)
  if (parada) {
    return {
      area: nomeArea(central),
      trava: `${nomeArea(parada.area)} paralisou: ${parada.paralisa_motivo || 'sem motivo escrito'}`,
      paralisado: true,
    }
  }
  const atual = secoes.find(s => s.area === central)
  if (!atual) return { area: nomeArea(central), trava: null, paralisado: false }

  const travas = pendencias(atual.area, atual, card, catalogo).filter(p => p.peso === 'trava')
  return {
    area: nomeArea(central),
    trava: travas.length ? `falta ${travas[0].txt}${travas.length > 1 ? ` e mais ${travas.length - 1}` : ''}` : null,
    paralisado: false,
  }
}
