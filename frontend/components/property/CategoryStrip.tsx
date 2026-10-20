'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Compass } from 'lucide-react'
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
    <section aria-label="Browse by category" style={{ padding: '36px var(--page-padding) 12px', backgroundColor: 'transparent' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div className="category-row">
          {CATEGORIES.map(cat => {
            const count = counts[cat.value]
            const Icon = cat.icon ?? Compass
            return (
              <Link key={cat.value} href={`/properties?category=${cat.value}`} className="category-card">
                <span className="category-icon" aria-hidden="true">
                  <Icon size={22} strokeWidth={1.75} />
                </span>
                <span style={{ fontSize: '13px', fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>{cat.label}</span>
                {count !== undefined && (
                  <span style={{ fontSize: '11px', letterSpacing: '0.04em', color: 'var(--color-text-muted)', marginTop: '-4px' }}>
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
