'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import {
  VERIFICATION_STATUSES, approveListing, listAdminPayouts, listHosts, listReviewQueue, markPayoutPaid,
  rejectListing, setHostStatus, setListingVerification,
  type HostProperty, type HostUser, type Payout, type VerificationStatus,
} from '@/lib/marketplace'

const card: CSSProperties = { backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '20px 24px' }
const input: CSSProperties = { padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '13px', backgroundColor: '#ffffff' }
const primary: CSSProperties = { padding: '8px 16px', border: 'none', borderRadius: '8px', backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }
const ghost: CSSProperties = { ...primary, border: '1px solid var(--color-border)', backgroundColor: '#ffffff', color: 'var(--color-dark)' }
const danger: CSSProperties = { ...primary, backgroundColor: '#C62828', color: '#ffffff' }
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`

function useLoader<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(() => {
    fetcher().then(d => { setData(d); setError(null) }).catch(e => setError((e as Error).message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(reload, [reload])
  return { data, error, reload, setError }
}

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))

// ── Listing review queue ──────────────────────────────────────────────────────

function Photos({ items }: { items: unknown[] }) {
  const urls = items
    .map(i => (i as { image_url?: string; url?: string })?.image_url ?? (i as { url?: string })?.url)
    .filter((u): u is string => typeof u === 'string' && u.length > 0)
  if (!urls.length) return <>{items.length} photos</>
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {urls.slice(0, 8).map(u => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={u} src={u} alt="" style={{ width: '56px', height: '42px', objectFit: 'cover', borderRadius: '4px' }} />
      ))}
      {urls.length > 8 && <span style={{ fontSize: '12px', alignSelf: 'center' }}>+{urls.length - 8}</span>}
    </div>
  )
}

function ReviewCard({ p, onChanged, onError }: { p: HostProperty; onChanged: () => void; onError: (m: string) => void }) {
  const { fetchWithAuth } = useAuth()
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const changes = Object.entries(p.pending_changes ?? {})

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try { await fn(); onChanged() } catch (e) { onError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{p.name}</h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            {p.city}, {p.state} · ₹{p.price_per_night}/night · {p.images.length} photo{p.images.length === 1 ? '' : 's'}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            {p.approval_status === 'pending_review' ? 'New listing' : 'Edit to live listing'} · host {p.owner_id}
          </p>
        </div>
        <label style={{ fontSize: '12px', display: 'grid', gap: '4px' }}>
          Verification
          <select value={p.verification_status} disabled={busy} style={input}
            onChange={e => run(() => setListingVerification(p.id, e.target.value as VerificationStatus, fetchWithAuth))}>
            {VERIFICATION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      {changes.length > 0 && (
        <table style={{ width: '100%', marginTop: '14px', fontSize: '13px', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--color-text-muted)' }}><th>Field</th><th>Current</th><th>Proposed</th></tr></thead>
          <tbody>
            {changes.map(([key, next]) => (
              <tr key={key} style={{ borderTop: '1px solid var(--color-border)', verticalAlign: 'top' }}>
                <td style={{ padding: '6px 8px 6px 0', fontWeight: 600 }}>{key}</td>
                <td style={{ padding: '6px 8px', color: 'var(--color-text-secondary)' }}>
                  {key === 'images' ? <Photos items={p.images} /> : show((p as unknown as Record<string, unknown>)[key])}
                </td>
                <td style={{ padding: '6px 0' }}>{key === 'images' ? <Photos items={next as unknown[]} /> : show(next)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button disabled={busy} style={primary} onClick={() => run(() => approveListing(p.id, fetchWithAuth))}>Approve &amp; publish</button>
        {!rejecting && <button disabled={busy} style={ghost} onClick={() => setRejecting(true)}>Reject…</button>}
        {rejecting && (
          <>
            <input placeholder="Reason shown to the host" value={reason} onChange={e => setReason(e.target.value)} style={{ ...input, flex: 1, minWidth: '220px' }} />
            <button disabled={busy || !reason.trim()} style={danger} onClick={() => run(() => rejectListing(p.id, reason.trim(), fetchWithAuth))}>Send rejection</button>
          </>
        )}
      </div>
    </div>
  )
}

export function ReviewQueueTab() {
  const { fetchWithAuth } = useAuth()
  const { data, error, reload, setError } = useLoader(() => listReviewQueue(fetchWithAuth))
  return (
    <div>
      <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '16px' }}>Listing review queue</h2>
      {error && <p role="alert" style={{ color: '#C62828' }}>{error}</p>}
      {!data && !error && <p>Loading…</p>}
      {data?.length === 0 && <div style={card}>Nothing waiting for review.</div>}
      <div style={{ display: 'grid', gap: '16px' }}>
        {data?.map(p => <ReviewCard key={p.id} p={p} onChanged={reload} onError={setError} />)}
      </div>
    </div>
  )
}

// ── Hosts ─────────────────────────────────────────────────────────────────────

export function HostsTab() {
  const { fetchWithAuth } = useAuth()
  const { data, error, reload, setError } = useLoader(() => listHosts(fetchWithAuth))

  const change = async (h: HostUser, status: HostUser['host_status']) => {
    try { await setHostStatus(h.id, status, fetchWithAuth); reload() } catch (e) { setError((e as Error).message) }
  }

  return (
    <div>
      <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '16px' }}>Hosts</h2>
      {error && <p role="alert" style={{ color: '#C62828' }}>{error}</p>}
      {!data && !error && <p>Loading…</p>}
      {data?.length === 0 && <div style={card}>No host applications yet.</div>}
      <div style={{ display: 'grid', gap: '12px' }}>
        {data?.map(h => (
          <div key={h.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: 700 }}>{h.full_name}</p>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{h.email}{h.phone ? ` · ${h.phone}` : ''}</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>{h.host_status}</span>
              {h.host_status !== 'approved' && <button style={primary} onClick={() => change(h, 'approved')}>Approve</button>}
              {h.host_status !== 'suspended' && <button style={ghost} onClick={() => change(h, 'suspended')}>Suspend</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Payouts ───────────────────────────────────────────────────────────────────

export function PayoutsTab() {
  const { fetchWithAuth } = useAuth()
  const [status, setStatus] = useState('owed')
  const { data, error, reload, setError } = useLoader(() => listAdminPayouts(status || undefined, fetchWithAuth))
  const [refs, setRefs] = useState<Record<string, string>>({})

  useEffect(reload, [status, reload])

  const pay = async (p: Payout) => {
    try { await markPayoutPaid(p.id, (refs[p.id] ?? '').trim(), fetchWithAuth); reload() } catch (e) { setError((e as Error).message) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800 }}>Host payouts</h2>
        <select value={status} onChange={e => setStatus(e.target.value)} style={input} aria-label="Filter payouts">
          <option value="owed">Owed</option><option value="paid">Paid</option><option value="voided">Voided</option><option value="">All</option>
        </select>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
        Pay the host outside the platform (bank transfer / UPI), then record the transaction reference here.
      </p>
      {error && <p role="alert" style={{ color: '#C62828' }}>{error}</p>}
      {!data && !error && <p>Loading…</p>}
      {data?.length === 0 && <div style={card}>No payouts in this view.</div>}
      <div style={{ display: 'grid', gap: '12px' }}>
        {data?.map(p => (
          <div key={p.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '20px', fontWeight: 800 }}>{inr(p.host_amount)}</p>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                Guest paid {inr(p.gross_amount)} · commission {inr(p.commission)} · fee {inr(p.fees)} · taxes {inr(p.taxes)}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Host {p.host_id} · booking {p.booking_id}</p>
            </div>
            {p.status === 'owed' ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input placeholder="UTR / reference" style={input} value={refs[p.id] ?? ''} onChange={e => setRefs({ ...refs, [p.id]: e.target.value })} />
                <button style={primary} disabled={!(refs[p.id] ?? '').trim()} onClick={() => pay(p)}>Mark paid</button>
              </div>
            ) : (
              <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>{p.status}{p.reference ? ` · ${p.reference}` : ''}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
