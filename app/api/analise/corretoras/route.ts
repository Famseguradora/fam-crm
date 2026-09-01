// ============================================================================
//  "Qual é o nome desta corretora aqui dentro?" — `/api/analise/corretoras`
//
//  Ordem dele, em 31/08/2026:
//    "as corretoras já estão cadastradas no CRM, quando a IA identificar a
//     corretora dentro do sistema de análise de crédito, tem que buscar no
//     sistema e cadastrar com o mesmo nome."
//
//  Esta é a parte do "buscar no sistema". O motor da análise roda na máquina
//  dele, longe do banco e sem cookie de login: ele manda os nomes que a IA
//  escreveu e recebe de volta o nome com que a casa chama cada corretora.
//
//     motor local ──POST {nomes}──▶ esta rota ──▶ tabela corretoras
//                 ◀── de-para ─────
//
//  QUEM DECIDE O PAR É UMA REGRA SÓ, e ela mora em `lib/analise/corretoras.mjs`.
//  Aqui não há comparação de texto nenhuma, de propósito: a mesma função é usada
//  pela criação do tomador e pela carga das análises. Escrever a regra em cada
//  porta seria ter três regras e descobrir a divergência pelo nome gravado
//  errado, meses depois.
//
//  O GET existe para o motor guardar a lista inteira e não precisar perguntar a
//  cada análise. O POST é a pergunta pontual.
//
//  A ROTA SÓ LÊ. Ela não cria corretora, não renomeia e não apaga: o cadastro
//  das 98 corretoras é da mesa comercial, e um motor de análise não tem por que
//  poder mexer nele. Sem par, a resposta é "não achei" com o motivo, e o nome
//  cru da análise continua valendo.
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import { casarVarias } from '@/lib/analise/corretoras.mjs'

/** Teto de nomes por pedido: o acervo inteiro tem 43 grafias distintas. */
const TETO_NOMES = 300

interface Pedido {
  nomes?: unknown[]
}

/** Um só lugar cria o cliente, e o tipo dele sai daqui: `ReturnType<typeof
 *  createClient>` sem argumentos não é o mesmo tipo que `createClient(url, chave)`
 *  devolve, e a diferença só aparece ao passar o cliente adiante. */
const abrirCliente = (url: string, chave: string) =>
  createClient(url, chave, { auth: { persistSession: false } })
type Cliente = ReturnType<typeof abrirCliente>

/** As duas rotas precisam da mesma coisa: segredo conferido e cliente pronto. */
function abrir(req: Request) {
  const segredo = process.env.ANALISE_EVENTO_TOKEN
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY

  // Trava ausente fecha a porta, nunca abre: um deploy sem a variável não pode
  // virar uma listagem pública do cadastro comercial.
  if (!segredo || !url || !chave) {
    return { erro: Response.json({ erro: 'Rota não configurada (ANALISE_EVENTO_TOKEN / chaves do Supabase).' }, { status: 503 }) }
  }
  if (req.headers.get('x-analise-token') !== segredo) {
    return { erro: Response.json({ erro: 'Segredo inválido.' }, { status: 401 }) }
  }
  return { supabase: abrirCliente(url, chave) }
}

/** Só as ativas: corretora desativada não deve voltar a aparecer em análise nova. */
async function lerCorretoras(supabase: Cliente) {
  const { data, error } = await supabase
    .from('corretoras')
    .select('id, razao_social, nome_fantasia, cnpj')
    .eq('status', 'ativo')
    .order('razao_social')
  if (error) throw new Error(error.message)
  return data ?? []
}

/** A lista inteira, para o motor guardar em disco e trabalhar mesmo sem o CRM no ar. */
export async function GET(req: Request) {
  const porta = abrir(req)
  if (porta.erro) return porta.erro
  try {
    const lista = await lerCorretoras(porta.supabase)
    return Response.json({ ok: true, total: lista.length, corretoras: lista })
  } catch (e: unknown) {
    return Response.json({ erro: e instanceof Error ? e.message : 'falha ao ler as corretoras' }, { status: 500 })
  }
}

/** O de-para de um punhado de nomes. */
export async function POST(req: Request) {
  const porta = abrir(req)
  if (porta.erro) return porta.erro

  let corpo: Pedido = {}
  try { corpo = await req.json() } catch { /* cai na validação */ }

  const nomes = Array.isArray(corpo.nomes) ? corpo.nomes.slice(0, TETO_NOMES) : null
  if (!nomes || !nomes.length) {
    return Response.json({ erro: 'Mande `nomes`, uma lista de nomes de corretora.' }, { status: 422 })
  }

  try {
    const lista = await lerCorretoras(porta.supabase)
    const de_para = casarVarias(nomes, lista)
    const achou = Object.values(de_para).filter((p) => p.achou).length
    return Response.json({
      ok: true,
      corretoras_no_crm: lista.length,
      perguntados: Object.keys(de_para).length,
      achados: achou,
      de_para,
    })
  } catch (e: unknown) {
    return Response.json({ erro: e instanceof Error ? e.message : 'falha ao casar as corretoras' }, { status: 500 })
  }
}
