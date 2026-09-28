'use client'

/* A TRIAGEM DE UM CASO, aberta pelo Funil.

   Desde 28/09/2026 a tela mora em `components/triagem/BancadaTriagem.tsx`,
   porque ela também é a bancada do nó "Cadastro e triagem" no card da Análise.
   Uma tela só nos dois lugares: o que se conserta lá vale aqui. */

import { use } from 'react'
import BancadaTriagem from '@/components/triagem/BancadaTriagem'

export default function TriagemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <BancadaTriagem id={id} />
}
