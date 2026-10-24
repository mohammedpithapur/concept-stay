'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import ProfileIncompleteBanner from '@/components/host/ProfileIncompleteBanner'

const TABS = [
  { href: '/operator', label: 'Overview' },
  { href: '/operator/experiences', label: 'Experiences' },
  { href: '/operator/slots', label: 'Slots' },
  { href: '/operator/bookings', label: 'Bookings' },
  { href: '/operator/payouts', label: 'Payouts' },
  { href: '/operator/profile', label: 'Profile' },
]

/** Page frame for the operator area: title plus the section tabs (same look as the host area). */
export default function OperatorShell({ title, children }: { title: string; children: ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="page-shell" style={{ backgroundColor: 'var(--color-bg-page)', minHeight: '70vh' }}>
      <ProfileIncompleteBanner base="/operator" />
      <div className="surface-deep" style={{ backgroundColor: 'var(--color-deep)', padding: '36px var(--page-padding) 0' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <p style={{ color: 'var(--color-terra)', fontSize: '12px', letterSpacing: '4px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '8px' }}>
            Operator
          </p>
          <h1 style={{ color: 'var(--color-on-deep)', fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 800, marginBottom: '20px' }}>{title}</h1>
          <nav style={{ display: 'flex', gap: '4px', overflowX: 'auto' }} aria-label="Operator sections">
            {TABS.map(tab => {
              const active = tab.href === '/operator' ? pathname === '/operator' : pathname.startsWith(tab.href)
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  style={{
                    padding: '10px 18px', fontSize: '14px', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
                    borderRadius: '8px 8px 0 0', color: active ? 'var(--color-dark)' : 'var(--color-on-deep)',
                    backgroundColor: active ? 'var(--color-bg-page)' : 'transparent',
                  }}
                >
                  {tab.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px var(--page-padding) 64px' }}>{children}</div>
    </div>
  )
}
