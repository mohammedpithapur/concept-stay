'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import ExperienceCard from '@/components/experiences/ExperienceCard'
import {
  EXPERIENCE_CATEGORIES, listExperiences, type ExperienceList,
} from '@/lib/experiences'

const field = {
  padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--input-radius)',
  fontSize: '14px', backgroundColor: '#ffffff', color: 'var(--color-text-primary)',
} as const

export default function ExperiencesClient() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const city = params.get('city') ?? ''
  const category = params.get('category') ?? ''
  const date = params.get('date') ?? ''
  const maxPrice = params.get('max_price') ?? ''
  const sort = (params.get('sort') ?? 'newest') as 'newest' | 'price_asc' | 'price_desc'

  const [cityText, setCityText] = useState(city)
  const [result, setResult] = useState<ExperienceList | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    router.replace(`${pathname}${next.toString() ? `?${next}` : ''}`)
  }

  useEffect(() => {
    let live = true
    listExperiences({ city, category, date, max_price: maxPrice, sort })
      .then(data => { if (live) { setResult(data); setError(null) } })
      .catch(e => { if (live) setError((e as Error).message) })
    return () => { live = false }
  }, [city, category, date, maxPrice, sort])

  return (
    <div className="page-shell" style={{ backgroundColor: 'var(--color-bg-page)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '120px var(--page-padding) 64px' }}>
        <p style={{ color: 'var(--color-terra)', fontSize: '12px', letterSpacing: '4px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '8px' }}>
          Experiences
        </p>
        <h1 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, marginBottom: '8px' }}>Things to do, led by locals</h1>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px', maxWidth: '640px' }}>
          Book a spot on a trek, a food walk or a local journey. No stay needed: if you are already here, pick an open date.
        </p>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }} role="group" aria-label="Category">
          {[{ value: '', label: 'All' }, ...EXPERIENCE_CATEGORIES].map(c => {
            const active = category === c.value
            return (
              <button
                key={c.value || 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => setParam('category', c.value)}
                style={{
                  padding: '8px 16px', borderRadius: '999px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${active ? 'var(--color-brand)' : 'var(--color-border)'}`,
                  backgroundColor: active ? 'var(--color-brand)' : '#ffffff',
                  color: active ? 'var(--color-on-accent)' : 'var(--color-text-primary)',
                }}
              >
                {c.label}
              </button>
            )
          })}
        </div>

        <form
          onSubmit={e => { e.preventDefault(); setParam('city', cityText.trim()) }}
          style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '28px' }}
        >
          <input aria-label="City" placeholder="City" value={cityText} onChange={e => setCityText(e.target.value)} style={{ ...field, minWidth: '160px' }} />
          <input aria-label="Date" type="date" value={date} onChange={e => setParam('date', e.target.value)} style={field} />
          <input
            aria-label="Maximum price per person" type="number" min={0} placeholder="Max price" value={maxPrice}
            onChange={e => setParam('max_price', e.target.value)} style={{ ...field, width: '130px' }}
          />
          <select aria-label="Sort" value={sort} onChange={e => setParam('sort', e.target.value)} style={field}>
            <option value="newest">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
          </select>
          <button type="submit" style={{ ...field, cursor: 'pointer', fontWeight: 700 }}>Search</button>
        </form>

        {error && <p role="alert" style={{ color: '#C62828' }}>{error}</p>}
        {!result && !error && <p>Loading…</p>}
        {result && result.items.length === 0 && (
          <p style={{ color: 'var(--color-text-secondary)' }}>No experiences match yet. Try another category or date.</p>
        )}
        {result && result.items.length > 0 && (
          <div style={{ display: 'grid', gap: '20px', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {result.items.map(exp => <ExperienceCard key={exp.id} experience={exp} />)}
          </div>
        )}
      </div>
    </div>
  )
}
