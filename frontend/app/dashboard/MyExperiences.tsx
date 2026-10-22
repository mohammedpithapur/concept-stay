'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Compass } from 'lucide-react'
import Voucher from '@/components/experiences/Voucher'
import { useAuth } from '@/lib/auth/AuthContext'
import { formatStart, myExperienceBookings, reviewExperienceBooking, type ExperienceBooking } from '@/lib/experiences'

const STATUS_TEXT: Record<ExperienceBooking['status'], string> = {
  pending: 'Awaiting payment', confirmed: 'Confirmed', completed: 'Completed',
  failed_full: 'Refunded: slot was full', expired: 'Expired', refunded: 'Refunded',
}

function ReviewForm({ booking, onDone }: { booking: ExperienceBooking; onDone: () => void }) {
  const { fetchWithAuth } = useAuth()
  const [rating, setRating] = useState(5)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      await reviewExperienceBooking(booking.id, { rating, text }, fetchWithAuth)
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: '8px', marginTop: '8px' }}>
      <label style={{ fontSize: '13px', fontWeight: 700 }}>
        Rating{' '}
        <select value={rating} onChange={e => setRating(Number(e.target.value))} aria-label="Rating" style={{ marginLeft: '6px' }}>
          {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} of 5</option>)}
        </select>
      </label>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="How was it?" aria-label="Your review"
        style={{ padding: '10px', border: '1px solid var(--color-border)', borderRadius: 'var(--input-radius)', fontSize: '14px' }} />
      {error && <p role="alert" style={{ color: '#C62828', fontSize: '13px' }}>{error}</p>}
      <button type="button" onClick={submit} disabled={busy}
        style={{ justifySelf: 'start', padding: '8px 16px', border: 'none', borderRadius: 'var(--btn-radius)', backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', fontWeight: 700, cursor: 'pointer' }}>
        {busy ? 'Sending…' : 'Send review'}
      </button>
    </div>
  )
}

/** Dashboard tab: the guest's experience bookings, with vouchers once confirmed and a review box after the slot started. */
export default function MyExperiences() {
  const { fetchWithAuth } = useAuth()
  const [bookings, setBookings] = useState<ExperienceBooking[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())
  const [now] = useState(() => Date.now())

  const load = useCallback(() => {
    myExperienceBookings(fetchWithAuth).then(setBookings).catch(e => setError((e as Error).message))
  }, [fetchWithAuth])

  useEffect(load, [load])

  if (error) return <p role="alert" style={{ color: '#C62828' }}>{error}</p>
  if (!bookings) return <p>Loading…</p>
  if (bookings.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <Compass size={36} aria-hidden style={{ color: 'var(--color-text-muted)' }} />
        <p style={{ margin: '12px 0' }}>You have not booked an experience yet.</p>
        <Link href="/experiences" style={{ color: 'var(--color-terra)', fontWeight: 700 }}>Browse experiences</Link>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      {bookings.map(b => {
        const started = new Date(b.starts_at).getTime() <= now
        const canReview = (b.status === 'confirmed' || b.status === 'completed') && started && !reviewed.has(b.id)
        return (
          <div key={b.id} style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: 'var(--card-radius)', padding: '18px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontWeight: 800, fontSize: '17px' }}>{b.experience_title}</p>
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{formatStart(b.starts_at)} · {b.party_size} {b.party_size === 1 ? 'person' : 'people'}</p>
              </div>
              <span style={{ alignSelf: 'start', backgroundColor: 'var(--color-bg-soft)', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                {STATUS_TEXT[b.status]}
              </span>
            </div>
            {(b.status === 'confirmed' || b.status === 'completed') && (
              <div style={{ marginTop: '12px' }}><Voucher booking={b} /></div>
            )}
            {canReview && (reviewing === b.id
              ? <ReviewForm booking={b} onDone={() => { setReviewed(prev => new Set(prev).add(b.id)); setReviewing(null) }} />
              : <button type="button" onClick={() => setReviewing(b.id)} style={{ marginTop: '10px', background: 'none', border: 'none', color: 'var(--color-terra)', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Write a review</button>
            )}
          </div>
        )
      })}
    </div>
  )
}
