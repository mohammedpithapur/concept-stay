import type { Property, PropertyImage, Review, Article } from "@/lib/types"

function getCleanApiBase(): string {
  const raw = (process.env.NEXT_PUBLIC_API_BASE || "").trim()
  if (!raw || raw.includes("npx") || raw.includes("plugin") || (!raw.startsWith("http://") && !raw.startsWith("https://"))) {
    return "https://3-6-235-122.sslip.io"
  }
  return raw.endsWith("/") ? raw.slice(0, -1) : raw
}

export const API_BASE = getCleanApiBase()

export type ApiFetcher = (url: string, options?: RequestInit) => Promise<Response>

export const buildApiUrl = (path: string) => {
  if (path.startsWith("http")) return path
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type SavePropertyOptions = {
  isEdit?: boolean
}

export type PropertyGroupMember = {
  id: string
  property_id: string
  is_whole_property: boolean
  property: Pick<Property, "id" | "name" | "city" | "state" | "is_published">
}

export type PropertyGroup = {
  id: string
  name: string
  created_at: string
  members: PropertyGroupMember[]
}

export type PropertyImageUpdatePayload = {
  is_primary?: boolean
  display_order?: number
  album_name?: string
}

export type CreateReviewPayload = {
  property_id: string
  guest_name: string
  rating: number
  comment?: string
  platform?: string
  created_at?: string
}

export type MonthlyStat = {
  month: string
  revenue: number
  bookings: number
  nights?: number
}

export type AnalyticsSummary = {
  total_revenue: number
  total_bookings: number
  total_nights: number
  avg_daily_rate: number
}

export type DailyStat = {
  date: string
  full_date: string
  revenue: number
  bookings: number
  nights: number
}

export type PropertyPerformance = {
  property_id: string
  name: string
  city: string
  state: string
  price_per_night: number
  total_revenue: number
  bookings_count: number
  nights_booked: number
  image_url?: string | null
}

export type AdminAnalyticsResponse = {
  summary: AnalyticsSummary
  daily_stats: DailyStat[]
  monthly_stats: MonthlyStat[]
  property_performance: PropertyPerformance[]
}

export type AdminDashboard = {
  total_bookings: number
  confirmed_bookings?: number
  completed_bookings?: number
  pending_bookings: number
  total_properties: number
  total_revenue: number
  monthly_stats?: MonthlyStat[]
}

export type AdminBooking = {
  id: string
  booking_ref: string
  property_id: string
  guest_id: string
  guest_name: string
  guest_email: string
  guest_phone: string
  check_in: string
  check_out: string
  guests: number
  pets: number
  nights: number
  base_price: number
  cleaning_fee: number
  pet_charge: number
  total: number
  status: string
  created_at: string
  is_shadow_block: boolean
  is_admin_block: boolean
  note: string | null
}

export type AdminBookingList = {
  items: AdminBooking[]
  total: number
  page: number
  limit: number
}

// ─── Payment & Settlement Types ───────────────────────────────────────────────

export type AdminPayment = {
  id: string
  booking_id: string
  booking_ref: string | null
  guest_name: string | null
  guest_email: string | null
  property_name: string | null
  razorpay_order_id: string
  razorpay_payment_id: string | null
  amount_rupees: number
  currency: string
  status: 'created' | 'paid' | 'failed' | 'refunded'
  created_at: string | null
}

export type AdminPaymentList = {
  items: AdminPayment[]
  total: number
  page: number
  limit: number
}

export type SettlementBatch = {
  settlement_id: string
  status: string
  amount_rupees: number
  fees_rupees: number
  tax_rupees: number
  utr: string | null
  settled_at: string | null
  transaction_count: number
}

export type AdminSettlementsResponse = {
  settlements: SettlementBatch[]
  total_settled_rupees: number
  count: number
  error?: string
}

export type PaymentSummary = {
  total_collected_rupees: number
  total_settled_rupees: number
  pending_with_razorpay_rupees: number
  total_refunded_rupees: number
  paid_transactions: number
  pending_payment_count: number
  settlement_batches: number
  razorpay_error: string | null
}

// ─── Calendar / Date Blocking ─────────────────────────────────────────────────

export type CalendarEventType = "guest_booking" | "admin_block" | "shadow_block"

export type CalendarEvent = {
  id: string
  type: CalendarEventType
  check_in: string   // "YYYY-MM-DD"
  check_out: string  // "YYYY-MM-DD"
  // guest_booking fields
  guest_name: string | null
  guest_email: string | null
  booking_ref: string | null
  total: number | null
  status: string | null
  payment_status: string | null
  // admin_block fields
  note: string | null
  // shadow_block fields
  parent_booking_ref: string | null
}

export type AdminBlockCreate = {
  check_in: string   // "YYYY-MM-DD"
  check_out: string  // "YYYY-MM-DD"
  note?: string | null
}

export type PriceOverride = {
  id: string
  property_id: string
  start_date: string  // "YYYY-MM-DD"
  end_date: string    // "YYYY-MM-DD"
  price_per_night: number
  discount_percent?: number | null
  label: string | null
  created_at: string
}

export type PriceOverrideCreate = {
  start_date: string  // "YYYY-MM-DD"
  end_date: string    // "YYYY-MM-DD"
  price_per_night?: number
  discount_percent?: number | null
  label?: string | null
}

export type CalendarData = {
  events: CalendarEvent[]
  price_overrides: PriceOverride[]
}


export type ListAdminBookingsParams = {
  search?: string
  status?: string
  page?: number
  limit?: number
}

export type ICalLink = {
  id: string
  property_id: string
  calendar_name: string
  ical_url: string
  direction: "import" | "export"
  last_synced: string | null
  created_at: string
}

export type ICalLinkCreate = {
  calendar_name: string
  ical_url: string
  direction: "import" | "export"
}

// ─── User dashboard types ─────────────────────────────────────────────────────

export type UserDashboard = {
  upcoming_bookings: number
  past_stays: number
  total_spent: number
  profile: {
    id: string
    email: string
    full_name: string
    phone: string | null
    role: string
  }
}

export type MyBooking = {
  id: string
  booking_ref: string
  property_id: string
  check_in: string
  check_out: string
  guests: number
  pets: number
  nights: number
  base_price: number
  cleaning_fee: number
  pet_charge: number
  extra_guest_charge?: number
  taxes?: number
  service_fee?: number
  refund_amount?: number
  guest_id_status?: "missing" | "pending" | "approved" | "rejected"
  total: number
  status: string
  payment_status: string
  guest_name: string
  guest_email: string
  guest_phone: string | null
  created_at: string
}

export type MyBookingList = {
  items: MyBooking[]
  total: number
  page: number
  limit: number
}

export type ListMyBookingsParams = {
  status?: string
  page?: number
  limit?: number
}

// ─── Payment types ─────────────────────────────────────────────────────────────

export type BookingCreate = {
  property_id: string
  check_in: string   // "YYYY-MM-DD"
  check_out: string  // "YYYY-MM-DD"
  guests: number
  pets: number
  guest_name?: string
  guest_email?: string
  guest_phone?: string
  note?: string
  currency?: string   // defaults to INR; the server locks the exchange rate when the booking is created
}

export type PaymentOrderOut = {
  payment_id: string
  razorpay_order_id: string
  amount: number   // paise
  currency: string
  key_id: string
}

export type PaymentVerifyIn = {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

export type PaymentOut = {
  id: string
  booking_id: string
  razorpay_order_id: string
  razorpay_payment_id: string | null
  amount: number
  currency: string
  status: string
  created_at: string
}

// ─── Properties ───────────────────────────────────────────────────────────────

export async function listAdminProperties(fetcher: ApiFetcher): Promise<Property[]> {
  const response = await fetcher(buildApiUrl("/admin/properties"))
  if (!response.ok) throw new Error(`Failed to load properties (${response.status})`)
  return response.json()
}

export async function saveProperty(
  property: Property,
  options: SavePropertyOptions = {},
  fetcher: ApiFetcher,
) {
  const isEdit = Boolean(options.isEdit)
  const endpoint = isEdit ? `/admin/properties/${property.id}` : "/admin/properties"
  const response = await fetcher(buildApiUrl(endpoint), {
    method: isEdit ? "PATCH" : "POST",
    body: JSON.stringify(property),
  })
  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    let errorMessage = `Failed to save property (${response.status})`
    if (errorText) {
      try {
        const parsed = JSON.parse(errorText)
        if (parsed.detail) {
          errorMessage = typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail)
        }
      } catch {
        errorMessage = errorText
      }
    }
    throw new Error(errorMessage)
  }
  return response.json() as Promise<Property>
}

export async function deleteAdminProperty(propertyId: string, fetcher: ApiFetcher): Promise<void> {
  const response = await fetcher(buildApiUrl(`/admin/properties/${propertyId}`), {
    method: "DELETE",
  })
  if (!response.ok) throw new Error(`Failed to delete property (${response.status})`)
}

export async function duplicateAdminProperty(propertyId: string, fetcher: ApiFetcher): Promise<Property> {
  const response = await fetcher(buildApiUrl(`/admin/properties/${propertyId}/duplicate`), {
    method: "POST",
  })
  if (!response.ok) throw new Error(`Failed to duplicate property (${response.status})`)
  return response.json()
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

export async function getAdminDashboard(fetcher: ApiFetcher): Promise<AdminDashboard> {
  const response = await fetcher(buildApiUrl("/admin/dashboard"))
  if (!response.ok) throw new Error(`Failed to load dashboard (${response.status})`)
  const data = await response.json()
  const stats = data?.stats || data || {}
  return {
    total_bookings: stats.total_bookings ?? data.total_bookings ?? 0,
    confirmed_bookings: stats.confirmed_bookings ?? data.confirmed_bookings ?? 0,
    completed_bookings: stats.completed_bookings ?? data.completed_bookings ?? 0,
    pending_bookings: stats.pending_bookings ?? data.pending_bookings ?? 0,
    total_properties: stats.total_properties ?? data.total_properties ?? 0,
    total_revenue: stats.total_revenue ?? data.total_revenue ?? 0,
    monthly_stats: data.monthly_revenue || data.monthly_stats || [],
  }
}

// ─── Admin Bookings ───────────────────────────────────────────────────────────

export async function listAdminBookings(
  params: ListAdminBookingsParams = {},
  fetcher: ApiFetcher,
): Promise<AdminBookingList> {
  const qs = new URLSearchParams()
  if (params.search) qs.set("search", params.search)
  if (params.status) qs.set("status", params.status)
  if (params.page) qs.set("page", String(params.page))
  if (params.limit) qs.set("limit", String(params.limit))
  const response = await fetcher(buildApiUrl(`/bookings/admin/all?${qs.toString()}`))
  if (!response.ok) throw new Error(`Failed to load bookings (${response.status})`)
  return response.json()
}

export async function updateAdminBookingStatus(
  bookingId: string,
  status: string,
  fetcher: ApiFetcher,
): Promise<AdminBooking> {
  const response = await fetcher(buildApiUrl(`/bookings/admin/${bookingId}`), {
    method: "PATCH",
    body: JSON.stringify({ status }),
  })
  if (!response.ok) throw new Error(`Failed to update booking (${response.status})`)
  return response.json()
}

// ─── Property Images ──────────────────────────────────────────────────────────

export async function updateAdminPropertyImage(
  imageId: string,
  data: PropertyImageUpdatePayload,
  fetcher: ApiFetcher,
): Promise<PropertyImage> {
  const response = await fetcher(buildApiUrl(`/admin/images/${imageId}`), {
    method: "PATCH",
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error(`Failed to update property image (${response.status})`)
  return response.json()
}

export async function deleteAdminPropertyImage(imageId: string, fetcher: ApiFetcher): Promise<void> {
  const response = await fetcher(buildApiUrl(`/admin/images/${imageId}`), { method: "DELETE" })
  if (!response.ok) throw new Error(`Failed to delete property image (${response.status})`)
}

// ─── Property Groups ──────────────────────────────────────────────────────────

export async function listPropertyGroups(fetcher: ApiFetcher): Promise<PropertyGroup[]> {
  const response = await fetcher(buildApiUrl("/admin/groups"))
  if (!response.ok) throw new Error(`Failed to load property groups (${response.status})`)
  return response.json()
}

export async function createPropertyGroup(name: string, fetcher: ApiFetcher): Promise<PropertyGroup> {
  const response = await fetcher(buildApiUrl("/admin/groups"), {
    method: "POST",
    body: JSON.stringify({ name }),
  })
  if (!response.ok) throw new Error(`Failed to create group (${response.status})`)
  return response.json()
}

export async function addPropertyGroupMember(
  groupId: string,
  propertyId: string,
  isWholeProperty: boolean,
  fetcher: ApiFetcher,
): Promise<PropertyGroup> {
  const response = await fetcher(buildApiUrl(`/admin/groups/${groupId}/members`), {
    method: "POST",
    body: JSON.stringify({ property_id: propertyId, is_whole_property: isWholeProperty }),
  })
  if (!response.ok) throw new Error(`Failed to add group member (${response.status})`)
  return response.json()
}

export async function updatePropertyGroupMember(
  groupId: string,
  memberId: string,
  isWholeProperty: boolean,
  fetcher: ApiFetcher,
): Promise<PropertyGroup> {
  const response = await fetcher(buildApiUrl(`/admin/groups/${groupId}/members/${memberId}`), {
    method: "PATCH",
    body: JSON.stringify({ is_whole_property: isWholeProperty }),
  })
  if (!response.ok) throw new Error(`Failed to update group member (${response.status})`)
  return response.json()
}

export async function removePropertyGroupMember(
  groupId: string,
  memberId: string,
  fetcher: ApiFetcher,
): Promise<PropertyGroup> {
  const response = await fetcher(buildApiUrl(`/admin/groups/${groupId}/members/${memberId}`), {
    method: "DELETE",
  })
  if (!response.ok) throw new Error(`Failed to remove group member (${response.status})`)
  return response.json()
}

export async function updatePropertyGroup(
  groupId: string,
  name: string,
  fetcher: ApiFetcher,
): Promise<PropertyGroup> {
  const response = await fetcher(buildApiUrl(`/admin/groups/${groupId}`), {
    method: "PUT",
    body: JSON.stringify({ name }),
  })
  if (!response.ok) throw new Error(`Failed to update group (${response.status})`)
  return response.json()
}

export async function deletePropertyGroup(groupId: string, fetcher: ApiFetcher): Promise<void> {
  const response = await fetcher(buildApiUrl(`/admin/groups/${groupId}`), { method: "DELETE" })
  if (!response.ok) throw new Error(`Failed to delete group (${response.status})`)
}

// ─── Admin Calendar / Date Blocking ──────────────────────────────────────────

export async function getPropertyCalendar(
  propertyId: string,
  fromDate: string | null,
  toDate: string | null,
  fetcher: ApiFetcher,
): Promise<CalendarEvent[]> {
  const qs = new URLSearchParams()
  if (fromDate) qs.set("from_date", fromDate)
  if (toDate) qs.set("to_date", toDate)
  const query = qs.toString()
  const response = await fetcher(buildApiUrl(`/admin/properties/${propertyId}/calendar${query ? `?${query}` : ""}`))
  if (!response.ok) throw new Error(`Failed to load calendar (${response.status})`)
  const data = await response.json()
  return data.events as CalendarEvent[]
}

export async function createAdminBlock(
  propertyId: string,
  data: AdminBlockCreate,
  fetcher: ApiFetcher,
): Promise<CalendarEvent> {
  const response = await fetcher(buildApiUrl(`/admin/properties/${propertyId}/blocks`), {
    method: "POST",
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail || `Failed to create block (${response.status})`)
  }
  return response.json()
}

export async function deleteAdminBlock(
  propertyId: string,
  blockId: string,
  fetcher: ApiFetcher,
): Promise<void> {
  const response = await fetcher(buildApiUrl(`/admin/properties/${propertyId}/blocks/${blockId}`), {
    method: "DELETE",
  })
  if (!response.ok) throw new Error(`Failed to delete block (${response.status})`)
}

export async function getPropertyCalendarFull(
  propertyId: string,
  fromDate: string | null,
  toDate: string | null,
  fetcher: ApiFetcher,
): Promise<CalendarData> {
  const qs = new URLSearchParams()
  if (fromDate) qs.set("from_date", fromDate)
  if (toDate) qs.set("to_date", toDate)
  const query = qs.toString()
  const response = await fetcher(buildApiUrl(`/admin/properties/${propertyId}/calendar${query ? `?${query}` : ""}`))
  if (!response.ok) throw new Error(`Failed to load calendar (${response.status})`)
  const data = await response.json()
  return {
    events: (data.events || []) as CalendarEvent[],
    price_overrides: (data.price_overrides || []) as PriceOverride[],
  }
}

export async function createPriceOverride(
  propertyId: string,
  data: PriceOverrideCreate,
  fetcher: ApiFetcher,
): Promise<PriceOverride> {
  const response = await fetcher(buildApiUrl(`/admin/properties/${propertyId}/price-overrides`), {
    method: "POST",
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail || `Failed to set price override (${response.status})`)
  }
  return response.json()
}

export async function deletePriceOverride(
  propertyId: string,
  overrideId: string,
  fetcher: ApiFetcher,
): Promise<void> {
  const response = await fetcher(buildApiUrl(`/admin/properties/${propertyId}/price-overrides/${overrideId}`), {
    method: "DELETE",
  })
  if (!response.ok) throw new Error(`Failed to remove price override (${response.status})`)
}

export async function fetchPropertyPriceOverrides(propertyId: string): Promise<PriceOverride[]> {
  const response = await fetch(buildApiUrl(`/properties/${propertyId}/price-overrides`), { cache: "no-store" })
  if (!response.ok) return []
  return response.json()
}


// ─── Reviews ──────────────────────────────────────────────────────────────────

export async function fetchPropertyReviews(propertyId: string): Promise<Review[]> {
  const response = await fetch(buildApiUrl(`/properties/${propertyId}/reviews`))
  if (!response.ok) throw new Error(`Failed to fetch reviews (${response.status})`)
  return response.json()
}

export async function createAdminReview(
  data: CreateReviewPayload,
  fetcher: ApiFetcher,
): Promise<Review> {
  const response = await fetcher(buildApiUrl("/admin/reviews"), {
    method: "POST",
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error(`Failed to create review (${response.status})`)
  return response.json()
}

export async function deleteAdminReview(reviewId: string, fetcher: ApiFetcher): Promise<void> {
  const response = await fetcher(buildApiUrl(`/admin/reviews/${reviewId}`), { method: "DELETE" })
  if (!response.ok) throw new Error(`Failed to delete review (${response.status})`)
}

export async function updateAdminReview(
  reviewId: string,
  payload: { guest_name: string; rating: number; comment: string; platform: string },
  fetcher: ApiFetcher,
): Promise<Review> {
  const response = await fetcher(buildApiUrl(`/admin/reviews/${reviewId}`), {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`Failed to update review (${response.status})`)
  return response.json()
}

// ─── iCal ─────────────────────────────────────────────────────────────────────

export function getICalExportUrl(propertyId: string): string {
  return buildApiUrl(`/ical/export/${propertyId}`)
}

export async function listICalLinks(propertyId: string, fetcher: ApiFetcher): Promise<ICalLink[]> {
  const response = await fetcher(buildApiUrl(`/ical/properties/${propertyId}/links`))
  if (!response.ok) throw new Error(`Failed to load iCal links (${response.status})`)
  return response.json()
}

export async function createICalLink(
  propertyId: string,
  data: ICalLinkCreate,
  fetcher: ApiFetcher,
): Promise<ICalLink> {
  const response = await fetcher(buildApiUrl(`/ical/properties/${propertyId}/links`), {
    method: "POST",
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error(`Failed to save iCal link (${response.status})`)
  return response.json()
}

export async function deleteICalLink(linkId: string, fetcher: ApiFetcher): Promise<void> {
  const response = await fetcher(buildApiUrl(`/ical/links/${linkId}`), { method: "DELETE" })
  if (!response.ok) throw new Error(`Failed to delete iCal link (${response.status})`)
}

export async function syncPropertyICal(propertyId: string, fetcher: ApiFetcher): Promise<{ message: string; synced: Record<string, number> }> {
  const response = await fetcher(buildApiUrl(`/ical/properties/${propertyId}/sync`), {
    method: "POST",
  })
  if (!response.ok) throw new Error(`Failed to sync iCal calendars (${response.status})`)
  return response.json()
}

// ─── User Dashboard ───────────────────────────────────────────────────────────

export async function getUserDashboard(fetcher: ApiFetcher): Promise<UserDashboard> {
  const response = await fetcher(buildApiUrl("/users/dashboard"))
  if (!response.ok) throw new Error(`Failed to load dashboard (${response.status})`)
  return response.json()
}

export async function listMyBookings(
  params: ListMyBookingsParams,
  fetcher: ApiFetcher,
): Promise<MyBookingList> {
  const query = new URLSearchParams()
  if (params.status) query.set("status", params.status)
  if (params.page)   query.set("page",   String(params.page))
  if (params.limit)  query.set("limit",  String(params.limit))
  const qs = query.toString()
  const response = await fetcher(buildApiUrl(`/bookings/mine${qs ? `?${qs}` : ""}`)) 
  if (!response.ok) throw new Error(`Failed to load bookings (${response.status})`)
  return response.json()
}

export async function updateUserProfile(
  data: { full_name?: string; phone?: string },
  fetcher: ApiFetcher,
): Promise<{ id: string; email: string; full_name: string; phone: string | null; role: string }> {
  const response = await fetcher(buildApiUrl("/users/profile"), {
    method: "PATCH",
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error(`Failed to update profile (${response.status})`)
  return response.json()
}

export async function changeUserPassword(
  data: { old_password: string; new_password: string },
  fetcher: ApiFetcher,
): Promise<void> {
  const response = await fetcher(buildApiUrl("/users/password"), {
    method: "PATCH",
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail || `Failed to change password (${response.status})`)
  }
}

export async function getPublicProperty(propertyId: string): Promise<Property> {
  const response = await fetch(buildApiUrl(`/properties/${propertyId}`))
  if (!response.ok) throw new Error(`Property not found (${response.status})`)
  return response.json()
}

// ── Bookings ─────────────────────────────────────────────────────────────────────────────────

export async function createBooking(
  data: BookingCreate,
  fetcher: ApiFetcher,
): Promise<MyBooking> {
  const response = await fetcher(buildApiUrl('/bookings'), {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail || `Booking failed (${response.status})`)
  }
  return response.json()
}

// ── Payments ────────────────────────────────────────────────────────────────────────────────

export async function createPaymentOrder(
  bookingId: string,
  fetcher: ApiFetcher,
): Promise<PaymentOrderOut> {
  const response = await fetcher(buildApiUrl('/payments/create-order'), {
    method: 'POST',
    body: JSON.stringify({ booking_id: bookingId }),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail || `Failed to create payment order (${response.status})`)
  }
  return response.json()
}

export async function verifyPayment(
  data: PaymentVerifyIn,
  fetcher: ApiFetcher,
): Promise<MyBooking> {
  const response = await fetcher(buildApiUrl('/payments/verify'), {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail || `Payment verification failed (${response.status})`)
  }
  return response.json()
}

export async function triggerRefund(
  paymentId: string,
  fetcher: ApiFetcher,
): Promise<PaymentOut> {
  const response = await fetcher(buildApiUrl(`/payments/${paymentId}/refund`), {
    method: 'POST',
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail || `Refund failed (${response.status})`)
  }
  return response.json()
}

export async function getPaymentForBooking(
  bookingId: string,
  fetcher: ApiFetcher,
): Promise<PaymentOut> {
  const response = await fetcher(buildApiUrl(`/payments/booking/${bookingId}`))
  if (!response.ok) throw new Error(`Payment not found (${response.status})`)
  return response.json()
}

export async function updateAdminBookingWithRefund(
  bookingId: string,
  status: string,
  paymentId: string | undefined,
  fetcher: ApiFetcher,
): Promise<AdminBooking> {
  // If cancelling a paid booking, trigger refund first
  if (status === 'cancelled' && paymentId) {
    await triggerRefund(paymentId, fetcher).catch(() => {
      // Refund may fail if already refunded — continue with cancellation
    })
  }
  return updateAdminBookingStatus(bookingId, status, fetcher)
}

// ─── Events ───────────────────────────────────────────────────────────────────

export type EventStatus = 'pending' | 'contacted' | 'confirmed' | 'cancelled'

export type EventRequest = {
  id: string
  destination: string
  hotel: string
  nature_of_event: string
  event_start_date: string
  event_end_date: string
  no_of_guests: number
  requires_rooms: boolean
  no_of_rooms: number | null
  additional_details: string | null
  name: string
  phone: string
  email: string
  status: EventStatus
  created_at: string
}

export type EventRequestCreate = {
  destination: string
  hotel: string
  nature_of_event: string
  event_start_date: string
  event_end_date: string
  no_of_guests: number
  requires_rooms: boolean
  no_of_rooms?: number | null
  additional_details?: string | null
  name: string
  phone: string
  email: string
}

export async function createEventRequest(data: EventRequestCreate): Promise<EventRequest> {
  const response = await fetch(buildApiUrl('/events'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail || `Failed to submit request (${response.status})`)
  }
  return response.json()
}

export async function listAdminEvents(
  fetcher: ApiFetcher,
  status?: string,
  search?: string,
): Promise<EventRequest[]> {
  let url = '/events/admin/all'
  const params: string[] = []
  if (status) params.push(`status=${encodeURIComponent(status)}`)
  if (search) params.push(`search=${encodeURIComponent(search)}`)
  if (params.length > 0) {
    url += `?${params.join('&')}`
  }

  const response = await fetcher(buildApiUrl(url))
  if (!response.ok) throw new Error(`Failed to load event requests (${response.status})`)
  return response.json()
}

export async function updateAdminEventStatus(
  eventId: string,
  status: EventStatus,
  fetcher: ApiFetcher,
): Promise<EventRequest> {
  const response = await fetcher(buildApiUrl(`/events/admin/${eventId}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!response.ok) throw new Error(`Failed to update event status (${response.status})`)
  return response.json()
}

export async function getAdminAnalytics(
  fetcher: ApiFetcher,
): Promise<AdminAnalyticsResponse> {
  const response = await fetcher(buildApiUrl('/admin/analytics'))
  if (!response.ok) throw new Error(`Failed to load analytics (${response.status})`)
  return response.json()
}

// ─── Payments & Settlements API ───────────────────────────────────────────────

export async function getAdminPayments(
  fetcher: ApiFetcher,
  params?: { status?: string; search?: string; page?: number; limit?: number }
): Promise<AdminPaymentList> {
  const query = new URLSearchParams()
  if (params?.status) query.set('status', params.status)
  if (params?.search) query.set('search', params.search)
  if (params?.page) query.set('page', String(params.page))
  if (params?.limit) query.set('limit', String(params.limit))
  const url = buildApiUrl(`/payments/admin/all${query.toString() ? '?' + query.toString() : ''}`)
  const response = await fetcher(url)
  if (!response.ok) throw new Error(`Failed to load payments (${response.status})`)
  return response.json()
}

export async function getAdminSettlements(
  fetcher: ApiFetcher,
): Promise<AdminSettlementsResponse> {
  const response = await fetcher(buildApiUrl('/payments/admin/settlements'))
  if (!response.ok) throw new Error(`Failed to load settlements (${response.status})`)
  return response.json()
}

export async function getPaymentSummary(
  fetcher: ApiFetcher,
): Promise<PaymentSummary> {
  const response = await fetcher(buildApiUrl('/payments/admin/summary'))
  if (!response.ok) throw new Error(`Failed to load payment summary (${response.status})`)
  return response.json()
}

// ─── Articles ─────────────────────────────────────────────────────────────────

export type ArticleListResponse = {
  items: Article[]
  total: number
  page: number
  limit: number
}

export async function listPublicArticles(params?: { page?: number; limit?: number; search?: string; tag?: string }): Promise<ArticleListResponse> {
  const query = new URLSearchParams()
  if (params?.page) query.set('page', String(params.page))
  if (params?.limit) query.set('limit', String(params.limit))
  if (params?.search) query.set('search', params.search)
  if (params?.tag) query.set('tag', params.tag)
  const res = await fetch(buildApiUrl(`/articles${query.toString() ? '?' + query.toString() : ''}`), { next: { revalidate: 60 } })
  if (!res.ok) throw new Error('Failed to load articles')
  return res.json()
}

export async function getArticleBySlugOrId(slugOrId: string): Promise<Article> {
  const res = await fetch(buildApiUrl(`/articles/${slugOrId}`), { next: { revalidate: 60 } })
  if (!res.ok) throw new Error('Article not found')
  return res.json()
}

export async function listAdminArticles(fetcher: ApiFetcher, params?: { page?: number; limit?: number; search?: string }): Promise<ArticleListResponse> {
  const query = new URLSearchParams()
  if (params?.page) query.set('page', String(params.page))
  if (params?.limit) query.set('limit', String(params.limit))
  if (params?.search) query.set('search', params.search)
  const res = await fetcher(buildApiUrl(`/articles/admin/all${query.toString() ? '?' + query.toString() : ''}`))
  if (!res.ok) throw new Error('Failed to load admin articles')
  return res.json()
}

export async function createAdminArticle(fetcher: ApiFetcher, data: Partial<Article>): Promise<Article> {
  const res = await fetcher(buildApiUrl('/articles/admin'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to create article')
  }
  return res.json()
}

export async function updateAdminArticle(fetcher: ApiFetcher, articleId: string, data: Partial<Article>): Promise<Article> {
  const res = await fetcher(buildApiUrl(`/articles/admin/${articleId}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to update article')
  }
  return res.json()
}

export async function deleteAdminArticle(fetcher: ApiFetcher, articleId: string): Promise<void> {
  const res = await fetcher(buildApiUrl(`/articles/admin/${articleId}`), {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete article')
}