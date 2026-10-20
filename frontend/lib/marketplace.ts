import { Compass, Mountain, Waves, Wheat, House, Gem, TentTree, IndianRupee } from "lucide-react"
import { buildApiUrl, type ApiFetcher } from "@/lib/api"
import type { Property, Review } from "@/lib/types"

// ─── Taxonomy (mirrors backend/app/taxonomy.py) ───────────────────────────────

export const PROPERTY_TYPES = [
  { value: "homestay", label: "Homestay" },
  { value: "guesthouse", label: "Guesthouse" },
  { value: "villa", label: "Villa" },
  { value: "farm_stay", label: "Farm stay" },
  { value: "boutique_stay", label: "Boutique stay" },
  { value: "cottage", label: "Cottage" },
  { value: "hostel", label: "Hostel" },
] as const

export const CATEGORIES = [
  { value: "offbeat", label: "Offbeat Stays", icon: Compass },
  { value: "mountain", label: "Mountain Stays", icon: Mountain },
  { value: "lakeside", label: "Lakeside", icon: Waves },
  { value: "farm", label: "Farm Stays", icon: Wheat },
  { value: "homestay", label: "Homestays", icon: House },
  { value: "boutique", label: "Boutique", icon: Gem },
  { value: "nature", label: "Nature Stays", icon: TentTree },
  { value: "budget", label: "Budget Gems", icon: IndianRupee },
] as const

export const EXPERIENCE_TAGS = [
  { value: "romantic", label: "Romantic" },
  { value: "family", label: "Family" },
  { value: "solo", label: "Solo" },
  { value: "workation", label: "Workation" },
  { value: "adventure", label: "Adventure" },
  { value: "nature", label: "Nature" },
  { value: "wellness", label: "Wellness" },
  { value: "remote_offgrid", label: "Remote / off-grid" },
] as const

export const FILTER_AMENITIES = [
  "WiFi", "Parking", "Pool", "Kitchen", "AC", "Heating", "Pet friendly",
  "Breakfast", "Mountain view", "Lake view", "Garden", "Workspace",
] as const

export const CANCELLATION_POLICIES = {
  flexible: {
    label: "Flexible",
    summary: "Free cancellation until 5 days before check-in. After that, no refund.",
  },
  moderate: {
    label: "Moderate",
    summary: "Full refund until 14 days before check-in, 50% until 5 days before, then no refund.",
  },
  non_refundable: {
    label: "Non-refundable",
    summary: "This stay is non-refundable once booked.",
  },
} as const

export type CancellationPolicy = keyof typeof CANCELLATION_POLICIES

export const VERIFICATION_STATUSES = ["unverified", "pending", "verified", "rejected", "suspended"] as const
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]

export const labelFor = (list: readonly { value: string; label: string }[], value?: string) =>
  list.find(item => item.value === value)?.label ?? value ?? ""

// ─── Types ────────────────────────────────────────────────────────────────────

export type ListingApprovalStatus = "draft" | "pending_review" | "approved" | "rejected"

/** Property plus the host/admin-only review fields. */
export type HostProperty = Property & {
  approval_status: ListingApprovalStatus
  pending_changes: Record<string, unknown> | null
  rejection_reason: string | null
  verification_status: VerificationStatus
}

export type NightlyRate = {
  date: string
  price: number
  original_price: number
  is_override: boolean
  discount_percent: number | null
  label: string | null
}

export type PriceQuote = {
  nights: number
  base_price: number
  extra_guest_charge: number
  cleaning_fee: number
  pet_charge: number
  taxes: number
  service_fee: number
  total: number
  nightly_rates: NightlyRate[]
}

export type CategoryCount = { slug: string; label: string; count: number }
export type Destination = { state: string; city: string; count: number }

export type ReviewSummary = {
  count: number
  overall: number
  recommend_percent: number | null
  categories: Partial<Record<"cleanliness" | "location" | "comfort" | "hospitality" | "accuracy", number>>
}

export type VerifiedReviewInput = {
  cleanliness: number
  location: number
  comfort: number
  hospitality: number
  accuracy: number
  would_recommend: boolean
  comment?: string
}

export type CategoryReview = Review & {
  cleanliness?: number | null
  location?: number | null
  comfort?: number | null
  hospitality?: number | null
  accuracy?: number | null
  would_recommend?: boolean | null
}

export type RefundPreview = {
  can_cancel: boolean
  policy: CancellationPolicy
  refund_amount: number
  total_paid: number
}

export type Payout = {
  id: string
  booking_id: string
  host_id: string
  gross_amount: number
  commission: number
  fees: number
  taxes: number
  host_amount: number
  status: "owed" | "paid" | "voided"
  paid_at: string | null
  reference: string | null
  created_at: string
}

export type HostBooking = {
  id: string
  property_id: string
  check_in: string
  check_out: string
  nights: number
  guests: number
  total: number
  status: string
  payment_status: string
  booking_ref: string
  guest_name: string
  guest_email: string
  guest_phone: string | null
}

export type HostDashboard = {
  bookings_this_month: number
  revenue: number
  occupancy_percent: number
  upcoming: HostBooking[]
}

export type HostUser = {
  id: string
  email: string
  full_name: string
  phone: string | null
  role: string
  host_status: "pending" | "approved" | "suspended"
  created_at: string
}

export type CalendarEvent = {
  id: string
  type: "guest_booking" | "admin_block" | "shadow_block"
  check_in: string
  check_out: string
  guest_name?: string | null
  note?: string | null
  status?: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function json<T>(response: Response, what: string): Promise<T> {
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    const detail = (err as { detail?: unknown }).detail
    throw new Error(typeof detail === "string" ? detail : `${what} failed (${response.status})`)
  }
  return response.json()
}

const post = (fetcher: ApiFetcher, path: string, body?: unknown) =>
  fetcher(buildApiUrl(path), { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) })

// ─── Public discovery ─────────────────────────────────────────────────────────

export async function getCategories(): Promise<CategoryCount[]> {
  return json(await fetch(buildApiUrl("/properties/categories"), { cache: "no-store" }), "Loading categories")
}

export async function getDestinations(): Promise<Destination[]> {
  return json(await fetch(buildApiUrl("/properties/destinations"), { cache: "no-store" }), "Loading destinations")
}

export async function getPriceQuote(
  propertyId: string,
  p: { checkIn: string; checkOut: string; guests: number; pets: number },
): Promise<PriceQuote> {
  const q = new URLSearchParams({ check_in: p.checkIn, check_out: p.checkOut, guests: String(p.guests), pets: String(p.pets) })
  return json(await fetch(buildApiUrl(`/properties/${propertyId}/quote?${q}`), { cache: "no-store" }), "Price quote")
}

export async function getReviewSummary(propertyId: string): Promise<ReviewSummary> {
  return json(await fetch(buildApiUrl(`/properties/${propertyId}/review-summary`), { cache: "no-store" }), "Review summary")
}

// ─── Guest ────────────────────────────────────────────────────────────────────

export const applyToBeHost = async (fetcher: ApiFetcher): Promise<HostUser> =>
  json(await post(fetcher, "/auth/become-host"), "Host application")

export const getRefundPreview = async (bookingId: string, fetcher: ApiFetcher): Promise<RefundPreview> =>
  json(await fetcher(buildApiUrl(`/bookings/${bookingId}/refund-preview`)), "Refund preview")

export const cancelMyBooking = async (bookingId: string, fetcher: ApiFetcher) =>
  json<{ id: string; status: string; refund_amount: number }>(await post(fetcher, `/bookings/${bookingId}/cancel`), "Cancellation")

export const submitReview = async (bookingId: string, data: VerifiedReviewInput, fetcher: ApiFetcher) =>
  json<CategoryReview>(await post(fetcher, `/bookings/${bookingId}/review`, data), "Review")

// ─── Host ─────────────────────────────────────────────────────────────────────

export const getHostDashboard = async (fetcher: ApiFetcher): Promise<HostDashboard> =>
  json(await fetcher(buildApiUrl("/host/dashboard")), "Host dashboard")

export const listHostProperties = async (fetcher: ApiFetcher): Promise<HostProperty[]> =>
  json(await fetcher(buildApiUrl("/host/properties")), "Loading listings")

export const createHostProperty = async (data: Record<string, unknown>, fetcher: ApiFetcher): Promise<HostProperty> =>
  json(await post(fetcher, "/host/properties", data), "Creating listing")

export const updateHostProperty = async (id: string, data: Record<string, unknown>, fetcher: ApiFetcher): Promise<HostProperty> =>
  json(await fetcher(buildApiUrl(`/host/properties/${id}`), { method: "PATCH", body: JSON.stringify(data) }), "Saving listing")

export const listHostBookings = async (fetcher: ApiFetcher): Promise<{ items: HostBooking[]; total: number }> =>
  json(await fetcher(buildApiUrl("/host/bookings?limit=100")), "Loading bookings")

export const listHostPayouts = async (fetcher: ApiFetcher): Promise<Payout[]> =>
  json(await fetcher(buildApiUrl("/host/payouts")), "Loading payouts")

export const getHostCalendar = async (id: string, from: string, to: string, fetcher: ApiFetcher) =>
  json<{ events: CalendarEvent[] }>(
    await fetcher(buildApiUrl(`/host/properties/${id}/calendar?from_date=${from}&to_date=${to}`)),
    "Loading calendar",
  )

export const createHostBlock = async (id: string, data: { check_in: string; check_out: string; note?: string }, fetcher: ApiFetcher) =>
  json<CalendarEvent>(await post(fetcher, `/host/properties/${id}/blocks`, data), "Blocking dates")

export const deleteHostBlock = async (id: string, blockId: string, fetcher: ApiFetcher) =>
  json<{ message: string }>(
    await fetcher(buildApiUrl(`/host/properties/${id}/blocks/${blockId}`), { method: "DELETE" }),
    "Removing block",
  )

// ─── Admin ────────────────────────────────────────────────────────────────────

export const listReviewQueue = async (fetcher: ApiFetcher): Promise<HostProperty[]> =>
  json(await fetcher(buildApiUrl("/admin/review-queue")), "Review queue")

export const approveListing = async (id: string, fetcher: ApiFetcher): Promise<HostProperty> =>
  json(await post(fetcher, `/admin/properties/${id}/approve`), "Approving listing")

export const rejectListing = async (id: string, reason: string, fetcher: ApiFetcher): Promise<HostProperty> =>
  json(await post(fetcher, `/admin/properties/${id}/reject`, { reason }), "Rejecting listing")

export const setListingVerification = async (id: string, status: VerificationStatus, fetcher: ApiFetcher): Promise<HostProperty> =>
  json(
    await fetcher(buildApiUrl(`/admin/properties/${id}/verification`), { method: "PATCH", body: JSON.stringify({ status }) }),
    "Updating verification",
  )

export const listHosts = async (fetcher: ApiFetcher): Promise<HostUser[]> =>
  json(await fetcher(buildApiUrl("/admin/hosts")), "Loading hosts")

export const setHostStatus = async (id: string, host_status: HostUser["host_status"], fetcher: ApiFetcher): Promise<HostUser> =>
  json(await fetcher(buildApiUrl(`/admin/hosts/${id}`), { method: "PATCH", body: JSON.stringify({ host_status }) }), "Updating host")

export const listAdminPayouts = async (status: string | undefined, fetcher: ApiFetcher): Promise<Payout[]> =>
  json(await fetcher(buildApiUrl(`/admin/payouts${status ? `?status=${status}` : ""}`)), "Loading payouts")

export const markPayoutPaid = async (id: string, reference: string, fetcher: ApiFetcher): Promise<Payout> =>
  json(await post(fetcher, `/admin/payouts/${id}/mark-paid`, { reference }), "Marking payout paid")
