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

    let ultima = -1
    const medir = () => {
      // `top` é medido contra a JANELA, não contra o documento: com a página
      // rolada ele encolhe, e a conta devolveria uma moldura alta demais. Somar
      // a rolagem devolve a distância de verdade até o topo, que não muda.
      const topo = Math.round(el.getBoundingClientRect().top + window.scrollY)
      // Sem piso de altura (01/09/2026). Havia um `Math.max(420, …)` aqui, e ele
      // era a segunda maneira de a página voltar a rolar: numa janela baixa, 420px
      // de moldura não cabiam nos ~330 que sobravam, o excedente virava rolagem e o
      // botão da IA sumia de novo. Esta tela é, por definição, a janela menos o que
      // está acima dela · pedir mais do que existe é o que não pode. O cockpit já
      // sabe se virar apertado: quem rola é o miolo dele, por dentro.
      const altura = Math.max(0, window.innerHeight - topo)
      // O GUARDA É A ALTURA, e não o topo (01/09/2026). Guardando o topo, mudar
      // só a ALTURA da janela não mexia nele: `medir` era chamado, saía na
      // primeira linha, e a moldura ficava com a altura da janela ANTIGA. A
      // página do CRM passava a rolar, e o botão da IA de Gestão — que é fixo no
      // rodapé do iframe, e não da janela — ia parar fora da tela. Só voltava
      // rolando. Encolher a janela é o caso de todo dia: maximizar, tirar do
      // maximizado, abrir o DevTools, sair da tela cheia.
      if (Math.abs(altura - ultima) < 1) return
      ultima = altura
      el.style.height = `${altura}px`
    }
    medir()

    // Não entra em laço: medir de novo dá a MESMA altura, e a segunda passada sai
    // no guarda acima.
    const ro = new ResizeObserver(medir)
    ro.observe(document.body)

    /* O CORPO SOZINHO NÃO CONTA A HISTÓRIA (01/09/2026). O container do CRM tem
       `min-height: 100vh`, então quando o ticker de notícias é FECHADO no X o corpo
       não encurta — ele já estava no mínimo —, o observador não acorda e a moldura
       fica com a altura de antes, deixando uma faixa morta no pé da janela.

       Quem empurra a moldura para baixo é tudo que vem ACIMA dela: a barra do CRM,
       o ticker de mercado, o de notícias e as abas. Então é isso que se observa —
       cada irmão anterior na cadeia de pais, que é exatamente o conjunto de quem
       muda o topo. Sem lista de seletores: o dia em que nascer mais uma faixa lá em
       cima, ela já entra sozinha. */
    for (let no: HTMLElement | null = el; no && no !== document.body; no = no.parentElement) {
      for (let irmao = no.previousElementSibling; irmao; irmao = irmao.previousElementSibling) {
        ro.observe(irmao)
      }
    }

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
