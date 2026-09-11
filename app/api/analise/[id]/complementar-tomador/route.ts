// ============================================================================
//  POST /api/analise/<id>/complementar-tomador
//  "Após o passo da análise de crédito e EU EDITAR E SALVAR, a análise de
//  crédito deve ser salva complementando o tomador" (Marco, 10/09/2026).
//
//  Quem chama é o editor da análise, a cada campo salvo. É idempotente: chamar
//  duas vezes não muda nada na segunda.
//
//  AS DUAS REGRAS DELE, de 29/08/2026 (memória `limite-vem-da-analise...`):
//    · o limite VEM da análise: tomador sem limite recebe o recomendado
//    · "às vezes já está preenchido pelo cadastro básico": com limite
//      diferente já gravado, NADA é sobrescrito; os dois valores vão para a
//      Conferência (`analise_conflitos`) e ele decide
//  CNAE e capital entram só onde o cadastro está vazio. `status` nunca.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { complementarTomador } from '@/lib/tomador/complementar'

export const runtime = 'nodejs'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const { data: a } = await supabase
    .from('analises')
    .select('id, tomador_id, cnpj, limite_recomendado_num, limite_recomendado_motivo, identificacao')
    .eq('id', id)
    .maybeSingle()
  if (!a) return NextResponse.json({ erro: 'Análise não encontrada.' }, { status: 404 })

  let tomadorId = a.tomador_id as string | null
  if (!tomadorId) {
    const cnpj = String(a.cnpj ?? '').replace(/\D/g, '')
    if (cnpj.length === 14) {
      const { data: t } = await supabase.from('tomadores').select('id').eq('cnpj', cnpj).maybeSingle()
      tomadorId = t?.id ?? null
    }
  }
  if (!tomadorId) return NextResponse.json({ ok: true, sem_tomador: true, preenchidos: [] })

  const ident = (a.identificacao ?? {}) as Record<string, unknown>
  const comp = await complementarTomador(supabase, tomadorId, {
    cnae: typeof ident.cnae === 'string' ? ident.cnae : null,
    capital_social: typeof ident.capital === 'string' || typeof ident.capital === 'number' ? (ident.capital as never) : null,
  })
  const preenchidos = [...comp.preenchidos]
  let conflito: string | null = null

  // ── o limite ────────────────────────────────────────────────────────────
  const rec = typeof a.limite_recomendado_num === 'number' ? a.limite_recomendado_num : Number(a.limite_recomendado_num)
  // Limite anulado (`limite_recomendado_motivo`) é número que a tela esconde:
  // não pode virar limite aprovado por baixo.
  if (Number.isFinite(rec) && rec > 0 && !a.limite_recomendado_motivo) {
    const { data: t } = await supabase.from('tomadores').select('limite_aprovado').eq('id', tomadorId).maybeSingle()
    const ap = t?.limite_aprovado === null || t?.limite_aprovado === undefined ? null : Number(t.limite_aprovado)

    if (ap === null || ap === 0) {
      const { data: gravou } = await supabase.from('tomadores').update({ limite_aprovado: rec }).eq('id', tomadorId).select('id')
      if (gravou?.length) preenchidos.push('limite_aprovado')
    } else if (Math.abs(ap - rec) > 0.01) {
      // A Conferência é de todos e a escrita nela é do servidor (sem policy de insert).
      const admin = await createAdminClient()
      const chave = `limite_divergente|${a.id}|${tomadorId}|limite_aprovado`
      const linha = {
        tipo: 'limite_divergente', analise_id: a.id, tomador_id: tomadorId, campo: 'limite_aprovado',
        valor_crm: brl(ap), valor_analise: brl(rec), sugestao: null, candidatos: null,
        motivo: ap > rec
          ? 'Ao salvar a análise, o limite aprovado do tomador ficou MAIOR que o recomendado. Pode ser decisão de comitê. Nada foi trocado: confira.'
          : 'Ao salvar a análise, o limite aprovado do tomador ficou menor que o recomendado. Pode ser corte deliberado. Nada foi trocado: confira.',
        situacao: 'aberto', chave, carga_em: new Date().toISOString(),
      }
      const { data: existe } = await admin.from('analise_conflitos').select('id, situacao').eq('chave', chave).maybeSingle()
      // Conflito que ele já decidiu não reabre sozinho a cada campo salvo.
      if (!existe) await admin.from('analise_conflitos').insert(linha)
      else if (existe.situacao === 'aberto') await admin.from('analise_conflitos').update(linha).eq('id', existe.id)
      conflito = `O tomador já tem limite de ${brl(ap)} e a análise recomenda ${brl(rec)}. Os dois estão na Conferência.`
    }
  }

  // Liga a análise ao tomador achado pelo CNPJ, se ainda não estava ligada.
  if (!a.tomador_id) await supabase.from('analises').update({ tomador_id: tomadorId }).eq('id', a.id)

  return NextResponse.json({ ok: true, tomador_id: tomadorId, preenchidos, conflito, aviso: comp.ok ? null : comp.erro })
}
