'use client'

// ============================================================================
//  A PORTA PARA O RELATÓRIO DE VERDADE
//
//  Ordem dele em 09/09/2026, e ela é a régua para tudo o que vier:
//
//    "Toda a tecnologia que tem no Relatório ainda não temos nessas telas, a
//     ideia é que um dia teremos, mas ainda não temos."
//
//  Ou seja: as seções do CRM servem para LER e para conferir, e a edição de
//  verdade continua no template do Sistema de Análise (127.0.0.1:7311), que
//  tem o organograma, a memória de cálculo viva, o recálculo do Score e o
//  resto. Enquanto isso for verdade, TODA tela que mostra uma análise precisa
//  levar até lá em um clique — e não só o card do tomador, que era o único
//  lugar com esse botão.
//
//  O caso que provou a falta: análise de dias anteriores não aparece na Mesa
//  (a Mesa é a esteira de agora), então o caminho dele é o Acervo. E do Acervo
//  não havia como chegar no relatório: ele abria o CRM, via que não dava para
//  editar, e ia abrir o sistema antigo na mão.
//
//  O BOTÃO SÓ EXISTE QUANDO A MÁQUINA RESPONDE. O 7311 é o notebook dele:
//  quem abrir o CRM de outro computador não tem esse endereço, e um link que
//  leva a "não foi possível conectar" é pior que link nenhum. Por isso a
//  pergunta é feita uma vez, na abertura, e o resultado vale para a tela toda.
// ============================================================================

import { useEffect, useState } from 'react'
import { SISTEMA_LOCAL, linkRelatorio, linkGerencial, linkComoEntregue } from './card/comum'

/** O Sistema de Análise responde NESTA máquina? Uma pergunta só, na abertura.
 *  Serve para mostrar ou esconder o que depende dele; nunca para encher tela. */
export function useSistemaLocal(): boolean {
  const [local, setLocal] = useState(false)
  useEffect(() => {
    let vivo = true
    fetch(`${SISTEMA_LOCAL}/api/status`, { signal: AbortSignal.timeout(2500) })
      .then(r => r.json())
      .then(() => { if (vivo) setLocal(true) })
      .catch(() => { /* desligado, ou não é a máquina dele: fica sem os botões */ })
    return () => { vivo = false }
  }, [])
  return local
}

/** Os botões que abrem a análise no template. `chave` é o `chave_local`
 *  (CNPJ + data), que é como o Sistema de Análise a conhece. */
export function PortaDoRelatorio({ chave, compacto }: { chave: string | null; compacto?: boolean }) {
  const local = useSistemaLocal()
  if (!chave || !local) return null

  if (compacto) {
    return (
      <a
        className="an-bt mini ouro"
        href={linkRelatorio(chave)}
        target="_blank"
        rel="noopener"
        onClick={e => e.stopPropagation()}
        title="Abrir esta análise no relatório, onde ela é editada. Só nesta máquina."
      >
        Relatório
      </a>
    )
  }

  return (
    <>
      <a className="an-bt ouro" href={linkRelatorio(chave)} target="_blank" rel="noopener"
        title="Abre a análise no template, onde ela é editada. Só nesta máquina.">
        Abrir o relatório para editar
      </a>
      <a className="an-bt" href={linkComoEntregue(chave)} target="_blank" rel="noopener"
        title="A análise do jeito que o motor entregou, antes da sua edição. Somente leitura.">
        Como eu entreguei
      </a>
      <a className="an-bt" href={linkGerencial(chave)} target="_blank" rel="noopener"
        title="Relatório de uma página, com a conclusão em destaque, para anexar no e-mail">
        Gerencial
      </a>
    </>
  )
}

/** A frase que explica por que o botão não está aí. Só aparece quando não há
 *  botão: dizer "abra na sua máquina" para quem JÁ está nela seria ruído. */
export function SemSistemaLocal({ chave }: { chave: string | null }) {
  const local = useSistemaLocal()
  if (!chave || local) return null
  return (
    <span style={{ fontSize: 12, color: 'var(--soft)' }}>
      O relatório para editar abre no Sistema de Análise, que roda no notebook do Marco. Nesta
      máquina ele não respondeu.
    </span>
  )
}
