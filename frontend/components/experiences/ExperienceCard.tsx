'use client'

import Link from 'next/link'
import { Clock, Compass, MapPin, Star } from 'lucide-react'
import { EXPERIENCE_CATEGORIES, formatDuration, formatStart, labelOf, type PublicExperience } from '@/lib/experiences'
import { useCurrency } from '@/lib/currency'

export default function ExperienceCard({ experience }: { experience: PublicExperience }) {
  const { format } = useCurrency()
  const image = experience.images[0]
  return (
    <Link
      href={`/experiences/${experience.id}`}
      style={{
        display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'var(--color-text-primary)',
        backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--card-radius)',
        overflow: 'hidden',
      }}
    >
      <div style={{ height: '180px', backgroundColor: 'var(--color-bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Compass size={40} aria-hidden style={{ color: 'var(--color-text-muted)' }} />
        )}
      </div>
      <div style={{ padding: '16px 18px 18px', display: 'grid', gap: '8px' }}>
        <span style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--color-terra)' }}>
          {labelOf(EXPERIENCE_CATEGORIES, experience.category)}
        </span>
        <h3 style={{ fontSize: '18px', fontWeight: 800, lineHeight: 1.25 }}>{experience.title}</h3>
        <p style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          <MapPin size={14} aria-hidden /> {experience.city}, {experience.state}
        </p>
        <p style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          <Clock size={14} aria-hidden /> {formatDuration(experience.duration_minutes)}
          {experience.review_count > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
              <Star size={14} aria-hidden /> {experience.avg_rating.toFixed(1)} ({experience.review_count})
            </span>
          )}
        </p>
        <p style={{ marginTop: '4px' }}>
          <strong style={{ fontSize: '18px' }}>{format(experience.price_per_person)}</strong>
          <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}> per person</span>
        </p>
        {experience.next_slot_at && (
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Next: {formatStart(experience.next_slot_at)}</p>
        )}
      </div>
    </Link>
  )
}
