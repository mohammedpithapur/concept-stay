'use client'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

const sections = [
  {
    id: 'acceptance',
    title: '1. Acceptance of Terms',
    content: [
      {
        subtitle: 'Agreement to Terms',
        text: 'By accessing or using the Concept Stay website and services, you confirm that you are at least 18 years of age, have read and understood these Terms & Conditions, and agree to be bound by them. If you do not agree to these terms, please do not use our services.',
      },
      {
        subtitle: 'Modifications',
        text: 'Concept Stay reserves the right to modify these terms at any time. We will notify users of significant changes via email or a prominent notice on our website. Your continued use of our services after any modification constitutes acceptance of the updated terms.',
      },
    ],
  },
  {
    id: 'bookings',
    title: '2. Bookings & Reservations',
    content: [
      {
        subtitle: 'Booking Process',
        text: 'All bookings made through Concept Stay are subject to availability and confirmation. A booking is confirmed once you receive a confirmation email and your voucher is available from the website.',
      },
      {
        subtitle: 'Accurate Information',
        text: 'You are responsible for ensuring all information provided during booking is accurate, including dates and contact details. Any discrepancies may result in additional charges or cancellation of your booking.',
      },
      {
        subtitle: 'Minimum Stay Requirements',
        text: 'Many of our properties have minimum stay requirements, particularly during peak seasons and holidays. These requirements are clearly stated on each property listing and must be adhered to at the time of booking.',
      },
      {
        subtitle: 'Guest Limits',
        text: 'The number of guests staying at a property must not exceed the maximum occupancy stated in the property listing. Any extra guest beyond the stated limit must be paid for directly at the property.',
      },
    ],
  },
  {
    id: 'payment',
    title: '3. Payment Terms',
    content: [
      {
        subtitle: 'Payment Methods',
        text: 'We accept payments through Razorpay, which supports UPI, credit/debit cards, net banking, and other payment methods. All transactions are processed in Indian Rupees (INR) and are subject to Razorpay\'s terms of service.',
      },
      {
        subtitle: 'Full Payment',
        text: 'Full payment is required at booking. Instalment plans and partial payments are not available.',
      },
    ],
  },
  {
    id: 'cancellation',
    title: '4. Cancellation & Refund Policy',
    content: [
      {
        subtitle: 'Cancellations and Refunds',
        text: 'A booking cancelled within 10 days of the booking date, and before check-in, is refunded in full, including taxes and service fees. After 10 days no refund is given, unless our team approves a refund after reviewing a reported problem. Refunds are returned to the original payment method.',
      },
      {
        subtitle: 'No Modifications',
        text: 'Confirmed bookings cannot be modified, including changes to dates. If you wish to make changes, your current booking must be cancelled (without refund) and a new booking made, subject to availability.',
      },
      {
        subtitle: 'Property Unavailability',
        text: 'In the rare event that a property becomes unavailable after your booking is confirmed due to circumstances beyond our control, we will make every effort to offer you an equivalent alternative property. If no suitable alternative is available, a full refund will be provided.',
      },
    ],
  },
  {
    id: 'property-rules',
    title: '5. Property Rules & Guest Conduct',
    content: [
      {
        subtitle: 'House Rules Compliance',
        text: 'All guests are required to comply with the house rules specified for each property. These rules are displayed on the property listing and must be reviewed before booking. Violation of house rules may result in immediate eviction without refund.',
      },
      {
        subtitle: 'Check-in & Check-out',
        text: 'Guests must adhere to the check-in and check-out times specified for each property. Early check-in or late check-out may be available upon request and at the property\'s discretion, potentially subject to additional charges.',
      },
      {
        subtitle: 'Property Care',
        text: 'Guests are responsible for taking reasonable care of the property and its contents. Any damage caused during your stay beyond normal wear and tear will be charged to the payment method on file.',
      },
      {
        subtitle: 'Prohibited Activities',
        text: 'Illegal activities, excessive noise, parties (unless explicitly permitted), and any behaviour that disturbs neighbours or other guests is strictly prohibited. We reserve the right to terminate a booking immediately for violations.',
      },
    ],
  },
  {
    id: 'pets',
    title: '6. Pet Policy',
    content: [
      {
        subtitle: 'Pet-Friendly Properties',
        text: 'Only properties explicitly marked as "Pet Friendly" on our platform allow pets. Bringing a pet to a non-pet-friendly property is a violation of these terms and may result in immediate eviction without refund.',
      },
      {
        subtitle: 'Pet Charges',
        text: 'Properties that accept pets charge an additional nightly fee per pet, clearly stated on the property listing. This charge is added to your total at the time of booking. Pet owners are responsible for any damage caused by their animals.',
      },
    ],
  },
  {
    id: 'liability',
    title: '7. Limitation of Liability',
    content: [
      {
        subtitle: 'Limitation',
        text: 'To the maximum extent permitted by applicable law, Concept Stay shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of our platform or services. Our total liability shall not exceed the amount paid for the specific booking in question.',
      },
      {
        subtitle: 'Force Majeure',
        text: 'Concept Stay shall not be liable for any failure to perform obligations where such failure is caused by circumstances beyond our reasonable control, including natural disasters, government actions, pandemics, or other force majeure events.',
      },
    ],
  },
  {
    id: 'intellectual-property',
    title: '8. Intellectual Property',
    content: [
      {
        subtitle: 'Our Content',
        text: 'All content on the Concept Stay platform, including text, images, logos, and software, is the property of Concept Stay or its licensors and is protected by applicable intellectual property laws. You may not reproduce, distribute, or create derivative works without our express written permission.',
      },
      {
        subtitle: 'User Content',
        text: 'By submitting reviews, photos, or other content to our platform, you grant Concept Stay a non-exclusive, royalty-free licence to use, reproduce, and display such content in connection with our services.',
      },
    ],
  },
  {
    id: 'governing-law',
    title: '9. Governing Law',
    content: [
      {
        subtitle: 'Jurisdiction',
        text: 'These Terms & Conditions are governed by the laws of India. Any disputes arising from or relating to these terms or your use of our services shall be subject to the exclusive jurisdiction of the courts of India.',
      },
      {
        subtitle: 'Dispute Resolution',
        text: 'We encourage you to contact us first to resolve any disputes informally. If a dispute cannot be resolved informally, it shall be submitted to binding arbitration in accordance with the Arbitration and Conciliation Act, 1996.',
      },
    ],
  },
  {
    id: 'contact',
    title: '10. Contact Information',
    content: [
      {
        subtitle: 'Reach Us',
        text: 'For any questions, concerns, or notices regarding these Terms & Conditions, please contact us at staysearthy@gmail.com or through our Contact page. We aim to respond to all enquiries within 3 business days.',
      },
    ],
  },
]

export default function TermsPage() {
  return (
    <div className="page-shell" style={{ backgroundColor: '#ffffff' }}>

      {/* Hero */}
      <div className="surface-deep" style={{ backgroundColor: 'var(--color-deep)', padding: '72px 24px 64px' }}>
        <div className="content-shell" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--color-terra)', fontSize: '12px', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '16px', fontWeight: '600' }}>
            Legal
          </p>
          <h1 style={{ color: 'var(--color-text-primary)', fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: '800', marginBottom: '16px', lineHeight: '1.2' }}>
            Terms & Conditions
          </h1>
          <div style={{ width: '60px', height: '2px', backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', margin: '0 auto 24px' }} />
          <p style={{ color: 'var(--color-text-primary)', fontSize: '15px', maxWidth: '560px', margin: '0 auto', lineHeight: '1.7' }}>
            Please read these terms carefully before using our platform. By booking with Concept Stay, you agree to be bound by the following terms and conditions.
          </p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: '24px' }}>
            Effective Date: 1st January 2026 &nbsp;·&nbsp; Last Updated: 1st January 2026
          </p>
        </div>
      </div>

      {/* Important Notice */}
      <div style={{ backgroundColor: 'var(--color-bg-card)', borderBottom: '1px solid var(--color-terra)' }}>
        <div className="content-shell" style={{ padding: '20px 24px' }}>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.7', textAlign: 'center' }}>
            <strong>Important:</strong> Every stay follows the <strong>10-day refund rule</strong>. Please review it in Section 4 before making a reservation.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="content-shell" style={{ padding: '64px 24px 80px' }}>

        {/* Table of Contents */}
        <div style={{ backgroundColor: 'var(--color-bg-soft)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '32px', marginBottom: '48px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '20px', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Table of Contents
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                style={{ color: 'var(--color-text-secondary)', fontSize: '14px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', transition: 'color 0.2s ease' }}
                onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-terra)'}
                onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-text-secondary)'}
              >
                <ArrowRight size={12} aria-hidden="true" style={{ color: 'var(--color-terra)', flexShrink: 0 }} />
                {section.title}
              </a>
            ))}
          </div>
        </div>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
          {sections.map((section) => (
            <div key={section.id} id={section.id} style={{ scrollMarginTop: '100px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
                <h2 style={{ fontSize: 'clamp(20px, 2.5vw, 26px)', fontWeight: '800', color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
                  {section.title}
                </h2>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--color-border)' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {section.content.map((item, i) => (
                  <div
                    key={i}
                    style={{ paddingLeft: '20px', borderLeft: `3px solid ${section.id === 'cancellation' ? '#E53E3E' : 'var(--color-terra)'}` }}
                  >
                    <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                      {item.subtitle}
                    </h3>
                    <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.8' }}>
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div style={{ marginTop: '64px', backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-terra)', borderRadius: '12px', padding: '32px', display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' }}>Need Clarification?</h3>
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.7' }}>
              If any part of these terms is unclear, please reach out to us before making a booking.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <a
              href="mailto:staysearthy@gmail.com"
              style={{ backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', padding: '12px 24px', fontSize: '13px', letterSpacing: '1px', fontWeight: '700', textTransform: 'uppercase', textDecoration: 'none', borderRadius: '8px', display: 'inline-block' }}
            >
              Email Legal Team
            </a>
            <Link
              href="/contact"
              style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: '12px 24px', fontSize: '13px', letterSpacing: '1px', fontWeight: '600', textTransform: 'uppercase', textDecoration: 'none', borderRadius: '8px', display: 'inline-block' }}
            >
              Contact Us
            </Link>
          </div>
        </div>

        {/* Related Links */}
        <div style={{ marginTop: '32px', display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            { label: 'Privacy Policy', href: '/privacy' },
            { label: 'Cancellation Policy', href: '/cancellation' },
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
