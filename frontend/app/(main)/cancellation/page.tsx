'use client'
import Link from 'next/link'
import { AlertTriangle, X, Check } from 'lucide-react'

const faqs = [
  {
    q: 'Can I get a refund if I cancel my booking?',
    a: 'It depends on the cancellation policy shown on the property page: Flexible (full refund until 5 days before check-in), Moderate (full refund until 14 days, 50% until 5 days before check-in) or Non-refundable. You can cancel from your dashboard, which shows the exact refund before you confirm.',
  },
  {
    q: 'What if I need to change my dates?',
    a: 'Dates cannot be modified on confirmed bookings. Cancel under the property\'s cancellation policy and make a new reservation, subject to availability.',
  },
  {
    q: 'What if the property is unavailable on arrival?',
    a: 'In the extremely rare event that a property is unavailable after booking confirmation due to circumstances beyond our control, we will offer an equivalent alternative or a full refund.',
  },
  {
    q: 'What happens in case of a natural disaster or emergency?',
    a: 'While we empathise with difficult circumstances, the property\'s cancellation policy applies in all cases.',
  },
  {
    q: 'Can I transfer my booking to someone else?',
    a: 'Bookings are non-transferable. The booking must be in the name of the guest who will be staying, and changes to the primary guest name are not permitted.',
  },
  {
    q: 'What if I need to reduce the number of nights?',
    a: 'Early check-outs or reductions in the number of nights will not be refunded. You are responsible for the full booking amount regardless of the actual duration of your stay.',
  },
]

const steps = [
  {
    number: '01',
    title: 'Review Before Booking',
    description: 'Carefully review all property details, dates, guest count, and total price before proceeding to payment. Our booking process shows a complete summary for your confirmation.',
  },
  {
    number: '02',
    title: 'Confirm Your Details',
    description: 'Ensure all guest information is accurate. Double-check your check-in and check-out dates as these cannot be changed after booking confirmation.',
  },
  {
    number: '03',
    title: 'Read House Rules',
    description: 'Each property has specific house rules. Review them on the property page before booking to ensure they suit your requirements and travel party.',
  },
  {
    number: '04',
    title: 'Complete Payment',
    description: 'Once you are fully satisfied with your booking details, complete your payment. Your booking is confirmed only upon receipt of full payment and a confirmation email.',
  },
]

export default function CancellationPage() {
  return (
    <div className="page-shell" style={{ backgroundColor: '#ffffff' }}>

      {/* Hero */}
      <div style={{ backgroundColor: 'var(--color-deep)', padding: '72px 24px 64px' }}>
        <div className="content-shell" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--color-terra)', fontSize: '12px', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '16px', fontWeight: '600' }}>
            Legal
          </p>
          <h1 style={{ color: 'var(--color-text-primary)', fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: '800', marginBottom: '16px', lineHeight: '1.2' }}>
            Cancellation Policy
          </h1>
          <div style={{ width: '60px', height: '2px', backgroundColor: 'var(--color-terra)', margin: '0 auto 24px' }} />
          <p style={{ color: 'var(--color-text-primary)', fontSize: '15px', maxWidth: '560px', margin: '0 auto', lineHeight: '1.7' }}>
            Understanding our cancellation policy before you book ensures a smooth experience. Please read this carefully.
          </p>
        </div>
      </div>

      {/* Main Policy Banner */}
      <div style={{ backgroundColor: 'var(--color-text-primary)', padding: '48px 24px' }}>
        <div className="content-shell" style={{ textAlign: 'center' }}>
          <AlertTriangle size={40} style={{ color: 'var(--color-terra)', margin: '0 auto 16px' }} />
          <h2 style={{ color: 'var(--color-terra)', fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: '800', marginBottom: '16px', letterSpacing: '1px' }}>
            Cancellation Policies
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '16px', maxWidth: '600px', margin: '0 auto', lineHeight: '1.7' }}>
            Every stay shows one of three policies: <strong>Flexible</strong> (free cancellation until 5 days before check-in), <strong>Moderate</strong> (full refund until 14 days, 50% until 5 days) or <strong>Non-refundable</strong>. Refunds go back to your original payment method.
          </p>
        </div>
      </div>

      <div className="content-shell" style={{ padding: '64px 24px 80px' }}>

        {/* Policy Details */}
        <div style={{ marginBottom: '64px' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p style={{ color: 'var(--color-terra)', fontSize: '12px', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '12px', fontWeight: '600' }}>
              Policy Details
            </p>
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              What This Means for You
            </h2>
            <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--color-terra)', margin: '0 auto' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            {[
              {
                icon: <X size={20} />,
                iconBg: '#FFEBEE',
                iconColor: '#C62828',
                title: 'No Cancellation Refunds',
                description: 'Cancellations at any point after booking confirmation will not be eligible for a refund, regardless of how far in advance the cancellation is made.',
              },
              {
                icon: <X size={20} />,
                iconBg: '#FFEBEE',
                iconColor: '#C62828',
                title: 'No Date Changes',
                description: 'Check-in and check-out dates cannot be modified after booking. Any changes would require a new booking, subject to availability, with no refund on the original.',
              },
              {
                icon: <X size={20} />,
                iconBg: '#FFEBEE',
                iconColor: '#C62828',
                title: 'No Partial Refunds',
                description: 'Early check-outs, reduced nights, or unused portions of your stay will not be refunded. The full booking amount is charged regardless of actual stay duration.',
              },
              {
                icon: <Check size={20} />,
                iconBg: '#E8F5E9',
                iconColor: '#2E7D32',
                title: 'Property Unavailability',
                description: 'If we are unable to provide the booked property due to circumstances on our end, we will arrange an equivalent alternative or issue a full refund.',
              },
            ].map((item, i) => (
              <div key={i} style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '28px' }}>
                <div style={{ width: '44px', height: '44px', backgroundColor: item.iconBg, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', fontSize: '18px', fontWeight: '800', color: item.iconColor }}>
                  {item.icon}
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '10px' }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.7' }}>
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* How to Book Wisely */}
        <div style={{ marginBottom: '64px' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p style={{ color: 'var(--color-terra)', fontSize: '12px', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '12px', fontWeight: '600' }}>
              Booking Guidance
            </p>
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              How to Book With Confidence
            </h2>
            <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--color-terra)', margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '15px', maxWidth: '500px', margin: '0 auto', lineHeight: '1.7' }}>
              Follow these steps to ensure you are fully informed before committing to a booking.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {steps.map((step, i) => (
              <div
                key={i}
                style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', padding: '28px 0', borderBottom: i < steps.length - 1 ? '1px solid var(--color-border)' : 'none' }}
              >
                <div style={{ flexShrink: 0, width: '56px', height: '56px', backgroundColor: 'var(--color-deep)', border: '2px solid var(--color-terra)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '800', color: 'var(--color-terra)', letterSpacing: '1px' }}>
                  {step.number}
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                    {step.title}
                  </h3>
                  <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.7' }}>
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div style={{ marginBottom: '64px' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p style={{ color: 'var(--color-terra)', fontSize: '12px', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '12px', fontWeight: '600' }}>
              Questions
            </p>
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              Frequently Asked Questions
            </h2>
            <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--color-terra)', margin: '0 auto' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {faqs.map((faq, i) => (
              <div key={i} style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px 28px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ color: 'var(--color-terra)', flexShrink: 0, marginTop: '1px' }}>Q.</span>
                  {faq.q}
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.7', paddingLeft: '24px' }}>
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <div style={{ backgroundColor: 'var(--color-text-primary)', borderRadius: '12px', padding: 'clamp(28px, 5vw, 48px)', display: 'flex', gap: '24px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: '800', color: '#ffffff', marginBottom: '8px' }}>
              Ready to Book?
            </h3>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.7', maxWidth: '400px' }}>
              Now that you understand our policy, explore our handpicked properties across India.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Link
              href="/properties"
              style={{ backgroundColor: '#a23a1f', color: '#f6eddc', padding: '14px 28px', fontSize: '13px', letterSpacing: '1.5px', fontWeight: '700', textTransform: 'uppercase', textDecoration: 'none', borderRadius: '8px', display: 'inline-block' }}
            >
              Explore Properties
            </Link>
            <Link
              href="/contact"
              style={{ border: '1px solid rgba(255,255,255,0.3)', color: '#ffffff', padding: '14px 28px', fontSize: '13px', letterSpacing: '1.5px', fontWeight: '600', textTransform: 'uppercase', textDecoration: 'none', borderRadius: '8px', display: 'inline-block' }}
            >
              Contact Us
            </Link>
          </div>
        </div>

        {/* Related Links */}
        <div style={{ marginTop: '32px', display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            { label: 'Privacy Policy', href: '/privacy' },
            { label: 'Terms & Conditions', href: '/terms' },
            { label: 'Contact Us', href: '/contact' },
          ].map(link => (
            <Link
              key={link.href}
              href={link.href}
              style={{ fontSize: '13px', color: 'var(--color-text-muted)', textDecoration: 'none', padding: '8px 16px', border: '1px solid var(--color-border)', borderRadius: '6px', transition: 'all 0.2s ease' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--color-terra)'
                ;(e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-text-primary)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--color-border)'
                ;(e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-text-muted)'
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
