'use client'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createEventRequest } from '@/lib/api'
import { CheckCircle2 } from 'lucide-react'

export default function EventsPageClient() {
  const searchParams = useSearchParams()
  const eventType = searchParams.get('type') || ''

  const [form, setForm] = useState({
    destination: '',
    hotel: '',
    natureOfEvent: eventType || '',
    eventStartDate: '',
    eventEndDate: '',
    noOfGuests: '',
    noOfRooms: '',
    additionalDetails: '',
    name: '',
    phone: '',
    email: '',
    requiresRooms: false,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!form.destination.trim()) newErrors.destination = 'Destination is required'
    if (!form.hotel.trim()) newErrors.hotel = 'Property selection is required'
    if (!form.natureOfEvent.trim()) newErrors.natureOfEvent = 'Nature of event is required'
    if (!form.eventStartDate) newErrors.eventStartDate = 'Event start date is required'
    if (!form.eventEndDate) newErrors.eventEndDate = 'Event end date is required'
    if (!form.noOfGuests) newErrors.noOfGuests = 'Number of guests is required'
    if (form.requiresRooms && !form.noOfRooms) newErrors.noOfRooms = 'Number of rooms is required'
    if (!form.name.trim()) newErrors.name = 'Name is required'
    if (!form.phone.trim()) newErrors.phone = 'Phone number is required'
    if (!form.email.trim()) newErrors.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) newErrors.email = 'Enter a valid email'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setLoading(true)
    setErrors({})
    try {
      await createEventRequest({
        destination: form.destination,
        hotel: form.hotel,
        nature_of_event: form.natureOfEvent,
        event_start_date: form.eventStartDate,
        event_end_date: form.eventEndDate,
        no_of_guests: parseInt(form.noOfGuests, 10) || 0,
        requires_rooms: form.requiresRooms,
        no_of_rooms: form.requiresRooms ? (parseInt(form.noOfRooms, 10) || 0) : null,
        additional_details: form.additionalDetails || null,
        name: form.name,
        phone: form.phone,
        email: form.email,
      })
      setSubmitted(true)
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : 'Something went wrong' })
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = (field: string) => ({
    width: '100%',
    padding: '14px 16px',
    border: `1px solid ${errors[field] ? '#E53E3E' : 'var(--color-border)'}`,
    borderRadius: '8px',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    outline: 'none',
    backgroundColor: '#ffffff',
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
  })

  const labelStyle = {
    fontSize: '11px',
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
    color: 'var(--color-text-muted)',
    display: 'block',
    marginBottom: '8px',
    fontWeight: '600' as const,
  }

  return (
    <div style={{ backgroundColor: '#ffffff', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ backgroundColor: 'var(--color-deep)', padding: '64px 24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-navbar-text)', fontSize: '12px', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '12px', fontWeight: '600' }}>
          EVENT BOOKING
        </p>
        <h1 style={{ color: 'var(--color-navbar-text)', fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: '800', marginBottom: '8px' }}>
          Plan Your Event
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: '15px' }}>
          Complete the form below to book your perfect event venue
        </p>
      </div>

      {/* Form Container */}
      {!submitted ? (
        <div style={{ padding: 'clamp(48px, 6vw, 72px) 24px', maxWidth: '900px', margin: '0 auto' }}>
          {/* Destination and Property Selection */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
            <div>
              <label style={labelStyle}>DESTINATION</label>
              <select
                value={form.destination}
                onChange={e => setForm({ ...form, destination: e.target.value })}
                style={inputStyle('destination')}
              >
                <option value="">Select City</option>
                <option value="jaipur">Jaipur</option>
                <option value="kolkata">Kolkata</option>
                <option value="delhi">Delhi</option>
                <option value="mumbai">Mumbai</option>
              </select>
              {errors.destination && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.destination}</p>}
            </div>

            <div>
              <label style={labelStyle}>PROPERTY</label>
              <select
                value={form.hotel}
                onChange={e => setForm({ ...form, hotel: e.target.value })}
                style={inputStyle('hotel')}
              >
                <option value="">Select Property</option>
                <option value="heritage">Heritage Resort</option>
                <option value="earthy">Earthy Palace</option>
                <option value="modern">Modern Retreat</option>
              </select>
              {errors.hotel && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.hotel}</p>}
            </div>
          </div>

          {/* Nature of Event and Other Details */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
            <div>
              <label style={labelStyle}>NATURE OF EVENT</label>
              <select
                value={form.natureOfEvent}
                onChange={e => setForm({ ...form, natureOfEvent: e.target.value })}
                style={inputStyle('natureOfEvent')}
              >
                <option value="">Select Event Type</option>
                <option value="Wedding">Wedding</option>
                <option value="Corporate">Corporate</option>
                <option value="Birthday">Birthday</option>
                <option value="Anniversary">Anniversary</option>
                <option value="Conference">Conference</option>
              </select>
              {errors.natureOfEvent && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.natureOfEvent}</p>}
            </div>

            <div>
              <label style={labelStyle}>NO OF GUESTS</label>
              <input
                type="number"
                placeholder="Enter number of guests"
                value={form.noOfGuests}
                onChange={e => setForm({ ...form, noOfGuests: e.target.value })}
                style={inputStyle('noOfGuests')}
              />
              {errors.noOfGuests && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.noOfGuests}</p>}
            </div>
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
            <div>
              <label style={labelStyle}>EVENT START DATE</label>
              <input
                type="date"
                value={form.eventStartDate}
                onChange={e => setForm({ ...form, eventStartDate: e.target.value })}
                style={inputStyle('eventStartDate')}
              />
              {errors.eventStartDate && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.eventStartDate}</p>}
            </div>

            <div>
              <label style={labelStyle}>EVENT END DATE</label>
              <input
                type="date"
                value={form.eventEndDate}
                onChange={e => setForm({ ...form, eventEndDate: e.target.value })}
                style={inputStyle('eventEndDate')}
              />
              {errors.eventEndDate && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.eventEndDate}</p>}
            </div>
          </div>

          {/* Rooms Section */}
          <div style={{ marginBottom: '32px', padding: '20px', backgroundColor: '#f9f7f5', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <input
                type="checkbox"
                id="requiresRooms"
                checked={form.requiresRooms}
                onChange={e => setForm({ ...form, requiresRooms: e.target.checked })}
                style={{ cursor: 'pointer', width: '18px', height: '18px' }}
              />
              <label htmlFor="requiresRooms" style={{ cursor: 'pointer', fontWeight: '600', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                DOES YOUR EVENT REQUIRE ROOMS?
              </label>
            </div>

            {form.requiresRooms && (
              <div>
                <label style={labelStyle}>NUMBER OF ROOMS</label>
                <input
                  type="number"
                  placeholder="0"
                  value={form.noOfRooms}
                  onChange={e => setForm({ ...form, noOfRooms: e.target.value })}
                  style={inputStyle('noOfRooms')}
                />
                {errors.noOfRooms && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.noOfRooms}</p>}
              </div>
            )}
          </div>

          {/* Additional Details */}
          <div style={{ marginBottom: '32px' }}>
            <label style={labelStyle}>PLEASE SHARE ADDITIONAL DETAILS</label>
            <textarea
              placeholder="Please share additional details"
              value={form.additionalDetails}
              onChange={e => setForm({ ...form, additionalDetails: e.target.value })}
              style={{
                ...inputStyle('additionalDetails'),
                minHeight: '120px',
                resize: 'vertical',
                padding: '14px 16px',
              }}
            />
          </div>

          {/* Contact Information */}
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Contact Information
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
              <div>
                <label style={labelStyle}>NAME</label>
                <input
                  type="text"
                  placeholder="Enter Name"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  style={inputStyle('name')}
                />
                {errors.name && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.name}</p>}
              </div>

              <div>
                <label style={labelStyle}>PHONE NUMBER</label>
                <input
                  type="tel"
                  placeholder="Enter Phone Number"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  style={inputStyle('phone')}
                />
                {errors.phone && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.phone}</p>}
              </div>

              <div>
                <label style={labelStyle}>EMAIL</label>
                <input
                  type="email"
                  placeholder="Enter Email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  style={inputStyle('email')}
                />
                {errors.email && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.email}</p>}
              </div>
            </div>
          </div>

          {/* Consent and Submit */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '24px' }}>
              <input
                type="checkbox"
                id="consent"
                style={{ marginTop: '4px', cursor: 'pointer', width: '18px', height: '18px', minWidth: '18px' }}
              />
              <label htmlFor="consent" style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--color-text-primary)', lineHeight: '1.6' }}>
                By submitting this request, I acknowledge and accept the website&apos;s <span style={{ color: 'var(--color-terra)', textDecoration: 'underline', cursor: 'pointer' }}>Privacy Policy</span> and <span style={{ color: 'var(--color-terra)', textDecoration: 'underline', cursor: 'pointer' }}>T&C</span>, and consent to my information being used for product and promotional offers.
              </label>
            </div>
            {errors.submit && <p style={{ color: '#E53E3E', fontSize: '14px', marginBottom: '16px', fontWeight: '600' }}>{errors.submit}</p>}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  backgroundColor: loading ? '#a23a1f99' : 'var(--color-deep)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '14px 32px',
                  fontSize: '13px',
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  fontWeight: '700',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  borderRadius: '8px',
                  transition: 'background-color 0.3s ease',
                }}
              >
                {loading ? 'Submitting...' : 'Submit Request'}
              </button>

              <button
                onClick={() => window.location.href = '/properties'}
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--color-deep)',
                  border: '2px solid var(--color-deep)',
                  padding: '12px 32px',
                  fontSize: '13px',
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  fontWeight: '700',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  transition: 'all 0.3s ease',
                }}
              >
                Our Properties
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Success Message */
        <div style={{ padding: 'clamp(48px, 6vw, 120px) 24px', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <CheckCircle2 size={64} style={{ color: 'var(--color-terra)' }} />
          </div>
          <h2 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '12px' }}>
            Request Submitted!
          </h2>
          <p style={{ fontSize: '16px', color: 'var(--color-text-muted)', marginBottom: '32px', lineHeight: '1.7' }}>
            Thank you for your event booking request. Our team will review your details and contact you shortly to confirm your event and answer any questions.
          </p>
          <button
            onClick={() => window.location.href = '/'}
            style={{
              backgroundColor: 'var(--color-deep)',
              color: '#ffffff',
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
            Back to Home
          </button>
        </div>
      )}
    </div>
  )
}
