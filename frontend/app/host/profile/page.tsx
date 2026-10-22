'use client'

import { useRequireAuth } from '@/lib/auth/useRequireAuth'
import HostShell from '@/components/host/HostShell'
import ProfileEditor from '@/components/host/ProfileEditor'

export default function HostProfilePage() {
  const { user, loading } = useRequireAuth({ requireHost: true })
  if (loading || !user) return null

  return (
    <HostShell title="Profile">
      <ProfileEditor base="/host" />
    </HostShell>
  )
}
