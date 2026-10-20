'use client'
export const dynamic = 'force-dynamic'
import React, { useEffect, useState, useRef, Suspense, Component } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { buildApiUrl, createBooking, createPaymentOrder, verifyPayment } from '@/lib/api'
import { useAuth } from '@/lib/auth/AuthContext'
import type { Property } from '@/lib/types'
import { CANCELLATION_POLICIES, getPriceQuote, type PriceQuote } from '@/lib/marketplace'
import { AlertTriangle } from 'lucide-react'

// ── Razorpay type declarations ────────────────────────────────────────────────
interface RazorpayOptions {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  prefill: {
    name: string
    email: string
    contact: string
  }
  theme: {
    color: string
  }
  modal: {
    ondismiss: () => void
  }
  handler: (response: RazorpayResponse) => void
}

interface RazorpayResponse {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

interface RazorpayInstance {
  open(): void
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance
  }
}

// ── Payment steps ─────────────────────────────────────────────────────────────
type PaymentStep = 'form' | 'creating_booking' | 'creating_order' | 'paying' | 'verifying' | 'done' | 'error'

const STEP_LABELS: Record<PaymentStep, string> = {
  form:             'Pay ₹{{amount}}',
  creating_booking: 'Creating Booking…',
  creating_order:   'Opening Payment…',
  paying:           'Complete Payment in Razorpay',
  verifying:        'Confirming Payment…',
  done:             'Confirmed! Redirecting…',
  error:            'Try Again',
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve()
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Razorpay script'))
    document.body.appendChild(script)
  })
}

function BookingPageContent() {
  const { id } = useParams()
  const router = useRouter()
  const { user, fetchWithAuth, loading: authLoading } = useAuth()
  const propertyId = Array.isArray(id) ? id[0] : id

  // Read URL query params directly from window to avoid useSearchParams/Suspense issues
  const [urlParams, setUrlParams] = useState({
    checkIn: '',
    checkOut: '',
    guests: 1,
    pets: 0,
    nights: 0,
    total: 0,
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams(window.location.search)
    setUrlParams({
      checkIn: p.get('checkIn') || '',
      checkOut: p.get('checkOut') || '',
      guests: Number(p.get('guests')) || 1,
      pets: Number(p.get('pets')) || 0,
      nights: Number(p.get('nights')) || 0,
      total: Number(p.get('total')) || 0,
    })
  }, [])

  const { checkIn, checkOut, guests, pets, nights, total: urlTotal } = urlParams

  const [property, setProperty] = useState<Property | null>(null)
  const [quote, setQuote] = useState<PriceQuote | null>(null)
  // The server quote is authoritative (taxes, fees); the URL total is only a fallback while it loads.
  const total = quote?.total ?? urlTotal

  useEffect(() => {
    if (!property || !checkIn || !checkOut || nights <= 0) return
    let cancelled = false
    getPriceQuote(property.id, { checkIn, checkOut, guests, pets })
      .then(q => { if (!cancelled) setQuote(q) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [property, checkIn, checkOut, guests, pets, nights])
  const [pageLoading, setPageLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    special_requests: '',
  })
  const [agreed, setAgreed] = useState(false)
  const [paymentStep, setPaymentStep] = useState<PaymentStep>('form')
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Refs — must be declared here before any early returns (Rules of Hooks)
  const policyRef = useRef<HTMLDivElement>(null)
  const guestDetailsRef = useRef<HTMLDivElement>(null)

  // Auth guard
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      const currentUrl = `/booking/${propertyId || ''}${typeof window !== 'undefined' ? window.location.search : ''}`
      router.replace(`/login?next=${encodeURIComponent(currentUrl)}`)
    } else if (!form.full_name) {
      setForm(f => ({
        ...f,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone || '',
      }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading])

  // Load property
  useEffect(() => {
    if (!propertyId) return
    let isMounted = true
    const load = async () => {
      try {
        setPageLoading(true)
        setLoadError(null)
        const res = await fetch(buildApiUrl(`/properties/${propertyId}`), { cache: 'no-store' })
        if (!res.ok) throw new Error(`Failed to load property (${res.status})`)
        const data = await res.json()
        if (isMounted) setProperty(data)
      } catch (error) {
        if (isMounted) setLoadError(error instanceof Error ? error.message : 'Failed to load property')
      } finally {
        if (isMounted) setPageLoading(false)
      }
    }
    load()
    return () => { isMounted = false }
  }, [propertyId])

  if (pageLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 24px' }}>
        <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '16px' }}>Loading property…</h2>
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 24px' }}>
        <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '16px' }}>{loadError}</h2>
        <button onClick={() => router.push('/properties')} style={{ backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', border: 'none', padding: '14px 32px', fontSize: '13px', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: '700', cursor: 'pointer', borderRadius: '8px' }}>
          Back to Properties
        </button>
      </div>
    )
  }

  if (!property) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 24px' }}>
        <h2 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '16px' }}>Property not found</h2>
        <button onClick={() => router.push('/properties')} style={{ backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', border: 'none', padding: '14px 32px', fontSize: '13px', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: '700', cursor: 'pointer', borderRadius: '8px' }}>
          Back to Properties
        </button>
      </div>
    )
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!form.full_name.trim()) newErrors.full_name = 'Full name is required'
    if (!form.email.trim()) newErrors.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) newErrors.email = 'Enter a valid email'
    if (!form.phone.trim()) newErrors.phone = 'Phone number is required'
    else if (form.phone.replace(/\D/g, '').length < 10) newErrors.phone = 'Enter a valid phone number'
    if (!agreed) newErrors.agreed = 'You must agree to the cancellation policy'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    const isValid = validate()
    if (!isValid) {
      if (!agreed) {
        policyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        guestDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      return
    }
    setPaymentError(null)

    try {
      // ── Step 1: Create booking ─────────────────────────────────────────────
      setPaymentStep('creating_booking')
      const booking = await createBooking(
        {
          property_id: propertyId!,
          check_in: checkIn,
          check_out: checkOut,
          guests,
          pets,
          guest_name: form.full_name.trim() || undefined,
          guest_email: form.email.trim() || undefined,
          guest_phone: form.phone.trim() || undefined,
          note: form.special_requests.trim() || undefined,
        },
        fetchWithAuth,
      )

      // ── Step 2: Create Razorpay order ──────────────────────────────────────
      setPaymentStep('creating_order')
      const order = await createPaymentOrder(booking.id, fetchWithAuth)

      // ── Step 3: Load Razorpay script ───────────────────────────────────────
      await loadRazorpayScript()

      // ── Step 4: Open Razorpay checkout modal ───────────────────────────────
      setPaymentStep('paying')

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: order.key_id,
          amount: order.amount,
          currency: order.currency,
          name: 'Concept Stay',
          description: `Booking for ${property.name}`,
          order_id: order.razorpay_order_id,
          prefill: {
            name: form.full_name,
            email: form.email,
            contact: form.phone,
          },
          theme: { color: '#a23a1f' },
          modal: {
            ondismiss: () => {
              // User closed the modal without paying
              setPaymentStep('form')
              setPaymentError('Payment cancelled. Your booking slot is reserved for a short time — complete payment to confirm.')
              reject(new Error('Payment modal dismissed'))
            },
          },
          handler: async (response: RazorpayResponse) => {
            try {
              // ── Step 5: Verify payment ────────────────────────────────────
              setPaymentStep('verifying')
              const confirmedBooking = await verifyPayment(
                {
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                },
                fetchWithAuth,
              )

              // ── Step 6: Redirect to confirmation ─────────────────────────
              setPaymentStep('done')
              router.push(
                `/booking/${propertyId}/confirmation?ref=${confirmedBooking.booking_ref}&name=${encodeURIComponent(form.full_name)}&email=${encodeURIComponent(form.email)}&checkIn=${checkIn}&checkOut=${checkOut}&total=${confirmedBooking.total}`,
              )
              resolve()
            } catch (err) {
              reject(err)
            }
          },
        })
        rzp.open()
      })

    } catch (err) {
      if ((err as Error).message !== 'Payment modal dismissed') {
        setPaymentStep('error')
        setPaymentError((err as Error).message || 'Something went wrong. Please try again.')
      }
    }
  }

  const isProcessing = paymentStep !== 'form' && paymentStep !== 'error'
  const buttonLabel = STEP_LABELS[paymentStep].replace('{{amount}}', total.toLocaleString('en-IN'))

  const policy = CANCELLATION_POLICIES[property.cancellation_policy ?? 'flexible']
  const petCharge = quote?.pet_charge ?? pets * nights * property.pet_charge_per_night
  const extraGuestCharge = quote?.extra_guest_charge ?? 0
  const taxes = quote?.taxes ?? 0
  const serviceFee = quote?.service_fee ?? 0
  const basePrice = quote
    ? quote.base_price
    : total > 0
      ? Math.max(0, total - property.cleaning_fee - petCharge)
      : property.price_per_night * nights

  const inputStyle = (field: string) => ({
    width: '100%',
    padding: '14px 16px',
    border: `1px solid ${errors[field] ? '#E53E3E' : 'var(--color-border)'}`,
    borderRadius: '8px',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    outline: 'none',
    backgroundColor: '#ffffff',
    boxSizing: 'border-box' as const,
  })

  const labelStyle = {
    fontSize: '11px',
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
    color: 'var(--color-text-muted)',
    display: 'block',
    marginBottom: '8px',
    fontWeight: '600' as const,
  }

  const cardStyle = {
    backgroundColor: '#ffffff',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    padding: '32px',
    marginBottom: '24px',
  }

  return (
    <div className="page-shell" style={{ backgroundColor: '#ffffff' }}>

      {/* Header */}
      <div className="surface-deep" style={{ backgroundColor: 'var(--color-deep)', padding: '40px 24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-terra)', fontSize: '12px', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '8px', fontWeight: '600' }}>
          Almost There
        </p>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: '800' }}>
          Complete Your Booking
        </h1>
      </div>

      <div className="content-shell" style={{ padding: '48px 0 72px' }}>
      <div className="responsive-grid-detail">

        {/* Left */}
        <div>

          {/* Payment error notice */}
          {paymentError && (
            <div style={{ backgroundColor: '#FFF5F5', border: '1px solid #E53E3E', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <AlertTriangle size={18} color="#E53E3E" style={{ flexShrink: 0, marginTop: '1px' }} />
              <p style={{ fontSize: '13px', color: '#C53030', lineHeight: '1.6', margin: 0 }}>{paymentError}</p>
            </div>
          )}

          {/* Guest Info */}
          <div ref={guestDetailsRef} style={cardStyle}>
            <h2 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              1. Guest Information
            </h2>
            <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', marginBottom: '28px' }} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '20px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Full Name</label>
                <input type="text" placeholder="John Doe" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} style={inputStyle('full_name')} disabled={isProcessing} />
                {errors.full_name && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.full_name}</p>}
              </div>
              <div>
                <label style={labelStyle}>Email Address</label>
                <input type="email" placeholder="you@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inputStyle('email')} disabled={isProcessing} />
                {errors.email && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.email}</p>}
              </div>
              <div>
                <label style={labelStyle}>Phone Number</label>
                <input type="tel" placeholder="+91 9874827631" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inputStyle('phone')} disabled={isProcessing} />
                {errors.phone && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.phone}</p>}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Special Requests (Optional)</label>
                <textarea
                  placeholder="Any special requests or notes for your stay..."
                  value={form.special_requests}
                  onChange={e => setForm({ ...form, special_requests: e.target.value })}
                  rows={4}
                  disabled={isProcessing}
                  style={{ ...inputStyle('special_requests'), resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

          {/* Booking Summary */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              2. Booking Summary
            </h2>
            <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', marginBottom: '28px' }} />

            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {(() => {
                const src = property.images.find(i => i.is_primary)?.image_url || property.images[0]?.image_url
                if (src) return <Image src={src} alt={property.name} width={120} height={90} style={{ width: '120px', height: '90px', objectFit: 'cover', flexShrink: 0, borderRadius: '8px' }} />
                return <div style={{ width: 120, height: 90, borderRadius: 8, backgroundColor: 'var(--color-bg-card)' }} />
              })()}
              <div style={{ flex: '1 1 0', minWidth: 0 }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px' }}>{property.name}</h3>
                <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>{property.city}, {property.state}</p>
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Check In', value: formatDate(checkIn) },
                    { label: 'Check Out', value: formatDate(checkOut) },
                    { label: 'Guests', value: `${guests} Guest${guests > 1 ? 's' : ''}` },
                    ...(pets > 0 ? [{ label: 'Pets', value: `${pets} Pet${pets > 1 ? 's' : ''}` }] : []),
                    { label: 'Duration', value: `${nights} Night${nights > 1 ? 's' : ''}` },
                  ].map(detail => (
                    <div key={detail.label}>
                      <p style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '4px', fontWeight: '600' }}>{detail.label}</p>
                      <p style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: '700' }}>{detail.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Cancellation Policy */}
          <div ref={policyRef} id="cancellation-policy" style={{ backgroundColor: 'var(--color-bg-card)', border: `2px solid ${errors.agreed ? '#E53E3E' : 'var(--color-terra)'}`, borderRadius: '12px', padding: '32px', marginBottom: '24px', transition: 'border-color 0.3s ease' }}>
            <h2 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              3. Cancellation Policy
            </h2>
            <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', marginBottom: '20px' }} />

            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                Cancellation policy: {policy.label}
              </h4>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.7' }}>
                {policy.summary} The full amount of ₹{total.toLocaleString('en-IN')} is charged when you pay. Refunds, if any, are returned to your original payment method.
              </p>
            </div>

            <button
              onClick={() => setAgreed(!agreed)}
              disabled={isProcessing}
              style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', background: 'none', border: 'none', cursor: isProcessing ? 'not-allowed' : 'pointer', padding: 0, textAlign: 'left' }}
            >
              <div style={{
                width: '20px', height: '20px', flexShrink: 0,
                border: `2px solid ${errors.agreed ? '#E53E3E' : agreed ? 'var(--color-terra)' : 'var(--color-text-muted)'}`,
                borderRadius: '4px',
                backgroundColor: agreed ? 'var(--color-brand)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: '2px', transition: 'all 0.2s ease',
              }}>
                {agreed && <span style={{ color: 'var(--color-text-primary)', fontSize: '12px', fontWeight: '700' }}>&#10003;</span>}
              </div>
              <span style={{ fontSize: '13px', color: 'var(--color-text-primary)', lineHeight: '1.6' }}>
                I have read the <strong>{policy.label.toLowerCase()}</strong> cancellation policy above. I have reviewed all booking details and confirm they are correct.
              </span>
            </button>
            {errors.agreed && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '8px', paddingLeft: '32px' }}>{errors.agreed}</p>}
          </div>
        </div>

        {/* Right — Price Summary */}
        <div className="sticky-desktop">

          <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: 'clamp(20px, 5vw, 28px)', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '20px' }}>Price Breakdown</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                <span>₹{nights > 0 ? Math.round(basePrice / nights).toLocaleString('en-IN') : property.price_per_night.toLocaleString('en-IN')} × {nights} night{nights !== 1 ? 's' : ''}</span>
                <span>₹{basePrice.toLocaleString('en-IN')}</span>
              </div>
              {pets > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                  <span>{pets} pet{pets > 1 ? 's' : ''} × {nights} night{nights > 1 ? 's' : ''}</span>
                  <span>₹{petCharge.toLocaleString('en-IN')}</span>
                </div>
              )}
              {extraGuestCharge > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                  <span>Extra guests</span>
                  <span>₹{extraGuestCharge.toLocaleString('en-IN')}</span>
                </div>
              )}
              {property.cleaning_fee > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                  <span>Cleaning fee</span>
                  <span>₹{property.cleaning_fee.toLocaleString('en-IN')}</span>
                </div>
              )}
              {taxes > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                  <span>Taxes</span>
                  <span>₹{taxes.toLocaleString('en-IN')}</span>
                </div>
              )}
              {serviceFee > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                  <span>Concept Stay service fee</span>
                  <span>₹{serviceFee.toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>

            <div style={{ height: '1px', backgroundColor: 'var(--color-border)', marginBottom: '16px' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-text-primary)' }}>Total</span>
              <span style={{ fontSize: '22px', fontWeight: '800', color: 'var(--color-text-primary)' }}>₹{total.toLocaleString('en-IN')}</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Includes all fees and taxes</p>
          </div>

          {/* Progress indicator */}
          {isProcessing && paymentStep !== 'done' && (
            <div style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '16px 20px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '20px', height: '20px', borderRadius: '50%',
                  border: '2px solid var(--color-terra)',
                  borderTopColor: 'transparent',
                  animation: 'spin 0.8s linear infinite',
                  flexShrink: 0,
                }} />
                <p style={{ fontSize: '13px', color: 'var(--color-text-primary)', margin: 0, fontWeight: '600' }}>
                  {paymentStep === 'creating_booking' && 'Reserving your dates…'}
                  {paymentStep === 'creating_order' && 'Preparing payment…'}
                  {paymentStep === 'paying' && 'Please complete payment in Razorpay…'}
                  {paymentStep === 'verifying' && 'Confirming your payment…'}
                </p>
              </div>
            </div>
          )}

          <button
            id="btn-pay-now"
            onClick={handleSubmit}
            disabled={isProcessing}
            style={{
              width: '100%',
              backgroundColor: isProcessing ? 'rgba(162, 58, 31, 0.6)' : 'var(--color-brand)',
              color: 'var(--color-on-accent)',
              border: 'none',
              padding: '20px',
              fontSize: '14px',
              letterSpacing: '2px',
              fontWeight: '700',
              textTransform: 'uppercase',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              marginBottom: '16px',
              borderRadius: '8px',
              transition: 'all 0.2s ease',
            }}
          >
            {buttonLabel}
          </button>

          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
              Secured by Razorpay
            </p>
            <p style={{ fontSize: '11px', color: '#aaa', lineHeight: '1.6' }}>
              Your payment information is encrypted and secure. We never store your card details.
            </p>
          </div>
        </div>
      </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

class BookingPageErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error?.message || 'An error occurred' }
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('BookingPage ErrorBoundary caught:', error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ textAlign: 'center', padding: '120px 24px' }}>
          <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '16px' }}>Something went wrong loading booking details</h2>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '24px' }}>{this.state.error}</p>
          <a href="/properties" style={{ backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', padding: '14px 32px', fontSize: '13px', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: '700', borderRadius: '8px', textDecoration: 'none', display: 'inline-block' }}>
            Back to Properties
          </a>
        </div>
      )
    }
    return this.props.children
  }
}

export default function BookingPage() {
  return (
    <BookingPageErrorBoundary>
      <Suspense fallback={
        <div style={{ textAlign: 'center', padding: '120px 24px' }}>
          <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '16px' }}>Loading booking details…</h2>
        </div>
      }>
        <BookingPageContent />
      </Suspense>
    </BookingPageErrorBoundary>
  )
}
