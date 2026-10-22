'use client'

import { useRequireAuth } from '@/lib/auth/useRequireAuth'
import OperatorShell from '@/components/operator/OperatorShell'
import ProfileEditor from '@/components/host/ProfileEditor'

export default function OperatorProfilePage() {
  const { user, loading } = useRequireAuth({ requireOperator: true })
  if (loading || !user) return null

  return (
    <OperatorShell title="Profile">
      <ProfileEditor base="/operator" />
    </OperatorShell>
  )
}
