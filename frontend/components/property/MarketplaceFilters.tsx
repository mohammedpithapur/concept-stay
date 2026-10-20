'use client'

import { EXPERIENCE_TAGS, FILTER_AMENITIES, PROPERTY_TYPES } from '@/lib/marketplace'

export type MarketplaceFilterState = {
  types: string[]
  experiences: string[]
  amenities: string[]
  verifiedOnly: boolean
}

export const EMPTY_MARKETPLACE_FILTERS: MarketplaceFilterState = {
  types: [], experiences: [], amenities: [], verifiedOnly: false,
}

type Props = {
  value: MarketplaceFilterState
  onChange: (next: MarketplaceFilterState) => void
}

const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter(x => x !== item) : [...list, item])

const labelStyle = {
  fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase' as const,
  color: 'var(--color-text-muted)', display: 'block', marginBottom: '12px', fontWeight: 600,
}

function Chips({ options, selected, onToggle }: {
  options: readonly { value: string; label: string }[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {options.map(o => {
        const on = selected.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            aria-pressed={on}
            style={{
              padding: '8px 12px',
              border: `1px solid ${on ? 'var(--color-terra)' : 'var(--color-border)'}`,
              borderRadius: '999px',
              backgroundColor: on ? 'var(--color-brand)' : 'transparent',
              color: 'var(--color-on-accent)',
              fontSize: '13px',
              fontWeight: on ? 700 : 400,
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Marketplace filters sent to the API (stay type, experience, amenities, verified-only). */
export default function MarketplaceFilters({ value, onChange }: Props) {
  return (
    <>
      <div>
        <label style={labelStyle}>Stay type</label>
        <Chips options={PROPERTY_TYPES} selected={value.types} onToggle={v => onChange({ ...value, types: toggle(value.types, v) })} />
      </div>

      <div>
        <label style={labelStyle}>Experience</label>
        <Chips options={EXPERIENCE_TAGS} selected={value.experiences} onToggle={v => onChange({ ...value, experiences: toggle(value.experiences, v) })} />
      </div>

      <div>
        <label style={labelStyle}>Amenities</label>
        <Chips
          options={FILTER_AMENITIES.map(a => ({ value: a, label: a }))}
          selected={value.amenities}
          onToggle={v => onChange({ ...value, amenities: toggle(value.amenities, v) })}
        />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={value.verifiedOnly}
          onChange={e => onChange({ ...value, verifiedOnly: e.target.checked })}
        />
        Concept Verified stays only
      </label>
    </>
  )
}
