'use client'

/* A TELA DA RÉGUA · os parâmetros do Carteiro gerencial
   ═══════════════════════════════════════════════════════════════════════════

   Ordem do Marco em 11/09/2026: "crie uma tela de parâmetros, onde o usuário
   irá parametrizar a análise dos e-mails, e quando ele precisar fazer algo
   fora do parâmetro, ele faz individual".

   O QUE O MERCADO ENSINOU, E ESTÁ AQUI:
   · SIMULAR ANTES DE APLICAR (Stripe Radar): a mudança mostra, antes de
     gravar, quantos pedidos trocariam de degrau nos e-mails que já chegaram,
     e quais. Régua que se aplica no escuro é régua que alguém desfaz no susto.
   · RASCUNHO NÃO MEXE NO QUE ESTÁ VALENDO (Zapier, Intercom): editar aqui não
     muda a ponte de ninguém até "Gravar versão".
   · HISTÓRICO COM ANTES E DEPOIS (HubSpot): cada versão diz o que entrou, o
     que saiu, quem e por quê.

   Todos veem a régua. Só o proprietário grava (a RLS garante, não esta tela). */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { SecaoPainel, Aviso } from '@/components/painel/Painel'
import { cor, corDaArea, texto, raio, botaoCheio, botaoVazado } from '@/lib/ui/painel'
import { METAS_PADRAO, type LinhaPedido, type MetasEmail } from '@/lib/email/metricas'
import {
  diferencas, lerVersao, NOME_DO_PARAMETRO, reguaVigente, validarParametros,
  type MudancaRegua, type ParametrosRegua, type Sinonimo, type VersaoRegua,
} from '@/lib/email/regua'
import type { ClassificacaoGravada } from '@/lib/email/classificar'
import { janelaDoPeriodo, ROTULO_BALDE, simularRegua, type Balde, type PeriodoId } from '@/lib/email/ponte'

type LinhaPonte = LinhaPedido & { previa?: string | null; anexos?: { nome?: string | null }[] | null }

const VAZIA: ParametrosRegua = {
  excluidas: [], sinonimos: [], termos_operacao: [], termos_so_credito: [], nao_demanda_assunto: [], nao_demanda_remetentes: [],
}

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const DEGRAUS_SIMULADOS: Balde[] = ['nao_demanda', 'continuacao', 'fora_apetite', 'sem_classificacao', 'resolvido', 'a_fazer']

export default function ReguaEmail() {
  const { proprietario } = usePermissoes()
  const pode = !!proprietario

  const [versoes, setVersoes] = useState<VersaoRegua[]>([])
  const [modalidades, setModalidades] = useState<string[]>([])
  const [linhas, setLinhas] = useState<LinhaPonte[]>([])
  const [gravadas, setGravadas] = useState<ClassificacaoGravada[]>([])
  const [metas, setMetas] = useState<MetasEmail>(METAS_PADRAO)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const [rascunho, setRascunho] = useState<ParametrosRegua | null>(null)
  const [base, setBase] = useState<number | null>(null)
  const [motivo, setMotivo] = useState('')
  const [periodoSim, setPeriodoSim] = useState<PeriodoId>('30')
  const [salvando, setSalvando] = useState(false)
  const [agora, setAgora] = useState(() => new Date())

  const carregar = useCallback(async () => {
    const supabase = createClient()
    const [regua, mods, pedidos, classes, m] = await Promise.all([
      supabase.from('email_regua').select('versao, parametros, motivo, criada_por_nome, criada_em').order('versao'),
      supabase.from('modalidades').select('nome'),
      supabase.from('painel_pedidos').select('*').order('recebido_em', { ascending: false, nullsFirst: false }).limit(3000),
      supabase.from('email_classificacao').select('*').limit(5000),
      supabase.from('email_metas').select('*').eq('id', true).maybeSingle(),
    ])
    if (regua.error) setErro(regua.error.message)
    setVersoes(((regua.data ?? []) as Parameters<typeof lerVersao>[0][]).map(lerVersao))
    setModalidades([...new Set((mods.data ?? []).map((x) => String(x.nome)))].sort((a, b) => a.localeCompare(b, 'pt-BR')))
    setLinhas((pedidos.data ?? []) as LinhaPonte[])
    setGravadas((classes.data ?? []) as ClassificacaoGravada[])
    if (m.data) setMetas({ ...METAS_PADRAO, ...m.data })
    setAgora(new Date())
    setCarregando(false)
  }, [])

  /* A primeira leitura sai no próximo tique, fora do corpo do efeito. E a
     régua gravada em outra aba chega sozinha: o rascunho daqui passa a partir
     dela (ver "o rascunho nasce da vigente", abaixo). */
  useEffect(() => {
    const primeira = setTimeout(carregar, 0)
    const supabase = createClient()
    const canal = supabase
      .channel('regua-email')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'email_regua' }, () => { carregar() })
      .subscribe()
    return () => { clearTimeout(primeira); supabase.removeChannel(canal) }
  }, [carregar])

  const vigente = reguaVigente(versoes)

  /* O rascunho nasce da vigente e só é trocado quando a vigente muda (outra
     aba gravou). Derivado na renderização, sem efeito. */
  if (vigente && base !== vigente.versao) {
    setBase(vigente.versao)
    setRascunho(structuredClone(vigente.parametros))
  }

  const atual = rascunho ?? vigente?.parametros ?? VAZIA
  const validacao = useMemo(() => validarParametros(atual, modalidades), [atual, modalidades])
  const mudancas: MudancaRegua[] = useMemo(
    () => (vigente ? diferencas(vigente.parametros, validacao.parametros) : []),
    [vigente, validacao],
  )

  const simulacao = useMemo(() => {
    if (!vigente || !mudancas.length || !validacao.ok) return null
    return simularRegua(
      linhas,
      { versoes, modalidades, gravadas, metas, agora, janela: janelaDoPeriodo(periodoSim, agora) },
      { versao: vigente.versao + 1, parametros: validacao.parametros, motivo: 'simulação', criada_por_nome: null, criada_em: agora.toISOString() },
    )
  }, [vigente, mudancas, validacao, linhas, versoes, modalidades, gravadas, metas, agora, periodoSim])

  const mudar = (f: (p: ParametrosRegua) => ParametrosRegua) => {
    setAviso('')
    setRascunho((r) => f(structuredClone(r ?? vigente?.parametros ?? VAZIA)))
  }

  async function gravar() {
    if (!vigente) return
    setSalvando(true); setErro(''); setAviso('')
    try {
      const r = await fetch('/api/email/regua', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parametros: validacao.parametros, motivo, versao_base: vigente.versao }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setErro(j.erro ?? 'Não consegui gravar.')
      else { setAviso(`Versão ${j.versao} gravada. A ponte de todo mundo já usa ela para os e-mails que chegarem daqui em diante.`); setMotivo('') }
    } catch {
      setErro('A conexão caiu. Nada foi gravado.')
    }
    setSalvando(false)
    await carregar()
  }

  const cores = corDaArea('comercial')
  const fora = new Set(atual.excluidas)

  return (
    <div>
      <style jsx>{`
        .rg-grade { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 18px; align-items: start; }
        .rg-lado { position: sticky; top: 76px; }
        @media (max-width: 1080px) {
          .rg-grade { grid-template-columns: 1fr; }
          .rg-lado { position: static; }
        }
      `}</style>

      <div style={{ marginBottom: 16 }}>
        <Link href="/comercial" style={{ ...texto.apoio, color: cor.tinta2, textDecoration: 'none' }}>‹ Entrada do Comercial</Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: cor.tinta, margin: '6px 0 0' }}>Régua do e-mail</h1>
        <p style={{ color: cor.textoFraco, fontSize: 14, margin: '6px 0 0', maxWidth: '80ch' }}>
          O que decide, em cada e-mail que chega, se é pedido, de qual modalidade e se a FAM tem apetite. O que
          ficar fora dela, você decide pedido a pedido na fila. Cada mudança vira uma versão nova, e a versão
          antiga continua julgando os e-mails que chegaram enquanto ela valia.
        </p>
      </div>

      {erro && <div style={{ marginBottom: 12 }}><Aviso tom="erro">{erro}</Aviso></div>}
      {aviso && <div style={{ marginBottom: 12 }}><Aviso>{aviso}</Aviso></div>}
      {carregando && <Aviso>Lendo a régua…</Aviso>}
      {!carregando && !vigente && <Aviso tom="erro">A régua não existe no banco. Falta aplicar a migration do Carteiro gerencial.</Aviso>}

      {!carregando && vigente && (
        <>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'baseline', marginBottom: 16, padding: '10px 13px',
            background: cor.papel, border: `1px solid ${cor.borda}`, borderLeft: `3px solid ${cor.ouro}`, borderRadius: raio.cartao,
          }}>
            <b style={{ color: cor.tinta, fontSize: 13.5 }}>Vigente: versão {vigente.versao}</b>
            <span style={texto.apoio}>{dataHora(vigente.criada_em)} · {vigente.criada_por_nome ?? 'sem autor'}</span>
            <span style={{ ...texto.apoio, flexBasis: '100%' }}>“{vigente.motivo}”</span>
          </div>

          {!pode && (
            <div style={{ marginBottom: 16 }}>
              <Aviso>Só o proprietário muda a régua. Você vê o que vale hoje, e o histórico de quem mudou o quê.</Aviso>
            </div>
          )}

          <div className="rg-grade">
            {/* ── o editor ── */}
            <div>
              <SecaoPainel nome="O que a FAM opera hoje" cor={cores}>
                <Quadro nota="Operação de modalidade sem apetite morre ao nascer, com o motivo e a versão da régua. O tomador fica vivo para a próxima.">
                  {(['dentro', 'fora'] as const).map((lado) => {
                    const lista = modalidades.filter((m) => (lado === 'fora') === fora.has(m))
                    return (
                      <div key={lado} style={{ marginBottom: lado === 'dentro' ? 12 : 0 }}>
                        <div style={{ ...texto.rotulo, marginBottom: 6, color: lado === 'fora' ? cor.textoSub : cor.textoFraco }}>
                          {lado === 'dentro' ? `Com apetite · ${lista.length}` : `Sem apetite · ${lista.length}`}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {lista.map((m) => (
                            <button
                              key={m}
                              type="button"
                              className="painel-alvo"
                              disabled={!pode}
                              title={pode ? (lado === 'dentro' ? 'Clique para tirar o apetite' : 'Clique para voltar a ter apetite') : undefined}
                              onClick={() => mudar((p) => ({
                                ...p,
                                excluidas: lado === 'dentro' ? [...p.excluidas, m] : p.excluidas.filter((x) => x !== m),
                              }))}
                              style={{
                                fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 20, cursor: pode ? 'pointer' : 'default',
                                background: lado === 'dentro' ? cor.destaque : cor.bordaSuave,
                                color: lado === 'dentro' ? cor.tinta2 : cor.textoSub,
                                border: `1px solid ${lado === 'dentro' ? cor.destaque : cor.borda}`,
                                textDecoration: lado === 'fora' ? 'line-through' : 'none',
                              }}
                            >
                              {m}
                            </button>
                          ))}
                          {!lista.length && <span style={texto.nota}>nenhuma</span>}
                        </div>
                      </div>
                    )
                  })}
                </Quadro>
              </SecaoPainel>

              <SecaoPainel nome={NOME_DO_PARAMETRO.sinonimos} cor={cores}>
                <Quadro nota="O nome oficial de cada modalidade já vale sozinho. Aqui entra o jeito que a corretora escreve. Com mais de uma modalidade, o termo é uma família: só decide o apetite quando todas concordam.">
                  <Sinonimos lista={atual.sinonimos} modalidades={modalidades} pode={pode} aoMudar={(sinonimos) => mudar((p) => ({ ...p, sinonimos }))} />
                </Quadro>
              </SecaoPainel>

              <SecaoPainel nome="Sinais no e-mail" cor={cores}>
                <Quadro>
                  <Etiquetas
                    titulo={NOME_DO_PARAMETRO.termos_operacao}
                    nota="Operação sem modalidade reconhecida vira pergunta (sem classificação). Termo de até 3 letras, como IS, só vale no assunto."
                    lista={atual.termos_operacao} pode={pode}
                    aoMudar={(termos_operacao) => mudar((p) => ({ ...p, termos_operacao }))}
                  />
                  <Etiquetas
                    titulo={NOME_DO_PARAMETRO.termos_so_credito}
                    nota="Pedido sem operação, só a análise do tomador."
                    lista={atual.termos_so_credito} pode={pode}
                    aoMudar={(termos_so_credito) => mudar((p) => ({ ...p, termos_so_credito }))}
                  />
                </Quadro>
              </SecaoPainel>

              <SecaoPainel nome="O que não é pedido" cor={cores}>
                <Quadro nota="Vale para o que passou na régua da caixa e ainda não foi decidido por ninguém.">
                  <Etiquetas
                    titulo={NOME_DO_PARAMETRO.nao_demanda_assunto}
                    lista={atual.nao_demanda_assunto} pode={pode}
                    aoMudar={(nao_demanda_assunto) => mudar((p) => ({ ...p, nao_demanda_assunto }))}
                  />
                  <Etiquetas
                    titulo={NOME_DO_PARAMETRO.nao_demanda_remetentes}
                    nota="O endereço inteiro, ou @domínio para a casa toda."
                    lista={atual.nao_demanda_remetentes} pode={pode}
                    aoMudar={(nao_demanda_remetentes) => mudar((p) => ({ ...p, nao_demanda_remetentes }))}
                  />
                </Quadro>
              </SecaoPainel>
            </div>

            {/* ── antes de gravar ── */}
            <div className="rg-lado">
              <SecaoPainel nome="Antes de gravar" cor={cores}>
                <div style={{ background: cor.papel, border: `1px solid ${cor.borda}`, borderRadius: raio.cartao, padding: '12px 13px' }}>
                  {!mudancas.length && validacao.ok && (
                    <div style={texto.apoio}>Nenhuma mudança em relação à versão {vigente.versao}.</div>
                  )}

                  {!validacao.ok && (
                    <Aviso tom="erro">{validacao.erros.map((e, i) => <div key={i}>{e}</div>)}</Aviso>
                  )}

                  {mudancas.length > 0 && (
                    <>
                      <ListaMudancas mudancas={mudancas} />

                      {simulacao && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                            <span style={{ ...texto.titulo, fontSize: 12.5 }}>Se já valesse</span>
                            <span style={{ flex: 1 }} />
                            {(['7', '30', 'tudo'] as PeriodoId[]).map((p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setPeriodoSim(p)}
                                aria-pressed={periodoSim === p}
                                style={{
                                  ...botaoVazado, padding: '2px 8px', fontSize: 11,
                                  background: periodoSim === p ? cor.destaque : cor.papel,
                                  borderColor: periodoSim === p ? cor.bordaAtiva : cor.borda,
                                }}
                              >
                                {p === 'tudo' ? 'tudo' : `${p} dias`}
                              </button>
                            ))}
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <tbody>
                              {DEGRAUS_SIMULADOS.map((b) => {
                                const a = simulacao.antes.baldes[b]
                                const d = simulacao.depois.baldes[b]
                                const delta = d - a
                                return (
                                  <tr key={b} style={{ borderTop: `1px solid ${cor.bordaSuave}` }}>
                                    <td style={{ padding: '4px 0', color: cor.texto }}>{ROTULO_BALDE[b]}</td>
                                    <td style={{ padding: '4px 6px', textAlign: 'right', color: cor.textoFraco, fontVariantNumeric: 'tabular-nums' }}>{a}</td>
                                    <td style={{ padding: '4px 0', color: cor.textoFraco }} aria-hidden>→</td>
                                    <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700, color: cor.tinta, fontVariantNumeric: 'tabular-nums' }}>{d}</td>
                                    <td style={{ padding: '4px 0', textAlign: 'right', width: 42, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: delta ? cor.tinta2 : cor.textoFraco }}>
                                      {delta > 0 ? `+${delta}` : delta || ''}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                          {simulacao.mudaram.length > 0 ? (
                            <div style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto', borderTop: `1px solid ${cor.bordaSuave}`, paddingTop: 6 }}>
                              {simulacao.mudaram.slice(0, 40).map((x) => (
                                <div key={x.demanda.id} style={{ fontSize: 11.5, lineHeight: 1.45, padding: '3px 0' }}>
                                  <div style={{ color: cor.texto, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.demanda.primeiro.assunto}</div>
                                  <div style={{ color: cor.textoFraco }}>{ROTULO_BALDE[x.de]} → <b style={{ color: cor.tinta2 }}>{ROTULO_BALDE[x.para]}</b></div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ ...texto.nota, marginTop: 6 }}>Nenhum pedido deste período trocaria de degrau.</div>
                          )}
                          <div style={{ ...texto.nota, marginTop: 6 }}>
                            Simulação sobre os e-mails que já chegaram. Gravar não reescreve o passado: a versão nova julga o que chegar depois dela.
                          </div>
                        </div>
                      )}

                      {pode && (
                        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <textarea
                            value={motivo}
                            onChange={(ev) => setMotivo(ev.target.value)}
                            placeholder="Por que a régua muda? (fica no histórico)"
                            maxLength={500}
                            rows={2}
                            className="fam-input"
                            style={{ fontSize: 16, resize: 'vertical' }}
                          />
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="painel-alvo"
                              disabled={salvando || !validacao.ok || motivo.trim().length < 3}
                              onClick={gravar}
                              style={{ ...botaoCheio, opacity: salvando || !validacao.ok || motivo.trim().length < 3 ? 0.5 : 1 }}
                            >
                              {salvando ? 'Gravando…' : `Gravar versão ${vigente.versao + 1}`}
                            </button>
                            <button
                              type="button"
                              className="painel-alvo"
                              disabled={salvando}
                              onClick={() => { setRascunho(structuredClone(vigente.parametros)); setMotivo('') }}
                              style={botaoVazado}
                            >
                              Descartar
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </SecaoPainel>

              <SecaoPainel nome="Histórico" cor={cores}>
                <div style={{ background: cor.papel, border: `1px solid ${cor.borda}`, borderRadius: raio.cartao, overflow: 'hidden' }}>
                  {[...versoes].sort((a, b) => b.versao - a.versao).map((v, i, lista) => {
                    const anterior = lista[i + 1]
                    const mud = diferencas(anterior?.parametros ?? null, v.parametros)
                    return (
                      <div key={v.versao} style={{ padding: '10px 12px', borderTop: i ? `1px solid ${cor.bordaSuave}` : undefined }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <b style={{ color: cor.tinta, fontSize: 12.5 }}>v{v.versao}</b>
                          <span style={texto.nota}>{dataHora(v.criada_em)} · {v.criada_por_nome ?? 'sem autor'}</span>
                        </div>
                        <div style={{ ...texto.apoio, marginTop: 2 }}>{v.motivo}</div>
                        {anterior && <div style={{ marginTop: 6 }}><ListaMudancas mudancas={mud} compacta /></div>}
                      </div>
                    )
                  })}
                </div>
              </SecaoPainel>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ── peças ───────────────────────────────────────────────────────────────── */

function Quadro({ children, nota }: { children: React.ReactNode; nota?: string }) {
  return (
    <div style={{ background: cor.papel, border: `1px solid ${cor.borda}`, borderRadius: raio.cartao, padding: '12px 13px' }}>
      {children}
      {nota && <div style={{ ...texto.nota, marginTop: 10 }}>{nota}</div>}
    </div>
  )
}

function ListaMudancas({ mudancas, compacta }: { mudancas: MudancaRegua[]; compacta?: boolean }) {
  if (!mudancas.length) return <div style={texto.nota}>Sem mudança de conteúdo.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compacta ? 4 : 8 }}>
      {mudancas.map((m) => (
        <div key={m.parametro}>
          <div style={{ ...texto.rotulo, color: cor.textoSub, fontWeight: 600 }}>{NOME_DO_PARAMETRO[m.parametro]}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
            {m.entrou.map((x) => (
              <span key={'+' + x} style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: cor.destaque, color: cor.tinta2, border: `1px solid ${cor.destaque}` }}>+ {x}</span>
            ))}
            {m.saiu.map((x) => (
              <span key={'-' + x} style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: cor.papel, color: cor.textoSub, border: `1px solid ${cor.borda}`, textDecoration: 'line-through' }}>{x}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Etiquetas({ titulo, nota, lista, pode, aoMudar }: {
  titulo: string
  nota?: string
  lista: string[]
  pode: boolean
  aoMudar: (lista: string[]) => void
}) {
  const [novo, setNovo] = useState('')
  const somar = () => {
    const partes = novo.split(/[\n;,]/).map((x) => x.trim()).filter(Boolean)
    if (partes.length) aoMudar([...lista, ...partes])
    setNovo('')
  }
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...texto.titulo, fontSize: 12.5, marginBottom: 6 }}>{titulo}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
        {lista.map((x, i) => (
          <span key={x + i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '3px 4px 3px 9px', borderRadius: 20,
            background: cor.papelZebra, border: `1px solid ${cor.borda}`, color: cor.texto,
          }}>
            {x}
            {pode && (
              <button
                type="button"
                aria-label={`Tirar ${x}`}
                onClick={() => aoMudar(lista.filter((_, j) => j !== i))}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: cor.textoFraco, fontSize: 14, lineHeight: 1, padding: '0 4px' }}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {!lista.length && <span style={texto.nota}>nenhum</span>}
        {pode && (
          <input
            value={novo}
            onChange={(ev) => setNovo(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); somar() } }}
            onBlur={somar}
            placeholder="acrescentar e Enter"
            maxLength={80}
            className="fam-input"
            style={{ width: 170, padding: '4px 9px', fontSize: 16, minHeight: 30 }}
          />
        )}
      </div>
      {nota && <div style={{ ...texto.nota, marginTop: 5 }}>{nota}</div>}
    </div>
  )
}

function Sinonimos({ lista, modalidades, pode, aoMudar }: {
  lista: Sinonimo[]
  modalidades: string[]
  pode: boolean
  aoMudar: (lista: Sinonimo[]) => void
}) {
  const [termo, setTermo] = useState('')
  const [modalidade, setModalidade] = useState('')
  const trocar = (i: number, s: Sinonimo) => aoMudar(lista.map((x, j) => (j === i ? s : x)))

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {lista.map((s, i) => (
          <div key={s.termo + i} style={{
            display: 'grid', gridTemplateColumns: 'minmax(120px, 190px) minmax(0, 1fr) auto', gap: 10, alignItems: 'center',
            padding: '6px 0', borderTop: i ? `1px solid ${cor.bordaSuave}` : undefined,
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: cor.tinta }}>“{s.termo}”</span>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              {s.modalidades.map((m) => (
                <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11.5, padding: '2px 3px 2px 8px', borderRadius: 20, background: cor.destaque, color: cor.tinta2 }}>
                  {m}
                  {pode && s.modalidades.length > 1 && (
                    <button type="button" aria-label={`Tirar ${m}`} onClick={() => trocar(i, { ...s, modalidades: s.modalidades.filter((x) => x !== m) })}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: cor.textoFraco, fontSize: 13, lineHeight: 1, padding: '0 4px' }}>×</button>
                  )}
                </span>
              ))}
              {pode && (
                <select
                  aria-label={`Acrescentar modalidade a ${s.termo}`}
                  value=""
                  onChange={(ev) => ev.target.value && trocar(i, { ...s, modalidades: [...s.modalidades, ev.target.value] })}
                  style={{ ...botaoVazado, padding: '1px 6px', fontSize: 11, width: 34 }}
                  title="Acrescentar modalidade (vira família)"
                >
                  <option value="">+</option>
                  {modalidades.filter((m) => !s.modalidades.includes(m)).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              )}
            </span>
            {pode ? (
              <button type="button" onClick={() => aoMudar(lista.filter((_, j) => j !== i))} style={{ ...botaoVazado, padding: '2px 8px', fontSize: 11 }}>tirar</button>
            ) : <span />}
          </div>
        ))}
      </div>
      {pode && (
        <form
          onSubmit={(ev) => {
            ev.preventDefault()
            if (termo.trim() && modalidade) { aoMudar([...lista, { termo: termo.trim(), modalidades: [modalidade] }]); setTermo(''); setModalidade('') }
          }}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${cor.bordaSuave}` }}
        >
          <input value={termo} onChange={(ev) => setTermo(ev.target.value)} placeholder="como a corretora escreve" maxLength={80}
            className="fam-input" style={{ flex: '1 1 160px', padding: '5px 9px', fontSize: 16, minHeight: 32 }} />
          <select value={modalidade} onChange={(ev) => setModalidade(ev.target.value)} className="fam-input"
            style={{ flex: '1 1 200px', padding: '5px 9px', fontSize: 14, minHeight: 32 }}>
            <option value="">é qual modalidade?</option>
            {modalidades.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button type="submit" disabled={!termo.trim() || !modalidade} style={{ ...botaoVazado, padding: '5px 12px', fontSize: 12, opacity: termo.trim() && modalidade ? 1 : 0.5 }}>
            acrescentar
          </button>
        </form>
      )}
    </div>
  )
}
