// ============================================================================
//  /api/esteira/abrir-pasta  ·  abrir a pasta do tomador no Explorer
//
//  Pedido do Marco (fase 4 do Carteiro gerencial, 11/09/2026): "a triagem irá
//  abrir a pasta do tomador no meu computador". E no meio da construção: "eu
//  vi que estamos salvando os documentos no banco de dados, faça da forma mais
//  eficiente".
//
//  A FORMA MAIS EFICIENTE: o banco (Storage) é onde os documentos MORAM. A
//  pasta do notebook é a CÓPIA DE TRABALHO que a Esteira baixa uma vez, só
//  quando o motor precisa, e só baixa de novo se o conteúdo mudar (é o
//  `materializar` do scripts/esteira.mjs). Abrir a pasta não baixa nada: abre
//  o que já está no disco. Se ainda não está, a rota diz isso, em vez de baixar
//  por conta própria e criar uma segunda cópia fora do caminho da Esteira.
//
//     GET   este CRM pode abrir pasta? (proprietário, no notebook dele)
//     POST  { id } abre a pasta daquela linha da fila
//
//  Travas: sessão + proprietário + máquina local, igual aos botões dos agentes.
//  O caminho sai do banco e da config da Esteira, nunca do navegador, e tem que
//  ficar DENTRO da raiz das pastas: nenhum "..\" abre outra coisa.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@/lib/supabase/server'
import { ehMaquinaLocal } from '@/lib/agentes/processo'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RAIZ_CRM = process.cwd()
const SCRIPT = path.join(RAIZ_CRM, 'scripts', 'esteira.mjs')
const CONFIG = path.join(RAIZ_CRM, 'scripts', 'esteira.json')

/** A raiz das pastas dos tomadores, lida da config da Esteira (só o campo `raiz`). */
function raizDasPastas(): string | null {
  try {
    const raiz = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))?.raiz
    return raiz ? path.resolve(String(raiz)) : null
  } catch {
    return null
  }
}

async function quemPede() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, erro: NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 }) }
  const { data: eu } = await supabase.from('usuarios').select('proprietario').eq('auth_id', user.id).maybeSingle()
  return { supabase, proprietario: !!eu?.proprietario }
}

export async function GET() {
  const q = await quemPede()
  if ('erro' in q && q.erro) return q.erro
  const pode = !!q.proprietario && ehMaquinaLocal(SCRIPT) && !!raizDasPastas()
  return NextResponse.json({ pode })
}

export async function POST(req: NextRequest) {
  // Uma página aberta em outra porta do localhost não pode mandar abrir pasta.
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa
  const q = await quemPede()
  if ('erro' in q && q.erro) return q.erro

  const corpo = await req.json().catch(() => ({})) as Record<string, unknown>
  const id = String(corpo.id ?? '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ erro: 'Falta dizer qual caso.' }, { status: 422 })
  }
  if (!ehMaquinaLocal(SCRIPT)) {
    return NextResponse.json({ erro: 'A pasta fica no notebook do Marco. Abra o CRM pelo localhost:3000 nessa máquina.', local: false }, { status: 409 })
  }
  if (!q.proprietario) {
    return NextResponse.json({ erro: 'Só o proprietário abre a pasta: ela está no computador dele.' }, { status: 403 })
  }
  const raiz = raizDasPastas()
  if (!raiz) return NextResponse.json({ erro: 'A config da Esteira (scripts/esteira.json) não diz onde ficam as pastas.' }, { status: 500 })

  const { data: fila } = await q.supabase.from('analise_fila').select('pasta, fora_do_disco_em').eq('id', id).maybeSingle()
  if (!fila?.pasta) return NextResponse.json({ erro: 'Esse caso não tem pasta na esteira.' }, { status: 404 })

  const dir = path.resolve(raiz, String(fila.pasta))
  /* O Explorer separa argumento por vírgula: um nome com vírgula pode abrir
     outro destino. Nenhuma pasta de hoje tem vírgula; se um dia tiver, a tela
     diz, e ninguém abre coisa diferente da que clicou. */
  if (dir.includes(',')) {
    return NextResponse.json({ erro: 'O nome desta pasta tem vírgula, e o Explorer não abre com segurança. Abra pela pasta das análises.' }, { status: 422 })
  }
  if (!dir.startsWith(raiz + path.sep)) {
    return NextResponse.json({ erro: 'O nome da pasta aponta para fora da raiz das análises. Nada foi aberto.' }, { status: 422 })
  }
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return NextResponse.json({
      erro: fila.fora_do_disco_em
        ? 'A pasta saiu deste notebook (foi para a rede). Os documentos continuam guardados no CRM.'
        : 'A pasta ainda não está neste notebook. Os documentos estão guardados no CRM; a Esteira baixa a cópia de trabalho na próxima volta.',
    }, { status: 404 })
  }

  // O Explorer devolve código 1 mesmo quando abre: o erro dele não quer dizer nada aqui.
  execFile('explorer.exe', [dir], { windowsHide: false }, () => {})
  return NextResponse.json({ ok: true, pasta: fila.pasta })
}
