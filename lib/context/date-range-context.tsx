'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface DateRangeCtx {
  dataInicio: string   // 'YYYY-MM-DD' ou ''
  setDataInicio: (v: string) => Promise<void>
  isFiltered: boolean
  carregando: boolean
}

const DateRangeContext = createContext<DateRangeCtx>({
  dataInicio: '',
  setDataInicio: async () => {},
  isFiltered: false,
  carregando: true,
})

export function DateRangeProvider({
  children,
  initialDate,
}: {
  children: React.ReactNode
  initialDate: string | null
}) {
  const [dataInicio, setDataInicioState] = useState<string>(initialDate ?? '')
  const [carregando, setCarregando] = useState(false)

  // Sincroniza se o valor inicial mudar entre navegações (SSR → client)
  useEffect(() => {
    setDataInicioState(initialDate ?? '')
  }, [initialDate])

  const setDataInicio = useCallback(async (v: string) => {
    setCarregando(true)
    const supabase = createClient()
    await supabase
      .from('configuracoes_sistema')
      .update({ valor: v || null, updated_at: new Date().toISOString() })
      .eq('chave', 'data_inicio_calculos')
    setDataInicioState(v)
    setCarregando(false)
  }, [])

  return (
    <DateRangeContext.Provider value={{
      dataInicio,
      setDataInicio,
      isFiltered: !!dataInicio,
      carregando,
    }}>
      {children}
    </DateRangeContext.Provider>
  )
}

export const useDateRange = () => useContext(DateRangeContext)
