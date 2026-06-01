'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { maskCNPJ, maskMoeda, fmtMoeda, fmtData, fmtPercent, titleCase } from '@/lib/utils'
import type { Operacao, Tomador, Corretora, Produto, StatusFluxo, MetaNegocio, ComiteComentario } from '@/types'
import AnexosSection from '@/components/AnexosSection'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ComposedChart, Line, AreaChart, Area, CartesianGrid, Cell } from 'recharts'

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

const STATUS_PROTEGIDOS = ['Aprovado', 'Emitido', 'Perdido', 'Recusado', 'Comitê']

function autoTemp(novoStatus: string, tempAtual: string | null): string | null {
  if (novoStatus === 'Perdido' || novoStatus === 'Recusado') return 'Frio'
  if (novoStatus === 'Emitido') return null
  return tempAtual
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OperacoesPage() {
  const router = useRouter()
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
  const [filtroStatus, setFiltroStatus] = useState<string[]>([])
  const [incluirEmitidas, setIncluirEmitidas] = useState(false)
  const [incluirPerdidas, setIncluirPerdidas] = useState(false)
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
  const [modalEmissao, setModalEmissao] = useState<
    | { tipo: 'form'; motivo: string; dataEmissao: string }
    | { tipo: 'status'; op: Operacao; novoStatus: string; motivo: string; dataEmissao: string }
    | null
  >(null)
  const [motivoInput, setMotivoInput] = useState('')

  // ── Sorting ──
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [sortEmitidas, setSortEmitidas] = useState<{ field: string; dir: 'asc' | 'desc' }>({ field: 'data_entrada', dir: 'desc' })
  const [sortPerdidas, setSortPerdidas] = useState<{ field: string; dir: 'asc' | 'desc' }>({ field: 'data_entrada', dir: 'desc' })

  // ── Comitê Cockpit ──
  const [expandidoComiteId, setExpandidoComiteId] = useState<string | null>(null)
  const [abaSimulador, setAbaSimulador] = useState<Record<string, number>>({})
  const [simInputs, setSimInputs] = useState<Record<string, { sinistralidade: number; carregamento: number; margem: number }>>({})
  const [comissaoInputs, setComissaoInputs] = useState<Record<string, number>>({})
  const [taxaSimInputs, setTaxaSimInputs] = useState<Record<string, number>>({})
  const [metaMensal, setMetaMensal] = useState<MetaNegocio | null>(null)
  const [metaAnual, setMetaAnual] = useState<MetaNegocio | null>(null)
  const [mostrarConfigurarMetas, setMostrarConfigurarMetas] = useState(false)
  const [formMeta, setFormMeta] = useState({ premio_mensal: '', premio_anual: '', taxa_ponderada: '', lmg_meta: '', risco_judicial: '', sinistralidade: '', observacao: '' })
  const [salvandoMeta, setSalvandoMeta] = useState(false)
  const [comentariosComite, setComentariosComite] = useState<Record<string, ComiteComentario[]>>({})
  const [novoComentarioForm, setNovoComentarioForm] = useState<Record<string, { autor: string; comentario: string; tipo: string }>>({})
  const [salvandoComentario, setSalvandoComentario] = useState(false)
  const [modoBook, setModoBook] = useState<'emitidas' | 'book'>('emitidas')

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

  const carregarMetas = useCallback(async () => {
    const supabase = createClient()
    const agora = new Date()
    const periodoMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
    const periodoAno = `${agora.getFullYear()}`
    const { data } = await supabase.from('metas_negocio').select('*').in('periodo', [periodoMes, periodoAno])
    const lista = (data as MetaNegocio[]) ?? []
    setMetaMensal(lista.find(m => m.tipo === 'mensal') ?? null)
    setMetaAnual(lista.find(m => m.tipo === 'anual') ?? null)
  }, [])

  const carregarComentariosComite = useCallback(async (opIds: string[]) => {
    if (opIds.length === 0) return
    const supabase = createClient()
    const { data } = await supabase.from('comite_comentarios').select('*').in('operacao_id', opIds).order('created_at', { ascending: true })
    const mapa: Record<string, ComiteComentario[]> = {}
    for (const c of (data as ComiteComentario[]) ?? []) {
      if (!mapa[c.operacao_id]) mapa[c.operacao_id] = []
      mapa[c.operacao_id].push(c)
    }
    setComentariosComite(prev => ({ ...prev, ...mapa }))
  }, [])

  useEffect(() => {
    carregarOperacoes()
    carregarStatusLista()
    carregarAuxiliares()
    carregarMetas()
  }, [carregarOperacoes, carregarStatusLista, carregarAuxiliares, carregarMetas])

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
    carregarComentariosComite([op.id])
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
        razao_social: titleCase(formTomador.razao_social.trim()),
        cnpj: formTomador.cnpj.replace(/\D/g, '') || null,
        corretora_id: formTomador.corretora_id || null,
        porte: formTomador.porte || null,
        status: 'Cadastro Basico',
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
    if (enviando) return
    const encerrandoNeg = form.status === 'Perdido' || form.status === 'Recusado'
    const statusMudou = !editando || editando.status !== form.status
    if (encerrandoNeg && statusMudou) {
      setMotivoModal('form')
      setMotivoInput('')
      return
    }
    if (form.status === 'Emitido' && statusMudou) {
      const today = new Date().toISOString().slice(0, 10)
      setModalEmissao({ tipo: 'form', motivo: '', dataEmissao: editando?.data_emissao ?? today })
      return
    }
    await executarSalvarForm('')
  }

  async function executarSalvarForm(motivo: string, dataEmissao?: string) {
    setEnviando(true)
    setMensagem(null)
    const lmgNum = form.lmg ? parseFloat(form.lmg.replace(/\./g, '').replace(',', '.')) : null
    const taxaNum = form.taxa ? parseFloat(form.taxa.replace(',', '.')) : null
    const obsComMotivo = motivo
      ? `Motivo: ${motivo}${form.observacao ? '\n\n' + form.observacao : ''}`
      : form.observacao || null
    const payload: Record<string, unknown> = {
      tomador_id: form.tomador_id || null,
      corretora_id: form.corretora_id || null,
      produto_id: form.produto_id || null,
      modalidade: form.modalidade || null,
      codigo_cobertura: form.codigo_cobertura || null,
      lmg: lmgNum,
      taxa: taxaNum,
      vigencia_anos: form.vigencia_anos ? parseFloat(form.vigencia_anos.replace(',', '.')) : null,
      periodicidade_vigencia: form.periodicidade_vigencia,
      temperatura: autoTemp(form.status, form.temperatura || null),
      prioridade: form.prioridade,
      estado: form.estado || null,
      observacao: obsComMotivo,
      status: form.status,
      ativo: form.ativo,
      data_entrada: form.data_entrada || null,
      ...(dataEmissao ? { data_emissao: dataEmissao } : {}),
    }
    try {
      const supabase = createClient()
      if (editando) {
        const { error } = await supabase.from('operacoes').update(payload).eq('id', editando.id)
        if (error) throw new Error(error.message)
        if ((form.status === 'Emitido' || form.status === 'Fechado') && form.tomador_id) {
          await supabase.from('tomadores').update({ status: 'Fechado' }).eq('id', form.tomador_id)
        }
        await carregarOperacoes()
        setMensagem({ tipo: 'sucesso', texto: 'Operação atualizada com sucesso.' })
      } else {
        const { error } = await supabase.from('operacoes').insert(payload)
        if (error) throw new Error(error.message)
        if ((form.status === 'Emitido' || form.status === 'Fechado') && form.tomador_id) {
          await supabase.from('tomadores').update({ status: 'Fechado' }).eq('id', form.tomador_id)
        }
        await carregarOperacoes()
        fecharForm()
        return
      }
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
    if (novoStatus === 'Emitido') {
      const today = new Date().toISOString().slice(0, 10)
      setModalEmissao({ tipo: 'status', op, novoStatus, motivo: '', dataEmissao: op.data_emissao ?? today })
      return
    }
    _executarMudarStatus(op, novoStatus, '')
  }

  async function _executarMudarStatus(op: Operacao, novoStatus: string, motivo: string, dataEmissao?: string) {
    const supabase = createClient()
    const novaTemp = autoTemp(novoStatus, op.temperatura ?? null)
    const updateData: Record<string, unknown> = { status: novoStatus, temperatura: novaTemp }
    if (motivo) updateData.observacao = `Motivo: ${motivo}${op.observacao ? '\n\n' + op.observacao : ''}`
    if (novoStatus === 'Emitido' && dataEmissao) updateData.data_emissao = dataEmissao
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

  async function confirmarEmissao(dataEmissao: string) {
    if (!modalEmissao) return
    const pending = modalEmissao
    setModalEmissao(null)
    if (pending.tipo === 'form') {
      await executarSalvarForm(pending.motivo, dataEmissao)
    } else {
      await _executarMudarStatus(pending.op, pending.novoStatus, pending.motivo, dataEmissao)
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
        if (editandoStatus.nome !== p.nome) {
          const { error: errOp } = await supabase.from('operacoes').update({ status: p.nome }).eq('status', editandoStatus.nome)
          if (errOp) throw new Error(errOp.message)
        }
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

  function handleSortEmitidas(field: string) {
    setSortEmitidas(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' })
  }
  function sortIconEmitidas(field: string) {
    if (sortEmitidas.field !== field) return ' ↕'
    return sortEmitidas.dir === 'asc' ? ' ▲' : ' ▼'
  }
  function handleSortPerdidas(field: string) {
    setSortPerdidas(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' })
  }
  function sortIconPerdidas(field: string) {
    if (sortPerdidas.field !== field) return ' ↕'
    return sortPerdidas.dir === 'asc' ? ' ▲' : ' ▼'
  }

  const operacoesEmitidas = useMemo(() => {
    const filtered = operacoes.filter((op) => {
      if (op.status !== 'Emitido') return false
      const buscaLow = busca.toLowerCase()
      const buscaDigitos = busca.replace(/\D/g, '')
      const textMatch = !busca ||
        (op.tomador?.razao_social ?? '').toLowerCase().includes(buscaLow) ||
        (buscaDigitos.length > 0 && (op.tomador?.cnpj ?? '').includes(buscaDigitos)) ||
        (op.corretora?.razao_social ?? '').toLowerCase().includes(buscaLow) ||
        (op.corretora?.nome_fantasia ?? '').toLowerCase().includes(buscaLow) ||
        (op.produto?.nome ?? '').toLowerCase().includes(buscaLow)
      const corrMatch = !filtroCorretora || op.corretora_id === filtroCorretora
      const prodMatch = !filtroModalidade || op.modalidade === filtroModalidade
      return textMatch && corrMatch && prodMatch
    })
    const { field, dir } = sortEmitidas
    const mul = dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (field === 'tomador') cmp = (a.tomador?.razao_social ?? '').localeCompare(b.tomador?.razao_social ?? '', 'pt-BR', { sensitivity: 'base' })
      else if (field === 'corretora') cmp = (a.corretora?.nome_fantasia ?? a.corretora?.razao_social ?? '').localeCompare(b.corretora?.nome_fantasia ?? b.corretora?.razao_social ?? '', 'pt-BR', { sensitivity: 'base' })
      else if (field === 'cobertura') cmp = (a.produto?.nome ?? '').localeCompare(b.produto?.nome ?? '', 'pt-BR', { sensitivity: 'base' })
      else if (field === 'lmg') cmp = (a.lmg ?? 0) - (b.lmg ?? 0)
      else if (field === 'taxa') cmp = (a.taxa ?? 0) - (b.taxa ?? 0)
      else if (field === 'premio') cmp = (a.premio_previsto ?? 0) - (b.premio_previsto ?? 0)
      else if (field === 'data_entrada') cmp = (a.data_entrada ?? '').localeCompare(b.data_entrada ?? '')
      else cmp = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return mul * cmp
    })
  }, [operacoes, busca, filtroCorretora, filtroModalidade, sortEmitidas])

  const kpisEmitido = useMemo(() => {
    const lmg = operacoesEmitidas.reduce((s, op) => s + (op.lmg ?? 0), 0)
    const premio = operacoesEmitidas.reduce((s, op) => s + (op.premio_previsto ?? 0), 0)
    return { count: operacoesEmitidas.length, lmg, premio }
  }, [operacoesEmitidas])

  const operacoesPerdidas = useMemo(() => {
    const filtered = operacoes.filter((op) => {
      if (op.status !== 'Perdido' && op.status !== 'Recusado') return false
      const buscaLow = busca.toLowerCase()
      const buscaDigitos = busca.replace(/\D/g, '')
      const textMatch = !busca ||
        (op.tomador?.razao_social ?? '').toLowerCase().includes(buscaLow) ||
        (buscaDigitos.length > 0 && (op.tomador?.cnpj ?? '').includes(buscaDigitos)) ||
        (op.corretora?.razao_social ?? '').toLowerCase().includes(buscaLow) ||
        (op.corretora?.nome_fantasia ?? '').toLowerCase().includes(buscaLow) ||
        (op.produto?.nome ?? '').toLowerCase().includes(buscaLow)
      const corrMatch = !filtroCorretora || op.corretora_id === filtroCorretora
      const prodMatch = !filtroModalidade || op.modalidade === filtroModalidade
      return textMatch && corrMatch && prodMatch
    })
    const { field, dir } = sortPerdidas
    const mul = dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (field === 'tomador') cmp = (a.tomador?.razao_social ?? '').localeCompare(b.tomador?.razao_social ?? '', 'pt-BR', { sensitivity: 'base' })
      else if (field === 'corretora') cmp = (a.corretora?.nome_fantasia ?? a.corretora?.razao_social ?? '').localeCompare(b.corretora?.nome_fantasia ?? b.corretora?.razao_social ?? '', 'pt-BR', { sensitivity: 'base' })
      else if (field === 'cobertura') cmp = (a.produto?.nome ?? '').localeCompare(b.produto?.nome ?? '', 'pt-BR', { sensitivity: 'base' })
      else if (field === 'status') cmp = (a.status ?? '').localeCompare(b.status ?? '', 'pt-BR', { sensitivity: 'base' })
      else if (field === 'lmg') cmp = (a.lmg ?? 0) - (b.lmg ?? 0)
      else if (field === 'taxa') cmp = (a.taxa ?? 0) - (b.taxa ?? 0)
      else if (field === 'premio') cmp = (a.premio_previsto ?? 0) - (b.premio_previsto ?? 0)
      else if (field === 'data_entrada') cmp = (a.data_entrada ?? '').localeCompare(b.data_entrada ?? '')
      else cmp = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return mul * cmp
    })
  }, [operacoes, busca, filtroCorretora, filtroModalidade, sortPerdidas])

  const kpisPerdido = useMemo(() => {
    const lmg = operacoesPerdidas.reduce((s, op) => s + (op.lmg ?? 0), 0)
    const premio = operacoesPerdidas.reduce((s, op) => s + (op.premio_previsto ?? 0), 0)
    return { count: operacoesPerdidas.length, lmg, premio }
  }, [operacoesPerdidas])

  const operacoesFiltradas = useMemo(() => {
    const filtered = operacoes.filter((op) => {
      if (op.status === 'Emitido' || op.status === 'Perdido' || op.status === 'Recusado') return false
      const buscaLow = busca.toLowerCase()
      const buscaDigitos = busca.replace(/\D/g, '')
      const textMatch = !busca ||
        (op.tomador?.razao_social ?? '').toLowerCase().includes(buscaLow) ||
        (buscaDigitos.length > 0 && (op.tomador?.cnpj ?? '').includes(buscaDigitos)) ||
        (op.corretora?.razao_social ?? '').toLowerCase().includes(buscaLow) ||
        (op.corretora?.nome_fantasia ?? '').toLowerCase().includes(buscaLow) ||
        (op.produto?.nome ?? '').toLowerCase().includes(buscaLow)
      const statusMatch = filtroStatus.length === 0 || filtroStatus.includes(op.status ?? '')
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

  const kpisPerStatus = useMemo(() => {
    const map: Record<string, { count: number; lmg: number; premio: number }> = {}
    operacoes.forEach((op) => {
      if (op.status === 'Emitido' || op.status === 'Perdido' || op.status === 'Recusado') return
      const buscaLow = busca.toLowerCase()
      const buscaDigitos = busca.replace(/\D/g, '')
      const textMatch = !busca ||
        (op.tomador?.razao_social ?? '').toLowerCase().includes(buscaLow) ||
        (buscaDigitos.length > 0 && (op.tomador?.cnpj ?? '').includes(buscaDigitos)) ||
        (op.corretora?.razao_social ?? '').toLowerCase().includes(buscaLow) ||
        (op.corretora?.nome_fantasia ?? '').toLowerCase().includes(buscaLow) ||
        (op.produto?.nome ?? '').toLowerCase().includes(buscaLow)
      const tempMatch = filtroTemperatura.length === 0 || filtroTemperatura.includes(op.temperatura ?? '')
      const corrMatch = !filtroCorretora || op.corretora_id === filtroCorretora
      const prodMatch = !filtroModalidade || op.modalidade === filtroModalidade
      const priorMatch = !filtroPrioridade || op.prioridade === filtroPrioridade
      if (!textMatch || !tempMatch || !corrMatch || !prodMatch || !priorMatch) return
      const s = op.status ?? ''
      if (!map[s]) map[s] = { count: 0, lmg: 0, premio: 0 }
      map[s].count++
      map[s].lmg += op.lmg ?? 0
      map[s].premio += op.premio_previsto ?? 0
    })
    return map
  }, [operacoes, busca, filtroTemperatura, filtroCorretora, filtroModalidade, filtroPrioridade])

  const kpis = useMemo(() => {
    const CAP = 80_000_000
    const lmgTotal = operacoesFiltradas.reduce((s, op) => s + (op.lmg ?? 0), 0)
    const lmgLiquido = operacoesFiltradas.filter(op => !['Perdido', 'Recusado'].includes(op.status)).reduce((s, op) => s + (op.lmg ?? 0), 0)
    const lmgCapeadoTotal = operacoesFiltradas.reduce((s, op) => s + Math.min(op.lmg ?? 0, CAP), 0)
    const premioTotal = operacoesFiltradas.reduce((s, op) => s + (op.premio_previsto ?? 0), 0)
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

  const kpisFiltroAtivo = useMemo(() => {
    const anyFilter = filtroTemperatura.length > 0 || incluirEmitidas || incluirPerdidas
    if (!anyFilter) return null
    let lmg = 0, premio = 0, count = 0
    if (filtroTemperatura.includes('Quente'))  { lmg += kpis.lmgQuente;  premio += kpis.premioQuente;  count += kpis.qtdQuente }
    if (filtroTemperatura.includes('Morno'))   { lmg += kpis.lmgMorno;   premio += kpis.premioMorno;   count += kpis.qtdMorno }
    if (filtroTemperatura.includes('Frio'))    { lmg += kpis.lmgFrio;    premio += kpis.premioFrio;    count += kpis.qtdFrio }
    if (incluirEmitidas) { lmg += kpisEmitido.lmg;  premio += kpisEmitido.premio;  count += kpisEmitido.count }
    if (incluirPerdidas) { lmg += kpisPerdido.lmg;  premio += kpisPerdido.premio;  count += kpisPerdido.count }
    return { lmg, premio, count }
  }, [filtroTemperatura, incluirEmitidas, incluirPerdidas, kpis, kpisEmitido, kpisPerdido])

  // ─── Comitê — Book & Portfolio Memos ────────────────────────────────────────

  const periodoMesAtual = useMemo(() => {
    const a = new Date(); return `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const periodoAnoAtual = useMemo(() => `${new Date().getFullYear()}`, [])

  const bookAtualOps = useMemo(() =>
    modoBook === 'book'
      ? operacoes.filter(op => op.status === 'Emitido' || op.status === 'Aprovado')
      : operacoes.filter(op => op.status === 'Emitido'),
    [operacoes, modoBook])

  const bookLmgTotal = useMemo(() => bookAtualOps.reduce((s, op) => s + (op.lmg ?? 0), 0), [bookAtualOps])
  const bookPremioTotal = useMemo(() => bookAtualOps.reduce((s, op) => s + (op.premio_previsto ?? 0), 0), [bookAtualOps])
  const bookTmpTotal = useMemo(() => {
    const wSum = bookAtualOps.reduce((s, op) => s + (op.taxa ?? 0) * (op.lmg ?? 0) * (op.vigencia_anos ?? 1), 0)
    return bookLmgTotal > 0 ? wSum / bookLmgTotal : 0
  }, [bookAtualOps, bookLmgTotal])

  // emitidosOps é alias de bookAtualOps — usado em labels do JSX
  const emitidosOps = bookAtualOps

  const emitidosLmgTotal = useMemo(() => bookAtualOps.reduce((s, op) => s + (op.lmg ?? 0), 0), [bookAtualOps])
  const emitidosPremioTotal = useMemo(() => bookAtualOps.reduce((s, op) => s + (op.premio_previsto ?? 0), 0), [bookAtualOps])
  const emitidosTmpTotal = useMemo(() => {
    const wSum = bookAtualOps.reduce((s, op) => s + (op.taxa ?? 0) * (op.lmg ?? 0) * (op.vigencia_anos ?? 1), 0)
    return emitidosLmgTotal > 0 ? wSum / emitidosLmgTotal : 0
  }, [bookAtualOps, emitidosLmgTotal])

  const premioRealizadoMes = useMemo(() => {
    const emitidas = operacoes
      .filter(op => op.status === 'Emitido' && (op.data_emissao ?? '').startsWith(periodoMesAtual))
      .reduce((s, op) => s + (op.premio_previsto ?? 0), 0)
    if (modoBook !== 'book') return emitidas
    const aprovadas = operacoes
      .filter(op => op.status === 'Aprovado')
      .reduce((s, op) => s + (op.premio_previsto ?? 0), 0)
    return emitidas + aprovadas
  }, [operacoes, periodoMesAtual, modoBook])

  const premioRealizadoAno = useMemo(() => {
    const emitidas = operacoes
      .filter(op => op.status === 'Emitido' && (op.data_emissao ?? '').startsWith(periodoAnoAtual))
      .reduce((s, op) => s + (op.premio_previsto ?? 0), 0)
    if (modoBook !== 'book') return emitidas
    const aprovadas = operacoes
      .filter(op => op.status === 'Aprovado')
      .reduce((s, op) => s + (op.premio_previsto ?? 0), 0)
    return emitidas + aprovadas
  }, [operacoes, periodoAnoAtual, modoBook])

  const exposicaoPorModalidade = useMemo(() => {
    const map: Record<string, { qtd: number; lmg: number; premio: number; taxaMin: number; taxaMax: number; taxaLmg: number }> = {}
    for (const op of bookAtualOps) {
      const m = op.modalidade ?? 'Não informada'
      if (!map[m]) map[m] = { qtd: 0, lmg: 0, premio: 0, taxaMin: Infinity, taxaMax: -Infinity, taxaLmg: 0 }
      map[m].qtd++
      map[m].lmg += op.lmg ?? 0
      map[m].premio += op.premio_previsto ?? 0
      if (op.taxa != null) {
        map[m].taxaMin = Math.min(map[m].taxaMin, op.taxa)
        map[m].taxaMax = Math.max(map[m].taxaMax, op.taxa)
        map[m].taxaLmg += op.taxa * (op.lmg ?? 0)
      }
    }
    return Object.entries(map).map(([modalidade, d]) => ({
      modalidade,
      qtd: d.qtd,
      lmg: d.lmg,
      pctLmg: bookLmgTotal > 0 ? d.lmg / bookLmgTotal * 100 : 0,
      premio: d.premio,
      pctPremio: bookPremioTotal > 0 ? d.premio / bookPremioTotal * 100 : 0,
      taxaMin: d.taxaMin === Infinity ? 0 : d.taxaMin,
      taxaMax: d.taxaMax === -Infinity ? 0 : d.taxaMax,
      tmp: d.lmg > 0 ? d.taxaLmg / d.lmg : 0,
    })).sort((a, b) => b.premio - a.premio)
  }, [bookAtualOps, bookLmgTotal, bookPremioTotal])

  const exposicaoPorTomador = useMemo(() => {
    const map: Record<string, { nome: string; qtd: number; lmg: number; premio: number; taxaLmg: number; limiteAprovado: number | null }> = {}
    for (const op of bookAtualOps) {
      const tid = op.tomador_id ?? '__sem__'
      if (!map[tid]) map[tid] = { nome: op.tomador?.razao_social ?? 'Não informado', qtd: 0, lmg: 0, premio: 0, taxaLmg: 0, limiteAprovado: op.tomador?.limite_aprovado ?? null }
      map[tid].qtd++
      map[tid].lmg += op.lmg ?? 0
      map[tid].premio += op.premio_previsto ?? 0
      if (op.taxa != null) map[tid].taxaLmg += op.taxa * (op.lmg ?? 0)
    }
    return Object.values(map).map(d => ({
      nome: d.nome.length > 22 ? d.nome.slice(0, 20) + '…' : d.nome,
      nomeCompleto: d.nome,
      qtd: d.qtd,
      lmg: d.lmg,
      pctLmg: bookLmgTotal > 0 ? d.lmg / bookLmgTotal * 100 : 0,
      premio: d.premio,
      pctPremio: bookPremioTotal > 0 ? d.premio / bookPremioTotal * 100 : 0,
      tmp: d.lmg > 0 ? d.taxaLmg / d.lmg : 0,
      limiteAprovado: d.limiteAprovado,
    })).sort((a, b) => b.premio - a.premio).slice(0, 10)
  }, [bookAtualOps, bookLmgTotal, bookPremioTotal])

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
    doc.rect(0, 0, W, 26, 'F')
    doc.setFillColor(232, 184, 75)
    doc.rect(0, 0, W, 2.5, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(255, 255, 255)
    doc.text('FAM', M, 17)

    doc.setDrawColor(232, 184, 75)
    doc.setLineWidth(0.3)
    doc.line(48, 7, 48, 23)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(232, 184, 75)
    doc.text('S E G U R A D O R A', 52, 11)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(255, 255, 255)
    doc.text('Operações / Subscrição', 52, 19)

    const tituloFiltros: string[] = []
    if (filtroStatus.length > 0) tituloFiltros.push(filtroStatus.join('/'))
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
    doc.text(tituloRelatorio, 52, 24)

    doc.setFontSize(8)
    doc.setTextColor(160, 192, 232)
    doc.text(`Emitido em: ${dataHoje} às ${horaAgora}`, W - M, 11, { align: 'right' })

    doc.setFontSize(6)
    doc.setTextColor(120, 140, 160)
    doc.text('Documento Confidencial · Gerado automaticamente pelo FAM CRM', W - M, 18, { align: 'right' })

    // ── 2. KPI CARDS ───────────────────────────────────────────────────────
    const cardTop = 30, cardH = 22
    const cardW = (W - M * 2 - 16) / 5

    const cards = [
      { label: 'CORRETORAS',        value: String(kpis.corretoras),          sub: 'Conforme filtros',        ar: [30, 64, 120],   isCount: true },
      { label: 'TOMADORES',         value: String(kpis.tomadores),           sub: 'Conforme filtros',        ar: [30, 64, 120],   isCount: true },
      { label: 'OPERAÇÕES',         value: String(operacoesFiltradas.length), sub: 'Conforme filtros',       ar: [30, 64, 120],   isCount: true },
      { label: 'LMG EM POTENCIAL',  value: fmtMoeda(kpis.lmgLiquido),       sub: 'Excl. perdidos/recusados', ar: [16, 48, 96],  isCount: false },
      { label: 'PRÊMIO PREVISTO',   value: fmtMoeda(kpis.premioTotal),      sub: 'Prêmios previstos',       ar: [232, 184, 75],  isCount: false },
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
      doc.setFontSize(card.isCount ? 14 : 9)
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
    if (filtroStatus.length > 0) filtrosAtivos.push(`Status: ${filtroStatus.join(', ')}`)
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
        overflow: 'hidden',
      },
      headStyles: {
        fillColor: [48, 112, 200],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
        cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
      },
      footStyles: {
        fillColor: [213, 229, 250],
        textColor: [16, 48, 96],
        fontStyle: 'bold',
        fontSize: 7.5,
      },
      alternateRowStyles: { fillColor: [245, 247, 252] },
      columnStyles: {
        0:  { halign: 'center', cellWidth: 8,  textColor: [100, 110, 130] },
        1:  { halign: 'left',   cellWidth: 24 },
        2:  { halign: 'left',   cellWidth: 53 },
        3:  { halign: 'left',   cellWidth: 36 },
        4:  { halign: 'center', cellWidth: 10, textColor: [60, 80, 120] },
        5:  { halign: 'left',   cellWidth: 38 },
        6:  { halign: 'center', cellWidth: 16 },
        7:  { halign: 'right',  cellWidth: 30 },
        8:  { halign: 'center', cellWidth: 17 },
        9:  { halign: 'center', cellWidth: 12 },
        10: { halign: 'right',  cellWidth: 37, textColor: [16, 64, 120] },
      },
      didParseCell: (data: any) => {
        if (data.section === 'head' || data.section === 'foot') {
          const alignMap: Record<number, string> = { 0: 'center', 1: 'left', 2: 'left', 3: 'left', 4: 'center', 5: 'left', 6: 'center', 7: 'right', 8: 'center', 9: 'center', 10: 'right' }
          data.cell.styles.halign = alignMap[data.column.index] ?? 'left'
        }
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

  async function salvarMeta() {
    setSalvandoMeta(true)
    const supabase = createClient()
    const agora = new Date()
    const periodoMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
    const periodoAno = `${agora.getFullYear()}`
    const payloadMes = { periodo: periodoMes, tipo: 'mensal', premio_meta: parseFloat(formMeta.premio_mensal) || null, taxa_media_ponderada_meta: parseFloat(formMeta.taxa_ponderada) || null, lmg_meta: parseFloat(formMeta.lmg_meta) || null, risco_judicial: parseFloat(formMeta.risco_judicial) || null, sinistralidade_aceitavel: parseFloat(formMeta.sinistralidade) || null, observacao: formMeta.observacao || null }
    const payloadAno = { periodo: periodoAno, tipo: 'anual', premio_meta: parseFloat(formMeta.premio_anual) || null, taxa_media_ponderada_meta: parseFloat(formMeta.taxa_ponderada) || null, lmg_meta: parseFloat(formMeta.lmg_meta) || null, risco_judicial: parseFloat(formMeta.risco_judicial) || null, sinistralidade_aceitavel: parseFloat(formMeta.sinistralidade) || null, observacao: formMeta.observacao || null }
    if (metaMensal) await supabase.from('metas_negocio').update(payloadMes).eq('id', metaMensal.id)
    else await supabase.from('metas_negocio').insert(payloadMes)
    if (metaAnual) await supabase.from('metas_negocio').update(payloadAno).eq('id', metaAnual.id)
    else await supabase.from('metas_negocio').insert(payloadAno)
    await carregarMetas()
    setSalvandoMeta(false)
    setMostrarConfigurarMetas(false)
  }

  async function adicionarComentario(opId: string) {
    const f = novoComentarioForm[opId]
    if (!f?.autor || !f?.comentario) return
    setSalvandoComentario(true)
    const supabase = createClient()
    await supabase.from('comite_comentarios').insert({ operacao_id: opId, autor: f.autor, comentario: f.comentario, tipo: f.tipo ?? 'geral' })
    setNovoComentarioForm(prev => ({ ...prev, [opId]: { autor: f.autor, comentario: '', tipo: 'geral' } }))
    await carregarComentariosComite([opId])
    setSalvandoComentario(false)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const modalidadesDoSetor = form.produto_id
    ? modalidades.filter((m) => m.produto_id === form.produto_id)
    : []

  const tomadoresDaCorretora = form.corretora_id
    ? tomadores.filter((t) => t.corretora_id === form.corretora_id)
    : tomadores

  const opFinalizada = !!(editando && ['Emitido', 'Perdido', 'Recusado'].includes(editando.status))

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
        {/* Card: LMG Total Líquido */}
        <div style={{
          flex: '2 1 180px', minWidth: 160, padding: '14px 16px', borderRadius: 10,
          background: '#0d2040', border: '1px solid rgba(56,120,200,0.3)',
        }}>
          <div style={{ fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(180,200,220,0.7)', marginBottom: 6 }}>LMG Total em Potencial</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#e8b84b', lineHeight: 1.1 }}>{fmtMoeda(kpisFiltroAtivo ? kpisFiltroAtivo.lmg : kpis.lmgLiquido)}</div>
          <div style={{ fontSize: 11, color: 'rgba(180,200,220,0.6)', marginTop: 4 }}>{kpisFiltroAtivo ? 'LMG da seleção ativa' : 'LMG Total − Perdidos/Recusados'}</div>
        </div>
        {/* Card: Prêmio Previsto Total */}
        <div style={{
          flex: '2 1 180px', minWidth: 160, padding: '14px 16px', borderRadius: 10,
          background: '#0d2040', border: '1px solid rgba(56,120,200,0.3)',
        }}>
          <div style={{ fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(180,200,220,0.7)', marginBottom: 6 }}>Prêmio Previsto Total</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#e8b84b', lineHeight: 1.1 }}>{fmtMoeda(kpisFiltroAtivo ? kpisFiltroAtivo.premio : kpis.premioTotal)}</div>
          <div style={{ fontSize: 11, color: 'rgba(180,200,220,0.6)', marginTop: 4 }}>{kpisFiltroAtivo ? 'Prêmio da seleção ativa' : 'Soma prêmios previstos'}</div>
        </div>
      </div>

      {/* Temperatura + Emitidas */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {/* Quente */}
        <div
          onClick={(e) => setFiltroTemperatura(prev => {
            const sel = prev.includes('Quente')
            if (e.ctrlKey || e.metaKey) return sel ? prev.filter(t => t !== 'Quente') : [...prev, 'Quente']
            return sel && prev.length === 1 ? [] : ['Quente']
          })}
          style={{
            padding: '10px 16px', borderRadius: 10, minWidth: 160, flex: '1 1 160px', cursor: 'pointer', transition: 'all 0.15s',
            background: filtroTemperatura.includes('Quente') ? '#ffd6d6' : '#fff5f5',
            border: filtroTemperatura.includes('Quente') ? '2px solid #d64545' : '2px solid #f5b8b8',
            borderLeft: '4px solid #d64545',
            boxShadow: filtroTemperatura.includes('Quente') ? '0 3px 10px rgba(214,69,69,0.22)' : '0 1px 4px rgba(214,69,69,0.08)',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, color: '#a03030', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>
            🔥 Quente {filtroTemperatura.includes('Quente') && <span style={{ fontWeight: 400, fontSize: 9 }}>— limpar</span>}
          </div>
          <div style={{ marginBottom: 3 }}>
            <span style={{ fontSize: 30, fontWeight: 900, color: '#d64545', lineHeight: 1 }}>{kpis.qtdQuente}</span>
          </div>
          <div style={{ marginBottom: 1 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#b03030' }}>{fmtMoeda(kpis.premioQuente)}</span>
            <span style={{ fontSize: 10, color: '#a05050', marginLeft: 3 }}>Prêmio</span>
          </div>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#d64545' }}>{fmtMoeda(kpis.lmgQuente)}</span>
            <span style={{ fontSize: 10, color: '#a05050', marginLeft: 3 }}>LMG</span>
          </div>
          <div style={{ fontSize: 10, color: '#a03030', marginTop: 5, fontStyle: 'italic', borderTop: '1px dashed #f5b8b8', paddingTop: 4 }}>
            Entrada prevista no mês
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
            padding: '10px 14px', borderRadius: 10, minWidth: 148, flex: '1 1 148px', cursor: 'pointer', transition: 'all 0.15s',
            background: filtroTemperatura.includes('Morno') ? '#ffe8c0' : '#fff8f0',
            border: filtroTemperatura.includes('Morno') ? '2px solid #d07830' : '1.5px solid #f5d090',
            boxShadow: filtroTemperatura.includes('Morno') ? '0 2px 6px rgba(208,120,48,0.18)' : 'none',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: '#a06010', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 5 }}>
            🌤 Morno {filtroTemperatura.includes('Morno') && <span style={{ fontWeight: 400, fontSize: 9 }}>— limpar</span>}
          </div>
          <div style={{ marginBottom: 3 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: '#d07830', lineHeight: 1 }}>{kpis.qtdMorno}</span>
          </div>
          <div style={{ marginBottom: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#a06010' }}>{fmtMoeda(kpis.premioMorno)}</span>
            <span style={{ fontSize: 10, color: '#a07030', marginLeft: 3 }}>Prêmio</span>
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#d07830' }}>{fmtMoeda(kpis.lmgMorno)}</span>
            <span style={{ fontSize: 10, color: '#a07030', marginLeft: 3 }}>LMG</span>
          </div>
          <div style={{ fontSize: 10, color: '#a06010', marginTop: 5, fontStyle: 'italic', borderTop: '1px dashed #f5d090', paddingTop: 4 }}>
            Sem previsão de entrada
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
            padding: '10px 14px', borderRadius: 10, minWidth: 148, flex: '1 1 148px', cursor: 'pointer', transition: 'all 0.15s',
            background: filtroTemperatura.includes('Frio') ? '#c8deff' : '#f0f6ff',
            border: filtroTemperatura.includes('Frio') ? '2px solid #3070c8' : '1.5px solid #b0d0f0',
            boxShadow: filtroTemperatura.includes('Frio') ? '0 2px 6px rgba(48,112,200,0.18)' : 'none',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: '#1a4080', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 5 }}>
            ❄ Frio {filtroTemperatura.includes('Frio') && <span style={{ fontWeight: 400, fontSize: 9 }}>— limpar</span>}
          </div>
          <div style={{ marginBottom: 3 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: '#3070c8', lineHeight: 1 }}>{kpis.qtdFrio}</span>
          </div>
          <div style={{ marginBottom: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#1a4080' }}>{fmtMoeda(kpis.premioFrio)}</span>
            <span style={{ fontSize: 10, color: '#4060a0', marginLeft: 3 }}>Prêmio</span>
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#3070c8' }}>{fmtMoeda(kpis.lmgFrio)}</span>
            <span style={{ fontSize: 10, color: '#4060a0', marginLeft: 3 }}>LMG</span>
          </div>
          <div style={{ fontSize: 10, color: '#1a4080', marginTop: 5, fontStyle: 'italic', borderTop: '1px dashed #b0d0f0', paddingTop: 4 }}>
            Fora do funil ativo
          </div>
        </div>
        {/* Divisor + Card Emitidas */}
        <div style={{ borderLeft: '1.5px solid #d0e4f5', margin: '4px 4px', alignSelf: 'stretch' }} />
        <div
          onClick={() => setIncluirEmitidas(prev => !prev)}
          style={{
            padding: '10px 14px', borderRadius: 10, minWidth: 148, flex: '1 1 148px', cursor: 'pointer', transition: 'all 0.15s',
            background: incluirEmitidas ? '#b8f0d4' : '#f0faf4',
            border: incluirEmitidas ? '2px solid #27a96c' : '1.5px solid #a8d8b8',
            boxShadow: incluirEmitidas ? '0 2px 6px rgba(39,169,108,0.20)' : '0 1px 3px rgba(39,169,108,0.08)',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: '#1a6040', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 5 }}>
            ✅ Emitidas {incluirEmitidas && <span style={{ fontWeight: 400, fontSize: 9 }}>— limpar</span>}
          </div>
          <div style={{ marginBottom: 3 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: '#27a96c', lineHeight: 1 }}>{kpisEmitido.count}</span>
          </div>
          <div style={{ marginBottom: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#1a6040' }}>{fmtMoeda(kpisEmitido.premio)}</span>
            <span style={{ fontSize: 10, color: '#3a8060', marginLeft: 3 }}>Prêmio</span>
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#27a96c' }}>{fmtMoeda(kpisEmitido.lmg)}</span>
            <span style={{ fontSize: 10, color: '#3a8060', marginLeft: 3 }}>LMG</span>
          </div>
          <div style={{ fontSize: 10, color: '#1a6040', marginTop: 5, fontStyle: 'italic', borderTop: '1px dashed #a8d8b8', paddingTop: 4 }}>
            Fora do funil
          </div>
        </div>
        {/* Divisor + Card Perdidas/Recusadas — visual acinzentado */}
        <div style={{ borderLeft: '1.5px solid #d8d8e0', margin: '4px 4px', alignSelf: 'stretch' }} />
        <div
          onClick={() => setIncluirPerdidas(prev => !prev)}
          style={{
            padding: '10px 14px', borderRadius: 10, minWidth: 148, flex: '1 1 148px', cursor: 'pointer', transition: 'all 0.15s',
            background: incluirPerdidas ? '#e2e2e6' : '#f2f2f4',
            border: incluirPerdidas ? '1.5px solid #aaaaaa' : '1.5px solid #d0d0d4',
            boxShadow: 'none',
            opacity: incluirPerdidas ? 1 : 0.85,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 600, color: '#777788', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 5 }}>
            ✕ Perdidas/Recusadas {incluirPerdidas && <span style={{ fontWeight: 400, fontSize: 9 }}>— limpar</span>}
          </div>
          <div style={{ marginBottom: 3 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: '#aaaaaa', lineHeight: 1 }}>{kpisPerdido.count}</span>
          </div>
          <div style={{ marginBottom: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#888888' }}>{fmtMoeda(kpisPerdido.premio)}</span>
            <span style={{ fontSize: 10, color: '#aaaaaa', marginLeft: 3 }}>Prêmio</span>
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 500, color: '#aaaaaa' }}>{fmtMoeda(kpisPerdido.lmg)}</span>
            <span style={{ fontSize: 10, color: '#aaaaaa', marginLeft: 3 }}>LMG</span>
          </div>
          <div style={{ fontSize: 10, color: '#aaaaaa', marginTop: 5, fontStyle: 'italic', borderTop: '1px dashed #cccccc', paddingTop: 4 }}>
            Encerrados
          </div>
        </div>
      </div>

      {/* Banner de totais — aparece quando qualquer seleção especial está ativa */}
      {(filtroTemperatura.length > 0 || incluirEmitidas || incluirPerdidas) && (() => {
        const partes: { label: string; count: number; lmg: number; premio: number }[] = []
        if (filtroTemperatura.includes('Quente')) partes.push({ label: '🔥 Quente', count: kpis.qtdQuente, lmg: kpis.lmgQuente, premio: kpis.premioQuente })
        if (filtroTemperatura.includes('Morno')) partes.push({ label: '🌤 Morno', count: kpis.qtdMorno, lmg: kpis.lmgMorno, premio: kpis.premioMorno })
        if (filtroTemperatura.includes('Frio')) partes.push({ label: '❄ Frio', count: kpis.qtdFrio, lmg: kpis.lmgFrio, premio: kpis.premioFrio })
        if (incluirEmitidas) partes.push({ label: '✅ Emitidas', count: kpisEmitido.count, lmg: kpisEmitido.lmg, premio: kpisEmitido.premio })
        if (incluirPerdidas) partes.push({ label: '✕ Perdidas/Recusadas', count: kpisPerdido.count, lmg: kpisPerdido.lmg, premio: kpisPerdido.premio })
        if (partes.length === 0) return null
        const totalCount = partes.reduce((s, p) => s + p.count, 0)
        const totalLmg = partes.reduce((s, p) => s + p.lmg, 0)
        const totalPremio = partes.reduce((s, p) => s + p.premio, 0)
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            background: '#f0f6ff', border: '1.5px solid #b0c8e8', borderRadius: 10,
            padding: '10px 18px', marginBottom: 16, fontSize: 13,
          }}>
            <span style={{ fontSize: 12, color: '#4060a0', fontWeight: 700 }}>{partes.length > 1 ? 'Seleção combinada:' : 'Resumo:'}</span>
            <span style={{ color: '#3050a0' }}>{partes.map(p => `${p.label} (${p.count})`).join(' + ')}</span>
            <span style={{ color: '#6080a0' }}>→</span>
            <span style={{ fontWeight: 800, color: '#1a3070' }}>{totalCount} operações</span>
            <span style={{ color: '#6080a0' }}>|</span>
            <span style={{ color: '#3050a0' }}>LMG <strong>{fmtMoeda(totalLmg)}</strong></span>
            <span style={{ color: '#6080a0' }}>|</span>
            <span style={{ color: '#3050a0' }}>Prêmio <strong>{fmtMoeda(totalPremio)}</strong></span>
          </div>
        )
      })()}

      {/* Status pills */}
      {statusOpcoes.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6080a0', letterSpacing: '0.5px', textTransform: 'uppercase', marginRight: 4 }}>Status:</span>
          {statusOpcoes.filter(s => s.ativo && s.nome !== 'Perdido' && s.nome !== 'Recusado' && s.nome !== 'Emitido').map((s) => {
            const stats = kpisPerStatus[s.nome]
            const sel = filtroStatus.includes(s.nome)
            const count = s.nome === 'Emitido' ? kpisEmitido.count : (stats?.count ?? 0)
            return (
              <button
                key={s.id}
                onClick={() => {
                  if (s.nome === 'Emitido') {
                    setIncluirEmitidas(prev => !prev)
                  } else {
                    setFiltroStatus(prev => sel ? prev.filter(x => x !== s.nome) : [...prev, s.nome])
                  }
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 20, cursor: 'pointer', transition: 'all 0.12s',
                  background: (sel || (s.nome === 'Emitido' && incluirEmitidas)) ? s.cor + '33' : s.cor + '11',
                  border: (sel || (s.nome === 'Emitido' && incluirEmitidas)) ? `2px solid ${s.cor}` : `1.5px solid ${s.cor}55`,
                  color: s.cor, fontWeight: (sel || (s.nome === 'Emitido' && incluirEmitidas)) ? 800 : 600, fontSize: 12,
                  fontFamily: "'Calibri','Segoe UI',sans-serif",
                  boxShadow: (sel || (s.nome === 'Emitido' && incluirEmitidas)) ? `0 2px 6px ${s.cor}44` : 'none',
                }}
              >
                {s.nome}
                <span style={{
                  background: (sel || (s.nome === 'Emitido' && incluirEmitidas)) ? s.cor : s.cor + '33',
                  color: (sel || (s.nome === 'Emitido' && incluirEmitidas)) ? 'white' : s.cor,
                  borderRadius: 10, padding: '1px 6px', fontSize: 11, fontWeight: 700,
                }}>
                  {count}
                </span>
              </button>
            )
          })}
          {filtroStatus.length > 0 && (
            <button
              onClick={() => setFiltroStatus([])}
              style={{ padding: '3px 8px', borderRadius: 12, border: '1px solid #c5d5e8', background: 'white', color: '#6080a0', fontSize: 11, cursor: 'pointer', fontFamily: "'Calibri','Segoe UI',sans-serif" }}
            >
              ✕ limpar
            </button>
          )}
        </div>
      )}

      {/* Abas internas */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #d0e4f5', alignItems: 'flex-end' }}>
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
        <button
          onClick={() => router.push('/operacoes/mensal')}
          style={{
            marginLeft: 'auto', marginBottom: 4, padding: '7px 16px', borderRadius: 8,
            background: '#e8f0fb', border: '1.5px solid #3070c8',
            color: '#1e4080', fontFamily: "'Calibri','Segoe UI',sans-serif",
            fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          📅 KPIs por Mês
        </button>
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
                {opFinalizada && (
                  <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#fff8e8', border: '1.5px solid #e8b84b', color: '#7a5000', fontSize: 13, fontWeight: 600 }}>
                    🔒 Operação <strong>{editando?.status}</strong> — campos bloqueados. Altere o status para desbloquear.
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
                        <select className="fam-input" style={{ flex: 1 }} disabled={opFinalizada} value={form.tomador_id} onChange={(e) => {
                          const tomadorId = e.target.value
                          const tomador = tomadores.find((t) => t.id === tomadorId)
                          setForm((f) => ({ ...f, tomador_id: tomadorId, corretora_id: tomador?.corretora_id ?? f.corretora_id }))
                        }}>
                          <option value="">— Selecione o tomador —</option>
                          {tomadoresDaCorretora.map((t) => <option key={t.id} value={t.id}>{t.razao_social}{t.cnpj ? ` — ${maskCNPJ(t.cnpj)}` : ''}</option>)}
                        </select>
                        <button
                          type="button"
                          disabled={opFinalizada}
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
                      <select className="fam-input" disabled={opFinalizada} value={form.corretora_id} onChange={(e) => {
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
                              disabled={opFinalizada}
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
                        disabled={opFinalizada || !form.produto_id}
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
                      <input className="fam-input" type="text" placeholder="Ex: 1.000.000,00" disabled={opFinalizada}
                        value={form.lmg}
                        onChange={(e) => {
                          const lmg = maskMoeda(e.target.value)
                          setForm((f) => ({ ...f, lmg, premio_previsto: calcPremio(lmg, f.taxa, f.vigencia_anos, f.periodicidade_vigencia) }))
                        }} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Taxa (%)</label>
                      <input className="fam-input" type="text" placeholder="Ex: 1,50" disabled={opFinalizada}
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
                          <button key={p} type="button" disabled={opFinalizada}
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
                      <input className="fam-input" type="text" disabled={opFinalizada}
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
                      <input className="fam-input" type="date" disabled={opFinalizada} value={form.data_entrada}
                        onChange={(e) => setForm({ ...form, data_entrada: e.target.value })} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Prioridade</label>
                      <select className="fam-input" disabled={opFinalizada} value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })}>
                        <option value="Fluxo Normal">Fluxo Normal</option>
                        <option value="Prioridade">Prioridade</option>
                        <option value="Urgente">🚨 Urgente</option>
                      </select>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Temperatura</label>
                      <select className="fam-input" disabled={opFinalizada} value={form.temperatura} onChange={(e) => setForm({ ...form, temperatura: e.target.value })}>
                        <option value="Frio">❄ Frio</option>
                        <option value="Morno">🌤 Morno</option>
                        <option value="Quente">🔥 Quente</option>
                      </select>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Estado</label>
                      <select className="fam-input" disabled={opFinalizada} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                        <option value="">— UF —</option>
                        {ESTADOS_BR.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                      </select>
                    </div>
                    <div className="form-field full">
                      <label className="form-label">Observação</label>
                      <textarea className="fam-input" placeholder="Informações adicionais..." disabled={opFinalizada}
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
                    <button type="submit" className="btn-primary" disabled={enviando || (opFinalizada && form.status === editando?.status)}>
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
                {editando && (editando.comite_notas || (comentariosComite[editando.id]?.length ?? 0) > 0) && (
                  <>
                    <hr style={{ border: 'none', borderTop: '1.5px solid #e0ecf8', margin: '20px 0' }} />
                    <div style={{ background: '#f0f6ff', borderRadius: 10, padding: '14px 16px', border: '1px solid #d0e4f5' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1a4080', marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' as const }}>
                        Histórico do Comitê
                      </div>
                      {editando.comite_notas && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 11, color: '#6080a0', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 3 }}>Notas do Analista</div>
                          <div style={{ fontSize: 13, color: '#1a2a3a', background: 'white', borderRadius: 6, padding: '8px 10px', border: '1px solid #e0ecf0', lineHeight: 1.5 }}>{editando.comite_notas}</div>
                        </div>
                      )}
                      {(comentariosComite[editando.id]?.length ?? 0) > 0 && (
                        <div>
                          <div style={{ fontSize: 11, color: '#6080a0', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 5 }}>
                            Comentários ({comentariosComite[editando.id].length})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 200, overflowY: 'auto' }}>
                            {comentariosComite[editando.id].map(c => {
                              const cor: Record<string, string> = { restricao: '#d64545', condicao: '#d07830', aprovacao: '#27a96c', negacao: '#888', geral: '#3070c8' }
                              return (
                                <div key={c.id} style={{ background: 'white', borderRadius: 6, padding: '7px 10px', border: '1px solid #e0ecf0' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                    <span style={{ fontWeight: 700, fontSize: 12, color: '#1a4080' }}>{c.autor}</span>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                      <span style={{ fontSize: 11, color: cor[c.tipo] ?? '#6080a0', fontWeight: 700, textTransform: 'capitalize' as const }}>{c.tipo}</span>
                                      <span style={{ fontSize: 10, color: '#6080a0' }}>{new Date(c.created_at).toLocaleString('pt-BR')}</span>
                                    </div>
                                  </div>
                                  <div style={{ fontSize: 12, color: '#1a2a3a' }}>{c.comentario}</div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
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
            {(busca || filtroStatus.length > 0 || filtroPrioridade || filtroTemperatura.length > 0 || filtroCorretora || filtroModalidade || incluirEmitidas) && (
              <div className="filter-group" style={{ justifyContent: 'flex-end' }}>
                <label className="filter-label">&nbsp;</label>
                <button className="btn-clear" onClick={() => { setBusca(''); setFiltroStatus([]); setFiltroPrioridade(''); setFiltroTemperatura([]); setFiltroCorretora(''); setFiltroModalidade(''); setIncluirEmitidas(false) }}>Limpar</button>
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
                    {busca || filtroStatus.length > 0 || filtroPrioridade || filtroTemperatura.length > 0 || filtroCorretora || filtroModalidade
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

          {/* ── Seção Operações Emitidas (sempre visível) ── */}
          <div style={{ marginTop: 32, borderTop: '2px solid #a8d8b8', paddingTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a6040' }}>
                ✅ Operações Emitidas
              </div>
              <span style={{
                background: '#e8f5e9', color: '#1a6040', border: '1.5px solid #a8d8b8',
                borderRadius: 12, padding: '2px 10px', fontSize: 13, fontWeight: 700,
              }}>{kpisEmitido.count}</span>
              <span style={{ fontSize: 12, color: '#6080a0', fontStyle: 'italic' }}>
                Fora do funil de temperatura — negócios concluídos
              </span>
            </div>
            {operacoesEmitidas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: '#6080a0', fontSize: 14, background: '#f8fdf9', borderRadius: 10, border: '1.5px dashed #a8d8b8' }}>
                ✅ Nenhuma operação emitida registrada.
              </div>
            ) : (
              <div className="fam-table-wrap">
                <table className="fam-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th style={thSort} onClick={() => handleSortEmitidas('tomador')}>Tomador{sortIconEmitidas('tomador')}</th>
                      <th style={thSort} onClick={() => handleSortEmitidas('corretora')}>Corretora{sortIconEmitidas('corretora')}</th>
                      <th style={thSort} onClick={() => handleSortEmitidas('cobertura')}>Cobertura / Modalidade{sortIconEmitidas('cobertura')}</th>
                      <th style={thSort} onClick={() => handleSortEmitidas('lmg')}>LMG{sortIconEmitidas('lmg')}</th>
                      <th style={thSort} onClick={() => handleSortEmitidas('taxa')}>Taxa{sortIconEmitidas('taxa')}</th>
                      <th style={thSort} onClick={() => handleSortEmitidas('premio')}>Prêmio Previsto{sortIconEmitidas('premio')}</th>
                      <th style={thSort} onClick={() => handleSortEmitidas('data_entrada')}>Data Entrada{sortIconEmitidas('data_entrada')}</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operacoesEmitidas.map((op, i) => (
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
                        <td style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: '#27a96c' }}>
                          {op.lmg ? fmtMoeda(op.lmg) : '—'}
                        </td>
                        <td style={{ fontSize: 13 }}>
                          {op.taxa ? fmtPercent(op.taxa / 100) : '—'}
                        </td>
                        <td style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: '#1a6040' }}>
                          {op.premio_previsto ? fmtMoeda(op.premio_previsto) : '—'}
                        </td>
                        <td style={{ fontSize: 13, color: '#6080a0', whiteSpace: 'nowrap' }}>
                          {op.data_entrada ? fmtData(op.data_entrada) : '—'}
                        </td>
                        <td>
                          <button onClick={() => abrirEditar(op)}
                            style={{ padding: '5px 12px', borderRadius: 6, border: '1.5px solid #a8d8b8', background: '#f0faf4', color: '#1a6040', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Calibri','Segoe UI',sans-serif" }}>
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Seção Operações Perdidas / Recusadas (sempre visível) ── */}
          <div style={{ marginTop: 32, borderTop: '2px solid #c5c5d0', paddingTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#666677' }}>
                ⚫ Operações Perdidas / Recusadas
              </div>
              <span style={{
                background: '#f0f0f4', color: '#666677', border: '1.5px solid #c5c5d0',
                borderRadius: 12, padding: '2px 10px', fontSize: 13, fontWeight: 700,
              }}>{kpisPerdido.count}</span>
              <span style={{ fontSize: 12, color: '#888899', fontStyle: 'italic' }}>
                Fora do funil — negócios encerrados
              </span>
            </div>
            {operacoesPerdidas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: '#888899', fontSize: 14, background: '#f4f4f6', borderRadius: 10, border: '1.5px dashed #c5c5d0' }}>
                ⚫ Nenhuma operação perdida ou recusada registrada.
              </div>
            ) : (
              <div className="fam-table-wrap">
                <table className="fam-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th style={thSort} onClick={() => handleSortPerdidas('tomador')}>Tomador{sortIconPerdidas('tomador')}</th>
                      <th style={thSort} onClick={() => handleSortPerdidas('corretora')}>Corretora{sortIconPerdidas('corretora')}</th>
                      <th style={thSort} onClick={() => handleSortPerdidas('cobertura')}>Cobertura / Modalidade{sortIconPerdidas('cobertura')}</th>
                      <th style={thSort} onClick={() => handleSortPerdidas('status')}>Status{sortIconPerdidas('status')}</th>
                      <th style={thSort} onClick={() => handleSortPerdidas('lmg')}>LMG{sortIconPerdidas('lmg')}</th>
                      <th style={thSort} onClick={() => handleSortPerdidas('taxa')}>Taxa{sortIconPerdidas('taxa')}</th>
                      <th style={thSort} onClick={() => handleSortPerdidas('premio')}>Prêmio Previsto{sortIconPerdidas('premio')}</th>
                      <th style={thSort} onClick={() => handleSortPerdidas('data_entrada')}>Data Entrada{sortIconPerdidas('data_entrada')}</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operacoesPerdidas.map((op, i) => (
                      <tr key={op.id} onClick={() => abrirEditar(op)} style={{ cursor: 'pointer', opacity: 0.82 }}>
                        <td style={{ color: '#888899', fontSize: 13 }}>{i + 1}</td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#555566' }}>{op.tomador?.razao_social ?? '—'}</div>
                          {op.tomador?.cnpj && <div style={{ fontSize: 11, color: '#888899' }}>{maskCNPJ(op.tomador.cnpj)}</div>}
                        </td>
                        <td style={{ fontSize: 13, color: '#888899' }}>{op.corretora?.nome_fantasia ?? op.corretora?.razao_social ?? '—'}</td>
                        <td style={{ fontSize: 13, color: '#666677' }}>
                          <div>{op.produto?.nome ?? '—'}</div>
                          {op.modalidade && <div style={{ fontSize: 11, color: '#888899' }}>{op.modalidade}</div>}
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700,
                            background: op.status === 'Perdido' ? '#fde8e8' : '#fdf0e0',
                            color: op.status === 'Perdido' ? '#b03030' : '#a06010',
                            border: op.status === 'Perdido' ? '1px solid #f5b8b8' : '1px solid #f5d090',
                          }}>
                            {op.status}
                          </span>
                        </td>
                        <td style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: '#888899' }}>
                          {op.lmg ? fmtMoeda(op.lmg) : '—'}
                        </td>
                        <td style={{ fontSize: 13, color: '#888899' }}>
                          {op.taxa ? fmtPercent(op.taxa / 100) : '—'}
                        </td>
                        <td style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: '#888899' }}>
                          {op.premio_previsto ? fmtMoeda(op.premio_previsto) : '—'}
                        </td>
                        <td style={{ fontSize: 13, color: '#888899', whiteSpace: 'nowrap' }}>
                          {op.data_entrada ? fmtData(op.data_entrada) : '—'}
                        </td>
                        <td>
                          <button onClick={() => abrirEditar(op)}
                            style={{ padding: '5px 12px', borderRadius: 6, border: '1.5px solid #c5c5d0', background: '#f4f4f6', color: '#666677', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Calibri','Segoe UI',sans-serif" }}>
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════ ABA COMITÊ ══════════ */}
      {aba === 'comite' && (() => {
        const emComite = operacoes.filter(op => op.status === 'Comitê')
        const agora = new Date()
        const mesAnoLabel = agora.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        const CC = ['#3070c8','#27a96c','#e8b84b','#d64545','#a05010','#6030a0','#1a7a50','#d07830']
        return (
          <>
            {/* ── PAINEL META vs REALIZADO ── */}
            <div style={{ background: '#0d2040', borderRadius: 12, padding: '16px 20px', marginBottom: 16, border: '1px solid rgba(56,120,200,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ color: 'rgba(180,200,220,0.9)', fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
                    🎯 PAINEL DE METAS — {mesAnoLabel.toUpperCase()}
                    {modoBook === 'book' && <span style={{ marginLeft: 8, background: '#e8b84b', color: '#3a2800', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 10 }}>+APROVADAS</span>}
                  </div>
                  {/* Toggle Book */}
                  <div style={{ display: 'flex', gap: 5 }}>
                    {(['emitidas', 'book'] as const).map(modo => (
                      <button key={modo} onClick={() => setModoBook(modo)} style={{
                        padding: '3px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer', fontWeight: modoBook === modo ? 800 : 600,
                        background: modoBook === modo ? '#3070c8' : 'rgba(48,112,200,0.12)',
                        border: modoBook === modo ? '2px solid #3070c8' : '1.5px solid rgba(48,112,200,0.3)',
                        color: modoBook === modo ? 'white' : 'rgba(180,200,220,0.7)', transition: 'all 0.15s',
                      }}>
                        {modo === 'emitidas' ? '✅ Só Emitidas' : '📊 +Aprovadas'}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => setMostrarConfigurarMetas(v => !v)}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(56,120,200,0.5)', background: 'rgba(56,120,200,0.15)', color: 'rgba(180,200,220,0.9)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  ⚙ {mostrarConfigurarMetas ? 'Fechar' : 'Configurar Metas'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {/* Meta Mês */}
                {(() => { const meta = metaMensal?.premio_meta ?? 0; const pct = meta > 0 ? Math.min(100, premioRealizadoMes / meta * 100) : 0; const gap = meta > 0 ? Math.max(0, meta - premioRealizadoMes) : 0; const cor = pct >= 80 ? '#27a96c' : pct >= 50 ? '#e8b84b' : '#d64545'; return (
                  <div onClick={() => router.push('/operacoes/mensal')} title="Ver KPIs por mês" style={{ flex: '1 1 170px', background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(56,120,200,0.2)', cursor: 'pointer', transition: 'border-color 0.15s' }}>
                    <div style={{ fontSize: 10, letterSpacing: 1, color: 'rgba(180,200,220,0.6)', textTransform: 'uppercase', marginBottom: 4 }}>🎯 Meta Mês <span style={{ fontSize: 9, opacity: 0.6 }}>→</span></div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'white' }}>{fmtMoeda(premioRealizadoMes)}</div>
                    <div style={{ fontSize: 11, color: 'rgba(180,200,220,0.4)', marginBottom: 7 }}>de {meta > 0 ? fmtMoeda(meta) : 'Não definida'}</div>
                    <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 4, height: 6 }}><div style={{ height: '100%', borderRadius: 4, background: cor, width: `${pct}%`, transition: 'width 0.4s' }} /></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11 }}>
                      <span style={{ color: cor, fontWeight: 700 }}>{pct.toFixed(1)}%</span>
                      {gap > 0 && <span style={{ color: 'rgba(180,200,220,0.4)' }}>Gap {fmtMoeda(gap)}</span>}
                    </div>
                  </div>
                )})()}
                {/* Meta Ano */}
                {(() => { const meta = metaAnual?.premio_meta ?? 0; const pct = meta > 0 ? Math.min(100, premioRealizadoAno / meta * 100) : 0; const gap = meta > 0 ? Math.max(0, meta - premioRealizadoAno) : 0; const cor = pct >= 80 ? '#27a96c' : pct >= 50 ? '#e8b84b' : '#d64545'; return (
                  <div style={{ flex: '1 1 170px', background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(56,120,200,0.2)' }}>
                    <div style={{ fontSize: 10, letterSpacing: 1, color: 'rgba(180,200,220,0.6)', textTransform: 'uppercase', marginBottom: 4 }}>📅 Meta Ano</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'white' }}>{fmtMoeda(premioRealizadoAno)}</div>
                    <div style={{ fontSize: 11, color: 'rgba(180,200,220,0.4)', marginBottom: 7 }}>de {meta > 0 ? fmtMoeda(meta) : 'Não definida'}</div>
                    <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 4, height: 6 }}><div style={{ height: '100%', borderRadius: 4, background: cor, width: `${pct}%`, transition: 'width 0.4s' }} /></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11 }}>
                      <span style={{ color: cor, fontWeight: 700 }}>{pct.toFixed(1)}%</span>
                      {gap > 0 && <span style={{ color: 'rgba(180,200,220,0.4)' }}>Gap {fmtMoeda(gap)}</span>}
                    </div>
                  </div>
                )})()}
                {/* TMP */}
                {(() => { const meta = metaMensal?.taxa_media_ponderada_meta ?? 0; const delta = meta > 0 ? emitidosTmpTotal - meta : 0; return (
                  <div style={{ flex: '1 1 170px', background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(56,120,200,0.2)' }}>
                    <div style={{ fontSize: 10, letterSpacing: 1, color: 'rgba(180,200,220,0.6)', textTransform: 'uppercase', marginBottom: 4 }}>📐 Taxa Méd. Pond.</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#e8b84b' }}>{fmtPercent(emitidosTmpTotal / 100)}</div>
                    {meta > 0 && <div style={{ fontSize: 12, color: delta >= 0 ? '#27a96c' : '#d64545', fontWeight: 700, marginTop: 4 }}>{delta >= 0 ? '▲' : '▼'} {delta >= 0 ? '+' : ''}{fmtPercent(delta / 100)} vs meta {fmtPercent(meta / 100)}</div>}
                    {meta === 0 && <div style={{ fontSize: 11, color: 'rgba(180,200,220,0.4)', marginTop: 4 }}>Meta não definida</div>}
                    <div style={{ fontSize: 11, color: 'rgba(180,200,220,0.4)', marginTop: 6 }}>{emitidosOps.length} ops {modoBook === 'book' ? 'Emitidas + Aprovadas' : 'emitidas'}</div>
                  </div>
                )})()}
                {/* LMG Emitido */}
                <div style={{ flex: '1 1 170px', background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(56,120,200,0.2)' }}>
                  <div style={{ fontSize: 10, letterSpacing: 1, color: 'rgba(180,200,220,0.6)', textTransform: 'uppercase', marginBottom: 4 }}>⚖️ LMG em Carteira</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'white' }}>{fmtMoeda(emitidosLmgTotal)}</div>
                  <div style={{ fontSize: 11, color: 'rgba(180,200,220,0.4)', marginTop: 4 }}>{modoBook === 'book' ? 'Prêmio (E+A):' : 'Prêmio emitido:'} {fmtMoeda(emitidosPremioTotal)}</div>
                  {(metaMensal?.risco_judicial ?? 0) > 0 && <div style={{ fontSize: 11, color: '#e8b84b', marginTop: 6 }}>⚖️ Risco Judicial: {fmtMoeda(metaMensal!.risco_judicial!)}</div>}
                </div>
              </div>
              {/* Form Metas */}
              {mostrarConfigurarMetas && (
                <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '16px 20px', border: '1px solid rgba(56,120,200,0.3)' }}>
                  <div style={{ color: 'rgba(180,200,220,0.8)', fontWeight: 700, fontSize: 12, marginBottom: 12, letterSpacing: 1 }}>⚙ CONFIGURAÇÃO DE METAS</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
                    {([['Prêmio Meta Mês (R$)','premio_mensal','ex: 2000000'],['Prêmio Meta Ano (R$)','premio_anual','ex: 25000000'],['Taxa Méd. Pond. Meta (%)','taxa_ponderada','ex: 1.20'],['LMG em Carteira Meta (R$)','lmg_meta','ex: 500000000'],['Provisão Risco Judicial (R$)','risco_judicial','ex: 5000000'],['Sinistralidade Aceitável (%)','sinistralidade','ex: 0.5']] as const).map(([label, key, ph]) => (
                      <div key={key}>
                        <label style={{ fontSize: 11, color: 'rgba(180,200,220,0.6)', display: 'block', marginBottom: 3 }}>{label}</label>
                        <input type="number" step="any" placeholder={ph} value={formMeta[key]}
                          onChange={(e) => setFormMeta(prev => ({ ...prev, [key]: e.target.value }))}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid rgba(56,120,200,0.4)', background: 'rgba(255,255,255,0.08)', color: 'white', fontSize: 13, boxSizing: 'border-box' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <label style={{ fontSize: 11, color: 'rgba(180,200,220,0.6)', display: 'block', marginBottom: 3 }}>Diretriz / Observação</label>
                    <textarea value={formMeta.observacao} onChange={(e) => setFormMeta(prev => ({ ...prev, observacao: e.target.value }))} placeholder="Diretrizes estratégicas do período..."
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid rgba(56,120,200,0.4)', background: 'rgba(255,255,255,0.08)', color: 'white', fontSize: 13, minHeight: 52, resize: 'vertical', boxSizing: 'border-box' }} />
                  </div>
                  <button onClick={salvarMeta} disabled={salvandoMeta}
                    style={{ marginTop: 10, padding: '8px 20px', borderRadius: 8, border: 'none', background: '#3070c8', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13, opacity: salvandoMeta ? 0.6 : 1 }}>
                    {salvandoMeta ? 'Salvando...' : '💾 Salvar Metas'}
                  </button>
                </div>
              )}
            </div>

            {/* ── EXPOSIÇÃO DO PORTFÓLIO ── */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2a3a', marginBottom: 12 }}>
                📊 Exposição do Portfólio — {modoBook === 'book' ? 'Book: Aprovadas + Emitidas' : 'Só Emitidas'}
                <span style={{ fontSize: 12, fontWeight: 400, color: '#6080a0', marginLeft: 6 }}>{modoBook === 'book' ? '(Aprovadas + Emitidas)' : '(apenas Emitidas)'}</span>
              </div>
              {bookAtualOps.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 28, color: '#6080a0', background: '#f8fafc', borderRadius: 10, border: '1.5px dashed #c5d5e8' }}>Nenhuma operação {modoBook === 'book' ? 'aprovada ou emitida' : 'emitida'} no book ainda.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                    {/* Tabela Modalidade */}
                    <div style={{ flex: '1 1 420px', background: 'white', borderRadius: 10, border: '1.5px solid #d0e4f5', overflow: 'hidden' }}>
                      <div style={{ background: '#0d2040', color: 'rgba(180,200,220,0.9)', padding: '9px 14px', fontSize: 11, fontWeight: 700, letterSpacing: 0.8 }}>EXPOSIÇÃO POR MODALIDADE</div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead><tr style={{ background: '#f0f6ff' }}>
                          {['Modalidade','Qtd','Prêmio','% Book','LMG','TMP'].map(h => <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Modalidade' ? 'left' : 'right', color: '#1a4080', fontWeight: 700 }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {exposicaoPorModalidade.map((m, i) => (
                            <tr key={m.modalidade} style={{ borderBottom: '1px solid #e0ecff', background: m.pctPremio > 60 ? '#fff3e0' : m.pctPremio > 40 ? '#fffbe6' : i % 2 === 0 ? 'white' : '#f8fafc' }}>
                              <td style={{ padding: '7px 10px', fontWeight: 600, color: '#1a2a3a' }}>{m.modalidade}</td>
                              <td style={{ padding: '7px 8px', textAlign: 'right', color: '#6080a0' }}>{m.qtd}</td>
                              <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: '#e8b84b' }}>{fmtMoeda(m.premio)}</td>
                              <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                  <div style={{ width: 36, background: '#e0ecff', borderRadius: 3, height: 5 }}><div style={{ width: `${Math.min(100, m.pctPremio)}%`, height: '100%', borderRadius: 3, background: CC[i % CC.length] }} /></div>
                                  <span style={{ fontWeight: 700, color: m.pctPremio > 60 ? '#d07830' : '#1a4080' }}>{m.pctPremio.toFixed(1)}%</span>
                                </div>
                              </td>
                              <td style={{ padding: '7px 8px', textAlign: 'right', color: '#6080a0' }}>{fmtMoeda(m.lmg)}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#3070c8' }}>{fmtPercent(m.tmp / 100)}</td>
                            </tr>
                          ))}
                          <tr style={{ background: '#0d2040', color: 'rgba(180,200,220,0.9)' }}>
                            <td style={{ padding: '7px 10px', fontWeight: 700 }}>TOTAL</td>
                            <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700 }}>{bookAtualOps.length}</td>
                            <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: '#e8b84b' }}>{fmtMoeda(bookPremioTotal)}</td>
                            <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700 }}>100%</td>
                            <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700 }}>{fmtMoeda(bookLmgTotal)}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#e8b84b' }}>{fmtPercent(bookTmpTotal / 100)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    {/* Tabela Tomador */}
                    <div style={{ flex: '1 1 380px', background: 'white', borderRadius: 10, border: '1.5px solid #d0e4f5', overflow: 'hidden' }}>
                      <div style={{ background: '#0d2040', color: 'rgba(180,200,220,0.9)', padding: '9px 14px', fontSize: 11, fontWeight: 700, letterSpacing: 0.8 }}>TOP 10 TOMADORES POR PRÊMIO</div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead><tr style={{ background: '#f0f6ff' }}>
                          {['Tomador','Prêmio','% Prêmio','LMG','TMP'].map(h => <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Tomador' ? 'left' : 'right', color: '#1a4080', fontWeight: 700 }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {exposicaoPorTomador.map((t, i) => (
                            <tr key={t.nome} style={{ borderBottom: '1px solid #e0ecff', background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                              <td style={{ padding: '7px 10px', fontWeight: 600, color: '#1a2a3a', maxWidth: 150 }} title={t.nomeCompleto}>{t.nome}</td>
                              <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: '#e8b84b' }}>{fmtMoeda(t.premio)}</td>
                              <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                  <div style={{ width: 36, background: '#e0ecff', borderRadius: 3, height: 5 }}><div style={{ width: `${Math.min(100, t.pctPremio)}%`, height: '100%', borderRadius: 3, background: CC[i % CC.length] }} /></div>
                                  <span style={{ fontWeight: 700, color: '#1a4080' }}>{t.pctPremio.toFixed(1)}%</span>
                                </div>
                              </td>
                              <td style={{ padding: '7px 8px', textAlign: 'right', color: '#6080a0' }}>{fmtMoeda(t.lmg)}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#3070c8' }}>{fmtPercent(t.tmp / 100)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {/* Gráficos */}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: '2 1 380px', background: 'white', borderRadius: 10, border: '1.5px solid #d0e4f5', padding: '14px', minHeight: 240 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1a2a3a', marginBottom: 8 }}>Prêmio e Taxa Média Ponderada por Modalidade</div>
                      <ResponsiveContainer width="100%" height={195}>
                        <ComposedChart data={exposicaoPorModalidade} margin={{ top: 4, right: 30, bottom: 36, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e0ecff" />
                          <XAxis dataKey="modalidade" tick={{ fontSize: 10, fill: '#6080a0' }} angle={-28} textAnchor="end" interval={0} />
                          <YAxis yAxisId="l" tickFormatter={(v: number) => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#6080a0' }} />
                          <YAxis yAxisId="r" orientation="right" tickFormatter={(v: number) => `${v.toFixed(2)}%`} tick={{ fontSize: 10, fill: '#3070c8' }} />
                          <Tooltip formatter={(value, name) => name === 'Prêmio' ? fmtMoeda(Number(value)) : `${Number(value).toFixed(4)}%`} />
                          <Bar yAxisId="l" dataKey="premio" name="Prêmio" fill="#e8b84b" radius={[4,4,0,0]} />
                          <Line yAxisId="r" type="monotone" dataKey="tmp" name="TMP" stroke="#3070c8" strokeWidth={2.5} dot={{ r: 4, fill: '#3070c8' }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ flex: '1 1 260px', background: 'white', borderRadius: 10, border: '1.5px solid #d0e4f5', padding: '14px', minHeight: 240 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1a2a3a', marginBottom: 8 }}>Top Tomadores — Prêmio</div>
                      <ResponsiveContainer width="100%" height={195}>
                        <BarChart layout="vertical" data={exposicaoPorTomador} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                          <XAxis type="number" tickFormatter={(v: number) => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#6080a0' }} />
                          <YAxis type="category" dataKey="nome" tick={{ fontSize: 10, fill: '#1a2a3a' }} width={88} />
                          <Tooltip formatter={(v) => fmtMoeda(Number(v))} />
                          <Bar dataKey="premio" name="Prêmio" radius={[0,4,4,0]}>
                            {exposicaoPorTomador.map((_, idx) => <Cell key={idx} fill={CC[idx % CC.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ── FILA DE DELIBERAÇÃO ── */}
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2a3a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                🏛 Fila de Deliberação
                <span style={{ background: emComite.length > 0 ? '#d64545' : '#27a96c', color: 'white', borderRadius: 20, padding: '2px 10px', fontSize: 13, fontWeight: 800 }}>{emComite.length}</span>
                <span style={{ fontSize: 12, fontWeight: 400, color: '#6080a0' }}>operaç{emComite.length !== 1 ? 'ões' : 'ão'} aguardando decisão</span>
              </div>
              {emComite.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#6080a0', fontSize: 15, background: '#f8fafc', borderRadius: 10, border: '1.5px dashed #c5d5e8' }}>🏛 Nenhuma operação aguardando decisão do Comitê.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {emComite.map(op => {
                    const isExp = expandidoComiteId === op.id
                    const abaAt = abaSimulador[op.id] ?? 0
                    const inp = simInputs[op.id] ?? { sinistralidade: 0.50, carregamento: 0.35, margem: 0.20 }
                    // Composição técnica preservada para uso futuro:
                    // taxaMin = (inp.sinistralidade + inp.carregamento + inp.margem) — taxa total do período
                    // taxaMinAnual = taxaMin / vigencia_anos — para comparação anualizada
                    const _taxaMinPeriodo = inp.sinistralidade + inp.carregamento + inp.margem
                    const _taxaMinAnual = _taxaMinPeriodo / Math.max(op.vigencia_anos ?? 1, 0.001)
                    void _taxaMinPeriodo; void _taxaMinAnual
                    const comissaoPct = comissaoInputs[op.id] ?? 25
                    const opL = op.lmg ?? 0; const opP = op.premio_previsto ?? 0; const opT = op.taxa ?? 0; const opV = op.vigencia_anos ?? 1
                    const taxaSim = taxaSimInputs[op.id] ?? opT
                    const simPremio = opL * (taxaSim / 100) * opV
                    const simulando = Math.abs(taxaSim - opT) > 1e-9
                    const nBL = bookLmgTotal + opL; const nBP = bookPremioTotal + simPremio
                    const nBT = nBL > 0 ? (bookAtualOps.reduce((s,o) => s + (o.taxa ?? 0) * (o.lmg ?? 0), 0) + opT * opL) / nBL : 0
                    const mM = metaMensal?.premio_meta ?? 0; const mA = metaAnual?.premio_meta ?? 0
                    const pMAt = mM > 0 ? premioRealizadoMes / mM * 100 : 0
                    const pMNv = mM > 0 ? (premioRealizadoMes + simPremio) / mM * 100 : 0
                    const cMes = mM > 0 ? simPremio / mM * 100 : 0
                    const gapM = mM > 0 ? Math.max(0, mM - premioRealizadoMes - simPremio) : 0
                    const pMed = bookAtualOps.length > 0 && bookPremioTotal > 0 ? bookPremioTotal / bookAtualOps.length : 0
                    const nOps = pMed > 0 && gapM > 0 ? Math.ceil(gapM / pMed) : 0
                    const pANv = mA > 0 ? (premioRealizadoAno + simPremio) / mA * 100 : 0
                    return (
                      <div key={op.id} style={{ borderRadius: 12, border: `1.5px solid ${isExp ? '#3070c8' : '#c5d5e8'}`, background: 'white', overflow: 'hidden', boxShadow: isExp ? '0 2px 12px rgba(48,112,200,0.12)' : 'none' }}>
                        {/* Header colapsado */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', cursor: 'pointer', background: isExp ? '#f0f6ff' : 'white', flexWrap: 'wrap' }}
                          onClick={() => { const o = !isExp; setExpandidoComiteId(o ? op.id : null); if (o) carregarComentariosComite([op.id]) }}>
                          <div style={{ flex: '2 1 160px' }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2a3a' }}>{op.tomador?.razao_social ?? '—'}</div>
                            <div style={{ fontSize: 12, color: '#6080a0', marginTop: 2 }}>{op.produto?.nome ?? '—'}{op.modalidade ? ` · ${op.modalidade}` : ''}</div>
                          </div>
                          <div style={{ textAlign: 'center', minWidth: 120 }}>
                            <div style={{ fontSize: 10, color: '#6080a0', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 1 }}>Prêmio Previsto</div>
                            <div style={{ fontSize: 21, fontWeight: 900, color: '#e8b84b', lineHeight: 1 }}>{opP > 0 ? fmtMoeda(opP) : '—'}</div>
                          </div>
                          <div style={{ textAlign: 'center', minWidth: 70 }}>
                            <div style={{ fontSize: 10, color: '#6080a0', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 1 }}>Taxa</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a4080' }}>{opT > 0 ? fmtPercent(opT / 100) : '—'}</div>
                          </div>
                          <div style={{ textAlign: 'center', minWidth: 70 }}>
                            <div style={{ fontSize: 10, color: '#6080a0', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 1 }}>Vigência</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#1a4080' }}>{opV > 0 ? `${opV}a` : '—'}</div>
                          </div>
                          <div style={{ textAlign: 'center', minWidth: 90 }}>
                            <div style={{ fontSize: 10, color: '#6080a0', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 1 }}>LMG</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#6080a0' }}>{opL > 0 ? fmtMoeda(opL) : '—'}</div>
                          </div>
                          {op.temperatura && <span className={`badge ${badgeTemperatura(op.temperatura)}`}>{op.temperatura}</span>}
                          <div style={{ marginLeft: 'auto', fontSize: 13, color: '#3070c8', fontWeight: 700, whiteSpace: 'nowrap' }}>{isExp ? '▲ Fechar' : '▼ Analisar'}</div>
                        </div>
                        {/* Painel expandido */}
                        {isExp && (
                          <div style={{ borderTop: '1.5px solid #e0ecff' }}>
                            {/* Abas */}
                            <div style={{ display: 'flex', background: '#f8fafc', borderBottom: '1px solid #e0ecff', overflowX: 'auto' }}>
                              {['📐 Cálculo','📊 Resultado','💬 Deliberação','⚡ Dados'].map((lb, idx) => (
                                <button key={idx} onClick={() => setAbaSimulador(prev => ({ ...prev, [op.id]: idx }))}
                                  style={{ padding: '10px 16px', border: 'none', background: 'transparent', borderBottom: abaAt === idx ? '2.5px solid #3070c8' : '2.5px solid transparent', color: abaAt === idx ? '#1a4080' : '#6080a0', fontWeight: abaAt === idx ? 700 : 400, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}>
                                  {lb}
                                </button>
                              ))}
                            </div>
                            <div style={{ padding: '20px 22px' }}>
                              {/* ABA 0: Cálculo */}
                              {abaAt === 0 && (
                                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                                  <div style={{ flex: '1 1 300px', background: '#0d2040', borderRadius: 10, padding: '18px 22px', fontFamily: 'monospace', lineHeight: 2.1, fontSize: 13 }}>
                                    <div style={{ color: '#e8b84b', fontWeight: 700, marginBottom: 12, fontFamily: 'sans-serif', letterSpacing: 1 }}>DEMONSTRAÇÃO DO CÁLCULO</div>
                                    <div style={{ color: 'rgba(180,200,220,0.7)' }}>LMG Solicitado ........ <span style={{ color: 'white', fontWeight: 700 }}>{opL > 0 ? fmtMoeda(opL) : '—'}</span></div>
                                    <div style={{ color: 'rgba(180,200,220,0.7)' }}>× Taxa Aplicada ....... <span style={{ color: 'white', fontWeight: 700 }}>× {opT > 0 ? fmtPercent(opT / 100) : '—'}</span></div>
                                    <div style={{ color: 'rgba(180,200,220,0.7)' }}>× Vigência ............ <span style={{ color: 'white', fontWeight: 700 }}>× {opV} anos</span></div>
                                    <div style={{ borderTop: '1px solid rgba(56,120,200,0.4)', paddingTop: 8, marginTop: 2 }}>
                                      <span style={{ color: 'rgba(180,200,220,0.7)' }}>Prêmio Previsto ....... </span>
                                      <span style={{ color: '#e8b84b', fontWeight: 900, fontSize: 15 }}>{opP > 0 ? fmtMoeda(opP) : '—'}</span>
                                    </div>
                                    <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(56,120,200,0.12)', borderRadius: 8, fontSize: 11, color: 'rgba(180,200,220,0.6)', lineHeight: 1.7 }}>
                                      <div>Corretora: {op.corretora?.nome_fantasia ?? op.corretora?.razao_social ?? '—'}</div>
                                      <div>Estado: {op.estado ?? '—'} · Entrada: {op.data_entrada ? fmtData(op.data_entrada) : '—'}</div>
                                    </div>
                                  </div>
                                  {/* Painel: Simulação de Cenário */}
                                  {(() => {
                                    const comissaoSim = simPremio * (comissaoPct / 100)
                                    const liquidoFAMSim = simPremio - comissaoSim
                                    const taxaLiquidaSim = taxaSim * (1 - comissaoPct / 100)
                                    const deltaPremio = simPremio - opP
                                    return (
                                      <div style={{ flex: '1 1 260px', background: '#f8fafc', borderRadius: 10, padding: '18px 22px', border: simulando ? '1.5px solid #e8b84b' : '1.5px solid #d0e4f5' }}>
                                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1a2a3a', letterSpacing: 0.5, marginBottom: 14 }}>SIMULAÇÃO DE CENÁRIO</div>
                                        {/* Inputs: Taxa + Comissão */}
                                        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                                          <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: 11, color: '#6080a0', display: 'block', marginBottom: 4, fontWeight: 600 }}>Taxa (%)</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                              <input
                                                type="number" step="any" min="0"
                                                value={taxaSim}
                                                onChange={(e) => setTaxaSimInputs(prev => ({ ...prev, [op.id]: parseFloat(e.target.value) || 0 }))}
                                                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: simulando ? '1.5px solid #e8b84b' : '1.5px solid #c5d5e8', fontSize: 13, fontWeight: 700, color: '#1a4080', background: 'white', boxSizing: 'border-box' as const }}
                                              />
                                            </div>
                                          </div>
                                          <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: 11, color: '#6080a0', display: 'block', marginBottom: 4, fontWeight: 600 }}>Comissão (%)</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                              <input
                                                type="number" min="0" max="50" step="0.5"
                                                value={comissaoPct}
                                                onChange={(e) => setComissaoInputs(prev => ({ ...prev, [op.id]: parseFloat(e.target.value) || 0 }))}
                                                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1.5px solid #c5d5e8', fontSize: 13, fontWeight: 700, color: '#1a4080', background: 'white', boxSizing: 'border-box' as const }}
                                              />
                                            </div>
                                          </div>
                                        </div>
                                        {/* Resultados */}
                                        {opL > 0 ? (
                                          <>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#6080a0' }}>Prêmio Simulado</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                  <span style={{ fontWeight: 600, color: '#1a2a3a' }}>{fmtMoeda(simPremio)}</span>
                                                  {simulando && deltaPremio !== 0 && (
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: deltaPremio > 0 ? '#27a96c' : '#d64545', background: deltaPremio > 0 ? '#d4f4e4' : '#fbeaea', borderRadius: 4, padding: '1px 5px' }}>
                                                      {deltaPremio > 0 ? '+' : ''}{fmtMoeda(deltaPremio)}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: '#d07830' }}>Comissão ({comissaoPct}%)</span>
                                                <span style={{ fontWeight: 600, color: '#d07830' }}>− {fmtMoeda(comissaoSim)}</span>
                                              </div>
                                              <div style={{ borderTop: '1.5px solid #d0e4f5', marginTop: 2, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: '#1a2a3a', fontWeight: 700 }}>Prêmio Líquido FAM</span>
                                                <span style={{ fontWeight: 900, color: '#27a96c', fontSize: 14 }}>{fmtMoeda(liquidoFAMSim)}</span>
                                              </div>
                                            </div>
                                            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10, borderTop: '1px dashed #d0e4f5', fontSize: 13 }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: '#6080a0' }}>Taxa Base</span>
                                                <span style={{ fontWeight: 600, color: '#6080a0' }}>{opT > 0 ? fmtPercent(opT / 100) : '—'}</span>
                                              </div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: simulando ? '#e8b84b' : '#6080a0' }}>Taxa Simulada</span>
                                                <span style={{ fontWeight: 700, color: simulando ? '#d07830' : '#1a4080' }}>{taxaSim > 0 ? fmtPercent(taxaSim / 100) : '—'}</span>
                                              </div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: '#6080a0' }}>Taxa Líquida FAM</span>
                                                <span style={{ fontWeight: 800, color: '#1a6a40', fontSize: 14 }}>{taxaSim > 0 ? fmtPercent(taxaLiquidaSim / 100) : '—'}</span>
                                              </div>
                                            </div>
                                            {simulando && (
                                              <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 7, background: '#fffbea', border: '1.5px solid #e8b84b', fontSize: 11, color: '#7a5a00', lineHeight: 1.6 }}>
                                                ⚡ Simulação ativa — os resultados na aba <strong>Resultado</strong> refletem esta taxa.
                                              </div>
                                            )}
                                          </>
                                        ) : (
                                          <div style={{ color: '#9ab0c8', fontSize: 13, textAlign: 'center', paddingTop: 20 }}>
                                            LMG não informado
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })()}
                                </div>
                              )}
                              {/* ABA 1: Resultado */}
                              {abaAt === 1 && (
                                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                                  <div style={{ flex: '1 1 320px', background: '#0d2040', borderRadius: 10, padding: '18px 22px', fontFamily: 'monospace', fontSize: 13, lineHeight: 2 }}>
                                    <div style={{ color: '#e8b84b', fontWeight: 700, marginBottom: 10, fontFamily: 'sans-serif', letterSpacing: 1 }}>ANÁLISE DE RESULTADO — META MENSAL</div>
                                    {simulando && (
                                      <div style={{ marginBottom: 10, padding: '6px 10px', borderRadius: 6, background: 'rgba(232,184,75,0.15)', border: '1px solid rgba(232,184,75,0.4)', fontSize: 11, color: '#e8b84b', fontFamily: 'sans-serif', fontWeight: 700 }}>
                                        ⚡ Simulando taxa {fmtPercent(taxaSim / 100)} — prêmio {fmtMoeda(simPremio)}
                                      </div>
                                    )}
                                    {mM === 0 ? <div style={{ color: '#6080a0' }}>Configure a Meta Mensal acima.</div> : (
                                      <>
                                        <div style={{ color: 'rgba(180,200,220,0.7)' }}>Meta Mensal .... <span style={{ color: 'white', fontWeight: 700 }}>{fmtMoeda(mM)}</span> <span style={{ color: '#6080a0' }}>100%</span></div>
                                        <div style={{ color: 'rgba(180,200,220,0.7)' }}>Realizado Atual  <span style={{ color: 'white' }}>{fmtMoeda(premioRealizadoMes)}</span> <span style={{ color: pMAt >= 80 ? '#27a96c' : '#e8b84b' }}>{pMAt.toFixed(1)}%</span></div>
                                        <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 4, height: 7, margin: '2px 0 4px' }}><div style={{ height: '100%', borderRadius: 4, background: pMAt >= 80 ? '#27a96c' : pMAt >= 50 ? '#e8b84b' : '#d64545', width: `${Math.min(100, pMAt)}%` }} /></div>
                                        <div style={{ color: '#e8b84b', fontWeight: 700 }}>+ Esta Operação  +{fmtMoeda(simPremio)} <span style={{ fontSize: 12 }}>+{cMes.toFixed(1)}%</span></div>
                                        <div style={{ borderTop: '1px solid rgba(56,120,200,0.3)', paddingTop: 6, marginTop: 2 }}>
                                          <div style={{ color: 'rgba(180,200,220,0.8)' }}>Novo Patamar ... <span style={{ color: '#27a96c', fontWeight: 900 }}>{fmtMoeda(premioRealizadoMes + simPremio)}</span> <span style={{ color: '#27a96c' }}>{pMNv.toFixed(1)}%</span></div>
                                          <div style={{ background: 'rgba(39,169,108,0.3)', borderRadius: 4, height: 7, margin: '3px 0' }}><div style={{ height: '100%', borderRadius: 4, background: '#27a96c', width: `${Math.min(100, pMNv)}%` }} /></div>
                                          {gapM > 0 && <div style={{ color: '#d64545', fontWeight: 700 }}>Gap Restante ... {fmtMoeda(gapM)}</div>}
                                          {nOps > 0 && pMed > 0 && <div style={{ fontSize: 11, color: 'rgba(180,200,220,0.4)', marginTop: 3 }}>~{nOps} ops no valor médio de {fmtMoeda(pMed)}</div>}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                  <div style={{ flex: '1 1 240px', background: '#f8fafc', borderRadius: 10, padding: '18px 22px', border: '1.5px solid #d0e4f5', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.9 }}>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1a2a3a', marginBottom: 12, fontFamily: 'sans-serif' }}>META ANUAL</div>
                                    {mA === 0 ? <div style={{ color: '#6080a0' }}>Meta anual não definida.</div> : (
                                      <>
                                        <div>Meta Ano: <strong>{fmtMoeda(mA)}</strong></div>
                                        <div>Realizado: <span style={{ color: '#1a4080' }}>{fmtMoeda(premioRealizadoAno)}</span> ({(premioRealizadoAno / mA * 100).toFixed(1)}%)</div>
                                        <div style={{ background: '#e0ecff', borderRadius: 4, height: 7, margin: '6px 0' }}><div style={{ height: '100%', borderRadius: 4, background: '#3070c8', width: `${Math.min(100, premioRealizadoAno / mA * 100)}%` }} /></div>
                                        <div>+ Esta Op: <span style={{ color: '#e8b84b', fontWeight: 700 }}>+{fmtMoeda(simPremio)}</span></div>
                                        <div style={{ borderTop: '1px dashed #d0e4f5', paddingTop: 8, marginTop: 8 }}>Novo: <strong style={{ color: '#27a96c' }}>{fmtMoeda(premioRealizadoAno + simPremio)}</strong> ({pANv.toFixed(1)}%)</div>
                                        <div style={{ background: '#d4f4e4', borderRadius: 4, height: 7, marginTop: 6 }}><div style={{ height: '100%', borderRadius: 4, background: '#27a96c', width: `${Math.min(100, pANv)}%` }} /></div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              )}
                              {/* ABA 2: Deliberação */}
                              {abaAt === 2 && (() => {
                                const coments = comentariosComite[op.id] ?? []
                                const nf = novoComentarioForm[op.id] ?? { autor: '', comentario: '', tipo: 'geral' }
                                const tCor: Record<string,string> = { restricao: '#d64545', condicao: '#d07830', aprovacao: '#27a96c', negacao: '#888', geral: '#3070c8' }
                                return (
                                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                                    <div style={{ flex: '1 1 260px' }}>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1a2a3a', marginBottom: 7, letterSpacing: 0.5 }}>NOTAS DO ANALISTA</div>
                                      <textarea placeholder="Análise técnica para o comitê..." defaultValue={op.comite_notas ?? ''}
                                        onBlur={async (e) => { const sb = createClient(); await sb.from('operacoes').update({ comite_notas: e.target.value }).eq('id', op.id) }}
                                        style={{ width: '100%', minHeight: 96, padding: '9px 11px', borderRadius: 8, border: '1.5px solid #c5d5e8', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' as const }} />
                                    </div>
                                    <div style={{ flex: '1 1 260px' }}>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1a2a3a', marginBottom: 7, letterSpacing: 0.5 }}>COMENTÁRIOS DO COMITÊ</div>
                                      <div style={{ display: 'flex', gap: 7, marginBottom: 7 }}>
                                        <input placeholder="Nome do membro" value={nf.autor} onChange={(e) => setNovoComentarioForm(prev => ({ ...prev, [op.id]: { ...nf, autor: e.target.value } }))}
                                          style={{ flex: 1, padding: '7px 9px', borderRadius: 6, border: '1.5px solid #c5d5e8', fontSize: 13 }} />
                                        <select value={nf.tipo} onChange={(e) => setNovoComentarioForm(prev => ({ ...prev, [op.id]: { ...nf, tipo: e.target.value } }))}
                                          style={{ padding: '7px 9px', borderRadius: 6, border: '1.5px solid #c5d5e8', fontSize: 13 }}>
                                          <option value="geral">Geral</option><option value="restricao">Restrição</option>
                                          <option value="condicao">Condição</option><option value="aprovacao">Aprovação</option><option value="negacao">Negação</option>
                                        </select>
                                      </div>
                                      <textarea placeholder="Comentário..." value={nf.comentario} onChange={(e) => setNovoComentarioForm(prev => ({ ...prev, [op.id]: { ...nf, comentario: e.target.value } }))}
                                        style={{ width: '100%', minHeight: 68, padding: '8px 9px', borderRadius: 6, border: '1.5px solid #c5d5e8', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' as const }} />
                                      <button onClick={() => adicionarComentario(op.id)} disabled={salvandoComentario || !nf.autor || !nf.comentario}
                                        style={{ marginTop: 7, padding: '7px 14px', borderRadius: 6, border: 'none', background: '#3070c8', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: (!nf.autor || !nf.comentario) ? 0.5 : 1 }}>
                                        {salvandoComentario ? 'Salvando…' : '+ Comentário'}
                                      </button>
                                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 210, overflowY: 'auto' }}>
                                        {coments.length === 0
                                          ? <div style={{ fontSize: 13, color: '#6080a0', fontStyle: 'italic' }}>Nenhum comentário ainda.</div>
                                          : coments.map(c => (
                                            <div key={c.id} style={{ background: '#f0f6ff', borderRadius: 8, padding: '9px 11px', border: '1px solid #d0e4f5' }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                                <span style={{ fontWeight: 700, fontSize: 12, color: '#1a4080' }}>{c.autor}</span>
                                                <span style={{ fontSize: 11, color: tCor[c.tipo] ?? '#6080a0', fontWeight: 700, textTransform: 'capitalize' as const }}>{c.tipo}</span>
                                              </div>
                                              <div style={{ fontSize: 13, color: '#1a2a3a' }}>{c.comentario}</div>
                                              <div style={{ fontSize: 10, color: '#6080a0', marginTop: 3 }}>{new Date(c.created_at).toLocaleString('pt-BR')}</div>
                                            </div>
                                          ))
                                        }
                                      </div>
                                    </div>
                                  </div>
                                )
                              })()}
                              {/* ABA 3: Dados */}
                              {abaAt === 3 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(185px,1fr))', gap: 10 }}>
                                    {[['Tomador', op.tomador?.razao_social ?? '—'],['CNPJ', op.tomador?.cnpj ? maskCNPJ(op.tomador.cnpj) : '—'],['Corretora', op.corretora?.nome_fantasia ?? op.corretora?.razao_social ?? '—'],['Produto', op.produto?.nome ?? '—'],['Modalidade', op.modalidade ?? '—'],['Estado', op.estado ?? '—'],['LMG', opL > 0 ? fmtMoeda(opL) : '—'],['Taxa', opT > 0 ? fmtPercent(opT / 100) : '—'],['Vigência', `${opV} anos`],['Prêmio Previsto', opP > 0 ? fmtMoeda(opP) : '—'],['Temperatura', op.temperatura ?? '—'],['Data Entrada', op.data_entrada ? fmtData(op.data_entrada) : '—'],['Analista', op.comite_analista ?? '—']].map(([lb, vl]) => (
                                      <div key={lb} style={{ background: '#f8fafc', borderRadius: 8, padding: '9px 12px', border: '1px solid #e0ecff' }}>
                                        <div style={{ fontSize: 10, color: '#6080a0', textTransform: 'uppercase' as const, letterSpacing: 0.8, marginBottom: 3 }}>{lb}</div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2a3a', wordBreak: 'break-word' as const }}>{vl}</div>
                                      </div>
                                    ))}
                                  </div>
                                  <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', border: '1px solid #e0ecff' }}>
                                    <div style={{ fontSize: 10, color: '#6080a0', textTransform: 'uppercase' as const, letterSpacing: 0.8, marginBottom: 6 }}>Observação</div>
                                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1a2a3a', lineHeight: 1.6 }}>{op.observacao || '—'}</div>
                                  </div>
                                </div>
                              )}
                            </div>
                            {/* Decisão Final */}
                            <div style={{ borderTop: '1.5px solid #e0ecff', padding: '12px 22px', background: '#f8fafc', display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#6080a0', textTransform: 'uppercase' as const, letterSpacing: 0.8, marginRight: 4 }}>Decisão:</span>
                              <button onClick={() => mudarStatus(op, 'Aprovado')} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#d4f4e4', color: '#1a6a40', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>✅ Aprovar</button>
                              <button onClick={() => mudarStatus(op, 'Recusado')} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#fbeaea', color: '#a02020', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>❌ Negar</button>
                              <button onClick={() => mudarStatus(op, 'Em Análise')} style={{ padding: '7px 16px', borderRadius: 8, border: '1.5px solid #c5d5e8', background: 'white', color: '#1e4080', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>↩ Devolver</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── APROVADAS & EMITIDAS — visíveis para contexto do Comitê ── */}
            {(() => {
              const aprovEmit = operacoes.filter(op => op.status === 'Aprovado' || op.status === 'Emitido')
              if (aprovEmit.length === 0) return null
              const corStatus = (s: string) => s === 'Emitido' ? '#3070c8' : '#27a96c'
              return (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2a3a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                    📋 Aprovadas &amp; Emitidas
                    <span style={{ background: '#f0f6ff', color: '#3070c8', borderRadius: 20, padding: '2px 10px', fontSize: 13, fontWeight: 800 }}>{aprovEmit.length}</span>
                    <span style={{ fontSize: 12, fontWeight: 400, color: '#6080a0' }}>operações já decididas — visíveis para contexto do Comitê</span>
                  </div>
                  <div style={{ background: 'white', borderRadius: 10, border: '1.5px solid #d0e4f5', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f0f6ff' }}>
                          {['Status','Tomador','Produto / Modalidade','LMG','Taxa','Prêmio Prev.','Vigência (anos)'].map(h => (
                            <th key={h} style={{ padding: '9px 12px', textAlign: h === 'Status' || h === 'Tomador' || h === 'Produto / Modalidade' ? 'left' : 'right', color: '#1a4080', fontWeight: 700, fontSize: 12 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {aprovEmit.sort((a, b) => {
                          const order = (s: string) => s === 'Aprovado' ? 0 : 1
                          return order(a.status) - order(b.status)
                        }).map((op, i) => (
                          <tr key={op.id} style={{ borderBottom: '1px solid #e0ecff', background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                            <td style={{ padding: '9px 12px' }}>
                              <span style={{ background: corStatus(op.status) + '22', color: corStatus(op.status), border: `1px solid ${corStatus(op.status)}55`, borderRadius: 12, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>
                                {op.status}
                              </span>
                            </td>
                            <td style={{ padding: '9px 12px', fontWeight: 600, color: '#1a2a3a' }}>{op.tomador?.razao_social ?? '—'}</td>
                            <td style={{ padding: '9px 12px', color: '#4060a0' }}>{op.produto?.nome ?? '—'}{op.modalidade ? ` · ${op.modalidade}` : ''}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtMoeda(op.lmg ?? 0)}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', color: '#e8b84b', fontWeight: 700 }}>{op.taxa != null ? fmtPercent(op.taxa / 100) : '—'}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#27a96c' }}>{fmtMoeda(op.premio_previsto ?? 0)}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', color: '#6080a0' }}>{op.vigencia_anos ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()}
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

          <div style={{
            background: '#fffbea', border: '1.5px solid #e8d060', borderRadius: 10,
            padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#7a5a00',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
            <div>
              Os status <strong>Aprovado</strong>, <strong>Emitido</strong>, <strong>Perdido</strong>, <strong>Recusado</strong> e <strong>Comitê</strong> são parte do sistema central de qualificação das operações e <strong>não podem ser excluídos</strong>. Os demais status podem ser gerenciados livremente.
            </div>
          </div>

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
                        {!STATUS_PROTEGIDOS.includes(s.nome) && (
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
      {modalEmissao && (
        <div className="modal-overlay" style={{ zIndex: 1300 }} onClick={(e) => { if (e.target === e.currentTarget) setModalEmissao(null) }}>
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <div className="modal-title">✅ Data de Emissão</div>
              <button onClick={() => setModalEmissao(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: '#6080a0', margin: '0 0 14px' }}>
              Informe a data em que esta operação foi efetivamente emitida. Essa data define em qual mês os KPIs serão contabilizados.
            </p>
            <input
              type="date"
              autoFocus
              value={modalEmissao.dataEmissao}
              onChange={(e) => setModalEmissao(prev => prev ? { ...prev, dataEmissao: e.target.value } : null)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #c5d5e8', fontSize: 14, fontFamily: "'Calibri','Segoe UI',sans-serif", boxSizing: 'border-box', outline: 'none', color: '#1a2a3a' }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => setModalEmissao(null)}>Cancelar</button>
              <button
                onClick={() => confirmarEmissao(modalEmissao.dataEmissao)}
                disabled={!modalEmissao.dataEmissao}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#27a96c', color: 'white', fontWeight: 700, cursor: modalEmissao.dataEmissao ? 'pointer' : 'not-allowed', opacity: modalEmissao.dataEmissao ? 1 : 0.5, fontSize: 14 }}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

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
