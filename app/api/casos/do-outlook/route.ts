// ============================================================================
//  POST /api/casos/do-outlook  ·  arrastou do Novo Outlook, o CRM vai buscar
//
//  23/09/2026, pedido do Marco: "quando algum colega for enviar alguma análise
//  para eu fazer, basta ele arrastar o e-mail para dentro do sistema. Melhor do
//  que ter que salvar e colar".
//
//  COMO FUNCIONA, em três passos:
//    1. o Novo Outlook não entrega o arquivo, mas entrega um bilhete com o
//       IDENTIFICADOR da mensagem e a caixa de onde ela saiu
//       (`lib/email/arrasto-outlook.ts`);
//    2. com o consentimento que a pessoa deu uma vez (`/api/ms/login`), o CRM
//       baixa o e-mail INTEIRO em MIME pelo Microsoft Graph — o mesmo conteúdo
//       de um .eml salvo à mão, com anexos;
//    3. esse conteúdo entra na MESMA regra de sempre
//       (`lib/casos/abrir-por-email.ts`): caso, checklist, anexos e o card na
//       coluna Entrada da Mesa.
//
//  Três estradas agora, e continua uma regra só. Era esse o desenho desde o
//  começo: o que muda é como o e-mail chega, nunca o que acontece com ele.
//
//  A TRAVA É A CAIXA. Só busco e-mail cuja caixa de origem seja a MESMA que a
//  pessoa conectou. O bilhete vem do navegador e pode ser forjado: sem esta
//  conferência, alguém poderia pedir uma mensagem de outra caixa e o Graph —
//  que só conhece o token — responderia se aquele token tivesse acesso.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'
import { baixarMIME } from '@/lib/ms/graph'
import { acessoDaPessoa } from '@/lib/ms/acesso'
import { lerArrastoDoOutlook, MAX_BYTES_ARRASTO } from '@/lib/email/arrasto-outlook'
import { abrirCasoPorEmail } from '@/lib/casos/abrir-por-email'

export const runtime = 'nodejs'
/* Baixar um e-mail de 50 MB do Microsoft 365 e guardar anexo por anexo passa
   dos 15 s que a Vercel dá de graça a uma rota comum. */
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  let corpo: Record<string, unknown> = {}
  try { corpo = await req.json() } catch { /* cai na validação */ }

  /* O BILHETE VAI CRU E É LIDO AQUI. A tela também o lê (para mostrar o que
     está buscando), mas quem decide é o servidor: o navegador pode mandar
     qualquer coisa, inclusive um bilhete montado à mão. */
  const arrastados = lerArrastoDoOutlook(String(corpo.arrasto ?? ''))
  if (!arrastados.length) {
    return NextResponse.json(
      { erro: 'Não reconheci o e-mail arrastado. Tente arrastar de novo, ou salve o e-mail e solte o arquivo.' },
      { status: 422 },
    )
  }

  /* O token da pessoa: renovado, guardado e esquecido em `lib/ms/acesso.ts`,
     a mesma peça que o "juntar e-mail ao caso" usa. */
  const ms = await acessoDaPessoa(await createAdminClient(), user.id)
  if (!ms.ok) return NextResponse.json(ms.corpo, { status: ms.status })
  const acesso = ms.acesso

  const { data: quem } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
  const autor = { auth_id: user.id, nome: (quem as { nome: string | null } | null)?.nome ?? user.email ?? null }
  const minhaCaixa = ms.conta

  const recibos: unknown[] = []
  for (const alvo of arrastados) {
    /* SÓ A CAIXA DA PESSOA. Arrastar de uma caixa compartilhada que ela abre no
       Outlook é um caso real — e para esse o caminho continua sendo salvar o
       e-mail. Buscar em nome de outra caixa exigiria outra permissão, e essa
       decisão não se toma no meio de um arrasto. */
    if (alvo.caixa && alvo.caixa !== minhaCaixa) {
      recibos.push({
        ok: false, assunto: alvo.assunto,
        erro: `Este e-mail está na caixa ${alvo.caixa}, e você ligou ao CRM a caixa ${minhaCaixa}. Salve o e-mail e solte o arquivo aqui.`,
      })
      continue
    }
    if (alvo.bytes && alvo.bytes > MAX_BYTES_ARRASTO) {
      recibos.push({
        ok: false, assunto: alvo.assunto,
        erro: `O e-mail tem ${(alvo.bytes / 1024 / 1024).toFixed(1)} MB e o limite é 50 MB.`,
      })
      continue
    }

    const baixado = await baixarMIME(acesso, alvo.id)
    if (!baixado.ok) {
      recibos.push({ ok: false, assunto: alvo.assunto, erro: baixado.erro })
      continue
    }

    /* DAQUI PARA A FRENTE É A ESTRADA DE SEMPRE. O nome do arquivo é só para o
       acervo: o conteúdo é MIME, e o porteiro (`ehEmail`) o reconhece. */
    const recibo = await abrirCasoPorEmail(supabase, {
      bruto: baixado.mime,
      nomeArquivo: `${(alvo.assunto || 'e-mail').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').slice(0, 90).trim() || 'e-mail'}.eml`,
      autor,
    })

    recibos.push(
      recibo.ok
        ? {
            ok: true,
            ja_existia: !!recibo.ja_existia,
            caso: recibo.caso,
            documentos: recibo.documentos,
            ignorados: recibo.ignorados,
            falhas: recibo.falhas,
            assunto: recibo.caso?.assunto ?? alvo.assunto,
          }
        : { ok: false, assunto: alvo.assunto, erro: recibo.erro },
    )
  }

  return NextResponse.json({ ok: recibos.some((r) => (r as { ok: boolean }).ok), recibos })
}
