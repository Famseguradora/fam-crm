'use client'

// ============================================================================
//  O SISTEMA DE ANÁLISE EMBUTIDO  ·  só existe na máquina onde ele roda
//
//  Extraído em 08/09/2026 de `/tomadores/analise-credito`, que deixou de ser
//  tela: a análise de crédito passou a ter UMA porta só no CRM (`/analises`),
//  por ordem dele — "dentro do fluxo não podemos ter várias telas de análise de
//  crédito, devemos ter apenas uma tela".
//
//  O motor não é software de servidor: ele chama o Claude da máquina, lê PDF do
//  OneDrive e faz OCR por PowerShell. Continua em 127.0.0.1:7311, e é lá que a
//  análise é FEITA hoje. Nesta máquina, esta aba é o sistema inteiro embutido.
//
//  DOIS MOTIVOS DE FALHA, e não um (medido em 03/09/2026): ou o sistema está
//  desligado, ou o navegador bloqueou o caminho — o CRM publicado é https e o
//  sistema é http em 127.0.0.1, e o Chrome barra isso como acesso à rede local.
//  Pelo localhost:3000 nada disso se aplica.
// ============================================================================

import { useEffect, useState } from 'react'

const SISTEMA = 'http://127.0.0.1:7311'

type Onde = 'procurando' | 'local' | 'fora'

export default function SistemaLocal() {
  const [onde, setOnde] = useState<Onde>('procurando')
  const [bloqueio, setBloqueio] = useState(false)

  useEffect(() => {
    let vivo = true
    const publicado = typeof window !== 'undefined' && window.location.protocol === 'https:'
    // 3s, e não 6: numa volta de loopback a resposta é instantânea, e quem
    // espera esse tempo é justamente quem NÃO tem o sistema.
    const t = setTimeout(() => { if (vivo) { setOnde('fora'); setBloqueio(publicado) } }, 3000)

    fetch(`${SISTEMA}/api/status`)
      .then(r => r.json())
      .then(() => { if (vivo) { setOnde('local'); setBloqueio(false) } })
      .catch(() => { if (vivo) { setOnde('fora'); setBloqueio(publicado) } })
      .finally(() => clearTimeout(t))

    return () => { vivo = false; clearTimeout(t) }
  }, [])

  if (onde === 'procurando') {
    return <div style={{ color: '#6080a0', fontSize: 14, padding: 20 }}>Procurando o sistema de análise…</div>
  }

  if (onde === 'local') {
    return (
      <div style={{ height: 'calc(100vh - 260px)', minHeight: 460, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <iframe
          src={SISTEMA}
          title="Sistema de Análises de Crédito FAM"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
      </div>
    )
  }

  return (
    <div className="mt-nota at" style={{ margin: 0 }}>
      {bloqueio ? (
        <>
          <b>O navegador bloqueou o caminho até o sistema.</b> Esta página está em https e o
          sistema roda em <code>{SISTEMA}</code>, que o Chrome trata como rede local. Pelo
          endereço <code>localhost:3000</code>, na máquina do analista, a aba abre normalmente.
        </>
      ) : (
        <>
          <b>O sistema de análise não respondeu.</b> Ele roda na máquina do analista, em{' '}
          <code>{SISTEMA}</code>: duplo clique no <code>Analisar.cmd</code> e volte a esta aba.
          O que já foi publicado continua nas abas <b>Mesa</b> e <b>Acervo</b>, que leem o banco.
        </>
      )}
    </div>
  )
}
