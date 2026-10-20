"use client"

import Link from 'next/link'
import Copy from '@/lib/copy'

export default function CTASection() {
  return (
    <section className="surface-deep" style={{
      backgroundColor: 'var(--color-deep)', backgroundImage: 'var(--clay-texture-dark)',
      padding: '52px 24px',
    }}>
      <div style={{
        width: 'min(1000px, calc(100% - 48px))',
        margin: '0 auto',
        textAlign: 'center',
      }}>
        <p style={{
          color: 'var(--color-terra)',
          letterSpacing: '3px',
          textTransform: 'uppercase',
          marginBottom: '12px',
          fontWeight: '600',
        }}>
          Limited Time Offer
        </p>
        <h2 style={{
          fontSize: 'clamp(24px, 4vw, 42px)',
          fontWeight: '800',
          color: 'var(--color-on-deep)',
          marginBottom: '12px',
          lineHeight: '1.2',
        }}>
          {Copy.ctaHeading}
        </h2>

        <p style={{
          color: 'var(--color-text-secondary)',
          fontSize: '16px',
          marginBottom: '28px',
          lineHeight: '1.6',
        }}>
          {Copy.ctaSubtitle}
        </p>

        <Link
          href="/properties"
          style={{
            backgroundColor: 'var(--color-gold)',
            color: 'var(--color-dark)',
            border: 'none',
            padding: '14px 42px',
            fontSize: '12px',
            letterSpacing: '2px',
            fontWeight: '700',
            textTransform: 'uppercase',
            textDecoration: 'none',
            display: 'inline-block',
            borderRadius: '8px',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLAnchorElement
            el.style.opacity = '0.9'
            el.style.transform = 'scale(1.03)'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLAnchorElement
            el.style.opacity = '1'
            el.style.transform = 'scale(1)'
          }}
        >
          Explore Now
        </Link>
      </div>
    </section>
  )
}
