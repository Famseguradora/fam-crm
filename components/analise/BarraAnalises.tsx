'use client'

// ============================================================================
//  A BARRA DO SISTEMA DE ANÁLISE, dentro do CRM
//
//  É o topo do cockpit dele (index.html), tela a tela: à esquerda a marca
//  "Análises de Crédito" com o resumo ("2 na esteira · 137 no acervo"); no
//  meio as três abas (Mesa, Recados, Gestão) com os contadores; à direita os
//  atalhos (Sala de Comando, A Equipe, Alçadas, Caixa de entrada, Sistema
//  local). "Escolher pasta", "Configurações" e "Tema claro" ficam no sistema
//  local: são gestos da máquina dele (abrir janela do Windows, trocar tema do
//  cockpit), e prometer isso aqui seria botão que não faz nada.
//
//  Ela aparece igual na tela da Mesa e na página do tomador, porque é assim
//  que o cockpit faz: a página do tomador cobre a mesa, e o topo continua lá.
//
//  Os NÚMEROS vêm do banco: quantos estão na esteira (`analise_fila`), quantos
//  recados não lidos (`analise_recados`) e quantas análises no acervo. Nada
//  aqui lê 127.0.0.1.
// ============================================================================

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { recadoLido, recadoArquivado, agruparPorEmpresa, naMesa, type Recado, type FilaRica } from '@/lib/analise/mesa'

export type AbaAnalises = 'mesa' | 'recados' | 'gestao' | 'acervo' | 'sala' | 'equipe' | 'alcadas' | 'sistema'

export interface ContagensBarra {
  esteira: number
  novidades: number
  naoLidos: number
  acervo: number
  pedidosAbertos: number
  /** o notebook deu sinal nos últimos minutos */
  vivo: boolean
}

/** Lê os números da barra. Uma ida ao banco por peça, em paralelo. */
export function useContagensBarra(): ContagensBarra {
  const [c, setC] = useState<ContagensBarra>({ esteira: 0, novidades: 0, naoLidos: 0, acervo: 0, pedidosAbertos: 0, vivo: false })

  useEffect(() => {
    let vivo = true
    const supabase = createClient()
    const ler = async () => {
      const [fila, recados, acervo, pedidos, estado] = await Promise.all([
        /* AS COLUNAS DO AGRUPAMENTO vêm junto (09/09/2026). A barra dizia
           "8 na esteira" com quatro cartões no quadro: contava PASTAS, e a
           mesa desenha EMPRESAS. Uma empresa, um número, em toda a tela. */
        supabase.from('analise_fila').select('id, criado_em, cnpj, tomador_id, nome, razao_social, pasta, situacao, caso_id, fora_do_disco_em').limit(300),
        supabase.from('analise_recados').select('id, lido_em, arquivado_em, lido_no_crm_em, arquivado_no_crm_em').limit(400),
        supabase.from('analises').select('id', { count: 'exact', head: true }).eq('vigente', true),
        supabase.from('agente_pedidos').select('id', { count: 'exact', head: true }).eq('status', 'aberto').is('decisao_crm', null),
        supabase.from('analise_estado').select('atualizado_em').eq('id', 'esteira').maybeSingle(),
      ])
      if (!vivo) return
      const rs = (recados.data ?? []) as Recado[]
      const desde = Date.now() - 24 * 3600 * 1000
      // Quem saiu da Mesa sai da conta também: a mesma `naMesa` do quadro.
      const linhas = ((fila.data ?? []) as unknown as FilaRica[]).filter(naMesa)
      /* A MESMA conta da Mesa, e pela mesma função: `agruparPorEmpresa`. A fase
         não importa aqui (só se conta quantos grupos existem), então vai uma
         constante — o que não pode é esta contagem ter regra própria. */
      const empresas = agruparPorEmpresa(linhas, () => 'entrada')
      const novas = linhas.filter(f => new Date(f.criado_em).getTime() > desde)
      const novidades = agruparPorEmpresa(novas, () => 'entrada').length
      const ultimo = estado.data?.atualizado_em ? new Date(estado.data.atualizado_em).getTime() : 0
      setC({
        esteira: empresas.length,
        novidades,
        naoLidos: rs.filter(r => !recadoLido(r) && !recadoArquivado(r)).length,
        acervo: acervo.count ?? 0,
        pedidosAbertos: pedidos.count ?? 0,
        vivo: Date.now() - ultimo < 5 * 60 * 1000,
      })
    }
    ler()
    // Os contadores acompanham a vida da esteira: o agente sincroniza a cada
    // 90 s, e a barra olha o banco na mesma cadência.
    const t = setInterval(ler, 45000)
    const canal = supabase.channel('barra-analises')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analise_recados' }, () => ler())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analise_fila' }, () => ler())
      .subscribe()
    return () => { vivo = false; clearInterval(t); supabase.removeChannel(canal) }
  }, [])

  return c
}

/* O AGENTE ESTEIRA (10/09/2026). "Tudo que eu tiver que clicar, você tem que
   inserir dentro do sistema: um botão." Substitui o PARAR AGENTES.cmd + o
   agentes.vbs. Só aparece para o proprietário e com o CRM rodando no notebook
   (a rota diz `pode_ligar`); no site publicado não há o que ligar. */
interface EstadoEsteira { pode_ligar: boolean; rodando?: boolean; desatualizada?: boolean; desde?: string | null }

function BotaoEsteira() {
  const [st, setSt] = useState<EstadoEsteira | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    let vivo = true
    fetch('/api/agentes/esteira').then(r => r.json())
      .then(j => { if (vivo && typeof j?.pode_ligar === 'boolean') setSt(j) })
      .catch(() => { /* sem resposta, sem botão */ })
    return () => { vivo = false }
  }, [])

  if (!st?.pode_ligar) return null
  const parada = !st.rodando
  const rotulo = ocupado ? (parada ? 'Ligando…' : 'Reiniciando…')
    : parada ? 'Ligar a Esteira' : st.desatualizada ? 'Atualizar a Esteira' : 'Agente Esteira'

  const clicar = async () => {
    if (!parada && !st.desatualizada && !window.confirm('A Esteira está de pé e em dia. Reiniciar mesmo assim?\n\nNão derruba análise em andamento.')) return
    setOcupado(true); setAviso('')
    try {
      const r = await fetch('/api/agentes/esteira', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reiniciar: !parada }),
      })
      const j = await r.json()
      if (!r.ok) setAviso(j.erro ?? 'Não consegui ligar a Esteira.')
      else {
        setSt({ ...st, rodando: true, desatualizada: false, desde: j.desde })
        setAviso(j.ja_estava ? 'Já estava de pé e em dia.' : j.reiniciada ? 'Reiniciada com o código de agora.' : 'Ligada, sem janela.')
      }
    } catch {
      setAviso('A conexão com o CRM caiu.')
    }
    setOcupado(false)
  }

  return (
    <>
      <button type="button" disabled={ocupado} onClick={clicar}
        className={`an-bt mini${parada ? ' azul' : st.desatualizada ? ' ouro' : ''}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 6 }}
        title={parada ? 'Liga o agente da esteira nesta máquina, sem janela. É ele que monta as pastas, faz a triagem, o cadastro e dispara a análise.'
          : st.desatualizada ? 'A Esteira está rodando um código mais velho que o de agora. Clique para reiniciar com o atual.'
            : `A Esteira está de pé${st.desde ? ` desde ${new Date(st.desde).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}.`}>
        {!parada && <span aria-hidden className="an-pulso" />}
        {rotulo}
      </button>
      {aviso && <span style={{ fontSize: 12, color: '#5a6b80', marginRight: 8 }}>{aviso}</span>}
    </>
  )
}

export default function BarraAnalises({ atual, aoTrocar, contagens }: {
  atual: AbaAnalises
  /** Quando a barra vive dentro da tela única, trocar de aba é trocar de estado.
   *  Na página do tomador não há `aoTrocar`, e cada aba vira link de volta. */
  aoTrocar?: (a: AbaAnalises) => void
  contagens: ContagensBarra
}) {
  // Funções de desenho, e não componentes: nascem a cada render de propósito
  // (elas fecham sobre `atual` e `aoTrocar`), e o React não precisa
  // reconciliá-las como tipos novos.
  const aba = (id: AbaAnalises, rotulo: string, n?: number, quente?: boolean) => {
    const conteudo = <>{rotulo}{n ? <i className={quente ? 'quente' : ''}>{n}</i> : null}</>
    const cls = `an-aba${atual === id ? ' on' : ''}`
    return aoTrocar
      ? <button key={id} type="button" className={cls} onClick={() => aoTrocar(id)}>{conteudo}</button>
      : <Link key={id} href={`/analises?aba=${id}`} className={cls}>{conteudo}</Link>
  }
  const lk = (id: AbaAnalises, rotulo: string, dica: string, ouro?: boolean) => {
    const cls = `an-lk${atual === id ? ' on' : ''}${ouro ? ' ouro' : ''}`
    return aoTrocar
      ? <button key={id} type="button" className={cls} title={dica} onClick={() => aoTrocar(id)}>{rotulo}</button>
      : <Link key={id} href={`/analises?aba=${id}`} className={cls} title={dica}>{rotulo}</Link>
  }

  return (
    <header className="mt-card an-topo">
      <div className="an-marca">
        <div className="an-marca-tit">Análises de Crédito</div>
        <div className="an-marca-sub">
          {contagens.esteira} na esteira · {contagens.acervo} no acervo
        </div>
      </div>

      <nav className="an-abas" aria-label="Análise de crédito">
        {aba('mesa', 'Mesa', contagens.novidades || contagens.esteira, contagens.novidades > 0)}
        {aba('recados', 'Recados', contagens.naoLidos)}
        {aba('gestao', 'Gestão')}
      </nav>

      <div className="an-links">
        <BotaoEsteira />
        <span className={`an-pulso${contagens.vivo ? '' : ' off'}`}
          title={contagens.vivo ? 'O agente do notebook deu sinal nos últimos minutos' : 'Sem sinal do notebook: o agente da esteira não está rodando'} />
        {lk('sala', 'Sala de Comando', 'O painel executivo, com os gráficos e a esteira ao vivo')}
        {lk('equipe', 'A Equipe', 'O organograma dos funcionários virtuais: quem faz o quê, em que setor e quem responde a quem')}
        {lk('alcadas', contagens.pedidosAbertos ? `Alçadas · ${contagens.pedidosAbertos}` : 'Alçadas',
          'O que o funcionário virtual faz sozinho e o que ele tem que pedir, e os pedidos esperando a sua autorização',
          contagens.pedidosAbertos > 0)}
        <Link href="/comercial" className="an-lk" title="Os e-mails de análise que chegaram, com os anexos">Caixa de entrada</Link>
        {lk('sistema', 'Sistema local', 'O motor embutido, quando roda nesta máquina: escolher pasta, configurações, o template')}
      </div>
    </header>
  )
}
