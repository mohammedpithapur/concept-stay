'use client'
import { useState } from 'react'
import { Mail, MapPin } from 'lucide-react'
import MapWrapper from '@/components/shared/MapWrapper'
import { buildApiUrl } from '@/lib/api'

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!form.name.trim()) newErrors.name = 'Name is required'
    if (!form.email.trim()) newErrors.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) newErrors.email = 'Enter a valid email'
    if (!form.subject.trim()) newErrors.subject = 'Subject is required'
    if (!form.message.trim()) newErrors.message = 'Message is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setLoading(true)
    try {
      const res = await fetch(buildApiUrl('/contact'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          subject: form.subject,
          message: form.message,
        })
      })
      if (res.ok || res.status === 201) {
        setSubmitted(true)
      } else {
        alert('Failed to send message. Please email us directly at staysearthy@gmail.com')
      }
    } catch {
      alert('Network error. Please email us directly at staysearthy@gmail.com')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = (field: string) => ({
    width: '100%', padding: '14px 16px',
    border: `1px solid ${errors[field] ? '#E53E3E' : 'var(--color-border)'}`,
    borderRadius: '8px', fontSize: '14px', color: 'var(--color-text-primary)',
    outline: 'none', backgroundColor: '#ffffff',
    boxSizing: 'border-box' as const, fontFamily: 'inherit'
  })

  const labelStyle = {
    fontSize: '11px', letterSpacing: '2px',
    textTransform: 'uppercase' as const, color: 'var(--color-text-muted)',
    display: 'block', marginBottom: '8px', fontWeight: '600' as const
  }

  return (
    <div style={{ backgroundColor: '#ffffff', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ backgroundColor: 'var(--color-bg-soft)', padding: 'clamp(48px, 8vw, 80px) 24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-terra)', fontSize: '12px', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '12px', fontWeight: '600' }}>
          Get In Touch
        </p>
        <h1 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '16px' }}>
          Contact Us
        </h1>
        <div style={{ width: '60px', height: '2px', backgroundColor: 'var(--color-terra)', margin: '0 auto 16px' }} />
        <p style={{ fontSize: '15px', color: 'var(--color-text-secondary)', maxWidth: '480px', margin: '0 auto', lineHeight: '1.7' }}>
          Have a question about a property or your booking? We&apos;re here to help.
        </p>
      </div>

      {/* Contact Info Cards */}
      <section style={{ padding: 'clamp(48px, 6vw, 72px) 24px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '64px' }}>
          {[
            { 
              icon: <Mail size={24} color="var(--color-terra)" />,
              title: 'Email Us', 
              detail: 'staysearthy@gmail.com', 
              sub: 'We reply within 24 hours', 
              href: 'mailto:staysearthy@gmail.com' 
            },
            { 
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--color-terra)">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
              ),
              title: 'WhatsApp', 
              detail: '+91 98748 27631', 
              sub: 'Quick responses on WhatsApp', 
              href: 'https://wa.me/919874827631' 
            },
            { 
              icon: <MapPin size={24} color="var(--color-terra)" />,
              title: 'Location', 
              detail: 'Kolkata, India', 
              sub: 'Based in Kolkata', 
              href: '#map' 
            },
          ].map((item, i) => (
            <a key={i} href={item.href} style={{ textDecoration: 'none' }}>
              <div style={{
                backgroundColor: '#ffffff', border: '1px solid var(--color-border)',
                borderRadius: '12px', padding: '24px 20px',
                transition: 'box-shadow 0.2s ease, transform 0.2s ease',
                cursor: 'pointer'
              }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'
                  el.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.boxShadow = 'none'
                  el.style.transform = 'translateY(0)'
                }}
              >
                <span style={{ display: 'block', marginBottom: '12px' }}>{item.icon}</span>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '6px' }}>{item.title}</h3>
                <p style={{ fontSize: '14px', color: 'var(--color-terra)', fontWeight: '600', marginBottom: '4px' }}>{item.detail}</p>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{item.sub}</p>
              </div>
            </a>
          ))}
        </div>

        {/* Form + Map Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '40px' }}>

          {/* Contact Form */}
          <div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              Send a Message
            </h2>
            <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--color-terra)', marginBottom: '28px' }} />

            {!submitted ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                  <div>
                    <label style={labelStyle}>Full Name</label>
                    <input type="text" placeholder="Your name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle('name')} />
                    {errors.name && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.name}</p>}
                  </div>
                  <div>
                    <label style={labelStyle}>Phone (Optional)</label>
                    <input type="tel" placeholder="+91 9874827631" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inputStyle('phone')} />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Email Address</label>
                  <input type="email" placeholder="you@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inputStyle('email')} />
                  {errors.email && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.email}</p>}
                </div>

                <div>
                  <label style={labelStyle}>Subject</label>
                  <select
                    value={form.subject}
                    onChange={e => setForm({ ...form, subject: e.target.value })}
                    style={{ ...inputStyle('subject'), cursor: 'pointer' }}
                  >
                    <option value="">Select a subject...</option>
                    <option value="booking">Booking Question</option>
                    <option value="property">Property Enquiry</option>
                    <option value="cancellation">Cancellation Request</option>
                    <option value="complaint">Complaint</option>
                    <option value="partnership">Partnership / List My Property</option>
                    <option value="other">Other</option>
                  </select>
                  {errors.subject && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.subject}</p>}
                </div>

                <div>
                  <label style={labelStyle}>Message</label>
                  <textarea
                    placeholder="Tell us how we can help..."
                    value={form.message}
                    onChange={e => setForm({ ...form, message: e.target.value })}
                    rows={5}
                    style={{ ...inputStyle('message'), resize: 'vertical' }}
                  />
                  {errors.message && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.message}</p>}
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  style={{
                    backgroundColor: loading ? 'var(--color-terra)' : 'var(--color-terra)',
                    color: '#f6eddc', border: 'none', padding: '16px 32px',
                    fontSize: '13px', letterSpacing: '2px', fontWeight: '700',
                    textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer',
                    borderRadius: '8px', width: '100%'
                  }}
                >
                  {loading ? 'Sending...' : 'Send Message'}
                </button>
              </div>
            ) : (
              <div style={{ backgroundColor: 'var(--color-bg-soft)', borderRadius: '12px', padding: '40px 32px', textAlign: 'center' }}>
                <div style={{
                  width: '64px', height: '64px', backgroundColor: 'var(--color-terra)',
                  borderRadius: '50%', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', margin: '0 auto 20px',
                  fontSize: '28px', fontWeight: '700', color: '#f6eddc'
                }}>
                  &#10003;
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '12px' }}>Message Sent!</h3>
                <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.7' }}>
                  Thank you for reaching out, <strong>{form.name}</strong>. We&apos;ll get back to you at <strong>{form.email}</strong> within 24 hours.
                </p>
              </div>
            )}
          </div>

          {/* Map */}
          <div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              Our Reach
            </h2>
            <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--color-terra)', marginBottom: '28px' }} />
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '20px', lineHeight: '1.7' }}>
              We operate across Kolkata with handpicked properties in the city — with more properties added regularly.
            </p>
            <div id="map" style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
              <MapWrapper
                latitude={22.5726}
                longitude={88.3639}
                propertyName="Concept Stay — Kolkata"
                address="Serving earthy properties across Kolkata"
              />
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}
