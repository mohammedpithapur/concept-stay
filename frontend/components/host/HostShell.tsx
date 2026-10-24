'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CSSProperties, ReactNode } from 'react'
import ProfileIncompleteBanner from '@/components/host/ProfileIncompleteBanner'

const TABS = [
  { href: '/host', label: 'Dashboard' },
  { href: '/host/properties', label: 'Listings' },
  { href: '/host/calendar', label: 'Calendar' },
  { href: '/host/bookings', label: 'Bookings' },
  { href: '/host/payouts', label: 'Payouts' },
  { href: '/host/profile', label: 'Profile' },
]

export const hostCard: CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--card-radius)',
  padding: '20px 24px',
}

export const hostInput: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--input-radius)',
  fontSize: '14px',
  backgroundColor: '#ffffff',
  color: 'var(--color-text-primary)',
}

export const hostPrimaryButton: CSSProperties = {
  padding: '10px 20px',
  border: 'none',
  borderRadius: 'var(--btn-radius)',
  backgroundColor: 'var(--color-brand)',
  color: 'var(--color-on-accent)',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
}

export const hostGhostButton: CSSProperties = {
  ...hostPrimaryButton,
  border: '1px solid var(--color-border)',
  backgroundColor: '#ffffff',
  color: 'var(--color-dark)',
}

export const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`

/** Page frame for the host area: title plus the section tabs. */
export default function HostShell({ title, children }: { title: string; children: ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="page-shell" style={{ backgroundColor: 'var(--color-bg-page)', minHeight: '70vh' }}>
      <ProfileIncompleteBanner />
      <div className="surface-deep" style={{ backgroundColor: 'var(--color-deep)', padding: '36px var(--page-padding) 0' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <p style={{ color: 'var(--color-terra)', fontSize: '12px', letterSpacing: '4px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '8px' }}>
            Host
          </p>
          <h1 style={{ color: 'var(--color-on-deep)', fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 800, marginBottom: '20px' }}>{title}</h1>
          <nav style={{ display: 'flex', gap: '4px', overflowX: 'auto' }} aria-label="Host sections">
            {TABS.map(tab => {
              const active = tab.href === '/host' ? pathname === '/host' : pathname.startsWith(tab.href)
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  style={{
                    padding: '10px 18px',
                    fontSize: '14px',
                    fontWeight: 700,
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                    borderRadius: '8px 8px 0 0',
                    color: active ? 'var(--color-dark)' : 'var(--color-on-deep)',
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
