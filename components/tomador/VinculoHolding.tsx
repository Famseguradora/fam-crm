'use client'

// ============================================================================
//  O VÍNCULO DE GRUPO ECONÔMICO: A SPE APONTA PARA A HOLDING
//
//  Pedido do Marco em 18/09/2026: a Yuny Stan Projeto Imobiliário I S.A. é uma
//  SPE cujos demonstrativos são os da Yuny Incorporadora Holding S.A., já
//  cadastrada e analisada. Sem vínculo, as duas ficam como ilhas — mesmo CNPJ
//  diferente, mesmo grupo.
//
//  A regra é a mais simples que resolve o caso ("por ora, será simples"): um
//  `holding_id` auto-referenciado em `tomadores` (ver
//  supabase-migration-vinculo-holding.sql), travado em UM nível — quem já é
//  holding de alguém não pode virar SPE de outra empresa, e a busca abaixo só
//  oferece como holding quem ainda não tem holding própria.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Tomador } from '@/types'
import { maskCNPJ } from '@/lib/utils'
import { Bloco } from '@/components/analise/Relatorio'
import { cor } from '@/lib/ui/painel'

type Candidato = { id: string; razao_social: string; cnpj: string | null }

export default function VinculoHolding({ tomador, usuarioInfo, onMudou }: {
  tomador: Tomador
  usuarioInfo: { authId: string; nome: string | null; email: string | null } | null
  onMudou: () => void | Promise<void>
}) {
  const router = useRouter()
  const [subsidiarias, setSubsidiarias] = useState<Candidato[]>([])
  const [buscando, setBuscando] = useState(false)
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<Candidato[]>([])
  const [procurando, setProcurando] = useState(false)
  const [vinculando, setVinculando] = useState(false)
  const [confirmDesvincular, setConfirmDesvincular] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const carregarSubsidiarias = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('tomadores')
      .select('id,razao_social,cnpj')
      .eq('holding_id', tomador.id).eq('ativo', true)
      .order('razao_social')
    setSubsidiarias((data as Candidato[]) ?? [])
  }, [tomador.id])

  useEffect(() => { carregarSubsidiarias() }, [carregarSubsidiarias])

  function mudouTermo(v: string) {
    setTermo(v)
    if (timer.current) clearTimeout(timer.current)
    if (v.trim().length < 2) { setResultados([]); return }
    timer.current = setTimeout(async () => {
      setProcurando(true)
      const supabase = createClient()
      const digitos = v.replace(/\D/g, '')
      const filtro = digitos.length >= 3
        ? `cnpj.ilike.%${digitos}%`
        : `razao_social.ilike.%${v.trim()}%,nome_fantasia.ilike.%${v.trim()}%`
      const { data } = await supabase.from('tomadores')
        .select('id,razao_social,cnpj')
        .neq('id', tomador.id).is('holding_id', null).eq('ativo', true)
        .or(filtro).order('razao_social').limit(8)
      setResultados((data as Candidato[]) ?? [])
      setProcurando(false)
    }, 300)
  }

  async function vincular(holding: Candidato) {
    setVinculando(true); setErro(null)
    const supabase = createClient()
    const { error } = await supabase.from('tomadores')
      .update({ holding_id: holding.id }).eq('id', tomador.id)
    if (error) { setErro(error.message); setVinculando(false); return }
    await supabase.from('audit_log').insert({
      tabela: 'tomadores', acao: 'vinculo_holding', registro_id: tomador.id,
      dados_antes: { holding_id: tomador.holding_id ?? null },
      dados_depois: { holding_id: holding.id, holding_razao_social: holding.razao_social },
      usuario_auth_id: usuarioInfo?.authId ?? null,
      usuario_nome: usuarioInfo?.nome ?? null,
      usuario_email: usuarioInfo?.email ?? null,
    })
    setVinculando(false); setBuscando(false); setTermo(''); setResultados([])
    await onMudou()
  }

  async function desvincular() {
    setVinculando(true); setErro(null)
    const supabase = createClient()
    const { error } = await supabase.from('tomadores')
      .update({ holding_id: null }).eq('id', tomador.id)
    if (error) { setErro(error.message); setVinculando(false); return }
    await supabase.from('audit_log').insert({
      tabela: 'tomadores', acao: 'vinculo_holding', registro_id: tomador.id,
      dados_antes: { holding_id: tomador.holding_id ?? null },
      dados_depois: { holding_id: null },
      usuario_auth_id: usuarioInfo?.authId ?? null,
      usuario_nome: usuarioInfo?.nome ?? null,
      usuario_email: usuarioInfo?.email ?? null,
    })
    setVinculando(false); setConfirmDesvincular(false)
    await onMudou()
  }

  const holding = tomador.holding ?? null
  const jaEHolding = subsidiarias.length > 0

  return (
    <Bloco titulo="Vínculo de grupo econômico" cor={cor.areaTomador}>
      {erro && (
        <div className="mt-nota" style={{ borderColor: cor.alertaBorda, background: cor.alertaFundo, color: cor.alerta, marginBottom: 8 }}>
          {erro}
        </div>
      )}

      {holding ? (
        <div className="mt-nota at" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 9 }}>
          <span>
            Vinculada à holding <b>{holding.razao_social}</b>
            {holding.cnpj && <> ({maskCNPJ(holding.cnpj)})</>}. Os demonstrativos e a análise
            mostrados neste tomador, quando ele não tem análise própria, são os da holding.
          </span>
          <span style={{ display: 'flex', gap: 7, marginLeft: 'auto' }}>
            <button type="button" className="mt-btn" onClick={() => router.push(`/tomadores/${holding.id}`)}>
              Abrir a holding
            </button>
            <button type="button" className="mt-btn" style={{ color: cor.alerta, borderColor: cor.alertaBorda }}
              onClick={() => setConfirmDesvincular(true)}>
              Desvincular
            </button>
          </span>
        </div>
      ) : jaEHolding ? (
        <div className="mt-nota">
          Este tomador já é a holding de <b>{subsidiarias.length}</b> empresa{subsidiarias.length > 1 ? 's' : ''} do grupo.
          Uma holding não pode virar SPE de outra — desvincule as SPEs abaixo primeiro se isso estiver errado.
        </div>
      ) : !buscando ? (
        <button type="button" className="mt-btn" onClick={() => setBuscando(true)}>
          Vincular à holding
        </button>
      ) : (
        <div>
          <input className="fam-input" type="text" autoFocus placeholder="Razão social ou CNPJ da holding…"
            value={termo} onChange={e => mudouTermo(e.target.value)} />
          {procurando && <div className="mt-vazio" style={{ padding: '10px 0' }}>Procurando…</div>}
          {!procurando && termo.trim().length >= 2 && resultados.length === 0 && (
            <div className="mt-vazio" style={{ padding: '10px 0' }}>
              Nenhum tomador ativo encontrado (só aparecem os que ainda não têm holding própria).
            </div>
          )}
          {resultados.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
              {resultados.map(r => (
                <button key={r.id} type="button" className="mt-btn" disabled={vinculando}
                  style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => vincular(r)}>
                  <b>{r.razao_social}</b>{r.cnpj && <>&nbsp;· {maskCNPJ(r.cnpj)}</>}
                </button>
              ))}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <button type="button" className="mt-btn" onClick={() => { setBuscando(false); setTermo(''); setResultados([]) }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {subsidiarias.length > 0 && (
        <div style={{ marginTop: holding || jaEHolding || buscando ? 12 : 0 }}>
          <div className="mt-lab" style={{ marginBottom: 6 }}>Empresas vinculadas a esta holding</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {subsidiarias.map(s => (
              <button key={s.id} type="button" className="mt-pend-item" onClick={() => router.push(`/tomadores/${s.id}`)}>
                <span className="mt-pend-pt" style={{ background: cor.areaTomador }} />
                <span>{s.razao_social}{s.cnpj && <> · {maskCNPJ(s.cnpj)}</>}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {confirmDesvincular && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setConfirmDesvincular(false) }}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <div className="modal-title">Desvincular da holding</div>
              <button onClick={() => setConfirmDesvincular(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#1a2a3a' }}>
              Desvincular <b>{tomador.razao_social}</b> de <b>{holding?.razao_social}</b>? Esta SPE deixa de
              mostrar a análise da holding quando não tiver a própria.
            </p>
            <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="btn-secondary" onClick={() => setConfirmDesvincular(false)}>Cancelar</button>
              <button className="btn-danger" onClick={desvincular} disabled={vinculando}>
                {vinculando ? 'Desvinculando…' : 'Desvincular'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Bloco>
  )
}
