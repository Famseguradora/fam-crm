// ============================================================================
//  GET /api/ia/robo  ·  o cardápio do robô, já respondido
//
//  Esta rota é a IA que funciona com a API desligada. Ela não fala com a
//  Anthropic, não gasta um centavo e não depende de chave nenhuma: lê o banco
//  com a sessão de quem pediu e devolve os cartões do cardápio já calculados.
//
//  POR QUE UMA IDA SÓ, com tudo pronto: o painel abre mostrando os números.
//  Se cada cartão fosse uma chamada, a tela abriria com um buraco piscando por cartão,
//  e o diretor fecharia antes de encher. A conta é rápida porque as tabelas são
//  pequenas e a soma acontece em memória, não em uma consulta por cartão.
//
//  GOVERNANÇA: cliente da SESSÃO, como em toda a IA deste CRM. Não existe aqui
//  caminho para a service role. O robô soma exatamente as linhas que a pessoa
//  veria abrindo a tela na mão: se a RLS esconder um tomador dela, ele não
//  entra na conta dela. É por isso que dois usuários podem ver totais
//  diferentes, e isso é o certo, não um defeito.
// ============================================================================
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerAcervo, montarCartoes } from '@/lib/ia/robo'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  try {
    const acervo = await lerAcervo(supabase)
    return NextResponse.json({
      cartoes: montarCartoes(acervo),
      lido: {
        tomadores: acervo.tomadores.length,
        operacoes: acervo.operacoes.length,
        corretoras: acervo.corretoras.length,
      },
      em: new Date().toISOString(),
    })
  } catch (e) {
    /* O robô é o modo que funciona quando o resto não funciona. Se ele mesmo
       cair, a mensagem tem que dizer o que aconteceu, e não sumir: o painel
       ficaria vazio sem explicação, que é exatamente a tela que ele pediu para
       acabar. */
    return NextResponse.json(
      { erro: 'O robô não conseguiu ler o banco: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500 },
    )
  }
}
