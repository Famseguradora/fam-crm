// ============================================================================
//  Tomadores › Equipe — o chão de fábrica dos funcionários virtuais
//
//  A tela abre JÁ SABENDO quem está trabalhando, e é por isso que existe este
//  componente de servidor: o Realtime só entrega o que acontece DEPOIS que a
//  pessoa entrou. Sem esta carga inicial, quem abre no meio de uma análise
//  veria um escritório vazio e concluiria, com razão, que nada funciona.
//
//  Ler é de todo autenticado (a RLS diz `select ... to authenticated using
//  true`): o ponto do pedido dele é a equipe VER o trabalho acontecer.
// ============================================================================
import { createClient } from '@/lib/supabase/server'
import ChaoDeFabrica from './ChaoDeFabrica'
import type { EventoAgente } from '@/lib/analise/equipe'

// O chão de fábrica é o "agora": nada aqui pode vir de cache.
export const dynamic = 'force-dynamic'

/** Janela da carga inicial. Maior que o teto de 10 min que apaga o avatar, para
 *  a coluna de "últimos movimentos" ter o que contar quando a casa está quieta. */
const MINUTOS = 60

export default async function EquipePage() {
  const supabase = await createClient()

  const desde = new Date(Date.now() - MINUTOS * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('agente_eventos')
    .select('id, agente, acao, tarefa, alvo, detalhe, criado_em')
    .gte('criado_em', desde)
    .order('criado_em', { ascending: false })
    .limit(200)

  // Erro de leitura não pode derrubar a tela: ela abre vazia e o Realtime a
  // enche assim que o primeiro evento chegar.
  const inicial = (error ? [] : (data ?? [])) as EventoAgente[]

  return (
    <div style={{ padding: '20px 22px 40px', maxWidth: 1240, margin: '0 auto' }}>
      <ChaoDeFabrica inicial={inicial} />
    </div>
  )
}
