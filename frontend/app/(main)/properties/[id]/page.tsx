'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { DayPicker } from 'react-day-picker'
import MapWrapper from '@/components/shared/MapWrapper'
import { buildApiUrl, fetchPropertyReviews, type PriceOverride } from '@/lib/api'
import type { Property, Review } from '@/lib/types'
import VerifiedBadge from '@/components/property/VerifiedBadge'
import { CANCELLATION_POLICIES, PROPERTY_TYPES, getPriceQuote, getReviewSummary, labelFor, type PriceQuote, type ReviewSummary } from '@/lib/marketplace'
import type { DateRange } from 'react-day-picker'
import { useAuth } from '@/lib/auth/AuthContext'
import { Star, MapPin, Users, User, Bed, Bath, Calendar, Moon, Dog, Check, Phone, Mail, Clock, ShieldAlert, Sparkles, ChevronLeft, ChevronRight, Armchair, Sofa, Utensils, UtensilsCrossed, DoorOpen, LayoutDashboard, TreePalm, Camera, X, Folder, Share2, Compass } from 'lucide-react'

const bathroomLabel: Record<string, string> = {
  ensuite: 'Private Ensuite',
  detached_private: 'Detached Private',
  shared: 'Shared',
}

const DEFAULT_STANDARD_RULES = [
  'Check-in: 2:00 PM onwards | Check-out: By 10:00 AM',
  'No smoking indoors. Smoking is allowed only in designated balcony/terrace areas. Indoor smoking penalty: ₹10,000.',
  'Only registered guests are allowed to stay. Visitors require prior approval (10:00 AM–8:00 PM, maximum 2 visitors).',
  'Government-issued photo ID is mandatory for all guests at check-in.',
  'Parties require prior approval and must end by 9:00 PM. Please maintain quiet hours after 9:00 PM.',
  'No food inside bedrooms. Please use the dining area for meals.',
  'Please keep towels and bedsheets clean. Charges of 10,000 will apply for stains or damage.',
  'If you use the kitchen, kindly wash and return all utensils after use.',
  'Guests are responsible for any damage, missing items, or excessive mess.',
  'Please use the dustbins provided. Do not throw garbage or cigarette butts from balconies or windows.',
  'Before leaving, switch off lights, ACs, fans, geysers, lock all doors/windows, and return the keys.',
  'Any payment made to staff or the caretaker must be immediately reported to the host with payment proof. Host: Megha  +91 98748 27631 on whatsapp',
]

export default function PropertyDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const propertyId = Array.isArray(id) ? id[0] : id
  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [blockedRanges, setBlockedRanges] = useState<Array<{ check_in: string; check_out: string }>>([])
  const [priceOverrides, setPriceOverrides] = useState<PriceOverride[]>([])

  const [activeImage, setActiveImage] = useState(0)
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [range, setRange] = useState<DateRange | undefined>(undefined)
  const [guests, setGuests] = useState(1)
  const [pets, setPets] = useState(0)
  const [activeTab, setActiveTab] = useState('overview')
  const [hoveredTags, setHoveredTags] = useState<Record<string, boolean>>({})
  const [bookingError, setBookingError] = useState<string | null>(null)

  // ── Photo Tour State ──────────────────────────────────────────────────────
  const [tourModalOpen, setTourModalOpen] = useState(false)
  const [tourActiveAlbum, setTourActiveAlbum] = useState<string>('All')
  const [tourActiveIndex, setTourActiveIndex] = useState(0)

  // ── Reviews State ────────────────────────────────────────────────────────
  const [reviews, setReviews] = useState<Review[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [quote, setQuote] = useState<PriceQuote | null>(null)
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null)
  const [shareCopied, setShareCopied] = useState(false)

  const { fetchWithAuth } = useAuth()

  useEffect(() => {
    if (!propertyId) return
    let isMounted = true

    const load = async () => {
      try {
        setLoading(true)
        setLoadError(null)
        const response = await fetchWithAuth(`/properties/${propertyId}`)
        if (!response.ok) {
          throw new Error(`Failed to load property (${response.status})`)
        }
        const data = await response.json()
        if (isMounted) {
          setProperty(data)
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load property')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      isMounted = false
    }
  }, [propertyId])

  useEffect(() => {
    if (!propertyId) return
    let isMounted = true

    const loadAvailability = async () => {
      try {
        const [availRes, priceRes] = await Promise.all([
          fetch(buildApiUrl(`/properties/${propertyId}/availability`), { cache: 'no-store' }),
          fetch(buildApiUrl(`/properties/${propertyId}/price-overrides`), { cache: 'no-store' }),
        ])
        if (availRes.ok) {
          const data = await availRes.json()
          if (isMounted) setBlockedRanges(Array.isArray(data) ? data : [])
        }
        if (priceRes.ok) {
          const pData = await priceRes.json()
          if (isMounted) setPriceOverrides(Array.isArray(pData) ? pData : [])
        }
      } catch {
        if (isMounted) {
          setBlockedRanges([])
          setPriceOverrides([])
        }
      }
    }

    loadAvailability()
    return () => {
      isMounted = false
    }
  }, [propertyId])

  useEffect(() => {
    if (propertyId) {
      setReviewsLoading(true)
      fetchPropertyReviews(propertyId)
        .then(setReviews)
        .catch(() => {})
        .finally(() => setReviewsLoading(false))
    }
  }, [propertyId])

  const formatDateInputValue = (value?: Date) => {
    if (!value) return ''
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const formatDateLabel = (value?: Date) => (
    value ? value.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'Select'
  )

  const toDate = (dateStr: string) => new Date(`${dateStr}T00:00:00`)

  const isRangeBlocked = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return false
    const start = toDate(startStr)
    const end = toDate(endStr)
    return blockedRanges.some(range => {
      const rangeStart = toDate(range.check_in)
      const rangeEnd = toDate(range.check_out)
      return start < rangeEnd && end > rangeStart
    })
  }

  const disabledRanges = blockedRanges
    .map(range => {
      const start = toDate(range.check_in)
      const end = toDate(range.check_out)
      const endDate = new Date(end)
      endDate.setDate(endDate.getDate() - 1)
      if (endDate < start) {
        endDate.setTime(start.getTime())
      }
      return { from: start, to: endDate }
    })
    .filter(range => !Number.isNaN(range.from.getTime()) && !Number.isNaN(range.to.getTime()))

  const handleRangeSelect = (selected: DateRange | undefined) => {
    setRange(selected)
    const nextCheckIn = formatDateInputValue(selected?.from)
    const nextCheckOut = formatDateInputValue(selected?.to)
    setCheckIn(nextCheckIn)
    setCheckOut(nextCheckOut)
    if (selected?.from && selected?.to && isRangeBlocked(nextCheckIn, nextCheckOut)) {
      setBookingError('Selected dates overlap an existing booking')
      return
    }
    setBookingError(null)
  }

  // ── Hooks must run unconditionally at top level (React Rule of Hooks) ────
  const albums = useMemo(() => {
    if (!property?.images?.length) return []
    const map = new Map<string, typeof property.images>()
    for (const img of property.images) {
      const alb = img.album_name || 'General'
      if (!map.has(alb)) {
        map.set(alb, [])
      }
      map.get(alb)!.push(img)
    }
    return Array.from(map.entries()).map(([name, imgs]) => ({
      name,
      images: imgs,
      cover: imgs[0]?.image_url || 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
      count: imgs.length,
    }))
  }, [property?.images])

  const currentTourImages = useMemo(() => {
    if (!property?.images?.length) return []
    if (tourActiveAlbum === 'All') return property.images
    return property.images.filter(img => (img.album_name || 'General') === tourActiveAlbum)
  }, [property?.images, tourActiveAlbum])

  // Keyboard navigation in Photo Tour Lightbox
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!tourModalOpen) return
    if (e.key === 'Escape') setTourModalOpen(false)
    if (e.key === 'ArrowLeft') setTourActiveIndex(i => Math.max(0, i - 1))
    if (e.key === 'ArrowRight') setTourActiveIndex(i => Math.min(currentTourImages.length - 1, i + 1))
  }, [tourModalOpen, currentTourImages.length])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const calcNights = () => {
    if (!checkIn || !checkOut) return 0
    const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  const nights = calcNights()
  const basePrice = useMemo(() => {
    if (!checkIn || !checkOut || !property || nights <= 0) return (property?.price_per_night || 0) * nights
    let sum = 0
    const [y, m, d] = checkIn.split('-').map(Number)
    for (let i = 0; i < nights; i++) {
      const cur = new Date(y, m - 1, d + i)
      const yr = cur.getFullYear()
      const mo = String(cur.getMonth() + 1).padStart(2, '0')
      const da = String(cur.getDate()).padStart(2, '0')
      const curStr = `${yr}-${mo}-${da}`
      const ov = priceOverrides.find(o => curStr >= o.start_date && curStr < o.end_date)
      sum += ov ? ov.price_per_night : property.price_per_night
    }
    return sum
  }, [checkIn, checkOut, property, nights, priceOverrides])

  // Server-side quote is the source of truth for taxes, fees and the total shown at booking time.
  useEffect(() => {
    if (!property || !checkIn || !checkOut || nights <= 0) { setQuote(null); return }
    let cancelled = false
    getPriceQuote(property.id, { checkIn, checkOut, guests, pets })
      .then(q => { if (!cancelled) setQuote(q) })
      .catch(() => { if (!cancelled) setQuote(null) })
    return () => { cancelled = true }
  }, [property, checkIn, checkOut, guests, pets, nights])

  useEffect(() => {
    if (!property) return
    getReviewSummary(property.id).then(setReviewSummary).catch(() => {})
  }, [property])



  const handleDetailShare = useCallback(async () => {
    if (!property) return
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
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    }
  }, [property])

  if (loading) {
    return (
      <div className="page-shell" style={{ backgroundColor: '#ffffff' }}>
        {/* Gallery skeleton */}
        <div style={{ backgroundColor: 'var(--color-deep)', padding: '6px' }}>
          <div style={{
            height: 'clamp(280px, 55vw, 520px)',
            background: 'linear-gradient(90deg, #2a2a2a 25%, #333 50%, #2a2a2a 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s infinite',
            marginBottom: '8px',
          }} />
          <div style={{ display: 'flex', gap: '6px', padding: '4px' }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ width: 72, height: 48, borderRadius: 6, background: 'linear-gradient(90deg, #2a2a2a 25%, #333 50%, #2a2a2a 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite', flexShrink: 0 }} />
            ))}
          </div>
        </div>
        {/* Content skeleton */}
        <div className="content-shell-lg" style={{ padding: '48px 24px 72px' }}>
          <div className="responsive-grid-detail">
            <div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                {[100, 150, 80].map((w, i) => (
                  <div key={i} style={{ height: 28, width: w, borderRadius: 6, background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
                ))}
              </div>
              <div style={{ height: 48, width: '80%', borderRadius: 8, background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite', marginBottom: 24 }} />
              {[100, 80, 90, 70].map((w, i) => (
                <div key={i} style={{ height: 16, width: `${w}%`, borderRadius: 4, background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite', marginBottom: 10 }} />
              ))}
            </div>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: 28 }}>
              <div style={{ height: 40, width: '55%', borderRadius: 6, background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite', marginBottom: 20 }} />
              <div style={{ height: 200, borderRadius: 8, background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite', marginBottom: 16 }} />
              <div style={{ height: 52, borderRadius: 8, background: '#f0f0f0', animation: 'shimmer 1.4s infinite' }} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 24px' }}>
        <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '16px' }}>{loadError}</h2>
        <button
          onClick={() => router.push('/properties')}
          style={{ backgroundColor: 'var(--color-terra)', color: '#f6eddc', border: 'none', padding: '14px 32px', fontSize: '13px', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: '700', cursor: 'pointer', borderRadius: '8px' }}
        >
          Back to Properties
        </button>
      </div>
    )
  }

  if (!property) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 24px' }}>
        <h2 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '16px' }}>Property not found</h2>
        <button
          onClick={() => router.push('/properties')}
          style={{ backgroundColor: 'var(--color-terra)', color: '#f6eddc', border: 'none', padding: '14px 32px', fontSize: '13px', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: '700', cursor: 'pointer', borderRadius: '8px' }}
        >
          Back to Properties
        </button>
      </div>
    )
  }

  const baseGuests = property.base_guests || 2
  const extraGuestRate = property.extra_guest_charge_per_night || 0
  const extraGuests = Math.max(0, guests - baseGuests)
  const extraGuestCharge = extraGuests * nights * extraGuestRate
  const petCharge = pets * nights * property.pet_charge_per_night
  const taxes = quote?.taxes ?? 0
  const serviceFee = quote?.service_fee ?? 0
  const totalPrice = quote ? quote.total : basePrice + extraGuestCharge + property.cleaning_fee + petCharge
  const policy = CANCELLATION_POLICIES[property.cancellation_policy ?? 'flexible']

  const handleBook = () => {
    if (!checkIn || !checkOut) { alert('Please select check-in and check-out dates'); return }
    if (nights < property.min_nights) { alert(`Minimum stay is ${property.min_nights} nights`); return }
    if (isRangeBlocked(checkIn, checkOut)) { alert('Selected dates are not available'); return }
    router.push(`/booking/${property.id}?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}&pets=${pets}&nights=${nights}&total=${totalPrice}`)
  }

  const openTourForAlbum = (albumName: string) => {
    setTourActiveAlbum(albumName)
    setTourActiveIndex(0)
    setTourModalOpen(true)
  }

  // Star distribution from real reviews
  const starCounts = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews.filter(r => r.rating === star).length,
  }))

  const tabs = ['overview', 'photo tour', 'amenities', 'house rules', 'location', 'reviews']

  const cardStyle = {
    backgroundColor: '#ffffff',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    padding: '28px',
    marginBottom: '20px',
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <div className="page-shell" style={{ backgroundColor: '#ffffff' }}>

      {/* Photo Gallery */}
      <div style={{ backgroundColor: 'var(--color-deep)', padding: '6px' }}>
        <div style={{ position: 'relative', minHeight: 'clamp(300px, 60vw, 540px)', overflow: 'hidden', marginBottom: '8px', borderRadius: '4px' }}>
          {(() => {
            const mainSrc = property.images[activeImage]?.image_url || 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1200'
            return (
              <Image
                src={mainSrc}
                alt={property.name}
                fill
                unoptimized
                sizes="100vw"
                style={{ objectFit: 'cover', transition: 'opacity 0.3s ease' }}
                priority
                onError={e => {
                  (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1200'
                }}
              />
            )
          })()}
          {/* Gradient overlay for text */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '120px', background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)', pointerEvents: 'none' }} />
          {/* Counter */}
          <div style={{ position: 'absolute', bottom: '16px', right: '16px', backgroundColor: 'rgba(0,0,0,0.65)', color: '#ffffff', padding: '6px 14px', fontSize: '13px', borderRadius: '6px', backdropFilter: 'blur(4px)', fontWeight: '600', letterSpacing: '0.5px' }}>
            {activeImage + 1} / {property.images.length}
          </div>
          {property.images.length > 1 && (
            <>
              <button
                onClick={() => setActiveImage(i => Math.max(0, i - 1))}
                style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', backgroundColor: 'rgba(0,0,0,0.55)', color: '#ffffff', border: 'none', width: '48px', height: '48px', cursor: 'pointer', borderRadius: '50%', backdropFilter: 'blur(4px)', transition: 'background 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.8)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.55)')}
              ><ChevronLeft size={22} /></button>
              <button
                onClick={() => setActiveImage(i => Math.min(property.images.length - 1, i + 1))}
                style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', backgroundColor: 'rgba(0,0,0,0.55)', color: '#ffffff', border: 'none', width: '48px', height: '48px', cursor: 'pointer', borderRadius: '50%', backdropFilter: 'blur(4px)', transition: 'background 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.8)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.55)')}
              ><ChevronRight size={22} /></button>
            </>
          )}
        </div>
        {/* Thumbnail strip */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '4px 4px', scrollbarWidth: 'none' }}>
          {property.images.map((img, i) => (
            <div
              key={img.id || i}
              onClick={() => setActiveImage(i)}
              style={{ position: 'relative', width: 84, height: 56, flexShrink: 0, cursor: 'pointer', borderRadius: 6, overflow: 'hidden', border: activeImage === i ? '2px solid var(--color-terra)' : '2px solid rgba(255,255,255,0.2)', transition: 'border-color 0.15s ease, transform 0.15s ease', transform: activeImage === i ? 'scale(1.05)' : 'scale(1)' }}
            >
              <Image
                src={img.image_url || 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=400'}
                alt={`${property.name} ${i + 1}`}
                fill
                unoptimized
                style={{ objectFit: 'cover', opacity: activeImage === i ? 1 : 0.7, transition: 'opacity 0.15s ease' }}
                onError={e => {
                  (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=400'
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="content-shell-lg" style={{ padding: '48px var(--page-padding) 72px' }}>
      <div className="responsive-grid-detail md:grid-cols-2">

        {/* Left Column */}
        <div style={{ minWidth: 0 }}>

          {/* Badges & Share Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ backgroundColor: 'var(--color-bg-soft)', color: 'var(--color-text-primary)', padding: '5px 12px', fontSize: '12px', letterSpacing: '0.5px', borderRadius: '6px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <MapPin size={13} /> {property.city}, {property.state}
              </span>
              <span style={{ backgroundColor: 'var(--color-text-primary)', color: 'var(--color-terra)', padding: '5px 12px', fontSize: '12px', borderRadius: '6px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Star size={13} fill="currentColor" /> {property.avg_rating} ({property.review_count} reviews)
              </span>
              {property.pets_allowed && (
                <span style={{ backgroundColor: '#E8F5E9', color: '#2E7D32', padding: '5px 12px', fontSize: '12px', borderRadius: '6px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Dog size={13} /> Pets Welcome{(property as { max_pets?: number }).max_pets ? ` · up to ${(property as { max_pets?: number }).max_pets}` : ''}
                </span>
              )}
            </div>

            <button
              onClick={handleDetailShare}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                backgroundColor: '#ffffff',
                color: 'var(--color-text-primary)',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {shareCopied ? (
                <>
                  <Check size={14} color="var(--color-terra)" />
                  <span>Link Copied!</span>
                </>
              ) : (
                <>
                  <Share2 size={14} />
                  <span>Share</span>
                </>
              )}
            </button>
          </div>

          <h1 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '16px', lineHeight: '1.2' }}>
            {property.name}
          </h1>

          {(property.verification_status === 'verified' || property.property_type) && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
              <VerifiedBadge status={property.verification_status} size="md" />
              {property.property_type && (
                <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  {labelFor(PROPERTY_TYPES, property.property_type)}
                  {property.number_of_rooms && property.number_of_rooms > 1 ? ` · ${property.number_of_rooms} rooms` : ''}
                </span>
              )}
            </div>
          )}

          {/* Quick Stats */}
          {(() => {
            const spaceConfig: Record<string, { label: string; icon: React.ReactNode; matchKeywords: string[] }> = {
              balcony: { label: 'Balcony', icon: <Armchair size={16} />, matchKeywords: ['balcony'] },
              terrace: { label: 'Terrace', icon: <TreePalm size={16} />, matchKeywords: ['terrace'] },
              kitchen: { label: 'Kitchen', icon: <Utensils size={16} />, matchKeywords: ['kitchen'] },
              hall: { label: 'Hall', icon: <LayoutDashboard size={16} />, matchKeywords: ['hall'] },
              living_room: { label: 'Living Room', icon: <Sofa size={16} />, matchKeywords: ['living room', 'livingroom'] },
              dining_room: { label: 'Dining Room', icon: <UtensilsCrossed size={16} />, matchKeywords: ['dining room', 'diningroom'] },
              entrance: { label: 'Entrance', icon: <DoorOpen size={16} />, matchKeywords: ['entrance'] },
            }

            type StatChip = { icon: React.ReactNode; label: string; tag?: { text: string; color: string; bg: string } }
            const chips: StatChip[] = []

            // Guests
            chips.push({ icon: <Users size={16} />, label: `${property.max_guests} Guests` })

            // Bedrooms
            chips.push({ icon: <Bed size={16} />, label: `${property.bedrooms} Beds` })

            // Bathrooms (with type)
            const hasSharedBath = (property.bathrooms_detail ?? []).some(b => b.type === 'shared')
            const isBathShared = (property.bathrooms_detail ?? []).length > 0 ? hasSharedBath : false
            chips.push({
              icon: <Bath size={16} />,
              label: `${property.bathrooms} Baths`,
              tag: (property.bathrooms_detail ?? []).length > 0 ? {
                text: isBathShared ? 'Shared' : 'Private',
                color: isBathShared ? '#B45309' : '#15803D',
                bg: isBathShared ? '#FEF3C7' : '#DCFCE7',
              } : undefined
            })

            // Min Nights
            chips.push({ icon: <Moon size={16} />, label: `Min ${property.min_nights} Night${property.min_nights !== 1 ? 's' : ''}` })

            // Spaces (explicitly configured + auto-detected from amenities)
            const activeSpacesMap = new Map<string, { type: string; count: number; sharing: string }>()
            for (const sp of property.spaces_detail ?? []) {
              if (Number(sp.count) > 0 && spaceConfig[sp.type]) {
                activeSpacesMap.set(sp.type, { type: sp.type, count: Number(sp.count), sharing: sp.sharing || 'private' })
              }
            }
            const cleanAmenities = (property.amenities ?? []).filter(a => typeof a === 'string' && !a.startsWith('__space__:'))
            for (const [key, cfg] of Object.entries(spaceConfig)) {
              if (!activeSpacesMap.has(key)) {
                const foundInAmenities = cleanAmenities.some(a => cfg.matchKeywords.some(kw => a.toLowerCase().includes(kw)))
                if (foundInAmenities) {
                  activeSpacesMap.set(key, { type: key, count: 1, sharing: 'private' })
                }
              }
            }

            for (const sp of activeSpacesMap.values()) {
              const cfg = spaceConfig[sp.type]
              if (cfg) {
                const isShared = sp.sharing === 'shared'
                chips.push({
                  icon: cfg.icon,
                  label: `${sp.count} ${cfg.label}`,
                  tag: {
                    text: isShared ? 'Shared' : 'Private',
                    color: isShared ? '#B45309' : '#15803D',
                    bg: isShared ? '#FEF3C7' : '#DCFCE7',
                  }
                })
              }
            }

            if (property.pets_allowed) {
              chips.push({ icon: <Dog size={16} />, label: 'Pets Welcome' })
            }

            return (
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', padding: '20px 0', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', marginBottom: '32px' }}>
                {chips.map((chip, idx) => (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    backgroundColor: 'var(--color-bg-soft)',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: 'var(--color-text-primary)',
                  }}>
                    <span style={{ color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>{chip.icon}</span>
                    {chip.label}
                    {chip.tag && (
                      <span style={{ fontSize: '11px', fontWeight: '600', color: chip.tag.color, backgroundColor: chip.tag.bg, padding: '2px 8px', borderRadius: '100px', display: 'inline-flex', alignItems: 'center' }}>
                        {chip.tag.text}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Tabs - Vertical on Mobile, Horizontal on Desktop */}
          <div className="flex md:flex-row flex-col" style={{ gap: '0', marginBottom: '32px', borderBottom: 'none' }}>
            {/* Mobile: Vertical tabs with left border */}
            <div className="md:hidden flex flex-col w-full" style={{ borderRight: '1px solid var(--color-border)' }}>
              {tabs.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '16px 20px',
                    border: 'none',
                    borderLeft: activeTab === tab ? '3px solid var(--color-terra)' : '3px solid transparent',
                    borderRight: 'none',
                    borderBottom: '1px solid var(--color-border)',
                    backgroundColor: activeTab === tab ? '#f9f6f0' : 'transparent',
                    color: activeTab === tab ? 'var(--color-terra)' : 'var(--color-text-muted)',
                    fontSize: '13px',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    fontWeight: activeTab === tab ? '700' : '500',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s ease',
                    textAlign: 'left' as const,
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Desktop: Horizontal tabs with bottom border */}
            <div className="hidden md:flex md:w-full" style={{ borderBottom: '1px solid var(--color-border)', overflowX: 'auto', scrollBehavior: 'smooth' }}>
              {tabs.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '14px 20px',
                    border: 'none',
                    borderBottom: activeTab === tab ? '2px solid var(--color-terra)' : '2px solid transparent',
                    backgroundColor: 'transparent',
                    color: activeTab === tab ? 'var(--color-terra)' : 'var(--color-text-muted)',
                    fontSize: '13px',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    fontWeight: activeTab === tab ? '700' : '500',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Overview */}
          {activeTab === 'overview' && (
            <div>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '15px', lineHeight: '1.9', marginBottom: '32px' }}>
                {property.description}
              </p>

              {([
                ['About the stay', property.about_stay],
                ['The space', property.the_space],
                ['Location', property.location_notes],
                ['What guests love', property.what_guests_love],
                ['Things to know', property.things_to_know],
              ] as const).filter(([, text]) => text && text.trim()).map(([title, text]) => (
                <div key={title} style={{ marginBottom: '28px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' }}>{title}</h3>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '15px', lineHeight: '1.8', whiteSpace: 'pre-line' }}>{text}</p>
                </div>
              ))}

              {/* Photo Tour Preview in Overview */}
              {albums.length > 0 && (
                <div style={{ marginBottom: '36px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                      <h3 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text-primary)', margin: 0 }}>Photo Tour</h3>
                      <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>Explore photos categorized by room and space</p>
                    </div>
                    <button
                      onClick={() => openTourForAlbum('All')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                        border: '1.5px solid var(--color-text-primary)', borderRadius: '8px',
                        backgroundColor: '#ffffff', color: 'var(--color-text-primary)',
                        fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-bg-soft)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#ffffff' }}
                    >
                      <Camera size={15} /> View all {property.images.length} photos
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '14px' }}>
                    {albums.map(album => (
                      <div
                        key={album.name}
                        onClick={() => openTourForAlbum(album.name)}
                        style={{
                          borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--color-border)',
                          cursor: 'pointer', transition: 'all 0.2s ease', backgroundColor: '#ffffff',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'
                          ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'
                          ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-terra)'
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
                          ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
                          ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border)'
                        }}
                      >
                        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/11' }}>
                          <Image
                            src={album.cover}
                            alt={album.name}
                            fill
                            unoptimized
                            sizes="260px"
                            style={{ objectFit: 'cover' }}
                          />
                          <div style={{ position: 'absolute', bottom: '8px', right: '8px', backgroundColor: 'rgba(0,0,0,0.65)', color: '#ffffff', fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', backdropFilter: 'blur(4px)' }}>
                            {album.count} {album.count === 1 ? 'photo' : 'photos'}
                          </div>
                        </div>
                        <div style={{ padding: '12px 14px' }}>
                          <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)', margin: 0 }}>
                            {album.name}
                          </p>
                          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                            {album.count} {album.count === 1 ? 'photo' : 'photos'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={cardStyle}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '16px' }}>Property Contact</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {[
                    { label: 'Address', value: property.address },
                    { label: 'Phone', value: property.contact_phone },
                    { label: 'Email', value: property.contact_email },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <div>
                        <p style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '2px', fontWeight: '600' }}>{item.label}</p>
                        <p style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>{item.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

                {/* Highlight strip: key benefits */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  {['Cleanliness', 'Good Locations', 'Easy Check-In', 'Functional Kitchen', 'Aesthetic Rooms', 'Pets Welcome Everywhere'].map(item => (
                    <span key={item} 
                      onMouseEnter={() => setHoveredTags(prev => ({ ...prev, [item]: true }))}
                      onMouseLeave={() => setHoveredTags(prev => ({ ...prev, [item]: false }))}
                      style={{
                      border: hoveredTags[item] ? '1px solid var(--color-deep)' : '1px solid var(--color-border)',
                      backgroundColor: hoveredTags[item] ? 'var(--color-deep)' : '#ffffff',
                      color: hoveredTags[item] ? '#ffffff' : 'var(--color-text-primary)',
                      padding: '6px 10px',
                      fontSize: '12px',
                      borderRadius: '999px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      transform: hoveredTags[item] ? 'scale(1.05)' : 'scale(1)',
                    }}>
                      {item}
                    </span>
                  ))}
                </div>

                {/* Local Recommendations Section */}
                {(property.local_recommendations ?? []).length > 0 && (
                  <div style={{ ...cardStyle, marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <Compass size={22} style={{ color: 'var(--color-terra)' }} />
                      <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-text-primary)', margin: 0 }}>
                        Local Recommendations & Host Tips
                      </h3>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                      Curated recommendations from your host for nearby spots, food, and attractions
                    </p>
                    <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--color-terra)', marginBottom: '20px' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: '12px' }}>
                      {property.local_recommendations!.map((rec, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            gap: '10px',
                            alignItems: 'flex-start',
                            padding: '14px 16px',
                            backgroundColor: 'var(--color-bg-card)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '10px',
                          }}
                        >
                          <MapPin size={16} style={{ color: 'var(--color-terra)', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
                          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.6', margin: 0 }}>
                            {rec}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-terra)', borderRadius: '12px', padding: '20px 24px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <ShieldAlert size={22} style={{ color: 'var(--color-terra)', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '6px' }}>Cancellation policy: {policy.label}</h4>
                    <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>{policy.summary}</p>
                  </div>
                </div>
            </div>
          )}

          {/* Photo Tour Tab */}
          {activeTab === 'photo tour' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--color-text-primary)', margin: 0 }}>Photo Tour</h3>
                  <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>All photos organized by room and space</p>
                </div>
                <button
                  onClick={() => openTourForAlbum('All')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px',
                    backgroundColor: 'var(--color-text-primary)', color: '#ffffff',
                    borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                  }}
                >
                  <Camera size={16} /> Open Gallery View
                </button>
              </div>

              {albums.map(album => (
                <div key={album.name} style={{ marginBottom: '32px', backgroundColor: 'var(--color-bg-soft)', borderRadius: '12px', padding: '20px', border: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Folder size={18} style={{ color: 'var(--color-terra)' }} />
                      <h4 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--color-text-primary)', margin: 0 }}>{album.name}</h4>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', backgroundColor: '#ffffff', padding: '2px 8px', borderRadius: '10px', fontWeight: '600', border: '1px solid var(--color-border)' }}>
                        {album.count} {album.count === 1 ? 'photo' : 'photos'}
                      </span>
                    </div>
                    <button
                      onClick={() => openTourForAlbum(album.name)}
                      style={{ fontSize: '12px', color: 'var(--color-terra)', fontWeight: '700', backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      View Space →
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                    {album.images.map((img, idx) => (
                      <div
                        key={img.id || idx}
                        onClick={() => { setTourActiveAlbum(album.name); setTourActiveIndex(idx); setTourModalOpen(true) }}
                        style={{ position: 'relative', aspectRatio: '4/3', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer' }}
                      >
                        <Image
                          src={img.image_url}
                          alt=""
                          fill
                          unoptimized
                          sizes="180px"
                          style={{ objectFit: 'cover', transition: 'transform 0.2s ease' }}
                          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
                          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Amenities */}
          {activeTab === 'amenities' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                {(property.amenities ?? []).filter(a => typeof a === 'string' && !a.startsWith('__space__:') && !a.trim().startsWith('{') && !a.includes('"type":')).map(amenity => (
                  <div key={amenity} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '10px' }}>
                    <Check size={16} style={{ color: 'var(--color-terra)', flexShrink: 0 }} />
                    <span style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>{amenity}</span>
                  </div>
                ))}
                {property.pets_allowed && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '10px' }}>
                    <Dog size={16} style={{ color: 'var(--color-terra)', flexShrink: 0 }} />
                    <span style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>Pets (+&#8377;{property.pet_charge_per_night}/pet/night)</span>
                  </div>
                )}
              </div>

              {property.bathrooms_detail && property.bathrooms_detail.length > 0 && (
                <div style={{ marginTop: '32px' }}>
                  <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '16px' }}>Bathroom Details</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                    {property.bathrooms_detail.map((b, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '10px' }}>
                        <Bath size={16} style={{ color: 'var(--color-terra)', flexShrink: 0 }} />
                        <span style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>{b.count}x {bathroomLabel[b.type]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Spaces & Areas in Amenities tab */}
              {(() => {
                const spaceConfig: Record<string, { label: string; icon: React.ReactNode; matchKeywords: string[] }> = {
                  balcony: { label: 'Balcony', icon: <Armchair size={16} />, matchKeywords: ['balcony'] },
                  terrace: { label: 'Terrace', icon: <TreePalm size={16} />, matchKeywords: ['terrace'] },
                  kitchen: { label: 'Kitchen', icon: <Utensils size={16} />, matchKeywords: ['kitchen'] },
                  hall: { label: 'Hall', icon: <LayoutDashboard size={16} />, matchKeywords: ['hall'] },
                  living_room: { label: 'Living Room', icon: <Sofa size={16} />, matchKeywords: ['living room', 'livingroom'] },
                  dining_room: { label: 'Dining Room', icon: <UtensilsCrossed size={16} />, matchKeywords: ['dining room', 'diningroom'] },
                  entrance: { label: 'Entrance', icon: <DoorOpen size={16} />, matchKeywords: ['entrance'] },
                }
                const activeSpacesMap = new Map<string, { type: string; count: number; sharing: string }>()
                for (const sp of property.spaces_detail ?? []) {
                  if (Number(sp.count) > 0 && spaceConfig[sp.type]) {
                    activeSpacesMap.set(sp.type, { type: sp.type, count: Number(sp.count), sharing: sp.sharing || 'not_shared' })
                  }
                }
                const cleanAmenities = (property.amenities ?? []).filter(a => typeof a === 'string' && !a.startsWith('__space__:'))
                for (const [key, cfg] of Object.entries(spaceConfig)) {
                  if (!activeSpacesMap.has(key)) {
                    const foundInAmenities = cleanAmenities.some(a => cfg.matchKeywords.some(kw => a.toLowerCase().includes(kw)))
                    if (foundInAmenities) {
                      activeSpacesMap.set(key, { type: key, count: 1, sharing: 'not_shared' })
                    }
                  }
                }
                if (activeSpacesMap.size === 0) return null
                return (
                  <div style={{ marginTop: '32px' }}>
                    <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '16px' }}>Spaces &amp; Areas</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                      {Array.from(activeSpacesMap.values()).map((sp, i) => {
                        const cfg = spaceConfig[sp.type]
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '10px' }}>
                            <span style={{ color: 'var(--color-terra)', flexShrink: 0, display: 'flex' }}>{cfg?.icon ?? <LayoutDashboard size={16} />}</span>
                            <span style={{ fontSize: '14px', color: 'var(--color-text-primary)', flex: 1 }}>{sp.count}x {cfg?.label ?? sp.type}</span>
                            <span style={{ fontSize: '11px', fontWeight: '600', color: sp.sharing === 'shared' ? '#B45309' : '#15803D', backgroundColor: sp.sharing === 'shared' ? '#FEF3C7' : '#DCFCE7', padding: '2px 7px', borderRadius: '100px', display: 'inline-flex', alignItems: 'center' }}>
                              {sp.sharing === 'shared' ? 'Shared' : 'Private'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              <div style={{ marginTop: '32px', ...cardStyle }}>
                <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={20} style={{ color: 'var(--color-terra)' }} /> Check In &amp; Out
                </h3>
                <div style={{ display: 'flex', gap: '32px' }}>
                  <div>
                    <p style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '8px', fontWeight: '600' }}>Check In</p>
                    <p style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-text-primary)' }}>{property.check_in_time}</p>
                  </div>
                  <div style={{ width: '1px', backgroundColor: 'var(--color-border)' }} />
                  <div>
                    <p style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '8px', fontWeight: '600' }}>Check Out</p>
                    <p style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-text-primary)' }}>{property.check_out_time}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* House Rules */}
          {activeTab === 'house rules' && (
            <div>
              <div style={cardStyle}>
                <h3 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' }}>House Rules</h3>
                <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--color-terra)', marginBottom: '24px' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {(() => {
                    const existing = property.house_rules ?? []
                    const combined = [
                      ...DEFAULT_STANDARD_RULES,
                      ...existing.filter(r => !DEFAULT_STANDARD_RULES.includes(r))
                    ]
                    return combined.map((rule, i) => (
                      <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', paddingBottom: '16px', borderBottom: i < combined.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                        <Check size={16} style={{ color: 'var(--color-terra)', flexShrink: 0, marginTop: '3px' }} />
                        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>{rule}</p>
                      </div>
                    ))
                  })()}
                </div>
              </div>

                {/* Highlight strip before non-refundable notice */}
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px', margin: '12px 0 20px' }}>
                  {['Cleanliness', 'Good Locations', 'Ease Of Check-In', 'Functional Kitchen', 'Aesthetics Of The Room', 'Pets Welcome Everywhere'].map(item => (
                    <span key={item} 
                      onMouseEnter={() => setHoveredTags(prev => ({ ...prev, [item]: true }))}
                      onMouseLeave={() => setHoveredTags(prev => ({ ...prev, [item]: false }))}
                      style={{
                      border: '1px solid var(--color-navbar-border)',
                      backgroundColor: hoveredTags[item] ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
                      color: 'var(--color-navbar-text)',
                      padding: '8px 14px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      letterSpacing: '1px',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      transform: hoveredTags[item] ? 'translateY(-2px)' : 'translateY(0)',
                    }}>
                      {item}
                    </span>
                  ))}
                </div>

                <div style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-terra)', borderRadius: '12px', padding: '20px 24px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <ShieldAlert size={22} style={{ color: 'var(--color-terra)', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '6px' }}>Cancellation policy: {policy.label}</h4>
                    <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>{policy.summary}</p>
                  </div>
                </div>
            </div>
          )}

          {/* Location */}
          {activeTab === 'location' && (
            <div>
              <div style={cardStyle}>
                <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '16px' }}>Address</h3>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <MapPin size={20} style={{ color: 'var(--color-terra)', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <p style={{ fontSize: '15px', color: 'var(--color-text-primary)', fontWeight: '700', marginBottom: '4px' }}>{property.name}</p>
                    <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>{property.address}</p>
                  </div>
                </div>
              </div>

              <MapWrapper
                latitude={property.latitude}
                longitude={property.longitude}
                propertyName={property.name}
                address={property.address}
              />

              <div style={{ ...cardStyle, marginTop: '16px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '16px' }}>Contact Property</h3>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <a href={`tel:${property.contact_phone}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', border: '1px solid var(--color-terra)', borderRadius: '8px', color: 'var(--color-text-primary)', textDecoration: 'none', fontSize: '14px', fontWeight: '600' }}>
                    <Phone size={15} style={{ color: 'var(--color-terra)' }} /> {property.contact_phone}
                  </a>
                  <a href={`mailto:${property.contact_email}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', border: '1px solid var(--color-terra)', borderRadius: '8px', color: 'var(--color-text-primary)', textDecoration: 'none', fontSize: '14px', fontWeight: '600' }}>
                    <Mail size={15} style={{ color: 'var(--color-terra)' }} /> {property.contact_email}
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Reviews */}
          {activeTab === 'reviews' && (
            <div>
              {reviewSummary && Object.keys(reviewSummary.categories).length > 0 && (
                <div style={{ ...cardStyle, marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)' }}>Guest ratings</h3>
                    {reviewSummary.recommend_percent !== null && (
                      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {reviewSummary.recommend_percent}% of guests would recommend this stay
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px 32px' }}>
                    {Object.entries(reviewSummary.categories).map(([name, value]) => (
                      <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ width: '96px', fontSize: '13px', textTransform: 'capitalize', color: 'var(--color-text-secondary)' }}>{name}</span>
                        <div style={{ flex: 1, height: '6px', borderRadius: '3px', backgroundColor: 'var(--color-border)' }}>
                          <div style={{ width: `${((value ?? 0) / 5) * 100}%`, height: '100%', borderRadius: '3px', backgroundColor: 'var(--color-terra)' }} />
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 700, width: '28px', textAlign: 'right' }}>{value?.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ ...cardStyle, display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '56px', color: 'var(--color-text-primary)', lineHeight: '1', fontWeight: '800' }}>{property.avg_rating}</p>
                  <div style={{ color: 'var(--color-terra)', display: 'flex', gap: '2px', justifyContent: 'center', margin: '4px 0' }}>
                    {Array.from({ length: Math.floor(property.avg_rating) }).map((_, idx) => (
                      <Star key={idx} size={18} fill="currentColor" />
                    ))}
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{property.review_count} review{property.review_count !== 1 ? 's' : ''}</p>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {starCounts.map(({ star, count }) => (
                    <div key={star} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', width: '24px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>{star}<Star size={10} fill="currentColor" color="var(--color-terra)" /></span>
                      <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--color-border)', borderRadius: '3px' }}>
                        <div style={{
                          height: '100%', backgroundColor: 'var(--color-terra)', borderRadius: '3px',
                          width: reviews.length > 0 ? `${Math.round((count / reviews.length) * 100)}%` : '0%',
                          transition: 'width 0.4s ease',
                        }} />
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', width: '16px', textAlign: 'right' }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {reviewsLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>Loading reviews…</div>
              ) : reviews.length === 0 ? (
                <div style={{ backgroundColor: '#ffffff', padding: '40px', border: '1px solid var(--color-border)', borderRadius: '12px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}><Sparkles size={32} color="var(--color-terra)" /></div>
                  <p style={{ fontWeight: '700', marginBottom: '4px' }}>No reviews yet</p>
                  <p style={{ fontSize: '13px' }}>Be the first to stay here</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {reviews.map(review => (
                    <div key={review.id} style={{ backgroundColor: '#ffffff', padding: '24px', border: '1px solid var(--color-border)', borderRadius: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '40px', height: '40px', backgroundColor: 'var(--color-terra)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f6eddc', fontWeight: '700', fontSize: '16px', flexShrink: 0 }}>
                            {review.guest_name[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p style={{ fontWeight: '700', fontSize: '14px', color: 'var(--color-text-primary)' }}>{review.guest_name}</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{new Date(review.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
                              {review.platform && <span style={{ fontSize: '10px', backgroundColor: '#E3F2FD', color: '#1565C0', padding: '2px 6px', borderRadius: '999px', fontWeight: '700', letterSpacing: '0.3px' }}>{review.platform}</span>}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'inline-flex', gap: '1px' }}>
                          {Array.from({ length: review.rating }).map((_, i) => <Star key={i} size={13} fill="currentColor" color="var(--color-terra)" />)}
                        </div>
                      </div>
                      {review.comment && <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.7' }}>{review.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Booking Widget */}
        <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '24px', boxShadow: '0 12px 36px rgba(0,0,0,0.06)' }} className="sticky-desktop md:sticky">
          <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--color-bg-soft)' }}>
            <div>
              <span style={{ fontSize: '30px', fontWeight: '900', color: 'var(--color-text-primary)' }}>
                ₹{(nights > 0 ? Math.round(basePrice / nights) : property.price_per_night).toLocaleString('en-IN')}
              </span>
              <span style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginLeft: '6px' }}>/ night</span>
            </div>
          </div>

          <div style={{ border: '1px solid var(--color-border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
            <div
              style={{
                padding: '14px 16px',
                backgroundColor: 'var(--color-bg-card)',
                borderBottom: '1px solid var(--color-border)',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '12px',
              }}
            >
              <div>
                <p style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '4px', fontWeight: '700' }}>Check In</p>
                <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)' }}>{formatDateLabel(range?.from)}</p>
              </div>
              <div>
                <p style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '4px', fontWeight: '700' }}>Check Out</p>
                <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)' }}>{formatDateLabel(range?.to)}</p>
              </div>
            </div>
            <div style={{ padding: '12px 8px', borderBottom: '1px solid var(--color-border)', backgroundColor: '#ffffff' }}>
              <div className="earthy-day-picker">
                <DayPicker
                  mode="range"
                  selected={range}
                  onSelect={handleRangeSelect}
                  disabled={[{ before: today }, ...(range?.from ? [{ before: range.from }] : []), ...disabledRanges]}
                  fromDate={today}
                  numberOfMonths={1}
                />
              </div>
              {(range?.from || range?.to) && (
                <div style={{ textAlign: 'center', marginTop: '8px' }}>
                  <button
                    onClick={() => {
                      setRange(undefined)
                      setCheckIn('')
                      setCheckOut('')
                      setBookingError(null)
                    }}
                    style={{
                      background: 'none',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-primary)',
                      padding: '6px 14px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    Clear dates
                  </button>
                </div>
              )}
            </div>
            {bookingError && (
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', backgroundColor: '#FFF5F5' }}>
                <p style={{ color: '#C62828', fontSize: '12px', margin: 0, fontWeight: '600' }}>{bookingError}</p>
              </div>
            )}
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: property.pets_allowed ? '1px solid var(--color-border)' : 'none', backgroundColor: '#ffffff' }}>
              <label style={{ fontSize: '11px', letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: '700' }}>Guests</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button onClick={() => setGuests(Math.max(1, guests - 1))} style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-card)', width: '34px', height: '34px', fontSize: '16px', cursor: 'pointer', borderRadius: '6px', fontWeight: '700' }}>−</button>
                <span style={{ minWidth: '32px', textAlign: 'center', fontSize: '15px', fontWeight: '700', color: 'var(--color-text-primary)' }}>{guests}</span>
                <button onClick={() => setGuests(Math.min(property.max_guests || 30, guests + 1))} style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-card)', width: '34px', height: '34px', fontSize: '16px', cursor: 'pointer', borderRadius: '6px', fontWeight: '700' }}>+</button>
              </div>
            </div>
            {property.pets_allowed && (
              <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff' }}>
                <div>
                  <label style={{ fontSize: '11px', letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block', fontWeight: '700' }}>Pets</label>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>+&#8377;{property.pet_charge_per_night}/pet/night</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button onClick={() => setPets(Math.max(0, pets - 1))} style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-card)', width: '34px', height: '34px', fontSize: '16px', cursor: 'pointer', borderRadius: '6px', fontWeight: '700' }}>−</button>
                  <span style={{ minWidth: '32px', textAlign: 'center', fontSize: '15px', fontWeight: '700', color: 'var(--color-text-primary)' }}>{pets}</span>
                  <button onClick={() => setPets(Math.min(property.max_pets || 0, pets + 1))} style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-card)', width: '34px', height: '34px', fontSize: '16px', cursor: 'pointer', borderRadius: '6px', fontWeight: '700' }}>+</button>
                </div>
              </div>
            )}
          </div>

          {nights > 0 && (
            <div style={{ backgroundColor: 'var(--color-bg-soft)', padding: '16px', marginBottom: '16px', fontSize: '14px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: 'var(--color-text-secondary)' }}>
                <span>₹{Math.round(basePrice / nights).toLocaleString('en-IN')} × {nights} night{nights !== 1 ? 's' : ''}</span>
                <span>₹{basePrice.toLocaleString('en-IN')}</span>
              </div>
              {extraGuestCharge > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: 'var(--color-text-secondary)' }}>
                  <span>Extra guest charge ({extraGuests} guest{extraGuests > 1 ? 's' : ''} × {nights} night{nights > 1 ? 's' : ''})</span>
                  <span>₹{extraGuestCharge.toLocaleString('en-IN')}</span>
                </div>
              )}
              {pets > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: 'var(--color-text-secondary)' }}>
                  <span>{pets} pet{pets > 1 ? 's' : ''} × {nights} night{nights > 1 ? 's' : ''}</span>
                  <span>₹{petCharge.toLocaleString('en-IN')}</span>
                </div>
              )}
              {property.cleaning_fee > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: 'var(--color-text-secondary)' }}>
                  <span>Cleaning fee</span>
                  <span>₹{property.cleaning_fee.toLocaleString('en-IN')}</span>
                </div>
              )}
              {taxes > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                  <span>Taxes</span>
                  <span>₹{taxes.toLocaleString('en-IN')}</span>
                </div>
              )}
              {serviceFee > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                  <span>Concept Stay service fee</span>
                  <span>₹{serviceFee.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div style={{ height: '1px', backgroundColor: 'var(--color-border)', margin: '12px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', color: 'var(--color-text-primary)', fontSize: '15px' }}>
                <span>Total</span>
                <span>₹{totalPrice.toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}

          {property.min_nights > 1 && (
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '16px', textAlign: 'center' }}>
              Minimum stay: {property.min_nights} nights
            </p>
          )}

          <button
            onClick={handleBook}
            style={{ width: '100%', backgroundColor: 'var(--color-terra)', color: '#f6eddc', border: 'none', padding: '18px', fontSize: '14px', letterSpacing: '2px', fontWeight: '700', textTransform: 'uppercase', cursor: 'pointer', marginBottom: '12px', borderRadius: '8px', transition: 'all 0.2s ease' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.15)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
          >
            Reserve Now
          </button>

          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: '1.6' }}>
            Cancellation policy: <strong>{policy.label}</strong>
          </p>
        </div>
      </div>
      </div>

      {/* ── Photo Tour Lightbox Modal ── */}
      {tourModalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            backgroundColor: 'rgba(10, 10, 10, 0.96)',
            display: 'flex', flexDirection: 'column',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {/* Top Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            {/* Space Navigation Pills */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none', alignItems: 'center', maxWidth: '80vw' }}>
              <button
                type="button"
                onClick={() => { setTourActiveAlbum('All'); setTourActiveIndex(0) }}
                style={{
                  padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '700',
                  border: tourActiveAlbum === 'All' ? '1.5px solid var(--color-terra)' : '1px solid rgba(255,255,255,0.2)',
                  backgroundColor: tourActiveAlbum === 'All' ? 'var(--color-terra)' : 'transparent',
                  color: tourActiveAlbum === 'All' ? 'var(--color-text-primary)' : '#ffffff',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                All Photos ({property.images.length})
              </button>

              {albums.map(album => (
                <button
                  key={album.name}
                  type="button"
                  onClick={() => { setTourActiveAlbum(album.name); setTourActiveIndex(0) }}
                  style={{
                    padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '700',
                    border: tourActiveAlbum === album.name ? '1.5px solid var(--color-terra)' : '1px solid rgba(255,255,255,0.2)',
                    backgroundColor: tourActiveAlbum === album.name ? 'var(--color-terra)' : 'transparent',
                    color: tourActiveAlbum === album.name ? 'var(--color-text-primary)' : '#ffffff',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  <Folder size={12} style={{ display: 'inline-block', marginRight: '4px', verticalAlign: 'middle' }} /> {album.name} ({album.count})
                </button>
              ))}
            </div>

            {/* Counter & Close */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ color: '#ffffff', fontSize: '13px', fontWeight: '600', letterSpacing: '0.5px' }}>
                {tourActiveIndex + 1} / {currentTourImages.length}
              </span>
              <button
                type="button"
                onClick={() => setTourModalOpen(false)}
                style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.3)',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.25)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.1)' }}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Main Photo Viewing Area */}
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 40px' }}>
            {currentTourImages[tourActiveIndex] && (
              <div style={{ position: 'relative', width: '100%', height: '100%', maxWidth: '1100px', maxHeight: '72vh' }}>
                <Image
                  src={currentTourImages[tourActiveIndex].image_url}
                  alt={property.name}
                  fill
                  unoptimized
                  sizes="90vw"
                  style={{ objectFit: 'contain' }}
                  priority
                />
              </div>
            )}

            {/* Prev / Next Buttons */}
            {currentTourImages.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setTourActiveIndex(i => Math.max(0, i - 1))}
                  disabled={tourActiveIndex === 0}
                  style={{
                    position: 'absolute', left: '24px', top: '50%', transform: 'translateY(-50%)',
                    width: '48px', height: '48px', borderRadius: '50%',
                    backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: tourActiveIndex === 0 ? 'not-allowed' : 'pointer',
                    opacity: tourActiveIndex === 0 ? 0.3 : 1,
                    backdropFilter: 'blur(6px)', transition: 'all 0.15s ease',
                  }}
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  type="button"
                  onClick={() => setTourActiveIndex(i => Math.min(currentTourImages.length - 1, i + 1))}
                  disabled={tourActiveIndex === currentTourImages.length - 1}
                  style={{
                    position: 'absolute', right: '24px', top: '50%', transform: 'translateY(-50%)',
                    width: '48px', height: '48px', borderRadius: '50%',
                    backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: tourActiveIndex === currentTourImages.length - 1 ? 'not-allowed' : 'pointer',
                    opacity: tourActiveIndex === currentTourImages.length - 1 ? 0.3 : 1,
                    backdropFilter: 'blur(6px)', transition: 'all 0.15s ease',
                  }}
                >
                  <ChevronRight size={24} />
                </button>
              </>
            )}
          </div>

          {/* Bottom Thumbnails Filmstrip */}
          <div style={{ padding: '12px 24px 20px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none', justifyContent: 'center' }}>
            {currentTourImages.map((img, i) => (
              <div
                key={img.id || i}
                onClick={() => setTourActiveIndex(i)}
                style={{
                  position: 'relative', width: '70px', height: '48px', flexShrink: 0,
                  borderRadius: '6px', overflow: 'hidden', cursor: 'pointer',
                  border: tourActiveIndex === i ? '2px solid var(--color-terra)' : '2px solid transparent',
                  opacity: tourActiveIndex === i ? 1 : 0.5, transition: 'all 0.15s ease',
                  transform: tourActiveIndex === i ? 'scale(1.08)' : 'scale(1)',
                }}
              >
                <Image
                  src={img.image_url}
                  alt=""
                  fill
                  unoptimized
                  sizes="80px"
                  style={{ objectFit: 'cover' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
