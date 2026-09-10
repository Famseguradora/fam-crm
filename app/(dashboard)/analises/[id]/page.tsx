'use client'

export const dynamic = 'force-dynamic'

// ============================================================================
//  O RELATÓRIO DA ANÁLISE, DENTRO DO CRM — /analises/<id>
//
//  Esta página lê o SUPABASE, e por isso funciona de qualquer lugar. É o
//  relatório fracionado que ele pediu em 01/09/2026: seção por seção, campo,
//  tabela e tela, em vez de um documento inteiro guardado como arquivo.
//
//  O desenho mora em `components/analise/RelatorioCompleto.tsx` desde
//  09/09/2026, porque a aba Relatório do card do tomador (`/analises/mesa/<id>`)
//  mostra a mesma coisa. Uma análise não pode ter duas caras.
// ============================================================================

import { use } from 'react'
import { useRouter } from 'next/navigation'
import RelatorioCompleto from '@/components/analise/RelatorioCompleto'
import EstiloAnalises from '@/components/analise/Estilo'
import { IcoVoltar } from '@/components/tomador/icones'

export default function RelatorioDaAnalisePage({ params }: { params: Promise<{ id: string }> }) {
  // Next 16: `params` é Promise, e num Client Component quem resolve é `use()`.
  const { id } = use(params)
  const router = useRouter()

  return (
    /* A pele da Análise vale aqui também: esta é a tela onde ele LÊ e EDITA a
       análise, e ela estava fora da remodelagem — abria com os rótulos em caixa
       alta espaçada que ele mandou tirar. */
    <div className="an-area" style={{ padding: '14px 0 26px' }}>
      <EstiloAnalises />
      <button type="button" className="mt-voltar" onClick={() => router.push('/analises?aba=acervo')}>
        <IcoVoltar /> Acervo de análises
      </button>
      <RelatorioCompleto analiseId={id} />
    </div>
  )
}
