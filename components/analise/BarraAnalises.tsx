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
import { recadoLido, recadoArquivado, type Recado } from '@/lib/analise/mesa'

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
        supabase.from('analise_fila').select('id, criado_em', { count: 'exact' }),
        supabase.from('analise_recados').select('id, lido_em, arquivado_em, lido_no_crm_em, arquivado_no_crm_em').limit(400),
        supabase.from('analises').select('id', { count: 'exact', head: true }).eq('vigente', true),
        supabase.from('agente_pedidos').select('id', { count: 'exact', head: true }).eq('status', 'aberto').is('decisao_crm', null),
        supabase.from('analise_estado').select('atualizado_em').eq('id', 'esteira').maybeSingle(),
      ])
      if (!vivo) return
      const rs = (recados.data ?? []) as Recado[]
      const desde = Date.now() - 24 * 3600 * 1000
      const novidades = (fila.data ?? []).filter(f => new Date(f.criado_em).getTime() > desde).length
      const ultimo = estado.data?.atualizado_em ? new Date(estado.data.atualizado_em).getTime() : 0
      setC({
        esteira: fila.count ?? fila.data?.length ?? 0,
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
