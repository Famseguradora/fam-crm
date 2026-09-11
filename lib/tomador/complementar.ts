// ============================================================================
//  COMPLETAR O TOMADOR SEM PASSAR POR CIMA DE NINGUÉM  ·  10/09/2026
//
//  Ordem do Marco: "não ter dupla digitação". O que a Receita, o Serasa ou a
//  análise já disseram sobre a empresa entra no cadastro sozinho, e ninguém
//  digita de novo.
//
//  A REGRA É UMA SÓ, e por isso mora aqui e não em cada chamador:
//  CAMPO VAZIO SE PREENCHE, CAMPO PREENCHIDO NÃO SE TOCA. Quem digitou à mão
//  sabe mais do que o robô, e sobrescrever calado é o dano que só aparece
//  quando a apólice sai errada (a mesma regra do `acharOuCriarTomadorPorCnpj`).
//  Divergência de valor já preenchido não é resolvida aqui: vira pergunta para
//  ele (`analise_conflitos`), e quem faz isso é quem chama.
//
//  Nunca escreve `status` nem `limite_aprovado`: status é outro eixo
//  (memória `status-tomador-vs-operacao`) e limite é decisão de crédito.
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CartaoCNPJ } from '@/lib/cnpj'

export interface DadosCadastrais {
  nome_fantasia?: string | null
  cep?: string | null
  endereco?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  estado?: string | null
  telefone?: string | null
  email?: string | null
  cnae?: string | null
  capital_social?: number | null
  situacao_receita?: string | null
  data_abertura?: string | null
}

export interface SocioEntrada {
  nome: string
  documento?: string | null
  tipo?: 'PF' | 'PJ' | null
  percentual?: number | null
  cargo?: string | null
}

const CAMPOS: (keyof DadosCadastrais)[] = [
  'nome_fantasia', 'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'estado',
  'telefone', 'email', 'cnae', 'capital_social', 'situacao_receita', 'data_abertura',
]

const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === ''

/** O cartão da Receita no formato do cadastro. */
export function dadosDoCartao(c: CartaoCNPJ): DadosCadastrais {
  return {
    nome_fantasia: c.nome_fantasia, cep: c.cep, endereco: c.endereco, numero: c.numero,
    complemento: c.complemento, bairro: c.bairro, cidade: c.cidade, estado: c.estado,
    telefone: c.telefone, email: c.email, cnae: c.cnae, capital_social: c.capital_social,
    situacao_receita: c.situacao, data_abertura: c.abertura,
  }
}

export function sociosDoCartao(c: CartaoCNPJ): SocioEntrada[] {
  return c.socios.map((s) => ({ nome: s.nome, documento: s.documento, cargo: s.qualificacao }))
}

/** Limpa o que cada coluna aceita: `estado` é char(2), `data_abertura` é date. */
function normalizar(k: keyof DadosCadastrais, v: unknown): unknown {
  if (vazio(v)) return null
  if (k === 'capital_social') {
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? n : null
  }
  if (k === 'estado') {
    const uf = String(v).trim().toUpperCase()
    return /^[A-Z]{2}$/.test(uf) ? uf : null
  }
  if (k === 'cep') {
    const d = String(v).replace(/\D/g, '')
    return d.length === 8 ? d : null
  }
  if (k === 'data_abertura') {
    const s = String(v).trim()
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (br) return `${br[3]}-${br[2]}-${br[1]}`
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
  }
  return String(v).trim().slice(0, 500)
}

export interface ResultadoComplemento {
  ok: boolean
  erro?: string
  preenchidos: string[]
  socios_incluidos: number
}

export async function complementarTomador(
  supabase: SupabaseClient,
  tomadorId: string,
  dados: DadosCadastrais,
  opcoes: { socios?: SocioEntrada[]; fonte?: 'receita' | 'serasa' | null; receitaConsultada?: boolean } = {},
): Promise<ResultadoComplemento> {
  const { data: atual, error } = await supabase
    .from('tomadores')
    .select(`id, ${CAMPOS.join(', ')}, receita_em, cadastro_fonte`)
    .eq('id', tomadorId)
    .maybeSingle()
  if (error) return { ok: false, erro: error.message, preenchidos: [], socios_incluidos: 0 }
  if (!atual) return { ok: false, erro: 'Tomador não encontrado.', preenchidos: [], socios_incluidos: 0 }

  const linha = atual as unknown as Record<string, unknown>
  const mudanca: Record<string, unknown> = {}
  for (const k of CAMPOS) {
    const novo = normalizar(k, dados[k])
    if (novo !== null && vazio(linha[k])) mudanca[k] = novo
  }
  // A situação na Receita é a única que ENVELHECE: empresa ativa ontem pode estar
  // baixada hoje. Vinda de uma consulta à Receita agora, ela sempre vale.
  if (opcoes.receitaConsultada && !vazio(dados.situacao_receita)) mudanca.situacao_receita = normalizar('situacao_receita', dados.situacao_receita)
  if (opcoes.receitaConsultada) mudanca.receita_em = new Date().toISOString()
  if (opcoes.fonte && vazio(linha.cadastro_fonte)) mudanca.cadastro_fonte = opcoes.fonte

  const preenchidos = Object.keys(mudanca).filter((k) => k !== 'receita_em' && k !== 'cadastro_fonte')
  if (Object.keys(mudanca).length) {
    const { data: gravou, error: e2 } = await supabase.from('tomadores').update(mudanca).eq('id', tomadorId).select('id')
    // Escrita barrada por RLS volta sem linha e sem erro.
    if (e2 || !gravou?.length) {
      return { ok: false, erro: e2?.message ?? 'Sem permissão para completar o cadastro.', preenchidos: [], socios_incluidos: 0 }
    }
  }

  /* SÓCIOS: só entram se o tomador não tem nenhum. Quadro societário montado à
     mão (com a árvore de controladoras do organograma) não é misturado com a
     lista crua da Receita. */
  let socios_incluidos = 0
  const socios = (opcoes.socios ?? []).filter((s) => !vazio(s.nome))
  if (socios.length) {
    const { count } = await supabase.from('socios').select('id', { count: 'exact', head: true }).eq('tomador_id', tomadorId)
    if (!count) {
      const linhas = socios.slice(0, 40).map((s, i) => {
        const doc = String(s.documento ?? '').replace(/[^\d*]/g, '')
        const tipo = s.tipo ?? (doc.replace(/\D/g, '').length === 14 ? 'PJ' : 'PF')
        const cargo = vazio(s.cargo) ? null : String(s.cargo).slice(0, 120)
        const soAdministra = !s.percentual && /diretor|administrador|presidente|conselheiro/i.test(cargo ?? '') && !/s[óo]cio/i.test(cargo ?? '')
        return {
          tomador_id: tomadorId,
          nome_razao_social: String(s.nome).trim().slice(0, 300),
          documento: vazio(s.documento) ? null : String(s.documento).slice(0, 30),
          tipo_pessoa: tipo,
          percentual: typeof s.percentual === 'number' && s.percentual > 0 ? s.percentual : null,
          categoria: soAdministra ? 'diretor' : 'socio',
          cargo,
          ordem: i,
          ativo: true,
        }
      })
      const { data: entrou } = await supabase.from('socios').insert(linhas).select('id')
      socios_incluidos = entrou?.length ?? 0
    }
  }

  return { ok: true, preenchidos, socios_incluidos }
}
