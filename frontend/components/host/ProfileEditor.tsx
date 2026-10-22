'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Trash2 } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthContext'
import {
  deleteHostDocument, getHostProfile, saveHostProfile, uploadHostDocument,
  type HostDocType, type HostProfile, type ProfileBase,
} from '@/lib/marketplace'
import { hostCard, hostInput, hostPrimaryButton } from '@/components/host/HostShell'

const DOC_LABELS: Record<HostDocType, string> = {
  aadhaar: 'Aadhaar card',
  passport: 'Passport',
  pan: 'PAN card',
  gst_certificate: 'GST certificate',
  bank_proof: 'Bank proof (cancelled cheque or passbook)',
}

const STATUS_TEXT: Record<HostProfile['kyc_status'], { text: string; color: string }> = {
  incomplete: { text: 'Incomplete', color: '#E65100' },
  submitted: { text: 'Submitted, awaiting verification', color: '#1565C0' },
  verified: { text: 'Verified', color: '#2E7D32' },
  rejected: { text: 'Needs changes', color: '#C62828' },
}

const label: CSSProperties = { display: 'grid', gap: '6px', fontSize: '13px', fontWeight: 600 }
const hint: CSSProperties = { fontSize: '12px', fontWeight: 400, color: 'var(--color-text-muted)' }

type Form = {
  legal_name: string; phone: string; pan_number: string; aadhaar_last4: string; gst_number: string
  bank_holder: string; bank_account_number: string; bank_ifsc: string
}

const fromProfile = (p: HostProfile): Form => ({
  legal_name: p.legal_name ?? '', phone: p.phone ?? '', pan_number: '', aadhaar_last4: p.aadhaar_last4 ?? '',
  gst_number: p.gst_number ?? '', bank_holder: p.bank_holder ?? '', bank_account_number: '', bank_ifsc: p.bank_ifsc ?? '',
})

/** The KYC profile form shared by the host and operator areas. */
export default function ProfileEditor({ base }: { base: ProfileBase }) {
  const { fetchWithAuth } = useAuth()
  const [profile, setProfile] = useState<HostProfile | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [docType, setDocType] = useState<HostDocType>('pan')

  const load = useCallback(async () => {
    try {
      const p = await getHostProfile(fetchWithAuth, base)
      setProfile(p)
      setForm(f => f ?? fromProfile(p))
    } catch (e) { setError((e as Error).message) }
  }, [fetchWithAuth])

  useEffect(() => { void load() }, [load])

  const set = (key: keyof Form, value: string) => setForm(f => (f ? { ...f, [key]: value } : f))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    setBusy(true); setError(null); setMessage(null)
    try {
      // Blank sensitive fields mean "keep what is stored", so a host never has to retype PAN or account number.
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ''))
      const saved = await saveHostProfile(body, fetchWithAuth, base)
      setProfile(saved)
      setForm(fromProfile(saved))
      setMessage(saved.kyc_status === 'submitted' ? 'Saved. Your profile is with our team for verification.' : 'Saved. Add the missing documents to finish.')
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true); setError(null); setMessage(null)
    try { await uploadHostDocument(docType, file, fetchWithAuth, base); await load() }
    catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  const remove = async (id: string) => {
    setBusy(true); setError(null)
    try { await deleteHostDocument(id, fetchWithAuth, base); await load() }
    catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  const status = profile ? STATUS_TEXT[profile.kyc_status] : null

  return (
    <>
    {error && <p role="alert" style={{ color: '#C62828', marginBottom: '12px' }}>{error}</p>}
    {message && <p role="status" style={{ color: '#2E7D32', marginBottom: '12px', fontWeight: 600 }}>{message}</p>}
    {!profile || !form ? (!error && <p>Loading…</p>) : (
      <div style={{ display: 'grid', gap: '20px' }}>
        <div style={hostCard}>
          <p style={{ fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>Verification status</p>
          <p style={{ fontSize: '20px', fontWeight: 800, color: status?.color }}>{status?.text}</p>
          {profile.kyc_status === 'rejected' && profile.rejection_reason && (
            <p style={{ fontSize: '13px', color: '#C62828', marginTop: '6px' }}>Reviewer note: {profile.rejection_reason}</p>
          )}
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
            We need this to pay you. Payouts are released only after our team verifies your profile. Your PAN and bank account number are stored encrypted.
          </p>
        </div>

        <form onSubmit={save} style={{ ...hostCard, display: 'grid', gap: '14px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800 }}>Your details</h2>
          <label style={label}>Legal name (as on your PAN)
            <input style={hostInput} value={form.legal_name} onChange={e => set('legal_name', e.target.value)} />
          </label>
          <label style={label}>Phone
            <input style={hostInput} value={form.phone} onChange={e => set('phone', e.target.value)} />
          </label>
          <label style={label}>PAN
            <input style={hostInput} value={form.pan_number} placeholder={profile.pan_masked ?? 'ABCDE1234F'} onChange={e => set('pan_number', e.target.value)} />
            {profile.pan_masked && <span style={hint}>On file: {profile.pan_masked}. Leave blank to keep it.</span>}
          </label>
          <label style={label}>Aadhaar, last 4 digits only
            <input style={hostInput} value={form.aadhaar_last4} maxLength={4} inputMode="numeric" onChange={e => set('aadhaar_last4', e.target.value)} />
            <span style={hint}>We never store the full Aadhaar number. Upload a masked copy below.</span>
          </label>
          <label style={label}>GST number (if registered)
            <input style={hostInput} value={form.gst_number} onChange={e => set('gst_number', e.target.value)} />
          </label>
          <h2 style={{ fontSize: '18px', fontWeight: 800, marginTop: '8px' }}>Bank account for payouts</h2>
          <label style={label}>Account holder name
            <input style={hostInput} value={form.bank_holder} onChange={e => set('bank_holder', e.target.value)} />
          </label>
          <label style={label}>Account number
            <input style={hostInput} value={form.bank_account_number} placeholder={profile.bank_account_masked ?? ''} inputMode="numeric" onChange={e => set('bank_account_number', e.target.value)} />
            {profile.bank_account_masked && <span style={hint}>On file: {profile.bank_account_masked}. Leave blank to keep it.</span>}
          </label>
          <label style={label}>IFSC
            <input style={hostInput} value={form.bank_ifsc} onChange={e => set('bank_ifsc', e.target.value)} />
          </label>
          <div><button type="submit" disabled={busy} style={{ ...hostPrimaryButton, opacity: busy ? 0.6 : 1 }}>Save profile</button></div>
        </form>

        <div style={{ ...hostCard, display: 'grid', gap: '14px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800 }}>Documents</h2>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Required: PAN card, and either Aadhaar (masked) or passport. JPEG, PNG, WebP or PDF, up to 8 MB.
          </p>
          {profile.documents.length === 0 ? <p style={{ fontSize: '13px' }}>No documents uploaded yet.</p> : (
            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '8px' }}>
              {profile.documents.map(d => (
                <li key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
                  <span><strong>{DOC_LABELS[d.doc_type]}</strong> · {d.filename}</span>
                  <button type="button" aria-label={`Delete ${d.filename}`} disabled={busy} onClick={() => remove(d.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C62828' }}>
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select aria-label="Document type" value={docType} onChange={e => setDocType(e.target.value as HostDocType)} style={{ ...hostInput, width: 'auto' }}>
              {(Object.keys(DOC_LABELS) as HostDocType[]).map(t => <option key={t} value={t}>{DOC_LABELS[t]}</option>)}
            </select>
            <input type="file" aria-label="Choose file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy}
              onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} />
          </div>
        </div>
      </div>
    )}
    </>
  )
}
