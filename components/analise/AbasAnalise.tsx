'use client'

// ============================================================================
//  AS DUAS PORTAS DA ANÁLISE DE CRÉDITO, lado a lado.
//
//  Esteira é o ANDAMENTO (o que está rodando, o que travou, o que precisa de
//  gente). Acervo é o RESULTADO (as análises já prontas e publicadas). São as
//  duas metades do que o Sistema de Análise fazia em `127.0.0.1:7311`, e
//  juntá-las numa lista só seria misturar o que muda a cada minuto com o que
//  não muda mais.
//
//  Pele "texto, não botão", que é a regra dele para o sistema inteiro: sem
//  moldura em repouso, pastilha só no hover, e a ativa marcada pelo traço
//  embaixo. Estilo inline de propósito — classe nova no `globals.css` não
//  chega ao navegador sem derrubar o dev server, e isso já custou tempo.
// ============================================================================

import Link from 'next/link'

const BASE: React.CSSProperties = {
  padding: '8px 12px 9px',
  fontSize: 13.5,
  fontWeight: 600,
  color: '#6080a0',
  textDecoration: 'none',
  borderBottom: '2px solid transparent',
  marginBottom: -1,
  whiteSpace: 'nowrap',
}

const ATIVA: React.CSSProperties = {
  color: '#1e4080',
  borderBottomColor: '#1e4080',
}

export default function AbasAnalise({ atual, totalAcervo }: {
  atual: 'esteira' | 'acervo'
  /** Quantas análises o acervo tem. Omitido enquanto ainda está contando. */
  totalAcervo?: number | null
}) {
  return (
    <nav
      aria-label="Análise de crédito"
      style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--border)' }}
    >
      <Link href="/analises" style={{ ...BASE, ...(atual === 'esteira' ? ATIVA : null) }}
        aria-current={atual === 'esteira' ? 'page' : undefined}>
        Esteira
      </Link>
      <Link href="/analises/acervo" style={{ ...BASE, ...(atual === 'acervo' ? ATIVA : null) }}
        aria-current={atual === 'acervo' ? 'page' : undefined}>
        Acervo{typeof totalAcervo === 'number' ? ` · ${totalAcervo}` : ''}
      </Link>
    </nav>
  )
}
