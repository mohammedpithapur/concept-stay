'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRequireAuth } from '@/lib/auth/useRequireAuth'
import { useAuth } from '@/lib/auth/AuthContext'
import {
  EXPERIENCE_CATEGORIES, labelOf, listOperatorExperiences, unpublishExperience, type OperatorExperience,
} from '@/lib/experiences'
import OperatorShell from '@/components/operator/OperatorShell'
import ExperienceForm from '@/components/operator/ExperienceForm'
import { hostCard, hostGhostButton, hostPrimaryButton, inr } from '@/components/host/HostShell'

const STATUS_STYLE: Record<string, { bg: string; color: string; text: string }> = {
  draft: { bg: '#EEEEEE', color: '#555555', text: 'Draft' },
  pending_review: { bg: '#FFF8E7', color: '#E65100', text: 'Pending review' },
  approved: { bg: '#E8F5E9', color: '#2E7D32', text: 'Live' },
  rejected: { bg: '#FFEBEE', color: '#C62828', text: 'Rejected' },
}

const chip = (bg: string, color: string) => ({
  backgroundColor: bg, color, padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' as const,
})

export default function OperatorExperiencesPage() {
  const { user, loading } = useRequireAuth({ requireOperator: true })
  const { fetchWithAuth } = useAuth()
  const [items, setItems] = useState<OperatorExperience[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<OperatorExperience | 'new' | null>(null)

  const load = useCallback(() => {
    listOperatorExperiences(fetchWithAuth).then(setItems).catch(e => setError((e as Error).message))
  }, [fetchWithAuth])

  useEffect(() => { if (user) load() }, [user, load])

  if (loading || !user) return null

  const hide = async (id: string) => {
    setError(null)
    try { await unpublishExperience(id, fetchWithAuth); load() } catch (e) { setError((e as Error).message) }
  }

  return (
    <OperatorShell title="Your experiences">
      {error && <p role="alert" style={{ color: '#C62828' }}>{error}</p>}
      {editing ? (
        <ExperienceForm
          experience={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      ) : (
        <>
          <div style={{ marginBottom: '20px' }}>
            <button onClick={() => setEditing('new')} style={hostPrimaryButton}>Add an experience</button>
          </div>
          {!items && !error && <p>Loading…</p>}
          {items && items.length === 0 && (
            <div style={hostCard}><p style={{ color: 'var(--color-text-secondary)' }}>No experiences yet. Add your first one and our team will review it.</p></div>
          )}
          <div style={{ display: 'grid', gap: '14px' }}>
            {items?.map(e => {
              const st = STATUS_STYLE[e.approval_status] ?? STATUS_STYLE.draft
              return (
                <div key={e.id} style={{ ...hostCard, display: 'flex', gap: '18px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ width: '120px', height: '90px', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'var(--color-bg-card)', flexShrink: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {e.images[0] && <img src={e.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{e.title}</h3>
                    <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                      {e.city}, {e.state} · {labelOf(EXPERIENCE_CATEGORIES, e.category)} · {inr(e.price_per_person)} per person
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={chip(st.bg, st.color)}>{st.text}</span>
                      {e.approval_status === 'approved' && !e.is_published && <span style={chip('#EEEEEE', '#555555')}>Hidden</span>}
                      {e.pending_changes && <span style={chip('#FFF8E7', '#E65100')}>Edits awaiting review</span>}
                    </div>
                    {e.rejection_reason && (
                      <p style={{ fontSize: '13px', color: '#C62828', marginTop: '8px' }}>Reviewer note: {e.rejection_reason}</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setEditing(e)} style={hostGhostButton}>Edit</button>
                    {e.is_published && <button onClick={() => hide(e.id)} style={hostGhostButton}>Hide</button>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </OperatorShell>
  )
}
