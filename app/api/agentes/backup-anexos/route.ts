// ============================================================================
//  /api/agentes/backup-anexos  ·  o botão "Fazer backup dos documentos"
//
//  Ordem dele em 22/09/2026: "insira um botão no CRM que só eu tenho acesso
//  (proprietário) de fazer backup, assim eu farei o backup quando quiser".
//
//     GET   está rodando? quando foi o último e quanto pesou?
//     POST  dispara. Um de cada vez.
//
//  POR QUE É MANUAL, E NÃO MAIS UMA TAREFA AGENDADA
//  ---------------------------------------------------------------------------
//  O pacote tem 609 MB. Repetir isso três vezes por semana encheria a pasta da
//  FAM de cópias quase idênticas — a duplicação que ele não quer. O backup do
//  BANCO continua automático (Seg/Qua/Sex) e não foi tocado: são coisas
//  diferentes, e o do Supabase não cobre documento nenhum ("Storage objects are
//  not included", escrito na tela de backups dele).
//
//  MESMAS TRAVAS DO CARTEIRO: sessão, proprietário e máquina local. Aqui a
//  máquina importa por um motivo a mais: o destino é a pasta do SharePoint
//  sincronizada NESTE computador. Na Vercel não existe nem a pasta nem o disco.
//
//  DEMORA MINUTOS, ENTÃO NÃO SE ESPERA A RESPOSTA. O POST dispara e volta na
//  hora; quem conta o que está acontecendo é o GET, lendo o backup-anexos.log.
//  Segurar a requisição por oito minutos daria timeout no navegador e deixaria
//  a tela sem saber se funcionou.
// ============================================================================
import { NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@/lib/supabase/server'
import { processosDoScript, ligarScript, caudaDe } from '@/lib/agentes/processo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RAIZ = process.cwd()
const SCRIPT = path.join(RAIZ, 'scripts', 'backup-anexos.mjs')
const LOG = path.join(RAIZ, 'backup-anexos.log')

const PASTA_BACKUP = process.env.FAM_BACKUP_DIR
  || 'C:\\Users\\MarcoDragoneFAMSEGUR\\FAM Seguradora\\FAM SEGURADORA - Documents\\Infraestrutura\\Backup - Dashboard FAM'
const PREFIXO = 'fam-crm-anexos-'

const ehMaquinaLocal = () =>
  !process.env.VERCEL && process.platform === 'win32' && fs.existsSync(SCRIPT)

const rodando = () => processosDoScript('backup-anexos.mjs')

/** O pacote mais recente na pasta da FAM: é o que a tela mostra como "último". */
function ultimoPacote() {
  try {
    const achados = fs.readdirSync(PASTA_BACKUP)
      .filter((f) => f.startsWith(PREFIXO) && f.endsWith('.tar.gz'))
      .map((f) => ({ nome: f, st: fs.statSync(path.join(PASTA_BACKUP, f)) }))
      .sort((a, b) => b.st.mtimeMs - a.st.mtimeMs)
    if (!achados.length) return null
    const { nome, st } = achados[0]
    return {
      nome,
      quando: st.mtime.toISOString(),
      mb: Number((st.size / 1024 / 1024).toFixed(1)),
      pasta: PASTA_BACKUP,
      quantos: achados.length,
    }
  } catch {
    return null
  }
}

async function quemPede() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 }) }
  const { data: eu } = await supabase
    .from('usuarios').select('nome, proprietario').eq('auth_id', user.id).maybeSingle()
  return { nome: (eu?.nome as string | null) ?? user.email ?? 'alguém', proprietario: !!eu?.proprietario }
}

export async function GET() {
  const q = await quemPede()
  if ('erro' in q) return q.erro

  const local = ehMaquinaLocal()
  if (!local || !q.proprietario) return NextResponse.json({ pode: false, local })

  const processos = await rodando()
  return NextResponse.json({
    pode: true,
    local: true,
    rodando: processos.length > 0,
    desde: processos[0]?.desde ?? null,
    ultimo: ultimoPacote(),
    // Só enquanto roda: é o que diz "baixei 300 de 574" em vez de "aguarde".
    log: processos.length ? caudaDe(LOG, 3) : '',
  })
}

export async function POST() {
  const q = await quemPede()
  if ('erro' in q) return q.erro

  if (!ehMaquinaLocal()) {
    return NextResponse.json(
      {
        erro: 'O backup dos documentos grava na pasta da FAM sincronizada no notebook do Marco. Este CRM não está nessa máquina: abra pelo localhost:3000 nela.',
        local: false,
      },
      { status: 409 },
    )
  }
  if (!q.proprietario) {
    return NextResponse.json(
      { erro: 'Só o proprietário do CRM faz o backup dos documentos.' },
      { status: 403 },
    )
  }

  // UM DE CADA VEZ: dois backups juntos disputariam o mesmo arquivo de saída.
  const antes = await rodando()
  if (antes.length) {
    return NextResponse.json({ ok: true, ja_rodando: true, rodando: true, desde: antes[0].desde })
  }

  try {
    ligarScript(SCRIPT, RAIZ, LOG, `Backup dos documentos pedido no CRM (${q.nome})`)
  } catch (e) {
    return NextResponse.json({ erro: `Não consegui iniciar o backup: ${(e as Error).message}` }, { status: 500 })
  }

  /* CONFERIR QUE O PROCESSO SUBIU, e não só que foi disparado. Mesma lição do
     Carteiro: sem isto a tela diria "backup iniciado" para um processo que
     morreu em dois segundos por falta de credencial. */
  await new Promise((r) => setTimeout(r, 3000))
  const depois = await rodando()
  if (!depois.length) {
    return NextResponse.json(
      {
        erro: 'O backup começou e parou logo em seguida. O motivo está no fim do backup-anexos.log.',
        log: caudaDe(LOG, 6),
      },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true, rodando: true, desde: depois[0].desde })
}
