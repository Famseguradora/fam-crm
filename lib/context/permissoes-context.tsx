'use client'

import { createContext, useContext } from 'react'
import type { Perfil } from '@/types'

interface PermissoesCtx {
  perfil: Perfil
  // Perfil "leitura": enxerga tudo, não cria, não edita e não exclui nada.
  // A trava de verdade é a RLS no banco; a UI esconde os botões por cima dela.
  somenteLeitura: boolean
  proprietario: boolean
  podePublicarAvisos: boolean
}

const PermissoesContext = createContext<PermissoesCtx>({
  perfil: 'usuario',
  somenteLeitura: false,
  proprietario: false,
  podePublicarAvisos: false,
})

export function PermissoesProvider({
  children,
  perfil,
  proprietario,
  podePublicarAvisos,
}: {
  children: React.ReactNode
  perfil: string
  proprietario: boolean
  podePublicarAvisos: boolean
}) {
  const p: Perfil = perfil === 'admin' || perfil === 'leitura' ? perfil : 'usuario'
  return (
    <PermissoesContext.Provider value={{
      perfil: p,
      somenteLeitura: p === 'leitura',
      proprietario,
      podePublicarAvisos,
    }}>
      {children}
    </PermissoesContext.Provider>
  )
}

export const usePermissoes = () => useContext(PermissoesContext)
