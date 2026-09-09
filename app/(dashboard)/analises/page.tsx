'use client'

export const dynamic = 'force-dynamic'

// ============================================================================
//  ANÁLISES DE CRÉDITO  ·  /analises  ·  O SISTEMA INTEIRO, NUMA TELA
//
//  Ordem dele em 08/09/2026, com o cockpit na mão: "utilize TODAS AS
//  FUNCIONALIDADES do Sistema de Análise de Crédito e incorpore dentro do
//  CRM: a Mesa, os Recados, a Equipe, e o que tem dentro do card do tomador".
//
//  A tela é o cockpit do Sistema de Análise, peça por peça, com a pele do CRM:
//
//     a barra ....... Análises de Crédito · Mesa · Recados · Gestão
//                     Sala de Comando · A Equipe · Alçadas · Caixa de entrada · Sistema local
//     Mesa .......... a faixa de comando, a execução ao vivo, Kanban/Tabela/Galeria
//     Recados ....... o mural dos funcionários virtuais, lido como e-mail
//     Gestão ........ o retrato do acervo
//     Acervo ........ as análises publicadas (a porta é o cartão "No acervo")
//     Sala .......... o painel executivo com a esteira ao vivo
//     Equipe ........ o organograma por setor
//     Alçadas ....... o que o agente pode, e o que espera autorização
//     Sistema local . o motor embutido, quando roda nesta máquina
//
//  E clicar num tomador da Mesa abre o CARD dele (`/analises/mesa/<id>`), com
//  as sete abas do cockpit.
//
//  NADA AQUI LÊ 127.0.0.1 para encher tela. O dado vem do banco do CRM, e
//  quem o leva para lá é o agente do notebook (`node scripts/esteira.mjs`).
//  O que só faz sentido na máquina dele (o template, escolher pasta, as
//  configurações) fica na aba Sistema local, que é o cockpit embutido.
// ============================================================================

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import EstiloAnalises from '@/components/analise/Estilo'
import BarraAnalises, { useContagensBarra, type AbaAnalises } from '@/components/analise/BarraAnalises'
import Mesa from '@/components/analise/Mesa'
import Recados from '@/components/analise/Recados'
import Gestao from '@/components/analise/Gestao'
import Acervo from '@/components/analise/Acervo'
import Sala from '@/components/analise/Sala'
import Equipe from '@/components/analise/Equipe'
import Alcadas from '@/components/analise/Alcadas'
import SistemaLocal from '@/components/analise/SistemaLocal'
import IaGestao from '@/components/analise/IaGestao'

const ABAS: AbaAnalises[] = ['mesa', 'recados', 'gestao', 'acervo', 'sala', 'equipe', 'alcadas', 'sistema']
const TITULO: Record<AbaAnalises, [string, string]> = {
  mesa: ['A Mesa', 'O que está andando, o que travou e o que precisa de gente. Clique num tomador para abrir o card dele.'],
  recados: ['Recados', 'O mural onde os funcionários virtuais falam com você. Recado não some sozinho e não se repete.'],
  gestao: ['Gestão', 'O retrato do acervo: o que entrou, o que foi decidido, onde está a concentração.'],
  acervo: ['Acervo', 'As análises publicadas no banco, com os números do período.'],
  sala: ['Sala de Comando', 'O painel executivo, com a esteira ao vivo.'],
  equipe: ['A Equipe', 'O organograma dos funcionários virtuais: quem faz o quê, em que setor e quem responde a quem.'],
  alcadas: ['Alçadas', 'O que o funcionário virtual faz sozinho e o que ele tem que pedir, e os pedidos esperando a sua autorização.'],
  sistema: ['Sistema local', 'O motor embutido, quando roda nesta máquina: escolher pasta, configurações, o template.'],
}

export default function AnaliseCreditoPage() {
  const router = useRouter()
  const params = useSearchParams()
  const [aba, setAba] = useState<AbaAnalises>('mesa')
  const [nome, setNome] = useState<string | null>(null)
  const contagens = useContagensBarra()

  // A aba na URL, para o link do menu e o favorito caírem no lugar certo.
  useEffect(() => {
    const q = params.get('aba') as AbaAnalises | null
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q && ABAS.includes(q)) setAba(q)
  }, [params])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle().then(({ data }) => setNome(data?.nome ?? user.email ?? null))
    })
  }, [])

  const trocar = (nova: AbaAnalises) => {
    setAba(nova)
    router.replace(`/analises?aba=${nova}`, { scroll: false })
  }

  const [tit, sub] = TITULO[aba]

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 20px) clamp(10px, 2.5vw, 28px) 30px' }}>
      <EstiloAnalises />
      <BarraAnalises atual={aba} aoTrocar={trocar} contagens={contagens} />

      <div style={{ margin: '14px 0 6px' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0a1628', margin: 0 }}>{tit}</h1>
        <div style={{ fontSize: 12.5, color: '#6080a0', marginTop: 2 }}>{sub}</div>
      </div>

      {/* A Mesa fica montada e escondida: trocar de aba não pode recomeçar a
          carga do banco a cada clique. As outras montam quando pedidas. */}
      <div hidden={aba !== 'mesa'}><Mesa aoAbrirAcervo={() => trocar('acervo')} /></div>
      {aba === 'recados' && <Recados nomeUsuario={nome} />}
      {aba === 'gestao' && <Gestao aoAbrirSistema={() => trocar('sistema')} />}
      {aba === 'acervo' && <Acervo />}
      {aba === 'sala' && <Sala aoAbrirMesa={() => trocar('mesa')} />}
      {aba === 'equipe' && <Equipe />}
      {aba === 'alcadas' && <Alcadas nomeUsuario={nome} />}
      {aba === 'sistema' && <SistemaLocal />}

      {/* A IA que olha o acervo inteiro. Fica na tela toda, e não numa aba:
          a pergunta dele costuma nascer olhando a lista. */}
      <IaGestao />
    </div>
  )
}
