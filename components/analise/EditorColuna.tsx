'use client'

// ============================================================================
//  CRIAR E ARRUMAR UMA COLUNA DA MESA  ·  17/09/2026
//
//  Pedido dele: "igual o Trello, eu posso criar novas colunas". A janela é a
//  mesma para criar e para mexer: nome, cor, posição, e arquivar.
//
//  AS CINCO DO SISTEMA (as com `fase`) podem ser renomeadas, pintadas e
//  mudadas de lugar, mas não arquivadas: é nelas que o card automático cai,
//  e sem elas uma análise nova não teria onde aparecer. O banco também recusa
//  (constraint `analise_colunas_sistema_nao_arquiva`), então o botão some
//  aqui para a tela não oferecer o que o servidor vai negar.
//
//  ARQUIVAR NÃO SOME COM CARD: o card que estava na coluna arquivada volta
//  sozinho para a coluna automática da fase dele (`colunaDoCard`).
// ============================================================================

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SERIE } from '@/lib/ui/painel'
import type { ColunaMesa } from '@/lib/analise/mesa'

/* A paleta é a de série do CRM, mais o cinza da Entrada. Nada de roxo nem
   neon: a regra de ouro vale para coluna também. */
const CORES = ['#8a95a3', ...SERIE] as const

export default function EditorColuna({ coluna, colunas, aoFechar, aoSalvar }: {
  /** `null` = coluna nova. */
  coluna: ColunaMesa | null
  /** As colunas visíveis, na ordem da tela: é com elas que se troca de lugar. */
  colunas: ColunaMesa[]
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const nova = !coluna
  const [titulo, setTitulo] = useState(coluna?.titulo ?? '')
  const [cor, setCor] = useState(coluna?.cor ?? CORES[4])
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')

  const i = coluna ? colunas.findIndex((c) => c.id === coluna.id) : -1
  /* Colunas do código (id `fase:...`) aparecem só quando o banco não respondeu.
     Não dá para gravar nelas, então a janela avisa em vez de falhar calada. */
  const doCodigo = !!coluna?.id.startsWith('fase:')

  async function salvar() {
    const t = titulo.trim()
    if (!t) { setErro('Dê um nome à coluna.'); return }
    if (t.length > 40) { setErro('Nome com até 40 letras.'); return }
    if (colunas.some((c) => c.id !== coluna?.id && c.titulo.trim().toLowerCase() === t.toLowerCase())) {
      setErro(`Já existe uma coluna "${t}".`); return
    }
    setOcupado(true); setErro('')
    const supabase = createClient()
    const agora = new Date().toISOString()
    // Quem criou fica gravado só como informação: a trava de quem pode é a RLS.
    let quem: string | null = null
    if (nova) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
        quem = data?.nome ?? user.email ?? null
      }
    }
    const { error } = nova
      /* A coluna nova entra no FIM do quadro: é onde o Trello põe, e é onde a
         pessoa acabou de clicar. */
      ? await supabase.from('analise_colunas').insert({
          titulo: t, cor, criado_por: quem,
          ordem: (colunas.at(-1)?.ordem ?? 50) + 10,
        })
      : await supabase.from('analise_colunas').update({ titulo: t, cor, atualizado_em: agora }).eq('id', coluna!.id)
    setOcupado(false)
    if (error) { setErro(error.message); return }
    aoSalvar()
  }

  /* TROCAR DE LUGAR é trocar a `ordem` com a vizinha. Duas gravações, porque
     o PostgREST não faz troca atômica; se a segunda falhar, as duas colunas
     ficam com a mesma ordem e o desempate é pelo nome, que não quebra nada. */
  async function mover(para: -1 | 1) {
    if (!coluna || doCodigo) return
    const vizinha = colunas[i + para]
    if (!vizinha || vizinha.id.startsWith('fase:')) return
    setOcupado(true); setErro('')
    const supabase = createClient()
    const agora = new Date().toISOString()
    // Ordens iguais (colunas antigas) não trocam nada: dá um passo a mais.
    const minha = coluna.ordem === vizinha.ordem ? vizinha.ordem + para : vizinha.ordem
    const r1 = await supabase.from('analise_colunas').update({ ordem: minha, atualizado_em: agora }).eq('id', coluna.id)
    const r2 = await supabase.from('analise_colunas').update({ ordem: coluna.ordem, atualizado_em: agora }).eq('id', vizinha.id)
    setOcupado(false)
    const e = r1.error ?? r2.error
    if (e) { setErro(e.message); return }
    aoSalvar()
  }

  async function arquivar() {
    if (!coluna || coluna.fase || doCodigo) return
    setOcupado(true); setErro('')
    const supabase = createClient()
    const { error } = await supabase.from('analise_colunas')
      .update({ arquivada: true, atualizado_em: new Date().toISOString() }).eq('id', coluna.id)
    setOcupado(false)
    if (error) { setErro(error.message); return }
    aoSalvar()
  }

  return (
    <div className="an-modal" onClick={aoFechar}>
      <div className="an-modal-caixa" role="dialog" aria-label={nova ? 'Nova coluna' : `Coluna ${coluna?.titulo}`}
        onClick={(e) => e.stopPropagation()}>
        <h3>{nova ? 'Nova coluna na Mesa' : `Coluna ${coluna?.titulo}`}</h3>
        <p className="an-explica">
          {nova
            ? 'A coluna aparece no fim do quadro. Um card entra nela quando você escolhe, no botão "Mudar o substatus" dentro do card.'
            : coluna?.fase
              ? 'Coluna do sistema: o card cai aqui sozinho, pela fase da análise. Dá para renomear, pintar e mudar de lugar.'
              : 'Coluna sua. O card só entra aqui quando alguém escolhe, e fica até alguém tirar.'}
        </p>

        {doCodigo ? (
          <div className="an-dica">As colunas ainda não carregaram do banco. Feche e tente de novo em alguns segundos.</div>
        ) : (
          <>
            <div className="an-campo">
              <label htmlFor="col-nome">Nome</label>
              <input id="col-nome" type="text" value={titulo} maxLength={40} autoFocus
                placeholder="Ex.: Interrompido, Aguardando reunião, Não analisar"
                onChange={(e) => setTitulo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') salvar() }} />
            </div>

            <div className="an-campo">
              <label>Cor</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {CORES.map((c) => (
                  <button key={c} type="button" onClick={() => setCor(c)} aria-label={`Cor ${c}`}
                    style={{
                      width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer',
                      border: cor === c ? '3px solid #0a1628' : '2px solid #fff',
                      boxShadow: '0 0 0 1px #c5d5e8',
                    }} />
                ))}
              </div>
            </div>

            {!nova && (
              <div className="an-campo">
                <label>Posição no quadro</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="an-bt" disabled={ocupado || i <= 0} onClick={() => mover(-1)}>← Para a esquerda</button>
                  <button type="button" className="an-bt" disabled={ocupado || i < 0 || i >= colunas.length - 1} onClick={() => mover(1)}>Para a direita →</button>
                </div>
              </div>
            )}
          </>
        )}

        {erro && <div className="an-aviso erro" style={{ margin: '4px 0 0' }}>{erro}</div>}

        <div className="an-modal-bts">
          {!nova && !coluna?.fase && !doCodigo && (
            <button type="button" className="an-bt" style={{ marginRight: 'auto' }} disabled={ocupado} onClick={arquivar}
              title="Tira a coluna do quadro. Os cards que estavam nela voltam para a coluna automática da fase deles.">
              Arquivar coluna
            </button>
          )}
          <button type="button" className="an-bt" onClick={aoFechar}>Cancelar</button>
          {!doCodigo && (
            <button type="button" className="an-bt azul" onClick={salvar} disabled={ocupado}>
              {nova ? 'Criar coluna' : 'Guardar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
