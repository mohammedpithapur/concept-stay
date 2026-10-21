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

export const REFUND_COPY = "Full refund if you cancel within 10 days of booking. After that, no refund."

export const REFUND_POLICY = { label: "10-day refund", summary: REFUND_COPY } as const

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
  /** What the gateway will charge, in minor units of `currency` (present when a currency was requested). */
  charged?: { currency: string; amount_minor: number }
}

export type FxRates = { base: "INR"; supported: string[]; rates: Record<string, number> }

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
  refund_amount: number
  total_paid: number
  refund_deadline: string
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
  host_kyc_status?: "incomplete" | "submitted" | "verified" | "rejected" | "exempt" | null
}

export type KycStatus = "incomplete" | "submitted" | "verified" | "rejected"
export type HostDocType = "aadhaar" | "passport" | "pan" | "gst_certificate" | "bank_proof"

export type HostDocument = { id: string; doc_type: HostDocType; filename: string; mime: string; size: number; uploaded_at: string }

export type HostProfile = {
  legal_name: string | null
  phone: string | null
  pan_masked: string | null
  aadhaar_last4: string | null
  gst_number: string | null
  bank_holder: string | null
  bank_account_masked: string | null
  bank_ifsc: string | null
  kyc_status: KycStatus
  rejection_reason: string | null
  submitted_at: string | null
  verified_at: string | null
  documents: HostDocument[]
}

export type ProfileCompleteness = { complete: boolean; missing: string[]; kyc_status: KycStatus }

export type KycListItem = {
  user_id: string; email: string; full_name: string; legal_name: string | null
  kyc_status: KycStatus; submitted_at: string | null
}

export type KycDetail = Omit<HostProfile, "documents"> & {
  user_id: string
  email: string
  pan_number: string | null
  bank_account_number: string | null
  documents: (HostDocument & { signed_url: string })[]
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
  guest_id_status?: GuestIdStatus
}

export type GuestIdStatus = "missing" | "pending" | "approved" | "rejected"
export type GuestIdDocType = "aadhaar" | "passport" | "driving_licence" | "voter_id"
export type GuestIdInfo = {
  status: GuestIdStatus
  doc_type: GuestIdDocType | null
  rejection_reason: string | null
  uploaded_at: string | null
  signed_url: string | null
}

export type Dispute = {
  id: string
  booking_id: string
  booking_ref: string
  property_name: string
  guest_name: string
  guest_email: string
  host_name: string
  total: number
  reason: string
  status: "open" | "refunded" | "dismissed"
  admin_note: string | null
  created_at: string
  decided_at: string | null
  guest_id_url: string | null
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
  p: { checkIn: string; checkOut: string; guests: number; pets: number; currency?: string },
): Promise<PriceQuote> {
  const q = new URLSearchParams({ check_in: p.checkIn, check_out: p.checkOut, guests: String(p.guests), pets: String(p.pets) })
  if (p.currency && p.currency !== "INR") q.set("currency", p.currency)
  return json(await fetch(buildApiUrl(`/properties/${propertyId}/quote?${q}`), { cache: "no-store" }), "Price quote")
}

export async function getFxRates(): Promise<FxRates> {
  return json(await fetch(buildApiUrl("/fx-rates"), { cache: "no-store" }), "Loading exchange rates")
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

// ─── Host profile (KYC) ───────────────────────────────────────────────────────

export const getHostProfile = async (fetcher: ApiFetcher): Promise<HostProfile> =>
  json(await fetcher(buildApiUrl("/host/profile")), "Loading profile")

export const saveHostProfile = async (data: Record<string, string>, fetcher: ApiFetcher): Promise<HostProfile> =>
  json(await fetcher(buildApiUrl("/host/profile"), { method: "PUT", body: JSON.stringify(data) }), "Saving profile")

export const uploadHostDocument = async (docType: HostDocType, file: File, fetcher: ApiFetcher): Promise<HostDocument> => {
  const body = new FormData()
  body.append("doc_type", docType)
  body.append("file", file)
  return json(await fetcher(buildApiUrl("/host/profile/documents"), { method: "POST", body }), "Uploading document")
}

export const deleteHostDocument = async (id: string, fetcher: ApiFetcher): Promise<void> => {
  const res = await fetcher(buildApiUrl(`/host/profile/documents/${id}`), { method: "DELETE" })
  if (!res.ok) await json(res, "Deleting document")
}

export const getProfileCompleteness = async (fetcher: ApiFetcher): Promise<ProfileCompleteness> =>
  json(await fetcher(buildApiUrl("/host/profile/completeness")), "Checking profile")

export const listKyc = async (status: KycStatus | undefined, fetcher: ApiFetcher): Promise<KycListItem[]> =>
  json(await fetcher(buildApiUrl(`/admin/kyc${status ? `?status=${status}` : ""}`)), "Loading KYC")

export const getKyc = async (userId: string, fetcher: ApiFetcher): Promise<KycDetail> =>
  json(await fetcher(buildApiUrl(`/admin/kyc/${userId}`)), "Loading KYC detail")

export const verifyKyc = async (userId: string, fetcher: ApiFetcher): Promise<HostProfile> =>
  json(await post(fetcher, `/admin/kyc/${userId}/verify`), "Verifying host")

export const rejectKyc = async (userId: string, reason: string, fetcher: ApiFetcher): Promise<HostProfile> =>
  json(await post(fetcher, `/admin/kyc/${userId}/reject`, { reason }), "Rejecting host")

// ─── Guest ID and disputes ────────────────────────────────────────────────────

export const getGuestId = async (bookingId: string, fetcher: ApiFetcher): Promise<GuestIdInfo> =>
  json(await fetcher(buildApiUrl(`/bookings/${bookingId}/guest-id`)), "Loading ID")

export const uploadGuestId = async (bookingId: string, docType: GuestIdDocType, file: File, fetcher: ApiFetcher): Promise<GuestIdInfo> => {
  const body = new FormData()
  body.append("doc_type", docType)
  body.append("file", file)
  return json(await fetcher(buildApiUrl(`/bookings/${bookingId}/guest-id`), { method: "POST", body }), "Uploading ID")
}

export const getHostGuestId = async (bookingId: string, fetcher: ApiFetcher): Promise<GuestIdInfo> =>
  json(await fetcher(buildApiUrl(`/host/bookings/${bookingId}/guest-id`)), "Loading ID")

export const approveGuestId = async (bookingId: string, fetcher: ApiFetcher): Promise<GuestIdInfo> =>
  json(await post(fetcher, `/host/bookings/${bookingId}/guest-id/approve`), "Approving ID")

export const rejectGuestId = async (bookingId: string, reason: string, fetcher: ApiFetcher): Promise<GuestIdInfo> =>
  json(await post(fetcher, `/host/bookings/${bookingId}/guest-id/reject`, { reason }), "Reporting booking")

export const listDisputes = async (status: Dispute["status"] | undefined, fetcher: ApiFetcher): Promise<Dispute[]> =>
  json(await fetcher(buildApiUrl(`/admin/disputes${status ? `?status=${status}` : ""}`)), "Loading disputes")

export const decideDispute = async (id: string, decision: "refund" | "dismiss", note: string, fetcher: ApiFetcher): Promise<Dispute> =>
  json(await post(fetcher, `/admin/disputes/${id}/decide`, { decision, note }), "Deciding dispute")

// ─── Travel buddies (join-in) ─────────────────────────────────────────────────

export type CoGuest = {
  user_id: string
  first_name: string
  check_in: string
  check_out: string
  connection_status: "none" | "pending_out" | "pending_in" | "accepted" | "declined" | "blocked"
}

export type PendingConnection = {
  id: string; user_id: string; first_name: string; property_name: string
  check_in: string; check_out: string; created_at: string
}

export type ConnectedGuest = {
  id: string; user_id: string; full_name: string; email: string; phone: string | null; property_name: string
}

export type ConnectionsData = { incoming: PendingConnection[]; outgoing: PendingConnection[]; connected: ConnectedGuest[] }

export const getCoGuests = async (bookingId: string, fetcher: ApiFetcher): Promise<CoGuest[]> =>
  json(await fetcher(buildApiUrl(`/bookings/${bookingId}/co-guests`)), "Loading travel buddies")

export const sendConnectionRequest = async (toUserId: string, bookingId: string, fetcher: ApiFetcher) =>
  json<{ id: string; status: string }>(await post(fetcher, "/connections", { to_user_id: toUserId, booking_id: bookingId }), "Sending request")

export const listConnections = async (fetcher: ApiFetcher): Promise<ConnectionsData> =>
  json(await fetcher(buildApiUrl("/connections")), "Loading connections")

export const respondConnection = async (id: string, action: "accept" | "decline" | "block", fetcher: ApiFetcher) =>
  json<{ id: string; status: string }>(await post(fetcher, `/connections/${id}/${action}`), "Updating request")

export const removeConnection = async (id: string, fetcher: ApiFetcher): Promise<void> => {
  const res = await fetcher(buildApiUrl(`/connections/${id}`), { method: "DELETE" })
  if (!res.ok) await json(res, "Removing connection")
}

export const setOpenToConnections = async (open: boolean, fetcher: ApiFetcher): Promise<{ open_to_connections: boolean }> =>
  json(await fetcher(buildApiUrl("/users/profile"), { method: "PATCH", body: JSON.stringify({ open_to_connections: open }) }), "Saving visibility")
