'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { uploadPropertyImage } from '@/lib/supabase/storage'
import {
  CANCELLATION_POLICIES, CATEGORIES, EXPERIENCE_TAGS, FILTER_AMENITIES, PROPERTY_TYPES,
  createHostProperty, updateHostProperty, type CancellationPolicy, type HostProperty,
} from '@/lib/marketplace'
import { hostGhostButton, hostInput, hostPrimaryButton } from '@/components/host/HostShell'

type DraftImage = { image_url: string; is_primary: boolean; display_order: number; album_name: string }

type Draft = {
  name: string; property_type: string; number_of_rooms: number
  description: string; about_stay: string; the_space: string; location_notes: string
  what_guests_love: string; things_to_know: string
  address: string; city: string; state: string; country: string; latitude: number; longitude: number
  contact_phone: string; contact_email: string
  price_per_night: number; cleaning_fee: number; extra_guest_charge_per_night: number
  base_guests: number; max_guests: number; bedrooms: number; bathrooms: number; min_nights: number
  pets_allowed: boolean; pet_charge_per_night: number; max_pets: number
  check_in_time: string; check_out_time: string
  house_rules: string[]; amenities: string[]; categories: string[]; experience_tags: string[]
  cancellation_policy: CancellationPolicy
  images: DraftImage[]
}

const EMPTY: Draft = {
  name: '', property_type: 'homestay', number_of_rooms: 1,
  description: '', about_stay: '', the_space: '', location_notes: '', what_guests_love: '', things_to_know: '',
  address: '', city: '', state: '', country: 'India', latitude: 0, longitude: 0,
  contact_phone: '', contact_email: '',
  price_per_night: 0, cleaning_fee: 0, extra_guest_charge_per_night: 0,
  base_guests: 2, max_guests: 4, bedrooms: 1, bathrooms: 1, min_nights: 1,
  pets_allowed: false, pet_charge_per_night: 0, max_pets: 0,
  check_in_time: '2:00 PM', check_out_time: '11:00 AM',
  house_rules: [], amenities: [], categories: [], experience_tags: [],
  cancellation_policy: 'flexible',
  images: [],
}

function fromProperty(p: HostProperty): Draft {
  // Show the host their own pending edits on top of the live values.
  const merged = { ...p, ...(p.pending_changes ?? {}) } as unknown as Partial<Draft> & HostProperty
  const images = (p.pending_changes?.images as DraftImage[] | undefined) ??
    p.images.map(i => ({ image_url: i.image_url, is_primary: i.is_primary, display_order: i.display_order, album_name: i.album_name ?? 'General' }))
  const pick = <K extends keyof Draft>(key: K): Draft[K] => (merged[key] ?? EMPTY[key]) as Draft[K]
  return {
    ...Object.fromEntries((Object.keys(EMPTY) as (keyof Draft)[]).map(k => [k, pick(k)])),
    images,
  } as Draft
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])

const label: React.CSSProperties = { fontSize: '12px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }
const section: React.CSSProperties = { display: 'grid', gap: '16px', padding: '20px 0', borderTop: '1px solid var(--color-border)' }
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }

function Chips({ options, selected, onToggle }: {
  options: readonly { value: string; label: string }[]; selected: string[]; onToggle: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {options.map(o => {
        const on = selected.includes(o.value)
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onToggle(o.value)}
            style={{ padding: '7px 12px', borderRadius: '999px', fontSize: '13px', cursor: 'pointer',
              border: `1px solid ${on ? 'var(--color-terra)' : 'var(--color-border)'}`,
              backgroundColor: on ? 'var(--color-brand)' : '#ffffff', fontWeight: on ? 700 : 400 }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

type Props = { property: HostProperty | null; onSaved: (p: HostProperty) => void; onCancel: () => void }

/** Create or edit a listing. Edits to live listings go to admin review before guests see them. */
export default function ListingForm({ property, onSaved, onCancel }: Props) {
  const { fetchWithAuth } = useAuth()
  const [d, setD] = useState<Draft>(() => (property ? fromProperty(property) : EMPTY))
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD(prev => ({ ...prev, [key]: value }))
  const text = (key: keyof Draft & string) => ({
    value: String(d[key as keyof Draft] ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key as keyof Draft, e.target.value as never),
    style: hostInput,
  })
  const num = (key: keyof Draft & string) => ({
    type: 'number' as const,
    value: Number(d[key as keyof Draft] ?? 0),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key as keyof Draft, Number(e.target.value) as never),
    style: hostInput,
  })

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true); setError(null)
    try {
      const urls: string[] = []
      for (const file of Array.from(files)) {
        urls.push(await uploadPropertyImage(file, undefined, fetchWithAuth, '/host'))
      }
      setD(prev => {
        const start = prev.images.length
        const added = urls.map((image_url, i) => ({
          image_url, is_primary: start + i === 0, display_order: start + i + 1, album_name: 'General',
        }))
        return { ...prev, images: [...prev.images, ...added] }
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const removePhoto = (idx: number) =>
    setD(prev => {
      const images = prev.images.filter((_, i) => i !== idx).map((img, i) => ({ ...img, display_order: i + 1 }))
      if (images.length && !images.some(i => i.is_primary)) images[0].is_primary = true
      return { ...prev, images }
    })

  const makePrimary = (idx: number) =>
    setD(prev => ({ ...prev, images: prev.images.map((img, i) => ({ ...img, is_primary: i === idx })) }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      const body = { ...d }
      const saved = property
        ? await updateHostProperty(property.id, body, fetchWithAuth)
        : await createHostProperty(body, fetchWithAuth)
      onSaved(saved)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: 'var(--card-radius)', padding: '24px' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px' }}>{property ? 'Edit listing' : 'New listing'}</h2>
      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
        {property && property.approval_status === 'approved'
          ? 'Your changes are reviewed by our team before guests see them. The current version stays live meanwhile.'
          : 'Our team reviews every listing before it is published.'}
      </p>

      <div style={section}>
        <div style={grid}>
          <div><label style={label}>Name</label><input required {...text('name')} /></div>
          <div>
            <label style={label}>Property type</label>
            <select value={d.property_type} onChange={e => set('property_type', e.target.value)} style={hostInput}>
              {PROPERTY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div><label style={label}>Number of rooms</label><input min={1} {...num('number_of_rooms')} /></div>
        </div>
        <div><label style={label}>Short description</label><textarea required rows={3} {...text('description')} /></div>
        {([
          ['about_stay', 'About the stay'], ['the_space', 'The space'], ['location_notes', 'Location'],
          ['what_guests_love', 'What guests love'], ['things_to_know', 'Things to know'],
        ] as const).map(([key, title]) => (
          <div key={key}><label style={label}>{title}</label><textarea rows={3} {...text(key)} /></div>
        ))}
      </div>

      <div style={section}>
        <div><label style={label}>Address</label><input required {...text('address')} /></div>
        <div style={grid}>
          <div><label style={label}>City</label><input required {...text('city')} /></div>
          <div><label style={label}>State</label><input required {...text('state')} /></div>
          <div><label style={label}>Latitude</label><input step="any" {...num('latitude')} /></div>
          <div><label style={label}>Longitude</label><input step="any" {...num('longitude')} /></div>
          <div><label style={label}>Contact phone</label><input required {...text('contact_phone')} /></div>
          <div><label style={label}>Contact email</label><input required type="email" {...text('contact_email')} /></div>
        </div>
      </div>

      <div style={section}>
        <div style={grid}>
          <div><label style={label}>Price per night (₹)</label><input min={0} {...num('price_per_night')} /></div>
          <div><label style={label}>Cleaning fee (₹)</label><input min={0} {...num('cleaning_fee')} /></div>
          <div><label style={label}>Extra guest / night (₹)</label><input min={0} {...num('extra_guest_charge_per_night')} /></div>
          <div><label style={label}>Base guests</label><input min={1} {...num('base_guests')} /></div>
          <div><label style={label}>Max guests</label><input min={1} {...num('max_guests')} /></div>
          <div><label style={label}>Bedrooms</label><input min={0} {...num('bedrooms')} /></div>
          <div><label style={label}>Bathrooms</label><input min={0} {...num('bathrooms')} /></div>
          <div><label style={label}>Minimum stay (nights)</label><input min={1} {...num('min_nights')} /></div>
          <div><label style={label}>Check-in time</label><input {...text('check_in_time')} /></div>
          <div><label style={label}>Check-out time</label><input {...text('check_out_time')} /></div>
        </div>
        <label style={{ display: 'flex', gap: '10px', alignItems: 'center', fontWeight: 600, fontSize: '14px' }}>
          <input type="checkbox" checked={d.pets_allowed} onChange={e => set('pets_allowed', e.target.checked)} /> Pets allowed
        </label>
        {d.pets_allowed && (
          <div style={grid}>
            <div><label style={label}>Pet charge / night (₹)</label><input min={0} {...num('pet_charge_per_night')} /></div>
            <div><label style={label}>Max pets</label><input min={0} {...num('max_pets')} /></div>
          </div>
        )}
      </div>

      <div style={section}>
        <div>
          <label style={label}>Categories</label>
          <Chips options={CATEGORIES} selected={d.categories} onToggle={v => set('categories', toggle(d.categories, v))} />
        </div>
        <div>
          <label style={label}>Experience</label>
          <Chips options={EXPERIENCE_TAGS} selected={d.experience_tags} onToggle={v => set('experience_tags', toggle(d.experience_tags, v))} />
        </div>
        <div>
          <label style={label}>Amenities</label>
          <Chips options={FILTER_AMENITIES.map(a => ({ value: a, label: a }))} selected={d.amenities} onToggle={v => set('amenities', toggle(d.amenities, v))} />
        </div>
        <div>
          <label style={label}>House rules (one per line)</label>
          <textarea rows={4} value={d.house_rules.join('\n')} style={hostInput}
            onChange={e => set('house_rules', e.target.value.split('\n').filter(l => l.trim()))} />
        </div>
      </div>

      <div style={section}>
        <label style={label}>Cancellation policy</label>
        <div style={{ display: 'grid', gap: '10px' }}>
          {(Object.keys(CANCELLATION_POLICIES) as CancellationPolicy[]).map(key => (
            <label key={key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="radio" name="policy" checked={d.cancellation_policy === key} onChange={() => set('cancellation_policy', key)} />
              <span><strong>{CANCELLATION_POLICIES[key].label}</strong><br />
                <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{CANCELLATION_POLICIES[key].summary}</span></span>
            </label>
          ))}
        </div>
      </div>

      <div style={section}>
        <label style={label}>Photos (aim for 15–30)</label>
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading}
          onChange={e => { void addPhotos(e.target.files); e.target.value = '' }} />
        {uploading && <p style={{ fontSize: '13px' }}>Uploading…</p>}
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{d.images.length} photo{d.images.length === 1 ? '' : 's'} added</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px' }}>
          {d.images.map((img, i) => (
            <div key={img.image_url} style={{ border: `2px solid ${img.is_primary ? 'var(--color-terra)' : 'var(--color-border)'}`, borderRadius: '8px', overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.image_url} alt="" style={{ width: '100%', height: '90px', objectFit: 'cover', display: 'block' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', fontSize: '11px' }}>
                <button type="button" onClick={() => makePrimary(i)} disabled={img.is_primary} style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700 }}>
                  {img.is_primary ? 'Cover' : 'Make cover'}
                </button>
                <button type="button" onClick={() => removePhoto(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#C62828' }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <p role="alert" style={{ color: '#C62828', fontSize: '14px', marginBottom: '12px' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button type="submit" disabled={saving || uploading} style={{ ...hostPrimaryButton, opacity: saving || uploading ? 0.6 : 1 }}>
          {saving ? 'Saving…' : property ? 'Submit changes for review' : 'Submit for review'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} style={hostGhostButton}>Cancel</button>
      </div>
    </form>
  )
}
