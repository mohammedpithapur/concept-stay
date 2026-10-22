'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import {
  approveExperience, getCommission, getTravellerReport, listExperienceQueue, listExperiencePayouts, listOperators,
  markExperiencePayoutPaid, refundExperienceBooking, rejectExperience, setCommission, setOperatorStatus,
  unpublishExperienceAdmin,
  type ExperiencePayout, type OperatorExperience, type OperatorUser, type TravellerReport,
} from '@/lib/experiences'

const card: CSSProperties = { backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '20px 24px' }
const input: CSSProperties = { padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '13px', backgroundColor: '#ffffff' }
const primary: CSSProperties = { padding: '8px 16px', border: 'none', borderRadius: '8px', backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }
const ghost: CSSProperties = { ...primary, border: '1px solid var(--color-border)', backgroundColor: '#ffffff', color: 'var(--color-dark)' }
const danger: CSSProperties = { ...primary, backgroundColor: '#C62828', color: '#ffffff' }
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`
const heading: CSSProperties = { fontSize: '22px', fontWeight: 800, marginBottom: '16px' }

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

// ── Operators ─────────────────────────────────────────────────────────────────

export function OperatorsTab() {
  const { fetchWithAuth } = useAuth()
  const { data, error, reload, setError } = useLoader(() => listOperators(fetchWithAuth))

  const change = async (o: OperatorUser, status: OperatorUser['operator_status']) => {
    try { await setOperatorStatus(o.id, status, fetchWithAuth); reload() } catch (e) { setError((e as Error).message) }
  }

  return (
    <div>
      <h2 style={heading}>Operators</h2>
      {error && <p role="alert" style={{ color: '#C62828' }}>{error}</p>}
      {!data && !error && <p>Loading…</p>}
      {data?.length === 0 && <div style={card}>No operator applications yet.</div>}
      <div style={{ display: 'grid', gap: '12px' }}>
        {data?.map(o => (
          <div key={o.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: 700 }}>{o.full_name}</p>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{o.email}</p>
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Check their KYC in the Host KYC tab before paying out.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>{o.operator_status}</span>
              {o.operator_status !== 'approved' && <button style={primary} onClick={() => change(o, 'approved')}>Approve</button>}
              {o.operator_status !== 'suspended' && <button style={ghost} onClick={() => change(o, 'suspended')}>Suspend</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Experience review ─────────────────────────────────────────────────────────

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))

function ReviewCard({ e, onChanged, onError }: { e: OperatorExperience; onChanged: () => void; onError: (m: string) => void }) {
  const { fetchWithAuth } = useAuth()
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const changes = Object.entries(e.pending_changes ?? {})

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try { await fn(); onChanged() } catch (err) { onError((err as Error).message) } finally { setBusy(false) }
  }

  return (
    <div style={card}>
      <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{e.title}</h3>
      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
        {e.city}, {e.state} · {inr(e.price_per_person)} per person · {e.images.length} photo{e.images.length === 1 ? '' : 's'}
      </p>
      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
        {e.approval_status === 'pending_review' ? 'New listing' : 'Edit to live listing'} · operator {e.operator_id}
      </p>
      {changes.length > 0 && (
        <table style={{ width: '100%', marginTop: '14px', fontSize: '13px', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--color-text-muted)' }}><th>Field</th><th>Current</th><th>Proposed</th></tr></thead>
          <tbody>
            {changes.map(([key, next]) => (
              <tr key={key} style={{ borderTop: '1px solid var(--color-border)', verticalAlign: 'top' }}>
                <td style={{ padding: '6px 8px 6px 0', fontWeight: 600 }}>{key}</td>
                <td style={{ padding: '6px 8px', color: 'var(--color-text-secondary)' }}>{show((e as unknown as Record<string, unknown>)[key])}</td>
                <td style={{ padding: '6px 0' }}>{show(next)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button disabled={busy} style={primary} onClick={() => run(() => approveExperience(e.id, fetchWithAuth))}>Approve &amp; publish</button>
        {!rejecting && <button disabled={busy} style={ghost} onClick={() => setRejecting(true)}>Reject…</button>}
        {rejecting && (
          <>
            <input placeholder="Reason shown to the operator" value={reason} onChange={ev => setReason(ev.target.value)} style={{ ...input, flex: 1, minWidth: '220px' }} />
            <button disabled={busy || !reason.trim()} style={danger} onClick={() => run(() => rejectExperience(e.id, reason.trim(), fetchWithAuth))}>Send rejection</button>
          </>
        )}
        {e.is_published && <button disabled={busy} style={ghost} onClick={() => run(() => unpublishExperienceAdmin(e.id, fetchWithAuth))}>Unpublish</button>}
      </div>
    </div>
  )
}

export function ExperienceReviewTab() {
  const { fetchWithAuth } = useAuth()
  const { data, error, reload, setError } = useLoader(() => listExperienceQueue(fetchWithAuth))
  return (
    <div>
      <h2 style={heading}>Experience review queue</h2>
      {error && <p role="alert" style={{ color: '#C62828' }}>{error}</p>}
      {!data && !error && <p>Loading…</p>}
      {data?.length === 0 && <div style={card}>Nothing waiting for review.</div>}
      <div style={{ display: 'grid', gap: '16px' }}>
        {data?.map(e => <ReviewCard key={e.id} e={e} onChanged={reload} onError={setError} />)}
      </div>
    </div>
  )
}

// ── Payouts and refunds ───────────────────────────────────────────────────────

export function ExperiencePayoutsTab() {
  const { fetchWithAuth } = useAuth()
  const [status, setStatus] = useState('owed')
  const { data, error, reload, setError } = useLoader(() => listExperiencePayouts(status || undefined, fetchWithAuth))
  const [refs, setRefs] = useState<Record<string, string>>({})
  const [bookingId, setBookingId] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [refundNote, setRefundNote] = useState<string | null>(null)

  useEffect(reload, [status, reload])

  const pay = async (p: ExperiencePayout) => {
    try { await markExperiencePayoutPaid(p.id, (refs[p.id] ?? '').trim(), fetchWithAuth); reload() } catch (e) { setError((e as Error).message) }
  }

  const refund = async () => {
    setRefundNote(null)
    try {
      const res = await refundExperienceBooking(bookingId.trim(), fetchWithAuth)
      setRefundNote(res.payout_needs_recovery
        ? 'Refunded. Note: we had already paid the operator, so recover that amount from them by hand.'
        : 'Refunded. The seats are back on the slot and the payout is voided.')
      setConfirming(false); setBookingId(''); reload()
    } catch (e) { setError((e as Error).message); setConfirming(false) }
  }

  return (
    <div>
      <h2 style={heading}>Experience payouts</h2>
      {error && <p role="alert" style={{ color: '#C62828' }}>{error}</p>}
      <label style={{ fontSize: '13px', display: 'inline-grid', gap: '4px', marginBottom: '16px' }}>
        Show
        <select value={status} onChange={e => setStatus(e.target.value)} style={input}>
          <option value="owed">Owed</option><option value="paid">Paid</option><option value="voided">Voided</option><option value="">All</option>
        </select>
      </label>
      {!data && !error && <p>Loading…</p>}
      {data?.length === 0 && <div style={card}>No payouts here.</div>}
      <div style={{ display: 'grid', gap: '12px', marginBottom: '28px' }}>
        {data?.map(p => {
          const blocked = p.operator_kyc_status !== 'verified' && p.operator_kyc_status !== 'exempt'
          return (
            <div key={p.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '20px', fontWeight: 800 }}>{inr(p.operator_amount)}</p>
                <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  Guest paid {inr(p.gross_amount)} · commission {inr(p.commission)} · fee {inr(p.fees)} · taxes {inr(p.taxes)} · operator {p.operator_id}
                </p>
                <p style={{ fontSize: '12px', color: blocked ? '#C62828' : 'var(--color-text-muted)' }}>
                  {p.status === 'paid' ? `Paid, reference ${p.reference ?? ''}` : blocked ? 'KYC not verified' : 'KYC verified'}
                </p>
              </div>
              {p.status === 'owed' && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input placeholder="Bank reference" value={refs[p.id] ?? ''} onChange={e => setRefs(r => ({ ...r, [p.id]: e.target.value }))} style={input} />
                  <button style={{ ...primary, opacity: blocked ? 0.5 : 1 }} disabled={blocked || !(refs[p.id] ?? '').trim()} onClick={() => pay(p)}>Mark paid</button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={card}>
        <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '8px' }}>Refund a booking</h3>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
          Full refund of a paid experience booking. The seats return to the slot and an unpaid payout is voided.
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input aria-label="Booking id to refund" placeholder="Booking id" value={bookingId} onChange={e => { setBookingId(e.target.value); setConfirming(false) }} style={{ ...input, minWidth: '300px' }} />
          {!confirming && <button style={ghost} disabled={!bookingId.trim()} onClick={() => setConfirming(true)}>Refund booking</button>}
          {confirming && <button style={danger} onClick={refund}>Confirm refund</button>}
        </div>
        {refundNote && <p role="status" style={{ marginTop: '10px', fontWeight: 600 }}>{refundNote}</p>}
      </div>
    </div>
  )
}

// ── Commission ────────────────────────────────────────────────────────────────

export function CommissionTab() {
  const { fetchWithAuth } = useAuth()
  const { data, error, reload, setError } = useLoader(() => getCommission(fetchWithAuth))
  const [draft, setDraft] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const value = draft ?? (data ? String(data.percent) : '')

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaved(false)
    try { await setCommission(Number(value), fetchWithAuth); setDraft(null); setSaved(true); reload() } catch (err) { setError((err as Error).message) }
  }

  return (
    <div>
      <h2 style={heading}>Experience commission</h2>
      {error && <p role="alert" style={{ color: '#C62828' }}>{error}</p>}
      <form onSubmit={save} style={{ ...card, display: 'grid', gap: '12px', maxWidth: '420px' }}>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          One rate for every operator, taken from the experience price. Bookings keep the rate they were made at.
        </p>
        <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>Commission percent
          <input type="number" min={0} max={100} value={value} onChange={e => setDraft(e.target.value)} style={input} />
        </label>
        <div><button type="submit" style={primary} disabled={value === ''}>Save commission</button></div>
        {saved && <p role="status" style={{ fontWeight: 600, color: '#2E7D32' }}>Saved.</p>}
      </form>
    </div>
  )
}

// ── Traveller report ──────────────────────────────────────────────────────────

const PAGE = 25

export function TravellerReportTab() {
  const { fetchWithAuth } = useAuth()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [offset, setOffset] = useState(0)
  const [report, setReport] = useState<TravellerReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    getTravellerReport({ from, to, limit: PAGE, offset }, fetchWithAuth)
      .then(r => { if (live) { setReport(r); setError(null) } })
      .catch(e => { if (live) setError((e as Error).message) })
    return () => { live = false }
  }, [from, to, offset, fetchWithAuth])

  const cell: CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: '14px', borderBottom: '1px solid var(--color-border)' }

  return (
    <div>
      <h2 style={heading}>Traveller report</h2>
      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
        What Concept Stay earned from each traveller (commission plus service fee), stays and experiences together. Refunded and voided bookings count as zero.
      </p>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>From
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setOffset(0) }} style={input} />
        </label>
        <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>To
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setOffset(0) }} style={input} />
        </label>
      </div>
      {error && <p role="alert" style={{ color: '#C62828' }}>{error}</p>}
      {!report && !error && <p>Loading…</p>}
      {report && (
        <>
          <p style={{ fontSize: '13px', marginBottom: '8px' }}>{report.total} travellers</p>
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Traveller', 'Stays', 'Experiences', 'Total'].map(h => <th key={h} style={{ ...cell, fontSize: '12px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {report.items.map(r => (
                  <tr key={r.user_id}>
                    <td style={cell}><strong>{r.full_name}</strong><br /><span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{r.email}</span></td>
                    <td style={cell}>{inr(r.stay_revenue)}</td>
                    <td style={cell}>{inr(r.experience_revenue)}</td>
                    <td style={{ ...cell, fontWeight: 800 }}>{inr(r.total_revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button style={ghost} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</button>
            <button style={ghost} disabled={offset + PAGE >= report.total} onClick={() => setOffset(offset + PAGE)}>Next</button>
          </div>
        </>
      )}
    </div>
  )
}
