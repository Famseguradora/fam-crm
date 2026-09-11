// ============================================================================
//  GET /api/cnpj/<cnpj>  ·  o cartão CNPJ, pelo servidor e com cache
//
//  Nasceu em 09/09/2026, do defeito que parecia "a API da Receita está errada".
//  Não estava: a BrasilAPI recusa (403) quem chama sem User-Agent, e o `fetch`
//  do Node não manda nenhum. No navegador o Chrome mandava o dele, então o
//  botão "Receita" funcionava e SÓ o cadastro criado pelo servidor nascia sem
//  endereço. Defeito que funciona na tela e falha no fundo é o pior tipo.
//
//  Com esta rota, três coisas passam a valer para todo mundo:
//
//    identidade   uma chamada só da FAM, identificada, em vez de N navegadores
//                 anônimos somando no mesmo limite por IP
//    cache        o mesmo CNPJ consultado três vezes no dia é UMA chamada.
//                 A consulta é cara para quem mantém a API pública, e barata
//                 de repetir sem necessidade: quem digita o CNPJ, corrige um
//                 campo e clica de novo já fazia duas.
//    mensagem     429 vira "tente de novo em alguns segundos", e não um número
//                 de status que ninguém sabe ler
//
//  O CACHE É DE MEMÓRIA, e some quando o servidor reinicia. É de propósito:
//  cartão CNPJ em tabela é mais um lugar onde o dado da empresa envelhece
//  escondido, e o CRM já guarda o que importa na ficha do tomador. Aqui ele só
//  evita a chamada repetida da mesma sessão de trabalho.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { consultarCNPJ, type CartaoCNPJ } from '@/lib/cnpj'

export const runtime = 'nodejs'

const VALE_MS = 6 * 60 * 60 * 1000 // seis horas: um expediente
const TETO = 500                   // teto do cache, para não crescer sem fim

const cache = new Map<string, { em: number; cartao: CartaoCNPJ }>()

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cnpj: string }> }) {
  /* SESSÃO EXIGIDA. A rota é barata, mas é uma porta para fora do CRM: sem
     login, qualquer um na internet usaria a cota da FAM na BrasilAPI. */
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const { cnpj } = await params
  const d = String(cnpj ?? '').replace(/\D/g, '')

  const guardado = cache.get(d)
  if (guardado && Date.now() - guardado.em < VALE_MS) {
    return NextResponse.json({ ok: true, cartao: guardado.cartao, do_cache: true })
  }

  try {
    const cartao = await consultarCNPJ(d)

    // O mais velho sai quando o cache enche. Fila simples, e não LRU: são
    // centenas de linhas, e a diferença não pagaria a complexidade.
    if (cache.size >= TETO) {
      const primeiro = cache.keys().next().value
      if (primeiro) cache.delete(primeiro)
    }
    cache.set(d, { em: Date.now(), cartao })

    return NextResponse.json({ ok: true, cartao, do_cache: false })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Não consegui consultar a Receita agora.'
    /* O status conta o que aconteceu, e a mensagem já vem legível de
       `consultarCNPJ`: CNPJ inválido e "não encontrado" são 422 (o dado está
       errado); o resto é 502 (a fonte falhou, o dado pode estar certo). */
    const status = /inválido|não encontrado/i.test(msg) ? 422 : 502
    return NextResponse.json({ erro: msg }, { status })
  }
}
