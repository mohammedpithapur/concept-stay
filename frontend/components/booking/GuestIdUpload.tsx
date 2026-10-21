'use client'

import { useCallback, useEffect, useState } from 'react'
import { IdCard } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthContext'
import { getGuestId, uploadGuestId, type GuestIdDocType, type GuestIdInfo, type GuestIdStatus } from '@/lib/marketplace'

const TYPES: { value: GuestIdDocType; label: string }[] = [
  { value: 'aadhaar', label: 'Aadhaar (masked copy)' },
  { value: 'passport', label: 'Passport' },
  { value: 'driving_licence', label: 'Driving licence' },
  { value: 'voter_id', label: 'Voter ID' },
]

const CHIP: Record<GuestIdStatus, { text: string; bg: string; color: string }> = {
  missing: { text: 'ID needed', bg: '#FFF8E7', color: '#E65100' },
  pending: { text: 'Waiting for host', bg: '#E3F2FD', color: '#1565C0' },
  approved: { text: 'ID approved', bg: '#E8F5E9', color: '#2E7D32' },
  rejected: { text: 'ID rejected', bg: '#FFEBEE', color: '#C62828' },
}

/** Lets a guest add the government ID for a paid booking and shows what the host decided. */
export default function GuestIdUpload({ bookingId, onChanged }: { bookingId: string; onChanged?: () => void }) {
  const { fetchWithAuth } = useAuth()
  const [info, setInfo] = useState<GuestIdInfo | null>(null)
  const [docType, setDocType] = useState<GuestIdDocType>('aadhaar')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    getGuestId(bookingId, fetchWithAuth).then(setInfo).catch(e => setError((e as Error).message))
  }, [bookingId, fetchWithAuth])

  useEffect(load, [load])

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true); setError(null)
    try { setInfo(await uploadGuestId(bookingId, docType, file, fetchWithAuth)); onChanged?.() }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  if (!info) return error ? <p role="alert" style={{ color: '#C62828', fontSize: '13px' }}>{error}</p> : null
  const chip = CHIP[info.status]

  return (
    <div style={{ marginTop: '14px', borderTop: '1px solid var(--color-border)', paddingTop: '14px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <IdCard size={16} style={{ color: 'var(--color-terra)' }} />
        <strong style={{ fontSize: '13px' }}>Guest ID</strong>
        <span style={{ backgroundColor: chip.bg, color: chip.color, padding: '2px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
          {chip.text}
        </span>
      </div>
      {info.status === 'rejected' && info.rejection_reason && (
        <p style={{ fontSize: '12px', color: '#C62828', marginTop: '6px' }}>Host note: {info.rejection_reason}</p>
      )}
      {error && <p role="alert" style={{ fontSize: '12px', color: '#C62828', marginTop: '6px' }}>{error}</p>}
      {info.status !== 'approved' && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', alignItems: 'center' }}>
          <select aria-label="ID type" value={docType} onChange={e => setDocType(e.target.value as GuestIdDocType)}
            style={{ padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '13px' }}>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input type="file" aria-label="Choose ID file" disabled={busy} accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} style={{ fontSize: '12px' }} />
        </div>
      )}
      <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '8px', lineHeight: 1.5 }}>
        Your host checks this before arrival. It is stored privately and deleted 30 days after check-out.
      </p>
    </div>
  )
}
