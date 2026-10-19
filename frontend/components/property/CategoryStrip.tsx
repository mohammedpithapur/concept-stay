'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CATEGORIES, getCategories, type CategoryCount } from '@/lib/marketplace'

/** Horizontally scrolling row of curated categories; each links to the filtered listing page. */
export default function CategoryStrip() {
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    getCategories()
      .then((rows: CategoryCount[]) => setCounts(Object.fromEntries(rows.map(r => [r.slug, r.count]))))
      .catch(() => {}) // strip still renders without counts
  }, [])

  return (
    <section aria-label="Browse by category" style={{ padding: '32px var(--page-padding) 8px', backgroundColor: 'var(--color-bg-page)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
          {CATEGORIES.map(cat => {
            const count = counts[cat.value]
            return (
              <Link
                key={cat.value}
                href={`/properties?category=${cat.value}`}
                style={{
                  flex: '0 0 auto',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  minWidth: '112px',
                  padding: '14px 16px',
                  backgroundColor: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--card-radius)',
                  textDecoration: 'none',
                  color: 'var(--color-text-primary)',
                }}
              >
                <span style={{ fontSize: '26px' }} aria-hidden="true">{cat.icon}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, textAlign: 'center' }}>{cat.label}</span>
                {count !== undefined && (
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    {count} {count === 1 ? 'stay' : 'stays'}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
