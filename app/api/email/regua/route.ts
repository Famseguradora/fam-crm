// ============================================================================
//  POST /api/email/regua  ·  grava uma VERSÃO NOVA da régua do e-mail
//
//  Não existe "editar a régua": existe gravar a próxima versão, inteira, com
//  motivo. A versão velha fica, e continua julgando os e-mails que chegaram
//  enquanto ela valia (ver lib/email/regua.ts e a migration
//  supabase-migration-carteiro-gerencial.sql).
//
//  Três travas, e as três moram também no banco:
//    · só o proprietário grava (RLS `email_regua_nova_versao`)
//    · a versão tem que ser a próxima da que a pessoa estava vendo (gatilho):
//      duas abas abertas não gravam duas "versão 3" por cima uma da outra
//    · o mesmo validador da tela (`validarParametros`): régua que cita
//      modalidade que não existe é regra que nunca dispara
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { diferencas, validarParametros, type ParametrosRegua } from '@/lib/email/regua'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const { data: quem } = await supabase
    .from('usuarios').select('nome, proprietario').eq('auth_id', user.id).maybeSingle()
  if (!quem?.proprietario) {
    return NextResponse.json({ erro: 'Só o proprietário muda a régua. Todos veem, e cada versão diz quem mudou.' }, { status: 403 })
  }

  let corpo: Record<string, unknown> = {}
  try { corpo = await req.json() } catch { /* cai na validação */ }

  const motivo = String(corpo.motivo ?? '').trim()
  if (motivo.length < 3) {
    return NextResponse.json({ erro: 'Diga em uma frase por que a régua mudou. É o que o histórico vai mostrar.' }, { status: 422 })
  }
  if (motivo.length > 500) return NextResponse.json({ erro: 'O motivo passa de 500 caracteres.' }, { status: 422 })

  const base = Number(corpo.versao_base)
  if (!Number.isInteger(base) || base < 0) {
    return NextResponse.json({ erro: 'Falta dizer sobre qual versão a mudança foi feita.' }, { status: 422 })
  }

  const { data: mods, error: erroMods } = await supabase.from('modalidades').select('nome')
  if (erroMods) return NextResponse.json({ erro: erroMods.message }, { status: 500 })
  const nomes = [...new Set((mods ?? []).map((m) => String(m.nome)))]

  const validacao = validarParametros(corpo.parametros, nomes)
  if (!validacao.ok) return NextResponse.json({ erro: validacao.erros.join(' '), erros: validacao.erros }, { status: 422 })

  /* "Nada mudou" não vira versão: um histórico com dez versões iguais esconde
     a única que importa. */
  const { data: anterior } = await supabase
    .from('email_regua').select('versao, parametros').order('versao', { ascending: false }).limit(1).maybeSingle()
  if (anterior && anterior.versao !== base) {
    return NextResponse.json(
      { erro: `A régua mudou enquanto você editava: agora está na versão ${anterior.versao}. Recarregue e refaça a mudança em cima dela.` },
      { status: 409 },
    )
  }
  const mudancas = diferencas((anterior?.parametros as ParametrosRegua) ?? null, validacao.parametros)
  if (anterior && !mudancas.length) {
    return NextResponse.json({ erro: 'Nada mudou em relação à versão atual.' }, { status: 422 })
  }

  const { data, error } = await supabase
    .from('email_regua')
    .insert({
      versao: base + 1,
      parametros: validacao.parametros,
      motivo,
      criada_por_auth_id: user.id,
      criada_por_nome: quem.nome ?? user.email ?? null,
    })
    .select('versao, criada_em')
    .single()

  if (error) {
    if (error.code === '40001') return NextResponse.json({ erro: error.message }, { status: 409 })
    if (error.code === '42501') return NextResponse.json({ erro: 'O banco recusou: só o proprietário grava a régua.' }, { status: 403 })
    return NextResponse.json({ erro: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, versao: data.versao, criada_em: data.criada_em, mudancas })
}
