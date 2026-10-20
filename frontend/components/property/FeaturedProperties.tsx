"use client"
import Link from 'next/link'
import { useEffect, useState } from 'react'
import PropertyCard from './PropertyCard'
import { buildApiUrl } from '@/lib/api'
import type { Property } from '@/lib/types'

function SkeletonCard() {
  return (
    <div style={{
      borderRadius: '12px',
      border: '1px solid var(--color-border)',
      overflow: 'hidden',
      backgroundColor: '#fff',
    }}>
      <div style={{
        width: '100%',
        aspectRatio: '4/3',
        background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s infinite',
      }} />
      <div style={{ padding: '16px 20px' }}>
        <div style={{ height: 20, width: '70%', background: '#f0f0f0', borderRadius: 6, marginBottom: 10, animation: 'shimmer 1.4s infinite' }} />
        <div style={{ height: 14, width: '50%', background: '#f0f0f0', borderRadius: 6, marginBottom: 14, animation: 'shimmer 1.4s infinite' }} />
        <div style={{ height: 1, background: 'var(--color-border)', marginBottom: 12 }} />
        <div style={{ height: 24, width: '40%', background: '#f0f0f0', borderRadius: 6, animation: 'shimmer 1.4s infinite' }} />
      </div>
    </div>
  )
}

export default function FeaturedProperties() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const load = async () => {
      try {
        const response = await fetch(buildApiUrl('/properties/featured'), { cache: 'no-store' })
        if (!response.ok) throw new Error('Failed to load properties')
        const data = await response.json()
        if (isMounted) {
          // /properties/featured returns a plain array
          setProperties(Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []))
        }
      } catch {
        if (isMounted) setProperties([])
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    load()
    return () => { isMounted = false }
  }, [])

  return (
    <section className="section-shell" style={{ backgroundColor: 'transparent' }}>
      <div className="content-shell">

        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p style={{
            color: 'var(--color-brand)',
            fontSize: '11px',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            marginBottom: '12px',
            fontWeight: '600',
          }}>
            Handpicked For You
          </p>
          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 48px)',
            fontWeight: '800',
            color: 'var(--color-text-primary)',
            marginBottom: '12px',
            lineHeight: '1.2',
          }}>
            Featured Properties
          </h2>
          <div style={{ width: '50px', height: '2px', backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', margin: '0 auto 16px' }} />
          <p style={{
            color: 'var(--color-text-secondary)',
            fontSize: '15px',
            maxWidth: '500px',
            margin: '0 auto',
            lineHeight: '1.6',
          }}>
            Each property is carefully selected to offer you an extraordinary experience
          </p>
        </div>

        <div className="responsive-card-grid" style={{ marginBottom: '48px' }}>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            : properties.length > 0
              ? properties.map(property => (
                  <PropertyCard key={property.id} property={property} />
                ))
              : (
                <div style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: '48px 0',
                  color: 'var(--color-text-secondary)',
                }}>
                  <p style={{ fontSize: '16px', marginBottom: '8px' }}>No properties available yet.</p>
                  <p style={{ fontSize: '13px' }}>Check back soon — new properties are being added!</p>
                </div>
              )
          }
        </div>

        <div style={{ textAlign: 'center' }}>
          <Link
            href="/properties"
            style={{
              display: 'inline-block',
              border: '2px solid var(--color-brand)',
              color: 'var(--color-brand)',
              padding: '14px 42px',
              fontSize: '12px',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              fontWeight: '700',
              textDecoration: 'none',
              borderRadius: '8px',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.backgroundColor = 'var(--color-brand)'
              el.style.color = 'var(--color-terra)'
              el.style.transform = 'scale(1.03)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.backgroundColor = 'transparent'
              el.style.color = 'var(--color-brand)'
              el.style.transform = 'scale(1)'
            }}
          >
            View All Properties
          </Link>
        </div>
      </div>
    </section>
  )
}