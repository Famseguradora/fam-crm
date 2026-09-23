// ============================================================================
//  A JANELA QUE ESTICA  ·  11/09/2026
//
//  Pedido do Marco, olhando a IA de Gestão: "precisa deixar eu aumentar e
//  diminuir o tamanho e largura da tela". A IA Gestor (components/ia/GestorGlobal.tsx)
//  já fazia isso desde 09/09: oito pegas nas bordas, o cabeçalho arrasta, um
//  botão ocupa a tela e devolve o tamanho de antes, e o tamanho fica guardado no
//  navegador. Esta é a mesma mecânica, tirada de lá para servir a qualquer painel
//  flutuante. A IA Gestor ainda tem a cópia dela; trocar para esta é um passo à
//  parte, para não mexer na janela mais usada do CRM sem pedido.
//
//  GUARDADA NO NAVEGADOR, e não no banco: o tamanho certo depende do monitor, e o
//  monitor é de quem está sentado.
// ============================================================================
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'

export interface Caixa { x: number; y: number; w: number; h: number }

/** As oito pegas. `d` diz que bordas aquela pega move. */
export const PEGAS: { d: string; cursor: string; estilo: CSSProperties }[] = [
  { d: 'n', cursor: 'ns-resize', estilo: { top: -3, left: 12, right: 12, height: 7 } },
  { d: 's', cursor: 'ns-resize', estilo: { bottom: -3, left: 12, right: 12, height: 7 } },
  { d: 'w', cursor: 'ew-resize', estilo: { left: -3, top: 12, bottom: 12, width: 7 } },
  { d: 'e', cursor: 'ew-resize', estilo: { right: -3, top: 12, bottom: 12, width: 7 } },
  { d: 'nw', cursor: 'nwse-resize', estilo: { top: -4, left: -4, width: 16, height: 16 } },
  { d: 'ne', cursor: 'nesw-resize', estilo: { top: -4, right: -4, width: 16, height: 16 } },
  { d: 'sw', cursor: 'nesw-resize', estilo: { bottom: -4, left: -4, width: 16, height: 16 } },
  { d: 'se', cursor: 'nwse-resize', estilo: { bottom: -4, right: -4, width: 16, height: 16 } },
]

interface Opcoes {
  /** Chave do localStorage, uma por painel. */
  chave: string
  /** O tamanho e o lugar da primeira abertura, calculados sobre a tela de agora. */
  padrao: (vw: number, vh: number) => Caixa
  minW?: number
  minH?: number
}

export function useJanela({ chave, padrao, minW = 360, minH = 320 }: Opcoes) {
  /** Nunca deixa a janela sair da tela: uma caixa guardada num monitor grande,
   *  aberta num notebook, ficaria com o cabeçalho fora do alcance do mouse. */
  const encaixar = (c: Caixa): Caixa => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = Math.max(minW, Math.min(c.w, vw - 16))
    const h = Math.max(minH, Math.min(c.h, vh - 16))
    return { w, h, x: Math.max(8, Math.min(c.x, vw - w - 8)), y: Math.max(8, Math.min(c.y, vh - h - 8)) }
  }

  const [caixa, setCaixa] = useState<Caixa>(() => {
    if (typeof window === 'undefined') return { x: 0, y: 0, w: 560, h: 600 }
    try {
      const cru = localStorage.getItem(chave)
      if (cru) {
        const c = JSON.parse(cru) as Caixa
        if ([c.x, c.y, c.w, c.h].every((n) => Number.isFinite(n))) return encaixar(c)
      }
    } catch { /* sem storage: cai no padrão */ }
    return encaixar(padrao(window.innerWidth, window.innerHeight))
  })
  const [cheia, setCheia] = useState(false)
  const guardada = useRef<Caixa | null>(null)
  const arrasto = useRef<{ d: string; px: number; py: number; c: Caixa } | null>(null)

  // Navegador encolheu ou trocou de monitor: a janela volta para dentro sozinha.
  useEffect(() => {
    const ajustar = () => setCaixa((c) => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const w = Math.max(minW, Math.min(c.w, vw - 16))
      const h = Math.max(minH, Math.min(c.h, vh - 16))
      return { w, h, x: Math.max(8, Math.min(c.x, vw - w - 8)), y: Math.max(8, Math.min(c.y, vh - h - 8)) }
    })
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  }, [minW, minH])

  /* Um mecanismo para as nove pegas (o cabeçalho move, as oito bordas esticam).
     Os ouvintes ficam no window: soltar o mouse fora da janela tem que terminar
     o arrasto, senão ela gruda no cursor. */
  useEffect(() => {
    const mover = (e: PointerEvent) => {
      const a = arrasto.current
      if (!a) return
      const dx = e.clientX - a.px
      const dy = e.clientY - a.py
      const vw = window.innerWidth
      const vh = window.innerHeight
      let { x, y, w, h } = a.c
      if (a.d === 'mover') {
        x = a.c.x + dx
        y = a.c.y + dy
      } else {
        if (a.d.includes('e')) w = a.c.w + dx
        if (a.d.includes('s')) h = a.c.h + dy
        // Esticar pela esquerda ou pelo topo move a origem junto, até o mínimo.
        if (a.d.includes('w')) { w = a.c.w - dx; x = a.c.x + Math.min(dx, a.c.w - minW) }
        if (a.d.includes('n')) { h = a.c.h - dy; y = a.c.y + Math.min(dy, a.c.h - minH) }
      }
      w = Math.max(minW, Math.min(w, vw - 16))
      h = Math.max(minH, Math.min(h, vh - 16))
      x = Math.max(8, Math.min(x, vw - w - 8))
      y = Math.max(8, Math.min(y, vh - h - 8))
      setCaixa({ x, y, w, h })
    }
    const soltar = () => {
      if (!arrasto.current) return
      arrasto.current = null
      document.body.style.userSelect = ''
      // Grava só quando solta: gravar a cada pixel seria uma escrita por movimento.
      setCaixa((c) => {
        try { localStorage.setItem(chave, JSON.stringify(c)) } catch { /* sem storage */ }
        return c
      })
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', soltar)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', soltar)
    }
  }, [chave, minW, minH])

  const pegar = (d: string) => (e: ReactPointerEvent) => {
    if (cheia) return
    e.preventDefault()
    arrasto.current = { d, px: e.clientX, py: e.clientY, c: caixa }
    // Sem isto, arrastar seleciona o texto do painel inteiro pelo caminho.
    document.body.style.userSelect = 'none'
  }

  /** Ocupar a tela guarda a caixa de antes, e o clique de volta devolve exatamente ela. */
  const alternarCheia = () => {
    if (cheia) {
      if (guardada.current) setCaixa(encaixar(guardada.current))
      setCheia(false)
    } else {
      guardada.current = caixa
      setCaixa(encaixar({ x: 8, y: 8, w: window.innerWidth - 16, h: window.innerHeight - 16 }))
      setCheia(true)
    }
  }

  return { caixa, cheia, pegar, alternarCheia }
}
