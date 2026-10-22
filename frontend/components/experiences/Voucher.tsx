'use client'

import { CalendarClock, MapPin, Phone, Ticket, Users } from 'lucide-react'
import { formatStart, type ExperienceBooking } from '@/lib/experiences'

/** The proof of booking a guest shows the operator. Only confirmed bookings carry the code and meeting point. */
export default function Voucher({ booking }: { booking: ExperienceBooking }) {
  return (
    <div style={{ border: '2px dashed var(--color-brand)', borderRadius: 'var(--card-radius)', padding: '20px 22px', backgroundColor: '#ffffff', display: 'grid', gap: '10px' }}>
      <h3 style={{ fontSize: '20px', fontWeight: 800 }}>Your booking is confirmed</h3>
      <p style={{ fontSize: '16px', fontWeight: 700 }}>{booking.experience_title}</p>
      <p style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
        <CalendarClock size={16} aria-hidden /> {formatStart(booking.starts_at)}
      </p>
      <p style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
        <Users size={16} aria-hidden /> {booking.party_size} {booking.party_size === 1 ? 'person' : 'people'}
      </p>
      {booking.meeting_point && (
        <p style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '14px' }}>
          <MapPin size={16} aria-hidden style={{ marginTop: '2px' }} /> <span>{booking.meeting_point}</span>
        </p>
      )}
      {booking.voucher_code && (
        <p style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
          <Ticket size={16} aria-hidden /> Voucher code
          <strong style={{ fontSize: '20px', letterSpacing: '3px' }}>{booking.voucher_code}</strong>
        </p>
      )}
      {booking.operator_name && (
        <p style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', flexWrap: 'wrap' }}>
          <Phone size={16} aria-hidden /> Operator: <strong>{booking.operator_name}</strong>
          {booking.operator_phone && <span>{booking.operator_phone}</span>}
          {booking.operator_email && <span>{booking.operator_email}</span>}
        </p>
      )}
      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Show this code to the operator when you arrive. We also emailed it to you.</p>
    </div>
  )
}
