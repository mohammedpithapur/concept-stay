'use client'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState, Suspense } from 'react'
import { Info, Check } from 'lucide-react'

function ConfirmationPageContent() {
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const ref      = searchParams.get('ref') || ''
  const name     = searchParams.get('name') || 'Guest'
  const email    = searchParams.get('email') || ''
  const checkIn  = searchParams.get('checkIn') || ''
  const checkOut = searchParams.get('checkOut') || ''
  const total    = Number(searchParams.get('total')) || 0

  const formatDate = (dateStr: string) =>
    dateStr
      ? new Date(dateStr).toLocaleDateString('en-IN', {
          weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
        })
      : '—'

  if (!mounted) return null

  return (
    <div className="auth-shell" style={{ backgroundColor: '#ffffff' }}>
      <div style={{ maxWidth: '600px', width: '100%' }}>

        {/* Success animation */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            width: '88px', height: '88px',
            background: 'linear-gradient(135deg, var(--color-brand) 0%, var(--color-terra-dark) 100%)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 28px',
            boxShadow: '0 8px 32px rgba(162, 58, 31, 0.4)',
          }}>
            <Check size={44} style={{ color: '#ffffff' }} />
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '12px' }}>
            Booking Confirmed!
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '15px', lineHeight: '1.7' }}>
            Thank you, <strong>{name}</strong>! Your payment was successful and your stay is confirmed.
            {email && <> A confirmation email has been sent to <strong>{email}</strong> and an SMS summary has been dispatched.</>}
          </p>
        </div>

        {/* Booking reference card */}
        <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '32px', marginBottom: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>

          <div className="surface-deep" style={{
            textAlign: 'center',
            padding: '20px',
            backgroundColor: 'var(--color-deep)',
            borderRadius: '12px',
            marginBottom: '28px',
            border: '2px dashed var(--color-terra)',
          }}>
            <p style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '10px', fontWeight: '600' }}>
              Booking Reference
            </p>
            <p style={{ fontSize: '32px', color: 'var(--color-text-primary)', fontWeight: '800', letterSpacing: '6px', fontFamily: 'monospace' }}>
              {ref || '—'}
            </p>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
              Save this reference number for your records
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
            {[
              { label: 'Check In',   value: formatDate(checkIn) },
              { label: 'Check Out',  value: formatDate(checkOut) },
              { label: 'Total Paid', value: total > 0 ? `₹${total.toLocaleString('en-IN')}` : '—' },
              { label: 'Payment',    value: 'Confirmed' },
            ].map(detail => (
              <div key={detail.label}>
                <p style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '6px', fontWeight: '600' }}>
                  {detail.label}
                </p>
                <p style={{ fontSize: '15px', color: 'var(--color-text-primary)', fontWeight: '700' }}>
                  {detail.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Non-refundable reminder */}
        <div style={{
          backgroundColor: '#FFFBEB',
          border: '1px solid var(--color-terra)',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '32px',
          display: 'flex',
          gap: '12px',
          alignItems: 'flex-start',
        }}>
          <Info size={18} style={{ color: 'var(--color-terra)', flexShrink: 0, marginTop: '2px' }} />
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.6', margin: 0 }}>
            <strong>Reminder:</strong> You can cancel for a full refund within <strong>10 days of booking</strong>. Please add your ID from your dashboard so your host can approve your stay, and save your booking reference <strong>{ref}</strong>.
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <Link
            href="/dashboard"
            id="btn-view-bookings"
            style={{
              flex: '1 1 180px',
              background: 'linear-gradient(135deg, var(--color-brand) 0%, var(--color-terra-dark) 100%)',
              color: 'var(--color-on-accent)',
              padding: '18px',
              fontSize: '13px',
              letterSpacing: '1.5px',
              fontWeight: '700',
              textTransform: 'uppercase',
              textDecoration: 'none',
              textAlign: 'center',
              display: 'block',
              borderRadius: '8px',
              minWidth: 0,
            }}
          >
            View My Bookings
          </Link>
          <Link
            href="/properties"
            id="btn-explore-more"
            style={{
              flex: '1 1 180px',
              border: '2px solid var(--color-terra)',
              color: 'var(--color-text-primary)',
              padding: '18px',
              fontSize: '13px',
              letterSpacing: '1.5px',
              fontWeight: '700',
              textTransform: 'uppercase',
              textDecoration: 'none',
              textAlign: 'center',
              display: 'block',
              borderRadius: '8px',
              minWidth: 0,
            }}
          >
            Explore More
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmationPageContent />
    </Suspense>
  )
}
