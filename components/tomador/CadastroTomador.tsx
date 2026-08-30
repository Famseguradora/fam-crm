'use client'

// ============================================================================
//  O CADASTRO DO TOMADOR, DENTRO DA MESA
//
//  Ordem do Marco, 30/08/2026: "o Editar ainda busca aquela página antiga. Não
//  quero aquela página em lugar nenhum mais. Tudo deve ser feito na tela quando
//  clicar com o mouse em cima da linha."
//
//  Então o modal de edição da lista de tomadores morreu, e a edição passou a
//  morar aqui, na gaveta "Cadastro" da Mesa. O que ficou igual, de propósito:
//
//   • a corretora é OBRIGATÓRIA, e quando muda ela desce para as operações do
//     tomador. Esse vínculo é fonte única, e foi o furo da Petrobras.
//   • toda alteração escreve em `audit_log`, com quem fez.
//   • CNPJ é validado antes de salvar.
//   • quem é `proprietario` continua podendo excluir o tomador.
//
//  O que mudou: não é mais um modal por cima da lista. É a própria tela do
//  tomador, que já mostra tudo o resto (análise, operações, Serasa, grupo).
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Tomador, Corretora, StatusFluxo } from '@/types'
import { maskCNPJ, maskTelefone, maskCEP, maskMoeda, fmtMoeda, fmtData, titleCase, validarCNPJ } from '@/lib/utils'
import { usePermissoes } from '@/lib/context/permissoes-context'
import AnexosSection from '@/components/AnexosSection'
import OrganogramaModal from '@/components/OrganogramaModal'

const PORTES = ['Small', 'Middle', 'Corporate', 'Large'] as const

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

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

function doTomador(t: Tomador): FormTomador {
  return {
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
  }
}

/** Uma linha da ficha em leitura. Rótulo em cima, valor embaixo, e os valores
 *  ficam todos alinhados na mesma coluna: é o que ele pediu ao dizer que os
 *  nomes têm que ficar perfilados. */
function Linha({ rotulo, valor, largo }: { rotulo: string; valor: React.ReactNode; largo?: boolean }) {
  return (
    <div className={`mt-campo${largo ? ' largo' : ''}`}>
      <span className="mt-lab">{rotulo}</span>
      <span className="v">{valor || '—'}</span>
    </div>
  )
}

export default function CadastroTomador({ tomador, onSalvo }: {
  tomador: Tomador
  onSalvo: () => void | Promise<void>
}) {
  const { somenteLeitura } = usePermissoes()

  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<FormTomador>(() => doTomador(tomador))
  const [corretoras, setCorretoras] = useState<Corretora[]>([])
  const [statusOpcoes, setStatusOpcoes] = useState<StatusFluxo[]>([])
  const [enviando, setEnviando] = useState(false)
  const [erroCnpj, setErroCnpj] = useState('')
  const [erroCorretora, setErroCorretora] = useState('')
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  const [isProprietario, setIsProprietario] = useState(false)
  const [usuarioInfo, setUsuarioInfo] = useState<{ authId: string; nome: string | null; email: string | null } | null>(null)
  const [confirmExcluir, setConfirmExcluir] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [organograma, setOrganograma] = useState(false)

  // O tomador recarregado por fora (depois de salvar) tem que voltar ao form.
  useEffect(() => { setForm(doTomador(tomador)) }, [tomador])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('corretoras').select('id,razao_social').eq('status', 'ativo').order('razao_social')
      .then(({ data }) => setCorretoras((data as Corretora[]) ?? []))
    supabase.from('status_fluxo_tomador').select('*').order('ordem')
      .then(({ data }) => setStatusOpcoes((data as StatusFluxo[]) ?? []))
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('usuarios').select('proprietario, nome, email').eq('auth_id', user.id).single()
        .then(({ data }) => {
          setIsProprietario(data?.proprietario ?? false)
          setUsuarioInfo({ authId: user.id, nome: data?.nome ?? null, email: data?.email ?? null })
        })
    })
  }, [])

  const buscarCep = useCallback(async (cep: string) => {
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (data.erro) return
      setForm(f => ({ ...f, endereco: data.logradouro ?? '', bairro: data.bairro ?? '', cidade: data.localidade ?? '', estado: data.uf ?? '' }))
    } catch { /* CEP é conveniência: falhar aqui não pode atrapalhar quem digita */ }
  }, [])

  async function salvar(e: React.SyntheticEvent) {
    e.preventDefault()
    const cnpjDigits = form.cnpj.replace(/\D/g, '')
    if (cnpjDigits && !validarCNPJ(cnpjDigits)) { setErroCnpj('CNPJ inválido.'); return }
    if (!form.corretora_id) { setErroCorretora('Selecione a corretora do tomador.'); return }

    setEnviando(true); setMensagem(null)
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
      limite_aprovado: form.limite_aprovado
        ? parseFloat(form.limite_aprovado.replace(/\./g, '').replace(',', '.')) : null,
      observacao: form.observacao || null,
      status: form.status,
      ativo: form.ativo,
      data_entrada: form.data_entrada || null,
    }

    try {
      const supabase = createClient()
      const { error } = await supabase.from('tomadores').update(payload).eq('id', tomador.id)
      if (error) throw new Error(error.message)

      // A corretora é fonte única: quando muda aqui, tem que descer para as
      // operações do tomador, senão elas ficam com a corretora antiga.
      if ((tomador.corretora_id ?? null) !== (payload.corretora_id ?? null)) {
        const { error: errProp } = await supabase.from('operacoes')
          .update({ corretora_id: payload.corretora_id }).eq('tomador_id', tomador.id)
        if (errProp) throw new Error(errProp.message)
      }

      await supabase.from('audit_log').insert({
        tabela: 'tomadores',
        acao: 'alteracao',
        registro_id: tomador.id,
        dados_antes: tomador as unknown as Record<string, unknown>,
        dados_depois: payload,
        usuario_auth_id: usuarioInfo?.authId ?? null,
        usuario_nome: usuarioInfo?.nome ?? null,
        usuario_email: usuarioInfo?.email ?? null,
      })

      await onSalvo()
      setEditando(false)
      setMensagem({ tipo: 'sucesso', texto: 'Cadastro salvo.' })
    } catch (err: unknown) {
      setMensagem({ tipo: 'erro', texto: err instanceof Error ? err.message : 'Erro desconhecido.' })
    } finally {
      setEnviando(false)
    }
  }

  async function excluir() {
    setExcluindo(true)
    const supabase = createClient()
    const { error } = await supabase.from('tomadores').delete().eq('id', tomador.id)
    if (error) {
      setExcluindo(false); setConfirmExcluir(false)
      setMensagem({ tipo: 'erro', texto: 'Erro ao excluir: ' + error.message })
      return
    }
    await supabase.from('audit_log').insert({
      tabela: 'tomadores',
      acao: 'exclusao',
      registro_id: tomador.id,
      dados_antes: tomador as unknown as Record<string, unknown>,
      dados_depois: null,
      usuario_auth_id: usuarioInfo?.authId ?? null,
      usuario_nome: usuarioInfo?.nome ?? null,
      usuario_email: usuarioInfo?.email ?? null,
    })
    window.location.href = '/tomadores'
  }

  const corretoraNome = (tomador.corretora as Corretora | undefined)?.nome_fantasia
    ?? (tomador.corretora as Corretora | undefined)?.razao_social ?? null

  const endereco = [tomador.endereco, tomador.numero, tomador.complemento, tomador.bairro]
    .filter(Boolean).join(', ')
  const cidadeUf = tomador.cidade ? `${tomador.cidade}${tomador.estado ? `/${tomador.estado}` : ''}` : (tomador.estado ?? '')

  return (
    <>
      <section className="mt-card mt-bloco">
        <header className="mt-bloco-cab">
          <span className="pt" />
          <span className="mt-bloco-tit">Cadastro do tomador</span>
          {!editando && !somenteLeitura && (
            <button type="button" className="mt-bloco-acao" onClick={() => { setMensagem(null); setEditando(true) }}>
              Editar cadastro
            </button>
          )}
          {somenteLeitura && <span className="mt-bloco-acao" style={{ color: '#a05010', cursor: 'default' }}>Acesso somente leitura</span>}
        </header>

        <div className="mt-bloco-corpo">
          {mensagem && (
            <div className={mensagem.tipo === 'sucesso' ? 'alert-success' : 'alert-error'} style={{ marginBottom: 14 }}>
              {mensagem.texto}
            </div>
          )}

          {/* ───────────── LEITURA ───────────── */}
          {!editando && (
            <>
              <div className="mt-sub"><span className="pt" style={{ background: '#3070c8' }} />Dados da empresa</div>
              <div className="mt-campos">
                <Linha rotulo="Razão social" valor={tomador.razao_social} largo />
                <Linha rotulo="Nome fantasia" valor={tomador.nome_fantasia} />
                <Linha rotulo="CNPJ" valor={tomador.cnpj ? maskCNPJ(tomador.cnpj) : null} />
                <Linha rotulo="Corretora" valor={corretoraNome} />
                <Linha rotulo="Porte" valor={tomador.porte} />
                <Linha rotulo="Prioridade" valor={tomador.prioridade} />
                <Linha rotulo="Status no fluxo" valor={tomador.status} />
                <Linha rotulo="Limite aprovado" valor={tomador.limite_aprovado != null ? fmtMoeda(tomador.limite_aprovado) : null} />
                <Linha rotulo="Entrada na FAM" valor={tomador.data_entrada ? fmtData(tomador.data_entrada) : null} />
                <Linha rotulo="Situação" valor={tomador.ativo ? 'Ativo' : 'Inativo'} />
              </div>

              <div className="mt-sub"><span className="pt" style={{ background: '#27a96c' }} />Contato</div>
              <div className="mt-campos">
                <Linha rotulo="Responsável" valor={tomador.responsavel} largo />
                <Linha rotulo="E-mail" valor={tomador.email} />
                <Linha rotulo="Telefone" valor={tomador.telefone ? maskTelefone(tomador.telefone) : null} />
                <Linha rotulo="Celular" valor={tomador.celular ? maskTelefone(tomador.celular) : null} />
              </div>

              <div className="mt-sub"><span className="pt" style={{ background: '#e8b84b' }} />Endereço</div>
              <div className="mt-campos">
                <Linha rotulo="Endereço" valor={endereco} largo />
                <Linha rotulo="Cidade / UF" valor={cidadeUf} />
                <Linha rotulo="CEP" valor={tomador.cep ? maskCEP(tomador.cep) : null} />
              </div>

              {tomador.observacao && (
                <>
                  <div className="mt-sub"><span className="pt" style={{ background: '#6080a0' }} />Observação</div>
                  <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '4px 0 0', color: '#1a2a3a' }}>{tomador.observacao}</p>
                </>
              )}

              <div style={{ display: 'flex', gap: 9, marginTop: 18, flexWrap: 'wrap' }}>
                <button type="button" className="mt-btn" onClick={() => setOrganograma(true)}>
                  Organograma societário
                </button>
                {isProprietario && !somenteLeitura && (
                  <button type="button" className="mt-btn" style={{ marginLeft: 'auto', color: '#a3282a', borderColor: '#e3b0b0' }}
                    onClick={() => setConfirmExcluir(true)}>
                    Excluir tomador
                  </button>
                )}
              </div>
            </>
          )}

          {/* ───────────── EDIÇÃO ───────────── */}
          {editando && (
            <form onSubmit={salvar}>
              <div className="mt-sub"><span className="pt" style={{ background: '#3070c8' }} />Dados da empresa</div>
              <div className="form-grid" style={{ marginBottom: 18 }}>
                <div className="form-field full">
                  <label className="form-label">Razão Social *</label>
                  <input className="fam-input" type="text" value={form.razao_social} required
                    onChange={e => setForm({ ...form, razao_social: e.target.value })} />
                </div>
                <div className="form-field full">
                  <label className="form-label">Nome Fantasia</label>
                  <input className="fam-input" type="text" value={form.nome_fantasia}
                    onChange={e => setForm({ ...form, nome_fantasia: e.target.value })} />
                </div>
                <div className="form-field">
                  <label className="form-label">CNPJ</label>
                  <input className={`fam-input${erroCnpj ? ' invalid' : ''}`} type="text" placeholder="00.000.000/0000-00"
                    value={form.cnpj} maxLength={18}
                    onChange={e => { setErroCnpj(''); setForm({ ...form, cnpj: maskCNPJ(e.target.value) }) }} />
                  {erroCnpj && <span className="field-error">{erroCnpj}</span>}
                </div>
                <div className="form-field">
                  <label className="form-label">Porte</label>
                  <select className="fam-input" value={form.porte} onChange={e => setForm({ ...form, porte: e.target.value })}>
                    <option value="">— Selecione —</option>
                    {PORTES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label className="form-label">Prioridade</label>
                  <select className="fam-input" value={form.prioridade} onChange={e => setForm({ ...form, prioridade: e.target.value })}>
                    <option value="Normal">Normal</option>
                    <option value="Prioridade">Prioridade</option>
                    <option value="Urgente">Urgente</option>
                  </select>
                </div>
                <div className="form-field">
                  <label className="form-label">Corretora *</label>
                  <select className={`fam-input${erroCorretora ? ' invalid' : ''}`} value={form.corretora_id} required
                    onChange={e => { setErroCorretora(''); setForm({ ...form, corretora_id: e.target.value }) }}>
                    <option value="">— Selecione —</option>
                    {corretoras.map(c => <option key={c.id} value={c.id}>{c.razao_social}</option>)}
                  </select>
                  {erroCorretora && <span className="field-error">{erroCorretora}</span>}
                </div>
                <div className="form-field">
                  <label className="form-label">Limite Aprovado (R$)</label>
                  <input className="fam-input" type="text" placeholder="Ex: 5.000.000,00" value={form.limite_aprovado}
                    onChange={e => setForm({ ...form, limite_aprovado: maskMoeda(e.target.value) })} />
                </div>
                <div className="form-field">
                  <label className="form-label">Status</label>
                  <select className="fam-input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {statusOpcoes.filter(s => s.ativo).map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
                    {!statusOpcoes.some(s => s.nome === form.status) && <option value={form.status}>{form.status}</option>}
                  </select>
                </div>
                <div className="form-field">
                  <label className="form-label">Data de Entrada na FAM</label>
                  <input className="fam-input" type="date" value={form.data_entrada}
                    onChange={e => setForm({ ...form, data_entrada: e.target.value })} />
                </div>
              </div>

              <div className="mt-sub"><span className="pt" style={{ background: '#27a96c' }} />Contato</div>
              <div className="form-grid" style={{ marginBottom: 18 }}>
                <div className="form-field full">
                  <label className="form-label">E-mail</label>
                  <input className="fam-input" type="email" value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value.toLowerCase() })} />
                </div>
                <div className="form-field">
                  <label className="form-label">Telefone</label>
                  <input className="fam-input" type="text" value={form.telefone} maxLength={16}
                    onChange={e => setForm({ ...form, telefone: maskTelefone(e.target.value) })} />
                </div>
                <div className="form-field">
                  <label className="form-label">Celular</label>
                  <input className="fam-input" type="text" value={form.celular} maxLength={16}
                    onChange={e => setForm({ ...form, celular: maskTelefone(e.target.value) })} />
                </div>
                <div className="form-field full">
                  <label className="form-label">Responsável / Representante Legal</label>
                  <input className="fam-input" type="text" value={form.responsavel}
                    onChange={e => setForm({ ...form, responsavel: e.target.value })} />
                </div>
              </div>

              <div className="mt-sub"><span className="pt" style={{ background: '#e8b84b' }} />Endereço</div>
              <div className="form-grid" style={{ marginBottom: 18 }}>
                <div className="form-field">
                  <label className="form-label">CEP</label>
                  <input className="fam-input" type="text" placeholder="00000-000" value={form.cep} maxLength={9}
                    onChange={e => {
                      const val = maskCEP(e.target.value)
                      setForm({ ...form, cep: val })
                      if (val.replace(/\D/g, '').length === 8) buscarCep(val)
                    }} />
                </div>
                <div className="form-field">
                  <label className="form-label">Estado</label>
                  <select className="fam-input" value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
                    <option value="">— UF —</option>
                    {ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
                <div className="form-field full">
                  <label className="form-label">Endereço</label>
                  <input className="fam-input" type="text" value={form.endereco}
                    onChange={e => setForm({ ...form, endereco: e.target.value })} />
                </div>
                <div className="form-field">
                  <label className="form-label">Número</label>
                  <input className="fam-input" type="text" value={form.numero}
                    onChange={e => setForm({ ...form, numero: e.target.value })} />
                </div>
                <div className="form-field">
                  <label className="form-label">Complemento</label>
                  <input className="fam-input" type="text" value={form.complemento}
                    onChange={e => setForm({ ...form, complemento: e.target.value })} />
                </div>
                <div className="form-field">
                  <label className="form-label">Bairro</label>
                  <input className="fam-input" type="text" value={form.bairro}
                    onChange={e => setForm({ ...form, bairro: e.target.value })} />
                </div>
                <div className="form-field">
                  <label className="form-label">Cidade</label>
                  <input className="fam-input" type="text" value={form.cidade}
                    onChange={e => setForm({ ...form, cidade: e.target.value })} />
                </div>
              </div>

              <div className="mt-sub"><span className="pt" style={{ background: '#6080a0' }} />Observação</div>
              <div className="form-grid">
                <div className="form-field full">
                  <textarea className="fam-input" rows={3} style={{ resize: 'vertical' }} value={form.observacao}
                    onChange={e => setForm({ ...form, observacao: e.target.value })} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 9, marginTop: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button type="button" className="mt-btn" onClick={() => { setForm(doTomador(tomador)); setEditando(false); setErroCnpj(''); setErroCorretora('') }}>
                  Cancelar
                </button>
                <button type="submit" className="mt-btn pri" disabled={enviando}>
                  {enviando ? 'Salvando…' : 'Salvar alterações'}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Os anexos do tomador continuam junto do cadastro, como estavam no
          modal antigo. */}
      <section className="mt-card mt-bloco">
        <header className="mt-bloco-cab">
          <span className="pt" style={{ background: '#27a96c' }} />
          <span className="mt-bloco-tit">Anexos do tomador</span>
        </header>
        <div className="mt-bloco-corpo">
          <AnexosSection entidadeTipo="tomador" entidadeId={tomador.id} />
        </div>
      </section>

      {organograma && (
        <OrganogramaModal
          tomador={tomador}
          usuarioInfo={usuarioInfo}
          onClose={() => { setOrganograma(false); onSalvo() }}
        />
      )}

      {confirmExcluir && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setConfirmExcluir(false) }}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <div className="modal-title">Excluir tomador</div>
              <button onClick={() => setConfirmExcluir(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#1a2a3a' }}>
              Excluir <b>{tomador.razao_social}</b>? A exclusão fica registrada no log de auditoria,
              mas o cadastro em si não volta.
            </p>
            <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="btn-secondary" onClick={() => setConfirmExcluir(false)}>Cancelar</button>
              <button className="btn-danger" onClick={excluir} disabled={excluindo}>
                {excluindo ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
