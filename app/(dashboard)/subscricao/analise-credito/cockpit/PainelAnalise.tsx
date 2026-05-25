'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { C } from './types'
import type { useCockpit } from './useCockpit'
import type { Tomador } from '../FilaTomadores'

type CockpitHook = ReturnType<typeof useCockpit>

interface Props {
  cockpit: CockpitHook
  tomador: Tomador
}

interface CtxMenu {
  x: number
  y: number
  texto: string
}

export default function PainelAnalise({ cockpit, tomador }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeReady, setIframeReady] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [fontSize, setFontSize] = useState(3)
  const html = cockpit.sessao?.html_conteudo || cockpit.htmlPendente || null

  // Inject edit-mode helpers after iframe loads
  const initIframe = useCallback(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    doc.body.classList.add('edit-mode')
    // Make all text-bearing elements editable
    doc.querySelectorAll<HTMLElement>('[contenteditable="false"]').forEach(el => {
      el.contentEditable = 'true'
    })
    // If template has no contenteditable attrs, make body editable
    if (doc.querySelectorAll('[contenteditable="true"]').length === 0) {
      doc.body.contentEditable = 'true'
    }
    // Inject minimal edit cursor style
    const style = doc.createElement('style')
    style.textContent = `
      body.edit-mode { cursor: text; }
      body.edit-mode [contenteditable="true"]:focus { outline: 1px dashed rgba(56,189,248,0.4) !important; border-radius: 2px; }
    `
    doc.head.appendChild(style)
    // Context menu for highlighting
    doc.addEventListener('contextmenu', e => {
      e.preventDefault()
      const sel = doc.getSelection()
      const texto = sel?.toString().trim() || ''
      if (!texto) return
      const rect = iframeRef.current!.getBoundingClientRect()
      setCtxMenu({ x: rect.left + e.clientX, y: rect.top + e.clientY, texto })
    })
    // Click anywhere to dismiss context menu
    doc.addEventListener('click', () => setCtxMenu(null))
    setIframeReady(true)
  }, [])

  // Dismiss context menu on parent click
  useEffect(() => {
    const dismiss = () => setCtxMenu(null)
    document.addEventListener('click', dismiss)
    return () => document.removeEventListener('click', dismiss)
  }, [])

  // Re-init when html changes
  useEffect(() => {
    setIframeReady(false)
  }, [html])

  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const content = ev.target?.result as string
      cockpit.salvarHTML(content)
    }
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }

  function execCmd(cmd: string, value?: string) {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    doc.execCommand(cmd, false, value)
    iframeRef.current?.contentWindow?.focus()
  }

  function salvar() {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const captured = doc.documentElement.outerHTML
    cockpit.salvarHTML(captured)
  }

  function baixarHTML() {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const captured = doc.documentElement.outerHTML
    const blob = new Blob([captured], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analise-${tomador.razao_social.replace(/\s+/g, '_').toLowerCase()}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  function destacar(texto: string, secao?: string) {
    cockpit.adicionarDestaque(texto, secao)
    setCtxMenu(null)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.bg, overflow: 'hidden' }}>

      {/* Toolbar */}
      {html && (
        <div style={{
          height: 40,
          background: C.card,
          borderBottom: `1px solid ${C.border}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 4,
          flexShrink: 0,
          overflowX: 'auto',
        }}>
          {/* Formatação */}
          {[
            { cmd: 'bold',      icon: 'B', title: 'Negrito (Ctrl+B)',   style: { fontWeight: 700 } },
            { cmd: 'italic',    icon: 'I', title: 'Itálico (Ctrl+I)',   style: { fontStyle: 'italic' } },
            { cmd: 'underline', icon: 'U', title: 'Sublinhado (Ctrl+U)', style: { textDecoration: 'underline' } },
          ].map(btn => (
            <button key={btn.cmd} onClick={() => execCmd(btn.cmd)} title={btn.title}
              style={{ ...fmtBtn, ...btn.style }}
              onMouseEnter={e => hoverOn(e)} onMouseLeave={e => hoverOff(e)}>
              {btn.icon}
            </button>
          ))}

          <div style={{ width: 1, height: 20, background: C.border, margin: '0 4px' }} />

          {/* Alinhamento */}
          {[
            { cmd: 'justifyLeft',    icon: '⬅', title: 'Alinhar esquerda' },
            { cmd: 'justifyCenter',  icon: '↔', title: 'Centralizar' },
            { cmd: 'justifyRight',   icon: '➡', title: 'Alinhar direita' },
            { cmd: 'justifyFull',    icon: '≡',  title: 'Justificar' },
          ].map(btn => (
            <button key={btn.cmd} onClick={() => execCmd(btn.cmd)} title={btn.title}
              style={fmtBtn}
              onMouseEnter={e => hoverOn(e)} onMouseLeave={e => hoverOff(e)}>
              {btn.icon}
            </button>
          ))}

          <div style={{ width: 1, height: 20, background: C.border, margin: '0 4px' }} />

          {/* Tamanho de fonte */}
          <span style={{ fontSize: 11, color: C.muted }}>Tamanho:</span>
          <select
            value={fontSize}
            onChange={e => { const v = Number(e.target.value); setFontSize(v); execCmd('fontSize', String(v)) }}
            style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: '1px 4px', fontSize: 11, cursor: 'pointer' }}
          >
            {[1, 2, 3, 4, 5, 6, 7].map(s => (
              <option key={s} value={s}>{['8', '10', '12', '14', '18', '24', '36'][s - 1]}px</option>
            ))}
          </select>

          <div style={{ width: 1, height: 20, background: C.border, margin: '0 4px' }} />

          {/* Cor do texto */}
          <button onClick={() => {
            const c = prompt('Cor (ex: #ff0000 ou red):', '#000000')
            if (c) execCmd('foreColor', c)
          }} style={fmtBtn} title="Cor do texto" onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
            A🎨
          </button>

          {/* Cor de fundo */}
          <button onClick={() => {
            const c = prompt('Cor de fundo (ex: #ffff00 ou yellow):', '#ffff00')
            if (c) execCmd('hiliteColor', c)
          }} style={fmtBtn} title="Realce" onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
            HL
          </button>

          <div style={{ flex: 1 }} />

          {/* Ações */}
          <button onClick={() => fileRef.current?.click()} style={{ ...actionBtn, color: C.muted }}
            title="Substituir análise atual por outro HTML"
            onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
            🔄 Trocar
          </button>
          <button onClick={baixarHTML} style={{ ...actionBtn, color: C.muted }}
            onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
            ↓ HTML
          </button>
          <button onClick={salvar} style={{ ...actionBtn, color: C.accent, border: `1px solid ${C.accentBorder}` }}
            onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
            💾 Salvar
          </button>
        </div>
      )}

      {/* Estado vazio */}
      {!html && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ fontSize: 48 }}>📄</div>
          <div style={{ color: C.muted, fontSize: 14, textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
            Nenhuma análise importada para <strong style={{ color: C.text }}>{tomador.razao_social}</strong>.
          </div>
          <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', maxWidth: 360, lineHeight: 1.6 }}>
            Gere o JSON no Claude Web → importe no template HTML → exporte o HTML pronto → importe aqui.
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            style={{
              padding: '10px 24px', borderRadius: 8, border: `1px solid ${C.accentBorder}`,
              background: C.accentBg, color: C.accent, cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
            }}
          >
            📂 Importar Análise HTML
          </button>
        </div>
      )}

      {/* iframe editor */}
      {html && (
        <iframe
          ref={iframeRef}
          srcDoc={html}
          onLoad={initIframe}
          style={{ flex: 1, border: 'none', width: '100%', display: 'block', background: 'white' }}
          title="Análise de Crédito"
          sandbox="allow-same-origin allow-scripts allow-modals"
        />
      )}

      {/* Context menu (destacar) */}
      {ctxMenu && (
        <div
          style={{
            position: 'fixed',
            top: ctxMenu.y,
            left: ctxMenu.x,
            zIndex: 9999,
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            minWidth: 180,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ padding: '6px 12px', fontSize: 11, color: C.muted, borderBottom: `1px solid ${C.border}`, fontStyle: 'italic', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            "{ctxMenu.texto}"
          </div>
          {[
            { secao: undefined, label: '⭐ Destacar' },
            { secao: 'Score FAM', label: '📊 Destacar como Score' },
            { secao: 'Jurídico', label: '⚖️ Destacar como Jurídico' },
            { secao: 'Atenção', label: '⚠️ Destacar como Atenção' },
          ].map(opt => (
            <button
              key={opt.label}
              onClick={() => destacar(ctxMenu.texto, opt.secao)}
              style={{ display: 'block', width: '100%', padding: '8px 14px', background: 'none', border: 'none', color: C.text, fontSize: 12, textAlign: 'left', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept=".html" style={{ display: 'none' }} onChange={handleFileImport} />
    </div>
  )
}

const fmtBtn: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid transparent`,
  color: C.muted,
  cursor: 'pointer',
  borderRadius: 4,
  padding: '3px 7px',
  fontSize: 12,
  fontFamily: 'monospace',
  lineHeight: 1,
  transition: 'all 0.12s',
}

const actionBtn: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  padding: '3px 9px',
  fontSize: 11,
  cursor: 'pointer',
  transition: 'all 0.12s',
}

function hoverOn(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
  e.currentTarget.style.borderColor = C.border
  e.currentTarget.style.color = C.text
}

function hoverOff(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = 'transparent'
  e.currentTarget.style.borderColor = 'transparent'
  e.currentTarget.style.color = C.muted
}
