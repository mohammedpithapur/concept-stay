'use client'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

const sections = [
  {
    id: 'information-we-collect',
    title: '1. Information We Collect',
    content: [
      {
        subtitle: 'Personal Information',
        text: 'When you create an account or make a booking, we collect information such as your full name, email address, phone number, and payment details. This information is necessary to process your reservations and communicate with you about your stay.',
      },
      {
        subtitle: 'Usage Data',
        text: 'We automatically collect certain information when you visit our website, including your IP address, browser type, pages visited, time spent on pages, and referring URLs. This helps us understand how our platform is used and improve your experience.',
      },
      {
        subtitle: 'Communications',
        text: 'If you contact us directly, we may receive additional information about you such as your name, email address, the contents of your message, and any attachments you may send.',
      },
    ],
  },
  {
    id: 'how-we-use',
    title: '2. How We Use Your Information',
    content: [
      {
        subtitle: 'Booking & Service Delivery',
        text: 'We use your personal information to process bookings, send confirmation emails, provide customer support, and facilitate your stay at our properties. Without this information, we cannot complete your reservation.',
      },
      {
        subtitle: 'Communication',
        text: 'We may use your contact details to send booking confirmations, receipts, important updates about your reservation, and responses to your enquiries. You may also receive occasional newsletters and promotional offers, from which you can unsubscribe at any time.',
      },
      {
        subtitle: 'Platform Improvement',
        text: 'Aggregated and anonymised usage data helps us analyse trends, administer the website, track user movement, and gather demographic information to improve our services and user experience.',
      },
    ],
  },
  {
    id: 'data-sharing',
    title: '3. Data Sharing & Disclosure',
    content: [
      {
        subtitle: 'Property Partners',
        text: 'To fulfil your booking, we share relevant details (name, contact information, stay dates) with the property you have reserved. This is strictly limited to what is necessary for your stay.',
      },
      {
        subtitle: 'Payment Processors',
        text: 'Payment information is processed securely through Razorpay. We do not store your complete card details on our servers. Please review Razorpay\'s privacy policy for information on how they handle your payment data.',
      },
      {
        subtitle: 'Legal Requirements',
        text: 'We may disclose your information if required by law, court order, or governmental authority, or if we believe disclosure is necessary to protect our rights, protect your safety or the safety of others, or investigate fraud.',
      },
    ],
  },
  {
    id: 'data-security',
    title: '4. Data Security',
    content: [
      {
        subtitle: 'Security Measures',
        text: 'We implement industry-standard security measures including SSL/TLS encryption, secure data storage, and regular security audits to protect your personal information from unauthorised access, alteration, disclosure, or destruction.',
      },
      {
        subtitle: 'Data Retention',
        text: 'We retain your personal information for as long as necessary to provide our services and comply with legal obligations. Booking records are typically retained for 7 years for financial and legal compliance purposes.',
      },
    ],
  },
  {
    id: 'cookies',
    title: '5. Cookies & Tracking',
    content: [
      {
        subtitle: 'Cookie Usage',
        text: 'We use cookies and similar tracking technologies to enhance your browsing experience, remember your preferences, and analyse site traffic. Essential cookies are required for the website to function properly.',
      },
      {
        subtitle: 'Your Choices',
        text: 'You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, if you do not accept cookies, some portions of our website may not function properly.',
      },
    ],
  },
  {
    id: 'your-rights',
    title: '6. Your Rights',
    content: [
      {
        subtitle: 'Access & Correction',
        text: 'You have the right to access, update, or correct your personal information at any time through your account settings or by contacting us directly. We will respond to your request within 30 days.',
      },
      {
        subtitle: 'Deletion',
        text: 'You may request deletion of your personal data, subject to our legal obligations to retain certain information. To request deletion, please contact us at staysearthy@gmail.com.',
      },
      {
        subtitle: 'Opt-Out',
        text: 'You may opt out of receiving promotional communications from us by following the unsubscribe instructions in any email we send, or by contacting us directly. Note that transactional emails related to your bookings cannot be opted out of.',
      },
    ],
  },
  {
    id: 'changes',
    title: '8. Changes to This Policy',
    content: [
      {
        subtitle: 'Policy Updates',
        text: 'We may update this Privacy Policy from time to time. We will notify you of any significant changes by posting the new policy on this page with an updated effective date. Your continued use of our services after any changes constitutes your acceptance of the new policy.',
      },
    ],
  },
  {
    id: 'contact',
    title: '9. Contact Us',
    content: [
      {
        subtitle: 'Privacy Enquiries',
        text: 'If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact our privacy team at staysearthy@gmail.com or write to us at our registered address in India.',
      },
    ],
  },
]

export default function PrivacyPage() {
  return (
    <div className="page-shell" style={{ backgroundColor: '#ffffff' }}>

      {/* Hero */}
      <div className="surface-deep" style={{ backgroundColor: 'var(--color-deep)', padding: '72px 24px 64px' }}>
        <div className="content-shell" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--color-terra)', fontSize: '12px', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '16px', fontWeight: '600' }}>
            Legal
          </p>
          <h1 style={{ color: 'var(--color-text-primary)', fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: '800', marginBottom: '16px', lineHeight: '1.2' }}>
            Privacy Policy
          </h1>
          <div style={{ width: '60px', height: '2px', backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', margin: '0 auto 24px' }} />
          <p style={{ color: 'var(--color-text-primary)', fontSize: '15px', maxWidth: '560px', margin: '0 auto', lineHeight: '1.7' }}>
            We are committed to protecting your personal information and your right to privacy. This policy explains how we collect, use, and safeguard your data.
          </p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: '24px' }}>
            Effective Date: 1st January 2026 &nbsp;·&nbsp; Last Updated: 1st January 2026
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="content-shell" style={{ padding: '64px 24px 80px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: '0' }}>

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
                  <h2 style={{ fontSize: 'clamp(20px, 2.5vw, 26px)', fontWeight: '800', color: 'var(--color-text-primary)' }}>
                    {section.title}
                  </h2>
                  <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--color-border)' }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {section.content.map((item, i) => (
                    <div key={i} style={{ paddingLeft: '20px', borderLeft: '3px solid var(--color-terra)' }}>
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

          {/* Bottom Notice */}
          <div style={{ marginTop: '64px', backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-terra)', borderRadius: '12px', padding: '32px', display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '220px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' }}>Have Questions?</h3>
              <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.7' }}>
                If you have any questions about this Privacy Policy or how we handle your data, we&apos;re here to help.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <a
                href="mailto:staysearthy@gmail.com"
                style={{ backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', padding: '12px 24px', fontSize: '13px', letterSpacing: '1px', fontWeight: '700', textTransform: 'uppercase', textDecoration: 'none', borderRadius: '8px', display: 'inline-block' }}
              >
                Email Us
              </a>
              <Link
                href="/contact"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: '12px 24px', fontSize: '13px', letterSpacing: '1px', fontWeight: '600', textTransform: 'uppercase', textDecoration: 'none', borderRadius: '8px', display: 'inline-block' }}
              >
                Contact Page
              </Link>
            </div>
          </div>

          {/* Related Links */}
          <div style={{ marginTop: '32px', display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {[
              { label: 'Terms & Conditions', href: '/terms' },
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
    </div>
  )
}
