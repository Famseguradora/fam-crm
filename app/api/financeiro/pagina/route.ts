// ============================================================================
//  O HTML do FAM Financeiro — `/api/financeiro/pagina`
//
//  Por que uma rota e não `public/dashboard.html`:
//  este projeto NÃO tem `middleware.ts`. A proteção do CRM mora no layout de
//  `(dashboard)`. Arquivo em `public/` é entregue pelo servidor de estáticos,
//  que não passa por layout nenhum — qualquer pessoa com o endereço abriria o
//  caixa da FAM. Aqui a sessão é conferida ANTES de o conteúdo sair.
//
//  O arquivo é servido do disco (não vai para `public/`), com `no-store` para
//  não ficar em cache de proxy nem de navegador de terceiro.
// ============================================================================
import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@/lib/supabase/server'
import { quemFinanceiro } from '@/lib/financeiro/acesso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Caminho fixo, montado no servidor: nada aqui vem da requisição. */
const ARQUIVO = path.join(process.cwd(), 'fam-financeiro', 'dashboard.html')

export async function GET() {
  const quem = await quemFinanceiro()

  if (!quem.ve) {
    // Página de recusa, não o sistema com um aviso por cima: o que não é
    // entregue não pode ser lido pelo "ver código-fonte".
    return new NextResponse(
      `<!doctype html><meta charset="utf-8">
       <body style="font-family:'Calibri','Segoe UI',sans-serif;background:#e8eef5;color:#1a2a3a;
                    display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
         <div style="background:#fff;border:1px solid #c5d5e8;border-radius:12px;padding:28px 32px;max-width:440px;
                     box-shadow:0 6px 16px rgba(30,64,128,.10)">
           <div style="font-size:17px;font-weight:700;color:#1a3560;margin-bottom:8px">Financeiro fechado para você</div>
           <div style="font-size:14px;line-height:1.6;color:#3a4a5a">
             Esta tela tem lista própria de acesso, separada do perfil do CRM.
             Quem libera é o Marco ou o Aldeir.
           </div>
         </div>
       </body>`,
      { status: 403, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
    )
  }

  // ── A CARGA DE FÁBRICA NÃO PODE VIAJAR PARA QUEM NÃO TEM CHAVE ──
  // O dashboard.html traz os 93 lançamentos reais de julho/2026 compilados
  // dentro dele (a planilha Matriz do Aldeir). Com o cofre em pé, servir isso
  // para quem não tem envelope entregaria salários, resseguro e SUSEP no
  // código-fonte, enquanto a tela mostrava números de mentira. O cofre viraria
  // enfeite. Então: existe cofre e você não tem chave? A semente vai trocada.
  const supabase = await createClient()
  const { data } = await supabase
    .from('financeiro_cofre_envelope')
    .select('usuario_id, tipo')
    .is('revogado_em', null)

  const envelopes = (data ?? []) as { usuario_id: string | null; tipo: string }[]

  const cofreExiste = envelopes.length > 0
  // Só o envelope PESSOAL conta. O de recuperação e os convites existem para
  // todo mundo ver, então aceitá-los aqui liberaria a semente para qualquer um.
  const tenhoEnvelope = envelopes.some(
    e => e.tipo === 'senha' && e.usuario_id === quem.usuarioId,
  )
  // Quem entra por chave de recuperação ou convite também recebe a semente
  // trocada, e não perde nada: os dados de verdade vêm cifrados do servidor,
  // não da semente. A semente só serve para a primeira abertura de todas.
  const esconderSemente = cofreExiste && !tenhoEnvelope

  let html: string
  try {
    html = await readFile(ARQUIVO, 'utf8')
  } catch {
    return new NextResponse(
      '<!doctype html><meta charset="utf-8"><body style="font-family:Calibri,sans-serif;padding:24px">' +
      'Não achei o <b>fam-financeiro/dashboard.html</b> no servidor. Rode <code>node fam-financeiro/build-dashboard.cjs</code> e faça o deploy de novo.' +
      '</body>',
      { status: 500, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
    )
  }

  // Quem é a pessoa, para o sistema assinar a trilha e travar os botões de
  // quem só olha. Injetado pelo SERVIDOR: o navegador não escolhe seu nome.
  // JSON.stringify escapa o conteúdo, e o `</` quebrado evita que um nome com
  // "</script>" feche a tag antes da hora.
  const sessao =
    `<script>window.FAM_SESSAO=${JSON.stringify({
      nome: quem.nome, edita: quem.edita, dono: quem.dono, usuarioId: quem.usuarioId,
    }).replace(/</g, '\\u003c')};</script>`

  if (esconderSemente) {
    // Troca tudo que está entre as cercas por uma semente vazia. A tela monta a
    // base de demonstração sozinha, no navegador, e o que sai daqui não tem um
    // único número da FAM. Se a cerca não for encontrada, a rota RECUSA em vez
    // de servir · falhar fechado, nunca entregar o caixa por engano.
    const cercado = /\/\*__J0__\*\/[\s\S]*?\/\*__J1__\*\//
    if (!cercado.test(html)) {
      return new NextResponse(
        '<!doctype html><meta charset="utf-8"><body style="font-family:Calibri,sans-serif;padding:24px">' +
        'Não consigo servir esta tela com segurança: a carga de fábrica não está cercada neste arquivo. ' +
        'Rode <code>node fam-financeiro/build-dashboard.cjs</code> e publique de novo.</body>',
        { status: 500, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
      )
    }
    html = html.replace(cercado, '{"saldoInicial":0,"saldoFinalBancario":0,"lancamentos":[]}')
  }

  return new NextResponse(html.replace('</head>', sessao + '</head>'), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
      // a tela só pode ser embutida pelo próprio CRM
      'x-frame-options': 'SAMEORIGIN',
    },
  })
}
