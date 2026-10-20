"use client"
import { useState, useEffect } from 'react'
import VerifiedBadge from '@/components/property/VerifiedBadge'
import Image from 'next/image'
import Link from 'next/link'
import { Property } from '@/lib/types'
import { Star, MapPin, Bed, Bath, Users, User, Armchair, Sofa, Utensils, TreePalm, LayoutDashboard, UtensilsCrossed, DoorOpen, Share2, Check } from 'lucide-react'

interface Props {
  property: Property
}

export default function PropertyCard({ property }: Props) {
  const getPrimaryImg = () => {
    const raw = property.images?.find(img => img.is_primary)?.image_url || property.images?.[0]?.image_url
    if (!raw || raw.startsWith('blob:')) return 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800'
    return raw
  }
  const [imgSrc, setImgSrc] = useState(getPrimaryImg)
  const [copied, setCopied] = useState(false)

  // Sync imgSrc when property prop changes (e.g. after edit/save)
  useEffect(() => {
    setImgSrc(getPrimaryImg())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.images])

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const shareTitle = `Property | Concept Stay | ${property.name}`
    const shareDesc = 'a hand picked property - book now on Concept Stay'
    const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://conceptstay.in'}/properties/${property.id}`

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: `${shareTitle}\n${shareDesc}`,
          url: shareUrl,
        })
        return
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(`${shareTitle}\n${shareDesc}\n${shareUrl}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Link href={`/properties/${property.id}`} style={{ textDecoration: 'none' }}>
      <div
        style={{
          backgroundColor: '#ffffff',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-6px)'
          ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 16px 48px rgba(0,0,0,0.12)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
          ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
        }}
      >
        {/* Image */}
        <div style={{ position: 'relative', overflow: 'hidden', width: '100%', aspectRatio: '4/3' }}>
          <Image
            src={imgSrc}
            alt={property.name}
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            style={{ objectFit: 'cover', transition: 'transform 0.4s ease' }}
            onError={() => setImgSrc('https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800')}
            onMouseEnter={e => {
              const img = e.currentTarget as HTMLImageElement
              img.style.transform = 'scale(1.08)'
            }}
            onMouseLeave={e => {
              const img = e.currentTarget as HTMLImageElement
              img.style.transform = 'scale(1)'
            }}
          />

          {/* Share Button */}
          <button
            onClick={handleShare}
            aria-label="Share property"
            title="Share this property"
            style={{
              position: 'absolute',
              top: '14px',
              left: '14px',
              backgroundColor: 'rgba(43,32,23,0.85)',
              color: copied ? 'var(--color-terra)' : '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              fontWeight: '600',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              cursor: 'pointer',
              zIndex: 2,
              backdropFilter: 'blur(4px)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-text-primary)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(43,32,23,0.85)'
            }}
          >
            {copied ? (
              <>
                <Check style={{ width: '13px', height: '13px', color: 'var(--color-terra)' }} />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Share2 style={{ width: '13px', height: '13px' }} />
                <span>Share</span>
              </>
            )}
          </button>

          {/* Rating Badge */}
          <div className="surface-dark" style={{
            position: 'absolute', top: '14px', right: '14px',
            backgroundColor: 'var(--color-text-primary)',
            color: 'var(--color-terra)',
            padding: '6px 10px',
            fontSize: '12px',
            fontWeight: '700',
            borderRadius: '6px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <Star style={{ width: '13px', height: '13px', fill: 'var(--color-terra)', strokeWidth: 0 }} />
            {typeof property.avg_rating === 'number' && !isNaN(property.avg_rating)
              ? property.avg_rating > 0 ? property.avg_rating.toFixed(1) : 'New'
              : 'New'}
          </div>

          {/* Location Badge */}
          <div style={{
            position: 'absolute', bottom: '14px', left: '14px',
            backgroundColor: 'rgba(43,32,23,0.85)',
            color: '#ffffff',
            padding: '6px 10px',
            fontSize: '11px',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            borderRadius: '6px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
          }}>
            <MapPin style={{ width: '12px', height: '12px', color: 'var(--color-terra)' }} />
            {property.city}, {property.state}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', flex: 1 }}>

          <h3 style={{
            fontSize: '18px',
            fontWeight: '700',
            color: 'var(--color-text-primary)',
            marginBottom: '8px',
            lineHeight: '1.3',
          }}>
            {property.name}
          </h3>
          {property.verification_status === 'verified' && (
            <div style={{ marginBottom: '8px' }}><VerifiedBadge status={property.verification_status} /></div>
          )}

          {/* Details Row — ONLY Guests, Beds, Baths, and spaces_detail (Balcony, Living Room, Kitchen, etc. with Shared/Not Shared) */}
          {(() => {
            type Slot = { icon: React.ReactNode; text: string; sharingIcon?: React.ReactNode }
            const slots: Slot[] = []
            const spaces = property.spaces_detail ?? []

            // 1. Guests (Always)
            slots.push({
              icon: <Users style={{ width: '14px', height: '14px', strokeWidth: 1.8 }} />,
              text: `${property.max_guests ?? 0} Guests`
            })

            // 2. Beds (Always)
            slots.push({
              icon: <Bed style={{ width: '14px', height: '14px', strokeWidth: 1.8 }} />,
              text: `${property.bedrooms ?? 0} Beds`
            })

            // 3. Baths (with type label)
            const hasSharedBath = (property.bathrooms_detail ?? []).some(b => b.type === 'shared')
            const isBathShared = (property.bathrooms_detail ?? []).length > 0 ? hasSharedBath : false
            const bathSharingText = (property.bathrooms_detail ?? []).length > 0 ? (isBathShared ? 'Shared' : 'Private') : null
            slots.push({
              icon: <Bath style={{ width: '14px', height: '14px', strokeWidth: 1.8 }} />,
              text: `${property.bathrooms ?? 0} Baths${bathSharingText ? ` (${bathSharingText})` : ''}`
            })

            // 4. Spaces (Balcony, Terrace, Kitchen, Hall, Living Room, Dining Room, Entrance)
            const spaceConfig: Record<string, { label: string; icon: React.ReactNode; matchKeywords: string[] }> = {
              balcony: { label: 'Balcony', icon: <Armchair style={{ width: '14px', height: '14px', strokeWidth: 1.8 }} />, matchKeywords: ['balcony'] },
              terrace: { label: 'Terrace', icon: <TreePalm style={{ width: '14px', height: '14px', strokeWidth: 1.8 }} />, matchKeywords: ['terrace'] },
              kitchen: { label: 'Kitchen', icon: <Utensils style={{ width: '14px', height: '14px', strokeWidth: 1.8 }} />, matchKeywords: ['kitchen'] },
              hall: { label: 'Hall', icon: <LayoutDashboard style={{ width: '14px', height: '14px', strokeWidth: 1.8 }} />, matchKeywords: ['hall'] },
              living_room: { label: 'Living Room', icon: <Sofa style={{ width: '14px', height: '14px', strokeWidth: 1.8 }} />, matchKeywords: ['living room', 'livingroom'] },
              dining_room: { label: 'Dining Room', icon: <UtensilsCrossed style={{ width: '14px', height: '14px', strokeWidth: 1.8 }} />, matchKeywords: ['dining room', 'diningroom'] },
              entrance: { label: 'Entrance', icon: <DoorOpen style={{ width: '14px', height: '14px', strokeWidth: 1.8 }} />, matchKeywords: ['entrance'] },
            }

            const activeSpacesMap = new Map<string, { type: string; count: number; sharing: string }>()

            // Add spaces explicitly configured in spaces_detail
            for (const sp of spaces) {
              if (Number(sp.count) > 0 && spaceConfig[sp.type]) {
                activeSpacesMap.set(sp.type, { type: sp.type, count: Number(sp.count), sharing: sp.sharing || 'not_shared' })
              }
            }

            // Also check general amenities for existing properties that have "Balcony", "Kitchen", etc.
            const cleanAmenities = (property.amenities ?? []).filter(a => typeof a === 'string' && !a.startsWith('__space__:'))
            for (const [key, cfg] of Object.entries(spaceConfig)) {
              if (!activeSpacesMap.has(key)) {
                const foundInAmenities = cleanAmenities.some(a => cfg.matchKeywords.some(kw => a.toLowerCase().includes(kw)))
                if (foundInAmenities) {
                  activeSpacesMap.set(key, { type: key, count: 1, sharing: 'not_shared' })
                }
              }
            }

            for (const sp of activeSpacesMap.values()) {
              const cfg = spaceConfig[sp.type]
              if (cfg) {
                const isShared = sp.sharing === 'shared'
                slots.push({
                  icon: cfg.icon,
                  text: `${sp.count} ${cfg.label} (${isShared ? 'Shared' : 'Private'})`
                })
              }
            }

            return (
              <div style={{ display: 'flex', gap: '14px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                {slots.slice(0, 5).map((slot, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: '500' }}>
                    {slot.icon}
                    {slot.text}
                  </span>
                ))}
              </div>
            )
          })()}


          <div style={{ height: '1px', backgroundColor: 'var(--color-border)', marginBottom: '12px' }} />

          {/* Price Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div>
              <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                ₹{(property.price_per_night ?? 0).toLocaleString('en-IN')}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginLeft: '4px' }}>/ night</span>
            </div>
            {/* reviews count removed per request */}
          </div>

          {/* Amenities */}
          {(() => {
            const displayAmenities = (property.amenities ?? []).filter(
              a => typeof a === 'string' && !a.startsWith('__space__:') && !a.trim().startsWith('{') && !a.includes('"type":')
            )
            return (
              <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', flexWrap: 'wrap' }}>
                {displayAmenities.slice(0, 3).map(amenity => (
                  <span key={amenity} style={{
                    backgroundColor: 'var(--color-bg-soft)',
                    color: 'var(--color-text-secondary)',
                    padding: '3px 8px',
                    fontSize: '10px',
                    letterSpacing: '0.2px',
                    borderRadius: '4px',
                    fontWeight: '500',
                  }}>
                    {amenity}
                  </span>
                ))}
                {displayAmenities.length > 3 && (
                  <span style={{
                    backgroundColor: 'var(--color-bg-soft)',
                    color: 'var(--color-terra)',
                    padding: '3px 8px',
                    fontSize: '10px',
                    borderRadius: '4px',
                    fontWeight: '600',
                  }}>
                    +{displayAmenities.length - 3}
                  </span>
                )}
              </div>
            )
          })()}
        </div>
      </div>
    </Link>
  )
}
