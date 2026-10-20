'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ApiFetcher, CalendarEvent, PriceOverride } from '@/lib/api'
import { getPropertyCalendarFull, createAdminBlock, deleteAdminBlock, createPriceOverride, deletePriceOverride } from '@/lib/api'
import { Calendar, Tag, ShieldAlert, X, Percent, Circle, Square } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

function getEventsForDate(dateStr: string, events: CalendarEvent[]): CalendarEvent[] {
  return events.filter(ev => dateStr >= ev.check_in && dateStr < ev.check_out)
}

function getOverrideForDate(dateStr: string, overrides: PriceOverride[]): PriceOverride | undefined {
  return overrides.find(ov => dateStr >= ov.start_date && dateStr < ov.end_date)
}

function countNights(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0
  const d1 = new Date(startStr).getTime()
  const d2 = new Date(endStr).getTime()
  return Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)))
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalendarModalProps {
  propertyId: string
  propertyName: string
  onClose: () => void
  fetchWithAuth: ApiFetcher
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function Tooltip({ children, tip }: { children: React.ReactNode; tip: string }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'contents' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div style={{
          position: 'absolute', zIndex: 30, bottom: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)',
          background: '#0d0b07', border: '1px solid #3d3425',
          color: '#e8d5a3', fontSize: '0.72rem', lineHeight: 1.5,
          padding: '8px 10px', borderRadius: '8px', whiteSpace: 'pre-line',
          boxShadow: '0 4px 16px rgba(0,0,0,0.6)', pointerEvents: 'none',
          minWidth: '170px', textAlign: 'left',
        }}>
          {tip}
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CalendarModal({ propertyId, propertyName, onClose, fetchWithAuth }: CalendarModalProps) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [priceOverrides, setPriceOverrides] = useState<PriceOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Mode: 'price' (set custom price for period), 'discount' (apply discount coupon %), or 'block' (block dates)
  const [activeTab, setActiveTab] = useState<'block' | 'price' | 'discount'>('price')

  // Block form
  const [blockStart, setBlockStart] = useState('')
  const [blockEnd, setBlockEnd] = useState('')
  const [blockNote, setBlockNote] = useState('')
  const [blocking, setBlocking] = useState(false)
  const [blockError, setBlockError] = useState<string | null>(null)
  const [blockSuccess, setBlockSuccess] = useState<string | null>(null)

  // Price Override form
  const [priceStart, setPriceStart] = useState('')
  const [priceEnd, setPriceEnd] = useState('')
  const [priceRate, setPriceRate] = useState('')
  const [priceLabel, setPriceLabel] = useState('')
  const [priceSaving, setPriceSaving] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)
  const [priceSuccess, setPriceSuccess] = useState<string | null>(null)

  // Discount / Coupon form
  const [discountStart, setDiscountStart] = useState('')
  const [discountEnd, setDiscountEnd] = useState('')
  const [discountPercent, setDiscountPercent] = useState('15')
  const [discountLabel, setDiscountLabel] = useState('')
  const [discountSaving, setDiscountSaving] = useState(false)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [discountSuccess, setDiscountSuccess] = useState<string | null>(null)

  // Click-to-select range state
  const [selStart, setSelStart] = useState<string | null>(null)
  const [selHover, setSelHover] = useState<string | null>(null)

  const todayStr = toDateStr(today)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Load current month + 2 months either side
      const fromD = new Date(viewYear, viewMonth - 2, 1)
      const toD = new Date(viewYear, viewMonth + 3, 0)
      const from = toDateStr(fromD)
      const to = toDateStr(toD)
      const data = await getPropertyCalendarFull(propertyId, from, to, fetchWithAuth)
      setEvents(data.events)
      setPriceOverrides(data.price_overrides)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load calendar')
    } finally {
      setLoading(false)
    }
  }, [propertyId, viewYear, viewMonth, fetchWithAuth])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  function handleDayClick(dateStr: string) {
    if (activeTab === 'block') {
      const dayEvents = getEventsForDate(dateStr, events)
      if (dayEvents.some(e => e.type === 'guest_booking')) return

      if (!selStart) {
        setSelStart(dateStr)
        setBlockStart(dateStr)
        setBlockEnd('')
        setBlockError(null)
        setBlockSuccess(null)
      } else {
        const s = selStart < dateStr ? selStart : dateStr
        const e = selStart < dateStr ? dateStr : selStart
        const eDate = new Date(e)
        eDate.setDate(eDate.getDate() + 1)
        const eNext = toDateStr(eDate)
        setBlockStart(s)
        setBlockEnd(eNext)
        setSelStart(null)
        setSelHover(null)
      }
    } else if (activeTab === 'discount') {
      if (!selStart) {
        setSelStart(dateStr)
        setDiscountStart(dateStr)
        setDiscountEnd('')
        setDiscountError(null)
        setDiscountSuccess(null)
      } else {
        const s = selStart < dateStr ? selStart : dateStr
        const e = selStart < dateStr ? dateStr : selStart
        const eDate = new Date(e)
        eDate.setDate(eDate.getDate() + 1)
        const eNext = toDateStr(eDate)
        setDiscountStart(s)
        setDiscountEnd(eNext)
        setSelStart(null)
        setSelHover(null)
      }
    } else {
      // Price override mode: click start date, then click end date
      if (!selStart) {
        setSelStart(dateStr)
        setPriceStart(dateStr)
        setPriceEnd('')
        setPriceError(null)
        setPriceSuccess(null)
      } else {
        const s = selStart < dateStr ? selStart : dateStr
        const e = selStart < dateStr ? dateStr : selStart
        const eDate = new Date(e)
        eDate.setDate(eDate.getDate() + 1)
        const eNext = toDateStr(eDate)
        setPriceStart(s)
        setPriceEnd(eNext)
        setSelStart(null)
        setSelHover(null)
      }
    }
  }

  function getCellStyle(dateStr: string): React.CSSProperties {
    const dayEvents = getEventsForDate(dateStr, events)
    const types = new Set(dayEvents.map(e => e.type))
    const pOverride = getOverrideForDate(dateStr, priceOverrides)

    const selMin = selStart && selHover ? (selStart < selHover ? selStart : selHover) : null
    const selMax = selStart && selHover ? (selStart > selHover ? selStart : selHover) : null
    const inSel = selMin && selMax && dateStr >= selMin && dateStr <= selMax

    if (activeTab === 'price') {
      const inPriceRange = priceStart && priceEnd && dateStr >= priceStart && dateStr < priceEnd
      if (inSel || inPriceRange) {
        return { background: 'rgba(168, 85, 247, 0.28)', border: '1px solid #c084fc', color: '#f3e8ff', fontWeight: '700' }
      }
    } else if (activeTab === 'discount') {
      const inDiscountRange = discountStart && discountEnd && dateStr >= discountStart && dateStr < discountEnd
      if (inSel || inDiscountRange) {
        return { background: 'rgba(74, 222, 128, 0.22)', border: '1px solid #4ade80', color: '#86efac', fontWeight: '700' }
      }
    } else {
      const inBlockRange = blockStart && blockEnd && dateStr >= blockStart && dateStr < blockEnd
      if (inSel || inBlockRange) {
        return { background: 'rgba(233, 201, 160,0.22)', border: '1px solid #c9a84c', color: '#e8d5a3', fontWeight: '600' }
      }
    }

    if (types.has('guest_booking')) return { background: '#2a1a0a', border: '1px solid rgba(233, 201, 160,0.4)', color: '#c9a84c' }
    if (types.has('admin_block')) return { background: '#0f0d08', border: '1px solid #c9a84c', color: '#5a5040' }
    if (types.has('shadow_block')) return {
      background: 'repeating-linear-gradient(45deg,#1a1611,#1a1611 4px,#221d12 4px,#221d12 8px)',
      border: '1px solid #2e2618', color: '#4a4030',
    }

    // Price override highlight when not booked/blocked
    if (pOverride) {
      if (pOverride.discount_percent) {
        return {
          background: 'rgba(74, 222, 128, 0.12)',
          border: '1px solid rgba(74, 222, 128, 0.5)',
          color: '#86efac',
          fontWeight: '600',
        }
      }
      return {
        background: 'rgba(147, 51, 234, 0.12)',
        border: '1px solid rgba(192, 132, 252, 0.5)',
        color: '#e9d5ff',
        fontWeight: '600',
      }
    }

    if (dateStr === todayStr) return { border: '1px solid rgba(233, 201, 160,0.5)', color: '#e8d5a3', fontWeight: '700' }
    return { border: '1px solid transparent', color: '#c4a96d' }
  }

  async function handleCreateBlock() {
    if (!blockStart || !blockEnd) { setBlockError('Please select start and end dates'); return }
    if (blockEnd <= blockStart) { setBlockError('End date must be after start date'); return }
    setBlocking(true); setBlockError(null); setBlockSuccess(null)
    try {
      await createAdminBlock(
        propertyId,
        { check_in: blockStart, check_out: blockEnd, note: blockNote.trim() || null },
        fetchWithAuth
      )
      setBlockSuccess('Dates blocked successfully!')
      setBlockStart(''); setBlockEnd(''); setBlockNote(''); setSelStart(null)
      await fetchEvents()
    } catch (e: unknown) {
      setBlockError(e instanceof Error ? e.message : 'Failed to block dates')
    } finally {
      setBlocking(false)
    }
  }

  async function handleUnblock(block: CalendarEvent) {
    setBlockError(null); setBlockSuccess(null)
    try {
      await deleteAdminBlock(propertyId, block.id, fetchWithAuth)
      setBlockSuccess('Block removed successfully')
      await fetchEvents()
    } catch (e: unknown) {
      setBlockError(e instanceof Error ? e.message : 'Failed to remove block')
    }
  }

  async function handleCreatePriceOverride() {
    if (!priceStart || !priceEnd) { setPriceError('Please select start and end dates'); return }
    if (priceEnd <= priceStart) { setPriceError('End date must be after start date'); return }
    const rateNum = parseInt(priceRate, 10)
    if (isNaN(rateNum) || rateNum <= 0) { setPriceError('Please enter a valid price per night greater than ₹0'); return }

    setPriceSaving(true); setPriceError(null); setPriceSuccess(null)
    try {
      await createPriceOverride(
        propertyId,
        {
          start_date: priceStart,
          end_date: priceEnd,
          price_per_night: rateNum,
          label: priceLabel.trim() || null,
        },
        fetchWithAuth
      )
      setPriceSuccess(`Price updated to ₹${rateNum.toLocaleString('en-IN')}/night for ${countNights(priceStart, priceEnd)} nights!`)
      setPriceStart(''); setPriceEnd(''); setPriceRate(''); setPriceLabel(''); setSelStart(null)
      await fetchEvents()
    } catch (e: unknown) {
      setPriceError(e instanceof Error ? e.message : 'Failed to apply price override')
    } finally {
      setPriceSaving(false)
    }
  }

  async function handleDeletePriceOverride(overrideId: string) {
    setPriceError(null); setPriceSuccess(null)
    try {
      await deletePriceOverride(propertyId, overrideId, fetchWithAuth)
      setPriceSuccess('Price override removed')
      await fetchEvents()
    } catch (e: unknown) {
      setPriceError(e instanceof Error ? e.message : 'Failed to remove price override')
    }
  }

  async function handleCreateDiscount() {
    if (!discountStart || !discountEnd) { setDiscountError('Please select start and end dates'); return }
    if (discountEnd <= discountStart) { setDiscountError('End date must be after start date'); return }
    const pct = parseInt(discountPercent, 10)
    if (isNaN(pct) || pct < 1 || pct > 90) { setDiscountError('Please enter a valid discount between 1% and 90%'); return }

    setDiscountSaving(true); setDiscountError(null); setDiscountSuccess(null)
    try {
      await createPriceOverride(
        propertyId,
        {
          start_date: discountStart,
          end_date: discountEnd,
          discount_percent: pct,
          label: discountLabel.trim() || `${pct}% Discount Offer`,
        },
        fetchWithAuth
      )
      setDiscountSuccess(`${pct}% discount applied for ${countNights(discountStart, discountEnd)} nights!`)
      setDiscountStart(''); setDiscountEnd(''); setDiscountLabel(''); setSelStart(null)
      await fetchEvents()
    } catch (e: unknown) {
      setDiscountError(e instanceof Error ? e.message : 'Failed to apply discount coupon')
    } finally {
      setDiscountSaving(false)
    }
  }

  // Build grid
  const totalDays = daysInMonth(viewYear, viewMonth)
  const firstDay = firstDayOfMonth(viewYear, viewMonth)
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const adminBlocks = events
    .filter(e => e.type === 'admin_block')
    .sort((a, b) => a.check_in.localeCompare(b.check_in))

  const activeOverrides = [...priceOverrides].sort((a, b) => a.start_date.localeCompare(b.start_date))

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#1a1611', border: '1px solid #3d3425',
    color: '#e8d5a3', borderRadius: 8, padding: '8px 10px',
    fontSize: '0.82rem', marginBottom: 10, boxSizing: 'border-box', outline: 'none',
  }

  return (
    <div
      className="cal-wrapper"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <style>{`
        .cal-wrapper {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(0,0,0,0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .cal-dialog {
          background: #1a1611;
          border: 1px solid #3d3425;
          border-radius: 16px;
          width: 100%;
          max-width: 1100px;
          max-height: 94vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 30px 80px rgba(0,0,0,0.75);
          overflow: hidden;
        }
        .cal-modal-body {
          display: flex;
          flex: 1;
          overflow: hidden;
          min-height: 0;
        }
        .cal-area {
          flex: 1;
          padding: 20px 24px;
          overflow-y: auto;
        }
        .cal-sidebar {
          width: 320px;
          border-left: 1px solid #2e2618;
          display: flex;
          flex-direction: column;
          background: #130f0a;
          overflow-y: auto;
          flex-shrink: 0;
        }

        @media (max-width: 820px) {
          .cal-wrapper {
            padding: 8px;
          }
          .cal-dialog {
            max-height: 96vh;
          }
          .cal-modal-body {
            flex-direction: column;
            overflow-y: auto;
          }
          .cal-area {
            flex: none;
            padding: 16px 14px;
            overflow-y: visible;
          }
          .cal-sidebar {
            width: 100%;
            border-left: none;
            border-top: 1px solid #2e2618;
            flex: none;
            overflow-y: visible;
          }
        }
      `}</style>
      <div className="cal-dialog">

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: '1px solid #2e2618', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e8d5a3', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={18} style={{ color: '#c9a84c' }} /> Property Calendar & Pricing
            </div>
            <div style={{ fontSize: '0.78rem', color: '#8a7a5a', marginTop: 2 }}>{propertyName}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close calendar"
            style={{
              background: 'none', border: '1px solid #3d3425', color: '#8a7a5a',
              width: 36, height: 36, borderRadius: 8, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
            }}
          ><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="cal-modal-body">

          {/* Calendar area */}
          <div className="cal-area">

            {/* Month nav */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <button onClick={prevMonth} aria-label="Previous month" style={{
                background: 'none', border: '1px solid #3d3425', color: '#c9a84c',
                width: 34, height: 34, borderRadius: 8, cursor: 'pointer', fontSize: '1.1rem',
              }}>‹</button>
              <div style={{ fontWeight: 700, color: '#e8d5a3', minWidth: 175, textAlign: 'center', fontSize: '1rem' }}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </div>
              <button onClick={nextMonth} aria-label="Next month" style={{
                background: 'none', border: '1px solid #3d3425', color: '#c9a84c',
                width: 34, height: 34, borderRadius: 8, cursor: 'pointer', fontSize: '1.1rem',
              }}>›</button>

              <div style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#8a7a5a', display: 'flex', alignItems: 'center', gap: 6 }}>
                Mode: <strong style={{ color: activeTab === 'price' ? '#c084fc' : activeTab === 'discount' ? '#4ade80' : '#c9a84c', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {activeTab === 'price' ? <><Tag size={12} /> Price Override</> : activeTab === 'discount' ? <><Percent size={12} /> Discount Coupon</> : <><ShieldAlert size={12} /> Block Dates</>}
                </strong>
              </div>
            </div>

            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#6b5e3e', fontSize: '0.85rem' }}>
                Loading calendar…
              </div>
            ) : error ? (
              <div style={{ background: '#2a0a0a', border: '1px solid #7a2020', color: '#e57373', padding: '10px 12px', borderRadius: 8, fontSize: '0.8rem' }}>
                {error}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {/* Day headers */}
                {DAY_NAMES.map(d => (
                  <div key={d} style={{
                    textAlign: 'center', fontSize: '0.68rem', color: '#6b5e3e',
                    fontWeight: 600, padding: '6px 0', textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>{d}</div>
                ))}

                {/* Day cells */}
                {cells.map((day, idx) => {
                  if (!day) return <div key={`e${idx}`} style={{ minHeight: 52 }} />

                  const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                  const dayEvents = getEventsForDate(dateStr, events)
                  const guestEvs = dayEvents.filter(e => e.type === 'guest_booking')
                  const adminEvs = dayEvents.filter(e => e.type === 'admin_block')
                  const shadowEvs = dayEvents.filter(e => e.type === 'shadow_block')
                  const pOverride = getOverrideForDate(dateStr, priceOverrides)

                  const tips: string[] = []
                  guestEvs.forEach(e => tips.push(`Guest: ${e.guest_name} | ${e.booking_ref} | ₹${(e.total ?? 0).toLocaleString('en-IN')}`))
                  adminEvs.forEach(e => tips.push(`Admin Block${e.note ? ': ' + e.note : ''}`))
                  shadowEvs.forEach(e => tips.push(`Group Block${e.parent_booking_ref ? ': ' + e.parent_booking_ref : ''}`))
                  if (pOverride) {
                    tips.push(`Custom Rate: ₹${pOverride.price_per_night.toLocaleString('en-IN')}/night${pOverride.label ? ` (${pOverride.label})` : ''}`)
                  }
                  const tipText = tips.join('\n')

                  const isGuest = guestEvs.length > 0

                  const cellEl = (
                    <div
                      key={dateStr}
                      style={{
                        minHeight: 52, borderRadius: 8,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.85rem', cursor: (activeTab === 'block' && isGuest) ? 'not-allowed' : 'pointer',
                        position: 'relative', userSelect: 'none', transition: 'all 0.12s',
                        ...getCellStyle(dateStr),
                      }}
                      onClick={() => handleDayClick(dateStr)}
                      onMouseEnter={() => selStart && setSelHover(dateStr)}
                      onMouseLeave={() => setSelHover(null)}
                    >
                      <span style={{ lineHeight: 1 }}>{day}</span>

                      {/* Overridden price or discount mini-tag */}
                      {pOverride && !isGuest && adminEvs.length === 0 && (
                        <span style={{
                          fontSize: '0.58rem',
                          color: pOverride.discount_percent ? '#4ade80' : '#c084fc',
                          marginTop: 3,
                          fontWeight: 700,
                          letterSpacing: '-0.3px',
                        }}>
                          {pOverride.discount_percent
                            ? `${pOverride.discount_percent}%`
                            : `₹${pOverride.price_per_night >= 1000 ? `${(pOverride.price_per_night / 1000).toFixed(pOverride.price_per_night % 1000 === 0 ? 0 : 1)}k` : pOverride.price_per_night}`}
                        </span>
                      )}

                      {/* Event indicators */}
                      {dayEvents.length > 0 && (
                        <span style={{ fontSize: '0.55rem', marginTop: 2 }}>
                          {guestEvs.length > 0 ? <Circle size={7} fill="currentColor" aria-hidden="true" /> : adminEvs.length > 0 ? <Square size={7} fill="currentColor" aria-hidden="true" /> : <Circle size={7} aria-hidden="true" />}
                        </span>
                      )}
                    </div>
                  )

                  return tipText ? (
                    <Tooltip key={dateStr} tip={tipText}>{cellEl}</Tooltip>
                  ) : <div key={dateStr}>{cellEl}</div>
                })}
              </div>
            )}

            {/* Legend */}
            <div style={{ marginTop: 20, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                { bg: '#2a1a0a', border: '1px solid rgba(233, 201, 160,0.4)', label: 'Guest Booking' },
                { bg: '#0f0d08', border: '1px solid #c9a84c', label: 'Admin Block' },
                { bg: 'repeating-linear-gradient(45deg,#1a1611,#1a1611 4px,#221d12 4px,#221d12 8px)', border: '1px solid #2e2618', label: 'Group Shadow Block' },
                { bg: 'rgba(147, 51, 234, 0.18)', border: '1px solid #c084fc', label: 'Custom Price Override' },
                { bg: 'rgba(233, 201, 160,0.22)', border: '1px solid #c9a84c', label: 'Selected Range' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.7rem', color: '#8a7a5a' }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, flexShrink: 0, background: item.bg, border: item.border }} />
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          {/* Side panel */}
          <div className="cal-sidebar">

            {/* Mode Switcher Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #2e2618', background: '#0e0b08' }}>
              <button
                onClick={() => { setActiveTab('price'); setSelStart(null); setSelHover(null) }}
                style={{
                  flex: 1, padding: '14px 6px', fontSize: '0.74rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                  background: activeTab === 'price' ? '#1a1611' : 'transparent',
                  color: activeTab === 'price' ? '#c084fc' : '#8a7a5a',
                  borderBottom: activeTab === 'price' ? '2px solid #c084fc' : '2px solid transparent',
                }}
              >
                <Tag size={13} /> Price
              </button>
              <button
                onClick={() => { setActiveTab('discount'); setSelStart(null); setSelHover(null) }}
                style={{
                  flex: 1, padding: '14px 6px', fontSize: '0.74rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                  background: activeTab === 'discount' ? '#1a1611' : 'transparent',
                  color: activeTab === 'discount' ? '#4ade80' : '#8a7a5a',
                  borderBottom: activeTab === 'discount' ? '2px solid #4ade80' : '2px solid transparent',
                }}
              >
                <Percent size={13} /> Discount
              </button>
              <button
                onClick={() => { setActiveTab('block'); setSelStart(null); setSelHover(null) }}
                style={{
                  flex: 1, padding: '14px 6px', fontSize: '0.74rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                  background: activeTab === 'block' ? '#1a1611' : 'transparent',
                  color: activeTab === 'block' ? '#c9a84c' : '#8a7a5a',
                  borderBottom: activeTab === 'block' ? '2px solid #c9a84c' : '2px solid transparent',
                }}
              >
                <ShieldAlert size={13} /> Block
              </button>
            </div>

            {/* Tab 1: Price Override */}
            {activeTab === 'price' && (
              <>
                <div style={{ padding: 20, borderBottom: '1px solid #1f1a10' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag size={13} /> Change Price for Period
                  </div>

                  {priceError && (
                    <div style={{ background: '#2a0a0a', border: '1px solid #7a2020', color: '#e57373', borderRadius: 8, padding: '8px 10px', fontSize: '0.75rem', marginBottom: 10, lineHeight: 1.4 }}>
                      {priceError}
                    </div>
                  )}
                  {priceSuccess && (
                    <div style={{ background: '#0a2a0a', border: '1px solid #2a5a2a', color: '#81c784', borderRadius: 8, padding: '8px 10px', fontSize: '0.75rem', marginBottom: 10 }}>
                      {priceSuccess}
                    </div>
                  )}

                  <label style={{ fontSize: '0.7rem', color: '#8a7a5a', display: 'block', marginBottom: 4 }}>Start Date (First Night)</label>
                  <input
                    type="date"
                    value={priceStart}
                    min={todayStr}
                    onChange={e => { setPriceStart(e.target.value); setPriceError(null); setPriceSuccess(null) }}
                    style={inputStyle}
                  />

                  <label style={{ fontSize: '0.7rem', color: '#8a7a5a', display: 'block', marginBottom: 4 }}>End Date (Check-out Date)</label>
                  <input
                    type="date"
                    value={priceEnd}
                    min={priceStart || todayStr}
                    onChange={e => { setPriceEnd(e.target.value); setPriceError(null); setPriceSuccess(null) }}
                    style={inputStyle}
                  />

                  {priceStart && priceEnd && countNights(priceStart, priceEnd) > 0 && (
                    <div style={{
                      background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)',
                      borderRadius: 6, padding: '6px 10px', marginBottom: 10,
                      fontSize: '0.75rem', color: '#e9d5ff', display: 'flex', justifyContent: 'space-between',
                    }}>
                      <span>Selected duration:</span>
                      <strong>{countNights(priceStart, priceEnd)} night{countNights(priceStart, priceEnd) > 1 ? 's' : ''}</strong>
                    </div>
                  )}

                  <label style={{ fontSize: '0.7rem', color: '#8a7a5a', display: 'block', marginBottom: 4 }}>New Price Per Night (₹)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 12000"
                    value={priceRate}
                    onChange={e => { setPriceRate(e.target.value); setPriceError(null) }}
                    style={inputStyle}
                  />

                  <label style={{ fontSize: '0.7rem', color: '#8a7a5a', display: 'block', marginBottom: 4 }}>Label / Reason (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Diwali, Peak Season, Weekend…"
                    value={priceLabel}
                    maxLength={100}
                    onChange={e => setPriceLabel(e.target.value)}
                    style={inputStyle}
                  />

                  <button
                    onClick={handleCreatePriceOverride}
                    disabled={priceSaving || !priceStart || !priceEnd || !priceRate}
                    style={{
                      width: '100%',
                      background: (priceSaving || !priceStart || !priceEnd || !priceRate) ? '#2e2618' : 'linear-gradient(135deg, #a855f7, #7c3aed)',
                      color: (priceSaving || !priceStart || !priceEnd || !priceRate) ? '#6b5e3e' : '#ffffff',
                      border: 'none', borderRadius: 8, padding: '10px',
                      fontSize: '0.82rem', fontWeight: 700,
                      cursor: (priceSaving || !priceStart || !priceEnd || !priceRate) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s', marginTop: 2,
                    }}
                  >
                    {priceSaving ? 'Applying Price…' : 'Apply Price for Period'}
                  </button>

                  <p style={{ fontSize: '0.68rem', color: '#5a5040', marginTop: 8, lineHeight: 1.5 }}>
                    <strong>Tip:</strong> Click any start date on the calendar, then click an end date — choose 5 days, 5 weeks, or 5 months easily!
                  </p>
                </div>

                {/* Active price overrides list */}
                <div style={{ padding: 20, flex: 1 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                    Active Price Overrides{activeOverrides.length > 0 ? ` (${activeOverrides.length})` : ''}
                  </div>

                  {activeOverrides.length === 0 ? (
                    <p style={{ fontSize: '0.75rem', color: '#5a5040', lineHeight: 1.5 }}>
                      No custom price overrides set for this property. Base nightly rate applies to all dates.
                    </p>
                  ) : activeOverrides.map(ov => {
                    const nights = countNights(ov.start_date, ov.end_date)
                    return (
                      <div key={ov.id} style={{
                        background: '#1a1611', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: 8,
                        padding: '10px 12px', marginBottom: 8,
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.82rem', color: '#c084fc', fontWeight: 700 }}>
                            ₹{ov.price_per_night.toLocaleString('en-IN')} <span style={{ fontSize: '0.7rem', color: '#8a7a5a', fontWeight: 400 }}>/ night</span>
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#e8d5a3', marginTop: 2 }}>
                            {ov.start_date} → {ov.end_date}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#8a7a5a', marginTop: 2 }}>
                            {nights} night{nights > 1 ? 's' : ''}{ov.label ? ` · ${ov.label}` : ''}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeletePriceOverride(ov.id)}
                          aria-label="Remove price override"
                          style={{
                            background: 'none', border: '1px solid #7a2020', color: '#e57373',
                            borderRadius: 6, padding: '4px 8px', fontSize: '0.7rem',
                            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.15s',
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Tab 2: Discount Coupon */}
            {activeTab === 'discount' && (
              <>
                <div style={{ padding: 20, borderBottom: '1px solid #1f1a10' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Percent size={13} /> Apply Discount Coupon / Offer
                  </div>

                  {discountError && (
                    <div style={{ background: '#2a0a0a', border: '1px solid #7a2020', color: '#e57373', borderRadius: 8, padding: '8px 10px', fontSize: '0.75rem', marginBottom: 10, lineHeight: 1.4 }}>
                      {discountError}
                    </div>
                  )}
                  {discountSuccess && (
                    <div style={{ background: '#0a2a0a', border: '1px solid #2a5a2a', color: '#81c784', borderRadius: 8, padding: '8px 10px', fontSize: '0.75rem', marginBottom: 10 }}>
                      {discountSuccess}
                    </div>
                  )}

                  <label style={{ fontSize: '0.7rem', color: '#8a7a5a', display: 'block', marginBottom: 4 }}>Start Date (First Night)</label>
                  <input
                    type="date"
                    value={discountStart}
                    min={todayStr}
                    onChange={e => { setDiscountStart(e.target.value); setDiscountError(null); setDiscountSuccess(null) }}
                    style={inputStyle}
                  />

                  <label style={{ fontSize: '0.7rem', color: '#8a7a5a', display: 'block', marginBottom: 4 }}>End Date (Check-out Date)</label>
                  <input
                    type="date"
                    value={discountEnd}
                    min={discountStart || todayStr}
                    onChange={e => { setDiscountEnd(e.target.value); setDiscountError(null); setDiscountSuccess(null) }}
                    style={inputStyle}
                  />

                  {discountStart && discountEnd && countNights(discountStart, discountEnd) > 0 && (
                    <div style={{
                      background: 'rgba(74, 222, 128, 0.12)', border: '1px solid rgba(74, 222, 128, 0.3)',
                      borderRadius: 6, padding: '6px 10px', marginBottom: 10,
                      fontSize: '0.75rem', color: '#86efac', display: 'flex', justifyContent: 'space-between',
                    }}>
                      <span>Selected duration:</span>
                      <strong>{countNights(discountStart, discountEnd)} night{countNights(discountStart, discountEnd) > 1 ? 's' : ''}</strong>
                    </div>
                  )}

                  <label style={{ fontSize: '0.7rem', color: '#8a7a5a', display: 'block', marginBottom: 4 }}>Discount Percentage (%)</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {[10, 15, 20, 25, 30, 50].map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => { setDiscountPercent(String(p)); setDiscountError(null) }}
                        style={{
                          padding: '4px 9px',
                          borderRadius: 6,
                          border: discountPercent === String(p) ? '1.5px solid #4ade80' : '1px solid #3d3425',
                          background: discountPercent === String(p) ? 'rgba(74, 222, 128, 0.2)' : '#1a1611',
                          color: discountPercent === String(p) ? '#86efac' : '#8a7a5a',
                          fontSize: '0.72rem',
                          fontWeight: discountPercent === String(p) ? 700 : 500,
                          cursor: 'pointer',
                        }}
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    placeholder="Enter discount % (e.g. 15)"
                    value={discountPercent}
                    onChange={e => { setDiscountPercent(e.target.value); setDiscountError(null) }}
                    style={inputStyle}
                  />

                  <label style={{ fontSize: '0.7rem', color: '#8a7a5a', display: 'block', marginBottom: 4 }}>Offer Title / Coupon Name (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Monsoon Special, Weekend Deal…"
                    value={discountLabel}
                    maxLength={100}
                    onChange={e => setDiscountLabel(e.target.value)}
                    style={inputStyle}
                  />

                  <button
                    onClick={handleCreateDiscount}
                    disabled={discountSaving || !discountStart || !discountEnd || !discountPercent}
                    style={{
                      width: '100%',
                      background: (discountSaving || !discountStart || !discountEnd || !discountPercent) ? '#2e2618' : 'linear-gradient(135deg, #16a34a, #15803d)',
                      color: (discountSaving || !discountStart || !discountEnd || !discountPercent) ? '#6b5e3e' : '#ffffff',
                      border: 'none', borderRadius: 8, padding: '10px',
                      fontSize: '0.82rem', fontWeight: 700,
                      cursor: (discountSaving || !discountStart || !discountEnd || !discountPercent) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s', marginTop: 2,
                    }}
                  >
                    {discountSaving ? 'Applying Discount…' : `Apply ${discountPercent || 0}% Discount`}
                  </button>

                  <p style={{ fontSize: '0.68rem', color: '#5a5040', marginTop: 8, lineHeight: 1.5 }}>
                    <strong>Tip:</strong> Guests booking these dates will automatically receive {discountPercent || 0}% off each night, clearly displayed as a discount coupon on the property details and checkout!
                  </p>
                </div>

                {/* Active discount offers list */}
                <div style={{ padding: 20, flex: 1 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                    Active Discount Coupons ({activeOverrides.filter(ov => ov.discount_percent).length})
                  </div>

                  {activeOverrides.filter(ov => ov.discount_percent).length === 0 ? (
                    <p style={{ fontSize: '0.75rem', color: '#5a5040', lineHeight: 1.5 }}>
                      No active discount coupons set. Select dates and a discount percentage above to offer a seasonal coupon.
                    </p>
                  ) : activeOverrides.filter(ov => ov.discount_percent).map(ov => {
                    const nights = countNights(ov.start_date, ov.end_date)
                    return (
                      <div key={ov.id} style={{
                        background: '#1a1611', border: '1px solid rgba(74, 222, 128, 0.3)', borderRadius: 8,
                        padding: '10px 12px', marginBottom: 8,
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: '0.82rem', color: '#4ade80', fontWeight: 800 }}>
                              {ov.discount_percent}% OFF
                            </span>
                            <span style={{ fontSize: '0.74rem', color: '#e8d5a3' }}>
                              (₹{ov.price_per_night.toLocaleString('en-IN')}/nt)
                            </span>
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#e8d5a3', marginTop: 2 }}>
                            {ov.start_date} → {ov.end_date}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#8a7a5a', marginTop: 2 }}>
                            {nights} night{nights > 1 ? 's' : ''}{ov.label ? ` · ${ov.label}` : ''}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeletePriceOverride(ov.id)}
                          aria-label="Remove discount coupon"
                          style={{
                            background: 'none', border: '1px solid #7a2020', color: '#e57373',
                            borderRadius: 6, padding: '4px 8px', fontSize: '0.7rem',
                            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.15s',
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Tab 3: Block Dates */}
            {activeTab === 'block' && (
              <>
                <div style={{ padding: 20, borderBottom: '1px solid #1f1a10' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8a7a5a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                    Block Dates
                  </div>

                  {blockError && (
                    <div style={{ background: '#2a0a0a', border: '1px solid #7a2020', color: '#e57373', borderRadius: 8, padding: '8px 10px', fontSize: '0.75rem', marginBottom: 10, lineHeight: 1.4 }}>
                      {blockError}
                    </div>
                  )}
                  {blockSuccess && (
                    <div style={{ background: '#0a2a0a', border: '1px solid #2a5a2a', color: '#81c784', borderRadius: 8, padding: '8px 10px', fontSize: '0.75rem', marginBottom: 10 }}>
                      {blockSuccess}
                    </div>
                  )}

                  <label style={{ fontSize: '0.7rem', color: '#8a7a5a', display: 'block', marginBottom: 4 }}>Check-in</label>
                  <input
                    type="date"
                    value={blockStart}
                    min={todayStr}
                    onChange={e => { setBlockStart(e.target.value); setBlockError(null); setBlockSuccess(null) }}
                    style={inputStyle}
                  />

                  <label style={{ fontSize: '0.7rem', color: '#8a7a5a', display: 'block', marginBottom: 4 }}>Check-out</label>
                  <input
                    type="date"
                    value={blockEnd}
                    min={blockStart || todayStr}
                    onChange={e => { setBlockEnd(e.target.value); setBlockError(null); setBlockSuccess(null) }}
                    style={inputStyle}
                  />

                  <label style={{ fontSize: '0.7rem', color: '#8a7a5a', display: 'block', marginBottom: 4 }}>Reason (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Maintenance, Owner stay…"
                    value={blockNote}
                    maxLength={200}
                    onChange={e => setBlockNote(e.target.value)}
                    style={inputStyle}
                  />

                  <button
                    onClick={handleCreateBlock}
                    disabled={blocking || !blockStart || !blockEnd}
                    style={{
                      width: '100%',
                      background: (blocking || !blockStart || !blockEnd) ? '#2e2618' : 'linear-gradient(135deg,#c9a84c,#a07c30)',
                      color: (blocking || !blockStart || !blockEnd) ? '#6b5e3e' : '#0d0b07',
                      border: 'none', borderRadius: 8, padding: '10px',
                      fontSize: '0.82rem', fontWeight: 700,
                      cursor: (blocking || !blockStart || !blockEnd) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s', marginTop: 2,
                    }}
                  >
                    {blocking ? 'Blocking…' : 'Block Dates'}
                  </button>

                  <p style={{ fontSize: '0.68rem', color: '#5a5040', marginTop: 8, lineHeight: 1.5 }}>
                    Click two calendar days to pick a range, or use the date pickers above.
                    Blocks cannot overlap guest bookings.
                  </p>
                </div>

                {/* Active blocks */}
                <div style={{ padding: 20, flex: 1 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8a7a5a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                    Active Blocks{adminBlocks.length > 0 ? ` (${adminBlocks.length})` : ''}
                  </div>

                  {adminBlocks.length === 0 ? (
                    <p style={{ fontSize: '0.75rem', color: '#5a5040', lineHeight: 1.5 }}>
                      No admin blocks in the current view period.
                    </p>
                  ) : adminBlocks.map(block => (
                    <div key={block.id} style={{
                      background: '#1a1611', border: '1px solid #2e2618', borderRadius: 8,
                      padding: '10px 12px', marginBottom: 8,
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.77rem', color: '#c4a96d', fontWeight: 600 }}>
                          {block.check_in} → {block.check_out}
                        </div>
                        {block.note && (
                          <div style={{ fontSize: '0.7rem', color: '#7a6a4a', marginTop: 2, wordBreak: 'break-word' }}>
                            {block.note}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleUnblock(block)}
                        aria-label={`Unblock ${block.check_in} to ${block.check_out}`}
                        style={{
                          background: 'none', border: '1px solid #7a2020', color: '#e57373',
                          borderRadius: 6, padding: '4px 8px', fontSize: '0.7rem',
                          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.15s',
                        }}
                      >
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
