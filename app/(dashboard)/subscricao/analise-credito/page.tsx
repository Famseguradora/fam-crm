'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import FilaTomadores, { type Tomador } from './FilaTomadores'
import AssistenteIA from './AssistenteIA'
import type { CanvasData } from './Canvas'

const Canvas = dynamic(() => import('./Canvas'), { ssr: false })

export default function AnaliseCredito() {
  const supabase = createClient()
  const [tomadores, setTomadores] = useState<Tomador[]>([])
  const [tomadorSelecionado, setTomadorSelecionado] = useState<Tomador | null>(null)
  const [canvasData, setCanvasData] = useState<CanvasData | null>(null)

  useEffect(() => { carregarTomadores() }, [])

  async function carregarTomadores() {
    const { data } = await supabase
      .from('tomadores')
      .select('id, razao_social, cnpj, prioridade, status, created_at')
      .eq('ativo', true)
      .order('created_at', { ascending: true })
    setTomadores(data || [])
  }

  async function salvarCanvas(markdown: string) {
    if (!tomadorSelecionado) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('analise_sessoes').insert({
      tomador_id: tomadorSelecionado.id,
      tipo: 'analise',
      conteudo: markdown,
      criado_por: user?.id,
    })
  }

  function handleResposta(data: CanvasData) {
    setCanvasData(data)
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 110px)', background: '#060b18', overflow: 'hidden', margin: '-28px -32px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      <FilaTomadores
        tomadores={tomadores}
        selecionado={tomadorSelecionado}
        onSelect={t => { setTomadorSelecionado(t); setCanvasData(null) }}
        onRefresh={carregarTomadores}
      />
      <Canvas
        tomador={tomadorSelecionado}
        data={canvasData}
        onSalvar={salvarCanvas}
      />
      <AssistenteIA
        tomador={tomadorSelecionado}
        onResposta={handleResposta}
      />
    </div>
  )
}
