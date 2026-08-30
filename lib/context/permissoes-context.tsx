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
  // Análise de crédito: um analista só (o Marco). Todo mundo VÊ a análise —
  // ele quer a equipe acompanhando o trabalho —, mas só o analista decide
  // conflito e aplica ao cadastro. Não é `perfil`: os 7 admins não editam.
  // A trava real é a RLS `fam_e_analista()`; isto aqui só some com o botão.
  editaAnalise: boolean
}

const PermissoesContext = createContext<PermissoesCtx>({
  perfil: 'usuario',
  somenteLeitura: false,
  proprietario: false,
  podePublicarAvisos: false,
  editaAnalise: false,
})

export function PermissoesProvider({
  children,
  perfil,
  proprietario,
  podePublicarAvisos,
  editaAnalise = false,
}: {
  children: React.ReactNode
  perfil: string
  proprietario: boolean
  podePublicarAvisos: boolean
  editaAnalise?: boolean
}) {
  const p: Perfil = perfil === 'admin' || perfil === 'leitura' ? perfil : 'usuario'
  return (
    <PermissoesContext.Provider value={{
      perfil: p,
      somenteLeitura: p === 'leitura',
      proprietario,
      podePublicarAvisos,
      editaAnalise,
    }}>
      {children}
    </PermissoesContext.Provider>
  )
}

export const usePermissoes = () => useContext(PermissoesContext)
