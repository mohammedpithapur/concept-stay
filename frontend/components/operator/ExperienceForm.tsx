'use client'

import { useState, type CSSProperties } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthContext'
import {
  DIFFICULTIES, EXPERIENCE_CATEGORIES, createExperience, updateExperience, uploadExperienceImage,
  type ExperienceInput, type OperatorExperience,
} from '@/lib/experiences'
import { hostCard, hostGhostButton, hostInput, hostPrimaryButton } from '@/components/host/HostShell'

const label: CSSProperties = { display: 'grid', gap: '6px', fontSize: '13px', fontWeight: 600 }
const MAX_IMAGES = 10

const blank: ExperienceInput = {
  title: '', description: '', images: [], city: '', state: '', meeting_point: '', category: 'adventure', duration_minutes: 120,
  difficulty: 'easy', min_age: 0, languages: [], included: '', what_to_bring: '', price_per_person: 0,
}

// A live listing keeps showing its last approved data; the form starts from the pending edit when there is one.
const startingValues = (exp: OperatorExperience | null): ExperienceInput =>
  exp ? { ...pick(exp), ...(exp.pending_changes as Partial<ExperienceInput> | null) } : blank

const pick = (e: OperatorExperience): ExperienceInput => ({
  title: e.title, description: e.description, images: e.images, city: e.city, state: e.state, meeting_point: e.meeting_point,
  category: e.category, duration_minutes: e.duration_minutes, difficulty: e.difficulty, min_age: e.min_age, languages: e.languages,
  included: e.included, what_to_bring: e.what_to_bring, price_per_person: e.price_per_person,
})

type Props = { experience: OperatorExperience | null; onCancel: () => void; onSaved: () => void }

export default function ExperienceForm({ experience, onCancel, onSaved }: Props) {
  const { fetchWithAuth } = useAuth()
  const [form, setForm] = useState<ExperienceInput>(() => startingValues(experience))
  const [languagesText, setLanguagesText] = useState(() => startingValues(experience).languages.join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof ExperienceInput>(key: K, value: ExperienceInput[K]) => setForm(f => ({ ...f, [key]: value }))

  const addPhoto = async (file: File | undefined) => {
    if (!file) return
    setBusy(true); setError(null)
    try { set('images', [...form.images, await uploadExperienceImage(file, fetchWithAuth)]) }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    const body: ExperienceInput = {
      ...form, languages: languagesText.split(',').map(l => l.trim()).filter(Boolean),
    }
    try {
      if (experience) {
        const before = pick(experience)
        const changed = Object.fromEntries(
          (Object.keys(body) as (keyof ExperienceInput)[]).filter(k => JSON.stringify(body[k]) !== JSON.stringify(before[k])).map(k => [k, body[k]]),
        )
        await updateExperience(experience.id, changed, fetchWithAuth)
      } else {
        await createExperience(body, fetchWithAuth)
      }
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ ...hostCard, display: 'grid', gap: '14px', maxWidth: '760px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800 }}>{experience ? 'Edit experience' : 'New experience'}</h2>
      {experience?.approval_status === 'approved' && (
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          This experience is live. Your edits are reviewed by our team before guests see them.
        </p>
      )}
      <label style={label}>Title
        <input style={hostInput} required value={form.title} onChange={e => set('title', e.target.value)} />
      </label>
      <label style={label}>Description
        <textarea style={{ ...hostInput, minHeight: '110px' }} value={form.description} onChange={e => set('description', e.target.value)} />
      </label>
      <div style={{ display: 'grid', gap: '14px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <label style={label}>City
          <input style={hostInput} required value={form.city} onChange={e => set('city', e.target.value)} />
        </label>
        <label style={label}>State
          <input style={hostInput} required value={form.state} onChange={e => set('state', e.target.value)} />
        </label>
      </div>
      <label style={label}>Meeting point (shown to guests after they book)
        <textarea style={{ ...hostInput, minHeight: '70px' }} value={form.meeting_point} onChange={e => set('meeting_point', e.target.value)} />
      </label>
      <div style={{ display: 'grid', gap: '14px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <label style={label}>Category
          <select style={hostInput} value={form.category} onChange={e => set('category', e.target.value)}>
            {EXPERIENCE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label style={label}>Difficulty
          <select style={hostInput} value={form.difficulty} onChange={e => set('difficulty', e.target.value)}>
            {DIFFICULTIES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </label>
        <label style={label}>Duration (minutes)
          <input style={hostInput} type="number" min={1} required value={form.duration_minutes} onChange={e => set('duration_minutes', Number(e.target.value))} />
        </label>
        <label style={label}>Minimum age
          <input style={hostInput} type="number" min={0} value={form.min_age} onChange={e => set('min_age', Number(e.target.value))} />
        </label>
        <label style={label}>Price per person (rupees)
          <input style={hostInput} type="number" min={1} required value={form.price_per_person || ''} onChange={e => set('price_per_person', Number(e.target.value))} />
        </label>
      </div>
      <label style={label}>Languages (comma separated)
        <input style={hostInput} value={languagesText} onChange={e => setLanguagesText(e.target.value)} placeholder="English, Hindi" />
      </label>
      <label style={label}>What is included
        <textarea style={{ ...hostInput, minHeight: '70px' }} value={form.included} onChange={e => set('included', e.target.value)} />
      </label>
      <label style={label}>What to bring
        <textarea style={{ ...hostInput, minHeight: '70px' }} value={form.what_to_bring} onChange={e => set('what_to_bring', e.target.value)} />
      </label>

      <div style={{ display: 'grid', gap: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600 }}>Photos ({form.images.length} of {MAX_IMAGES})</span>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {form.images.map((url, i) => (
            <div key={url + i} style={{ position: 'relative', width: '96px', height: '72px', borderRadius: '8px', overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button type="button" aria-label="Remove photo" onClick={() => set('images', form.images.filter((_, j) => j !== i))}
                style={{ position: 'absolute', top: '4px', right: '4px', border: 'none', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.9)', cursor: 'pointer' }}>
                <Trash2 size={14} aria-hidden />
              </button>
            </div>
          ))}
        </div>
        {form.images.length < MAX_IMAGES && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
            <ImagePlus size={16} aria-hidden /> Add a photo
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} style={{ display: 'none' }}
              onChange={e => { void addPhoto(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        )}
      </div>

      {error && <p role="alert" style={{ color: '#C62828', fontSize: '14px' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="submit" disabled={busy} style={{ ...hostPrimaryButton, opacity: busy ? 0.6 : 1 }}>
          {experience ? 'Save changes' : 'Submit for review'}
        </button>
        <button type="button" onClick={onCancel} style={hostGhostButton}>Cancel</button>
      </div>
    </form>
  )
}
