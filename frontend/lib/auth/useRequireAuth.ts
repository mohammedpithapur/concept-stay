'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from './AuthContext'
import type { User } from '@/lib/types'

interface UseRequireAuthOptions {
  requireAdmin?: boolean
  requireHost?: boolean // approved host or admin
}

interface UseRequireAuthReturn {
  user: User | null
  loading: boolean
}

/**
 * Use at the top of any page that requires authentication.
 * Redirects to /login?next=<current-path> if not logged in.
 * Redirects to / if requireAdmin=true and the user is not an admin.
 */
export function useRequireAuth(options: UseRequireAuthOptions = {}): UseRequireAuthReturn {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading) return // wait for session check to finish

    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`)
      return
    }

    if (options.requireAdmin && user.role !== 'admin') {
      router.replace('/')
      return
    }

    if (options.requireHost && user.role !== 'admin' && !(user.role === 'host' && user.host_status === 'approved')) {
      router.replace('/host/apply')
    }
  }, [user, loading, router, pathname, options.requireAdmin, options.requireHost])

  return { user, loading }
}
