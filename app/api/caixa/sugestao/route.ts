// ============================================================================
//  GET /api/caixa/sugestao?id=<email>  ·  "parece ser do caso #N"
//
//  A Caixa pergunta, ao abrir um e-mail que ainda não virou caso, se ele
//  pertence a um caso aberto. A regra é `lib/casos/sugerir-caso.ts`; aqui só
//  se busca o que ela precisa. Nunca junta: devolve candidatos.
//
//  Com `?q=` devolve a busca livre (número do caso ou nome), para a pessoa
//  escolher quando a sugestão não acertou.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recusarCaixaNoAr } from '@/lib/email/so-no-notebook'
import { sugerirCasos, type CasoCandidato } from '@/lib/casos/sugerir-caso'

export const runtime = 'nodejs'

const CAMPOS = 'id, numero, assunto, cnpj, razao_social, etapa'

export async function GET(req: NextRequest) {
  const noAr = recusarCaixaNoAr()
  if (noAr) return noAr
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada.' }, { status: 401 })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q) {
    const numero = Number(q.replace(/^#/, ''))
    let consulta = supabase.from('casos').select(CAMPOS).not('etapa', 'in', '(descartado,encerrado)').order('criado_em', { ascending: false }).limit(8)
    if (Number.isInteger(numero) && numero > 0) consulta = consulta.eq('numero', numero)
    else {
      /* O termo entra num filtro `or()` do PostgREST: vírgula, parêntese,
         aspas e barra mudariam a estrutura do filtro. Viram espaço. */
      const termo = q.replace(/[%_,()"'\\*:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
      if (termo.length < 2) return NextResponse.json({ casos: [] })
      consulta = consulta.or(`razao_social.ilike.%${termo}%,assunto.ilike.%${termo}%`)
    }
    const { data } = await consulta
    return NextResponse.json({ casos: data ?? [] })
  }

  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ erro: 'Falta o e-mail.' }, { status: 422 })
  const { data: email } = await supabase.from('emails_caixa').select('assunto, caso_id').eq('id', id).maybeSingle()
  if (!email || email.caso_id) return NextResponse.json({ sugestoes: [] })

  const { data: casos } = await supabase
    .from('casos').select(CAMPOS)
    .not('etapa', 'in', '(descartado,encerrado)')
    .order('criado_em', { ascending: false })
    .limit(400)

  return NextResponse.json({ sugestoes: sugerirCasos({ assunto: email.assunto }, (casos ?? []) as CasoCandidato[]) })
}
