// ============================================================================
//  /api/agentes/esteira  ·  o botão "Agente Esteira" do topo da Análise
//
//  Ordem do Marco em 10/09/2026: "tudo que eu tiver que clicar, você tem que
//  inserir dentro do sistema: um botão". Era o PARAR AGENTES.cmd seguido do
//  agentes.vbs, toda vez que o código da Esteira mudava.
//
//     GET   está de pé? e está rodando o código de hoje ou um mais velho?
//     POST  liga; se já estiver de pé, reinicia (é o "atualizar")
//
//  "DESATUALIZADA" é medido, e não suposto: o processo nasceu antes da última
//  gravação do `scripts/esteira.mjs`. Foi exatamente o que aconteceu em
//  10/09/2026: a esteira automática estava pronta e a Esteira de pé desde as
//  14h42 rodava o código de antes.
//
//  Mesmas travas do Carteiro: sessão + proprietário, e só na máquina local.
//  REINICIAR NÃO DERRUBA ANÁLISE: a análise roda no executar.ps1 do Sistema de
//  Análise, que não é filho deste processo.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@/lib/supabase/server'
import { ehMaquinaLocal, processosDoScript, pararProcessos, ligarScript, caudaDe } from '@/lib/agentes/processo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RAIZ = process.cwd()
const SCRIPT = path.join(RAIZ, 'scripts', 'esteira.mjs')
const LOG = path.join(RAIZ, 'esteira.log')

async function quemPede() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 }) }
  const { data: eu } = await supabase.from('usuarios').select('nome, proprietario').eq('auth_id', user.id).maybeSingle()
  return { nome: (eu?.nome as string | null) ?? user.email ?? 'alguém', proprietario: !!eu?.proprietario }
}

const codigoDesde = () => { try { return fs.statSync(SCRIPT).mtime.toISOString() } catch { return null } }
const velho = (desde: string | null) => {
  const cod = codigoDesde()
  return !!desde && !!cod && new Date(desde).getTime() < new Date(cod).getTime()
}

export async function GET() {
  const q = await quemPede()
  if ('erro' in q) return q.erro
  const local = ehMaquinaLocal(SCRIPT)
  if (!local || !q.proprietario) return NextResponse.json({ pode_ligar: false, local })

  const de_pe = await processosDoScript('esteira.mjs')
  return NextResponse.json({
    pode_ligar: true, local: true,
    rodando: de_pe.length > 0,
    desde: de_pe[0]?.desde ?? null,
    quantos: de_pe.length,
    desatualizada: de_pe.some((p) => velho(p.desde)),
  })
}

export async function POST(req: NextRequest) {
  const q = await quemPede()
  if ('erro' in q) return q.erro
  if (!ehMaquinaLocal(SCRIPT)) {
    return NextResponse.json(
      { erro: 'A Esteira roda no notebook do Marco, ao lado do motor da análise. Abra o CRM pelo localhost:3000 nessa máquina.', local: false },
      { status: 409 },
    )
  }
  if (!q.proprietario) {
    return NextResponse.json({ erro: 'Só o proprietário do CRM liga a Esteira: ela roda na máquina dele.' }, { status: 403 })
  }

  const corpo = await req.json().catch(() => ({})) as { reiniciar?: boolean }
  const antes = await processosDoScript('esteira.mjs')
  const precisa = antes.length === 0 || !!corpo.reiniciar || antes.length > 1 || antes.some((p) => velho(p.desde))
  if (!precisa) {
    return NextResponse.json({ ok: true, ja_estava: true, rodando: true, desde: antes[0].desde })
  }

  // Uma Esteira só: duas dariam a mesma ordem ao motor duas vezes.
  if (antes.length) {
    await pararProcessos(antes.map((p) => p.pid))
    await new Promise((r) => setTimeout(r, 1500))
  }

  try {
    ligarScript(SCRIPT, RAIZ, LOG, `Agente Esteira ${antes.length ? 'reiniciado' : 'ligado'} pelo CRM (${q.nome})`)
  } catch (e) {
    return NextResponse.json({ erro: `Não consegui ligar a Esteira: ${(e as Error).message}` }, { status: 500 })
  }

  await new Promise((r) => setTimeout(r, 5000))
  const depois = await processosDoScript('esteira.mjs')
  if (!depois.length) {
    return NextResponse.json(
      { erro: 'A Esteira subiu e parou logo em seguida. O motivo está no fim do esteira.log.', log: caudaDe(LOG) },
      { status: 502 },
    )
  }
  return NextResponse.json({ ok: true, reiniciada: antes.length > 0, rodando: true, desde: depois[0].desde })
}
