// ============================================================
//  A ponte com o Sistema de Análises de Crédito — SÓ LEITURA.
//
//  O motor da análise não é software de servidor: ele chama o Claude da
//  máquina, lê PDF do OneDrive e faz OCR por PowerShell. Por isso ele fica
//  onde está, e o CRM apenas LÊ o que ele já apurou. Nada aqui escreve, nem
//  no sistema nem no banco.
//
//  A chave que liga os dois é o CNPJ, só dígitos: o `paginas` do /api/visao
//  vem indexado exatamente assim. Hoje 97 dos 116 CNPJs analisados casam com
//  um tomador do CRM.
//
//  ⚠ Só funciona na máquina onde o sistema roda (é 127.0.0.1). No CRM
//  publicado o navegador bloqueia endereço local dentro de página segura, e
//  a busca simplesmente devolve `null` — quem chama mostra a ficha sem o
//  bloco, em vez de quebrar.
// ============================================================

/** O servidor de produção do Sistema de Análises. A oficina é a 7312. */
export const SISTEMA = 'http://127.0.0.1:7311'

/** Um par rótulo/valor da ficha: ["Score FAM", "6,9"] ou ["Decisão", "…", "decisao"]. */
export type DadoAnalise = [rotulo: string, valor: string, tipo?: string]

export interface AnaliseDoTomador {
  nome: string
  cnpj: string
  corretora: string
  /** Score FAM, Rating, Decisão, Limite recomendado, Grupo econômico, Última análise. */
  dados: DadoAnalise[]
  /** O id da análise vigente: "08260577000144-2026-08-28". */
  analiseAtual: string | null
  /** Você já revisou esta análise, ou ainda são os números que a máquina gerou? */
  revisada: boolean
  /** "Análise feita, a editar", "Editada por você", "Entregue"… */
  rotuloSituacao: string | null
  pasta: string | null
}

interface PaginaVisao {
  nome?: string
  cnpj?: string
  corretora?: string
  dados?: DadoAnalise[]
  analise_atual?: string | null
  pasta?: string | null
  tempo?: { id?: string; revisada?: boolean; rotulo?: string }[]
}

/** Só os dígitos. "08.260.577/0001-44" e "08260577000144" são a mesma chave. */
export const soDigitos = (cnpj: string | null | undefined) =>
  String(cnpj ?? '').replace(/\D/g, '')

// O /api/visao tem ~600 KB e traz as 120 páginas de uma vez. Buscar por
// tomador seria uma chamada por ficha aberta; buscamos UMA vez e guardamos.
// A promessa é guardada (e não o resultado) para duas fichas abertas juntas
// não dispararem duas buscas.
let cache: Promise<Map<string, PaginaVisao>> | null = null

async function carregarVisao(): Promise<Map<string, PaginaVisao>> {
  const r = await fetch(`${SISTEMA}/api/visao`)
  if (!r.ok) throw new Error('visão indisponível')
  const v = await r.json()
  const mapa = new Map<string, PaginaVisao>()
  for (const [chave, pagina] of Object.entries(v?.paginas ?? {})) {
    mapa.set(soDigitos(chave), pagina as PaginaVisao)
  }
  return mapa
}

/** Esquece o que foi lido. Chamar quando a ficha reabrir depois de uma análise nova. */
export function esquecerCache() {
  cache = null
}

/**
 * TIRA O SELO DE VALOR CONFIRMADO DO QUE VEIO DAQUI.
 *
 * Achado da 5ª auditoria, e é o mesmo furo da Conasa por outra porta. O
 * `/api/visao` do sistema local marca o "Limite recomendado" com a tag
 * `limite`, que na ficha do tomador é verde de valor confirmado, e o texto vai
 * cru: para a Conasa ele devolve, ao vivo, "⇒ R$ 727.192.500,00 (75% do PL
 * consolidado)…", que é exatamente o número que as travas do CRM rejeitaram.
 *
 * Este caminho é RESERVA: só roda quando o banco ainda não tem a análise (uma
 * feita hoje, antes da próxima carga) ou quando a consulta ao Supabase falha.
 * Nos dois casos o valor **não passou por conferência nenhuma**, e por isso não
 * pode usar a cor de quem passou. O número continua visível; o que muda é a
 * promessa que a tela faz sobre ele.
 *
 * Não replico aqui as três travas da carga de propósito: elas vivem em
 * `scripts/carga-analises.mjs` com 97 testes em cima, e uma segunda cópia
 * divergiria com o tempo. Rotular como não conferido é a verdade, e é barato.
 */
function semSelo(dados: DadoAnalise[]): DadoAnalise[] {
  return dados.map(([rotulo, valor, tipo]) =>
    tipo === 'limite'
      ? [rotulo, `${valor} · ainda não conferido pelo CRM`, 'alerta'] as DadoAnalise
      : [rotulo, valor, tipo] as DadoAnalise)
}

/**
 * A análise deste CNPJ, ou `null` se não houver — e também `null` se o sistema
 * não estiver no ar nesta máquina, que é o caso normal fora do computador do
 * Marco. Nunca lança: quem chama não precisa de try/catch.
 */
export async function analiseDoTomador(cnpj: string | null | undefined): Promise<AnaliseDoTomador | null> {
  const chave = soDigitos(cnpj)
  if (chave.length !== 14) return null

  try {
    if (!cache) cache = carregarVisao()
    const mapa = await cache
    const p = mapa.get(chave)
    if (!p || !p.dados?.length) return null

    // A situação vem da linha do tempo, no item da análise vigente.
    const atual = p.analise_atual ?? null
    const doTempo = (p.tempo ?? []).find(t => t.id === atual) ?? (p.tempo ?? [])[0]

    return {
      nome: p.nome ?? '',
      cnpj: p.cnpj ?? '',
      corretora: p.corretora ?? '',
      dados: semSelo(p.dados),
      analiseAtual: atual,
      revisada: !!doTempo?.revisada,
      rotuloSituacao: doTempo?.rotulo ?? null,
      pasta: p.pasta ?? null,
    }
  } catch {
    // Sistema fora do ar, ou CRM aberto de outra máquina. Some o bloco, e a
    // ficha do tomador segue exatamente como era.
    cache = null
    return null
  }
}

/** O endereço que abre a análise completa no sistema. */
export const enderecoDaAnalise = (id: string) => `${SISTEMA}/analise/${encodeURIComponent(id)}`
