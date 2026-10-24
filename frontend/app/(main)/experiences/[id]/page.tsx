'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Clock, Gauge, Globe, Languages, Minus, Plus, Star, Users } from 'lucide-react'
import SlotPicker from '@/components/experiences/SlotPicker'
import Voucher from '@/components/experiences/Voucher'
import { useAuth } from '@/lib/auth/AuthContext'
import { useCurrency } from '@/lib/currency'
import { loadRazorpay } from '@/lib/razorpay'
import {
  DIFFICULTIES, EXPERIENCE_CATEGORIES, MAX_PARTY_SIZE, bookExperience, formatDuration, getExperience,
  getExperienceReviews, labelOf, quoteExperience, verifyExperiencePayment,
  type ExperienceBooking, type ExperienceDetail, type ExperienceQuote, type ExperienceReview,
} from '@/lib/experiences'

const card = {
  backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: 'var(--card-radius)', padding: '20px 24px',
} as const

export default function ExperienceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, fetchWithAuth } = useAuth()
  const { currency, format, formatMinor } = useCurrency()

  const [exp, setExp] = useState<ExperienceDetail | null>(null)
  const [reviews, setReviews] = useState<ExperienceReview[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [slotId, setSlotId] = useState<string | null>(null)
  const [party, setParty] = useState(2)
  const [quote, setQuote] = useState<ExperienceQuote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<ExperienceBooking | null>(null)

  useEffect(() => {
    let live = true
    getExperience(id)
      .then(data => {
        if (!live) return
        setExp(data)
        const first = data.slots.find(s => s.seats_left > 0)
        setSlotId(first ? first.id : null)
        if (first) setParty(Math.min(2, first.seats_left))
      })
      .catch(e => { if (live) setLoadError((e as Error).message) })
    getExperienceReviews(id).then(r => { if (live) setReviews(r) }).catch(() => undefined)
    return () => { live = false }
  }, [id])

  const slot = exp?.slots.find(s => s.id === slotId) ?? null
  const currentQuote = slot ? quote : null
  const maxParty = slot ? Math.min(MAX_PARTY_SIZE, slot.seats_left) : 1

  useEffect(() => {
    if (!slotId) return
    let live = true
    quoteExperience(id, { slot_id: slotId, party_size: party, currency })
      .then(q => { if (live) { setQuote(q); setQuoteError(null) } })
      .catch(e => { if (live) { setQuote(null); setQuoteError((e as Error).message) } })
    return () => { live = false }
  }, [id, slotId, party, currency])

  const pay = async () => {
    if (!exp || !slotId || !currentQuote) return
    if (!user) { router.push(`/login?next=${encodeURIComponent(`/experiences/${id}`)}`); return }
    setBusy(true); setPayError(null)
    try {
      const checkout = await bookExperience({ slot_id: slotId, party_size: party, currency }, fetchWithAuth)
      const Razorpay = await loadRazorpay()
      let paymentTaken = false
      await new Promise<void>((resolve, reject) => {
        const rzp = new Razorpay({
          key: checkout.key_id,
          amount: checkout.amount,
          currency: checkout.currency,
          name: 'Concept Stay',
          description: exp.title,
          order_id: checkout.razorpay_order_id,
          prefill: { name: user.full_name, email: user.email, contact: user.phone },
          theme: { color: '#a23a1f' },
          modal: { ondismiss: () => { if (!paymentTaken) reject(new Error('Payment cancelled. You have not been charged.')) } },
          handler: async response => {
            paymentTaken = true
            try {
              setConfirmed(await verifyExperiencePayment(checkout.booking.id, response, fetchWithAuth))
              resolve()
            } catch (err) {
              // The request never reached the server: the money is taken and the gateway will confirm the booking itself.
              reject(err instanceof TypeError
                ? new Error('Payment received. We are confirming your booking; check My experiences in a minute.')
                : err)
            }
          },
        })
        rzp.open()
      })
    } catch (err) {
      setPayError((err as Error).message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return <div className="page-shell" style={{ padding: '140px var(--page-padding)' }}><p role="alert" style={{ color: '#C62828' }}>{loadError}</p></div>
  }
  if (!exp) return <div className="page-shell" style={{ padding: '140px var(--page-padding)' }}>Loading…</div>

  const total = currentQuote
    ? currentQuote.charged.currency === 'INR' ? format(currentQuote.total) : formatMinor(currentQuote.charged.amount_minor, currentQuote.charged.currency)
    : ''
  const line = (inr: number) => (currentQuote && currentQuote.charged.currency !== 'INR'
    ? formatMinor(Math.round((inr / currentQuote.total) * currentQuote.charged.amount_minor), currentQuote.charged.currency)
    : format(inr))

  return (
    <div className="page-shell" style={{ backgroundColor: 'var(--color-bg-page)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '120px var(--page-padding) 64px', display: 'grid', gap: '28px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: '20px' }}>
          {exp.images[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={exp.images[0]} alt="" style={{ width: '100%', maxHeight: '380px', objectFit: 'cover', borderRadius: 'var(--card-radius)' }} />
          )}
          <div>
            <p style={{ color: 'var(--color-terra)', fontSize: '12px', letterSpacing: '3px', textTransform: 'uppercase', fontWeight: 700 }}>
              {labelOf(EXPERIENCE_CATEGORIES, exp.category)} · {exp.city}, {exp.state}
            </p>
            <h1 style={{ fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 800, margin: '6px 0 10px' }}>{exp.title}</h1>
            <p style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
              <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}><Clock size={15} aria-hidden /> {formatDuration(exp.duration_minutes)}</span>
              <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}><Gauge size={15} aria-hidden /> {labelOf(DIFFICULTIES, exp.difficulty)}</span>
              {exp.min_age > 0 && <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}><Users size={15} aria-hidden /> Ages {exp.min_age}+</span>}
              {exp.languages.length > 0 && <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}><Languages size={15} aria-hidden /> {exp.languages.join(', ')}</span>}
              {exp.review_count > 0 && <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}><Star size={15} aria-hidden /> {exp.avg_rating.toFixed(1)} ({exp.review_count})</span>}
            </p>
          </div>
          <p style={{ lineHeight: 1.8, whiteSpace: 'pre-line' }}>{exp.description}</p>
          {exp.included && (
            <div style={card}><h2 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '6px' }}>What is included</h2><p style={{ whiteSpace: 'pre-line' }}>{exp.included}</p></div>
          )}
          {exp.what_to_bring && (
            <div style={card}><h2 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '6px' }}>What to bring</h2><p style={{ whiteSpace: 'pre-line' }}>{exp.what_to_bring}</p></div>
          )}
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <Globe size={14} aria-hidden /> The exact meeting point and the operator&apos;s contact are in your voucher once you book.
          </p>
          {reviews.length > 0 && (
            <div style={card}>
              <h2 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '10px' }}>Guest reviews</h2>
              <div style={{ display: 'grid', gap: '12px' }}>
                {reviews.map((r, i) => (
                  <div key={i}>
                    <p style={{ fontWeight: 700, fontSize: '14px' }}>{r.guest_first_name} · {r.rating}/5</p>
                    {r.text && <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>{r.text}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside style={{ ...card, display: 'grid', gap: '16px', position: 'sticky', top: '100px' }}>
          {confirmed ? (
            <Voucher booking={confirmed} />
          ) : (
            <>
              <p><strong style={{ fontSize: '24px' }}>{format(exp.price_per_person)}</strong> <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>per person</span></p>
              <div>
                <h2 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '8px' }}>Choose a date</h2>
                <SlotPicker slots={exp.slots} selected={slotId} onSelect={setSlotId} />
              </div>
              {slot && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700 }}>People</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
                      <button type="button" aria-label="Remove one person" disabled={party <= 1} onClick={() => setParty(p => Math.max(1, p - 1))}
                        style={{ width: '34px', height: '34px', borderRadius: '50%', border: '1px solid var(--color-border)', backgroundColor: '#fff', cursor: 'pointer' }}><Minus size={16} aria-hidden /></button>
                      <strong aria-live="polite">{party}</strong>
                      <button type="button" aria-label="Add one person" disabled={party >= maxParty} onClick={() => setParty(p => Math.min(maxParty, p + 1))}
                        style={{ width: '34px', height: '34px', borderRadius: '50%', border: '1px solid var(--color-border)', backgroundColor: '#fff', cursor: 'pointer' }}><Plus size={16} aria-hidden /></button>
                    </span>
                  </div>
                  {currentQuote && (
                    <dl style={{ display: 'grid', gap: '6px', fontSize: '14px', margin: 0 }}>
                      {[
                        [`${format(currentQuote.price_per_person)} x ${currentQuote.party_size}`, line(currentQuote.value)],
                        ['Service fee', line(currentQuote.service_fee)],
                        ['Taxes', line(currentQuote.taxes)],
                      ].map(([label, amount]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}><dt>{label}</dt><dd style={{ margin: 0 }}>{amount}</dd></div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '8px' }}>
                        <dt>Total</dt><dd style={{ margin: 0 }}>{total}</dd>
                      </div>
                    </dl>
                  )}
                  {quoteError && <p role="alert" style={{ color: '#C62828', fontSize: '13px' }}>{quoteError}</p>}
                  {payError && <p role="alert" style={{ color: '#C62828', fontSize: '13px' }}>{payError}</p>}
                  <button
                    type="button" onClick={pay} disabled={busy || !currentQuote}
                    style={{ padding: '14px 20px', border: 'none', borderRadius: 'var(--btn-radius)', backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', fontWeight: 800, fontSize: '14px', cursor: busy || !currentQuote ? 'not-allowed' : 'pointer', opacity: busy || !currentQuote ? 0.6 : 1 }}
                  >
                    {busy ? 'Processing…' : currentQuote ? `Pay ${total}` : 'Pay'}
                  </button>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Your booking is final once paid. Instant confirmation, no operator approval needed.</p>
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
