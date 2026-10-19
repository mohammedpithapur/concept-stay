'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRequireAuth } from '@/lib/auth/useRequireAuth'
import { useAuth } from '@/lib/auth/AuthContext'
import {
  getUserDashboard, listMyBookings, updateUserProfile, changeUserPassword, getPublicProperty,
  type UserDashboard, type MyBooking,
} from '@/lib/api'
import type { Property } from '@/lib/types'
import { Building2, Share2, Download, Calendar, Users, Check, X, Shield, Clock, MapPin, Plus, LogOut } from 'lucide-react'
import PushSubscribeButton from '@/components/shared/PushSubscribeButton'
import BookingActions from '@/components/booking/BookingActions'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  confirmed: { bg: '#E8F5E9', color: '#2E7D32' },
  pending:   { bg: '#FFF8E7', color: '#F57F17' },
  completed: { bg: '#E3F2FD', color: '#1565C0' },
  cancelled: { bg: '#FFEBEE', color: '#C62828' },
}

const PAYMENT_STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  paid:     { bg: '#E8F5E9', color: '#2E7D32', label: 'Paid' },
  unpaid:   { bg: '#FFF8E7', color: '#E65100', label: 'Unpaid' },
  refunded: { bg: '#E3F2FD', color: '#1565C0', label: 'Refunded' },
}

// ─── Voucher Modal ────────────────────────────────────────────────────────────

function VoucherModal({ booking, property: propFromCache, onClose }: {
  booking: MyBooking
  property: Property | null
  onClose: () => void
}) {
  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  const [isPdfGenerating, setIsPdfGenerating] = React.useState(false)
  const [isDownloading, setIsDownloading] = React.useState(false)
  const [property, setProperty] = React.useState<Property | null>(propFromCache)

  // Self-fetch property if not in cache yet
  React.useEffect(() => {
    if (propFromCache) {
      setProperty(propFromCache)
      return
    }
    getPublicProperty(booking.property_id)
      .then(p => setProperty(p))
      .catch(() => {})
  }, [booking.property_id, propFromCache])

  /** Capture the voucher card as a PDF. Returns the jsPDF instance or null. */
  const buildPdf = async () => {
    const element = document.getElementById('voucher-print')
    if (!element) return null
    const btns = element.querySelectorAll<HTMLElement>('button')
    btns.forEach(b => { b.style.display = 'none' })
    try {
      const html2canvas = (await import('html2canvas')).default
      const jsPDF = (await import('jspdf')).default
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdfWidth = 148
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfWidth, pdfHeight] })
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      return pdf
    } finally {
      btns.forEach(b => { b.style.display = '' })
    }
  }

  /** Download the voucher as a PDF file directly. */
  const handleDownloadPDF = async () => {
    setIsDownloading(true)
    try {
      const pdf = await buildPdf()
      if (!pdf) return
      pdf.save(`voucher-${booking.booking_ref}.pdf`)
    } catch (err) {
      console.error('PDF download failed:', err)
    } finally {
      setIsDownloading(false)
    }
  }

  /** Share the voucher PDF via native share sheet (mobile) or fallback to download. */
  const handleSharePDF = async () => {
    setIsPdfGenerating(true)
    try {
      const pdf = await buildPdf()
      if (!pdf) return
      const fileName = `voucher-${booking.booking_ref}.pdf`
      const blob = pdf.output('blob')
      const file = new File([blob], fileName, { type: 'application/pdf' })
      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `Booking Voucher ${booking.booking_ref}` })
      } else {
        pdf.save(fileName)
      }
    } catch (err) {
      console.error('PDF generation / sharing failed:', err)
    } finally {
      setIsPdfGenerating(false)
    }
  }

  // Hero image from property
  const heroImage = property?.images?.find(i => i.is_primary)?.image_url || property?.images?.[0]?.image_url

  return (
    <>
      {/* Backdrop — hidden when printing */}
      <div
        className="voucher-backdrop"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', overflowY: 'auto' }}
      >
        {/* Voucher card */}
        <div
          id="voucher-print"
          onClick={e => e.stopPropagation()}
          style={{ backgroundColor: '#ffffff', borderRadius: '16px', maxWidth: '520px', width: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}
        >
          {/* Property Hero Image */}
          {property === null ? (
            <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg-card)' }}>
              <div style={{ width: '28px', height: '28px', border: '3px solid var(--color-gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : heroImage ? (
            <div style={{ position: 'relative', height: '160px', width: '100%' }}>
              <img
                src={heroImage}
                alt={property?.name ?? ''}
                crossOrigin="anonymous"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 55%)' }}>
                <div style={{ position: 'absolute', bottom: '16px', left: '20px', right: '20px' }}>
                  <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: '700', marginBottom: '4px' }}>{property.city}, {property.state}</p>
                  <h3 style={{ color: '#ffffff', fontSize: '20px', fontWeight: '800', lineHeight: '1.2', margin: 0 }}>{property.name}</h3>
                </div>
              </div>
            </div>
          ) : null}

          <div style={{ padding: '32px 40px 40px' }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '28px', paddingBottom: '24px', borderBottom: '1px solid var(--color-border)' }}>
              <p style={{ fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--color-gold)', fontWeight: '700', marginBottom: '6px' }}>Booking Confirmation</p>
              <h2 style={{ fontSize: '28px', fontWeight: '900', color: 'var(--color-text-primary)', letterSpacing: '3px', margin: '0 0 8px' }}>{booking.booking_ref}</h2>
              <span style={{ ...STATUS_COLORS[booking.status], padding: '4px 14px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', borderRadius: '999px', letterSpacing: '0.8px', display: 'inline-block' }}>
                {booking.status}
              </span>
            </div>

            {/* Property name and address */}
            {property && (
              <div style={{ marginBottom: '24px' }}>
                <p style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: '700', marginBottom: '4px' }}>Property</p>
                <p style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-text-primary)', margin: '0 0 2px' }}>{property.name}</p>
                <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: 0 }}>{property.address}, {property.city}, {property.state}</p>
              </div>
            )}

            {/* Dates grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
              {[
                { label: 'Check In', value: formatDate(booking.check_in) },
                { label: 'Check Out', value: formatDate(booking.check_out) },
                { label: 'Nights', value: `${booking.nights} night${booking.nights !== 1 ? 's' : ''}` },
                { label: 'Guests', value: `${booking.guests}${(booking.pets || 0) > 0 ? ` + ${booking.pets} pet${booking.pets > 1 ? 's' : ''}` : ''}` },
              ].map(item => (
                <div key={item.label} style={{ backgroundColor: 'var(--color-bg-card)', borderRadius: '10px', padding: '12px 14px' }}>
                  <p style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: '700', marginBottom: '4px' }}>{item.label}</p>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)', margin: 0 }}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* Price breakdown */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '18px', marginBottom: '24px' }}>
              {[
                { label: `Base price (${booking.nights} nights)`, amount: booking.base_price },
                ...(booking.pet_charge > 0 ? [{ label: 'Pet charge', amount: booking.pet_charge }] : []),
                { label: 'Cleaning fee', amount: booking.cleaning_fee },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  <span>{row.label}</span>
                  <span>&#8377;{row.amount.toLocaleString('en-IN')}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: '800', color: 'var(--color-text-primary)', borderTop: '1px solid var(--color-border)', paddingTop: '10px', marginTop: '8px' }}>
                <span>Total</span>
                <span>&#8377;{booking.total.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Check-in/out times */}
            {property && (property.check_in_time || property.check_out_time) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                <div>
                  <p style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: '700', marginBottom: '4px' }}>Check-in time</p>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)', margin: 0 }}>{property.check_in_time || '—'}</p>
                </div>
                <div>
                  <p style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: '700', marginBottom: '4px' }}>Check-out time</p>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)', margin: 0 }}>{property.check_out_time || '—'}</p>
                </div>
              </div>
            )}

            {/* Footer buttons — hidden when printing */}
            <div className="no-print" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap', paddingTop: '8px' }}>
              <button onClick={onClose} style={{ padding: '10px 20px', border: '1px solid var(--color-border)', borderRadius: '8px', backgroundColor: 'transparent', fontSize: '13px', cursor: 'pointer', fontWeight: '600', color: 'var(--color-text-secondary)' }}>
                Close
              </button>
              <button
                onClick={handleDownloadPDF}
                disabled={isDownloading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 20px', border: '1px solid var(--color-border)', borderRadius: '8px', backgroundColor: 'transparent', fontSize: '13px', cursor: isDownloading ? 'not-allowed' : 'pointer', fontWeight: '600', color: 'var(--color-text-secondary)', opacity: isDownloading ? 0.7 : 1 }}
              >
                <Download style={{ width: '15px', height: '15px' }} />
                {isDownloading ? 'Downloading…' : 'Download PDF'}
              </button>
              <button
                onClick={handleSharePDF}
                disabled={isPdfGenerating}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 20px', border: 'none', borderRadius: '8px', backgroundColor: 'var(--color-gold)', fontSize: '13px', cursor: isPdfGenerating ? 'not-allowed' : 'pointer', fontWeight: '700', color: 'var(--color-text-primary)', opacity: isPdfGenerating ? 0.7 : 1 }}
              >
                <Share2 style={{ width: '15px', height: '15px' }} />
                {isPdfGenerating ? 'Sharing…' : 'Share Voucher'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Booking Card ─────────────────────────────────────────────────────────────

function BookingCard({ booking, property, expanded, onToggle, onVoucher, onChanged }: {
  booking: MyBooking
  property: Property | null
  expanded: boolean
  onToggle: () => void
  onVoucher: () => void
  onChanged: () => void
}) {
  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', transition: 'box-shadow 0.2s ease' }}>

      {/* Main row */}
      <div style={{ padding: '20px 24px', display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

        {/* Property thumbnail — fixed size, never stretches */}
        {(() => {
          const src = property?.images?.find(i => i.is_primary)?.image_url || property?.images?.[0]?.image_url
          return (
            <div style={{ width: '100px', height: '75px', flexShrink: 0, borderRadius: '10px', overflow: 'hidden', backgroundColor: 'var(--color-bg-card)' }}>
              {src && <img src={src} alt={property?.name || 'Property'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
          )
        })()}

        {/* Info — grows to fill space */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title row */}
          <div style={{ marginBottom: '8px' }}>
            <h3 style={{ fontSize: '17px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {property?.name || 'Loading…'}
            </h3>
            {property && (
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{property.city}, {property.state}</p>
            )}
          </div>

          {/* Status badges */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <span style={{ backgroundColor: STATUS_COLORS[booking.status]?.bg, color: STATUS_COLORS[booking.status]?.color, padding: '3px 10px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', borderRadius: '6px' }}>
              {booking.status}
            </span>
            {booking.payment_status && PAYMENT_STATUS_COLORS[booking.payment_status] && (
              <span style={{ backgroundColor: PAYMENT_STATUS_COLORS[booking.payment_status].bg, color: PAYMENT_STATUS_COLORS[booking.payment_status].color, padding: '3px 10px', fontSize: '11px', fontWeight: '700', borderRadius: '6px' }}>
                {PAYMENT_STATUS_COLORS[booking.payment_status].label}
              </span>
            )}
          </div>

          {/* Date/nights/guests grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: '16px 24px' }}>
            {[
              { label: 'Check In',  value: formatDate(booking.check_in) },
              { label: 'Check Out', value: formatDate(booking.check_out) },
              { label: 'Nights',    value: `${booking.nights} night${booking.nights !== 1 ? 's' : ''}` },
              { label: 'Guests',    value: `${booking.guests}${(booking.pets || 0) > 0 ? ` + ${booking.pets} pet${booking.pets > 1 ? 's' : ''}` : ''}` },
            ].map(d => (
              <div key={d.label}>
                <p style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '2px', fontWeight: '600' }}>{d.label}</p>
                <p style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: '700' }}>{d.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right — price + action buttons */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px', minWidth: '150px' }}>
          {/* Price */}
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '22px', color: 'var(--color-text-primary)', fontWeight: '900', lineHeight: 1 }}>
              &#8377;{booking.total.toLocaleString('en-IN')}
            </p>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px', letterSpacing: '0.5px' }}>Total</p>
          </div>
          {/* Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '150px' }}>
            <button onClick={onToggle}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '8px', backgroundColor: 'transparent', fontSize: '13px', color: 'var(--color-text-secondary)', cursor: 'pointer', fontWeight: '600', textAlign: 'center' }}>
              {expanded ? 'Hide Details' : 'View Details'}
            </button>
            <button onClick={onVoucher}
              style={{ width: '100%', padding: '8px 12px', border: 'none', borderRadius: '8px', backgroundColor: 'var(--color-gold)', color: 'var(--color-text-primary)', fontSize: '13px', fontWeight: '700', cursor: 'pointer', textAlign: 'center' }}>
              Booking Voucher
            </button>
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-border)', padding: '24px', backgroundColor: 'var(--color-bg-soft)', animation: 'fadeDown 0.2s ease' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>

            <div>
              <p style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '6px', fontWeight: '700' }}>Booking Reference</p>
              <p style={{ fontSize: '22px', color: 'var(--color-gold)', fontWeight: '900', letterSpacing: '2px' }}>{booking.booking_ref}</p>
            </div>

            {property?.check_in_time && (
              <div>
                <p style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '6px', fontWeight: '700' }}>Check-in Time</p>
                <p style={{ fontSize: '15px', color: 'var(--color-text-primary)', fontWeight: '700' }}>{property.check_in_time}</p>
              </div>
            )}

            {property?.check_out_time && (
              <div>
                <p style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '6px', fontWeight: '700' }}>Check-out Time</p>
                <p style={{ fontSize: '15px', color: 'var(--color-text-primary)', fontWeight: '700' }}>{property.check_out_time}</p>
              </div>
            )}

            {property?.address && (
              <div>
                <p style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '6px', fontWeight: '700' }}>Address</p>
                <p style={{ fontSize: '14px', color: 'var(--color-text-primary)', lineHeight: '1.5' }}>{property.address}, {property.city}</p>
              </div>
            )}

            {(property?.contact_phone || property?.contact_email) && (
              <div>
                <p style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '6px', fontWeight: '700' }}>Property Contact</p>
                {property.contact_phone && <p style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>{property.contact_phone}</p>}
                {property.contact_email && <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>{property.contact_email}</p>}
              </div>
            )}

            <div>
              <p style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '6px', fontWeight: '700' }}>Price Breakdown</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {[
                  { label: `Base (${booking.nights} nights)`, amount: booking.base_price },
                  ...(booking.pet_charge > 0 ? [{ label: 'Pet charge', amount: booking.pet_charge }] : []),
                  { label: 'Cleaning fee', amount: booking.cleaning_fee },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    <span>{row.label}</span><span>&#8377;{row.amount.toLocaleString('en-IN')}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '800', color: 'var(--color-text-primary)', borderTop: '1px solid var(--color-border)', paddingTop: '4px', marginTop: '4px' }}>
                  <span>Total</span><span>&#8377;{booking.total.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          </div>

          <BookingActions booking={booking} property={property} onChanged={onChanged} />
        </div>
      )}
    </div>
  )
}

// ─── Main Dashboard Page ──────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const { user, loading, logout, fetchWithAuth, accessToken } = useAuth()
  useRequireAuth()

  // ── State ──
  const [activeTab, setActiveTab] = useState('bookings')
  const [dashStats, setDashStats] = useState<UserDashboard | null>(null)
  const [upcomingBookings, setUpcomingBookings] = useState<MyBooking[]>([])
  const [pastBookings, setPastBookings] = useState<MyBooking[]>([])
  const [pendingBookings, setPendingBookings] = useState<MyBooking[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [propertiesCache, setPropertiesCache] = useState<Record<string, Property>>({})
  const [expandedBooking, setExpandedBooking] = useState<string | null>(null)
  const [voucherBooking, setVoucherBooking] = useState<MyBooking | null>(null)

  // Profile
  const [profileForm, setProfileForm] = useState({ full_name: '', email: '', phone: '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState('')
  const [profileError, setProfileError] = useState('')

  // Password
  const [passwordForm, setPasswordForm] = useState({ old_password: '', new_password: '', confirm: '' })
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordError, setPasswordError] = useState('')

  // Sync profile form from user object
  const profileSynced = useRef(false)
  useEffect(() => {
    if (user && !profileSynced.current) {
      setProfileForm({ full_name: user.full_name, email: user.email, phone: user.phone || '' })
      profileSynced.current = true
    }
  }, [user])

  // ── Fetch property from cache or API ──
  // Use a ref to avoid stale closure issues with the cache check
  const propertiesCacheRef = useRef(propertiesCache)
  propertiesCacheRef.current = propertiesCache
  const fetchProperty = useCallback(async (propertyId: string) => {
    if (propertiesCacheRef.current[propertyId]) return
    try {
      const p = await getPublicProperty(propertyId)
      setPropertiesCache(prev => ({ ...prev, [propertyId]: p }))
    } catch { /* property might be unpublished */ }
  }, [])

  // ── Load stats + bookings ──
  const loadAll = useCallback(async () => {
    setBookingsLoading(true)
    try {
      const [stats, upcoming, past, pending] = await Promise.all([
        getUserDashboard(fetchWithAuth),
        listMyBookings({ status: 'confirmed', limit: 50 }, fetchWithAuth),
        listMyBookings({ status: 'completed', limit: 50 }, fetchWithAuth),
        listMyBookings({ status: 'pending',   limit: 50 }, fetchWithAuth),
      ])
      setDashStats(stats)
      setUpcomingBookings(upcoming.items)
      setPastBookings(past.items)
      setPendingBookings(pending.items)

      // Prefetch all property details
      const allIds = new Set([
        ...upcoming.items.map(b => b.property_id),
        ...past.items.map(b => b.property_id),
        ...pending.items.map(b => b.property_id),
      ])
      allIds.forEach(id => fetchProperty(id))
    } catch { /* fail silently */ }
    finally { setBookingsLoading(false) }
  }, [fetchWithAuth, fetchProperty])

  useEffect(() => {
    if (!loading && user) void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user])

  // ── Guard ──
  if (loading || !user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid var(--color-gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeDown { from { opacity:0; transform:translateY(-8px) } to { opacity:1; transform:translateY(0) } }`}</style>
      </div>
    )
  }

  // ── Stats ──
  const totalBookings   = dashStats ? (dashStats.upcoming_bookings + dashStats.past_stays) : 0
  const upcomingCount   = dashStats?.upcoming_bookings ?? upcomingBookings.length + pendingBookings.length
  const pastCount       = dashStats?.past_stays ?? pastBookings.length
  const totalSpent      = dashStats?.total_spent ?? 0

  // ── Profile save ──
  const handleSaveProfile = async () => {
    setProfileSaving(true); setProfileError(''); setProfileSuccess('')
    try {
      await updateUserProfile({ full_name: profileForm.full_name, phone: profileForm.phone || undefined }, fetchWithAuth)
      setProfileSuccess('Profile updated successfully!')
      setTimeout(() => setProfileSuccess(''), 3000)
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Failed to update profile')
    } finally { setProfileSaving(false) }
  }

  // ── Password change ──
  const handleChangePassword = async () => {
    setPasswordError(''); setPasswordSuccess('')
    if (!passwordForm.old_password || !passwordForm.new_password) { setPasswordError('All fields are required'); return }
    if (passwordForm.new_password !== passwordForm.confirm) { setPasswordError('New passwords do not match'); return }
    if (passwordForm.new_password.length < 8) { setPasswordError('New password must be at least 8 characters'); return }
    setPasswordSaving(true)
    try {
      await changeUserPassword({ old_password: passwordForm.old_password, new_password: passwordForm.new_password }, fetchWithAuth)
      setPasswordForm({ old_password: '', new_password: '', confirm: '' })
      setPasswordSuccess('Password changed successfully!')
      setTimeout(() => setPasswordSuccess(''), 3000)
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : 'Failed to change password')
    } finally { setPasswordSaving(false) }
  }

  // ── Shared booking list renderer ──
  const renderBookingList = (bookings: MyBooking[], emptyTitle: string, emptyBody: string) => {
    if (bookingsLoading) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[1, 2].map(i => (
            <div key={i} style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '14px', padding: '24px', height: '130px', animation: 'pulse 1.5s infinite' }} />
          ))}
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
        </div>
      )
    }
    if (bookings.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '80px 24px', backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <Building2 style={{ width: '48px', height: '48px', color: 'var(--color-gold)', strokeWidth: 1.5 }} />
          </div>
          <h3 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '10px' }}>{emptyTitle}</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginBottom: '24px' }}>{emptyBody}</p>
          <Link href="/properties" style={{ backgroundColor: 'var(--color-gold)', color: 'var(--color-text-primary)', padding: '14px 32px', fontSize: '13px', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: '700', textDecoration: 'none', borderRadius: '8px', display: 'inline-block' }}>
            Explore Our Properties
          </Link>
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {bookings.map(booking => (
          <BookingCard
            key={booking.id}
            booking={booking}
            property={propertiesCache[booking.property_id] ?? null}
            expanded={expandedBooking === booking.id}
            onToggle={() => setExpandedBooking(prev => prev === booking.id ? null : booking.id)}
            onVoucher={() => setVoucherBooking(booking)}
            onChanged={loadAll}
          />
        ))}
      </div>
    )
  }

  const tabs = [
    { id: 'bookings', label: 'Upcoming',    count: upcomingCount + pendingBookings.length },
    { id: 'past',     label: 'Past Stays',  count: pastCount },
    { id: 'profile',  label: 'My Profile',  count: null },
  ]

  const inputStyle = {
    width: '100%', padding: '14px 16px', border: '1px solid var(--color-border)',
    borderRadius: '8px', fontSize: '14px', color: 'var(--color-text-primary)',
    outline: 'none', backgroundColor: '#ffffff', boxSizing: 'border-box' as const,
    fontFamily: "'Figtree', sans-serif",
  }
  const labelStyle = {
    fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase' as const,
    color: 'var(--color-text-muted)', display: 'block', marginBottom: '8px', fontWeight: '600' as const,
  }

  return (
    <div style={{ backgroundColor: '#ffffff', minHeight: '100vh' }}>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes fadeDown { from { opacity:0; transform:translateY(-8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.45} }
        @media print {
          .voucher-backdrop {
            position: static !important;
            background: none !important;
            padding: 0 !important;
            display: block !important;
            overflow: visible !important;
          }
          .voucher-backdrop > * {
            display: none !important;
          }
          #voucher-print {
            display: block !important;
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            page-break-after: avoid !important;
          }
          #voucher-print * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Voucher Modal */}
      {voucherBooking && (
        <VoucherModal
          booking={voucherBooking}
          property={propertiesCache[voucherBooking.property_id] ?? null}
          onClose={() => setVoucherBooking(null)}
        />
      )}

      {/* ── Header ── */}
      <div style={{ background: 'linear-gradient(135deg, var(--color-navbar) 0%, #1a1a1a 100%)', padding: '48px 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <p style={{ color: 'var(--color-gold)', fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px', fontWeight: '700' }}>Welcome back</p>
            <h1 style={{ color: 'var(--color-text-primary)', fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: '900', letterSpacing: '-0.5px' }}>
              {user.full_name}
            </h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginTop: '4px' }}>{user.email}</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <PushSubscribeButton token={accessToken} showTestButton={true} label="Stay Notifications" />
            <Link href="/properties"
              style={{ backgroundColor: 'var(--color-gold)', color: 'var(--color-text-primary)', padding: '14px 28px', fontSize: '13px', letterSpacing: '1.5px', fontWeight: '800', textTransform: 'uppercase', textDecoration: 'none', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} /> Book New Stay
            </Link>
          </div>
        </div>
      </div>

      {/* ── Stats Bar ── */}
      <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid var(--color-border)', padding: '32px 0' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
          {[
            { label: 'Total Bookings',  value: totalBookings },
            { label: 'Upcoming Stays', value: upcomingCount },
            { label: 'Past Stays',     value: pastCount },
            { label: 'Total Spent',    value: `&#8377;${totalSpent.toLocaleString('en-IN')}` },
          ].map((stat) => (
            <div key={stat.label}
              style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '14px', padding: '24px 20px', textAlign: 'center', boxShadow: '0 6px 20px rgba(0,0,0,0.03)' }}>
              <p style={{ fontSize: '28px', color: 'var(--color-text-primary)', fontWeight: '900', marginBottom: '6px' }}
                dangerouslySetInnerHTML={{ __html: String(stat.value) }} />
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: '700' }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 24px' }}>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', marginBottom: '32px', borderBottom: '1px solid var(--color-border)', overflowX: 'auto' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '14px 24px', border: 'none', whiteSpace: 'nowrap',
                borderBottom: activeTab === tab.id ? '2px solid var(--color-gold)' : '2px solid transparent',
                backgroundColor: 'transparent',
                color: activeTab === tab.id ? 'var(--color-gold)' : 'var(--color-text-muted)',
                fontSize: '14px', cursor: 'pointer',
                fontWeight: activeTab === tab.id ? '700' : '500',
                display: 'flex', alignItems: 'center', gap: '8px',
                transition: 'all 0.2s ease',
              }}>
              {tab.label}
              {tab.count !== null && (
                <span style={{
                  backgroundColor: activeTab === tab.id ? 'var(--color-gold)' : 'var(--color-border)',
                  color: activeTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  borderRadius: '50%', width: '22px', height: '22px', fontSize: '11px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700',
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Upcoming Bookings ── */}
        {activeTab === 'bookings' && (
          <div>
            {pendingBookings.length > 0 && (
              <div style={{ marginBottom: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <span style={{ width: '10px', height: '10px', backgroundColor: '#F57F17', borderRadius: '50%', display: 'inline-block' }} />
                  <h2 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--color-text-primary)' }}>Awaiting Confirmation</h2>
                </div>
                {renderBookingList(pendingBookings, '', '')}
              </div>
            )}
            {(upcomingBookings.length > 0 || pendingBookings.length === 0) && (
              <div>
                {pendingBookings.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <span style={{ width: '10px', height: '10px', backgroundColor: '#2E7D32', borderRadius: '50%', display: 'inline-block' }} />
                    <h2 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--color-text-primary)' }}>Confirmed Stays</h2>
                  </div>
                )}
                {renderBookingList(upcomingBookings, 'No upcoming bookings', "Ready for your next escape? Browse our properties.")}
              </div>
            )}
          </div>
        )}

        {/* ── Past Stays ── */}
        {activeTab === 'past' && renderBookingList(pastBookings, 'No past stays yet', 'Your completed stays will appear here.')}

        {/* ── Profile ── */}
        {activeTab === 'profile' && (
          <div style={{ maxWidth: '600px' }}>

            {/* Profile card */}
            <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '14px', padding: '32px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '28px' }}>
                <div style={{ width: '72px', height: '72px', backgroundColor: 'var(--color-gold)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: '900', color: 'var(--color-text-primary)', flexShrink: 0 }}>
                  {user.full_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '2px' }}>{user.full_name}</p>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {user.role === 'admin' ? <><Shield size={13} style={{ color: 'var(--color-gold)' }} /> Admin Account</> : 'Guest Account'}
                  </p>
                </div>
              </div>

              <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '6px' }}>Personal Details</h2>
              <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--color-gold)', marginBottom: '24px' }} />

              {[
                { label: 'Full Name',     field: 'full_name', type: 'text',  placeholder: 'Your name', readOnly: false },
                { label: 'Email Address', field: 'email',     type: 'email', placeholder: 'you@example.com', readOnly: true },
                { label: 'Phone Number',  field: 'phone',     type: 'tel',   placeholder: '+91 9876543210', readOnly: false },
              ].map(item => (
                <div key={item.field} style={{ marginBottom: '20px' }}>
                  <label style={labelStyle}>{item.label}</label>
                  <input
                    type={item.type}
                    placeholder={item.placeholder}
                    readOnly={item.readOnly}
                    value={profileForm[item.field as keyof typeof profileForm]}
                    onChange={e => !item.readOnly && setProfileForm({ ...profileForm, [item.field]: e.target.value })}
                    style={{ ...inputStyle, backgroundColor: item.readOnly ? 'var(--color-bg-soft)' : '#ffffff', color: item.readOnly ? 'var(--color-text-muted)' : 'var(--color-text-primary)', cursor: item.readOnly ? 'not-allowed' : 'text' }}
                  />
                  {item.readOnly && <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Email cannot be changed</p>}
                </div>
              ))}

              {profileError && <p style={{ color: '#C62828', fontSize: '13px', marginBottom: '12px', fontWeight: '600' }}>{profileError}</p>}
              {profileSuccess && <p style={{ color: '#2E7D32', fontSize: '13px', marginBottom: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}><Check size={14} /> {profileSuccess}</p>}

              <button
                onClick={handleSaveProfile}
                disabled={profileSaving}
                style={{ backgroundColor: profileSaving ? 'var(--color-border)' : 'var(--color-gold)', color: profileSaving ? '#aaa' : 'var(--color-text-primary)', border: 'none', padding: '14px 32px', fontSize: '13px', letterSpacing: '1.5px', fontWeight: '700', textTransform: 'uppercase', cursor: profileSaving ? 'not-allowed' : 'pointer', borderRadius: '8px', transition: 'background 0.2s' }}>
                {profileSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>

            {/* Change Password card */}
            <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '14px', padding: '32px', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '6px' }}>Change Password</h3>
              <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--color-gold)', marginBottom: '24px' }} />

              {[
                { label: 'Current Password', field: 'old_password' },
                { label: 'New Password',     field: 'new_password' },
                { label: 'Confirm New Password', field: 'confirm' },
              ].map(item => (
                <div key={item.field} style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>{item.label}</label>
                  <input
                    type="password" placeholder="••••••••"
                    value={passwordForm[item.field as keyof typeof passwordForm]}
                    onChange={e => setPasswordForm({ ...passwordForm, [item.field]: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              ))}

              {passwordError && <p style={{ color: '#C62828', fontSize: '13px', marginBottom: '12px', fontWeight: '600' }}>{passwordError}</p>}
              {passwordSuccess && <p style={{ color: '#2E7D32', fontSize: '13px', marginBottom: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}><Check size={14} /> {passwordSuccess}</p>}

              <button
                onClick={handleChangePassword}
                disabled={passwordSaving}
                style={{ backgroundColor: passwordSaving ? 'var(--color-border)' : 'var(--color-text-primary)', color: passwordSaving ? '#aaa' : '#ffffff', border: 'none', padding: '14px 32px', fontSize: '13px', letterSpacing: '1.5px', fontWeight: '700', textTransform: 'uppercase', cursor: passwordSaving ? 'not-allowed' : 'pointer', borderRadius: '8px' }}>
                {passwordSaving ? 'Updating…' : 'Update Password'}
              </button>
            </div>

            {/* Sign out */}
            <div style={{ textAlign: 'center', marginTop: '8px' }}>
              <button
                onClick={async () => { await logout(); router.push('/') }}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '14px', cursor: 'pointer', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
