'use client'

/* Análise de crédito dentro do CRM — frente 1.

   O sistema de análise é EMBUTIDO, não reescrito: o motor continua local (ele
   chama o Claude da máquina, lê PDF do OneDrive, faz OCR por PowerShell), e
   aqui a tela dele aparece dentro do CRM. Ver a memória `o-que-o-crm-ja-tem`.

   Sem cabeçalho próprio, de propósito: o sistema já tem o dele, e dois títulos
   um em cima do outro comiam uma faixa de tela por nada.

   Só funciona na máquina onde o sistema roda (o 7311 é 127.0.0.1). De outra
   máquina o iframe não carregaria, e por isso a tela CONFERE antes de embutir
   e explica o que houve, em vez de mostrar um quadro branco. */

import { useEffect, useRef, useState } from 'react'

/** O servidor de produção do Sistema de Análises. A oficina é a 7312. */
const SISTEMA = 'http://127.0.0.1:7311'

export default function AnaliseCreditoPage() {
  const moldura = useRef<HTMLDivElement>(null)
  const [pronto, setPronto] = useState(false)
  const [erro, setErro] = useState(false)

  // ── o sistema está no ar? ────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true
    const t = setTimeout(() => { if (vivo) setErro(true) }, 6000)

    fetch(`${SISTEMA}/api/status`)
      .then(r => r.json())
      .then(() => { if (vivo) { setPronto(true); setErro(false) } })
      .catch(() => { if (vivo) setErro(true) })
      .finally(() => clearTimeout(t))

    return () => { vivo = false; clearTimeout(t) }
  }, [])

  // ── a altura ─────────────────────────────────────────────────────────────
  // O sistema é uma tela inteira: precisa da janela menos tudo que está acima
  // dele. Esse "tudo" NÃO é um número fixo — são a barra do CRM, o ticker de
  // mercado, o de notícias (que tem um X e fecha) e as abas. Por isso é medido,
  // e não escrito no CSS.
  useEffect(() => {
    const el = moldura.current
    if (!el) return

    let ultimo = -1
    const medir = () => {
      const topo = Math.round(el.getBoundingClientRect().top)
      if (Math.abs(topo - ultimo) < 1) return
      ultimo = topo
      el.style.height = `${Math.max(420, window.innerHeight - topo)}px`
    }
    medir()

    // O observador pega o ticker sendo fechado (o corpo encurta). Não entra em
    // laço: o topo da moldura não depende da altura da moldura.
    const ro = new ResizeObserver(medir)
    ro.observe(document.body)
    window.addEventListener('resize', medir)
    return () => { ro.disconnect(); window.removeEventListener('resize', medir) }
  }, [pronto, erro])

  return (
    <div ref={moldura} style={{ display: 'flex', flexDirection: 'column' }}>
      {pronto && (
        <iframe
          src={SISTEMA}
          title="Sistema de Análises de Crédito FAM"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
      )}

      {erro && !pronto && (
        <div style={{
          margin: 28, background: '#fff', border: '1px solid #c5d5e8', borderRadius: 10,
          padding: 28, color: '#46617f', fontSize: 14, lineHeight: 1.7,
          fontFamily: "'Calibri','Segoe UI',sans-serif",
        }}>
          <strong style={{ color: '#0a1628', fontSize: 15 }}>
            O sistema de análise não respondeu.
          </strong>
          <p style={{ margin: '10px 0 0' }}>
            Ele roda na máquina do Marco, em <code>{SISTEMA}</code>, e não no servidor do
            CRM. Se você abriu o CRM de outro computador ou do celular, é isso: a tela
            só carrega na máquina onde o sistema está ligado.
          </p>
          <p style={{ margin: '10px 0 0' }}>
            Na máquina certa, o caminho é dar duplo clique em <code>Analisar.cmd</code>,
            que sobe o servidor, e recarregar esta tela.
          </p>
        </div>
      )}

      {!erro && !pronto && (
        <div style={{
          margin: 28, color: '#6080a0', fontSize: 14,
          fontFamily: "'Calibri','Segoe UI',sans-serif",
        }}>
          Procurando o sistema de análise…
        </div>
      )}
    </div>
  )
}
