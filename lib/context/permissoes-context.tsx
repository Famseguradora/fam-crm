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
  // ANÁLISE DE CRÉDITO, três andares. Nenhum deles é `perfil`.
  //   veAnalise ..... entra em /analises. `usuarios.acesso_analise`, marcado
  //                   na tela /usuarios. RLS `fam_ve_analise()`.
  //   ajudaAnalise .. arrasta card na coluna, escreve a nota do tomador,
  //                   encaminha. Ver mais perfil que não é `leitura`, que foi
  //                   o pedido literal dele em 23/09/2026: "os que são somente
  //                   leitura não podem arrastar cards, só visualizar".
  //                   RLS `fam_ajuda_analise()`.
  //   editaAnalise .. decide conflito e aplica ao cadastro. Um analista só (o
  //                   Marco). RLS `fam_e_analista()`.
  // A trava real é sempre a RLS; isto aqui só some com o botão.
  veAnalise: boolean
  ajudaAnalise: boolean
  editaAnalise: boolean
}

const PermissoesContext = createContext<PermissoesCtx>({
  perfil: 'usuario',
  somenteLeitura: false,
  proprietario: false,
  podePublicarAvisos: false,
  veAnalise: false,
  ajudaAnalise: false,
  editaAnalise: false,
})

export function PermissoesProvider({
  children,
  perfil,
  proprietario,
  podePublicarAvisos,
  veAnalise = false,
  ajudaAnalise = false,
  editaAnalise = false,
}: {
  children: React.ReactNode
  perfil: string
  proprietario: boolean
  podePublicarAvisos: boolean
  veAnalise?: boolean
  ajudaAnalise?: boolean
  editaAnalise?: boolean
}) {
  const p: Perfil = perfil === 'admin' || perfil === 'leitura' ? perfil : 'usuario'
  return (
    <PermissoesContext.Provider value={{
      perfil: p,
      somenteLeitura: p === 'leitura',
      proprietario,
      podePublicarAvisos,
      veAnalise,
      ajudaAnalise,
      editaAnalise,
    }}>
      {children}
    </PermissoesContext.Provider>
  )
}

export const usePermissoes = () => useContext(PermissoesContext)
