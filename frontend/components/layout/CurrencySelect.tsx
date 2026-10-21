'use client'

import { Globe } from 'lucide-react'
import { useCurrency } from '@/lib/currency'

/** Lets international guests pay in their own currency. Hidden until the server offers more than rupees. */
export default function CurrencySelect() {
  const { currency, setCurrency, rates } = useCurrency()
  const options = rates ? rates.supported.filter(c => rates.rates[c] !== undefined) : []
  if (options.length < 2) return null

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--color-text-primary)' }}>
      <Globe size={14} aria-hidden />
      <select
        aria-label="Currency"
        value={currency}
        onChange={e => setCurrency(e.target.value)}
        style={{ border: '1px solid var(--color-border)', borderRadius: '6px', padding: '4px 6px', backgroundColor: 'transparent', fontSize: '13px', fontWeight: 600 }}
      >
        {options.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  )
}
