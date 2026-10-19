'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRequireAuth } from '@/lib/auth/useRequireAuth'
import { useAuth } from '@/lib/auth/AuthContext'
import { listHostProperties, labelFor, PROPERTY_TYPES, type HostProperty } from '@/lib/marketplace'
import HostShell, { hostCard, hostPrimaryButton, hostGhostButton, inr } from '@/components/host/HostShell'
import ListingForm from '@/components/host/ListingForm'
import VerifiedBadge from '@/components/property/VerifiedBadge'

const STATUS_STYLE: Record<string, { bg: string; color: string; text: string }> = {
  draft: { bg: '#EEEEEE', color: '#555555', text: 'Draft' },
  pending_review: { bg: '#FFF8E7', color: '#E65100', text: 'Pending review' },
  approved: { bg: '#E8F5E9', color: '#2E7D32', text: 'Live' },
  rejected: { bg: '#FFEBEE', color: '#C62828', text: 'Rejected' },
}

export default function HostListingsPage() {
  const { user, loading } = useRequireAuth({ requireHost: true })
  const { fetchWithAuth } = useAuth()
  const [items, setItems] = useState<HostProperty[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<HostProperty | 'new' | null>(null)

  const load = useCallback(() => {
    listHostProperties(fetchWithAuth).then(setItems).catch(e => setError((e as Error).message))
  }, [fetchWithAuth])

  useEffect(() => { if (user) load() }, [user, load])

  if (loading || !user) return null

  return (
    <HostShell title="Your listings">
      {error && <p role="alert" style={{ color: '#C62828' }}>{error}</p>}

      {editing ? (
        <ListingForm
          property={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      ) : (
        <>
          <div style={{ marginBottom: '20px' }}>
            <button onClick={() => setEditing('new')} style={hostPrimaryButton}>Add a listing</button>
          </div>
          {!items && !error && <p>Loading…</p>}
          {items && items.length === 0 && (
            <div style={hostCard}><p style={{ color: 'var(--color-text-secondary)' }}>You have no listings yet. Add your first one and our team will review it.</p></div>
          )}
          <div style={{ display: 'grid', gap: '14px' }}>
            {items?.map(p => {
              const st = STATUS_STYLE[p.approval_status] ?? STATUS_STYLE.draft
              const cover = p.images.find(i => i.is_primary)?.image_url ?? p.images[0]?.image_url
              return (
                <div key={p.id} style={{ ...hostCard, display: 'flex', gap: '18px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ width: '120px', height: '90px', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'var(--color-bg-card)', flexShrink: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {cover && <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{p.name}</h3>
                    <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                      {p.city}, {p.state} · {labelFor(PROPERTY_TYPES, p.property_type)} · {inr(p.price_per_night)}/night
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ backgroundColor: st.bg, color: st.color, padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>{st.text}</span>
                      {p.pending_changes && (
                        <span style={{ backgroundColor: '#FFF8E7', color: '#E65100', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Edits awaiting review</span>
                      )}
                      <VerifiedBadge status={p.verification_status} />
                    </div>
                    {p.rejection_reason && (
                      <p style={{ marginTop: '10px', fontSize: '13px', color: '#C62828' }}>
                        <strong>Reviewer note:</strong> {p.rejection_reason}
                      </p>
                    )}
                  </div>
                  <button onClick={() => setEditing(p)} style={hostGhostButton}>Edit</button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </HostShell>
  )
}
