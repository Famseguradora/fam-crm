'use client'

// Esta tela deixou de existir em 08/09/2026, por ordem dele: a análise de
// crédito tem UMA porta no CRM, `/analises`. O que ela tinha foi para lá:
//
//   • o sistema embutido (127.0.0.1:7311) .... aba "Sistema"
//   • a lista das análises publicadas ........ aba "Acervo" (era a mesma lista)
//
// A rota fica como atalho, porque estava no menu e em link salvo.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AnaliseCreditoRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/analises') }, [router])
  return <div style={{ padding: 28, color: '#6080a0', fontSize: 14 }}>Levando para a análise de crédito…</div>
}
