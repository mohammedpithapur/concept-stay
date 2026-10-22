'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRequireAuth } from '@/lib/auth/useRequireAuth'
import { useAuth } from '@/lib/auth/AuthContext'
import {
  listOperatorBookings, listOperatorExperiences, listOperatorPayouts,
  type ExperiencePayout, type OperatorBooking, type OperatorExperience,
} from '@/lib/experiences'
import OperatorShell from '@/components/operator/OperatorShell'
import { hostCard, inr } from '@/components/host/HostShell'

type Data = { experiences: OperatorExperience[]; bookings: OperatorBooking[]; payouts: ExperiencePayout[] }

export default function OperatorOverviewPage() {
  const { user, loading } = useRequireAuth({ requireOperator: true })
  const { fetchWithAuth } = useAuth()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    if (!user) return
    Promise.all([
      listOperatorExperiences(fetchWithAuth), listOperatorBookings(fetchWithAuth), listOperatorPayouts(fetchWithAuth),
    ]).then(([experiences, bookings, payouts]) => setData({ experiences, bookings, payouts }))
      .catch(e => setError((e as Error).message))
  }, [user, fetchWithAuth])

  if (loading || !user) return null

  const stats = data && [
    { label: 'Live experiences', value: String(data.experiences.filter(e => e.approval_status === 'approved' && e.is_published).length), href: '/operator/experiences' },
    { label: 'Awaiting review', value: String(data.experiences.filter(e => e.approval_status === 'pending_review' || e.pending_changes).length), href: '/operator/experiences' },
    { label: 'Upcoming bookings', value: String(data.bookings.filter(b => b.status === 'confirmed' && new Date(b.starts_at).getTime() > now).length), href: '/operator/bookings' },
    { label: 'Owed to you', value: inr(data.payouts.filter(p => p.status === 'owed').reduce((sum, p) => sum + p.operator_amount, 0)), href: '/operator/payouts' },
  ]

  return (
    <OperatorShell title="Overview">
      {error && <p role="alert" style={{ color: '#C62828' }}>{error}</p>}
      {!data && !error && <p>Loading…</p>}
      {stats && (
        <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {stats.map(s => (
            <Link key={s.label} href={s.href} style={{ ...hostCard, textDecoration: 'none', color: 'inherit' }}>
              <p style={{ fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>{s.label}</p>
              <p style={{ fontSize: '30px', fontWeight: 800 }}>{s.value}</p>
            </Link>
          ))}
        </div>
      )}
    </OperatorShell>
  )
}
