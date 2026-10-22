'use client'

import { formatStart, type PublicSlot } from '@/lib/experiences'

type Props = { slots: PublicSlot[]; selected: string | null; onSelect: (id: string) => void }

/** Dated departures to choose from. A slot with no seats left is shown but cannot be chosen. */
export default function SlotPicker({ slots, selected, onSelect }: Props) {
  if (slots.length === 0) {
    return <p style={{ color: 'var(--color-text-secondary)' }}>No open dates right now. Please check back soon.</p>
  }
  return (
    <div style={{ display: 'grid', gap: '8px' }} role="group" aria-label="Choose a date">
      {slots.map(slot => {
        const soldOut = slot.seats_left <= 0
        const active = selected === slot.id
        return (
          <button
            key={slot.id}
            type="button"
            disabled={soldOut}
            aria-pressed={active}
            onClick={() => onSelect(slot.id)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', textAlign: 'left',
              padding: '12px 14px', borderRadius: 'var(--input-radius)', fontSize: '14px', fontWeight: 600,
              border: `2px solid ${active ? 'var(--color-brand)' : 'var(--color-border)'}`,
              backgroundColor: active ? 'var(--color-bg-soft)' : '#ffffff', color: 'var(--color-text-primary)',
              cursor: soldOut ? 'not-allowed' : 'pointer', opacity: soldOut ? 0.55 : 1,
            }}
          >
            <span>{formatStart(slot.starts_at)}</span>
            <span style={{ fontSize: '12px', color: soldOut ? '#C62828' : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
              {soldOut ? 'Sold out' : `${slot.seats_left} seats left`}
            </span>
          </button>
        )
      })}
    </div>
  )
}
