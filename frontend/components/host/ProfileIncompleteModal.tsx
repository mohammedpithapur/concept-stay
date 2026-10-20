'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { UserCheck, X } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthContext'
import { getProfileCompleteness } from '@/lib/marketplace'

/** Shown on every host page (except the profile page itself) until the payout profile is complete. */
export default function ProfileIncompleteModal() {
  const { user, fetchWithAuth } = useAuth()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const onProfilePage = pathname.startsWith('/host/profile')

  useEffect(() => {
    if (!user || onProfilePage) return
    let cancelled = false
    getProfileCompleteness(fetchWithAuth)
      .then(c => { if (!cancelled) setOpen(!c.complete) })
      .catch(() => { if (!cancelled) setOpen(false) })
    return () => { cancelled = true }
  }, [user, fetchWithAuth, onProfilePage])

  if (!open || onProfilePage) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-incomplete-title"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', padding: '16px' }}
    >
      <div style={{ position: 'relative', backgroundColor: '#ffffff', borderRadius: 'var(--card-radius)', padding: '28px', maxWidth: '420px', width: '100%' }}>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setOpen(false)}
          style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
        >
          <X size={18} />
        </button>
        <UserCheck size={28} style={{ color: 'var(--color-terra)', marginBottom: '12px' }} />
        <h2 id="profile-incomplete-title" style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>
          Your profile is not completed yet.
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>
          Add your ID, PAN and bank details so Concept Stay can pay you. You can keep listing properties meanwhile, but payouts wait until your profile is verified.
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Link
            href="/host/profile"
            style={{ padding: '10px 20px', borderRadius: 'var(--btn-radius)', backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}
          >
            Complete profile
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{ padding: '10px 20px', borderRadius: 'var(--btn-radius)', border: '1px solid var(--color-border)', backgroundColor: '#ffffff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  )
}
