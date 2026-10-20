'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Compass, Mountain, Waves, Wheat, House, Gem, TentTree, IndianRupee, type LucideIcon } from 'lucide-react'
import { CATEGORIES, getCategories, type CategoryCount } from '@/lib/marketplace'

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  offbeat: Compass,
  mountain: Mountain,
  lakeside: Waves,
  farm: Wheat,
  homestay: House,
  boutique: Gem,
  nature: TentTree,
  budget: IndianRupee,
}

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
      <style>{`
        .category-row {
          display: flex;
          gap: 14px;
          overflow-x: auto;
          padding: 6px 2px 14px;
          scroll-snap-type: x proximity;
          scrollbar-width: none;
        }
        .category-row::-webkit-scrollbar { display: none; }
        @media (min-width: 1100px) { .category-row { justify-content: center; } }
        .category-card {
          flex: 0 0 auto;
          scroll-snap-align: start;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          width: 124px;
          padding: 18px 12px 16px;
          background-color: var(--color-bg-card);
          border: 1px solid var(--color-border);
          border-radius: 14px;
          text-decoration: none;
          color: var(--color-text-primary);
          transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .category-card:hover,
        .category-card:focus-visible {
          transform: translateY(-3px);
          border-color: var(--color-terra);
          box-shadow: 0 10px 24px rgba(77, 18, 18, 0.12);
          outline: none;
        }
        .category-icon {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-terra);
          background-color: var(--color-bg-soft);
          transition: background-color 0.2s ease, color 0.2s ease;
        }
        .category-card:hover .category-icon,
        .category-card:focus-visible .category-icon {
          background-color: var(--color-terra);
          color: #f6eddc;
        }
      `}</style>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div className="category-row">
          {CATEGORIES.map(cat => {
            const count = counts[cat.value]
            const Icon = CATEGORY_ICONS[cat.value] ?? Compass
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
