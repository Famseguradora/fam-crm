'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { maskCNPJ, maskMoeda, fmtMoeda, fmtData, fmtPercent } from '@/lib/utils'
import type { Operacao, Tomador, Corretora, Produto, StatusFluxo } from '@/types'
import AnexosSection from '@/components/AnexosSection'

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
  lmg: string
  taxa: string
  vigencia_anos: string
  periodicidade_vigencia: string
  premio_previsto: string
  temperatura: string
  prioridade: string
  estado: string
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

interface FormTomadorBasico {
  razao_social: string
  cnpj: string
  corretora_id: string
  porte: string
}

const FORM_OP_INICIAL: FormOperacao = {
  tomador_id: '', corretora_id: '', produto_id: '', modalidade_id: '',
  modalidade: '', codigo_cobertura: '', lmg: '', taxa: '',
  vigencia_anos: '', periodicidade_vigencia: 'Anos', premio_previsto: '', temperatura: 'Frio',
  prioridade: 'Fluxo Normal', estado: '', observacao: '', status: 'Triagem', ativo: true, data_entrada: '',
}

const FORM_STATUS_INICIAL: FormStatus = { nome: '', cor: '#6080a0', ordem: '99', ativo: true }
const FORM_TB_INICIAL: FormTomadorBasico = { razao_social: '', cnpj: '', corretora_id: '', porte: '' }

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

function autoTemp(novoStatus: string, tempAtual: string): string {
  if (novoStatus === 'Perdido' || novoStatus === 'Recusado') return 'Frio'
  if (novoStatus === 'Aprovado') return 'Quente'
  return tempAtual
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OperacoesPage() {
  const [aba, setAba] = useState<'operacoes' | 'status' | 'comite'>('operacoes')

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
  const [filtroTemperatura, setFiltroTemperatura] = useState<string[]>([])
  const [filtroCorretora, setFiltroCorretora] = useState('')
  const [filtroModalidade, setFiltroModalidade] = useState('')
  const [exportando, setExportando] = useState(false)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
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

  // ── Permissão proprietário ──
  const [isProprietario, setIsProprietario] = useState(false)
  const [confirmExcluirOp, setConfirmExcluirOp] = useState<Operacao | null>(null)
  const [excluindoOp, setExcluindoOp] = useState(false)

  // ── Modal Motivo (Perdido/Recusado) ──
  const [motivoModal, setMotivoModal] = useState<'form' | { op: Operacao; novoStatus: string } | null>(null)
  const [motivoInput, setMotivoInput] = useState('')

  // ── Sorting ──
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // ── Cadastro Básico Tomador ──
  const [mostrarFormTomador, setMostrarFormTomador] = useState(false)
  const [formTomador, setFormTomador] = useState<FormTomadorBasico>(FORM_TB_INICIAL)
  const [enviandoTomador, setEnviandoTomador] = useState(false)
  const [msgTomador, setMsgTomador] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  // ─── Loaders ────────────────────────────────────────────────────────────────

  const carregarOperacoes = useCallback(async () => {
    setCarregando(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('operacoes')
      .select('*, tomador:tomadores(id,razao_social,cnpj,porte), corretora:corretoras(id,razao_social,nome_fantasia), produto:produtos(id,nome)')
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
      supabase.from('tomadores').select('id,razao_social,cnpj,corretora_id').eq('ativo', true).order('razao_social'),
      supabase.from('corretoras').select('id,razao_social,nome_fantasia').eq('status', 'ativo').order('razao_social'),
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

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('usuarios').select('proprietario').eq('auth_id', user.id).single()
        .then(({ data }) => setIsProprietario(data?.proprietario ?? false))
    })
  }, [])

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
    const lmgStr = op.lmg != null ? op.lmg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
    const taxaStr = op.taxa != null ? String(op.taxa) : ''
    const vigStr = op.vigencia_anos != null ? String(op.vigencia_anos) : ''
    const periodoStr = op.periodicidade_vigencia ?? 'Anos'
    setForm({
      tomador_id: op.tomador_id ?? '',
      corretora_id: op.corretora_id ?? '',
      produto_id: op.produto_id ?? '',
      modalidade_id: modMatch?.id ?? '',
      modalidade: op.modalidade ?? '',
      codigo_cobertura: op.codigo_cobertura ?? '',
      lmg: lmgStr,
      taxa: taxaStr,
      vigencia_anos: vigStr,
      periodicidade_vigencia: periodoStr,
      premio_previsto: calcPremio(lmgStr, taxaStr, vigStr, periodoStr),
      temperatura: op.temperatura ?? 'Frio',
      prioridade: op.prioridade ?? 'Fluxo Normal',
      estado: op.estado ?? '',
      observacao: op.observacao ?? '',
      status: op.status,
      ativo: op.ativo,
      data_entrada: op.data_entrada ?? '',
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

  async function excluirOperacao() {
    if (!confirmExcluirOp) return
    setExcluindoOp(true)
    const supabase = createClient()
    const { error } = await supabase.from('operacoes').delete().eq('id', confirmExcluirOp.id)
    setExcluindoOp(false)
    if (error) {
      setConfirmExcluirOp(null)
      setMensagem({ tipo: 'erro', texto: 'Erro ao excluir: ' + error.message })
      return
    }
    setConfirmExcluirOp(null)
    fecharForm()
    await carregarOperacoes()
  }

  function fecharFormTomador() {
    setMostrarFormTomador(false)
    setFormTomador(FORM_TB_INICIAL)
    setMsgTomador(null)
  }

  async function handleSalvarTomadorBasico(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!formTomador.razao_social.trim()) {
      setMsgTomador({ tipo: 'erro', texto: 'Razão Social é obrigatória.' })
      return
    }
    setEnviandoTomador(true)
    setMsgTomador(null)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('tomadores')
      .insert({
        razao_social: formTomador.razao_social.trim(),
        cnpj: formTomador.cnpj.replace(/\D/g, '') || null,
        corretora_id: formTomador.corretora_id || null,
        porte: formTomador.porte || null,
        status: 'Aguardando Análise',
        ativo: true,
      })
      .select('id,razao_social,cnpj,corretora_id')
      .single()
    setEnviandoTomador(false)
    if (error) {
      setMsgTomador({ tipo: 'erro', texto: 'Erro ao cadastrar: ' + error.message })
      return
    }
    await carregarAuxiliares()
    setForm((f) => ({ ...f, tomador_id: data.id, corretora_id: data.corretora_id ?? f.corretora_id }))
    fecharFormTomador()
  }

  useEffect(() => {
    if (!mostrarForm) return
    function handleEsc(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (mostrarFormTomador) {
        setMostrarFormTomador(false)
        setFormTomador(FORM_TB_INICIAL)
        setMsgTomador(null)
      } else {
        fecharForm()
      }
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [mostrarForm, mostrarFormTomador])

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

  function calcPremio(lmg: string, taxa: string, vigencia: string, periodo: string): string {
    const l = parseFloat(lmg.replace(/\./g, '').replace(',', '.'))
    const t = parseFloat(taxa.replace(',', '.'))
    const v = parseFloat(vigencia.replace(',', '.'))
    if (!isNaN(l) && !isNaN(t) && !isNaN(v) && t > 0 && v > 0) {
      const premioAnual = l * t / 100
      const total = periodo === 'Meses' ? (premioAnual / 12) * v : premioAnual * v
      return String(total.toFixed(2))
    }
    return ''
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    const encerrandoNeg = form.status === 'Perdido' || form.status === 'Recusado'
    const statusMudou = !editando || editando.status !== form.status
    if (encerrandoNeg && statusMudou) {
      setMotivoModal('form')
      setMotivoInput('')
      return
    }
    await executarSalvarForm('')
  }

  async function executarSalvarForm(motivo: string) {
    setEnviando(true)
    setMensagem(null)
    const lmgNum = form.lmg ? parseFloat(form.lmg.replace(/\./g, '').replace(',', '.')) : null
    const taxaNum = form.taxa ? parseFloat(form.taxa.replace(',', '.')) : null
    const obsComMotivo = motivo
      ? `Motivo: ${motivo}${form.observacao ? '\n\n' + form.observacao : ''}`
      : form.observacao || null
    const payload = {
      tomador_id: form.tomador_id || null,
      corretora_id: form.corretora_id || null,
      produto_id: form.produto_id || null,
      modalidade: form.modalidade || null,
      codigo_cobertura: form.codigo_cobertura || null,
      lmg: lmgNum,
      taxa: taxaNum,
      vigencia_anos: form.vigencia_anos ? parseFloat(form.vigencia_anos.replace(',', '.')) : null,
      periodicidade_vigencia: form.periodicidade_vigencia,
      temperatura: autoTemp(form.status, form.temperatura || 'Frio'),
      prioridade: form.prioridade,
      estado: form.estado || null,
      observacao: obsComMotivo,
      status: form.status,
      ativo: form.ativo,
      data_entrada: form.data_entrada || null,
    }
    try {
      const supabase = createClient()
      if (editando) {
        const { error } = await supabase.from('operacoes').update(payload).eq('id', editando.id)
        if (error) throw new Error(error.message)
        if ((form.status === 'Emitido' || form.status === 'Fechado') && form.tomador_id) {
          await supabase.from('tomadores').update({ status: 'Fechado' }).eq('id', form.tomador_id)
        }
        setMensagem({ tipo: 'sucesso', texto: 'Operação atualizada com sucesso.' })
      } else {
        const { error } = await supabase.from('operacoes').insert(payload)
        if (error) throw new Error(error.message)
        if ((form.status === 'Emitido' || form.status === 'Fechado') && form.tomador_id) {
          await supabase.from('tomadores').update({ status: 'Fechado' }).eq('id', form.tomador_id)
        }
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

  function mudarStatus(op: Operacao, novoStatus: string) {
    if (novoStatus === 'Perdido' || novoStatus === 'Recusado') {
      setMotivoModal({ op, novoStatus })
      setMotivoInput('')
      return
    }
    _executarMudarStatus(op, novoStatus, '')
  }

  async function _executarMudarStatus(op: Operacao, novoStatus: string, motivo: string) {
    const supabase = createClient()
    const novaTemp = autoTemp(novoStatus, op.temperatura ?? 'Frio')
    const updateData: Record<string, unknown> = { status: novoStatus, temperatura: novaTemp }
    if (motivo) updateData.observacao = `Motivo: ${motivo}${op.observacao ? '\n\n' + op.observacao : ''}`
    const { error } = await supabase.from('operacoes').update(updateData).eq('id', op.id)
    if (!error) {
      if ((novoStatus === 'Emitido' || novoStatus === 'Fechado') && op.tomador_id) {
        await supabase.from('tomadores').update({ status: 'Fechado' }).eq('id', op.tomador_id)
      }
      await carregarOperacoes()
    }
  }

  async function confirmarMotivo() {
    if (motivoModal === 'form') {
      setMotivoModal(null)
      await executarSalvarForm(motivoInput)
      setMotivoInput('')
    } else if (motivoModal && typeof motivoModal === 'object') {
      const { op, novoStatus } = motivoModal
      setMotivoModal(null)
      await _executarMudarStatus(op, novoStatus, motivoInput)
      setMotivoInput('')
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

  function handleSort(field: string) {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  function sortIcon(field: string) {
    if (sortField !== field) return ' ↕'
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  const thSort: React.CSSProperties = { cursor: 'pointer', userSelect: 'none' }

  const operacoesFiltradas = useMemo(() => {
    const filtered = operacoes.filter((op) => {
      const buscaLow = busca.toLowerCase()
      const textMatch = !busca ||
        (op.tomador?.razao_social ?? '').toLowerCase().includes(buscaLow) ||
        (op.tomador?.cnpj ?? '').includes(busca.replace(/\D/g, '')) ||
        (op.corretora?.razao_social ?? '').toLowerCase().includes(buscaLow) ||
        (op.produto?.nome ?? '').toLowerCase().includes(buscaLow)
      const statusMatch = !filtroStatus || op.status === filtroStatus
      const priorMatch = !filtroPrioridade || op.prioridade === filtroPrioridade
      const tempMatch = filtroTemperatura.length === 0 || filtroTemperatura.includes(op.temperatura ?? '')
      const corrMatch = !filtroCorretora || op.corretora_id === filtroCorretora
      const prodMatch = !filtroModalidade || op.modalidade === filtroModalidade
      return textMatch && statusMatch && priorMatch && tempMatch && corrMatch && prodMatch
    })
    if (sortField) {
      return [...filtered].sort((a, b) => {
        let cmp = 0
        if (sortField === 'tomador') {
          cmp = (a.tomador?.razao_social ?? '').localeCompare(b.tomador?.razao_social ?? '', 'pt-BR', { sensitivity: 'base' })
        } else if (sortField === 'corretora') {
          cmp = (a.corretora?.razao_social ?? '').localeCompare(b.corretora?.razao_social ?? '', 'pt-BR', { sensitivity: 'base' })
        } else if (sortField === 'cobertura') {
          cmp = (a.produto?.nome ?? '').localeCompare(b.produto?.nome ?? '', 'pt-BR', { sensitivity: 'base' })
        } else if (sortField === 'lmg') {
          cmp = (a.lmg ?? 0) - (b.lmg ?? 0)
        } else if (sortField === 'taxa') {
          cmp = (a.taxa ?? 0) - (b.taxa ?? 0)
        } else if (sortField === 'temperatura') {
          cmp = (a.temperatura ?? '').localeCompare(b.temperatura ?? '', 'pt-BR', { sensitivity: 'base' })
        } else if (sortField === 'prioridade') {
          cmp = (PRIORIDADE_ORDEM[a.prioridade ?? 'Fluxo Normal'] ?? 2) - (PRIORIDADE_ORDEM[b.prioridade ?? 'Fluxo Normal'] ?? 2)
        } else if (sortField === 'status') {
          cmp = (a.status ?? '').localeCompare(b.status ?? '', 'pt-BR', { sensitivity: 'base' })
        } else if (sortField === 'data_entrada') {
          cmp = (a.data_entrada ?? '').localeCompare(b.data_entrada ?? '')
        }
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    // Ordenação padrão por prioridade → created_at
    return [...filtered].sort((a, b) => {
      const pa = PRIORIDADE_ORDEM[a.prioridade ?? 'Fluxo Normal'] ?? 2
      const pb = PRIORIDADE_ORDEM[b.prioridade ?? 'Fluxo Normal'] ?? 2
      if (pa !== pb) return pa - pb
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
  }, [operacoes, busca, filtroStatus, filtroPrioridade, filtroTemperatura, filtroCorretora, filtroModalidade, sortField, sortDir])

  const kpis = useMemo(() => {
    const CAP = 80_000_000
    const lmgTotal = operacoesFiltradas.reduce((s, op) => s + (op.lmg ?? 0), 0)
    const naoNegadas = operacoesFiltradas.filter(op => op.status !== 'Perdido' && op.status !== 'Recusado')
    const lmgLiquido = naoNegadas.reduce((s, op) => s + (op.lmg ?? 0), 0)
    const lmgCapeadoTotal = operacoesFiltradas.reduce((s, op) => s + Math.min(op.lmg ?? 0, CAP), 0)
    const premioTotal = naoNegadas.reduce((s, op) => s + (op.premio_previsto ?? 0), 0)
    const corretoras = new Set(operacoesFiltradas.map(op => op.corretora_id).filter(Boolean)).size
    const tomadores = new Set(operacoesFiltradas.map(op => op.tomador_id).filter(Boolean)).size
    const quente = operacoesFiltradas.filter(op => op.temperatura === 'Quente')
    const morno  = operacoesFiltradas.filter(op => op.temperatura === 'Morno')
    const frio   = operacoesFiltradas.filter(op => op.temperatura === 'Frio')
    const lmgQuente    = quente.reduce((s, op) => s + (op.lmg ?? 0), 0)
    const lmgMorno     = morno.reduce((s, op) => s + (op.lmg ?? 0), 0)
    const lmgFrio      = frio.reduce((s, op) => s + (op.lmg ?? 0), 0)
    const premioQuente = quente.reduce((s, op) => s + (op.premio_previsto ?? 0), 0)
    const premioMorno  = morno.reduce((s, op) => s + (op.premio_previsto ?? 0), 0)
    const premioFrio   = frio.reduce((s, op) => s + (op.premio_previsto ?? 0), 0)
    return {
      total: operacoesFiltradas.length,
      lmgTotal, lmgLiquido, lmgCapeadoTotal, premioTotal,
      corretoras, tomadores,
      qtdQuente: quente.length, qtdMorno: morno.length, qtdFrio: frio.length,
      lmgQuente, lmgMorno, lmgFrio,
      premioQuente, premioMorno, premioFrio,
    }
  }, [operacoesFiltradas])

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
      const tempRaw = col(row, 'temperatura')
      const priRaw = col(row, 'prioridade')
      const created_at = _parseDateOp(col(row, 'data_cadastro')) ?? undefined

      const payload: Record<string, unknown> = {
        tomador_id: tomadorData.id,
        corretora_id: corretora_id ?? null,
        produto_id: modalidadeData?.produto_id ?? null,
        modalidade_id: modalidadeData?.id ?? null,
        modalidade: modalidadeData?.nome ?? col(row, 'modalidade_nome') ?? null,
        codigo_cobertura: modalidadeData?.codigo_cobertura ?? null,
        estado: col(row, 'estado').toUpperCase().slice(0, 2) || null,
        lmg: lmgRaw && !isNaN(parseFloat(lmgRaw)) ? parseFloat(lmgRaw) : null,
        taxa: taxaRaw && !isNaN(parseFloat(taxaRaw)) ? parseFloat(taxaRaw) : null,
        vigencia_anos: col(row, 'vigencia_anos') ? parseInt(col(row, 'vigencia_anos')) || null : null,
        periodicidade_vigencia: col(row, 'periodicidade_vigencia') || 'Anos',
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

  async function exportarPDF() {
    setExportando(true)
    try {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const W = 297, H = 210, M = 8

    const dataHoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    const horaAgora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

    // ── 1. HEADER ──────────────────────────────────────────────────────────
    doc.setFillColor(10, 22, 40)
    doc.rect(0, 0, W, 34, 'F')
    doc.setFillColor(232, 184, 75)
    doc.rect(0, 0, W, 2.5, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(255, 255, 255)
    doc.text('FAM', M, 22)

    doc.setDrawColor(232, 184, 75)
    doc.setLineWidth(0.3)
    doc.line(48, 9, 48, 30)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(232, 184, 75)
    doc.text('S E G U R A D O R A', 52, 16)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(255, 255, 255)
    doc.text('Operações / Subscrição', 52, 24)

    const tituloFiltros: string[] = []
    if (filtroStatus) tituloFiltros.push(filtroStatus)
    if (filtroTemperatura.length > 0) tituloFiltros.push(filtroTemperatura.join('+'))
    if (filtroPrioridade) tituloFiltros.push(filtroPrioridade)
    if (filtroModalidade) tituloFiltros.push(filtroModalidade)
    if (filtroCorretora) {
      const corrObj = corretoras.find(c => c.id === filtroCorretora)
      if (corrObj) tituloFiltros.push(corrObj.nome_fantasia ?? corrObj.razao_social)
    }
    const tituloRelatorio = tituloFiltros.length > 0
      ? `Relatório: ${tituloFiltros.map(f => `"${f}"`).join(' | ')}`
      : 'Relatório Completo'

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(tituloFiltros.length > 0 ? 8 : 9)
    doc.setTextColor(tituloFiltros.length > 0 ? 232 : 160, tituloFiltros.length > 0 ? 184 : 192, tituloFiltros.length > 0 ? 75 : 232)
    doc.text(tituloRelatorio, 52, 30)

    doc.setFontSize(8)
    doc.setTextColor(160, 192, 232)
    doc.text(`Emitido em: ${dataHoje} às ${horaAgora}`, W - M, 16, { align: 'right' })

    doc.setFontSize(6)
    doc.setTextColor(120, 140, 160)
    doc.text('Documento Confidencial · Gerado automaticamente pelo FAM CRM', W - M, 23, { align: 'right' })

    // ── 2. KPI CARDS ───────────────────────────────────────────────────────
    const cardTop = 38, cardH = 22
    const cardW = (W - M * 2 - 12) / 4

    const cards = [
      { label: 'OPERAÇÕES', value: String(operacoesFiltradas.length), sub: 'Conforme filtros', ar: [30, 64, 120] },
      { label: 'LMG TOTAL', value: fmtMoeda(kpis.lmgTotal), sub: 'Soma total carteira', ar: [16, 32, 64] },
      { label: 'LMG EM POTENCIAL', value: fmtMoeda(kpis.lmgLiquido), sub: 'Excl. negadas/perdidas', ar: [30, 64, 120] },
      { label: 'PRÊMIO TOTAL', value: fmtMoeda(kpis.premioTotal), sub: 'Prêmios previstos', ar: [232, 184, 75] },
    ]

    cards.forEach((card, idx) => {
      const cx = M + idx * (cardW + 4)
      doc.setFillColor(248, 251, 255)
      doc.roundedRect(cx, cardTop, cardW, cardH, 2, 2, 'F')
      doc.setDrawColor(197, 213, 232)
      doc.setLineWidth(0.3)
      doc.roundedRect(cx, cardTop, cardW, cardH, 2, 2, 'S')
      doc.setFillColor(card.ar[0], card.ar[1], card.ar[2])
      doc.rect(cx, cardTop, cardW, 1.5, 'F')

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(96, 128, 160)
      doc.text(card.label, cx + cardW / 2, cardTop + 7.5, { align: 'center' })

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(idx === 0 ? 16 : 9.5)
      doc.setTextColor(10, 22, 40)
      doc.text(card.value, cx + cardW / 2, cardTop + 14.5, { align: 'center' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(120, 140, 160)
      doc.text(card.sub, cx + cardW / 2, cardTop + 20, { align: 'center' })
    })

    // ── 3. FILTROS ATIVOS ──────────────────────────────────────────────────
    let startY = cardTop + cardH + 5

    const filtrosAtivos: string[] = []
    if (busca) filtrosAtivos.push(`Busca: "${busca}"`)
    if (filtroStatus) filtrosAtivos.push(`Status: ${filtroStatus}`)
    if (filtroPrioridade) filtrosAtivos.push(`Prioridade: ${filtroPrioridade}`)
    if (filtroTemperatura.length > 0) filtrosAtivos.push(`Temperatura: ${filtroTemperatura.join(' + ')}`)
    if (filtroCorretora) {
      const cor = corretoras.find(c => c.id === filtroCorretora)
      filtrosAtivos.push(`Corretora: ${cor?.nome_fantasia ?? cor?.razao_social ?? filtroCorretora}`)
    }
    if (filtroModalidade) {
      filtrosAtivos.push(`Modalidade: ${filtroModalidade}`)
    }

    if (filtrosAtivos.length > 0) {
      doc.setFillColor(232, 240, 250)
      doc.rect(M, startY, W - M * 2, 10, 'F')
      doc.setDrawColor(160, 192, 232)
      doc.setLineWidth(0.3)
      doc.rect(M, startY, W - M * 2, 10, 'S')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(26, 53, 96)
      doc.text('Filtros aplicados:', M + 3, startY + 6.5)
      doc.setFont('helvetica', 'normal')
      doc.text(filtrosAtivos.join('  ·  '), M + 40, startY + 6.5)
      startY += 14
    }

    // ── 4. TABELA PRINCIPAL ────────────────────────────────────────────────
    const lmgFiltrado = operacoesFiltradas.reduce((s, op) => s + (op.lmg ?? 0), 0)
    const premioFiltrado = operacoesFiltradas.reduce((s, op) => s + (op.premio_previsto ?? 0), 0)

    autoTable(doc, {
      startY,
      margin: { left: M, right: M, bottom: 14 },
      head: [['#', 'Status', 'Tomador', 'Corretora', 'UF', 'Modalidade', 'Temp.', 'LMG', 'Taxa', 'Vig.', 'Prêmio']],
      body: operacoesFiltradas.map((op, i) => [
        i + 1,
        op.status,
        op.tomador?.razao_social ?? '—',
        op.corretora?.nome_fantasia ?? op.corretora?.razao_social ?? '—',
        op.estado ?? '—',
        op.modalidade ?? '—',
        op.temperatura ?? '—',
        op.lmg ? fmtMoeda(op.lmg) : '—',
        op.taxa ? fmtPercent(op.taxa / 100) : '—',
        op.vigencia_anos ? `${op.vigencia_anos}${op.periodicidade_vigencia === 'Meses' ? 'm' : 'a'}` : '—',
        op.premio_previsto ? fmtMoeda(op.premio_previsto) : '—',
      ]),
      foot: [['', '', '', '', '', '', 'TOTAL', fmtMoeda(lmgFiltrado), '', '', fmtMoeda(premioFiltrado)]],
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
        font: 'helvetica',
        textColor: [30, 40, 60],
        lineColor: [210, 220, 235],
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: [10, 22, 40],
        textColor: [232, 184, 75],
        fontStyle: 'bold',
        fontSize: 7.5,
        cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
      },
      footStyles: {
        fillColor: [10, 22, 40],
        textColor: [232, 184, 75],
        fontStyle: 'bold',
        fontSize: 7.5,
      },
      alternateRowStyles: { fillColor: [245, 247, 252] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8, textColor: [100, 110, 130] },
        1: { halign: 'center', cellWidth: 24 },
        2: { cellWidth: 58 },
        3: { cellWidth: 36 },
        4: { halign: 'center', cellWidth: 10, textColor: [60, 80, 120] },
        5: { cellWidth: 44 },
        6: { halign: 'center', cellWidth: 20 },
        7: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
        8: { halign: 'right', cellWidth: 12 },
        9: { halign: 'center', cellWidth: 12 },
        10: { halign: 'right', cellWidth: 27, fontStyle: 'bold', textColor: [16, 64, 120] },
      },
      didDrawPage: () => {
        doc.setDrawColor(232, 184, 75)
        doc.setLineWidth(0.5)
        doc.line(M, H - 8, W - M, H - 8)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6)
        doc.setTextColor(120, 140, 160)
        doc.text('FAM Seguradora — Relatório Confidencial', M, H - 4)
        doc.text(`${dataHoje} às ${horaAgora}`, W - M, H - 4, { align: 'right' })
      },
    })

    // Paginação com total de páginas (conhecido após autoTable)
    const totalPags = (doc as any).internal.getNumberOfPages()
    for (let i = 1; i <= totalPags; i++) {
      doc.setPage(i)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6)
      doc.setTextColor(120, 140, 160)
      doc.text(`Página ${i} de ${totalPags}`, W / 2, H - 4, { align: 'center' })
    }

    const dataUri = doc.output('datauristring')
    setPdfPreviewUrl(dataUri)
    } catch (err) {
      console.error('Erro ao gerar PDF:', err)
    } finally {
      setExportando(false)
    }
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

  const tomadoresDaCorretora = form.corretora_id
    ? tomadores.filter((t) => t.corretora_id === form.corretora_id)
    : tomadores

  return (
    <>
      {/* Cabeçalho */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#102040' }}>Operações / Subscrição</div>
            <div style={{ fontSize: 12, color: '#6080a0' }}>
              Aba: Operações · Subscrição · {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={importarCSV} />
            {aba === 'operacoes' && (
              <>
                <button className="btn-export" onClick={exportarExcel} disabled={exportando || operacoesFiltradas.length === 0} style={{ fontSize: 13 }}>⬇ Excel</button>
                <button className="btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={importando} style={{ fontSize: 13 }}>
                  {importando ? 'Importando...' : '⬆ Importar Planilha'}
                </button>
                <button className="btn-primary" onClick={() => exportarPDF()} disabled={exportando || operacoesFiltradas.length === 0} style={{ fontSize: 13 }}>
                  📄 Exportar PDF
                </button>
                <button className="btn-primary" onClick={abrirNovo} style={{ fontSize: 13 }}>+ Nova Operação</button>
              </>
            )}
            {aba === 'status' && (
              <button className="btn-primary" onClick={abrirNovoStatus}>+ Novo Status</button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        {/* Card: Corretoras */}
        <div className="kpi-card" style={{ flex: '1 1 120px', minWidth: 100 }}>
          <div className="kpi-label" style={{ fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase' }}>Corretoras</div>
          <div className="kpi-value" style={{ fontSize: 22, fontWeight: 800 }}>{kpis.corretoras}</div>
          <div className="kpi-sub">Únicos</div>
        </div>
        {/* Card: Tomadores */}
        <div className="kpi-card" style={{ flex: '1 1 120px', minWidth: 100 }}>
          <div className="kpi-label" style={{ fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase' }}>Tomadores</div>
          <div className="kpi-value" style={{ fontSize: 22, fontWeight: 800, color: '#1a5fa0' }}>{kpis.tomadores}</div>
          <div className="kpi-sub">Únicos</div>
        </div>
        {/* Card: Operações */}
        <div className="kpi-card" style={{ flex: '1 1 120px', minWidth: 100 }}>
          <div className="kpi-label" style={{ fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase' }}>Operações</div>
          <div className="kpi-value" style={{ fontSize: 22, fontWeight: 800 }}>{operacoesFiltradas.length}</div>
          <div className="kpi-sub">Conforme filtros</div>
        </div>
        {/* Card: LMG Total */}
        <div className="kpi-card" style={{ flex: '2 1 180px', minWidth: 160, borderColor: '#b0d0f0' }}>
          <div className="kpi-label" style={{ fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase' }}>LMG Total</div>
          <div className="kpi-value" style={{ fontSize: 17, fontWeight: 800 }}>{fmtMoeda(kpis.lmgTotal)}</div>
          <div className="kpi-sub">Soma total LMG</div>
        </div>
        {/* Card: LMG Total Líquido */}
        <div style={{
          flex: '2 1 180px', minWidth: 160, padding: '14px 16px', borderRadius: 10,
          background: '#0d2040', border: '1px solid rgba(56,120,200,0.3)',
        }}>
          <div style={{ fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(180,200,220,0.7)', marginBottom: 6 }}>LMG Total em Potencial</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#e8b84b', lineHeight: 1.1 }}>{fmtMoeda(kpis.lmgLiquido)}</div>
          <div style={{ fontSize: 11, color: 'rgba(180,200,220,0.6)', marginTop: 4 }}>LMG Total − Negados/Perdidos</div>
        </div>
        {/* Card: Prêmio Previsto Total */}
        <div style={{
          flex: '2 1 180px', minWidth: 160, padding: '14px 16px', borderRadius: 10,
          background: '#0d2040', border: '1px solid rgba(56,120,200,0.3)',
        }}>
          <div style={{ fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(180,200,220,0.7)', marginBottom: 6 }}>Prêmio Previsto Total</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#e8b84b', lineHeight: 1.1 }}>{fmtMoeda(kpis.premioTotal)}</div>
          <div style={{ fontSize: 11, color: 'rgba(180,200,220,0.6)', marginTop: 4 }}>Soma prêmios previstos</div>
        </div>
      </div>

      {/* Temperatura */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Quente */}
        <div
          onClick={(e) => setFiltroTemperatura(prev => {
            const sel = prev.includes('Quente')
            if (e.ctrlKey || e.metaKey) return sel ? prev.filter(t => t !== 'Quente') : [...prev, 'Quente']
            return sel && prev.length === 1 ? [] : ['Quente']
          })}
          style={{
            padding: '12px 20px', borderRadius: 10, minWidth: 200, flex: '1 1 200px', cursor: 'pointer', transition: 'all 0.15s',
            background: filtroTemperatura.includes('Quente') ? '#ffd6d6' : '#fff5f5',
            border: filtroTemperatura.includes('Quente') ? '2px solid #d64545' : '1.5px solid #f5b8b8',
            boxShadow: filtroTemperatura.includes('Quente') ? '0 2px 8px rgba(214,69,69,0.18)' : 'none',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#a03030', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>
            🔥 Quente {filtroTemperatura.includes('Quente') && <span style={{ fontWeight: 400, fontSize: 10 }}>— clique para limpar</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: '#d64545', lineHeight: 1 }}>{kpis.qtdQuente}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#d64545' }}>{fmtMoeda(kpis.lmgQuente)}</span>
          </div>
          <div style={{ fontSize: 11, color: '#a05050', marginTop: 4 }}>
            ops · LMG · Prêmio: {fmtMoeda(kpis.premioQuente)}
          </div>
          <div style={{ fontSize: 12, color: '#a03030', marginTop: 6, fontStyle: 'italic', borderTop: '1px dashed #f5b8b8', paddingTop: 6 }}>
            Entrada prevista dentro do mês corrente
          </div>
        </div>
        {/* Morno */}
        <div
          onClick={(e) => setFiltroTemperatura(prev => {
            const sel = prev.includes('Morno')
            if (e.ctrlKey || e.metaKey) return sel ? prev.filter(t => t !== 'Morno') : [...prev, 'Morno']
            return sel && prev.length === 1 ? [] : ['Morno']
          })}
          style={{
            padding: '12px 20px', borderRadius: 10, minWidth: 200, flex: '1 1 200px', cursor: 'pointer', transition: 'all 0.15s',
            background: filtroTemperatura.includes('Morno') ? '#ffe8c0' : '#fff8f0',
            border: filtroTemperatura.includes('Morno') ? '2px solid #d07830' : '1.5px solid #f5d090',
            boxShadow: filtroTemperatura.includes('Morno') ? '0 2px 8px rgba(208,120,48,0.18)' : 'none',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#a06010', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>
            🌤 Morno {filtroTemperatura.includes('Morno') && <span style={{ fontWeight: 400, fontSize: 10 }}>— clique para limpar</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: '#d07830', lineHeight: 1 }}>{kpis.qtdMorno}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#d07830' }}>{fmtMoeda(kpis.lmgMorno)}</span>
          </div>
          <div style={{ fontSize: 11, color: '#a07030', marginTop: 4 }}>
            ops · LMG · Prêmio: {fmtMoeda(kpis.premioMorno)}
          </div>
          <div style={{ fontSize: 12, color: '#a06010', marginTop: 6, fontStyle: 'italic', borderTop: '1px dashed #f5d090', paddingTop: 6 }}>
            Aprovado sem previsão de entrada
          </div>
        </div>
        {/* Frio */}
        <div
          onClick={(e) => setFiltroTemperatura(prev => {
            const sel = prev.includes('Frio')
            if (e.ctrlKey || e.metaKey) return sel ? prev.filter(t => t !== 'Frio') : [...prev, 'Frio']
            return sel && prev.length === 1 ? [] : ['Frio']
          })}
          style={{
            padding: '12px 20px', borderRadius: 10, minWidth: 200, flex: '1 1 200px', cursor: 'pointer', transition: 'all 0.15s',
            background: filtroTemperatura.includes('Frio') ? '#c8deff' : '#f0f6ff',
            border: filtroTemperatura.includes('Frio') ? '2px solid #3070c8' : '1.5px solid #b0d0f0',
            boxShadow: filtroTemperatura.includes('Frio') ? '0 2px 8px rgba(48,112,200,0.18)' : 'none',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#1a4080', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>
            ❄ Frio {filtroTemperatura.includes('Frio') && <span style={{ fontWeight: 400, fontSize: 10 }}>— clique para limpar</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: '#3070c8', lineHeight: 1 }}>{kpis.qtdFrio}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#3070c8' }}>{fmtMoeda(kpis.lmgFrio)}</span>
          </div>
          <div style={{ fontSize: 11, color: '#4060a0', marginTop: 4 }}>
            ops · LMG · Prêmio: {fmtMoeda(kpis.premioFrio)}
          </div>
          <div style={{ fontSize: 12, color: '#1a4080', marginTop: 6, fontStyle: 'italic', borderTop: '1px dashed #b0d0f0', paddingTop: 6 }}>
            Não aprovado / Perdido / Recusado
          </div>
        </div>
      </div>

      {/* Abas internas */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #d0e4f5' }}>
        {([
          { id: 'operacoes', label: '📋 Operações' },
          { id: 'comite', label: '🏛 Comitê' },
          { id: 'status', label: '⚙️ Status' },
        ] as const).map(({ id, label }) => (
          <button key={id} onClick={() => setAba(id)} style={{
            padding: '9px 22px 8px',
            background: aba === id ? 'white' : 'transparent',
            border: aba === id ? '1.5px solid #d0e4f5' : '1.5px solid transparent',
            borderBottom: aba === id ? '2px solid white' : '2px solid transparent',
            borderRadius: '8px 8px 0 0', marginBottom: -2,
            color: aba === id ? '#1e4080' : '#6080a0',
            fontFamily: "'Calibri','Segoe UI',sans-serif",
            fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'color 0.15s',
          }}>
            {label}
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

      {/* Modal Edição / Cadastro (fora da condição de aba para funcionar no Comitê) */}
          {mostrarForm && (
            <div className="modal-overlay">
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
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select className="fam-input" style={{ flex: 1 }} value={form.tomador_id} onChange={(e) => {
                          const tomadorId = e.target.value
                          const tomador = tomadores.find((t) => t.id === tomadorId)
                          setForm((f) => ({ ...f, tomador_id: tomadorId, corretora_id: tomador?.corretora_id ?? f.corretora_id }))
                        }}>
                          <option value="">— Selecione o tomador —</option>
                          {tomadoresDaCorretora.map((t) => <option key={t.id} value={t.id}>{t.razao_social}{t.cnpj ? ` — ${maskCNPJ(t.cnpj)}` : ''}</option>)}
                        </select>
                        <button
                          type="button"
                          onClick={() => setMostrarFormTomador(true)}
                          title="Cadastrar novo tomador básico"
                          style={{
                            whiteSpace: 'nowrap', padding: '8px 12px', borderRadius: 7,
                            border: '1.5px solid #c5d5e8', background: '#f0f6ff',
                            color: '#1e4080', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            flexShrink: 0, transition: 'background 0.15s',
                          }}
                        >
                          + Cadastro Básico
                        </button>
                      </div>
                    </div>
                    <div className="form-field full">
                      <label className="form-label">Corretora</label>
                      <select className="fam-input" value={form.corretora_id} onChange={(e) => {
                        const corrId = e.target.value
                        const tomadorAtual = tomadores.find((t) => t.id === form.tomador_id)
                        const manterTomador = !corrId || !tomadorAtual || tomadorAtual.corretora_id === corrId
                        setForm((f) => ({ ...f, corretora_id: corrId, tomador_id: manterTomador ? f.tomador_id : '' }))
                      }}>
                        <option value="">— Selecione a corretora —</option>
                        {corretoras.map((c) => <option key={c.id} value={c.id}>{c.razao_social}</option>)}
                      </select>
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
                          const lmg = maskMoeda(e.target.value)
                          setForm((f) => ({ ...f, lmg, premio_previsto: calcPremio(lmg, f.taxa, f.vigencia_anos, f.periodicidade_vigencia) }))
                        }} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Taxa (%)</label>
                      <input className="fam-input" type="text" placeholder="Ex: 1,50"
                        value={form.taxa}
                        onChange={(e) => {
                          const taxa = e.target.value
                          setForm((f) => ({ ...f, taxa, premio_previsto: calcPremio(f.lmg, taxa, f.vigencia_anos, f.periodicidade_vigencia) }))
                        }} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Periodicidade</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {(['Anos', 'Meses'] as const).map((p) => (
                          <button key={p} type="button"
                            onClick={() => setForm((f) => ({ ...f, periodicidade_vigencia: p, premio_previsto: calcPremio(f.lmg, f.taxa, f.vigencia_anos, p) }))}
                            style={{
                              flex: 1, padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                              fontFamily: "'Calibri','Segoe UI',sans-serif", fontSize: 13, fontWeight: 700,
                              border: form.periodicidade_vigencia === p ? '2px solid #1a5fa0' : '2px solid #d0e4f5',
                              background: form.periodicidade_vigencia === p ? '#dbeafe' : '#f8fafc',
                              color: form.periodicidade_vigencia === p ? '#1a5fa0' : '#6080a0',
                              transition: 'all 0.15s',
                            }}
                          >{p}</button>
                        ))}
                      </div>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Vigência ({form.periodicidade_vigencia === 'Meses' ? 'meses' : 'anos'})</label>
                      <input className="fam-input" type="text"
                        inputMode="decimal"
                        placeholder={form.periodicidade_vigencia === 'Meses' ? 'Ex: 18' : 'Ex: 0,6'}
                        value={form.vigencia_anos}
                        onChange={(e) => {
                          const raw = e.target.value
                          if (raw === '' || /^[\d.,]*$/.test(raw)) {
                            const vigencia_anos = raw
                            setForm((f) => ({ ...f, vigencia_anos, premio_previsto: calcPremio(f.lmg, f.taxa, vigencia_anos, f.periodicidade_vigencia) }))
                          }
                        }} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Prêmio Previsto (R$)</label>
                      <input className="fam-input" type="text"
                        value={form.premio_previsto ? fmtMoeda(parseFloat(form.premio_previsto)) : ''}
                        readOnly
                        placeholder="Calculado automaticamente"
                        style={{ background: '#f0f4f8', color: '#4a6080', cursor: 'default' }} />
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
                      <label className="form-label">Data de Entrada na FAM</label>
                      <input className="fam-input" type="date" value={form.data_entrada}
                        onChange={(e) => setForm({ ...form, data_entrada: e.target.value })} />
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

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {editando && isProprietario && (
                      <button type="button" onClick={() => setConfirmExcluirOp(editando)}
                        style={{ marginRight: 'auto', background: '#d64545', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                        🗑 Excluir Operação
                      </button>
                    )}
                    <button type="button" className="btn-secondary" onClick={fecharForm}>Cancelar</button>
                    <button type="submit" className="btn-primary" disabled={enviando}>
                      {enviando ? 'Salvando...' : editando ? 'Salvar Alterações' : 'Cadastrar Operação'}
                    </button>
                  </div>
                </form>

                {editando && (
                  <>
                    <hr style={{ border: 'none', borderTop: '1.5px solid #e0ecf8', margin: '20px 0' }} />
                    <AnexosSection entidadeTipo="operacao" entidadeId={editando.id} tomadorId={editando.tomador_id ?? undefined} />
                  </>
                )}
              </div>
            </div>
          )}

          {/* Modal confirmar exclusão de operação */}
          {confirmExcluirOp && (
            <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfirmExcluirOp(null) }}>
              <div className="modal-box" style={{ maxWidth: 400 }}>
                <div className="modal-header">
                  <div className="modal-title">Excluir Operação</div>
                  <button onClick={() => setConfirmExcluirOp(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
                </div>
                <p style={{ color: '#1a2a3a', margin: '0 0 20px', lineHeight: 1.5 }}>
                  Tem certeza que deseja excluir permanentemente a operação de <strong>{confirmExcluirOp.tomador?.razao_social ?? 'este tomador'}</strong>? Esta ação é <strong style={{ color: '#d64545' }}>irreversível</strong>.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="btn-secondary" onClick={() => setConfirmExcluirOp(null)}>Cancelar</button>
                  <button onClick={excluirOperacao} disabled={excluindoOp}
                    style={{ background: '#d64545', color: 'white', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                    {excluindoOp ? 'Excluindo...' : 'Sim, Excluir'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal Cadastro Básico Tomador */}
          {mostrarFormTomador && (
            <div className="modal-overlay" style={{ zIndex: 1100 }}>
              <div className="modal-box" style={{ maxWidth: 480 }}>
                <div className="modal-header">
                  <div className="modal-title">Cadastro Básico — Tomador</div>
                  <button onClick={fecharFormTomador} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
                </div>
                <p style={{ fontSize: 13, color: '#6080a0', marginBottom: 16 }}>
                  Preencha os dados essenciais. Após salvar, o tomador será selecionado automaticamente na operação.
                </p>
                {msgTomador && (
                  <div className={msgTomador.tipo === 'sucesso' ? 'alert-success' : 'alert-error'} style={{ marginBottom: 16 }}>
                    {msgTomador.texto}
                  </div>
                )}
                <form onSubmit={handleSalvarTomadorBasico}>
                  <div className="form-grid" style={{ marginBottom: 20 }}>
                    <div className="form-field full">
                      <label className="form-label">Razão Social *</label>
                      <input className="fam-input" type="text" placeholder="Nome da empresa"
                        value={formTomador.razao_social}
                        onChange={(e) => setFormTomador((f) => ({ ...f, razao_social: e.target.value }))} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">CNPJ</label>
                      <input className="fam-input" type="text" placeholder="00.000.000/0000-00"
                        value={formTomador.cnpj}
                        onChange={(e) => setFormTomador((f) => ({ ...f, cnpj: maskCNPJ(e.target.value) }))} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Porte</label>
                      <select className="fam-input" value={formTomador.porte}
                        onChange={(e) => setFormTomador((f) => ({ ...f, porte: e.target.value }))}>
                        <option value="">— Selecione —</option>
                        <option value="Small">Small</option>
                        <option value="Middle">Middle</option>
                        <option value="Corporate">Corporate</option>
                        <option value="Large">Large</option>
                      </select>
                    </div>
                    <div className="form-field full">
                      <label className="form-label">Corretora</label>
                      <select className="fam-input" value={formTomador.corretora_id}
                        onChange={(e) => setFormTomador((f) => ({ ...f, corretora_id: e.target.value }))}>
                        <option value="">— Selecione a corretora —</option>
                        {corretoras.map((c) => <option key={c.id} value={c.id}>{c.razao_social}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-secondary" onClick={fecharFormTomador}>
                      Voltar para Operação
                    </button>
                    <button type="submit" className="btn-primary" disabled={enviandoTomador}>
                      {enviandoTomador ? 'Salvando...' : 'Salvar Tomador'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

      {/* ══════════ ABA OPERAÇÕES ══════════ */}
      {aba === 'operacoes' && (
        <>
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
            <div className="filter-group" style={{ flex: '1 1 160px' }}>
              <label className="filter-label">Corretora</label>
              <select className="fam-input" value={filtroCorretora} onChange={(e) => setFiltroCorretora(e.target.value)}>
                <option value="">Todas</option>
                {corretoras.map((c) => <option key={c.id} value={c.id}>{c.nome_fantasia ?? c.razao_social}</option>)}
              </select>
            </div>
            <div className="filter-group" style={{ flex: '1 1 160px' }}>
              <label className="filter-label">Modalidade</label>
              <select className="fam-input" value={filtroModalidade} onChange={(e) => setFiltroModalidade(e.target.value)}>
                <option value="">Todas</option>
                {modalidades.map((m) => <option key={m.id} value={m.nome}>{m.nome}</option>)}
              </select>
            </div>
            {(busca || filtroStatus || filtroPrioridade || filtroTemperatura.length > 0 || filtroCorretora || filtroModalidade) && (
              <div className="filter-group" style={{ justifyContent: 'flex-end' }}>
                <label className="filter-label">&nbsp;</label>
                <button className="btn-clear" onClick={() => { setBusca(''); setFiltroStatus(''); setFiltroPrioridade(''); setFiltroTemperatura([]); setFiltroCorretora(''); setFiltroModalidade('') }}>Limpar</button>
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
                  <th style={thSort} onClick={() => handleSort('tomador')}>Tomador{sortIcon('tomador')}</th>
                  <th style={thSort} onClick={() => handleSort('corretora')}>Corretora{sortIcon('corretora')}</th>
                  <th style={thSort} onClick={() => handleSort('cobertura')}>Cobertura / Modalidade{sortIcon('cobertura')}</th>
                  <th style={thSort} onClick={() => handleSort('lmg')}>LMG{sortIcon('lmg')}</th>
                  <th style={thSort} onClick={() => handleSort('taxa')}>Taxa{sortIcon('taxa')}</th>
                  <th style={thSort} onClick={() => handleSort('temperatura')}>Temp.{sortIcon('temperatura')}</th>
                  <th style={thSort} onClick={() => handleSort('prioridade')}>Prioridade{sortIcon('prioridade')}</th>
                  <th style={thSort} onClick={() => handleSort('status')}>Status{sortIcon('status')}</th>
                  <th style={thSort} onClick={() => handleSort('data_entrada')}>Data Entrada{sortIcon('data_entrada')}</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {carregando ? (
                  <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>Carregando...</td></tr>
                ) : operacoesFiltradas.length === 0 ? (
                  <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>
                    {busca || filtroStatus || filtroPrioridade || filtroTemperatura.length > 0 || filtroCorretora || filtroModalidade
                      ? 'Nenhuma operação encontrada para os filtros selecionados.'
                      : 'Nenhuma operação registrada ainda.'}
                  </td></tr>
                ) : operacoesFiltradas.map((op, i) => {
                  return (
                    <tr key={op.id} onClick={() => abrirEditar(op)} style={{ cursor: 'pointer' }}>
                      <td style={{ color: '#6080a0', fontSize: 13 }}>{i + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{op.tomador?.razao_social ?? '—'}</div>
                        {op.tomador?.cnpj && <div style={{ fontSize: 11, color: '#6080a0' }}>{maskCNPJ(op.tomador.cnpj)}</div>}
                      </td>
                      <td style={{ fontSize: 13, color: '#6080a0' }}>{op.corretora?.nome_fantasia ?? op.corretora?.razao_social ?? '—'}</td>
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
                      <td style={{ fontSize: 13, color: '#6080a0', whiteSpace: 'nowrap' }}>
                        {op.data_entrada ? fmtData(op.data_entrada) : '—'}
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

      {/* ══════════ ABA COMITÊ ══════════ */}
      {aba === 'comite' && (() => {
        const emComite = operacoes.filter(op => op.status === 'Comitê')
        return (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: '#6080a0' }}>
                {emComite.length} operaç{emComite.length !== 1 ? 'ões' : 'ão'} aguardando decisão do Comitê
              </div>
            </div>
            {emComite.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#6080a0', fontSize: 15, background: '#f8fafc', borderRadius: 10, border: '1.5px dashed #c5d5e8' }}>
                🏛 Nenhuma operação aguardando decisão do Comitê.
              </div>
            ) : (
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
                      <th>Data Entrada</th>
                      <th>Decisão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emComite.map((op, i) => (
                      <tr key={op.id} onClick={() => abrirEditar(op)} style={{ cursor: 'pointer' }}>
                        <td style={{ color: '#6080a0', fontSize: 13 }}>{i + 1}</td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{op.tomador?.razao_social ?? '—'}</div>
                          {op.tomador?.cnpj && <div style={{ fontSize: 11, color: '#6080a0' }}>{maskCNPJ(op.tomador.cnpj)}</div>}
                        </td>
                        <td style={{ fontSize: 13, color: '#6080a0' }}>{op.corretora?.nome_fantasia ?? op.corretora?.razao_social ?? '—'}</td>
                        <td style={{ fontSize: 13 }}>
                          <div>{op.produto?.nome ?? '—'}</div>
                          {op.modalidade && <div style={{ fontSize: 11, color: '#6080a0' }}>{op.modalidade}</div>}
                        </td>
                        <td style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{op.lmg ? fmtMoeda(op.lmg) : '—'}</td>
                        <td style={{ fontSize: 13 }}>{op.taxa ? fmtPercent(op.taxa / 100) : '—'}</td>
                        <td>
                          {op.temperatura
                            ? <span className={`badge ${badgeTemperatura(op.temperatura)}`}>{op.temperatura}</span>
                            : <span style={{ color: '#6080a0', fontSize: 13 }}>—</span>}
                        </td>
                        <td style={{ fontSize: 13, color: '#6080a0', whiteSpace: 'nowrap' }}>
                          {op.data_entrada ? fmtData(op.data_entrada) : '—'}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); mudarStatus(op, 'Aprovado') }}
                              style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#d4f4e4', color: '#1a6a40', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                              ✅ Aprovar
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); mudarStatus(op, 'Recusado') }}
                              style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#fbeaea', color: '#a02020', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                              ❌ Recusar
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); mudarStatus(op, 'Em Análise') }}
                              style={{ padding: '5px 10px', borderRadius: 6, border: '1.5px solid #c5d5e8', background: 'white', color: '#1e4080', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                              ↩ Devolver
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )
      })()}

      {/* ══════════ ABA STATUS ══════════ */}
      {aba === 'status' && (
        <>
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
      {/* ── Modal Preview PDF ── */}
      {pdfPreviewUrl && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.82)',
          zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 12,
        }}>
          <div style={{
            display: 'flex', flexDirection: 'column',
            width: '95vw', height: '95vh',
            background: '#0a1628',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
            border: '1px solid rgba(232,184,75,0.25)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 20px',
              background: '#102040',
              borderBottom: '2px solid #e8b84b',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div>
                  <span style={{ color: '#e8b84b', fontWeight: 800, fontSize: 15 }}>FAM</span>
                  <span style={{ color: 'rgba(232,184,75,0.5)', fontWeight: 400, fontSize: 9, marginLeft: 5, letterSpacing: 2 }}>SEGURADORA</span>
                </div>
                <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.12)' }} />
                <div>
                  <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 13 }}>Pré-visualização do Relatório</div>
                  <div style={{ color: '#6080a0', fontSize: 11 }}>
                    Operações / Subscrição — {operacoesFiltradas.length} registro{operacoesFiltradas.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <a
                  href={pdfPreviewUrl}
                  download={`FAM_Operacoes_${new Date().toISOString().slice(0, 10)}.pdf`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 20px', borderRadius: 8, textDecoration: 'none',
                    background: '#e8b84b', color: '#102040',
                    fontWeight: 700, fontSize: 13,
                  }}
                >
                  ⬇ Baixar PDF
                </a>
                <button
                  onClick={() => setPdfPreviewUrl(null)}
                  style={{
                    padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#a0c0e8', fontWeight: 500,
                  }}
                >
                  ✕ Fechar
                </button>
              </div>
            </div>
            <iframe
              src={pdfPreviewUrl}
              style={{ flex: 1, border: 'none', background: '#f0f0f0' }}
              title="Pré-visualização PDF"
            />
          </div>
        </div>
      )}

      {/* ── Modal Motivo (Perdido / Recusado) ── */}
      {motivoModal && (
        <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={(e) => { if (e.target === e.currentTarget) { setMotivoModal(null); setMotivoInput('') } }}>
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div className="modal-title">
                {typeof motivoModal === 'object' && motivoModal.novoStatus === 'Perdido' && '❌ Operação Perdida'}
                {typeof motivoModal === 'object' && motivoModal.novoStatus === 'Recusado' && '🚫 Operação Recusada'}
                {motivoModal === 'form' && (form.status === 'Perdido' ? '❌ Operação Perdida' : '🚫 Operação Recusada')}
              </div>
              <button onClick={() => { setMotivoModal(null); setMotivoInput('') }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: '#6080a0', margin: '0 0 14px' }}>
              Informe o motivo para registro. Este texto será salvo no campo de observação da operação.
            </p>
            <textarea
              autoFocus
              value={motivoInput}
              onChange={(e) => setMotivoInput(e.target.value)}
              placeholder="Descreva o motivo..."
              rows={4}
              style={{ width: '100%', resize: 'vertical', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #c5d5e8', fontSize: 13, fontFamily: "'Calibri','Segoe UI',sans-serif", boxSizing: 'border-box', outline: 'none', color: '#1a2a3a' }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => { setMotivoModal(null); setMotivoInput('') }}>Cancelar</button>
              <button
                onClick={confirmarMotivo}
                disabled={!motivoInput.trim()}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#d64545', color: 'white', fontWeight: 700, cursor: motivoInput.trim() ? 'pointer' : 'not-allowed', opacity: motivoInput.trim() ? 1 : 0.5, fontSize: 14 }}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
