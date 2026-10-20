"use client"
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin } from 'lucide-react'
import Copy from '@/lib/copy'
import { buildApiUrl } from '@/lib/api'

export default function Hero() {
  const router = useRouter()
  const [location, setLocation] = useState('')
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [guests, setGuests] = useState('1')
  const [pets, setPets] = useState('0')

  const [todayValue, setTodayValue] = useState('')
  const [availableLocations, setAvailableLocations] = useState<Array<{ city: string; state: string }>>([])
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    setTodayValue(`${year}-${month}-${day}`)
  }, [])

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const res = await fetch(buildApiUrl('/properties/locations'))
        if (res.ok) {
          const data = await res.json()
          setAvailableLocations(data.locations || [])
        }
      } catch (e) {
        console.error('Failed to fetch destinations', e)
      }
    }
    fetchLocations()
  }, [])

  const handleSearch = () => {
    const params = new URLSearchParams()
    if (location) params.set('location', location)
    if (checkIn) params.set('checkIn', checkIn)
    if (checkOut) params.set('checkOut', checkOut)
    if (guests) params.set('guests', guests)
    if (pets && pets !== '0') params.set('pets', pets)
    router.push(`/properties?${params.toString()}`)
  }

  const fieldStyle = {
    minWidth: 0,
    padding: '12px 16px',
    borderRight: 'none',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    position: 'relative' as const,
  }

  const labelStyle = {
    fontSize: '10px',
    letterSpacing: '1.5px',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase' as const,
    fontWeight: '600' as const,
  }

  const inputStyle = {
    border: 'none',
    outline: 'none',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    backgroundColor: 'transparent',
    width: '100%',
    fontFamily: "'Figtree', sans-serif",
  }

  const filteredLocations = availableLocations.filter(loc =>
    loc.city.toLowerCase().includes(location.toLowerCase()) ||
    loc.state.toLowerCase().includes(location.toLowerCase())
  )

  return (
    <section style={{ position: 'relative', minHeight: 'min(75vh, 800px)', overflow: 'hidden' }}>
      <style>{`
        .hero-search-container {
          grid-template-columns: repeat(2, 1fr) !important;
        }
        
        .hero-search-field {
          background-color: #ffffff !important;
          border: 1px solid var(--color-border) !important;
          border-radius: 8px !important;
          transition: all 0.2s ease !important;
        }
        .hero-search-field:focus-within {
          border-color: var(--color-beige) !important;
          box-shadow: 0 0 0 3px rgba(183, 137, 95, 0.12) !important;
        }
        
        @media (max-width: 768px) {
          .hero-destination {
            grid-column: 1 / -1 !important;
          }
          .hero-checkin {
            grid-column: 1 !important;
          }
          .hero-checkout {
            grid-column: 2 !important;
          }
          .hero-guests {
            grid-column: 1 !important;
          }
          .hero-pets {
            grid-column: 2 !important;
          }
          .hero-search-btn {
            grid-column: 1 / -1 !important;
          }
        }
        
        @media (min-width: 769px) {
          .hero-search-container {
            grid-template-columns: repeat(6, 1fr) !important;
          }
          .hero-search-field {
            border: none !important;
            border-radius: 0 !important;
            border-right: 1px solid var(--color-border) !important;
            background-color: transparent !important;
            box-shadow: none !important;
          }
          .hero-pets {
            border-right: none !important;
          }
          .hero-search-field:focus-within {
            box-shadow: none !important;
          }
          .hero-destination,
          .hero-checkin,
          .hero-checkout,
          .hero-guests,
          .hero-pets {
            grid-column: span 1 !important;
          }
          .hero-search-btn {
            grid-column: span 1 !important;
          }
        }
      `}</style>

      {/* Background Image */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'url(/clay/hero-dome.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }} />

      {/* Overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0.65) 100%)'
      }} />

      {/* Content */}
      <div style={{
        position: 'relative', zIndex: 10,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
        textAlign: 'center',
      }}>

        <p style={{
          color: 'var(--color-gold)',
          fontSize: '14px',
          letterSpacing: '3px',
          textTransform: 'uppercase',
          marginTop: '18px',
          marginBottom: '24px',
          fontWeight: '600',
        }}>
          {Copy.curatedLabel}
        </p>

        <h1 style={{
          color: '#ffffff',
          fontSize: 'clamp(32px, 5vw, 72px)',
          fontWeight: '800',
          lineHeight: '1.1',
          marginBottom: '16px',
          maxWidth: '900px',
        }}>
          Discover Your Perfect{' '}
          <em style={{ color: 'var(--color-gold)', fontStyle: 'italic' }}>Earthy Escape</em>
        </h1>

        <p style={{
          color: 'rgba(255,255,255,0.85)',
          fontSize: '18px',
          marginBottom: '32px',
          maxWidth: '550px',
          lineHeight: '1.6',
          fontWeight: '400',
        }}>
          {Copy.heroDescription}
        </p>

        {/* Mobile Search Hint */}
        <p className="lg:hidden" style={{
          color: 'var(--color-gold)',
          fontSize: '11px',
          letterSpacing: '1px',
          textTransform: 'uppercase',
          marginBottom: '16px',
          fontWeight: '600',
        }}>
          Scroll down to search properties
        </p>

        {/* Search Bar - Responsive */}
        <div style={{
          width: '100%',
          maxWidth: '1000px',
          display: 'flex',
          justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: 'rgba(255,255,255,0.98)',
            borderRadius: '12px',
            padding: '8px',
            gap: '8px',
            width: 'min(100%, 920px)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
            display: 'grid',
          }}
          className="hero-search-container">

          <div style={{ ...fieldStyle, position: 'relative' }} className="hero-destination hero-search-field">
            <label style={labelStyle}>Destination</label>
            <input
              type="text"
              placeholder="Where are you going?"
              value={location}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setShowDropdown(false)}
              onChange={e => {
                setLocation(e.target.value)
                setShowDropdown(true)
              }}
              className="hero-search-input"
              style={inputStyle}
            />
            {/* Floating Autocomplete Dropdown */}
            {showDropdown && filteredLocations.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                width: '100%',
                backgroundColor: '#ffffff',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                marginTop: '6px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
                zIndex: 100,
                maxHeight: '200px',
                overflowY: 'auto'
              }}>
                {filteredLocations.map((loc, index) => (
                  <div
                    key={index}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setLocation(loc.city)
                      setShowDropdown(false)
                    }}
                    style={{
                      padding: '12px 16px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: 'var(--color-text-primary)',
                      borderBottom: '1px solid var(--color-bg-soft)',
                      transition: 'background-color 0.2s',
                      textAlign: 'left'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-bg-soft)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <MapPin size={14} style={{ display: 'inline', marginRight: '6px', color: 'var(--color-gold)', verticalAlign: '-1px' }} /><strong>{loc.city}</strong>, {loc.state}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={fieldStyle} className="hero-checkin hero-search-field cursor-pointer">
            <label style={labelStyle}>Check In</label>
            <span style={{ fontSize: '14px', color: checkIn ? 'var(--color-text-primary)' : '#8c8c8c', whiteSpace: 'nowrap' }}>
              {checkIn ? new Date(checkIn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Select Date'}
            </span>
            <input
              type="date"
              value={checkIn}
              min={todayValue || undefined}
              onChange={e => {
                const nextValue = e.target.value
                setCheckIn(nextValue)
                if (checkOut && nextValue && checkOut < nextValue) {
                  setCheckOut('')
                }
              }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                cursor: 'pointer',
                zIndex: 2,
              }}
              onClick={e => {
                try { e.currentTarget.showPicker() } catch {}
              }}
            />
          </div>

          <div style={fieldStyle} className="hero-checkout hero-search-field cursor-pointer">
            <label style={labelStyle}>Check Out</label>
            <span style={{ fontSize: '14px', color: checkOut ? 'var(--color-text-primary)' : '#8c8c8c', whiteSpace: 'nowrap' }}>
              {checkOut ? new Date(checkOut).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Select Date'}
            </span>
            <input
              type="date"
              value={checkOut}
              min={checkIn || todayValue || undefined}
              onChange={e => setCheckOut(e.target.value)}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                cursor: 'pointer',
                zIndex: 2,
              }}
              onClick={e => {
                try { e.currentTarget.showPicker() } catch {}
              }}
            />
          </div>

          <div style={fieldStyle} className="hero-guests hero-search-field">
            <label style={labelStyle}>Guests</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
              <button onClick={() => setGuests(Math.max(1, Number(guests) - 1).toString())} style={{ border: '1px solid var(--color-border)', backgroundColor: '#ffffff', width: '32px', height: '32px', fontSize: '16px', cursor: 'pointer', borderRadius: '4px', fontWeight: '700' }}>−</button>
              <span style={{ minWidth: '40px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)' }}>{guests}</span>
              <button onClick={() => setGuests(Math.min(10, Number(guests) + 1).toString())} style={{ border: '1px solid var(--color-border)', backgroundColor: '#ffffff', width: '32px', height: '32px', fontSize: '16px', cursor: 'pointer', borderRadius: '4px', fontWeight: '700' }}>+</button>
            </div>
          </div>

          <div style={fieldStyle} className="hero-pets hero-search-field">
            <label style={labelStyle}>Pets</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
              <button onClick={() => setPets(Math.max(0, Number(pets) - 1).toString())} style={{ border: '1px solid var(--color-border)', backgroundColor: '#ffffff', width: '32px', height: '32px', fontSize: '16px', cursor: 'pointer', borderRadius: '4px', fontWeight: '700' }}>−</button>
              <span style={{ minWidth: '40px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)' }}>{pets}</span>
              <button onClick={() => setPets(Math.min(4, Number(pets) + 1).toString())} style={{ border: '1px solid var(--color-border)', backgroundColor: '#ffffff', width: '32px', height: '32px', fontSize: '16px', cursor: 'pointer', borderRadius: '4px', fontWeight: '700' }}>+</button>
            </div>
          </div>

          <button
            onClick={handleSearch}
            style={{
              backgroundColor: 'var(--color-gold)',
              color: 'var(--color-text-primary)',
              border: 'none',
              padding: '14px 24px',
              fontSize: '12px',
              letterSpacing: '1.2px',
              fontWeight: '700',
              textTransform: 'uppercase',
              cursor: 'pointer',
              borderRadius: '8px',
              whiteSpace: 'nowrap',
              margin: '4px',
              transition: 'all 0.2s ease',
              minHeight: '50px',
              gridColumn: 'span 1',
            }}
            className="hero-search-btn"
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.opacity = '0.9'
              el.style.transform = 'scale(1.03)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.opacity = '1'
              el.style.transform = 'scale(1)'
            }}
          >
            Search
          </button>
          </div>
        </div>
        {/* Stats: top row with two stats, avg rating on its own row below */}
        <div className="hero-stats" style={{ marginTop: '28px', paddingBottom: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px' }}>
          <div style={{ display: 'flex', gap: '56px', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--color-gold)', fontSize: '28px', fontWeight: '700' }}>5+</div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', marginTop: '6px', whiteSpace: 'nowrap' }}>Properties</div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--color-gold)', fontSize: '28px', fontWeight: '700' }}>30+</div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', marginTop: '6px', whiteSpace: 'nowrap' }}>Rooms</div>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '6px' }}>
            <div style={{ color: 'var(--color-gold)', fontSize: '28px', fontWeight: '700' }}>4.9</div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', marginTop: '6px', whiteSpace: 'nowrap' }}>Average Rating</div>
          </div>
        </div>
      </div>
    </section>
  )
}