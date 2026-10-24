'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthContext'
import { getProfileCompleteness, type ProfileBase } from '@/lib/marketplace'

/** Sits under the site navbar on every host or operator page (except the profile page itself) until the payout profile is complete. */
export default function ProfileIncompleteBanner({ base = '/host' }: { base?: ProfileBase }) {
  const { user, fetchWithAuth } = useAuth()
  const pathname = usePathname()
  const [incomplete, setIncomplete] = useState(false)
  const onProfilePage = pathname.startsWith(`${base}/profile`)

  useEffect(() => {
    if (!user || onProfilePage) return
    let cancelled = false
    getProfileCompleteness(fetchWithAuth, base)
      .then(c => { if (!cancelled) setIncomplete(!c.complete) })
      .catch(() => { if (!cancelled) setIncomplete(false) })
    return () => { cancelled = true }
  }, [user, fetchWithAuth, onProfilePage, base])

  if (!incomplete || onProfilePage) return null

  return (
    <div
      role="status"
      style={{ backgroundColor: '#fdf1dc', borderBottom: '1px solid #e8c98a', padding: '12px var(--page-padding)' }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <AlertTriangle size={18} style={{ color: 'var(--color-terra)', flexShrink: 0 }} />
        <p style={{ flex: 1, minWidth: '220px', margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--color-dark)' }}>
          <strong>Your profile is not completed yet.</strong> Add your ID, PAN and bank details so Concept Stay can pay you. You can keep working meanwhile, but payouts wait until your profile is verified.
        </p>
        <Link
          href={`${base}/profile`}
          style={{ padding: '8px 18px', borderRadius: 'var(--btn-radius)', backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', fontSize: '13px', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          Complete profile
        </Link>
      </div>
    </div>
  )
}
