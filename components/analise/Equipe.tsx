'use client'

// ============================================================================
//  A EQUIPE  ·  o organograma dos funcionários virtuais
//
//  Porte do equipe.html do cockpit: a régua de KPIs (funcionários, setores,
//  quantos usam IA, quantos não usam nenhuma), e um trilho por SETOR, com o
//  chefe do setor na frente e quem responde a ele embaixo. Quem responde a
//  alguém de OUTRO setor leva a chefia escrita no rodapé, em vez de trilho:
//  desenhar pirâmide fica bonito e é mentira (equipe.mjs, decisão 1).
//
//  A EMPRESA É VIVA: o avatar acende quando o funcionário deu sinal de trabalho
//  nos últimos minutos (`agente_eventos`), e a luz dourada é a conta de recados
//  não lidos que ele deixou no mural (`analise_recados`). O quadro em si é o
//  espelho do equipe.mjs em `lib/analise/equipe.ts`.
//
//  "5 usam IA, 8 não usam nenhuma": é o argumento para a diretoria, e o selo
//  "sem IA" no card é a peça que conta isso sozinha.
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { QUADRO, SETORES, estadoDosAgentes, type EventoAgente, type Funcionario } from '@/lib/analise/equipe'
import { desde, type Recado } from '@/lib/analise/mesa'

export default function Equipe() {
  const [eventos, setEventos] = useState<EventoAgente[]>([])
  const [recados, setRecados] = useState<Recado[]>([])
  const [ficha, setFicha] = useState<Funcionario | null>(null)
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    let vivo = true
    const supabase = createClient()
    const ler = async () => {
      const desdeIso = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const [e, r] = await Promise.all([
        supabase.from('agente_eventos').select('id, agente, acao, tarefa, alvo, detalhe, criado_em').gte('criado_em', desdeIso).order('criado_em', { ascending: false }).limit(200),
        supabase.from('analise_recados').select('id, agente, em, lido_em, arquivado_em, lido_no_crm_em, arquivado_no_crm_em').limit(400),
      ])
      if (!vivo) return
      setEventos((e.data ?? []) as EventoAgente[])
      setRecados((r.data ?? []) as Recado[])
    }
    ler()
    const t = setInterval(() => { setAgora(Date.now()); ler() }, 20000)
    return () => { vivo = false; clearInterval(t) }
  }, [])

  useEffect(() => {
    if (!ficha) return
    const sair = (e: KeyboardEvent) => { if (e.key === 'Escape') setFicha(null) }
    window.addEventListener('keydown', sair)
    return () => window.removeEventListener('keydown', sair)
  }, [ficha])

  const estado = useMemo(() => estadoDosAgentes(eventos, agora), [eventos, agora])
  const movimento = useMemo(() => {
    const m: Record<string, { recados: number; naoLidos: number; ultimo: string | null }> = {}
    for (const r of recados) {
      const a = r.agente || 'sistema'
      m[a] = m[a] || { recados: 0, naoLidos: 0, ultimo: null }
      m[a].recados++
      if (!r.lido_em && !r.lido_no_crm_em && !r.arquivado_em && !r.arquivado_no_crm_em) m[a].naoLidos++
      if (!m[a].ultimo || r.em > m[a].ultimo) m[a].ultimo = r.em
    }
    return m
  }, [recados])

  // Agente que fala no mural e não tem cadeira no quadro: o alarme contra o
  // organograma envelhecer calado.
  const semCadeira = Object.keys(movimento).filter(a => a !== 'sistema' && !QUADRO.some(p => p.id === a))
  const comIA = QUADRO.filter(p => p.ia).length
  const semIA = QUADRO.filter(p => !p.ia && !p.humano).length

  const nomeDe = (id: string | null) => (id ? QUADRO.find(p => p.id === id)?.nome ?? id : 'Marco Dragone')

  function Cartao({ p, cor, foraDoTrilho }: { p: Funcionario; cor: string; foraDoTrilho?: string }) {
    const mv = movimento[p.id]
    const st = estado[p.id]
    const vivo = !!st?.trabalhando
    return (
      <button type="button" className={`an-p${!p.chefe ? ' chefe' : ''}`} style={{ ['--cor' as string]: cor }} onClick={() => setFicha(p)}>
        <div className="av-linha">
          <div className={`av${p.humano ? ' humano' : ''}${vivo ? ' vivo' : ''}`}>{p.sigla}{mv?.naoLidos ? <span className="luz">{mv.naoLidos}</span> : null}</div>
          <div><div className="nome">{p.nome}</div><div className="cargo">{p.cargo}</div></div>
        </div>
        <div className="faz">{p.faz}</div>
        <div className="selos">
          {p.humano ? <span className="selo">pessoa</span> : p.ia ? <span className="selo ia">usa IA</span> : <span className="selo node">sem IA</span>}
          {vivo && <span className="selo vivo">trabalhando: {st?.tarefa}</span>}
          {mv?.ultimo && <span className="selo">falou {desde(mv.ultimo)}</span>}
        </div>
        {foraDoTrilho && <div className="responde">responde a {foraDoTrilho}</div>}
      </button>
    )
  }

  return (
    <div>
      {semCadeira.length > 0 && (
        <div className="an-aviso erro"><span>⛔</span><span>Entrou funcionário no mural que não tem cadeira no quadro: {semCadeira.join(', ')}. Falta desenhá-lo no equipe.mjs e no espelho do CRM.</span></div>
      )}
      <div className="an-regua">
        <div className="k"><b>{QUADRO.length}</b><span>funcionários</span></div>
        <div className="k"><b>{SETORES.length}</b><span>setores</span></div>
        <div className="k"><b>{comIA}</b><span>usam IA</span></div>
        <div className="k"><b>{semIA}</b><span>sem IA nenhuma</span></div>
        <div className="k"><b>{Object.values(estado).filter(s => s.trabalhando).length}</b><span>trabalhando agora</span></div>
      </div>

      {SETORES.map(s => {
        const gente = QUADRO.filter(p => p.setor === s.id)
        if (!gente.length) return null
        const dentro = (id: string | null) => !!id && gente.some(x => x.id === id)
        const chefes = gente.filter(p => !p.chefe || !dentro(p.chefe))
        return (
          <section key={s.id} className="an-setor">
            <div className="an-setor-cab">
              <span className="pt" style={{ width: 10, height: 10, borderRadius: '50%', background: s.cor, display: 'inline-block' }} />
              <h2>{s.nome}</h2>
              <span className="conta">{s.conta}</span>
            </div>
            <div className="an-setor-fio" style={{ ['--cor' as string]: s.cor }} />
            <div className="an-gente">
              {chefes.map(c => {
                const meus = gente.filter(x => x.chefe === c.id)
                const deFora = c.chefe && !dentro(c.chefe) ? nomeDe(c.chefe) : undefined
                return (
                  <div key={c.id} className="an-grupo">
                    <Cartao p={c} cor={s.cor} foraDoTrilho={deFora} />
                    {meus.length > 0 && <div className="an-subs">{meus.map(p => <Cartao key={p.id} p={p} cor={s.cor} />)}</div>}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      {ficha && (
        <div className="an-ficha-fundo" onClick={e => { if (e.target === e.currentTarget) setFicha(null) }}>
          <div className="an-ficha-caixa" role="dialog" aria-label={ficha.nome}>
            <h3>{ficha.nome}</h3>
            <div className="cargo2">{ficha.cargo} · {SETORES.find(s => s.id === ficha.setor)?.nome}</div>
            <dl>
              <dt>O que faz</dt><dd>{ficha.faz}</dd>
              <dt>Responde a</dt><dd>{nomeDe(ficha.chefe)}</dd>
              <dt>Alçada</dt><dd>{ficha.alcada || 'não definida'}</dd>
              <dt>Usa IA</dt><dd>{ficha.humano ? 'É uma pessoa.' : ficha.ia ? 'Sim.' : 'Não. É Node puro, e o resultado dá para conferir na unha.'}</dd>
              {ficha.arquivos.length > 0 && <><dt>Onde ele mora</dt><dd>{ficha.arquivos.map(a => <code key={a}>{a}</code>)}</dd></>}
              {movimento[ficha.id] && <><dt>No mural</dt><dd>{movimento[ficha.id].recados} recado(s), {movimento[ficha.id].naoLidos} não lido(s). Último {desde(movimento[ficha.id].ultimo)}.</dd></>}
              {estado[ficha.id] && <><dt>Agora</dt><dd>{estado[ficha.id].trabalhando ? `Trabalhando: ${estado[ficha.id].tarefa}${estado[ficha.id].alvo ? ` (${estado[ficha.id].alvo})` : ''}` : `Quieto. Último sinal ${desde(estado[ficha.id].desde)}.`}</dd></>}
            </dl>
            {ficha.nota && <div className="nota">{ficha.nota}</div>}
            <div className="an-modal-bts"><button type="button" className="an-bt" onClick={() => setFicha(null)}>Fechar</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
