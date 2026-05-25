'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FilaTomadores, { type Tomador } from './FilaTomadores'
import Cockpit from './Cockpit'

const STATUS_RANK: Record<string, number> = {
  'Comitê': 6,
  'Subscrição': 5,
  'Em Análise': 4,
  'Documentação': 3,
  'Triagem': 2,
}

export default function AnaliseCredito() {
  const supabase = createClient()
  const [tomadores, setTomadores] = useState<Tomador[]>([])
  const [statusMap, setStatusMap] = useState<Record<string, string>>({})
  const [tomadorSelecionado, setTomadorSelecionado] = useState<Tomador | null>(null)

  useEffect(() => { carregarTomadores() }, [])

  async function carregarTomadores() {
    const [{ data: tods }, { data: ops }] = await Promise.all([
      supabase
        .from('tomadores')
        .select('id, razao_social, cnpj, status, prioridade, created_at')
        .eq('ativo', true)
        .order('created_at', { ascending: true }),
      supabase
        .from('operacoes')
        .select('tomador_id, status')
        .eq('ativo', true),
    ])

    const opsAtivas = (ops || []).filter(o => o.status !== 'Perdido' && o.status !== 'Recusado')

    const idsComOp = new Set(
      opsAtivas.map(o => o.tomador_id).filter(Boolean) as string[]
    )

    const map: Record<string, string> = {}
    for (const op of opsAtivas) {
      if (!op.tomador_id || !op.status) continue
      const cur = map[op.tomador_id]
      const rank = STATUS_RANK[op.status] ?? 1
      if (!cur || rank > (STATUS_RANK[cur] ?? 1)) map[op.tomador_id] = op.status
    }

    setStatusMap(map)
    setTomadores((tods || []).filter(t => idsComOp.has(t.id)))
  }

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - 110px)',
      background: '#060b18',
      overflow: 'hidden',
      margin: '-28px -32px',
      borderTop: '1px solid rgba(255,255,255,0.07)',
    }}>
      <FilaTomadores
        tomadores={tomadores}
        statusMap={statusMap}
        selecionado={tomadorSelecionado}
        onSelect={t => setTomadorSelecionado(t)}
      />
      <Cockpit tomador={tomadorSelecionado} />
    </div>
  )
}
