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
//  A REGRA SAIU DAQUI EM 07/09/2026, e não mudou de comportamento: ela agora
//  mora em `lib/tomador/criar-por-cnpj.ts`, porque a Triagem dentro do CRM passou
//  a precisar exatamente do mesmo cadastro único. Duas cópias divergiriam.
import { createClient } from '@supabase/supabase-js'
import { soDigitos } from '@/lib/analise/cnpj'
import { acharOuCriarTomadorPorCnpj } from '@/lib/tomador/criar-por-cnpj'

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

  const r = await acharOuCriarTomadorPorCnpj(supabase, {
    cnpj,
    razao_social: corpo.razao_social,
    corretora: corpo.corretora,
    origem: 'Cadastro criado pelo Finalizar Analise, a partir da analise de credito',
  })

  if (!r.ok) return Response.json({ erro: r.erro }, { status: r.status })
  if (!r.criado) return Response.json({ ok: true, criado: false, tomador: r.tomador })

  return Response.json({
    ok: true,
    criado: true,
    tomador: r.tomador,
    receita: r.receita,
    corretora_ligada: r.corretora_ligada,
  })
}
