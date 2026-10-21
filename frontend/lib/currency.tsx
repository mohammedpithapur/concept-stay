'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getFxRates, type FxRates } from '@/lib/marketplace'

const STORAGE_KEY = 'conceptstay_currency'

type CurrencyContextValue = {
  currency: string
  setCurrency: (c: string) => void
  rates: FxRates | null
  /** Rupees as an amount in the selected currency, e.g. "$222.43". Falls back to rupees until rates load. */
  format: (inr: number) => string
  /** Minor units (cents) as text in the given currency, e.g. "USD 222.43". */
  formatMinor: (minor: number, currency: string) => string
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null)

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState('INR')
  const [rates, setRates] = useState<FxRates | null>(null)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved) setCurrencyState(saved)
    } catch { /* storage unavailable (private window): stay on INR */ }
    getFxRates().then(setRates).catch(() => setRates(null))
  }, [])

  // A saved currency the server no longer offers must not stick.
  const active = rates && rates.rates[currency] === undefined ? 'INR' : currency

  const setCurrency = useCallback((c: string) => {
    setCurrencyState(c)
    try { window.localStorage.setItem(STORAGE_KEY, c) } catch { /* ignore */ }
  }, [])

  const value = useMemo<CurrencyContextValue>(() => ({
    currency: active,
    setCurrency,
    rates,
    format: inr => {
      const rate = rates?.rates[active]
      if (active === 'INR' || !rate) return `₹${inr.toLocaleString('en-IN')}`
      return new Intl.NumberFormat('en', { style: 'currency', currency: active }).format(inr * rate)
    },
    formatMinor: (minor, cur) => `${cur} ${(minor / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  }), [active, setCurrency, rates])

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency must be used inside <CurrencyProvider>')
  return ctx
}
