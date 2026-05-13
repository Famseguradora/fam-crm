'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { maskCNPJ, fmtMoeda, fmtData, fmtPercent } from '@/lib/utils'
import type { Operacao, Tomador, Corretora, Produto, StatusFluxo } from '@/types'

interface ModalidadeBasica {
  id: string
  nome: string
  codigo_cobertura: string | null
  produto_id: string | null
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormOperacao {
  tomador_id: string
  corretora_id: string
  produto_id: string
  modalidade_id: string
  modalidade: string
  codigo_cobertura: string
  corretor: string
  lmg: string
  taxa: string
  vigencia_anos: string
  premio_previsto: string
  temperatura: string
  prioridade: string
  estado: string
  observacao: string
  status: string
  ativo: boolean
}

interface FormStatus {
  nome: string
  cor: string
  ordem: string
  ativo: boolean
}

const FORM_OP_INICIAL: FormOperacao = {
  tomador_id: '', corretora_id: '', produto_id: '', modalidade_id: '',
  modalidade: '', codigo_cobertura: '', corretor: '', lmg: '', taxa: '',
  vigencia_anos: '', premio_previsto: '', temperatura: 'Frio',
  prioridade: 'Fluxo Normal', estado: '', observacao: '', status: 'Triagem', ativo: true,
}

const FORM_STATUS_INICIAL: FormStatus = { nome: '', cor: '#6080a0', ordem: '99', ativo: true }

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

const CORES_RAPIDAS = [
  '#3070c8','#27a96c','#d64545','#e8b84b','#6030a0',
  '#a05010','#1a7a50','#a0c0e8','#6080a0','#102040',
]

const PRIORIDADE_ORDEM: Record<string, number> = {
  'Urgente': 0, 'Prioridade': 1, 'Fluxo Normal': 2,
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OperacoesPage() {
  const [aba, setAba] = useState<'operacoes' | 'status'>('operacoes')

  // ── Operações ──
  const [operacoes, setOperacoes] = useState<Operacao[]>([])
  const [tomadores, setTomadores] = useState<Tomador[]>([])
  const [corretoras, setCorretoras] = useState<Corretora[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [modalidades, setModalidades] = useState<ModalidadeBasica[]>([])
  const [statusOpcoes, setStatusOpcoes] = useState<StatusFluxo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando] = useState<Operacao | null>(null)
  const [form, setForm] = useState<FormOperacao>(FORM_OP_INICIAL)
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroPrioridade, setFiltroPrioridade] = useState('')
  const [filtroTemperatura, setFiltroTemperatura] = useState('')
  const [filtroCorretora, setFiltroCorretora] = useState('')
  const [filtroProduto, setFiltroProduto] = useState('')
  const [exportando, setExportando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [resultadoImport, setResultadoImport] = useState<{
    inseridos: number
    erros: { linha: number; tomador: string; motivo: string }[]
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Status ──
  const [statusLista, setStatusLista] = useState<StatusFluxo[]>([])
  const [carregandoStatus, setCarregandoStatus] = useState(true)
  const [mostrarFormStatus, setMostrarFormStatus] = useState(false)
  const [editandoStatus, setEditandoStatus] = useState<StatusFluxo | null>(null)
  const [formStatus, setFormStatus] = useState<FormStatus>(FORM_STATUS_INICIAL)
  const [enviandoStatus, setEnviandoStatus] = useState(false)
  const [msgStatus, setMsgStatus] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const [confirmExcluir, setConfirmExcluir] = useState<StatusFluxo | null>(null)

  // ─── Loaders ────────────────────────────────────────────────────────────────

  const carregarOperacoes = useCallback(async () => {
    setCarregando(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('operacoes')
      .select('*, tomador:tomadores(id,razao_social,cnpj,porte), corretora:corretoras(id,razao_social), produto:produtos(id,nome)')
      .eq('ativo', true)
      .order('created_at', { ascending: false })
    setOperacoes((data as Operacao[]) ?? [])
    setCarregando(false)
  }, [])

  const carregarStatusLista = useCallback(async () => {
    setCarregandoStatus(true)
    const supabase = createClient()
    const { data } = await supabase.from('status_fluxo_operacao').select('*').order('ordem')
    setStatusLista((data as StatusFluxo[]) ?? [])
    setStatusOpcoes((data as StatusFluxo[]) ?? [])
    setCarregandoStatus(false)
  }, [])

  const carregarAuxiliares = useCallback(async () => {
    const supabase = createClient()
    const [{ data: tom }, { data: cor }, { data: prod }, { data: mod }] = await Promise.all([
      supabase.from('tomadores').select('id,razao_social,cnpj').eq('ativo', true).order('razao_social'),
      supabase.from('corretoras').select('id,razao_social').eq('status', 'ativo').order('razao_social'),
      supabase.from('produtos').select('id,nome,codigo').eq('status', 'ativo').order('codigo'),
      supabase.from('modalidades').select('id,nome,codigo_cobertura,produto_id').eq('status', 'ativo').order('codigo_cobertura'),
    ])
    setTomadores((tom as Tomador[]) ?? [])
    setCorretoras((cor as Corretora[]) ?? [])
    setProdutos((prod as unknown as Produto[]) ?? [])
    setModalidades((mod as ModalidadeBasica[]) ?? [])
  }, [])

  useEffect(() => {
    carregarOperacoes()
    carregarStatusLista()
    carregarAuxiliares()
  }, [carregarOperacoes, carregarStatusLista, carregarAuxiliares])

  // ─── Operações CRUD ─────────────────────────────────────────────────────────

  function abrirNovo() {
    setEditando(null)
    setForm(FORM_OP_INICIAL)
    setMensagem(null)
    setMostrarForm(true)
  }

  function abrirEditar(op: Operacao) {
    setEditando(op)
    const modMatch = modalidades.find(
      (m) => m.nome === op.modalidade && m.produto_id === op.produto_id
    )
    setForm({
      tomador_id: op.tomador_id ?? '',
      corretora_id: op.corretora_id ?? '',
      produto_id: op.produto_id ?? '',
      modalidade_id: modMatch?.id ?? '',
      modalidade: op.modalidade ?? '',
      codigo_cobertura: op.codigo_cobertura ?? '',
      corretor: op.corretor ?? '',
      lmg: op.lmg != null ? String(op.lmg) : '',
      taxa: op.taxa != null ? String(op.taxa) : '',
      vigencia_anos: op.vigencia_anos != null ? String(op.vigencia_anos) : '',
      premio_previsto: op.premio_previsto != null ? String(op.premio_previsto) : '',
      temperatura: op.temperatura ?? 'Frio',
      prioridade: op.prioridade ?? 'Fluxo Normal',
      estado: op.estado ?? '',
      observacao: op.observacao ?? '',
      status: op.status,
      ativo: op.ativo,
    })
    setMensagem(null)
    setMostrarForm(true)
  }

  function fecharForm() {
    setMostrarForm(false)
    setEditando(null)
    setForm(FORM_OP_INICIAL)
    setMensagem(null)
  }

  function handleSetorChange(prodId: string) {
    setForm((f) => ({ ...f, produto_id: prodId, modalidade_id: '', modalidade: '', codigo_cobertura: '' }))
  }

  function handleModalidadeChange(modalidadeId: string) {
    const mod = modalidades.find((m) => m.id === modalidadeId)
    setForm((f) => ({
      ...f,
      modalidade_id: modalidadeId,
      modalidade: mod?.nome ?? '',
      codigo_cobertura: mod?.codigo_cobertura ?? '',
    }))
  }

  function calcPremio(lmg: string, taxa: string) {
    const l = parseFloat(lmg.replace(/\./g, '').replace(',', '.'))
    const t = parseFloat(taxa.replace(',', '.'))
    if (!isNaN(l) && !isNaN(t) && t > 0) {
      return String((l * t / 100).toFixed(2))
    }
    return ''
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    setEnviando(true)
    setMensagem(null)
    const lmgNum = form.lmg ? parseFloat(form.lmg.replace(/\./g, '').replace(',', '.')) : null
    const taxaNum = form.taxa ? parseFloat(form.taxa.replace(',', '.')) : null
    const payload = {
      tomador_id: form.tomador_id || null,
      corretora_id: form.corretora_id || null,
      produto_id: form.produto_id || null,
      modalidade: form.modalidade || null,
      codigo_cobertura: form.codigo_cobertura || null,
      corretor: form.corretor || null,
      lmg: lmgNum,
      taxa: taxaNum,
      vigencia_anos: form.vigencia_anos ? parseInt(form.vigencia_anos) : null,
      premio_previsto: form.premio_previsto ? parseFloat(form.premio_previsto.replace(/\./g, '').replace(',', '.')) : (taxaNum && lmgNum ? lmgNum * taxaNum / 100 : null),
      temperatura: form.temperatura || null,
      prioridade: form.prioridade,
      estado: form.estado || null,
      observacao: form.observacao || null,
      status: form.status,
      ativo: form.ativo,
    }
    try {
      const supabase = createClient()
      if (editando) {
        const { error } = await supabase.from('operacoes').update(payload).eq('id', editando.id)
        if (error) throw new Error(error.message)
        setMensagem({ tipo: 'sucesso', texto: 'Operação atualizada com sucesso.' })
      } else {
        const { error } = await supabase.from('operacoes').insert(payload)
        if (error) throw new Error(error.message)
        setMensagem({ tipo: 'sucesso', texto: 'Operação cadastrada com sucesso.' })
        setForm(FORM_OP_INICIAL)
      }
      await carregarOperacoes()
    } catch (err: unknown) {
      setMensagem({ tipo: 'erro', texto: err instanceof Error ? err.message : 'Erro desconhecido.' })
    } finally {
      setEnviando(false)
    }
  }

  // Atualização rápida de status direto da tabela
  async function mudarStatus(op: Operacao, novoStatus: string) {
    const supabase = createClient()
    const { error } = await supabase.from('operacoes').update({ status: novoStatus }).eq('id', op.id)
    if (!error) await carregarOperacoes()
  }

  // ─── Status CRUD ────────────────────────────────────────────────────────────

  function abrirNovoStatus() {
    setEditandoStatus(null)
    setFormStatus(FORM_STATUS_INICIAL)
    setMsgStatus(null)
    setMostrarFormStatus(true)
  }

  function abrirEditarStatus(s: StatusFluxo) {
    setEditandoStatus(s)
    setFormStatus({ nome: s.nome, cor: s.cor, ordem: String(s.ordem), ativo: s.ativo })
    setMsgStatus(null)
    setMostrarFormStatus(true)
  }

  function fecharFormStatus() {
    setMostrarFormStatus(false)
    setEditandoStatus(null)
    setFormStatus(FORM_STATUS_INICIAL)
    setMsgStatus(null)
  }

  async function salvarStatus(e: React.SyntheticEvent) {
    e.preventDefault()
    setEnviandoStatus(true)
    setMsgStatus(null)
    const p = {
      nome: formStatus.nome.trim(),
      cor: formStatus.cor,
      ordem: parseInt(formStatus.ordem) || 99,
      ativo: formStatus.ativo,
    }
    try {
      const supabase = createClient()
      if (editandoStatus) {
        const { error } = await supabase.from('status_fluxo_operacao').update(p).eq('id', editandoStatus.id)
        if (error) throw new Error(error.message)
        setMsgStatus({ tipo: 'sucesso', texto: 'Status atualizado.' })
      } else {
        const { error } = await supabase.from('status_fluxo_operacao').insert({ ...p, base: false })
        if (error) throw new Error(error.message)
        setMsgStatus({ tipo: 'sucesso', texto: 'Status criado.' })
        setFormStatus(FORM_STATUS_INICIAL)
      }
      await carregarStatusLista()
    } catch (err: unknown) {
      setMsgStatus({ tipo: 'erro', texto: err instanceof Error ? err.message : 'Erro desconhecido.' })
    } finally {
      setEnviandoStatus(false)
    }
  }

  async function excluirStatus(s: StatusFluxo) {
    const supabase = createClient()
    const { error } = await supabase.from('status_fluxo_operacao').delete().eq('id', s.id)
    if (error) setMsgStatus({ tipo: 'erro', texto: error.message })
    else await carregarStatusLista()
    setConfirmExcluir(null)
  }

  // ─── Derived data ────────────────────────────────────────────────────────────

  const operacoesFiltradas = useMemo(() => {
    let result = operacoes.filter((op) => {
      const buscaLow = busca.toLowerCase()
      const textMatch = !busca ||
        (op.tomador?.razao_social ?? '').toLowerCase().includes(buscaLow) ||
        (op.tomador?.cnpj ?? '').includes(busca.replace(/\D/g, '')) ||
        (op.corretora?.razao_social ?? '').toLowerCase().includes(buscaLow) ||
        (op.produto?.nome ?? '').toLowerCase().includes(buscaLow) ||
        (op.corretor ?? '').toLowerCase().includes(buscaLow)
      const statusMatch = !filtroStatus || op.status === filtroStatus
      const priorMatch = !filtroPrioridade || op.prioridade === filtroPrioridade
      const tempMatch = !filtroTemperatura || op.temperatura === filtroTemperatura
      const corrMatch = !filtroCorretora || op.corretora_id === filtroCorretora
      const prodMatch = !filtroProduto || op.produto_id === filtroProduto
      return textMatch && statusMatch && priorMatch && tempMatch && corrMatch && prodMatch
    })
    // Ordenar por prioridade → created_at
    result = [...result].sort((a, b) => {
      const pa = PRIORIDADE_ORDEM[a.prioridade ?? 'Fluxo Normal'] ?? 2
      const pb = PRIORIDADE_ORDEM[b.prioridade ?? 'Fluxo Normal'] ?? 2
      if (pa !== pb) return pa - pb
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
    return result
  }, [operacoes, busca, filtroStatus, filtroPrioridade, filtroTemperatura, filtroCorretora, filtroProduto])

  const kpis = useMemo(() => {
    const lmgTotal = operacoes.reduce((acc, op) => acc + (op.lmg ?? 0), 0)
    return {
      total: operacoes.length,
      emTriagem: operacoes.filter((op) => op.status === 'Triagem').length,
      emAnalise: operacoes.filter((op) => op.status === 'Em Análise').length,
      aprovados: operacoes.filter((op) => op.status === 'Aprovado' || op.status === 'Emitido').length,
      lmgTotal,
    }
  }, [operacoes])

  // ─── Import CSV ─────────────────────────────────────────────────────────────

  function _parseCsvOp(conteudo: string): string[][] {
    const linhas = conteudo.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    const primeira = linhas.find((l) => l.trim()) ?? ''
    const sep = primeira.includes(';') ? ';' : ','
    return linhas.filter((l) => l.trim()).map((linha) => {
      const campos: string[] = []
      let campo = '', dentro = false
      for (const c of linha) {
        if (c === '"') { dentro = !dentro }
        else if (c === sep && !dentro) { campos.push(campo.trim()); campo = '' }
        else { campo += c }
      }
      campos.push(campo.trim())
      return campos
    })
  }

  function _normOp(str: string) {
    return (str ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
  }

  function _parseDateOp(valor: string): string | null {
    if (!valor) return null
    const br = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (br) {
      const dt = new Date(`${br[3]}-${br[2]}-${br[1]}T00:00:00.000Z`)
      return isNaN(dt.getTime()) ? null : dt.toISOString()
    }
    const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) {
      const dt = new Date(`${iso[0]}T00:00:00.000Z`)
      return isNaN(dt.getTime()) ? null : dt.toISOString()
    }
    return null
  }

  async function importarCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportando(true)
    setResultadoImport(null)

    const conteudo = await file.text()
    const linhas = _parseCsvOp(conteudo.replace(/^﻿/, ''))
    if (linhas.length < 2) { setImportando(false); return }

    const cabecalho = linhas[0].map((h) => h.toLowerCase().trim().replace(/\s+/g, '_'))
    const col = (row: string[], nome: string) => {
      const idx = cabecalho.indexOf(nome)
      return idx !== -1 ? (row[idx] ?? '').trim() : ''
    }
    const dados = linhas.slice(1)

    const supabase = createClient()

    // Lookup tables
    const { data: tomadoresDB } = await supabase.from('tomadores').select('id,cnpj,corretora_id')
    const mapaTomadores = new Map<string, { id: string; corretora_id: string | null }>()
    for (const t of (tomadoresDB ?? []) as { id: string; cnpj: string; corretora_id: string | null }[]) {
      mapaTomadores.set(t.cnpj, { id: t.id, corretora_id: t.corretora_id })
    }

    const { data: corretorasDB } = await supabase.from('corretoras').select('id,razao_social,nome_fantasia')
    const mapaCorretoras = new Map<string, string>()
    for (const c of (corretorasDB ?? []) as { id: string; razao_social: string; nome_fantasia: string | null }[]) {
      if (c.razao_social) mapaCorretoras.set(_normOp(c.razao_social), c.id)
      if (c.nome_fantasia) mapaCorretoras.set(_normOp(c.nome_fantasia), c.id)
    }

    const { data: modalidadesDB } = await supabase.from('modalidades').select('id,nome,codigo_cobertura,produto_id').eq('status', 'ativo')
    const mapaModalidades = new Map<string, { id: string; codigo_cobertura: string | null; produto_id: string | null; nome: string }>()
    for (const m of (modalidadesDB ?? []) as { id: string; nome: string; codigo_cobertura: string | null; produto_id: string | null }[]) {
      mapaModalidades.set(_normOp(m.nome), { id: m.id, codigo_cobertura: m.codigo_cobertura, produto_id: m.produto_id, nome: m.nome })
    }

    const temperaturasValidas = ['Quente', 'Morno', 'Frio']
    const prioridadesValidas = ['Urgente', 'Prioridade', 'Fluxo Normal']

    let inseridos = 0
    const erros: { linha: number; tomador: string; motivo: string }[] = []

    for (let i = 0; i < dados.length; i++) {
      const row = dados[i]
      const linha = i + 2
      const tomadorCnpj = col(row, 'tomador_cnpj').replace(/\D/g, '')
      const tomadorNome = col(row, 'tomador_cnpj') // fallback para exibição no erro

      if (!tomadorCnpj) {
        erros.push({ linha, tomador: tomadorNome || '(vazio)', motivo: 'tomador_cnpj ausente' })
        continue
      }

      const tomadorData = mapaTomadores.get(tomadorCnpj)
      if (!tomadorData) {
        erros.push({ linha, tomador: tomadorCnpj, motivo: 'Tomador não encontrado pelo CNPJ' })
        continue
      }

      const corretoraNome = col(row, 'corretora_nome')
      const corretora_id = corretoraNome
        ? (mapaCorretoras.get(_normOp(corretoraNome)) ?? tomadorData.corretora_id)
        : tomadorData.corretora_id

      const modalidadeNome = col(row, 'modalidade_nome')
      const modalidadeData = modalidadeNome ? mapaModalidades.get(_normOp(modalidadeNome)) : undefined

      const lmgRaw = col(row, 'lmg').replace(/\./g, '').replace(',', '.')
      const taxaRaw = col(row, 'taxa').replace(',', '.')
      const premioRaw = col(row, 'premio_previsto').replace(/\./g, '').replace(',', '.')
      const tempRaw = col(row, 'temperatura')
      const priRaw = col(row, 'prioridade')
      const created_at = _parseDateOp(col(row, 'data_cadastro')) ?? undefined

      const payload: Record<string, unknown> = {
        tomador_id: tomadorData.id,
        corretora_id: corretora_id ?? null,
        corretor: col(row, 'corretor') || null,
        produto_id: modalidadeData?.produto_id ?? null,
        modalidade_id: modalidadeData?.id ?? null,
        modalidade: modalidadeData?.nome ?? col(row, 'modalidade_nome') ?? null,
        codigo_cobertura: modalidadeData?.codigo_cobertura ?? null,
        estado: col(row, 'estado').toUpperCase().slice(0, 2) || null,
        lmg: lmgRaw && !isNaN(parseFloat(lmgRaw)) ? parseFloat(lmgRaw) : null,
        taxa: taxaRaw && !isNaN(parseFloat(taxaRaw)) ? parseFloat(taxaRaw) : null,
        vigencia_anos: col(row, 'vigencia_anos') ? parseInt(col(row, 'vigencia_anos')) || null : null,
        premio_previsto: premioRaw && !isNaN(parseFloat(premioRaw)) ? parseFloat(premioRaw) : null,
        temperatura: temperaturasValidas.includes(tempRaw) ? tempRaw : null,
        prioridade: prioridadesValidas.includes(priRaw) ? priRaw : 'Fluxo Normal',
        observacao: col(row, 'observacao') || null,
        status: col(row, 'status') || 'Triagem',
        ativo: true,
        ...(created_at ? { created_at, updated_at: created_at } : {}),
      }

      const { error } = await supabase.from('operacoes').insert(payload)
      if (error) {
        erros.push({ linha, tomador: tomadorCnpj, motivo: error.message })
      } else {
        inseridos++
      }
    }

    setResultadoImport({ inseridos, erros })
    setImportando(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (inseridos > 0) carregarOperacoes()
  }

  // ─── Exports ────────────────────────────────────────────────────────────────

  async function exportarExcel() {
    setExportando(true)
    const { utils, writeFile } = await import('xlsx')
    const linhas = operacoesFiltradas.map((op, i) => ({
      '#': i + 1,
      'Tomador': op.tomador?.razao_social ?? '—',
      'CNPJ': op.tomador?.cnpj ? maskCNPJ(op.tomador.cnpj) : '—',
      'Corretora': op.corretora?.razao_social ?? '—',
      'Cobertura': op.produto?.nome ?? '—',
      'Modalidade': op.modalidade ?? '—',
      'LMG': op.lmg ?? '—',
      'Taxa (%)': op.taxa ?? '—',
      'Vigência (anos)': op.vigencia_anos ?? '—',
      'Temperatura': op.temperatura ?? '—',
      'Prioridade': op.prioridade ?? '—',
      'Status': op.status,
      'Data': fmtData(op.created_at),
    }))
    const ws = utils.json_to_sheet(linhas)
    ws['!cols'] = [{ wch: 4 }, { wch: 36 }, { wch: 18 }, { wch: 30 }, { wch: 24 }, { wch: 20 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 14 }]
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Operações')
    writeFile(wb, 'FAM_Operacoes.xlsx')
    setExportando(false)
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function corDoStatus(status: string) {
    return statusOpcoes.find((x) => x.nome === status)?.cor ?? '#6080a0'
  }

  function badgePrioridade(p: string | null) {
    if (p === 'Urgente') return 'badge-red'
    if (p === 'Prioridade') return 'badge-orange'
    return 'badge-gray'
  }

  function badgeTemperatura(t: string | null) {
    if (t === 'Quente') return 'badge-red'
    if (t === 'Morno') return 'badge-orange'
    return 'badge-blue'
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const modalidadesDoSetor = form.produto_id
    ? modalidades.filter((m) => m.produto_id === form.produto_id)
    : []

  return (
    <>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#102040' }}>Operações</div>
          <div style={{ fontSize: 13, color: '#6080a0' }}>Gestão completa das operações de garantia</div>
        </div>
        {aba === 'operacoes' ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={importarCSV} />
            <button className="btn-export" onClick={exportarExcel} disabled={exportando || operacoesFiltradas.length === 0}>⬇ Excel</button>
            <button className="btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={importando}>
              {importando ? 'Importando...' : '⬆ Importar Planilha'}
            </button>
            <button className="btn-primary" onClick={abrirNovo}>+ Nova Operação</button>
          </div>
        ) : (
          <button className="btn-primary" onClick={abrirNovoStatus}>+ Novo Status</button>
        )}
      </div>

      {/* Abas internas */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #d0e4f5' }}>
        {(['operacoes', 'status'] as const).map((a) => (
          <button key={a} onClick={() => setAba(a)} style={{
            padding: '9px 22px 8px',
            background: aba === a ? 'white' : 'transparent',
            border: aba === a ? '1.5px solid #d0e4f5' : '1.5px solid transparent',
            borderBottom: aba === a ? '2px solid white' : '2px solid transparent',
            borderRadius: '8px 8px 0 0', marginBottom: -2,
            color: aba === a ? '#1e4080' : '#6080a0',
            fontFamily: "'Calibri','Segoe UI',sans-serif",
            fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'color 0.15s',
          }}>
            {a === 'operacoes' ? '📋 Operações' : '⚙️ Status'}
          </button>
        ))}
      </div>

      {/* Modal resultado importação */}
      {resultadoImport && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setResultadoImport(null)}>
          <div className="modal-box" style={{ maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="modal-title">Resultado da Importação</div>
              <button onClick={() => setResultadoImport(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="kpi-card" style={{ flex: 1, textAlign: 'center', padding: '12px 8px' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#27a96c' }}>{resultadoImport.inseridos}</div>
                  <div style={{ fontSize: 12, color: '#6080a0' }}>Inseridas</div>
                </div>
                <div className="kpi-card" style={{ flex: 1, textAlign: 'center', padding: '12px 8px' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#d64545' }}>{resultadoImport.erros.length}</div>
                  <div style={{ fontSize: 12, color: '#6080a0' }}>Erros</div>
                </div>
              </div>
              {resultadoImport.erros.length > 0 && (
                <div style={{ maxHeight: 200, overflowY: 'auto', background: '#f8f0f0', borderRadius: 8, padding: 12, fontSize: 12 }}>
                  {resultadoImport.erros.map((e, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      <strong>Linha {e.linha}</strong> — {e.tomador}: <span style={{ color: '#d64545' }}>{e.motivo}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 12, color: '#6080a0', marginTop: 4 }}>
                Importação incremental — operações existentes não foram alteradas.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn-primary" onClick={() => setResultadoImport(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ ABA OPERAÇÕES ══════════ */}
      {aba === 'operacoes' && (
        <>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
            <div className="kpi-card highlight" style={{ flex: '1 1 150px' }}>
              <div className="kpi-label">Total</div>
              <div className="kpi-value">{kpis.total}</div>
              <div className="kpi-sub">operações ativas</div>
            </div>
            <div className="kpi-card accent" style={{ flex: '1 1 150px' }}>
              <div className="kpi-label">Em Triagem</div>
              <div className="kpi-value">{kpis.emTriagem}</div>
              <div className="kpi-sub">aguardando avanço</div>
            </div>
            <div className="kpi-card" style={{ flex: '1 1 150px' }}>
              <div className="kpi-label">Em Análise</div>
              <div className="kpi-value">{kpis.emAnalise}</div>
              <div className="kpi-sub">em processamento</div>
            </div>
            <div className="kpi-card green" style={{ flex: '1 1 150px' }}>
              <div className="kpi-label">Aprovadas / Emitidas</div>
              <div className="kpi-value">{kpis.aprovados}</div>
              <div className="kpi-sub">concluídas</div>
            </div>
            <div className="kpi-card accent" style={{ flex: '2 1 200px' }}>
              <div className="kpi-label">LMG Total</div>
              <div className="kpi-value" style={{ fontSize: 18 }}>{fmtMoeda(kpis.lmgTotal)}</div>
              <div className="kpi-sub">limite total em carteira</div>
            </div>
          </div>

          {/* Modal Edição / Cadastro */}
          {mostrarForm && (
            <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && fecharForm()}>
              <div className="modal-box" style={{ maxWidth: 760 }}>
                <div className="modal-header">
                  <div className="modal-title">{editando ? '✏️ Editar Operação' : '+ Nova Operação'}</div>
                  <button onClick={fecharForm} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
                </div>
                {mensagem && (
                  <div className={mensagem.tipo === 'sucesso' ? 'alert-success' : 'alert-error'} style={{ marginBottom: 16 }}>
                    {mensagem.texto}
                  </div>
                )}
                <form onSubmit={handleSubmit}>

                  {/* Vínculos */}
                  <div className="section-title" style={{ marginBottom: 14 }}>
                    <span className="dot" />Vínculos
                  </div>
                  <div className="form-grid" style={{ marginBottom: 20 }}>
                    <div className="form-field full">
                      <label className="form-label">Tomador</label>
                      <select className="fam-input" value={form.tomador_id} onChange={(e) => setForm({ ...form, tomador_id: e.target.value })}>
                        <option value="">— Selecione o tomador —</option>
                        {tomadores.map((t) => <option key={t.id} value={t.id}>{t.razao_social} — {maskCNPJ(t.cnpj)}</option>)}
                      </select>
                    </div>
                    <div className="form-field full">
                      <label className="form-label">Corretora</label>
                      <select className="fam-input" value={form.corretora_id} onChange={(e) => setForm({ ...form, corretora_id: e.target.value })}>
                        <option value="">— Selecione a corretora —</option>
                        {corretoras.map((c) => <option key={c.id} value={c.id}>{c.razao_social}</option>)}
                      </select>
                    </div>
                    <div className="form-field full">
                      <label className="form-label">Corretor</label>
                      <input className="fam-input" type="text" placeholder="Nome do corretor responsável"
                        value={form.corretor} onChange={(e) => setForm({ ...form, corretor: e.target.value })} />
                    </div>
                  </div>

                  {/* Cobertura */}
                  <div className="section-title" style={{ marginBottom: 14 }}>
                    <span className="dot" style={{ background: '#e8b84b' }} />Cobertura
                  </div>
                  <div className="form-grid" style={{ marginBottom: 20 }}>
                    {/* Seletor de setor */}
                    <div className="form-field full">
                      <label className="form-label">Setor *</label>
                      <div style={{ display: 'flex', gap: 10 }}>
                        {produtos.map((p) => {
                          const isPublico = p.codigo === '75'
                          const selecionado = form.produto_id === p.id
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleSetorChange(p.id)}
                              style={{
                                flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                                fontFamily: "'Calibri','Segoe UI',sans-serif", fontSize: 13, fontWeight: 700,
                                border: selecionado ? `2px solid ${isPublico ? '#1a5fa0' : '#7b3fa0'}` : '2px solid #d0e4f5',
                                background: selecionado ? (isPublico ? '#dbeafe' : '#ede9fe') : '#f8fafc',
                                color: selecionado ? (isPublico ? '#1a5fa0' : '#7b3fa0') : '#6080a0',
                                transition: 'all 0.15s',
                              }}
                            >
                              {isPublico ? '🏛️' : '🏢'} {p.nome}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Modalidade filtrada pelo setor */}
                    <div className="form-field" style={{ flex: '2 1 200px' }}>
                      <label className="form-label">Modalidade</label>
                      <select
                        className="fam-input"
                        value={form.modalidade_id}
                        onChange={(e) => handleModalidadeChange(e.target.value)}
                        disabled={!form.produto_id}
                      >
                        <option value="">— {form.produto_id ? 'Selecione a modalidade' : 'Selecione o setor primeiro'} —</option>
                        {modalidadesDoSetor.map((m) => (
                          <option key={m.id} value={m.id}>{m.nome}</option>
                        ))}
                      </select>
                    </div>

                    {/* Código cobertura (read-only) */}
                    <div className="form-field" style={{ flex: '1 1 120px' }}>
                      <label className="form-label">Código Cobertura</label>
                      <input
                        className="fam-input"
                        type="text"
                        value={form.codigo_cobertura}
                        readOnly
                        placeholder="Preenchido automaticamente"
                        style={{ background: '#f0f4f8', color: '#4a6080', cursor: 'default' }}
                      />
                    </div>
                  </div>

                  {/* Valores */}
                  <div className="section-title" style={{ marginBottom: 14 }}>
                    <span className="dot" style={{ background: '#27a96c' }} />Valores
                  </div>
                  <div className="form-grid" style={{ marginBottom: 20 }}>
                    <div className="form-field">
                      <label className="form-label">LMG (R$)</label>
                      <input className="fam-input" type="text" placeholder="Ex: 1.000.000,00"
                        value={form.lmg}
                        onChange={(e) => {
                          const lmg = e.target.value
                          setForm((f) => ({ ...f, lmg, premio_previsto: calcPremio(lmg, f.taxa) }))
                        }} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Taxa (%)</label>
                      <input className="fam-input" type="text" placeholder="Ex: 1,50"
                        value={form.taxa}
                        onChange={(e) => {
                          const taxa = e.target.value
                          setForm((f) => ({ ...f, taxa, premio_previsto: calcPremio(f.lmg, taxa) }))
                        }} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Vigência (anos)</label>
                      <input className="fam-input" type="number" placeholder="Ex: 2" min={1} max={30}
                        value={form.vigencia_anos} onChange={(e) => setForm({ ...form, vigencia_anos: e.target.value })} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Prêmio Previsto (R$)</label>
                      <input className="fam-input" type="text" placeholder="Calculado automaticamente"
                        value={form.premio_previsto} onChange={(e) => setForm({ ...form, premio_previsto: e.target.value })} />
                    </div>
                  </div>

                  {/* Classificação e Status */}
                  <div className="section-title" style={{ marginBottom: 14 }}>
                    <span className="dot" style={{ background: '#6030a0' }} />Classificação e Status
                  </div>
                  <div className="form-grid" style={{ marginBottom: 20 }}>
                    <div className="form-field">
                      <label className="form-label">Status</label>
                      <select className="fam-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                        {statusOpcoes.filter((s) => s.ativo).map((s) => (
                          <option key={s.id} value={s.nome}>{s.nome}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Prioridade</label>
                      <select className="fam-input" value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })}>
                        <option value="Fluxo Normal">Fluxo Normal</option>
                        <option value="Prioridade">Prioridade</option>
                        <option value="Urgente">🚨 Urgente</option>
                      </select>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Temperatura</label>
                      <select className="fam-input" value={form.temperatura} onChange={(e) => setForm({ ...form, temperatura: e.target.value })}>
                        <option value="Frio">❄ Frio</option>
                        <option value="Morno">🌤 Morno</option>
                        <option value="Quente">🔥 Quente</option>
                      </select>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Estado</label>
                      <select className="fam-input" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                        <option value="">— UF —</option>
                        {ESTADOS_BR.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                      </select>
                    </div>
                    <div className="form-field full">
                      <label className="form-label">Observação</label>
                      <textarea className="fam-input" placeholder="Informações adicionais..."
                        value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                        rows={2} style={{ resize: 'vertical' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-secondary" onClick={fecharForm}>Cancelar</button>
                    <button type="submit" className="btn-primary" disabled={enviando}>
                      {enviando ? 'Salvando...' : editando ? 'Salvar Alterações' : 'Cadastrar Operação'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Filtros */}
          <div className="filter-row">
            <div className="filter-group" style={{ flex: '2 1 220px' }}>
              <label className="filter-label">Buscar</label>
              <input className="fam-input" type="text" placeholder="Tomador, CNPJ, corretora, produto..."
                value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <div className="filter-group" style={{ flex: '1 1 160px' }}>
              <label className="filter-label">Status</label>
              <select className="fam-input" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                <option value="">Todos</option>
                {statusOpcoes.map((s) => <option key={s.id} value={s.nome}>{s.nome}</option>)}
              </select>
            </div>
            <div className="filter-group" style={{ flex: '1 1 130px' }}>
              <label className="filter-label">Prioridade</label>
              <select className="fam-input" value={filtroPrioridade} onChange={(e) => setFiltroPrioridade(e.target.value)}>
                <option value="">Todas</option>
                <option value="Urgente">Urgente</option>
                <option value="Prioridade">Prioridade</option>
                <option value="Fluxo Normal">Normal</option>
              </select>
            </div>
            <div className="filter-group" style={{ flex: '1 1 130px' }}>
              <label className="filter-label">Temperatura</label>
              <select className="fam-input" value={filtroTemperatura} onChange={(e) => setFiltroTemperatura(e.target.value)}>
                <option value="">Todas</option>
                <option value="Quente">🔥 Quente</option>
                <option value="Morno">🌤 Morno</option>
                <option value="Frio">❄ Frio</option>
              </select>
            </div>
            <div className="filter-group" style={{ flex: '1 1 160px' }}>
              <label className="filter-label">Corretora</label>
              <select className="fam-input" value={filtroCorretora} onChange={(e) => setFiltroCorretora(e.target.value)}>
                <option value="">Todas</option>
                {corretoras.map((c) => <option key={c.id} value={c.id}>{c.razao_social}</option>)}
              </select>
            </div>
            <div className="filter-group" style={{ flex: '1 1 160px' }}>
              <label className="filter-label">Cobertura</label>
              <select className="fam-input" value={filtroProduto} onChange={(e) => setFiltroProduto(e.target.value)}>
                <option value="">Todas</option>
                {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            {(busca || filtroStatus || filtroPrioridade || filtroTemperatura || filtroCorretora || filtroProduto) && (
              <div className="filter-group" style={{ justifyContent: 'flex-end' }}>
                <label className="filter-label">&nbsp;</label>
                <button className="btn-clear" onClick={() => { setBusca(''); setFiltroStatus(''); setFiltroPrioridade(''); setFiltroTemperatura(''); setFiltroCorretora(''); setFiltroProduto('') }}>Limpar</button>
              </div>
            )}
            <div style={{ marginLeft: 'auto', fontSize: 13, color: '#6080a0', alignSelf: 'flex-end', paddingBottom: 2 }}>
              {operacoesFiltradas.length} operaç{operacoesFiltradas.length !== 1 ? 'ões' : 'ão'}
            </div>
          </div>

          {/* Tabela */}
          <div className="fam-table-wrap">
            <table className="fam-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Tomador</th>
                  <th>Corretora</th>
                  <th>Cobertura / Modalidade</th>
                  <th>LMG</th>
                  <th>Taxa</th>
                  <th>Temp.</th>
                  <th>Prioridade</th>
                  <th>Status</th>
                  <th>Avançar</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {carregando ? (
                  <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>Carregando...</td></tr>
                ) : operacoesFiltradas.length === 0 ? (
                  <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>
                    {busca || filtroStatus || filtroPrioridade || filtroTemperatura || filtroCorretora || filtroProduto
                      ? 'Nenhuma operação encontrada para os filtros selecionados.'
                      : 'Nenhuma operação registrada ainda.'}
                  </td></tr>
                ) : operacoesFiltradas.map((op, i) => {
                  const statusIdx = statusOpcoes.findIndex((s) => s.nome === op.status)
                  const proximoStatus = statusOpcoes[statusIdx + 1] ?? null
                  return (
                    <tr key={op.id}>
                      <td style={{ color: '#6080a0', fontSize: 13 }}>{i + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{op.tomador?.razao_social ?? '—'}</div>
                        {op.tomador?.cnpj && <div style={{ fontSize: 11, color: '#6080a0' }}>{maskCNPJ(op.tomador.cnpj)}</div>}
                      </td>
                      <td style={{ fontSize: 13, color: '#6080a0' }}>{op.corretora?.razao_social ?? '—'}</td>
                      <td style={{ fontSize: 13 }}>
                        <div>{op.produto?.nome ?? '—'}</div>
                        {op.modalidade && <div style={{ fontSize: 11, color: '#6080a0' }}>{op.modalidade}</div>}
                      </td>
                      <td style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {op.lmg ? fmtMoeda(op.lmg) : '—'}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {op.taxa ? fmtPercent(op.taxa / 100) : '—'}
                      </td>
                      <td>
                        {op.temperatura
                          ? <span className={`badge ${badgeTemperatura(op.temperatura)}`}>{op.temperatura}</span>
                          : <span style={{ color: '#6080a0', fontSize: 13 }}>—</span>}
                      </td>
                      <td>
                        {op.prioridade && op.prioridade !== 'Fluxo Normal'
                          ? <span className={`badge ${badgePrioridade(op.prioridade)}`}>{op.prioridade}</span>
                          : <span style={{ color: '#6080a0', fontSize: 12 }}>Normal</span>}
                      </td>
                      <td>
                        <span className="badge" style={{
                          background: corDoStatus(op.status) + '22',
                          color: corDoStatus(op.status),
                          border: `1px solid ${corDoStatus(op.status)}44`,
                        }}>
                          {op.status}
                        </span>
                      </td>
                      <td>
                        {proximoStatus ? (
                          <button
                            onClick={() => mudarStatus(op, proximoStatus.nome)}
                            title={`Avançar para: ${proximoStatus.nome}`}
                            style={{
                              padding: '4px 10px', borderRadius: 6, border: 'none',
                              background: proximoStatus.cor + '22',
                              color: proximoStatus.cor,
                              cursor: 'pointer', fontSize: 11, fontWeight: 700,
                              fontFamily: "'Calibri','Segoe UI',sans-serif",
                              whiteSpace: 'nowrap',
                            }}>
                            → {proximoStatus.nome}
                          </button>
                        ) : (
                          <span style={{ color: '#6080a0', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td>
                        <button onClick={() => abrirEditar(op)}
                          style={{ padding: '5px 12px', borderRadius: 6, border: '1.5px solid #c5d5e8', background: 'white', color: '#1e4080', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Calibri','Segoe UI',sans-serif" }}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ══════════ ABA STATUS ══════════ */}
      {aba === 'status' && (
        <>
          {mostrarFormStatus && (
            <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && fecharFormStatus()}>
              <div className="modal-box" style={{ maxWidth: 420 }}>
                <div className="modal-header">
                  <div className="modal-title">{editandoStatus ? '✏️ Editar Status' : '+ Novo Status'}</div>
                  <button onClick={fecharFormStatus} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
                </div>
                {msgStatus && (
                  <div className={msgStatus.tipo === 'sucesso' ? 'alert-success' : 'alert-error'} style={{ marginBottom: 16 }}>
                    {msgStatus.texto}
                  </div>
                )}
                <form onSubmit={salvarStatus}>
                  <div className="form-grid">
                    <div className="form-field full">
                      <label className="form-label">Nome do Status *</label>
                      <input className="fam-input" type="text" placeholder="Ex: Em Diligência" value={formStatus.nome}
                        onChange={(e) => setFormStatus({ ...formStatus, nome: e.target.value })} required />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Cor</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input className="fam-input" type="color" value={formStatus.cor}
                          onChange={(e) => setFormStatus({ ...formStatus, cor: e.target.value })}
                          style={{ height: 38, padding: '2px 6px', cursor: 'pointer' }} />
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {CORES_RAPIDAS.map((c) => (
                            <button key={c} type="button"
                              onClick={() => setFormStatus({ ...formStatus, cor: c })}
                              style={{ width: 22, height: 22, borderRadius: 4, background: c, border: formStatus.cor === c ? '2px solid #1a2a3a' : '1px solid #c5d5e8', cursor: 'pointer' }} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Ordem</label>
                      <input className="fam-input" type="number" min={1} max={999} value={formStatus.ordem}
                        onChange={(e) => setFormStatus({ ...formStatus, ordem: e.target.value })} />
                    </div>
                    <div className="form-field" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 22 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#1a2a3a' }}>
                        <input type="checkbox" checked={formStatus.ativo}
                          onChange={(e) => setFormStatus({ ...formStatus, ativo: e.target.checked })}
                          style={{ width: 16, height: 16 }} />
                        Ativo
                      </label>
                    </div>
                    <div className="form-field full">
                      <label className="form-label">Prévia</label>
                      <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #d0e4f5' }}>
                        <span className="badge" style={{
                          background: formStatus.cor + '22',
                          color: formStatus.cor,
                          border: `1px solid ${formStatus.cor}44`,
                        }}>
                          {formStatus.nome || 'Nome do Status'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-secondary" onClick={fecharFormStatus}>Cancelar</button>
                    <button type="submit" className="btn-primary" disabled={enviandoStatus}>
                      {enviandoStatus ? 'Salvando...' : editandoStatus ? 'Salvar' : 'Criar Status'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {confirmExcluir && (
            <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmExcluir(null)}>
              <div className="modal-box" style={{ maxWidth: 380 }}>
                <div className="modal-header">
                  <div className="modal-title">Excluir Status</div>
                  <button onClick={() => setConfirmExcluir(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
                </div>
                <p style={{ marginBottom: 20, fontSize: 14, color: '#1a2a3a' }}>
                  Tem certeza que deseja excluir <strong>"{confirmExcluir.nome}"</strong>?
                  Operações com esse status manterão o valor atual.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="btn-secondary" onClick={() => setConfirmExcluir(null)}>Cancelar</button>
                  <button className="btn-danger" onClick={() => excluirStatus(confirmExcluir)}>Excluir</button>
                </div>
              </div>
            </div>
          )}

          {msgStatus && !mostrarFormStatus && (
            <div className={msgStatus.tipo === 'sucesso' ? 'alert-success' : 'alert-error'} style={{ marginBottom: 16 }}>
              {msgStatus.texto}
            </div>
          )}

          <div className="fam-table-wrap">
            <table className="fam-table">
              <thead>
                <tr>
                  <th>Ordem</th>
                  <th>Status</th>
                  <th>Cor</th>
                  <th>Tipo</th>
                  <th>Situação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {carregandoStatus ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>Carregando...</td></tr>
                ) : statusLista.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>Nenhum status cadastrado.</td></tr>
                ) : statusLista.map((s) => (
                  <tr key={s.id}>
                    <td style={{ color: '#6080a0', fontSize: 13 }}>{s.ordem}</td>
                    <td>
                      <span className="badge" style={{
                        background: s.cor + '22',
                        color: s.cor,
                        border: `1px solid ${s.cor}44`,
                      }}>
                        {s.nome}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 18, height: 18, borderRadius: 4, background: s.cor, border: '1px solid #c5d5e8' }} />
                        <span style={{ fontSize: 12, color: '#6080a0', fontFamily: 'monospace' }}>{s.cor}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${s.base ? 'badge-blue' : 'badge-gray'}`}>
                        {s.base ? 'Base' : 'Personalizado'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${s.ativo ? 'badge-green' : 'badge-red'}`}>
                        {s.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => abrirEditarStatus(s)}
                          style={{ padding: '5px 12px', borderRadius: 6, border: '1.5px solid #c5d5e8', background: 'white', color: '#1e4080', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Calibri','Segoe UI',sans-serif" }}>
                          Editar
                        </button>
                        {!s.base && (
                          <button onClick={() => setConfirmExcluir(s)}
                            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#fbeaea', color: '#a02020', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Calibri','Segoe UI',sans-serif" }}>
                            Excluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
