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
import { consultarCNPJ, type CartaoCNPJ } from '@/lib/cnpj'
import { casarCorretora } from '@/lib/analise/corretoras.mjs'
import { complementarTomador, dadosDoCartao, sociosDoCartao, type DadosCadastrais, type SocioEntrada } from '@/lib/tomador/complementar'

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
  /** A corretora já escolhida na lista (ou achada no e-mail): vale mais que o nome. */
  corretora_id?: string | null
  /** De onde veio este cadastro, para ficar escrito na ficha. */
  origem: string
  /** A Receita já consultada por quem chama (o agente de Cadastro), para não
   *  consultar duas vezes. `undefined` = consultar aqui; `null` = não respondeu. */
  cartao?: CartaoCNPJ | null
  receitaErro?: string | null
  /** O que os documentos (Serasa, contrato) dizem, usado quando a Receita falha. */
  reserva?: DadosCadastrais
  socios?: SocioEntrada[]
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
  // A REPETIÇÃO MORA DENTRO DE `consultarCNPJ` desde 09/09/2026 (três tentativas
  // com espera crescente, e 404 sem repetir). O laço que existia aqui virou
  // repetição em cima de repetição: seis chamadas para o mesmo CNPJ, gastando a
  // cota da API pública em dobro. Uma chamada, e quem repete é ela.
  //
  // O QUE ESTAVA REALMENTE ERRADO em 31/08 não era o número de tentativas: era
  // a falta de User-Agent, que fazia a Cloudflare da BrasilAPI recusar TODA
  // chamada de servidor com 403. Por isso "o primeiro cadastro nasceu sem
  // endereço": ele nunca ia nascer com endereço.
  let cartao: CartaoCNPJ | null = null
  let receitaErro: string | null = null
  if (entrada.cartao !== undefined) {
    cartao = entrada.cartao
    receitaErro = cartao ? null : (entrada.receitaErro ?? 'a Receita não respondeu')
  } else {
    try {
      cartao = await consultarCNPJ(cnpj)
    } catch (e: unknown) {
      receitaErro = e instanceof Error ? e.message : 'falha na consulta'
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
  let corretoraId: string | null = entrada.corretora_id ?? null
  const nomeCorretora = String(entrada.corretora ?? '').trim()
  if (!corretoraId && nomeCorretora) {
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

  /* O QUE O INSERT DE CIMA NÃO LEVAVA (10/09/2026): CNAE, capital, situação,
     abertura e os sócios da Receita eram consultados e jogados fora, e alguém
     digitava de novo na Mesa. Sem Receita, entra o que os documentos disseram.
     Falhar aqui não desfaz o cadastro, que já nasceu. */
  try {
    await complementarTomador(supabase, criado.id, cartao ? dadosDoCartao(cartao) : (entrada.reserva ?? {}), {
      socios: cartao ? sociosDoCartao(cartao) : (entrada.socios ?? []),
      fonte: cartao ? 'receita' : entrada.reserva ? 'serasa' : null,
      receitaConsultada: !!cartao,
    })
  } catch { /* o cadastro básico já existe */ }

  return {
    ok: true,
    criado: true,
    tomador: criado as TomadorBasico,
    receita: receitaErro ? { ok: false, motivo: receitaErro } : { ok: true },
    corretora_ligada: !!corretoraId,
  }
}
