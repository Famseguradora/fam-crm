'use client'

import { useEffect } from 'react'

// Pré-visualização de PDF em tela cheia, antes de baixar. Mesmo desenho que já
// existia inline em CorretoraDetalhe/PainelGerencial, extraído para as telas
// novas (KPIs por Mês e Apresentação Executiva) não copiarem o modal.
// Revoga o blob URL ao fechar, senão a aba segura o PDF inteiro em memória.
export interface PdfGerado { url: string; filename: string }

export default function PdfPreview({
  pdf, titulo, onFechar,
}: {
  pdf: PdfGerado | null
  titulo: string
  onFechar: () => void
}) {
  useEffect(() => {
    const u = pdf?.url
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [pdf?.url])

  useEffect(() => {
    if (!pdf) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pdf, onFechar])

  if (!pdf) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(6,14,26,.72)', zIndex: 10000,
        display: 'flex', flexDirection: 'column', padding: '2vh 2vw',
      }}
      onClick={onFechar}
    >
      <div
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
          background: '#0d1b2f', borderRadius: '12px 12px 0 0', padding: '12px 16px', flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{titulo}</div>
            <div style={{ fontSize: 11.5, color: '#a9c4e8' }}>{pdf.filename}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={pdf.url} download={pdf.filename} className="btn-primary" style={{ textDecoration: 'none' }}>
              ⬇ Baixar PDF
            </a>
            <button
              className="btn-secondary"
              style={{ background: 'transparent', color: '#fff', borderColor: '#3a5a86' }}
              onClick={onFechar}
            >
              ✕ Fechar
            </button>
          </div>
        </div>
        <iframe
          src={pdf.url}
          title="Pré-visualização do PDF"
          style={{ flex: 1, width: '100%', border: 'none', background: '#525659' }}
        />
      </div>
    </div>
  )
}
