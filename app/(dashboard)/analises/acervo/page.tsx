'use client'

// O acervo deixou de ser tela em 08/09/2026: virou a aba "Acervo" de
// `/analises`, a porta única da análise de crédito. Esta rota fica de pé só
// para o link salvo e o favorito não morrerem.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AcervoRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/analises?aba=acervo') }, [router])
  return <div style={{ padding: 28, color: '#6080a0', fontSize: 14 }}>Levando para a análise de crédito…</div>
}
