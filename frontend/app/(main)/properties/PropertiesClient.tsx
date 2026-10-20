"use client"
import React, { useState, useMemo, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import PropertyCard from '@/components/property/PropertyCard'
import { buildApiUrl } from '@/lib/api'
import MarketplaceFilters, { EMPTY_MARKETPLACE_FILTERS, type MarketplaceFilterState } from '@/components/property/MarketplaceFilters'
import type { Property } from '@/lib/types'
import { Building2, Map as MapIcon, LayoutGrid, SlidersHorizontal, Search, RotateCcw, PawPrint, Calendar, Users, X } from 'lucide-react'

const PropertiesMap = dynamic(() => import('@/components/property/PropertiesMap'), { ssr: false })

// The price sliders top out at ₹50,000; the top stop means "₹50,000+" (no upper bound), like the API's max_price.
const PRICE_CAP = 50000
const PRICE_STEP = 500

const roomTypeOptions = [
  { value: 'all', label: 'Any Room Type' },
  { value: 'shared', label: 'Shared' },
  { value: 'private', label: 'Private' },
]

const propertyTypeOptions = [
  { value: 'all', label: 'Any Type' },
  { value: 'rooms', label: 'Rooms' },
  { value: 'entire_house', label: 'Entire House' },
]

const bathroomTypeOptions = [
  { value: 'all', label: 'Any Type' },
  { value: 'ensuite', label: 'Ensuite' },
  { value: 'shared', label: 'Shared' },
  { value: 'detached_private', label: 'Detached Private' },
]

const formatPrice = (value: number) => {
  if (value >= PRICE_CAP) return `₹${PRICE_CAP.toLocaleString('en-IN')}+`

  return `₹${value.toLocaleString('en-IN')}`
}

const getRoomType = (property: Property) => (
  property.bathrooms_detail.some(bathroom => bathroom.type === 'shared') ? 'shared' : 'private'
)

const getPropertyType = (property: Property) => {
  const name = property.name.toLowerCase()

  if (name.includes('villa') || name.includes('haveli') || name.includes('house')) {
    return 'entire_house'
  }

  return 'rooms'
}

export default function PropertiesClient() {
  const searchParams = useSearchParams()

  // ── Read hero search params — always live from URL ───────────────────────
  const urlLocation = searchParams.get('location') || ''
  const urlPets     = searchParams.get('pets') || '0'
  const urlCheckIn  = searchParams.get('checkIn')  || searchParams.get('check_in')  || ''
  const urlCheckOut = searchParams.get('checkOut') || searchParams.get('check_out') || ''
  const urlGuests   = searchParams.get('guests')   || ''
  const urlCategory = searchParams.get('category') || ''
  const urlDestination = searchParams.get('destination') || ''

  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [location, setLocation] = useState(urlLocation)
  const [maxPrice, setMaxPrice] = useState(PRICE_CAP)
  const [minPrice, setMinPrice] = useState(0)
  const [minBedrooms, setMinBedrooms] = useState(1)
  const [petsOnly, setPetsOnly] = useState(urlPets !== '0')
  const [roomType, setRoomType] = useState('all')
  const [propertyType, setPropertyType] = useState('all')
  const [bathroomType, setBathroomType] = useState('all')
  const [sortBy, setSortBy] = useState('rating')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [mkt, setMkt] = useState<MarketplaceFilterState>(EMPTY_MARKETPLACE_FILTERS)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [showMap, setShowMap] = useState(false)

  // Sync location + pets from URL if URL changes (e.g. hero re-search)
  useEffect(() => { setLocation(urlLocation) }, [urlLocation])
  useEffect(() => { setPetsOnly(urlPets !== '0') }, [urlPets])


  useEffect(() => {
    let isMounted = true

    const load = async () => {
      try {
        setLoading(true)
        setLoadError(null)

        // Pass dates + guests to backend for availability filtering
        const apiParams = new URLSearchParams({ limit: '200' })
        if (urlCheckIn)  apiParams.set('check_in',  urlCheckIn)
        if (urlCheckOut) apiParams.set('check_out', urlCheckOut)
        if (urlGuests)   apiParams.set('guests',    urlGuests)
        if (urlCategory) apiParams.set('category',  urlCategory)
        if (urlDestination) apiParams.set('destination', urlDestination)
        if (mkt.types.length)       apiParams.set('property_type', mkt.types.join(','))
        if (mkt.experiences.length) apiParams.set('experience',   mkt.experiences.join(','))
        if (mkt.amenities.length)   apiParams.set('amenities',    mkt.amenities.join(','))
        if (mkt.verifiedOnly)       apiParams.set('verified_only', 'true')

        const response = await fetch(buildApiUrl(`/properties?${apiParams.toString()}`), { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`Failed to load properties (${response.status})`)
        }
        const data = await response.json()
        if (isMounted) {
          setProperties(Array.isArray(data.items) ? data.items : [])
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load properties')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
          setLoadedOnce(true)
        }
      }
    }

    load()
    return () => {
      isMounted = false
    }
  }, [urlCheckIn, urlCheckOut, urlGuests, urlCategory, urlDestination, mkt])

  const filtered = useMemo(() => {
    let result = [...properties]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q) ||
        p.state?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        (Array.isArray(p.amenities) && p.amenities.some(a => typeof a === 'string' && a.toLowerCase().includes(q)))
      )
    }
    if (location) {
      const q = location.toLowerCase()
      // Search by city, state, OR property name
      result = result.filter(p =>
        p.city?.toLowerCase().includes(q) ||
        p.state?.toLowerCase().includes(q) ||
        p.name?.toLowerCase().includes(q)
      )
    }
    result = result.filter(p => p.price_per_night >= minPrice && (maxPrice >= PRICE_CAP || p.price_per_night <= maxPrice))
    if (minBedrooms > 1) result = result.filter(p => p.bedrooms >= minBedrooms)
    if (petsOnly) result = result.filter(p => p.pets_allowed)
    if (roomType !== 'all') result = result.filter(p => getRoomType(p) === roomType)
    if (propertyType !== 'all') result = result.filter(p => getPropertyType(p) === propertyType)
    if (bathroomType !== 'all') result = result.filter(p => p.bathrooms_detail.some(b => b.type === bathroomType))
    if (sortBy === 'rating') result.sort((a, b) => b.avg_rating - a.avg_rating)
    else if (sortBy === 'price_low') result.sort((a, b) => a.price_per_night - b.price_per_night)
    else if (sortBy === 'price_high') result.sort((a, b) => b.price_per_night - a.price_per_night)
    else if (sortBy === 'reviews') result.sort((a, b) => b.review_count - a.review_count)
    return result
  }, [properties, searchQuery, location, minPrice, maxPrice, minBedrooms, petsOnly, roomType, propertyType, bathroomType, sortBy])

  const resetFilters = () => {
    setSearchQuery('')
    setLocation('')
    setMinPrice(0)
    setMaxPrice(PRICE_CAP)
    setMinBedrooms(1)
    setPetsOnly(false)
    setRoomType('all')
    setPropertyType('all')
    setBathroomType('all')
    setSortBy('rating')
    setMkt(EMPTY_MARKETPLACE_FILTERS)
    setFiltersOpen(false)
  }

  if (loading && !loadedOnce) {
    return (
      <div className="page-shell" style={{ backgroundColor: '#ffffff' }}>
        {/* Hero shimmer */}
        <div className="surface-deep" style={{ backgroundColor: 'var(--color-deep)', padding: '64px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--color-terra)', fontSize: '12px', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '12px', fontWeight: '600' }}>Explore</p>
          <h1 style={{ color: 'var(--color-on-deep)', fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: '800', marginBottom: '8px' }}>Our Properties</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '15px' }}>Escape to thoughtfully curated stays inspired by nature, comfort, and local experiences.</p>
        </div>
        <div className="content-shell-lg" style={{ padding: '48px 24px 72px' }}>
          <div className="responsive-card-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ borderRadius: '12px', border: '1px solid var(--color-border)', overflow: 'hidden', backgroundColor: '#fff' }}>
                <div style={{ width: '100%', aspectRatio: '4/3', background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ height: 20, width: '70%', background: '#f0f0f0', borderRadius: 6, marginBottom: 10, animation: 'shimmer 1.4s infinite' }} />
                  <div style={{ height: 14, width: '50%', background: '#f0f0f0', borderRadius: 6, marginBottom: 14, animation: 'shimmer 1.4s infinite' }} />
                  <div style={{ height: 1, background: 'var(--color-border)', marginBottom: 12 }} />
                  <div style={{ height: 24, width: '40%', background: '#f0f0f0', borderRadius: 6, animation: 'shimmer 1.4s infinite' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="page-shell" style={{ backgroundColor: '#ffffff' }}>
        <div style={{ padding: '120px 24px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          {loadError}
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell" style={{ backgroundColor: '#ffffff' }}>
      <div className="surface-deep" style={{ backgroundColor: 'var(--color-deep)', padding: '64px 24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-on-deep)', fontSize: '12px', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '12px', fontWeight: '600' }}>
          Explore
        </p>
        <h1 style={{ color: 'var(--color-on-deep)', fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: '800', marginBottom: '8px' }}>
          Our Properties
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '15px' }}>
          Escape to thoughtfully curated stays inspired by nature, comfort, and local experiences.
        </p>
      </div>

      <div className="content-shell-lg" style={{ padding: '48px 24px 72px' }}>
        {/* Active search chips from hero */}
        {(urlCheckIn || urlCheckOut || urlGuests) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
            {urlCheckIn && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '999px', backgroundColor: 'var(--color-bg-soft)', border: '1px solid var(--color-border)', fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: '500' }}>
                <Calendar size={13} style={{ color: 'var(--color-terra)' }} />
                Check-in: {new Date(urlCheckIn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            )}
            {urlCheckOut && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '999px', backgroundColor: 'var(--color-bg-soft)', border: '1px solid var(--color-border)', fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: '500' }}>
                <Calendar size={13} style={{ color: 'var(--color-terra)' }} />
                Check-out: {new Date(urlCheckOut).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            )}
            {urlGuests && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '999px', backgroundColor: 'var(--color-bg-soft)', border: '1px solid var(--color-border)', fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: '500' }}>
                <Users size={13} style={{ color: 'var(--color-terra)' }} />
                {urlGuests} Guest{Number(urlGuests) !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* Single-line Actions Bar: Filters & Count (Left) + Search Bar (Middle) + Sort By (Right) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '28px',
          flexWrap: 'wrap',
        }}>
          {/* Left: Filters button + count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            <button
              onClick={() => setFiltersOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                color: 'var(--color-text-primary)',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <SlidersHorizontal style={{ width: '16px', height: '16px' }} />
              Filters
            </button>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', whiteSpace: 'nowrap', margin: 0 }}>
              <strong>{filtered.length}</strong> properties
            </p>
          </div>

          {/* Middle: Search bar */}
          <div style={{ flex: '1 1 280px', maxWidth: '500px', minWidth: '220px', position: 'relative' }}>
            <Search style={{
              position: 'absolute',
              left: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '16px',
              height: '16px',
              color: 'var(--color-text-muted)',
              pointerEvents: 'none',
            }} />
            <input
              type="text"
              placeholder="Search by name, location, or amenities..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 36px 10px 38px',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                fontSize: '14px',
                color: 'var(--color-text-primary)',
                backgroundColor: '#ffffff',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s ease',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-terra)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: 'var(--color-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X style={{ width: '14px', height: '14px' }} />
              </button>
            )}
          </div>

          {/* Right: Sort By */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, marginLeft: 'auto' }}>
            <button
              onClick={() => setShowMap(m => !m)}
              aria-pressed={showMap}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
                border: '1px solid var(--color-border)', borderRadius: '8px', cursor: 'pointer',
                backgroundColor: showMap ? 'var(--color-brand)' : '#ffffff',
                color: showMap ? '#ffffff' : 'var(--color-text-primary)', fontSize: '14px',
              }}
            >
              {showMap ? <LayoutGrid style={{ width: '16px', height: '16px' }} /> : <MapIcon style={{ width: '16px', height: '16px' }} />}
              {showMap ? 'List' : 'Map'}
            </button>
            <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: '700', whiteSpace: 'nowrap' }}>Sort By</label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{
                padding: '10px 16px',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                fontSize: '14px',
                color: 'var(--color-text-primary)',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="rating">Highest Rated</option>
              <option value="price_low">Price: Low to High</option>
              <option value="price_high">Price: High to Low</option>
              <option value="reviews">Most Reviewed</option>
            </select>
          </div>
        </div>

        <div style={{ minWidth: 0 }}>

          {filtered.length > 0 && showMap ? (
            <PropertiesMap properties={filtered} />
          ) : filtered.length > 0 ? (
            <div className="responsive-card-grid">
              {filtered.map(property => (
                <PropertyCard key={property.id} property={property} />
              ))}
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '80px 24px',
              backgroundColor: '#ffffff',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                <Building2 style={{ width: '48px', height: '48px', color: 'var(--color-terra)', strokeWidth: 1.5 }} />
              </div>
              <h3 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '12px' }}>No properties found</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginBottom: '24px' }}>Try adjusting your filters to find your perfect stay</p>
              <button
                onClick={resetFilters}
                style={{
                  backgroundColor: 'var(--color-brand)',
                  color: 'var(--color-on-accent)',
                  border: 'none',
                  padding: '14px 32px',
                  fontSize: '13px',
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  fontWeight: '700',
                  cursor: 'pointer',
                  borderRadius: '8px',
                }}
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {filtersOpen && (
        <>
          <div
            onClick={() => setFiltersOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 40,
              animation: 'fadeIn 0.3s ease',
            }}
          />

          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              maxWidth: '480px',
              backgroundColor: '#ffffff',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-4px 0 16px rgba(0,0,0,0.15)',
              animation: 'slideIn 0.3s ease',
            }}
            className="md:max-w-[480px]"
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '24px',
              borderBottom: '1px solid var(--color-border)',
              flexShrink: 0,
            }}>
              <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-text-primary)' }}>Filters</h2>
              <button
                onClick={() => setFiltersOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '28px',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  padding: '0',
                  lineHeight: '1',
                }}
              >
                ×
              </button>
            </div>

            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '28px',
            }}>
              <div>
                <label style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block', marginBottom: '12px', fontWeight: '600' }}>Destination</label>
                <input
                  type="text"
                  placeholder="City or State..."
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: 'var(--color-text-primary)',
                    outline: 'none',
                    backgroundColor: '#ffffff',
                    boxSizing: 'border-box' as const,
                  }}
                />
              </div>

              <div style={{ height: '1px', backgroundColor: 'var(--color-border)' }} />

              <div>
                <label style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block', marginBottom: '12px', fontWeight: '600' }}>Price Per Night</label>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--color-text-primary)', fontWeight: '600' }}>{minPrice > 0 ? formatPrice(minPrice) : 'Any'}</span>
                  <span style={{ fontSize: '14px', color: 'var(--color-text-primary)', fontWeight: '600' }}>{formatPrice(maxPrice)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', minWidth: '24px' }}>Min</span>
                    <input type="range" min={0} max={PRICE_CAP} step={PRICE_STEP} value={minPrice}
                      onChange={e => { const v = Number(e.target.value); setMinPrice(Math.min(v, maxPrice - PRICE_STEP)) }}
                      style={{ flex: 1, accentColor: 'var(--color-terra)' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', minWidth: '24px' }}>Max</span>
                    <input type="range" min={0} max={PRICE_CAP} step={PRICE_STEP} value={maxPrice}
                      onChange={e => { const v = Number(e.target.value); setMaxPrice(Math.max(v, minPrice + PRICE_STEP)) }}
                      style={{ flex: 1, accentColor: 'var(--color-terra)' }} />
                  </div>
                </div>
              </div>

              <div style={{ height: '1px', backgroundColor: 'var(--color-border)' }} />

              <div>
                <label style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block', marginBottom: '12px', fontWeight: '600' }}>Minimum Bedrooms</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    onClick={() => setMinBedrooms(Math.max(1, minBedrooms - 1))}
                    style={{
                      padding: '10px 14px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      backgroundColor: '#ffffff',
                      color: 'var(--color-text-primary)',
                      fontSize: '18px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      transition: 'all 0.2s ease',
                      minWidth: '44px',
                      textAlign: 'center',
                    }}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={minBedrooms}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 1
                      if (val >= 1 && val <= 100) setMinBedrooms(val)
                    }}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: 'var(--color-text-primary)',
                      outline: 'none',
                      backgroundColor: '#ffffff',
                      boxSizing: 'border-box',
                      textAlign: 'center',
                      fontWeight: '600',
                    }}
                  />
                  <button
                    onClick={() => setMinBedrooms(Math.min(100, minBedrooms + 1))}
                    style={{
                      padding: '10px 14px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      backgroundColor: '#ffffff',
                      color: 'var(--color-text-primary)',
                      fontSize: '18px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      transition: 'all 0.2s ease',
                      minWidth: '44px',
                      textAlign: 'center',
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              <div style={{ height: '1px', backgroundColor: 'var(--color-border)' }} />

              <MarketplaceFilters value={mkt} onChange={setMkt} />

              <div style={{ height: '1px', backgroundColor: 'var(--color-border)' }} />

              <div>
                <label style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block', marginBottom: '12px', fontWeight: '600' }}>Room Type</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {roomTypeOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => setRoomType(option.value)}
                      style={{
                        padding: '10px 14px',
                        border: `1px solid ${roomType === option.value ? 'var(--color-terra)' : 'var(--color-border)'}`,
                        borderRadius: '8px',
                        backgroundColor: roomType === option.value ? 'var(--color-brand)' : 'transparent',
                        color: roomType === option.value ? 'var(--color-on-accent)' : 'var(--color-text-secondary)',
                        fontSize: '13px',
                        cursor: 'pointer',
                        fontWeight: roomType === option.value ? '700' : '400',
                        textAlign: 'left' as const,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ height: '1px', backgroundColor: 'var(--color-border)' }} />

              <div>
                <label style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block', marginBottom: '12px', fontWeight: '600' }}>Property Type</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {propertyTypeOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => setPropertyType(option.value)}
                      style={{
                        padding: '10px 14px',
                        border: `1px solid ${propertyType === option.value ? 'var(--color-terra)' : 'var(--color-border)'}`,
                        borderRadius: '8px',
                        backgroundColor: propertyType === option.value ? 'var(--color-brand)' : 'transparent',
                        color: propertyType === option.value ? 'var(--color-on-accent)' : 'var(--color-text-secondary)',
                        fontSize: '13px',
                        cursor: 'pointer',
                        fontWeight: propertyType === option.value ? '700' : '400',
                        textAlign: 'left' as const,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ height: '1px', backgroundColor: 'var(--color-border)' }} />

              <div>
                <label style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block', marginBottom: '12px', fontWeight: '600' }}>Bathroom Type</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {bathroomTypeOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => setBathroomType(option.value)}
                      style={{
                        padding: '10px 14px',
                        border: `1px solid ${bathroomType === option.value ? 'var(--color-terra)' : 'var(--color-border)'}`,
                        borderRadius: '8px',
                        backgroundColor: bathroomType === option.value ? 'var(--color-brand)' : 'transparent',
                        color: bathroomType === option.value ? 'var(--color-on-accent)' : 'var(--color-text-secondary)',
                        fontSize: '13px',
                        cursor: 'pointer',
                        fontWeight: bathroomType === option.value ? '700' : '400',
                        textAlign: 'left' as const,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ height: '1px', backgroundColor: 'var(--color-border)' }} />

              <div>
                <label style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block', marginBottom: '12px', fontWeight: '600' }}>Pet Friendly</label>
                <button
                  onClick={() => setPetsOnly(!petsOnly)}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <div style={{ width: '44px', height: '24px', backgroundColor: petsOnly ? 'var(--color-brand)' : 'var(--color-border)', borderRadius: '12px', position: 'relative', transition: 'background-color 0.3s ease' }}>
                    <div style={{ position: 'absolute', top: '3px', left: petsOnly ? '23px' : '3px', width: '18px', height: '18px', backgroundColor: '#ffffff', borderRadius: '50%', transition: 'left 0.3s ease' }} />
                  </div>
                  <span style={{ fontSize: '14px', color: 'var(--color-text-primary)', fontWeight: '500' }}>Pets Allowed</span>
                </button>
              </div>
            </div>

            <div style={{
              padding: '24px',
              borderTop: '1px solid var(--color-border)',
              display: 'flex',
              gap: '12px',
              flexShrink: 0,
            }}>
              <button
                onClick={resetFilters}
                style={{
                  flex: 1,
                  padding: '14px 20px',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  backgroundColor: '#ffffff',
                  color: 'var(--color-text-primary)',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                Reset
              </button>
              <button
                onClick={() => setFiltersOpen(false)}
                style={{
                  flex: 1,
                  padding: '14px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  backgroundColor: 'var(--color-brand)',
                  color: 'var(--color-on-accent)',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'opacity 0.2s ease',
                }}
              >
                Show Results
              </button>
            </div>

            <style>{`\n              @keyframes slideIn {\n                from {\n                  transform: translateX(100%);\n                }\n                to {\n                  transform: translateX(0);\n                }\n              }\n              @keyframes fadeIn {\n                from {\n                  opacity: 0;\n                }\n                to {\n                  opacity: 1;\n                }\n              }\n            `}</style>
          </div>
        </>
      )}
    </div>
  )
}

