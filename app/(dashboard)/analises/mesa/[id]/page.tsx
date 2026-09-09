'use client'

export const dynamic = 'force-dynamic'

// ============================================================================
//  O CARD DO TOMADOR NA ESTEIRA — /analises/mesa/<id da fila>
//
//  A página que abre quando ele clica num tomador da Mesa. Cobre a mesa, tem
//  endereço próprio e sai pelo Voltar, como o cockpit faz desde 16/08/2026.
//  O desenho inteiro está em `components/analise/CardAnalise.tsx`.
// ============================================================================

import { use } from 'react'
import CardAnalise from '@/components/analise/CardAnalise'

export default function CardDaMesaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <CardAnalise id={id} />
}
