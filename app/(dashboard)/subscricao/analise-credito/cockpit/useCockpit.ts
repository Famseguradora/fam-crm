'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AnaliseCockpit, Destaque, Simulacao, BookManual, CockpitMeta, PainelId, Filtros } from './types'

interface CockpitState {
  sessao: AnaliseCockpit | null
  htmlPendente: string | null   // HTML mostrado no iframe antes do DB confirmar a sessão
  destaques: Destaque[]
  simulacoes: Simulacao[]
  bookManual: BookManual[]
  filtrosBP: Filtros
  painelAtivo: PainelId
  loading: boolean
  salvando: boolean
}

const filtrosDefault: Filtros = { modalidade: null, status: null, periodo: '12m' }

export function useCockpit(tomadorId: string | null) {
  const supabase = createClient()
  const [state, setState] = useState<CockpitState>({
    sessao: null,
    htmlPendente: null,
    destaques: [],
    simulacoes: [],
    bookManual: [],
    filtrosBP: filtrosDefault,
    painelAtivo: 'analise',
    loading: false,
    salvando: false,
  })

  const merge = (patch: Partial<CockpitState>) =>
    setState(s => ({ ...s, ...patch }))

  const loadSessao = useCallback(async (tid: string) => {
    merge({ loading: true })
    const { data: sessao } = await supabase
      .from('analise_cockpit')
      .select('*')
      .eq('tomador_id', tid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!sessao) {
      merge({ sessao: null, destaques: [], simulacoes: [], bookManual: [], loading: false })
      return
    }

    const [{ data: destaques }, { data: simulacoes }, { data: bookManual }] = await Promise.all([
      supabase.from('cockpit_destaques').select('*').eq('cockpit_id', sessao.id).order('created_at'),
      supabase.from('cockpit_simulacoes').select('*').eq('cockpit_id', sessao.id).order('created_at'),
      supabase.from('cockpit_book_manual').select('*').eq('cockpit_id', sessao.id).order('created_at'),
    ])

    merge({
      sessao: sessao as AnaliseCockpit,
      destaques: (destaques || []) as Destaque[],
      simulacoes: (simulacoes || []) as Simulacao[],
      bookManual: (bookManual || []) as BookManual[],
      loading: false,
    })
  }, [supabase])

  const salvarHTML = useCallback(async (html: string) => {
    if (!tomadorId) return
    merge({ salvando: true })
    const { data: { user } } = await supabase.auth.getUser()

    if (state.sessao) {
      // Atualiza imediatamente na tela (otimista) — sessão já existe, UUID real
      merge({ sessao: { ...state.sessao, html_conteudo: html } })
      const { error } = await supabase.from('analise_cockpit')
        .update({ html_conteudo: html, updated_at: new Date().toISOString() })
        .eq('id', state.sessao.id)
      if (error) console.error('[cockpit] salvarHTML update:', error)
      merge({ salvando: false })
    } else {
      // Sem sessão: mostra HTML no iframe via htmlPendente (sem criar UUID falso)
      // Destaques só funcionarão depois que o DB confirmar o cockpit_id real
      merge({ htmlPendente: html })
      const { data, error } = await supabase.from('analise_cockpit').insert({
        tomador_id: tomadorId,
        criado_por: user?.id ?? null,
        html_conteudo: html,
      }).select().single()
      if (data) {
        merge({ sessao: data as AnaliseCockpit, htmlPendente: null, salvando: false })
      } else {
        console.error('[cockpit] salvarHTML insert:', error)
        merge({ salvando: false })
      }
    }
  }, [supabase, tomadorId, state.sessao])

  const salvarMeta = useCallback(async (meta: CockpitMeta) => {
    if (!state.sessao) return
    await supabase.from('analise_cockpit').update({ meta, updated_at: new Date().toISOString() }).eq('id', state.sessao.id)
    merge({ sessao: { ...state.sessao, meta } })
  }, [supabase, state.sessao])

  const salvarNotas = useCallback(async (notas: string) => {
    if (!state.sessao) return
    await supabase.from('analise_cockpit').update({ notas, updated_at: new Date().toISOString() }).eq('id', state.sessao.id)
    merge({ sessao: { ...state.sessao, notas } })
  }, [supabase, state.sessao])

  const adicionarDestaque = useCallback(async (texto: string, secao?: string) => {
    if (!state.sessao) return
    const { data } = await supabase.from('cockpit_destaques').insert({
      cockpit_id: state.sessao.id,
      texto,
      secao: secao || null,
    }).select().single()
    if (data) merge({ destaques: [...state.destaques, data as Destaque] })
  }, [supabase, state.sessao, state.destaques])

  const removerDestaque = useCallback(async (id: string) => {
    await supabase.from('cockpit_destaques').delete().eq('id', id)
    merge({ destaques: state.destaques.filter(d => d.id !== id) })
  }, [supabase, state.destaques])

  const salvarSimulacao = useCallback(async (sim: Omit<Simulacao, 'id' | 'cockpit_id' | 'created_at'>) => {
    if (!state.sessao) return
    const { data } = await supabase.from('cockpit_simulacoes').insert({
      ...sim,
      cockpit_id: state.sessao.id,
    }).select().single()
    if (data) merge({ simulacoes: [...state.simulacoes, data as Simulacao] })
  }, [supabase, state.sessao, state.simulacoes])

  const toggleSimulacao = useCallback(async (id: string, ativo: boolean) => {
    await supabase.from('cockpit_simulacoes').update({ ativo }).eq('id', id)
    merge({ simulacoes: state.simulacoes.map(s => s.id === id ? { ...s, ativo } : s) })
  }, [supabase, state.simulacoes])

  const removerSimulacao = useCallback(async (id: string) => {
    await supabase.from('cockpit_simulacoes').delete().eq('id', id)
    merge({ simulacoes: state.simulacoes.filter(s => s.id !== id) })
  }, [supabase, state.simulacoes])

  const adicionarBookManual = useCallback(async (entry: Omit<BookManual, 'id' | 'cockpit_id' | 'created_at'>) => {
    if (!state.sessao) return
    const { data } = await supabase.from('cockpit_book_manual').insert({
      ...entry,
      cockpit_id: state.sessao.id,
    }).select().single()
    if (data) merge({ bookManual: [...state.bookManual, data as BookManual] })
  }, [supabase, state.sessao, state.bookManual])

  const removerBookManual = useCallback(async (id: string) => {
    await supabase.from('cockpit_book_manual').delete().eq('id', id)
    merge({ bookManual: state.bookManual.filter(b => b.id !== id) })
  }, [supabase, state.bookManual])

  const setPainelAtivo = (p: PainelId) => merge({ painelAtivo: p })
  const setFiltrosBP = (f: Filtros) => merge({ filtrosBP: f })

  return {
    ...state,
    loadSessao,
    salvarHTML,
    salvarMeta,
    salvarNotas,
    adicionarDestaque,
    removerDestaque,
    salvarSimulacao,
    toggleSimulacao,
    removerSimulacao,
    adicionarBookManual,
    removerBookManual,
    setPainelAtivo,
    setFiltrosBP,
  }
}
