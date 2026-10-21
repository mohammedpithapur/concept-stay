'use client'
import { AuthProvider } from '@/lib/auth/AuthContext'
import { CurrencyProvider } from '@/lib/currency'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CurrencyProvider>{children}</CurrencyProvider>
    </AuthProvider>
  )
}
