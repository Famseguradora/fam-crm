// ============================================================================
//  "Essa análise virou tomador" — `POST /api/analise/tomador`
//
//  Ordem dele, em 31/08/2026, ao desenhar o Finalizar Análise:
//    "se não tiver o CNPJ cadastrado, não precisa ir para conferência, é só
//     realizar o cadastro completo. Faça a busca no site da Receita igual você
//     já colocou. Esse é o processo de cadastro."
//
//  Então esta rota faz UMA coisa, e faz por CNPJ: acha o tomador, ou cria.
//
//  POR QUE ELA MORA NO CRM, e não no motor
//  ---------------------------------------------------------------------------
//  Quem é dono da tabela `tomadores` é o CRM, e é aqui que vivem as regras dele:
//  o CNPJ só dígitos, a consulta à Receita (`lib/cnpj`, a mesma que o botão do
//  Cadastro usa) e o vínculo com a corretora. O motor não precisa saber nada
//  disso: ele manda o CNPJ e recebe de volta o que aconteceu.
//
//  Segue o mesmo cano do `/api/analise/evento`: o motor é um processo Node sem
//  cookie de login, então a porta é um segredo combinado e a escrita é service
//  role. Sem segredo configurado, a rota nasce FECHADA.
//
//  O QUE ELA NUNCA FAZ
//  ---------------------------------------------------------------------------
//  Não altera tomador que já existe. Achou pelo CNPJ, devolve e para. Sobrescrever
//  cadastro que alguém manteve à mão, com o que a análise achou, é o tipo de dano
//  silencioso que ninguém percebe até a apólice sair errada. Quem concilia
//  divergência continua sendo a tela de Conferência.
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import { soDigitos } from '@/lib/analise/cnpj'
import { consultarCNPJ } from '@/lib/cnpj'

interface Pedido {
  cnpj?: string
  /** Razão social apurada pela análise, usada só se a Receita não responder. */
  razao_social?: string
  /** Nome da corretora como a análise a conhece; casado por nome, sem inventar. */
  corretora?: string
}

export async function POST(req: Request) {
  const segredo = process.env.ANALISE_EVENTO_TOKEN
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!segredo || !url || !chave) {
    return Response.json(
      { erro: 'Rota não configurada (ANALISE_EVENTO_TOKEN / chaves do Supabase).' },
      { status: 503 })
  }
  if (req.headers.get('x-analise-token') !== segredo) {
    return Response.json({ erro: 'Segredo inválido.' }, { status: 401 })
  }

  let corpo: Pedido = {}
  try { corpo = await req.json() } catch { /* cai na validação */ }

  // `soDigitos` devolve null quando não veio nada; aqui um vazio já cai na trava
  // de 14 dígitos logo abaixo, que é a única porta.
  const cnpj = soDigitos(corpo.cnpj) ?? ''
  if (cnpj.length !== 14) {
    return Response.json({ erro: 'CNPJ inválido ou ausente.' }, { status: 422 })
  }

  const supabase = createClient(url, chave, { auth: { persistSession: false } })

  // ── 1. já existe? ────────────────────────────────────────────────────────
  const { data: achado, error: erroBusca } = await supabase
    .from('tomadores')
    .select('id, razao_social, cnpj')
    .eq('cnpj', cnpj).maybeSingle()

  if (erroBusca) {
    return Response.json({ erro: erroBusca.message }, { status: 500 })
  }
  if (achado) {
    return Response.json({ ok: true, criado: false, tomador: achado })
  }

  // ── 2. não existe: cadastro completo, começando pela Receita ─────────────
  // A Receita é a melhor fonte para endereço, telefone e razão social oficial.
  // Mas ela é rede: cai, muda de formato, responde devagar. Se falhar, o cadastro
  // NASCE ASSIM MESMO com o que a análise apurou, e a resposta diz que a Receita
  // não veio. Perder o cadastro inteiro porque uma consulta externa piscou seria
  // trocar um problema pequeno por um grande.
  // DUAS TENTATIVAS, e nao uma (medido em 31/08/2026). A BrasilAPI devolve 403
  // quando o minuto ja teve consultas demais, e o primeiro cadastro criado por
  // esta rota nasceu sem endereco por causa disso, com a API perfeitamente no ar
  // dois segundos depois. Uma pausa curta resolve o caso comum sem transformar o
  // botao numa espera longa. "CNPJ nao encontrado" NAO e tentado de novo: a
  // resposta ja e definitiva e repetir so gastaria o tempo dele.
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
      if (tentativa < 2) await new Promise(r => setTimeout(r, 1500))
    }
  }

  const razao = (cartao?.razao_social || corpo.razao_social || '').trim()
  if (!razao) {
    return Response.json(
      { erro: 'Sem razão social: a Receita não respondeu e a análise não mandou nome.' },
      { status: 422 })
  }

  // A corretora é casada POR NOME, e só quando o nome bate de verdade. Sem par,
  // fica nula: escolher a corretora errada num tomador novo é pior que deixar em
  // branco para ele preencher, porque o vínculo desce para as operações depois.
  let corretoraId: string | null = null
  const nomeCorretora = String(corpo.corretora ?? '').trim()
  if (nomeCorretora) {
    const { data: cs } = await supabase
      .from('corretoras').select('id, razao_social, nome_fantasia').eq('status', 'ativo')
    const alvo = nomeCorretora.toLowerCase()
    const bate = (v: string | null) => {
      const s = String(v ?? '').toLowerCase().trim()
      return !!s && (s === alvo || alvo.startsWith(s) || s.startsWith(alvo))
    }
    corretoraId = (cs ?? []).find(c => bate(c.razao_social) || bate(c.nome_fantasia))?.id ?? null
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
    observacao: 'Cadastro criado pelo Finalizar Análise, a partir da análise de crédito'
      + (receitaErro ? ' (a Receita não respondeu: confira endereço e contato).' : ' e do cartão CNPJ da Receita.'),
    // O LIMITE NÃO VEM AQUI, de propósito. Ele é decisão de crédito e sai da tela
    // de Conferência ou da mão dele no Cadastro. Ver `conflitos-analise-vs-crm`:
    // `limite_recomendado` é texto livre e às vezes é um teto, não um valor.
  }

  const { data: criado, error: erroCriar } = await supabase
    .from('tomadores').insert(novo).select('id, razao_social, cnpj').single()

  if (erroCriar) {
    return Response.json({ erro: erroCriar.message }, { status: 500 })
  }

  return Response.json({
    ok: true,
    criado: true,
    tomador: criado,
    receita: receitaErro ? { ok: false, motivo: receitaErro } : { ok: true },
    corretora_ligada: !!corretoraId,
  })
}
