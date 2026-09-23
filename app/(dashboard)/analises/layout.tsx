// ============================================================================
//  O GUARDA DA ANÁLISE DE CRÉDITO  ·  /analises/*
//
//  Some do menu quem não tem a marca, mas menu escondido não é tranca: quem
//  digitar `/analises` na barra do navegador chega igual. Este layout é a
//  tranca, e ela roda no SERVIDOR, antes de a tela existir.
//
//  POR QUE NO SERVIDOR, E NÃO DENTRO DA TELA. A página é `'use client'`, e no
//  App Router o que um Server Component passa para um Client Component é
//  serializado no HTML. Uma tela de "sem acesso" montada dentro do componente
//  client seria um `if` de renderização, não proteção: o dado sensível já teria
//  viajado. É a lição que a Cédula do Comitê deixou escrita, e vale aqui com
//  mais força: do outro lado desta porta estão 195 análises com balanço,
//  Serasa e limite de 634 tomadores.
//
//  ISTO TAMBÉM NÃO É A ÚNICA TRANCA. A RLS (`fam_ve_analise()`) recusa no banco
//  para qualquer caminho, inclusive quem chamar a API por fora do navegador.
//  São duas portas de propósito: esta existe para a pessoa receber um "não" em
//  português, em vez de uma tela vazia sem explicação.
//
//  Cobre o `/analises` e tudo abaixo dele — o card do tomador em
//  `/analises/mesa/<id>` e o acervo em `/analises/acervo` incluídos —, porque
//  layout do App Router vale para a subárvore inteira.
// ============================================================================
import Link from 'next/link'
import { quemAnalise } from '@/lib/analise/acesso'

export default async function AnaliseLayout({ children }: { children: React.ReactNode }) {
  // MODO SANDBOX: não há sessão para consultar, e o dashboard inteiro já entra
  // como ele. Barrar aqui deixaria o sandbox sem a tela que ele mais usa.
  if (process.env.NEXT_PUBLIC_SANDBOX === 'true') return <>{children}</>

  const quem = await quemAnalise()
  if (quem.ve) return <>{children}</>

  /* NÃO REDIRECIONA PARA A HOME. Cair no Dashboard sem explicação faz a pessoa
     achar que o link quebrou e pedir de novo. Uma frase resolve, e diz a quem
     pedir. */
  return (
    <div style={{
      maxWidth: 560, margin: '64px auto', padding: '28px 30px',
      background: '#fff', border: '1px solid #e3e7ee', borderRadius: 10,
      fontFamily: "'Calibri','Segoe UI',sans-serif", color: '#1f2733',
    }}>
      <h1 style={{ margin: '0 0 10px', fontSize: 21, fontWeight: 700, color: '#1e4080' }}>
        A Análise de crédito não está liberada para você
      </h1>
      <p style={{ margin: '0 0 12px', fontSize: 15, lineHeight: 1.55 }}>
        Esta tela mostra os balanços, o Serasa e o limite dos tomadores, e por isso
        o acesso é pessoa a pessoa, não por cargo no CRM.
      </p>
      <p style={{ margin: '0 0 18px', fontSize: 15, lineHeight: 1.55 }}>
        Quem libera é o Marco, em <strong>Usuários</strong>, num interruptor ao lado
        do seu nome. O resto do CRM continua aberto normalmente.
      </p>
      <Link href="/" style={{
        display: 'inline-block', padding: '9px 16px', borderRadius: 7,
        background: '#1e4080', color: '#fff', textDecoration: 'none',
        fontSize: 14, fontWeight: 600,
      }}>
        Voltar ao Dashboard
      </Link>
    </div>
  )
}
