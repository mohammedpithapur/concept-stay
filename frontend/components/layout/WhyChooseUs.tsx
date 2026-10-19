/* eslint-disable @next/next/no-img-element */
"use client"

import { useState } from 'react'
import Link from 'next/link'
import Copy from '@/lib/copy'

export default function WhyChooseUs() {
  const [hoveredTags, setHoveredTags] = useState<Record<string, boolean>>({})

  const reasons = [
    {
      image: '/prop-bedroom-blockprint.jpg',
      alt: 'Earthy bedroom with block-print textiles',
      title: 'Handpicked Properties',
      description: Copy.whyDescription
    },
    {
      image: '/prop-staircase-gallery.jpg',
      alt: 'Staircase with gallery wall and plants',
      title: 'Instant Booking',
      description: "Book your stay in minutes with our seamless booking system. Real-time availability so you always know what's free."
    },
    {
      image: '/prop-heritage-corridor.jpg',
      alt: 'Heritage corridor with ornate metal railing',
      title: 'Best Price Guarantee',
      description: 'Book directly with us and get the best possible rate. No hidden fees — what you see is exactly what you pay.'
    },
    {
      image: '/prop-room-bedroom.jpg',
      alt: 'Spacious heritage bedroom with wooden ceiling fan',
      title: 'Secure Payments',
      description: 'All payments are processed securely through Razorpay. Your financial information is always protected.'
    },
    {
      image: '/prop-swing-nook.jpg',
      alt: 'Cosy hanging swing chair in arched nook',
      title: 'Pet Friendly Options',
      description: 'Travelling with your furry friends? We have a curated selection of pet-friendly properties just for you.'
    },
    {
      image: '/prop-entrance-sign.jpg',
      alt: 'ConceptStay entrance door with wooden sign',
      title: '24/7 Support',
      description: "Our team is always available to assist you before, during, and after your stay. We've got you covered."
    },
  ]

  return (
    <section className="section-shell" style={{ backgroundColor: 'var(--color-navbar)' }}>
      <div className="content-shell">

        {/* Section Header */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p style={{
            color: 'var(--color-navbar-text)',
            fontSize: '11px',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            marginBottom: '12px',
            fontWeight: '600',
          }}>
            The Concept Stay Difference
          </p>
          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 48px)',
            fontWeight: '800',
            color: 'var(--color-navbar-text)',
            marginBottom: '12px',
            lineHeight: '1.2',
          }}>
            Why Choose Us
          </h2>
          <div style={{ width: '50px', height: '2px', backgroundColor: 'var(--color-navbar-text)', margin: '0 auto 16px' }} />
          <p style={{
            color: 'rgba(255,255,255,0.84)',
            fontSize: '15px',
            maxWidth: '500px',
            margin: '0 auto',
            lineHeight: '1.6',
          }}>
            We go beyond just a place to stay — we create memories that last a lifetime
          </p>
        </div>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '10px',
          marginBottom: '28px',
        }}>
          {[
            'Cleanliness',
            'Good Locations',
            'Ease Of Check-In',
            'Functional Kitchen',
            'Aesthetics Of The Room',
            'Pets Welcome Everywhere',
          ].map(point => (
            <span
              key={point}
              onMouseEnter={() => setHoveredTags(prev => ({ ...prev, [point]: true }))}
              onMouseLeave={() => setHoveredTags(prev => ({ ...prev, [point]: false }))}
              style={{
                border: hoveredTags[point] ? '1px solid var(--color-gold)' : '1px solid var(--color-navbar-border)',
                backgroundColor: hoveredTags[point] ? 'var(--color-gold)' : 'rgba(255,255,255,0.06)',
                color: hoveredTags[point] ? 'var(--color-text-primary)' : 'var(--color-navbar-text)',
                padding: '8px 14px',
                borderRadius: '999px',
                fontSize: '11px',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                transform: hoveredTags[point] ? 'translateY(-3px) scale(1.04)' : 'translateY(0) scale(1)',
                boxShadow: hoveredTags[point] ? '0 10px 24px rgba(0, 0, 0, 0.18)' : 'none',
              }}
            >
              {point}
            </span>
          ))}
        </div>

        {/* Grid */}
        <div className="responsive-feature-grid" style={{ backgroundColor: 'var(--color-border)' }}>
          {reasons.map((reason, index) => (
            <div
              key={index}
              style={{
                backgroundColor: 'var(--color-navbar)',
                padding: '36px 32px',
                transition: 'background-color 0.3s ease',
                cursor: 'default',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(255,255,255,0.08)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--color-navbar)'}
            >
              <div style={{
                width: '100%',
                aspectRatio: '16 / 10',
                borderRadius: '16px',
                overflow: 'hidden',
                marginBottom: '20px',
                backgroundColor: 'rgba(255,255,255,0.12)',
                position: 'relative',
              }}>
                <img
                  src={reason.image}
                  alt={reason.alt}
                  loading="lazy"
                  decoding="async"
                  suppressHydrationWarning
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              </div>
              <div style={{ width: '32px', height: '2px', backgroundColor: 'var(--color-navbar-text)', marginBottom: '20px' }} />
              <h3 style={{
                fontSize: '22px',
                fontWeight: '700',
                color: 'var(--color-navbar-text)',
                marginBottom: '16px',
                lineHeight: '1.3',
              }}>
                {reason.title}
              </h3>
              <p style={{ color: 'rgba(255,255,255,0.84)', fontSize: '14px', lineHeight: '1.8' }}>
                {reason.description}
              </p>
            </div>
          ))}
        </div>

        {/* Bottom Banner */}
        <div className="why-cta-banner" style={{
          marginTop: '56px',
          border: '1px solid var(--color-navbar-border)',
          borderRadius: '12px',
          padding: 'clamp(20px, 3vw, 40px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '20px',
        }}>
          <div>
            <h3 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--color-navbar-text)', marginBottom: '6px' }}>
              Ready for your next escape?
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.84)', fontSize: '16px' }}>
              Browse our collection of handpicked earthy properties across India
            </p>
          </div>
          <Link
            href="/properties"
            style={{
              backgroundColor: 'var(--color-gold)',
              color: 'var(--color-text-primary)',
              border: 'none',
              padding: '14px 42px',
              fontSize: '12px',
              letterSpacing: '2px',
              fontWeight: '700',
              textTransform: 'uppercase',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              display: 'inline-block',
              borderRadius: '8px',
              maxWidth: '100%',
              boxSizing: 'border-box',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.opacity = '0.9'
              el.style.transform = 'scale(1.03)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.opacity = '1'
              el.style.transform = 'scale(1)'
            }}
          >
            Explore Properties
          </Link>
        </div>
      </div>
    </section>
  )
}
