'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import type { MyBooking } from '@/lib/api'
import type { Property } from '@/lib/types'
import {
  CANCELLATION_POLICIES, cancelMyBooking, getRefundPreview, submitReview,
  type RefundPreview, type VerifiedReviewInput,
} from '@/lib/marketplace'

const CATEGORY_FIELDS = ['cleanliness', 'location', 'comfort', 'hospitality', 'accuracy'] as const

const buttonBase = {
  padding: '10px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 as const, cursor: 'pointer',
}

const todayIso = () => new Date().toISOString().slice(0, 10)

type Props = {
  booking: MyBooking
  property: Property | null
  onChanged: () => void
}

/** Cancel (with the exact refund shown first) and review actions for one of the guest's bookings. */
export default function BookingActions({ booking, property, onChanged }: Props) {
  const { fetchWithAuth } = useAuth()
  const [preview, setPreview] = useState<RefundPreview | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [review, setReview] = useState<VerifiedReviewInput>({
    cleanliness: 5, location: 5, comfort: 5, hospitality: 5, accuracy: 5, would_recommend: true, comment: '',
  })

  const stayOver = booking.status === 'completed' ||
    (booking.status === 'confirmed' && booking.payment_status === 'paid' && booking.check_out <= todayIso())
  const cancellable = (booking.status === 'confirmed' || booking.status === 'pending') && !stayOver

  useEffect(() => {
    if (!cancellable) return
    getRefundPreview(booking.id, fetchWithAuth).then(setPreview).catch(() => setPreview(null))
  }, [booking.id, cancellable, fetchWithAuth])

  const policy = CANCELLATION_POLICIES[preview?.policy ?? property?.cancellation_policy ?? 'flexible']
  const money = (n: number) => `₹${n.toLocaleString('en-IN')}`

  const doCancel = async () => {
    setBusy(true); setError(null)
    try {
      const res = await cancelMyBooking(booking.id, fetchWithAuth)
      setMessage(res.refund_amount > 0 ? `Booking cancelled. ${money(res.refund_amount)} will be refunded to your original payment method.` : 'Booking cancelled.')
      setConfirming(false)
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const doReview = async () => {
    setBusy(true); setError(null)
    try {
      await submitReview(booking.id, { ...review, comment: review.comment?.trim() || undefined }, fetchWithAuth)
      setMessage('Thank you! Your review has been published.')
      setReviewOpen(false)
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: '16px', backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-gold)', borderRadius: '8px', padding: '14px 16px' }}>
      <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
        <strong>Cancellation policy: {policy.label}.</strong> {policy.summary}
      </p>

      {message && <p role="status" style={{ marginTop: '10px', fontSize: '13px', fontWeight: 600, color: '#2E7D32' }}>{message}</p>}
      {error && <p role="alert" style={{ marginTop: '10px', fontSize: '13px', color: '#C62828' }}>{error}</p>}

      {cancellable && preview?.can_cancel && !confirming && (
        <button
          onClick={() => setConfirming(true)}
          style={{ ...buttonBase, marginTop: '12px', border: '1px solid #C62828', backgroundColor: 'transparent', color: '#C62828' }}
        >
          Cancel booking
        </button>
      )}

      {confirming && preview && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '10px' }}>
            {preview.total_paid === 0
              ? 'This booking has not been paid, so nothing will be charged or refunded.'
              : preview.refund_amount > 0
                ? `You will be refunded ${money(preview.refund_amount)} of the ${money(preview.total_paid)} you paid.`
                : `No refund applies: this cancellation falls outside the refund window (you paid ${money(preview.total_paid)}).`}
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={doCancel}
              disabled={busy}
              style={{ ...buttonBase, border: 'none', backgroundColor: '#C62828', color: '#ffffff', opacity: busy ? 0.6 : 1 }}
            >
              {busy ? 'Cancelling…' : 'Yes, cancel booking'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              style={{ ...buttonBase, border: '1px solid var(--color-border)', backgroundColor: '#ffffff', color: 'var(--color-text-primary)' }}
            >
              Keep booking
            </button>
          </div>
        </div>
      )}

      {stayOver && !reviewOpen && !message && (
        <button
          onClick={() => setReviewOpen(true)}
          style={{ ...buttonBase, marginTop: '12px', border: 'none', backgroundColor: 'var(--color-gold)', color: 'var(--color-text-primary)' }}
        >
          Rate your stay
        </button>
      )}

      {reviewOpen && (
        <div style={{ marginTop: '14px', display: 'grid', gap: '12px' }}>
          {CATEGORY_FIELDS.map(field => (
            <label key={field} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', fontSize: '13px', textTransform: 'capitalize' }}>
              {field}
              <select
                value={review[field]}
                onChange={e => setReview({ ...review, [field]: Number(e.target.value) })}
                style={{ padding: '6px 28px 6px 10px', border: '1px solid var(--color-border)', fontSize: '13px' }}
              >
                {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} {n === 1 ? 'star' : 'stars'}</option>)}
              </select>
            </label>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={review.would_recommend}
              onChange={e => setReview({ ...review, would_recommend: e.target.checked })}
            />
            I would recommend this stay
          </label>
          <textarea
            value={review.comment}
            onChange={e => setReview({ ...review, comment: e.target.value })}
            maxLength={4000}
            rows={3}
            placeholder="Tell future guests about your stay (optional)"
            style={{ width: '100%', padding: '10px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '13px', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={doReview}
              disabled={busy}
              style={{ ...buttonBase, border: 'none', backgroundColor: 'var(--color-gold)', color: 'var(--color-text-primary)', opacity: busy ? 0.6 : 1 }}
            >
              {busy ? 'Submitting…' : 'Submit review'}
            </button>
            <button
              onClick={() => setReviewOpen(false)}
              disabled={busy}
              style={{ ...buttonBase, border: '1px solid var(--color-border)', backgroundColor: '#ffffff', color: 'var(--color-text-primary)' }}
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
