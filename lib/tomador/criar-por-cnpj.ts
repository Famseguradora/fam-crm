// ============================================================================
//  Achar ou criar o tomador POR CNPJ — a regra do cadastro único, num lugar só
//
//  Havia uma porta só para isto (a rota `/api/analise/tomador`, que o motor
//  chama no Finalizar Análise). Com a Triagem entrando no CRM, passou a haver
//  duas, e duas cópias desta regra divergiriam na terceira semana — foi assim
//  que este sistema já teve duas verdades sobre o mesmo tomador mais de uma vez.
//  Então a regra saiu da rota e veio para cá, sem mudar de comportamento.
//
//  O QUE ELA NUNCA FAZ
//  Não altera tomador que já existe. Achou pelo CNPJ, devolve e para.
//  Sobrescrever cadastro que alguém manteve à mão com o que o robô achou é o
//  tipo de dano silencioso que só aparece quando a apólice sai errada.
//
//  E NÃO GRAVA LIMITE. Limite é decisão de crédito e entra pela Conferência ou
//  pela mão dele no Cadastro.
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { consultarCNPJ } from '@/lib/cnpj'
import { casarCorretora } from '@/lib/analise/corretoras.mjs'

export interface TomadorBasico {
  id: string
  razao_social: string
  cnpj: string | null
}

export interface EntradaTomador {
  /** Só dígitos, 14. Quem chama valida antes. */
  cnpj: string
  /** Usada só se a Receita não responder. */
  razao_social?: string
  /** Nome da corretora como veio; casado por nome, sem inventar. */
  corretora?: string
  /** De onde veio este cadastro, para ficar escrito na ficha. */
  origem: string
}

export type ResultadoTomador =
  | { ok: true; criado: false; tomador: TomadorBasico }
  | {
      ok: true
      criado: true
      tomador: TomadorBasico
      receita: { ok: boolean; motivo?: string }
      corretora_ligada: boolean
    }
  | { ok: false; erro: string; status: number }

export async function acharOuCriarTomadorPorCnpj(
  supabase: SupabaseClient,
  entrada: EntradaTomador,
): Promise<ResultadoTomador> {
  const cnpj = entrada.cnpj

  // ── 1. já existe? ─────────────────────────────────────────────────────────
  const { data: achado, error: erroBusca } = await supabase
    .from('tomadores')
    .select('id, razao_social, cnpj')
    .eq('cnpj', cnpj)
    .maybeSingle()

  if (erroBusca) return { ok: false, erro: erroBusca.message, status: 500 }
  if (achado) return { ok: true, criado: false, tomador: achado as TomadorBasico }

  // ── 2. não existe: cadastro completo, começando pela Receita ──────────────
  // A Receita é a melhor fonte para endereço, telefone e razão social oficial,
  // mas é rede: cai, muda de formato, responde devagar. Falhando, o cadastro
  // NASCE ASSIM MESMO com o que já se sabe, e o retorno diz que ela não veio.
  //
  // DUAS TENTATIVAS, e não uma (medido em 31/08/2026): a BrasilAPI devolve 403
  // quando o minuto já teve consultas demais, e o primeiro cadastro criado por
  // esta regra nasceu sem endereço por isso, com a API no ar dois segundos
  // depois. "CNPJ não encontrado" NÃO é tentado de novo: já é definitivo.
  let cartao: Awaited<ReturnType<typeof consultarCNPJ>> | null = null
  let receitaErro: string | null = null
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      cartao = await consultarCNPJ(cnpj)
      receitaErro = null
      break
    } catch (e: unknown) {
      receitaErro = e instanceof Error ? e.message : 'falha na consulta'
      if (/não encontrado/i.test(receitaErro)) break
      if (tentativa < 2) await new Promise((r) => setTimeout(r, 1500))
    }
  }

  const razao = (cartao?.razao_social || entrada.razao_social || '').trim()
  if (!razao) {
    return {
      ok: false,
      erro: 'Sem razão social: a Receita não respondeu e não veio nome apurado.',
      status: 422,
    }
  }

  // A corretora é casada POR NOME, e só quando o nome bate de verdade. Sem par,
  // fica nula: escolher a corretora errada num tomador novo é pior que deixar em
  // branco, porque o vínculo desce para as operações depois. A regra é a de
  // `lib/analise/corretoras.mjs`, a mesma do motor e a mesma da carga (acha 37
  // das 43 grafias do acervo, contra 8 da comparação escrita à mão).
  let corretoraId: string | null = null
  const nomeCorretora = String(entrada.corretora ?? '').trim()
  if (nomeCorretora) {
    const { data: cs } = await supabase
      .from('corretoras')
      .select('id, razao_social, nome_fantasia, cnpj')
      .eq('status', 'ativo')
    corretoraId = casarCorretora(nomeCorretora, cs ?? []).corretora_id
  }

  const novo = {
    razao_social: razao,
    cnpj,
    nome_fantasia: cartao?.nome_fantasia ?? null,
    corretora_id: corretoraId,
    cep: cartao?.cep ?? null,
    endereco: cartao?.endereco ?? null,
    numero: cartao?.numero ?? null,
    complemento: cartao?.complemento ?? null,
    bairro: cartao?.bairro ?? null,
    cidade: cartao?.cidade ?? null,
    estado: cartao?.estado ?? null,
    telefone: cartao?.telefone ?? null,
    email: cartao?.email ?? null,
    data_entrada: new Date().toISOString().slice(0, 10),
    observacao:
      entrada.origem +
      (receitaErro
        ? ' (a Receita não respondeu: confira endereço e contato).'
        : ' e do cartão CNPJ da Receita.'),
  }

  const { data: criado, error: erroCriar } = await supabase
    .from('tomadores')
    .insert(novo)
    .select('id, razao_social, cnpj')
    .single()

  // Escrita barrada por RLS volta sem linha: por isso o teste é pelo que voltou.
  if (erroCriar || !criado) {
    return {
      ok: false,
      erro: erroCriar?.message ?? 'Sem permissão para criar o cadastro do tomador.',
      status: erroCriar ? 500 : 403,
    }
  }

  return {
    ok: true,
    criado: true,
    tomador: criado as TomadorBasico,
    receita: receitaErro ? { ok: false, motivo: receitaErro } : { ok: true },
    corretora_ligada: !!corretoraId,
  }
}
