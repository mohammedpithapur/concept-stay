"use client"
import React, { useState, useEffect } from 'react'
import { Mail, MessageCircle, MapPin as MapPinIcon } from 'lucide-react'
import Copy from '@/lib/copy'

export default function Footer() {
  const [year, setYear] = useState(2024)

  useEffect(() => {
    setYear(new Date().getFullYear())
  }, [])

  return (
    <footer style={{ backgroundColor: 'var(--color-deep)', backgroundImage: 'var(--clay-texture-dark)', color: 'var(--color-navbar-text)' }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '56px 24px 40px',
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 1fr) minmax(180px, 0.8fr) minmax(220px, 1fr)',
        gap: '24px',
        alignItems: 'start',
      }}>

        {/* Brand column */}
        <div>
          <h2 style={{ color: 'var(--color-navbar-text)', fontSize: '22px', letterSpacing: '3px', marginBottom: '16px', fontWeight: '800' }}>
            CONCEPT STAY
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: '18px', lineHeight: '1.8', marginBottom: '28px' }}>
            {Copy.footerDescription}
          </p>

          {/* Social icons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            {[
              { label: 'Instagram', href: 'https://www.instagram.com/conceptstay.in', icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                  <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
                </svg>
              )},
              { label: 'WhatsApp', href: 'https://wa.me/919874827631', icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
              )},
              { label: 'LinkedIn', href: 'https://www.linkedin.com/company/concept-stay', icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
                  <rect width="4" height="12" x="2" y="9"/>
                  <circle cx="4" cy="4" r="2"/>
                </svg>
              )},
            ].map(social => (
              <a
                key={social.label}
                href={social.href}
                title={social.label}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  width: '40px',
                  height: '40px',
                  border: '1px solid var(--color-navbar-border)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgba(255,255,255,0.82)',
                  textDecoration: 'none',
                  transition: 'border-color 0.3s ease',
                }}
                onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  e.currentTarget.style.borderColor = 'var(--color-navbar-text)'
                }}
                onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  e.currentTarget.style.borderColor = 'var(--color-navbar-border)'
                }}
              >
                {social.icon}
              </a>
            ))}
          </div>
        </div>

        {/* Quick Links column */}
        <div>
          <h4 style={{ color: 'var(--color-navbar-text)', fontSize: '12px', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '24px', fontWeight: '700' }}>
            Quick Links
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { label: 'Our Properties', href: '/properties' },
              { label: 'Articles & Journal', href: '/articles' },
              { label: 'About Us', href: '/about' },
              { label: 'Contact Us', href: '/contact' },
            ].map(link => (
              <a
                key={link.href}
                href={link.href}
                style={{
                  color: 'rgba(255,255,255,0.82)',
                  fontSize: '13px',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'color 0.2s ease',
                }}
                onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = 'var(--color-navbar-text)' }}
                onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = 'rgba(255,255,255,0.82)' }}
              >
                <span style={{ color: 'var(--color-navbar-text)', fontSize: '9px' }}>→</span>
                {link.label}
              </a>
            ))}
          </div>
        </div>

        {/* Contact + Policies column */}
        <div>
          <h4 style={{ color: 'var(--color-navbar-text)', fontSize: '12px', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '24px', fontWeight: '700' }}>
            Contact Us
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
            {[
              { icon: <Mail size={14} />, text: 'staysearthy@gmail.com', href: 'mailto:staysearthy@gmail.com' },
              { icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
              ), text: '+91 98748 27631', href: 'https://wa.me/919874827631' },
              { icon: <MapPinIcon size={14} />, text: 'Kolkata, India', href: '#' },
            ].map(item => (
              <a key={item.text} href={item.href} target={item.href.startsWith('http') ? '_blank' : '_self'} rel="noopener noreferrer" style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', textDecoration: 'none' }}>
                <span style={{ color: 'var(--color-gold)', flexShrink: 0, marginTop: '2px' }}>{item.icon}</span>
                <span style={{ color: 'rgba(255,255,255,0.82)', fontSize: '13px', lineHeight: '1.4' }}>{item.text}</span>
              </a>
            ))}
          </div>

          <h4 style={{ color: 'var(--color-navbar-text)', fontSize: '12px', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '16px', fontWeight: '700' }}>
            Policies
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { label: 'Privacy Policy', href: '/privacy' },
              { label: 'Terms & Conditions', href: '/terms' },
              { label: 'FAQ', href: '/faq' },
              { label: 'Cancellation Policy', href: '/cancellation' },
            ].map(link => (
              <a
                key={link.href}
                href={link.href}
                style={{ color: 'rgba(255,255,255,0.82)', fontSize: '13px', textDecoration: 'none', transition: 'color 0.2s ease' }}
                onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = 'var(--color-navbar-text)' }}
                onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = 'rgba(255,255,255,0.82)' }}
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--color-navbar-border)' }} />

      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>
          &copy; {year} Concept Stay. All rights reserved.
        </p>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>
          Payments secured by <span style={{ color: 'var(--color-navbar-text)' }}>Razorpay</span>
        </p>
      </div>
    </footer>
  )
}