'use client'

// Box de "racional" reutilizável: mostra COMO uma taxa é calculada (título +
// explicação + fórmula). O CONTEÚDO vem sempre da fonte única em
// lib/corretoras/agregacoes.ts (TAXA_PONDERADA_INFO / TAXA_MENSAL_INFO); este
// componente cuida só da apresentação. É INLINE (expande no fluxo, sem popover),
// então não é recortado por cards com overflow. Cada tela controla o botão ⓘ e o
// estado de abrir/fechar; aqui só renderizamos a caixa quando aberta.
export interface InfoTaxa {
  titulo: string
  texto: string
  formula: string
}

export default function RacionalTaxaBox({ info, tema = 'claro' }: { info: InfoTaxa; tema?: 'claro' | 'escuro' }) {
  const dark = tema === 'escuro'
  return (
    <div style={{
      background: dark ? 'rgba(255,255,255,0.04)' : '#f5f9ff',
      border: `1px solid ${dark ? 'rgba(120,160,210,0.28)' : '#d0e4f5'}`,
      borderRadius: 10, padding: '12px 14px',
      fontFamily: "'Calibri','Segoe UI',sans-serif", textAlign: 'left',
    }}>
      <div style={{ fontWeight: 800, color: dark ? '#e8b84b' : '#1e4080', marginBottom: 5, fontSize: 12.5 }}>📐 {info.titulo}</div>
      <div style={{ fontSize: 12, color: dark ? 'rgba(210,224,240,0.92)' : '#2a3a5a', lineHeight: 1.55, marginBottom: 8 }}>{info.texto}</div>
      <code style={{
        display: 'block', whiteSpace: 'pre-wrap', borderRadius: 8, padding: '8px 10px', fontSize: 11.5,
        background: dark ? 'rgba(255,255,255,0.05)' : '#eef4fc',
        border: `1px solid ${dark ? 'rgba(120,160,210,0.25)' : '#dce8f6'}`,
        color: dark ? '#a0c0e8' : '#1e4080',
      }}>{info.formula}</code>
    </div>
  )
}
