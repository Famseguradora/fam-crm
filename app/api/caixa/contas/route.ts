// ============================================================================
//  GET/POST /api/caixa/contas  ·  as caixas de e-mail da FAM, e a régua de cada
//
//  No sistema que vai ser descartado isto era `estado/_outlook.json`: um arquivo
//  no disco de UMA máquina, valendo para UMA caixa. Duas coisas ruins vinham
//  daí: só quem estivesse naquela máquina podia mudar a regra, e o arquivo era
//  a verdade enquanto o resto do mundo tinha cópia.
//
//  Agora cada profissional da FAM tem a sua caixa aqui, com a sua régua e o seu
//  liga-desliga.
//
//  QUEM LIGA A CAIXA É O DONO DELA, e isso é a RLS que garante, não este
//  arquivo: `email_contas_escrita` só deixa passar `dono_auth_id = auth.uid()`
//  ou quem administra o CRM. Ligar a caixa de um colega varreria a caixa de
//  e-mail dele, que tem RH, médico e família dentro. Uma trava que mora só na
//  tela não é trava.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const CAMPOS_TEXTO = ['apelido', 'pasta'] as const
const CAMPOS_BOOL = ['ligado', 'so_com_anexo', 'so_nao_lidos', 'so_remetente_interno'] as const
const CAMPOS_NUM = { dias_para_tras: [1, 365], max_por_rodada: [1, 400] } as const
/* `fila_remetentes` NÃO é régua, e é por isso que ela existe separada de
   `remetentes` (17/09/2026): é de quem o dono da caixa quer ver na Fila do dia.
   Gravar uma nunca pode mexer no que a outra decide — `remetentes` é o que o
   Carteiro usa para gravar `serve`, e `serve` alimenta a aba "Para análise" e o
   relatório gerencial. O porquê inteiro está em
   supabase-migration-fila-remetentes.sql. */
const CAMPOS_LISTA = ['remetentes', 'fila_remetentes', 'assunto_contem', 'assunto_ignora'] as const

/* QUEM É O DONO é campo de gente que administra, e a RLS resolve isso sozinha:
   `email_contas_escrita` confere o WITH CHECK na linha NOVA, então um dono não
   consegue passar a própria caixa para outra pessoa (a linha nova deixaria de
   ser dele e o WITH CHECK barra). Só quem administra o CRM atribui dono.

   Isso existe porque o casamento automático por e-mail falha de verdade: o
   login de alguém no CRM pode ser um endereço e a caixa do Outlook outro. */
const COLUNAS =
  'id, conta, apelido, dono_auth_id, dono_nome, ligado, pasta, so_com_anexo, so_nao_lidos, so_remetente_interno, ' +
  'dias_para_tras, max_por_rodada, remetentes, fila_remetentes, assunto_contem, assunto_ignora, ' +
  'maquina, ultimo_contato, ultima_varredura, ultimo_erro'

/* O PostgREST não sabe o formato de uma lista de colunas montada em texto, e o
   TypeScript também não. `sou_dono` é o único campo que este arquivo acrescenta
   ao que veio do banco, e é o que a tela usa para saber quem pode mexer. */
type LinhaConta = Record<string, unknown> & { dono_auth_id: string | null }

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada.' }, { status: 401 })

  const { data, error } = await supabase.from('email_contas').select(COLUNAS).order('conta')
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })

  /* `sou_dono` e `posso_gerenciar` vêm calculados do SERVIDOR: a tela não
     precisa (nem deve) deduzir permissão comparando ids no navegador. E o que
     manda de verdade continua sendo a RLS: isto aqui só decide o que a tela
     mostra, não o que o banco aceita. */
  const { data: eu } = await supabase
    .from('usuarios').select('perfil, proprietario').eq('auth_id', user.id).maybeSingle()
  const posso_gerenciar = !!eu && (eu.perfil === 'admin' || eu.proprietario)

  const contas = ((data ?? []) as unknown as LinhaConta[]).map((c) => ({ ...c, sou_dono: c.dono_auth_id === user.id }))
  return NextResponse.json({ contas, posso_gerenciar })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  let corpo: Record<string, unknown> = {}
  try { corpo = await req.json() } catch { /* cai na validação */ }

  const id = String(corpo.conta_id ?? '')
  if (!id) return NextResponse.json({ erro: 'Falta dizer qual caixa.' }, { status: 422 })

  /* Uma lista de PERMITIDOS, e não de proibidos: com lista de proibidos, a
     coluna que nascer amanhã fica gravável por descuido. `conta` e `dono` ficam
     de fora de propósito: quem define de quem é a caixa é o casamento por
     e-mail com `usuarios`, não um campo de tela. */
  const mudanca: Record<string, unknown> = {}
  for (const c of CAMPOS_TEXTO) if (c in corpo) mudanca[c] = String(corpo[c] ?? '').slice(0, 300)

  /* O dono só entra junto com o nome, e o nome vem do CADASTRO, não do que a
     tela mandou: rótulo digitado à mão diverge do cadastro no primeiro mês. */
  if ('dono_auth_id' in corpo) {
    const alvo = String(corpo.dono_auth_id ?? '')
    if (!alvo) {
      mudanca.dono_auth_id = null
      mudanca.dono_nome = null
    } else {
      const { data: pessoa } = await supabase
        .from('usuarios').select('auth_id, nome').eq('auth_id', alvo).maybeSingle()
      if (!pessoa) return NextResponse.json({ erro: 'Essa pessoa não está no CRM.' }, { status: 422 })
      mudanca.dono_auth_id = pessoa.auth_id
      mudanca.dono_nome = pessoa.nome
    }
  }
  for (const c of CAMPOS_BOOL) if (c in corpo) mudanca[c] = !!corpo[c]
  for (const [c, [min, max]] of Object.entries(CAMPOS_NUM)) {
    if (!(c in corpo)) continue
    const n = Number(corpo[c])
    if (!Number.isFinite(n)) return NextResponse.json({ erro: `"${c}" tem que ser um número.` }, { status: 422 })
    mudanca[c] = Math.min(Math.max(Math.round(n), min), max)
  }
  for (const c of CAMPOS_LISTA) {
    if (!(c in corpo)) continue
    const v = corpo[c]
    mudanca[c] = (Array.isArray(v) ? v : String(v ?? '').split(/[\n,;]/))
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 60)
  }

  if (!Object.keys(mudanca).length) {
    return NextResponse.json({ erro: 'Nada para mudar.' }, { status: 422 })
  }

  /* LIGAR A CAIXA É SÓ DO DONO, e nem quem administra o CRM faz isso por ele.
     A RLS deixa quem administra mexer na caixa (precisa, para atribuir dono e
     para caixa de setor), e sem esta conferência isso viraria a porta dos
     fundos: um admin ligaria a caixa de e-mail de um colega, e tudo que tivesse
     anexo lá dentro apareceria para a FAM inteira. Atribuir dono é uma coisa;
     decidir que a caixa de alguém vai ser lida é outra, e é da pessoa. */
  if (mudanca.ligado === true) {
    const { data: alvo } = await supabase
      .from('email_contas').select('dono_auth_id, conta').eq('id', id).maybeSingle()
    if (!alvo) return NextResponse.json({ erro: 'Caixa não encontrada.' }, { status: 404 })

    /* CAIXA DE SETOR NÃO TEM DONO, e é de propósito (09/09/2026).
       `comercial@famseguradora.com.br` não é de ninguém: é da área. A regra
       acima a deixaria desligada para sempre, pedindo um dono que não existe —
       e inventar um dono seria pior, porque daria a UMA pessoa a decisão sobre
       um e-mail que é do time.

       Então: caixa SEM dono é ligada pelo proprietário do CRM. Caixa COM dono
       continua exatamente como estava, e nem o proprietário liga por ele. */
    const semDono = !alvo.dono_auth_id
    let podeLigar = alvo.dono_auth_id === user.id
    if (semDono) {
      const { data: eu } = await supabase
        .from('usuarios').select('proprietario').eq('auth_id', user.id).maybeSingle()
      podeLigar = !!eu?.proprietario
    }
    if (!podeLigar) {
      return NextResponse.json(
        {
          erro: semDono
            ? `${alvo.conta} é uma caixa de setor: quem liga é o proprietário do CRM.`
            : `Só ${alvo.conta} liga a própria caixa. Você pode atribuir o dono, não ligar por ele.`,
        },
        { status: 403 },
      )
    }
  }

  const { data, error } = await supabase
    .from('email_contas')
    .update(mudanca)
    .eq('id', id)
    .select(COLUNAS)

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  /* Escrita barrada por RLS volta ZERO linha e NENHUM erro. É pelo que voltou
     que se sabe se gravou, nunca pela ausência de erro. Aqui esse silêncio tem
     um significado exato: a caixa é de outra pessoa. */
  if (!data?.length) {
    return NextResponse.json(
      { erro: 'Esta caixa não é sua. Quem liga e configura a caixa é o dono dela.' },
      { status: 403 },
    )
  }

  const linha = (data as unknown as LinhaConta[])[0]
  return NextResponse.json({ ok: true, conta: { ...linha, sou_dono: linha.dono_auth_id === user.id } })
}
