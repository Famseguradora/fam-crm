// ============================================================================
//  Comitê — Barramento de eventos "tempo real" (leve)
//  No sandbox o canal realtime do Supabase é um no-op, então propagamos as
//  mudanças de voto por:
//    1) CustomEvent na MESMA aba (atualização instantânea entre componentes)
//    2) localStorage 'storage' event para OUTRAS abas do mesmo navegador
//  Em produção o Supabase Realtime continua sendo a fonte; este barramento
//  apenas reforça a sensação de "cada voto aparece na tela de todos".
// ============================================================================

const EVT = 'comite:change'
const LS_PING = 'fam_comite_ping'

// Notifica que houve mudança no Comitê (voto, parecer, status).
export function notifyComiteChange(): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(EVT))
    // Bump de um valor qualquer dispara 'storage' nas demais abas.
    window.localStorage.setItem(LS_PING, String(window.performance.now()))
  } catch {
    /* ambiente sem window/localStorage — ignora */
  }
}

// Assina mudanças do Comitê. Retorna função de cleanup.
export function onComiteChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onEvt = () => cb()
  const onStorage = (e: StorageEvent) => { if (e.key === LS_PING) cb() }
  window.addEventListener(EVT, onEvt)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVT, onEvt)
    window.removeEventListener('storage', onStorage)
  }
}
