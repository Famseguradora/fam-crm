// ============================================================================
//  GET /api/gestao/relatorio?mes=AAAA-MM  ·  o relatório gerencial do mês
//
//  A conta mora em lib/gestao/relatorio-mensal.ts; aqui só se lê o banco e se
//  devolve o resultado.
//
//  POR QUE A LEITURA É PELA SERVICE ROLE, e não pela sessão como no resto do
//  Comercial: o pedido dele é "para a empresa como um todo, não por usuário".
//  Pela sessão, cada pessoa só soma as caixas de e-mail a que tem acesso
//  (`fam_ve_caixa`), e o mesmo mês teria um número para cada pessoa que abre o
//  relatório. Então o servidor soma tudo e devolve SÓ NÚMEROS: nenhum assunto,
//  nenhum remetente, nenhuma prévia sai desta rota. O que sai com nome é
//  modalidade e corretora, que toda a equipe já vê nas outras telas.
//
//  Quem pode pedir: qualquer pessoa com login e cadastro em `usuarios`.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient as criarSupabase } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { METAS_PADRAO, type MetasEmail } from '@/lib/email/metricas'
import { lerVersao } from '@/lib/email/regua'
import type { ClassificacaoGravada } from '@/lib/email/classificar'
import { COLUNAS_RETRATO } from '@/lib/analise/retrato'
import { acharCorretoraNoEmail, casarCorretora } from '@/lib/analise/corretoras.mjs'
import {
  mesDaData, mesDoInstante, mesValido, montarRelatorioMensal,
  type AnaliseMes, type FilaMes, type LinhaEmail, type MudancaStatus, type OperacaoMes,
} from '@/lib/gestao/relatorio-mensal'
import { quemAnalise } from '@/lib/analise/acesso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/* O PostgREST devolve no máximo mil linhas por pedido. Ler em páginas é o que
   impede o relatório de ficar curto em silêncio quando a caixa passar disso. */
const PAGINA = 1000
const TETO_LINHAS = 50_000

type Pagina = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>

async function lerTudo<T>(pedir: (de: number, ate: number) => Pagina): Promise<T[]> {
  const todas: T[] = []
  for (let de = 0; de < TETO_LINHAS; de += PAGINA) {
    const { data, error } = await pedir(de, de + PAGINA - 1)
    if (error) throw new Error(error.message)
    todas.push(...((data ?? []) as T[]))
    if ((data ?? []).length < PAGINA) break
  }
  return todas
}

interface CorretoraLida { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null; email: string | null }

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })
  const { data: quem } = await supabase.from('usuarios').select('auth_id').eq('auth_id', user.id).maybeSingle()
  if (!quem) return NextResponse.json({ erro: 'Seu login não tem cadastro de usuário no CRM.' }, { status: 403 })

  /* A PORTA DA ANÁLISE TAMBÉM VALE AQUI  ·  23/09/2026
     Daqui para baixo tudo é lido com SERVICE ROLE, que passa por cima da RLS —
     inclusive da trava nova das tabelas `analise*`. Sem esta linha, o relatório
     gerencial seria a porta dos fundos da tela que acabou de ser trancada:
     `analises` e `analise_fila` entram no cálculo, e o que sai é a mediana do
     limite recomendado, a distribuição por nível de risco e por setor, o
     ranking de corretoras, LMG e taxa ponderada da FAM inteira.

     É agregado, sem CNPJ nem razão social por linha, e mesmo assim é matéria da
     Análise. Os quatro logins de perfil `leitura` são INVESTIDORES: número
     agregado da carteira é justamente o que eles não devem tirar sozinhos. */
  const naAnalise = await quemAnalise()
  if (!naAnalise.ve) {
    return NextResponse.json(
      { erro: 'O relatório gerencial da Análise não está liberado para você. Quem libera é o Marco, em Usuários.' },
      { status: 403 },
    )
  }

  const agora = new Date()
  const atual = mesDoInstante(agora.toISOString())!
  const mes = req.nextUrl.searchParams.get('mes') ?? atual
  if (!mesValido(mes) || mes > atual || mes < '2020-01') {
    return NextResponse.json({ erro: 'Mês inválido. Use AAAA-MM, até o mês atual.' }, { status: 422 })
  }

  const admin = criarSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const [linhas, metas, regua, mods, gravadas, analises, operacoes, historico, etapas, fila, corretoras] = await Promise.all([
      lerTudo<LinhaEmail>((de, ate) => admin.from('painel_pedidos').select('*').order('id').range(de, ate)),
      admin.from('email_metas').select('*').eq('id', true).maybeSingle(),
      admin.from('email_regua').select('versao, parametros, motivo, criada_por_nome, criada_em').order('versao'),
      admin.from('modalidades').select('nome'),
      lerTudo<ClassificacaoGravada>((de, ate) => admin.from('email_classificacao').select('*').order('email_id').order('origem').range(de, ate)),
      lerTudo<AnaliseMes>((de, ate) => admin.from('analises').select(`${COLUNAS_RETRATO}, versao`).order('id').range(de, ate)),
      lerTudo<OperacaoMes>((de, ate) => admin.from('operacoes')
        .select('id, corretora_id, modalidade, lmg, taxa, vigencia_anos, vigencia_dias, periodicidade_vigencia, premio_previsto, status, data_entrada, data_emissao, updated_at, created_at')
        .eq('ativo', true).order('id').range(de, ate)),
      // A troca de etapa (update do status) e o cadastro (insert, com a etapa no snapshot).
      lerTudo<MudancaStatus & { status_inserido: string | null }>((de, ate) => admin.from('fam_historico')
        .select('registro_id, acao, valor_depois, mudou_em, status_inserido:snapshot->>status')
        .eq('tabela', 'operacoes').or('campo.eq.status,acao.eq.insert').order('id').range(de, ate)),
      admin.from('status_fluxo_operacao').select('nome, ordem'),
      lerTudo<FilaMes>((de, ate) => admin.from('analise_fila').select('criado_em, concluido_em, concluido_em_crm, situacao').order('id').range(de, ate)),
      lerTudo<CorretoraLida>((de, ate) => admin.from('corretoras').select('id, razao_social, nome_fantasia, cnpj, email').order('id').range(de, ate)),
    ])
    for (const r of [metas, regua, mods, etapas]) if (r.error) throw new Error(r.error.message)

    // O nome que o CRM mostra em toda tela: o fantasia quando existe, a razão social quando não.
    const nomeDaCorretoraId = Object.fromEntries(corretoras.map((c) => [c.id, (c.nome_fantasia || '').trim() || c.razao_social]))
    const casados = new Map<string, string | null>()
    const nomeDaCorretora = (cru: string | null) => {
      const k = (cru ?? '').trim()
      if (!k) return null
      if (!casados.has(k)) casados.set(k, casarCorretora(k, corretoras).nome ?? null)
      return casados.get(k) ?? null
    }
    const corretoraDoEmail = (x: { email_de: string | null; previa?: string | null }) =>
      acharCorretoraNoEmail({ email_de: x.email_de, corpo: x.previa ?? '' }, corretoras).nome ?? null

    const relatorio = montarRelatorioMensal({
      mes,
      agora,
      email: {
        linhas,
        versoes: ((regua.data ?? []) as Parameters<typeof lerVersao>[0][]).map(lerVersao),
        modalidades: [...new Set((mods.data ?? []).map((m) => String(m.nome)))],
        gravadas,
        metas: metas.data ? { ...METAS_PADRAO, ...(metas.data as Partial<MetasEmail>) } : METAS_PADRAO,
      },
      analises,
      operacoes,
      historico: historico.map(({ status_inserido, ...h }) => (h.acao === 'insert' ? { ...h, valor_depois: status_inserido } : h)),
      etapas: (etapas.data ?? []) as { nome: string; ordem: number | null }[],
      fila,
      nomeDaCorretoraId,
      nomeDaCorretora,
      corretoraDoEmail,
    })

    /* O primeiro mês com qualquer dado: é até onde o seletor volta. */
    const primeiro = [
      ...linhas.map((l) => mesDoInstante(l.recebido_em)),
      ...analises.map((a) => mesDaData(a.data_analise)),
      ...operacoes.map((o) => mesDaData(o.data_entrada)),
    ].filter((m): m is string => !!m).sort()[0] ?? atual

    return NextResponse.json({ relatorio, primeiro_mes: primeiro, mes_atual: atual }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (erro) {
    console.error('[gestao/relatorio]', erro instanceof Error ? erro.message : erro)
    return NextResponse.json({ erro: 'Não consegui montar o relatório agora. Tente de novo em instantes.' }, { status: 500 })
  }
}
