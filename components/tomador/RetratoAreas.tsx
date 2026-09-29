'use client'

// ============================================================================
//  O QUE COMERCIAL E CADASTRO DEIXARAM  ·  o detalhe das duas primeiras áreas
//
//  Pedido dele em 29/09/2026, depois de ver o retrato do Fluxo por área: o
//  Crédito abria o relatório e as outras áreas quase nada. "A área comercial,
//  quando aplicado, tem que trazer o e-mail solicitado, ou a forma que foi
//  criado esse card", e o Cadastro tem que ter "qualidade de informação visual
//  suficiente para entender o cadastro do tomador". Só leitura, como o resto.
//
//  DE ONDE VEM
//   • o pedido ......... `casos` (tomador_id ou CNPJ), com a cópia do e-mail que
//                         a Triagem guardou; `emails_caixa` só para para/cópia e
//                         a lista de anexos (liga por `casos.email_caixa_id`)
//   • como nasceu ...... sem caso, o texto que quem criou deixou em
//                         `tomadores.observacao`; sem nada, a data de criação.
//                         Em 29/09 só 50 de 647 tomadores tinham caso: o resto
//                         veio da planilha antes do Carteiro existir.
//   • a ficha .......... `tomadores` (o dono do cadastro desde 21/09/2026)
//   • a triagem ........ `analise_fila.cadastro` (o que o cadastro.mjs decidiu)
//   • a conferência .... `analise_fila.cadastro_agente` (o agente de Cadastro)
// ============================================================================

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Tomador } from '@/types'
import { fmtData, fmtMoeda, maskCNPJ, maskTelefone } from '@/lib/utils'
import { cor, raio, texto, ponto, botaoVazado } from '@/lib/ui/painel'
import { Campo } from '@/components/analise/Relatorio'
import type { CadastroFila, CadastroAgente } from '@/lib/analise/mesa'

// ── peças pequenas ──────────────────────────────────────────────────────────

function Titulo({ nome, c = cor.acao, dir }: { nome: string; c?: string; dir?: React.ReactNode }) {
  return (
    <div style={{ ...texto.titulo, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 7, margin: '14px 0 7px' }}>
      <span style={ponto(c)} />
      <span style={{ flex: 1 }}>{nome}</span>
      {dir && <span style={{ ...texto.nota, fontWeight: 400 }}>{dir}</span>}
    </div>
  )
}

function Etiqueta({ txt, tom }: { txt: string; tom: 'bom' | 'atencao' | 'ruim' | 'neutro' }) {
  const t = {
    bom: { c: cor.areaOperacao, f: '#e9f7f0' },
    atencao: { c: cor.ouroTexto, f: '#fbf4e2' },
    ruim: { c: cor.alerta, f: cor.alertaFundo },
    neutro: { c: cor.textoSub, f: cor.papelZebra },
  }[tom]
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color: t.c, background: t.f, whiteSpace: 'nowrap',
      border: `1px solid ${cor.bordaSuave}`, borderRadius: 999, padding: '1px 8px',
    }}>{txt}</span>
  )
}

const kb = (n: number | null | undefined) =>
  !n ? '' : n >= 1024 ? `${(n / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.round(n)} KB`

// ── COMERCIAL: como o card nasceu ───────────────────────────────────────────

interface CasoOrigem {
  id: string
  numero: number | null
  assunto: string | null
  remetente_nome: string | null
  remetente_email: string | null
  recebido_em: string | null
  corpo: string | null
  criado_em: string
  criado_por_nome: string | null
  corretora_texto: string | null
  produto: string | null
  etapa: string | null
  email_caixa_id: string | null
}

interface EmailCaixa {
  id: string
  para: string | null
  copia: string | null
  anexos: { nome?: string; kb?: number }[] | null
}

export function OrigemDoCard({ tomador, corretora, temperatura }: {
  tomador: Tomador; corretora: string | null; temperatura: string | null
}) {
  const [casos, setCasos] = useState<CasoOrigem[] | null>(null)
  const [emails, setEmails] = useState<Record<string, EmailCaixa>>({})
  const [aberto, setAberto] = useState<string | null>(null)
  const [inteiro, setInteiro] = useState(false)

  useEffect(() => {
    let vivo = true
    const supabase = createClient()
    const filtro = tomador.cnpj ? `tomador_id.eq.${tomador.id},cnpj.eq.${tomador.cnpj}` : `tomador_id.eq.${tomador.id}`
    supabase.from('casos')
      .select('id, numero, assunto, remetente_nome, remetente_email, recebido_em, corpo, criado_em, criado_por_nome, corretora_texto, produto, etapa, email_caixa_id')
      .or(filtro).order('criado_em', { ascending: true }).limit(20)
      .then(async ({ data }) => {
        const lista = (data ?? []) as CasoOrigem[]
        const ids = lista.map(c => c.email_caixa_id).filter(Boolean) as string[]
        let mapa: Record<string, EmailCaixa> = {}
        if (ids.length) {
          const { data: ems } = await supabase.from('emails_caixa').select('id, para, copia, anexos').in('id', ids)
          mapa = Object.fromEntries(((ems ?? []) as EmailCaixa[]).map(e => [e.id, e]))
        }
        if (!vivo) return
        setCasos(lista)
        setEmails(mapa)
        setAberto(lista[0]?.id ?? null)
      })
    return () => { vivo = false }
  }, [tomador.id, tomador.cnpj])

  const caso = casos?.find(c => c.id === aberto) ?? null
  const email = caso?.email_caixa_id ? emails[caso.email_caixa_id] : undefined
  // A imagem da assinatura vem duas vezes: "[cid:…]" no corpo e image001.png
  // nos anexos. Nenhuma das duas é documento do pedido.
  const corpo = caso?.corpo?.replace(/\[cid:[^\]]*\]/g, '').replace(/\n{3,}/g, '\n\n').trim() ?? ''
  const anexos = (email?.anexos ?? []).filter(a => !/^image\d*\.(png|jpe?g|gif)$/i.test(a.nome ?? ''))
  const primeiro = casos?.[0]

  const comoNasceu = casos === null ? '…'
    : primeiro ? `Por e-mail, caso #${primeiro.numero ?? '—'}`
      : tomador.observacao?.startsWith('Cadastro ') ? tomador.observacao.split(',')[0]
        : 'Cadastro anterior à entrada por e-mail'

  return (
    <>
      <div className="mt-campos">
        <Campo rotulo="Corretora" valor={corretora} />
        <Campo rotulo="Responsável" valor={tomador.responsavel} />
        <Campo rotulo="Entrada na FAM" valor={tomador.data_entrada ? fmtData(tomador.data_entrada) : fmtData(tomador.created_at)} />
        <Campo rotulo="Como o card nasceu" valor={comoNasceu} />
        {temperatura && <Campo rotulo="Temperatura da conta" valor={temperatura} />}
      </div>

      {casos !== null && casos.length === 0 && (
        <div style={{ ...texto.apoio, marginTop: 10 }}>
          {tomador.observacao?.startsWith('Cadastro ')
            ? <>{tomador.observacao} Criado em {fmtData(tomador.created_at)}.</>
            : <>Este tomador não tem e-mail de pedido guardado: o cadastro é de {fmtData(tomador.created_at)},
              {' '}de antes de o pedido entrar pela Caixa do Comercial. Os próximos pedidos aparecem aqui.</>}
        </div>
      )}

      {caso && (
        <>
          <Titulo nome={casos!.length > 1 ? 'O pedido' : 'O e-mail do pedido'} c={cor.ouro}
            dir={caso.criado_por_nome ? `trazido por ${caso.criado_por_nome} em ${fmtData(caso.criado_em)}` : `trazido em ${fmtData(caso.criado_em)}`} />
          {casos!.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {casos!.map((c, i) => (
                <button key={c.id} type="button" onClick={() => { setAberto(c.id); setInteiro(false) }}
                  style={{
                    ...botaoVazado, padding: '4px 10px', fontSize: 11.5,
                    borderColor: c.id === aberto ? cor.bordaAtiva : cor.borda,
                    color: c.id === aberto ? cor.acao : cor.texto,
                  }}>
                  {i === 0 ? 'Primeiro pedido' : `Pedido #${c.numero ?? i + 1}`} · {fmtData(c.recebido_em ?? c.criado_em)}
                </button>
              ))}
            </div>
          )}

          <div style={{ border: `1px solid ${cor.borda}`, borderRadius: raio.cartao, overflow: 'hidden' }}>
            <div style={{ background: cor.papelZebra, padding: '10px 12px', borderBottom: `1px solid ${cor.bordaSuave}` }}>
              <div style={{ ...texto.titulo, fontSize: 13.5 }}>{caso.assunto || '(sem assunto)'}</div>
              <div style={{ ...texto.corpo, fontSize: 12, marginTop: 4 }}>
                <b style={{ color: cor.tinta }}>{caso.remetente_nome || caso.remetente_email || 'remetente não guardado'}</b>
                {caso.remetente_nome && caso.remetente_email && <span style={{ color: cor.textoFraco }}> &lt;{caso.remetente_email}&gt;</span>}
                {caso.recebido_em && <span style={{ color: cor.textoFraco }}> · {new Date(caso.recebido_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>}
              </div>
              {(email?.para || email?.copia) && (
                <div style={{ ...texto.nota, marginTop: 2 }}>
                  {email.para && <>para {email.para}</>}{email.para && email.copia && ' · '}{email.copia && <>cópia {email.copia}</>}
                </div>
              )}
              {(caso.produto || caso.corretora_texto) && (
                <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                  {caso.produto && <Etiqueta txt={caso.produto} tom="neutro" />}
                  {caso.corretora_texto && <Etiqueta txt={caso.corretora_texto} tom="neutro" />}
                </div>
              )}
            </div>

            <div style={{ padding: '10px 12px' }}>
              {corpo ? (
                <>
                  <div style={{
                    ...texto.corpo, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                    maxHeight: inteiro ? undefined : 150, overflow: 'hidden',
                    maskImage: inteiro ? undefined : 'linear-gradient(#000 70%, transparent)',
                  }}>{corpo}</div>
                  {corpo.length > 400 && (
                    <button type="button" onClick={() => setInteiro(v => !v)}
                      style={{ ...botaoVazado, padding: '4px 10px', fontSize: 11.5, marginTop: 6 }}>
                      {inteiro ? 'Recolher' : 'Ler o e-mail inteiro'}
                    </button>
                  )}
                </>
              ) : <div style={texto.apoio}>O corpo do e-mail não foi guardado com o pedido.</div>}

              {anexos.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {anexos.map((a, i) => (
                    <span key={i} style={{
                      fontSize: 11.5, color: cor.texto, background: cor.papelZebra, border: `1px solid ${cor.bordaSuave}`,
                      borderRadius: raio.controle, padding: '3px 8px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={a.nome}>
                      📎 {a.nome ?? 'anexo'}{a.kb ? <span style={{ color: cor.textoFraco }}> · {kb(a.kb)}</span> : null}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ── CADASTRO E TRIAGEM: a ficha do tomador ──────────────────────────────────

interface FilaCadastro {
  fase: string | null
  situacao: string | null
  criado_em: string | null
  cadastro: CadastroFila | null
  cadastro_agente: CadastroAgente | null
  cadastro_agente_em: string | null
}

const SITUACAO_ITEM: Record<string, { txt: string; tom: 'bom' | 'atencao' | 'ruim' | 'neutro' }> = {
  ok: { txt: 'recebido', tom: 'bom' },
  faltando: { txt: 'falta', tom: 'ruim' },
  duvida: { txt: 'em dúvida', tom: 'atencao' },
  a_caminho: { txt: 'a caminho', tom: 'atencao' },
  dispensado: { txt: 'dispensado', tom: 'neutro' },
}

const STATUS_TRIAGEM: Record<string, { txt: string; tom: 'bom' | 'atencao' | 'ruim' | 'neutro' }> = {
  aprovado: { txt: 'aprovado', tom: 'bom' },
  em_conferencia: { txt: 'em conferência', tom: 'atencao' },
  pendente: { txt: 'pendente', tom: 'atencao' },
  bloqueado: { txt: 'bloqueado', tom: 'ruim' },
}

export function FichaDoCadastro({ tomador, checklist }: {
  tomador: Tomador
  /** a leitura por nome de arquivo, para quando a triagem nunca rodou */
  checklist: { id: string; nome: string; tem: boolean; trava: boolean }[]
}) {
  const [fila, setFila] = useState<FilaCadastro | null | undefined>(undefined)

  useEffect(() => {
    let vivo = true
    createClient().from('analise_fila')
      .select('fase, situacao, criado_em, cadastro, cadastro_agente, cadastro_agente_em')
      .eq('tomador_id', tomador.id)
      .order('arquivada', { ascending: true }).order('atualizado_em', { ascending: false })
      .limit(1).maybeSingle()
      .then(({ data }) => { if (vivo) setFila((data as FilaCadastro | null) ?? null) })
    return () => { vivo = false }
  }, [tomador.id])

  const t = tomador
  const endereco = [t.endereco, t.numero, t.complemento, t.bairro].filter(Boolean).join(', ')
  const cidade = [t.cidade, t.estado].filter(Boolean).join('/')
  const fonte = t.cadastro_fonte === 'receita' ? 'cartão CNPJ da Receita'
    : t.cadastro_fonte === 'analise' ? 'análise de crédito' : 'digitado no CRM'
  const receitaTom = !t.situacao_receita ? 'neutro' : /ativa/i.test(t.situacao_receita) ? 'bom' : 'ruim'

  const triagem = fila?.cadastro ?? null
  const agente = fila?.cadastro_agente ?? null
  const itens = triagem?.itens?.length ? triagem.itens : null
  const status = triagem ? STATUS_TRIAGEM[triagem.status] ?? { txt: triagem.status, tom: 'neutro' as const } : null
  const divergencias = agente?.conferencia?.filter(c => !c.confere) ?? []

  return (
    <>
      {/* a empresa */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ ...texto.titulo, fontSize: 14 }}>{t.razao_social}</div>
          <div style={{ ...texto.apoio }}>
            {t.cnpj ? maskCNPJ(t.cnpj) : 'sem CNPJ'}{t.nome_fantasia ? ` · ${t.nome_fantasia}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {t.situacao_receita && <Etiqueta txt={`Receita: ${t.situacao_receita}`} tom={receitaTom} />}
          {status && <Etiqueta txt={`Triagem ${status.txt}`} tom={status.tom} />}
          <Etiqueta txt={`fonte: ${fonte}`} tom="neutro" />
        </div>
      </div>
      {!t.cnpj && (
        <div style={{ ...texto.corpo, color: cor.alerta, marginTop: 6 }}>
          Sem CNPJ no cadastro: a análise não consegue se ligar a este tomador.
        </div>
      )}

      <Titulo nome="A empresa" />
      <div className="mt-campos">
        <Campo rotulo="Abertura" valor={t.data_abertura ? fmtData(t.data_abertura) : null} />
        <Campo rotulo="Porte" valor={t.porte} />
        <Campo rotulo="Capital social" valor={t.capital_social ? fmtMoeda(t.capital_social) : null} />
        <Campo rotulo="Regime tributário" valor={t.regime_tributario} />
        <Campo rotulo="Segmento" valor={[t.segmento, t.setor].filter(Boolean).join(' · ')} />
        <Campo rotulo="Funcionários" valor={t.funcionarios} />
        <Campo rotulo="CNAE" valor={t.cnae} largo />
        <Campo rotulo="Filiais" valor={t.filiais} largo />
      </div>

      <Titulo nome="Endereço e contato" />
      <div className="mt-campos">
        <Campo rotulo="Endereço" valor={endereco} largo />
        <Campo rotulo="Cidade" valor={cidade} />
        <Campo rotulo="CEP" valor={t.cep} />
        <Campo rotulo="E-mail" valor={t.email} />
        <Campo rotulo="Telefone" valor={t.telefone ? maskTelefone(t.telefone) : t.celular ? maskTelefone(t.celular) : null} />
      </div>

      {/* a triagem dos documentos */}
      <Titulo nome="Documentos da triagem" c={cor.areaOperacao}
        dir={fila === undefined ? 'lendo…' : itens ? `triagem da esteira${fila?.criado_em ? `, pasta de ${fmtData(fila.criado_em)}` : ''}` : 'lido pelos nomes dos arquivos'} />
      {triagem?.motivo && <div style={{ ...texto.apoio, marginBottom: 6 }}>{triagem.motivo}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: '0 18px' }}>
        {(itens
          ? itens.map(i => ({ id: i.id, nome: i.nome, obs: i.obs, s: SITUACAO_ITEM[i.situacao] ?? { txt: i.situacao, tom: 'neutro' as const }, trava: i.exigencia === 'bloqueia' }))
          : checklist.map(i => ({ id: i.id, nome: i.nome, obs: undefined, s: i.tem ? SITUACAO_ITEM.ok : SITUACAO_ITEM.faltando, trava: i.trava }))
        ).map(i => (
          <div key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '5px 0', borderBottom: `1px solid ${cor.bordaSuave}` }}>
            <span style={{ ...texto.corpo, flex: 1, minWidth: 0 }}>
              {i.nome}
              {i.trava && <span style={{ ...texto.nota }}> · obrigatório</span>}
              {i.obs && <div style={{ ...texto.nota }}>{i.obs}</div>}
            </span>
            <Etiqueta txt={i.s.txt} tom={i.s.tom} />
          </div>
        ))}
      </div>

      {/* a conferência do agente de Cadastro */}
      {agente && agente.conferencia?.length > 0 && (
        <>
          <Titulo nome="Conferência do cadastro" c={cor.ouro}
            dir={`agente de Cadastro${fila?.cadastro_agente_em ? `, ${fmtData(fila.cadastro_agente_em)}` : ''} · ${divergencias.length ? `${divergencias.length} divergência${divergencias.length > 1 ? 's' : ''}` : 'tudo confere'}`} />
          <div className="mt-tab-wrap">
            <table className="mt-tab">
              <thead>
                <tr><th>Campo</th><th>Contrato social</th><th>Serasa</th><th>Resultado</th></tr>
              </thead>
              <tbody>
                {agente.conferencia.map((c, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{c.campo}</td>
                    <td>{c.contrato_social || '—'}</td>
                    <td>{c.serasa || '—'}</td>
                    <td>
                      <Etiqueta txt={c.confere ? 'confere' : c.gravidade === 'bloqueia' ? 'diverge, trava' : 'diverge'}
                        tom={c.confere ? 'bom' : c.gravidade === 'bloqueia' ? 'ruim' : 'atencao'} />
                      {c.nota && <div style={{ ...texto.nota, marginTop: 2 }}>{c.nota}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {agente.atencao?.length > 0 && (
            <ul style={{ ...texto.corpo, margin: '8px 0 0', paddingLeft: 18 }}>
              {agente.atencao.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          )}
        </>
      )}
    </>
  )
}
