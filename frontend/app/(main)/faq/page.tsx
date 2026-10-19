'use client'

import Link from 'next/link'

const faqs = [
  { q: 'How do I make a booking?', a: 'Browse our properties, select your dates and guests, then proceed to checkout. Payment is processed securely via Razorpay.' },
  { q: 'Can I get a refund if I cancel?', a: 'It depends on the cancellation policy shown on the property page (Flexible, Moderate or Non-refundable). Your dashboard shows the exact refund before you confirm a cancellation.' },
  { q: 'Can I bring my pets?', a: 'Many of our properties are pet-friendly. Look for the "Pets Welcome" badge on the property page. An additional nightly charge applies per pet.' },
  { q: 'How do I get my booking confirmation and voucher PDF?', a: 'A confirmation email with your booking reference is sent immediately after payment, and the PDF voucher will also be available on the website.' },
  { q: 'Can I modify my booking dates?', a: 'Booking dates cannot be modified after payment. Cancel under the property\'s cancellation policy and rebook if you need different dates.' },
]

export default function FaqPage() {
  return (
    <div style={{ backgroundColor: '#ffffff', minHeight: '100vh' }}>
      <div style={{ backgroundColor: 'var(--color-bg-soft)', padding: '72px 24px 64px', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-gold)', fontSize: '12px', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '12px', fontWeight: '600' }}>
          Quick Answers
        </p>
        <h1 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '16px' }}>
          Frequently Asked Questions
        </h1>
        <div style={{ width: '60px', height: '2px', backgroundColor: 'var(--color-gold)', margin: '0 auto 16px' }} />
        <p style={{ fontSize: '15px', color: 'var(--color-text-secondary)', maxWidth: '560px', margin: '0 auto', lineHeight: '1.7' }}>
          Find quick answers about bookings, cancellations, and stays.
        </p>
      </div>

      <section style={{ padding: 'clamp(48px, 6vw, 72px) 24px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {faqs.map((faq, i) => (
            <div key={i} style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-text-primary)', lineHeight: '1.4', marginBottom: '10px' }}>
                  {faq.q}
                </h2>
                <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.8' }}>
                  {faq.a}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ maxWidth: '760px', margin: '40px auto 0', textAlign: 'center' }}>
          <Link href="/contact" style={{ color: 'var(--color-gold)', textDecoration: 'none', fontWeight: '700', fontSize: '14px', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Back to Contact
          </Link>
        </div>
      </section>
    </div>
  )
}