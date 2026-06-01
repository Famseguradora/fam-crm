'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { maskCNPJ, maskTelefone, maskCEP, maskMoeda, fmtMoeda, fmtData, titleCase, validarCNPJ } from '@/lib/utils'
import type { Tomador, Corretora, StatusFluxo } from '@/types'
import { useDateRange } from '@/lib/context/date-range-context'
import AnexosSection from '@/components/AnexosSection'

// ─── Types ───────────────────────────────────────────────────────────────────

const PORTES = ['Small', 'Middle', 'Corporate', 'Large'] as const

interface FormTomador {
  razao_social: string
  nome_fantasia: string
  cnpj: string
  corretora_id: string
  email: string
  telefone: string
  celular: string
  cep: string
  endereco: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  estado: string
  responsavel: string
  porte: string
  prioridade: string
  limite_aprovado: string
  observacao: string
  status: string
  ativo: boolean
  data_entrada: string
}

interface FormStatus {
  nome: string
  cor: string
  ordem: string
  ativo: boolean
}

const FORM_TOM_INICIAL: FormTomador = {
  razao_social: '', nome_fantasia: '', cnpj: '', corretora_id: '',
  email: '', telefone: '', celular: '',
  cep: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
  responsavel: '', porte: '', prioridade: 'Normal', limite_aprovado: '', observacao: '',
  status: 'Triagem', ativo: true, data_entrada: '',
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TomadoresPage() {
  const { dataInicio, isFiltered } = useDateRange()
  const [aba, setAba] = useState<'tomadores' | 'status'>('tomadores')

  // ── Tomadores ──
  const [tomadores, setTomadores] = useState<Tomador[]>([])
  const [corretoras, setCorretoras] = useState<Corretora[]>([])
  const [statusOpcoes, setStatusOpcoes] = useState<StatusFluxo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando] = useState<Tomador | null>(null)
  const [form, setForm] = useState<FormTomador>(FORM_TOM_INICIAL)
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroCorretora, setFiltroCorretora] = useState('')
  const [erroCnpj, setErroCnpj] = useState('')
  const [exportando, setExportando] = useState(false)
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [importando, setImportando] = useState(false)
  const [resultadoImport, setResultadoImport] = useState<{
    inseridos: number
    existentes: number
    erros: { linha: number; razao_social: string; motivo: string }[]
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

  // ── Permissão proprietário ──
  const [isProprietario, setIsProprietario] = useState(false)
  const [confirmExcluirTomador, setConfirmExcluirTomador] = useState<Tomador | null>(null)
  const [excluindoTomador, setExcluindoTomador] = useState(false)

  // ─── Loaders ────────────────────────────────────────────────────────────────

  const carregarTomadores = useCallback(async () => {
    setCarregando(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('tomadores')
      .select('*, corretora:corretoras(id,razao_social,nome_fantasia)')
      .order('razao_social')
    setTomadores((data as Tomador[]) ?? [])
    setCarregando(false)
  }, [])

  const carregarStatusLista = useCallback(async () => {
    setCarregandoStatus(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('status_fluxo_tomador')
      .select('*')
      .order('ordem')
    setStatusLista((data as StatusFluxo[]) ?? [])
    setStatusOpcoes((data as StatusFluxo[]) ?? [])
    setCarregandoStatus(false)
  }, [])

  const carregarCorretoras = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('corretoras').select('id,razao_social').eq('status', 'ativo').order('razao_social')
    setCorretoras((data as Corretora[]) ?? [])
  }, [])

  useEffect(() => {
    carregarTomadores()
    carregarStatusLista()
    carregarCorretoras()
  }, [carregarTomadores, carregarStatusLista, carregarCorretoras])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('usuarios').select('proprietario').eq('auth_id', user.id).single()
        .then(({ data }) => setIsProprietario(data?.proprietario ?? false))
    })
  }, [])

  // ─── Tomadores CRUD ─────────────────────────────────────────────────────────

  function abrirNovo() {
    setEditando(null)
    setForm(FORM_TOM_INICIAL)
    setMensagem(null)
    setErroCnpj('')
    setMostrarForm(true)
  }

  function abrirEditar(t: Tomador) {
    setEditando(t)
    setForm({
      razao_social: t.razao_social,
      nome_fantasia: t.nome_fantasia ?? '',
      cnpj: maskCNPJ(t.cnpj ?? ''),
      corretora_id: t.corretora_id ?? '',
      email: t.email ?? '',
      telefone: maskTelefone(t.telefone ?? ''),
      celular: maskTelefone(t.celular ?? ''),
      cep: t.cep ?? '',
      endereco: t.endereco ?? '',
      numero: t.numero ?? '',
      complemento: t.complemento ?? '',
      bairro: t.bairro ?? '',
      cidade: t.cidade ?? '',
      estado: t.estado ?? '',
      responsavel: t.responsavel ?? '',
      porte: t.porte ?? '',
      prioridade: t.prioridade ?? 'Normal',
      limite_aprovado: t.limite_aprovado != null ? maskMoeda(String(Math.round(t.limite_aprovado * 100))) : '',
      observacao: t.observacao ?? '',
      status: t.status,
      ativo: t.ativo,
      data_entrada: t.data_entrada ?? '',
    })
    setMensagem(null)
    setErroCnpj('')
    setMostrarForm(true)
  }

  function fecharForm() {
    setMostrarForm(false)
    setEditando(null)
    setForm(FORM_TOM_INICIAL)
    setMensagem(null)
    setErroCnpj('')
  }

  async function excluirTomador() {
    if (!confirmExcluirTomador) return
    setExcluindoTomador(true)
    const supabase = createClient()
    const { error } = await supabase.from('tomadores').delete().eq('id', confirmExcluirTomador.id)
    setExcluindoTomador(false)
    if (error) {
      setConfirmExcluirTomador(null)
      setMensagem({ tipo: 'erro', texto: 'Erro ao excluir: ' + error.message })
      return
    }
    setConfirmExcluirTomador(null)
    fecharForm()
    await carregarTomadores()
  }

  useEffect(() => {
    if (!mostrarForm) return
    function handleEsc(e: KeyboardEvent) { if (e.key === 'Escape') fecharForm() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [mostrarForm])

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    const cnpjDigits = form.cnpj.replace(/\D/g, '')
    if (cnpjDigits && !validarCNPJ(cnpjDigits)) {
      setErroCnpj('CNPJ inválido.')
      return
    }
    setEnviando(true)
    setMensagem(null)
    const payload = {
      razao_social: titleCase(form.razao_social),
      nome_fantasia: form.nome_fantasia || null,
      cnpj: cnpjDigits || null,
      corretora_id: form.corretora_id || null,
      email: form.email.toLowerCase() || null,
      telefone: form.telefone || null,
      celular: form.celular || null,
      cep: form.cep.replace(/\D/g, '') || null,
      endereco: form.endereco || null,
      numero: form.numero || null,
      complemento: form.complemento || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      estado: form.estado || null,
      responsavel: form.responsavel ? titleCase(form.responsavel) : null,
      porte: form.porte || null,
      prioridade: form.prioridade || 'Normal',
      limite_aprovado: form.limite_aprovado ? parseFloat(form.limite_aprovado.replace(/\./g, '').replace(',', '.')) : null,
      observacao: form.observacao || null,
      status: form.status,
      ativo: form.ativo,
      data_entrada: form.data_entrada || null,
    }
    try {
      const supabase = createClient()
      if (editando) {
        const { error } = await supabase.from('tomadores').update(payload).eq('id', editando.id)
        if (error) throw new Error(error.message)
        setMensagem({ tipo: 'sucesso', texto: 'Tomador atualizado com sucesso.' })
      } else {
        const { error } = await supabase.from('tomadores').insert(payload)
        if (error) throw new Error(error.message)
        setMensagem({ tipo: 'sucesso', texto: 'Tomador cadastrado com sucesso.' })
        setForm(FORM_TOM_INICIAL)
        setErroCnpj('')
      }
      await carregarTomadores()
    } catch (err: unknown) {
      setMensagem({ tipo: 'erro', texto: err instanceof Error ? err.message : 'Erro desconhecido.' })
    } finally {
      setEnviando(false)
    }
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
        const { error } = await supabase.from('status_fluxo_tomador').update(p).eq('id', editandoStatus.id)
        if (error) throw new Error(error.message)
        if (editandoStatus.nome !== p.nome) {
          const { error: errTom } = await supabase.from('tomadores').update({ status: p.nome }).eq('status', editandoStatus.nome)
          if (errTom) throw new Error(errTom.message)
        }
        setMsgStatus({ tipo: 'sucesso', texto: 'Status atualizado.' })
      } else {
        const { error } = await supabase.from('status_fluxo_tomador').insert({ ...p, base: false })
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
    const { error } = await supabase.from('status_fluxo_tomador').delete().eq('id', s.id)
    if (error) {
      setMsgStatus({ tipo: 'erro', texto: error.message })
    } else {
      await carregarStatusLista()
    }
    setConfirmExcluir(null)
  }

  // ─── Filtered data ──────────────────────────────────────────────────────────

  function handleSort(field: string) {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  function sortIcon(field: string) {
    if (sortField !== field) return ' ↕'
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  const thSort: React.CSSProperties = { cursor: 'pointer', userSelect: 'none' }

  const tomadoresFiltrados = useMemo(() => {
    const filtered = tomadores.filter((t) => {
      const buscaLow = busca.toLowerCase()
      const buscaDigitos = busca.replace(/\D/g, '')
      const corrNome = (t.corretora as Corretora | undefined)?.razao_social?.toLowerCase() ?? ''
      const textMatch = !busca ||
        t.razao_social.toLowerCase().includes(buscaLow) ||
        (t.nome_fantasia ?? '').toLowerCase().includes(buscaLow) ||
        (buscaDigitos.length > 0 && (t.cnpj ?? '').includes(buscaDigitos)) ||
        (t.responsavel ?? '').toLowerCase().includes(buscaLow) ||
        corrNome.includes(buscaLow)
      const statusMatch = !filtroStatus || t.status === filtroStatus
      const estadoMatch = !filtroEstado || t.estado === filtroEstado
      const corrMatch = !filtroCorretora || t.corretora_id === filtroCorretora
      const dataMatch = !isFiltered || !t.data_entrada || t.data_entrada >= dataInicio
      return textMatch && statusMatch && estadoMatch && corrMatch && dataMatch
    })
    if (!sortField) return filtered
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortField === 'razao_social') {
        cmp = a.razao_social.localeCompare(b.razao_social, 'pt-BR', { sensitivity: 'base' })
      } else if (sortField === 'corretora') {
        const ca = (a.corretora as Corretora | undefined)?.razao_social ?? ''
        const cb = (b.corretora as Corretora | undefined)?.razao_social ?? ''
        cmp = ca.localeCompare(cb, 'pt-BR', { sensitivity: 'base' })
      } else if (sortField === 'cidade') {
        cmp = (a.cidade ?? '').localeCompare(b.cidade ?? '', 'pt-BR', { sensitivity: 'base' })
      } else if (sortField === 'limite') {
        cmp = (a.limite_aprovado ?? 0) - (b.limite_aprovado ?? 0)
      } else if (sortField === 'status') {
        cmp = (a.status ?? '').localeCompare(b.status ?? '', 'pt-BR', { sensitivity: 'base' })
      } else if (sortField === 'data_entrada') {
        cmp = (a.data_entrada ?? '').localeCompare(b.data_entrada ?? '')
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [tomadores, busca, filtroStatus, filtroEstado, filtroCorretora, sortField, sortDir, dataInicio, isFiltered])

  const kpis = useMemo(() => {
    const ativos = tomadoresFiltrados.filter((t) => t.status !== 'Perdido' && t.status !== 'Recusado')
    const limiteTotal = ativos.reduce((sum, t) => sum + (t.limite_aprovado ?? 0), 0)
    return {
      total: tomadoresFiltrados.length,
      ativos: ativos.length,
      fechados: tomadoresFiltrados.filter((t) => t.status === 'Fechado').length,
      limiteTotal,
    }
  }, [tomadoresFiltrados])

  const estadosNoDados = useMemo(() =>
    [...new Set(tomadores.map((t) => t.estado).filter(Boolean))].sort() as string[],
    [tomadores])

  // ─── Import CSV ─────────────────────────────────────────────────────────────

  function _parseCsvImport(conteudo: string): string[][] {
    const linhas = conteudo.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    const primeira = linhas.find((l) => l.trim()) ?? ''
    const sep = primeira.includes(';') ? ';' : ','
    return linhas.filter((l) => l.trim()).map((linha) => {
      const campos: string[] = []
      let campo = ''
      let dentro = false
      for (const c of linha) {
        if (c === '"') { dentro = !dentro }
        else if (c === sep && !dentro) { campos.push(campo.trim()); campo = '' }
        else { campo += c }
      }
      campos.push(campo.trim())
      return campos
    })
  }

  function _normalizarImport(str: string) {
    return (str ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
  }

  function _parsearDataImport(valor: string): string | null {
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
    const linhas = _parseCsvImport(conteudo.replace(/^﻿/, ''))
    if (linhas.length < 2) { setImportando(false); return }

    const cabecalho = linhas[0].map((h) => h.toLowerCase().trim().replace(/\s+/g, '_'))
    const col = (row: string[], nome: string) => {
      const idx = cabecalho.indexOf(nome)
      return idx !== -1 ? (row[idx] ?? '').trim() : ''
    }
    const dados = linhas.slice(1)

    const supabase = createClient()

    // CNPJs já existentes no banco
    const { data: existentesDB } = await supabase.from('tomadores').select('cnpj')
    const cnpjsExistentes = new Set((existentesDB ?? []).map((t: { cnpj: string }) => t.cnpj))

    // Mapa corretoras: nome normalizado → id
    const { data: corretorasDB } = await supabase.from('corretoras').select('id,razao_social,nome_fantasia')
    const mapaCorretoras = new Map<string, string>()
    for (const c of (corretorasDB ?? []) as { id: string; razao_social: string; nome_fantasia: string | null }[]) {
      if (c.razao_social) mapaCorretoras.set(_normalizarImport(c.razao_social), c.id)
      if (c.nome_fantasia) mapaCorretoras.set(_normalizarImport(c.nome_fantasia), c.id)
    }

    const portesValidos = ['Small', 'Middle', 'Corporate', 'Large']
    let inseridos = 0
    let existentesCount = 0
    const erros: { linha: number; razao_social: string; motivo: string }[] = []

    for (let i = 0; i < dados.length; i++) {
      const row = dados[i]
      const linha = i + 2
      const razao_social = col(row, 'razao_social')
      const cnpjRaw = col(row, 'cnpj').replace(/\D/g, '')

      if (!razao_social) continue

      // CNPJ com 14 dígitos: dedup. Sem CNPJ: insere sem trava.
      const cnpjValido = cnpjRaw.length === 14
      if (cnpjValido && cnpjsExistentes.has(cnpjRaw)) {
        existentesCount++
        continue
      }

      const corretoraNome = col(row, 'corretora_nome')
      const corretora_id = corretoraNome ? (mapaCorretoras.get(_normalizarImport(corretoraNome)) ?? null) : null
      const porteRaw = col(row, 'porte')
      const porte = portesValidos.includes(porteRaw) ? porteRaw : null
      const limiteRaw = col(row, 'limite_aprovado').replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.').trim()
      const limite_aprovado = limiteRaw && !isNaN(parseFloat(limiteRaw)) ? parseFloat(limiteRaw) : null
      const created_at = _parsearDataImport(col(row, 'data_cadastro')) ?? undefined

      const csvStatus = col(row, 'status')
      const statusCsv = csvStatus
        ? (statusOpcoes.find((s) => s.nome === csvStatus) ?? statusOpcoes.find((s) => _normalizarImport(s.nome) === _normalizarImport(csvStatus)))
        : null

      const payload: Record<string, unknown> = {
        razao_social: razao_social.trim(),
        nome_fantasia: col(row, 'nome_fantasia') || null,
        cnpj: cnpjValido ? cnpjRaw : null,
        email: col(row, 'email') || null,
        telefone: col(row, 'telefone').replace(/\D/g, '') || null,
        celular: col(row, 'celular').replace(/\D/g, '') || null,
        responsavel: col(row, 'responsavel') || null,
        cep: col(row, 'cep').replace(/\D/g, '') || null,
        endereco: col(row, 'endereco') || null,
        numero: col(row, 'numero') || null,
        complemento: col(row, 'complemento') || null,
        bairro: col(row, 'bairro') || null,
        cidade: col(row, 'cidade') || null,
        estado: col(row, 'estado').toUpperCase().slice(0, 2) || null,
        porte,
        limite_aprovado,
        observacao: col(row, 'observacao') || null,
        corretora_id,
        status: statusCsv?.nome ?? 'Triagem',
        ativo: true,
        ...(created_at ? { created_at, updated_at: created_at } : {}),
      }

      const { error } = await supabase.from('tomadores').insert(payload)
      if (error) {
        const motivo = error.message.includes('duplicate') || error.message.includes('unique')
          ? 'CNPJ já cadastrado' : error.message
        erros.push({ linha, razao_social, motivo })
      } else {
        inseridos++
        if (cnpjValido) cnpjsExistentes.add(cnpjRaw)
      }
    }

    setResultadoImport({ inseridos, existentes: existentesCount, erros })
    setImportando(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (inseridos > 0) carregarTomadores()
  }

  // ─── Exports ────────────────────────────────────────────────────────────────

  async function exportarExcel() {
    setExportando(true)
    const { utils, writeFile } = await import('xlsx')
    const linhas = tomadoresFiltrados.map((t, i) => ({
      '#': i + 1,
      'Razão Social': t.razao_social,
      'Nome Fantasia': t.nome_fantasia ?? '—',
      'CNPJ': t.cnpj ? maskCNPJ(t.cnpj) : '—',
      'Corretora': (t.corretora as Corretora | undefined)?.razao_social ?? '—',
      'Cidade': t.cidade ?? '—',
      'UF': t.estado ?? '—',
      'Porte': t.porte ?? '—',
      'Limite Aprovado': t.limite_aprovado ?? '—',
      'Status': t.status,
      'Ativo': t.ativo ? 'Sim' : 'Não',
      'Cadastrado em': fmtData(t.created_at),
    }))
    const ws = utils.json_to_sheet(linhas)
    ws['!cols'] = [{ wch: 4 }, { wch: 36 }, { wch: 24 }, { wch: 18 }, { wch: 30 }, { wch: 18 }, { wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 6 }, { wch: 14 }]
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Tomadores')
    writeFile(wb, 'FAM_Tomadores.xlsx')
    setExportando(false)
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function corDoStatus(status: string) {
    const s = statusOpcoes.find((x) => x.nome === status)
    return s?.cor ?? '#6080a0'
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#102040' }}>Tomadores</div>
          <div style={{ fontSize: 13, color: '#6080a0' }}>Gestão completa dos tomadores de garantia</div>
        </div>
        {aba === 'tomadores' ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={importarCSV} />
            <button className="btn-export" onClick={exportarExcel} disabled={exportando || tomadoresFiltrados.length === 0}>⬇ Excel</button>
            <button className="btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={importando}>
              {importando ? 'Importando...' : '⬆ Importar Planilha'}
            </button>
            <button className="btn-primary" onClick={abrirNovo}>+ Novo Tomador</button>
          </div>
        ) : (
          <button className="btn-primary" onClick={abrirNovoStatus}>+ Novo Status</button>
        )}
      </div>

      {/* Abas internas */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #d0e4f5' }}>
        {(['tomadores', 'status'] as const).map((a) => (
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
            {a === 'tomadores' ? '👥 Tomadores' : '⚙️ Status'}
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
                  <div style={{ fontSize: 12, color: '#6080a0' }}>Inseridos</div>
                </div>
                <div className="kpi-card" style={{ flex: 1, textAlign: 'center', padding: '12px 8px' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#3070c8' }}>{resultadoImport.existentes}</div>
                  <div style={{ fontSize: 12, color: '#6080a0' }}>Já existiam</div>
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
                      <strong>Linha {e.linha}</strong> — {e.razao_social}: <span style={{ color: '#d64545' }}>{e.motivo}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 12, color: '#6080a0', marginTop: 4 }}>
                Tomadores com CNPJ já cadastrado foram pulados (importação incremental).
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn-primary" onClick={() => setResultadoImport(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ ABA TOMADORES ══════════ */}
      {aba === 'tomadores' && (
        <>
          {/* Badge filtro global */}
          {isFiltered && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(48,112,200,.06)', border: '1px solid #3070c8',
              borderRadius: 8, padding: '7px 14px', marginBottom: 16,
              fontSize: 13, color: '#3070c8', fontWeight: 600,
            }}>
              <span>📅</span>
              <span>Exibindo tomadores a partir de <strong>{fmtData(dataInicio)}</strong></span>
              <span style={{ fontSize: 12, color: '#6080a0', fontWeight: 400 }}>— configurado em Configurações › Sistema</span>
            </div>
          )}

          {/* KPIs */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
            <div className="kpi-card highlight" style={{ flex: '1 1 150px' }}>
              <div className="kpi-label">Total</div>
              <div className="kpi-value">{kpis.total}</div>
              <div className="kpi-sub">tomadores recebidos</div>
            </div>
            <div className="kpi-card green" style={{ flex: '1 1 150px' }}>
              <div className="kpi-label">Ativos</div>
              <div className="kpi-value">{kpis.ativos}</div>
              <div className="kpi-sub">em operação − (Negados/Perdidos)</div>
            </div>
            <div className="kpi-card accent" style={{ flex: '1 1 150px' }}>
              <div className="kpi-label">Fechados</div>
              <div className="kpi-value">{kpis.fechados}</div>
              <div className="kpi-sub">total de tomadores fechados</div>
            </div>
            <div className="kpi-card" style={{ flex: '1 1 150px' }}>
              <div className="kpi-label">Limite Aprovado Total</div>
              <div className="kpi-value" style={{ fontSize: 18 }}>{fmtMoeda(kpis.limiteTotal)}</div>
              <div className="kpi-sub">Limite Total − (Negados/Perdidos)</div>
            </div>
          </div>

          {/* Modal Cadastro / Edição */}
          {mostrarForm && (
            <div className="modal-overlay">
              <div className="modal-box" style={{ maxWidth: 760 }}>
                <div className="modal-header">
                  <div className="modal-title">{editando ? '✏️ Editar Tomador' : '+ Novo Tomador'}</div>
                  <button onClick={fecharForm} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
                </div>
                {mensagem && (
                  <div className={mensagem.tipo === 'sucesso' ? 'alert-success' : 'alert-error'} style={{ marginBottom: 16 }}>
                    {mensagem.texto}
                  </div>
                )}
                <form onSubmit={handleSubmit}>

                  {/* Dados da Empresa */}
                  <div className="section-title" style={{ marginBottom: 14 }}>
                    <span className="dot" />Dados da Empresa
                  </div>
                  <div className="form-grid" style={{ marginBottom: 20 }}>
                    <div className="form-field full">
                      <label className="form-label">Razão Social *</label>
                      <input className="fam-input" type="text" placeholder="Razão Social do Tomador" value={form.razao_social}
                        onChange={(e) => setForm({ ...form, razao_social: e.target.value })} required />
                    </div>
                    <div className="form-field full">
                      <label className="form-label">Nome Fantasia</label>
                      <input className="fam-input" type="text" placeholder="Nome comercial" value={form.nome_fantasia}
                        onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">CNPJ</label>
                      <input className={`fam-input${erroCnpj ? ' invalid' : ''}`} type="text" placeholder="00.000.000/0000-00"
                        value={form.cnpj}
                        onChange={(e) => { setErroCnpj(''); setForm({ ...form, cnpj: maskCNPJ(e.target.value) }) }}
                        maxLength={18} />
                      {erroCnpj && <span className="field-error">{erroCnpj}</span>}
                    </div>
                    <div className="form-field">
                      <label className="form-label">Porte</label>
                      <select className="fam-input" value={form.porte} onChange={(e) => setForm({ ...form, porte: e.target.value })}>
                        <option value="">— Selecione —</option>
                        {PORTES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Prioridade</label>
                      <select className="fam-input" value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })}>
                        <option value="Normal">Normal</option>
                        <option value="Prioridade">Prioridade</option>
                        <option value="Urgente">Urgente</option>
                      </select>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Corretora</label>
                      <select className="fam-input" value={form.corretora_id} onChange={(e) => setForm({ ...form, corretora_id: e.target.value })}>
                        <option value="">— Selecione —</option>
                        {corretoras.map((c) => <option key={c.id} value={c.id}>{c.razao_social}</option>)}
                      </select>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Limite Aprovado (R$)</label>
                      <input className="fam-input" type="text" placeholder="Ex: 5.000.000,00" value={form.limite_aprovado}
                        onChange={(e) => setForm({ ...form, limite_aprovado: maskMoeda(e.target.value) })} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Status</label>
                      <select className="fam-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                        {statusOpcoes.filter((s) => s.ativo).map((s) => (
                          <option key={s.id} value={s.nome}>{s.nome}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Data de Entrada na FAM</label>
                      <input className="fam-input" type="date" value={form.data_entrada}
                        onChange={(e) => setForm({ ...form, data_entrada: e.target.value })} />
                    </div>
                  </div>

                  {/* Contato */}
                  <div className="section-title" style={{ marginBottom: 14 }}>
                    <span className="dot" style={{ background: '#27a96c' }} />Contato
                  </div>
                  <div className="form-grid" style={{ marginBottom: 20 }}>
                    <div className="form-field full">
                      <label className="form-label">E-mail</label>
                      <input className="fam-input" type="email" placeholder="contato@empresa.com.br" value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value.toLowerCase() })} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Telefone</label>
                      <input className="fam-input" type="text" placeholder="(11) 3000-0000" value={form.telefone}
                        onChange={(e) => setForm({ ...form, telefone: maskTelefone(e.target.value) })} maxLength={16} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Celular</label>
                      <input className="fam-input" type="text" placeholder="(11) 9.0000-0000" value={form.celular}
                        onChange={(e) => setForm({ ...form, celular: maskTelefone(e.target.value) })} maxLength={16} />
                    </div>
                    <div className="form-field full">
                      <label className="form-label">Responsável / Representante Legal</label>
                      <input className="fam-input" type="text" placeholder="Nome do responsável pela empresa" value={form.responsavel}
                        onChange={(e) => setForm({ ...form, responsavel: e.target.value })} />
                    </div>
                  </div>

                  {/* Endereço */}
                  <div className="section-title" style={{ marginBottom: 14 }}>
                    <span className="dot" style={{ background: '#e8b84b' }} />Endereço
                  </div>
                  <div className="form-grid" style={{ marginBottom: 20 }}>
                    <div className="form-field">
                      <label className="form-label">CEP</label>
                      <div style={{ position: 'relative' }}>
                        <input className="fam-input" type="text" placeholder="00000-000" value={form.cep}
                          onChange={(e) => {
                            const val = maskCEP(e.target.value)
                            setForm({ ...form, cep: val })
                            if (val.replace(/\D/g, '').length === 8) buscarCep(val)
                          }}
                          maxLength={9} />
                      </div>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Estado</label>
                      <select className="fam-input" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                        <option value="">— UF —</option>
                        {ESTADOS_BR.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                      </select>
                    </div>
                    <div className="form-field full">
                      <label className="form-label">Endereço</label>
                      <input className="fam-input" type="text" placeholder="Rua, Avenida..." value={form.endereco}
                        onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Número</label>
                      <input className="fam-input" type="text" placeholder="123" value={form.numero}
                        onChange={(e) => setForm({ ...form, numero: e.target.value })} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Complemento</label>
                      <input className="fam-input" type="text" placeholder="Sala, Andar..." value={form.complemento}
                        onChange={(e) => setForm({ ...form, complemento: e.target.value })} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Bairro</label>
                      <input className="fam-input" type="text" value={form.bairro}
                        onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Cidade</label>
                      <input className="fam-input" type="text" value={form.cidade}
                        onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
                    </div>
                  </div>

                  {/* Observação */}
                  <div className="section-title" style={{ marginBottom: 14 }}>
                    <span className="dot" style={{ background: '#6080a0' }} />Observação
                  </div>
                  <div className="form-grid">
                    <div className="form-field full">
                      <textarea className="fam-input" placeholder="Informações adicionais sobre o tomador..."
                        value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                        rows={3} style={{ resize: 'vertical' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {editando && isProprietario && (
                      <button type="button" onClick={() => setConfirmExcluirTomador(editando)}
                        style={{ marginRight: 'auto', background: '#d64545', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                        🗑 Excluir Tomador
                      </button>
                    )}
                    <button type="button" className="btn-secondary" onClick={fecharForm}>Cancelar</button>
                    <button type="submit" className="btn-primary" disabled={enviando}>
                      {enviando ? 'Salvando...' : editando ? 'Salvar Alterações' : 'Cadastrar Tomador'}
                    </button>
                  </div>
                </form>

                {editando && (
                  <>
                    <hr style={{ border: 'none', borderTop: '1.5px solid #e0ecf8', margin: '20px 0' }} />
                    <AnexosSection entidadeTipo="tomador" entidadeId={editando.id} />
                  </>
                )}
              </div>
            </div>
          )}

          {/* Modal confirmar exclusão de tomador */}
          {confirmExcluirTomador && (
            <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfirmExcluirTomador(null) }}>
              <div className="modal-box" style={{ maxWidth: 400 }}>
                <div className="modal-header">
                  <div className="modal-title">Excluir Tomador</div>
                  <button onClick={() => setConfirmExcluirTomador(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
                </div>
                <p style={{ color: '#1a2a3a', margin: '0 0 20px', lineHeight: 1.5 }}>
                  Tem certeza que deseja excluir permanentemente <strong>{confirmExcluirTomador.razao_social}</strong>? Esta ação é <strong style={{ color: '#d64545' }}>irreversível</strong>.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="btn-secondary" onClick={() => setConfirmExcluirTomador(null)}>Cancelar</button>
                  <button onClick={excluirTomador} disabled={excluindoTomador}
                    style={{ background: '#d64545', color: 'white', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                    {excluindoTomador ? 'Excluindo...' : 'Sim, Excluir'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Filtros */}
          <div className="filter-row">
            <div className="filter-group" style={{ flex: '2 1 220px' }}>
              <label className="filter-label">Buscar</label>
              <input className="fam-input" type="text" placeholder="Razão social, CNPJ ou responsável..."
                value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <div className="filter-group" style={{ flex: '1 1 160px' }}>
              <label className="filter-label">Status</label>
              <select className="fam-input" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                <option value="">Todos</option>
                {statusOpcoes.map((s) => <option key={s.id} value={s.nome}>{s.nome}</option>)}
              </select>
            </div>
            <div className="filter-group" style={{ flex: '1 1 100px' }}>
              <label className="filter-label">Estado</label>
              <select className="fam-input" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                <option value="">Todos</option>
                {estadosNoDados.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
            <div className="filter-group" style={{ flex: '1 1 160px' }}>
              <label className="filter-label">Corretora</label>
              <select className="fam-input" value={filtroCorretora} onChange={(e) => setFiltroCorretora(e.target.value)}>
                <option value="">Todas</option>
                {corretoras.map((c) => <option key={c.id} value={c.id}>{c.razao_social}</option>)}
              </select>
            </div>
            {(busca || filtroStatus || filtroEstado || filtroCorretora) && (
              <div className="filter-group" style={{ justifyContent: 'flex-end' }}>
                <label className="filter-label">&nbsp;</label>
                <button className="btn-clear" onClick={() => { setBusca(''); setFiltroStatus(''); setFiltroEstado(''); setFiltroCorretora('') }}>Limpar</button>
              </div>
            )}
            <div style={{ marginLeft: 'auto', fontSize: 13, color: '#6080a0', alignSelf: 'flex-end', paddingBottom: 2 }}>
              {tomadoresFiltrados.length} tomador{tomadoresFiltrados.length !== 1 ? 'es' : ''}
            </div>
          </div>

          {/* Tabela */}
          <div className="fam-table-wrap">
            <table className="fam-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th style={thSort} onClick={() => handleSort('razao_social')}>Razão Social{sortIcon('razao_social')}</th>
                  <th style={thSort} onClick={() => handleSort('corretora')}>Corretora{sortIcon('corretora')}</th>
                  <th style={thSort} onClick={() => handleSort('cidade')}>Cidade / UF{sortIcon('cidade')}</th>
                  <th style={thSort} onClick={() => handleSort('limite')}>Limite{sortIcon('limite')}</th>
                  <th style={thSort} onClick={() => handleSort('status')}>Status{sortIcon('status')}</th>
                  <th style={thSort} onClick={() => handleSort('data_entrada')}>Data Entrada{sortIcon('data_entrada')}</th>
                </tr>
              </thead>
              <tbody>
                {carregando ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>Carregando...</td></tr>
                ) : tomadoresFiltrados.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>
                    {busca || filtroStatus || filtroEstado || filtroCorretora
                      ? 'Nenhum tomador encontrado para os filtros selecionados.'
                      : 'Nenhum tomador cadastrado ainda.'}
                  </td></tr>
                ) : tomadoresFiltrados.map((t, i) => (
                  <tr key={t.id} onClick={() => abrirEditar(t)} style={{ cursor: 'pointer' }}>
                    <td style={{ color: '#6080a0', fontSize: 13 }}>{i + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{t.razao_social}</div>
                      {t.nome_fantasia && <div style={{ fontSize: 11, color: '#6080a0' }}>{t.nome_fantasia}</div>}
                    </td>
                    <td style={{ fontSize: 13, color: '#6080a0' }}>{(t.corretora as Corretora | undefined)?.nome_fantasia ?? (t.corretora as Corretora | undefined)?.razao_social ?? '—'}</td>
                    <td style={{ fontSize: 13, color: '#6080a0' }}>
                      {t.cidade ? `${t.cidade}${t.estado ? `/${t.estado}` : ''}` : t.estado ?? '—'}
                    </td>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      {t.limite_aprovado ? fmtMoeda(t.limite_aprovado) : '—'}
                    </td>
                    <td>
                      <span className="badge" style={{
                        background: corDoStatus(t.status) + '22',
                        color: corDoStatus(t.status),
                        border: `1px solid ${corDoStatus(t.status)}44`,
                      }}>
                        {t.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: '#6080a0', whiteSpace: 'nowrap' }}>
                      {t.data_entrada ? fmtData(t.data_entrada) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ══════════ ABA STATUS ══════════ */}
      {aba === 'status' && (
        <>
          {/* Modal Status */}
          {mostrarFormStatus && (
            <div className="modal-overlay">
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

          {/* Modal Confirmar Exclusão */}
          {confirmExcluir && (
            <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmExcluir(null)}>
              <div className="modal-box" style={{ maxWidth: 380 }}>
                <div className="modal-header">
                  <div className="modal-title">Excluir Status</div>
                  <button onClick={() => setConfirmExcluir(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
                </div>
                <p style={{ marginBottom: 20, fontSize: 14, color: '#1a2a3a' }}>
                  Tem certeza que deseja excluir o status <strong>"{confirmExcluir.nome}"</strong>?
                  Tomadores com esse status manterão o valor, mas ele não estará mais disponível para seleção.
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
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>Carregando...</td></tr>
                ) : statusLista.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>Nenhum status cadastrado.</td></tr>
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

  async function buscarCep(cep: string) {
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (data.erro) return
      setForm((f) => ({ ...f, endereco: data.logradouro ?? '', bairro: data.bairro ?? '', cidade: data.localidade ?? '', estado: data.uf ?? '' }))
    } catch { /* silent */ }
  }
}
