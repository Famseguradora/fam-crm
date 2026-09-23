'use client'

/* LEMBRAR A TELA COMO A PESSOA DEIXOU  ·  18/09/2026
   ═══════════════════════════════════════════════════════════════════════════

   Ordem do Marco: "a forma que eu sair dessa página é a mesma forma que
   quando eu voltar" — a aba em que estava, e o que ele ocultou, tem que
   continuar do jeito que deixou.

   GUARDADO NO NAVEGADOR, E NÃO NO BANCO: é "como eu deixei esta tela", não
   dado da FAM, e não precisa seguir a pessoa para outro computador. Mesma
   régua de `useJanela` (lib/ui/janela.ts) e do painel da IA Gestor
   (`localStorage.getItem(CHAVE_CAIXA)`), só que genérico: aqui é para
   qualquer valor pequeno (uma aba, um "mostrar/ocultar"), não só o tamanho
   de uma janela flutuante.

   `useSyncExternalStore`, E NÃO `useState` + `useEffect`. O Next renderiza
   esta tela no servidor primeiro, onde `localStorage` não existe: ler o
   valor guardado já no primeiro render do cliente faz o HTML dele discordar
   do HTML do servidor (hydration mismatch) sempre que a pessoa tinha
   guardado algo diferente do padrão — foi medido aqui: abrir a aba Painel,
   dar F5, e a tela voltava para "Fila do dia" com um erro de hidratação no
   console antes de se corrigir sozinha. Trocar o valor de dentro de um
   `useEffect` tira o erro de hidratação mas troca por outro problema (o lint
   do projeto barra `setState` dentro de efeito, e com razão: é uma renderização
   a mais, sempre). `useSyncExternalStore` é a peça do React feita para isto —
   sincronizar com algo de fora (aqui, o navegador) sem nenhum dos dois. */

import { useCallback, useSyncExternalStore } from 'react'

/* Só primitivo (string, número, booleano). `useSyncExternalStore` compara o
   retorno de `getSnapshot` por igualdade referencial a cada render; devolver
   um objeto ou array NOVO a cada leitura pareceria "mudou sempre" e entraria
   em laço. Toda aba e todo "mostrar/ocultar" desta tela é primitivo — o dia
   em que precisar guardar algo maior, isto merece um cuidado à parte. */
type Primitivo = string | number | boolean

const ouvintes = new Map<string, Set<() => void>>()

function inscrever(chave: string, ouvir: () => void): () => void {
  let s = ouvintes.get(chave)
  if (!s) { s = new Set(); ouvintes.set(chave, s) }
  s.add(ouvir)
  return () => { s!.delete(ouvir); if (!s!.size) ouvintes.delete(chave) }
}

function avisar(chave: string) {
  ouvintes.get(chave)?.forEach((f) => f())
}

/**
 * Lembra um pedaço pequeno de estado de tela entre uma visita e outra.
 *
 * `valido`, quando passado, recusa um valor salvo que não faz mais sentido
 * (por exemplo, uma aba que o código de hoje não tem mais) e volta ao
 * padrão, em vez de quebrar a tela com um estado que ninguém previu.
 */
export function useLembrado<T extends Primitivo>(
  chave: string,
  padrao: T,
  valido?: (v: unknown) => v is T,
): [T, (v: T | ((antes: T) => T)) => void] {
  const ler = useCallback((): T => {
    if (typeof window === 'undefined') return padrao
    try {
      const cru = localStorage.getItem(chave)
      if (cru === null) return padrao
      const lido = JSON.parse(cru) as unknown
      return !valido || valido(lido) ? (lido as T) : padrao
    } catch {
      return padrao
    }
  }, [chave, padrao, valido])

  const valor = useSyncExternalStore(
    (ouvir) => inscrever(chave, ouvir),
    ler,
    () => padrao, // o retrato do servidor: sempre o padrão, nunca o navegador
  )

  const salvar = useCallback((v: T | ((antes: T) => T)) => {
    const novo = typeof v === 'function' ? (v as (antes: T) => T)(ler()) : v
    try { localStorage.setItem(chave, JSON.stringify(novo)) } catch { /* navegador sem storage: a tela segue, só não lembra */ }
    avisar(chave)
  }, [chave, ler])

  return [valor, salvar]
}
