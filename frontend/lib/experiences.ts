import { buildApiUrl, type ApiFetcher } from "@/lib/api"

// ─── Taxonomy (mirrors backend/app/models/experience.py) ──────────────────────

export const EXPERIENCE_CATEGORIES = [
  { value: "adventure", label: "Adventure" },
  { value: "food", label: "Food" },
  { value: "culture", label: "Culture" },
  { value: "wellness", label: "Wellness" },
  { value: "nature", label: "Nature" },
  { value: "local_transport", label: "Local transport" },
  { value: "other", label: "Other" },
] as const

export const DIFFICULTIES = [
  { value: "easy", label: "Easy" },
  { value: "moderate", label: "Moderate" },
  { value: "hard", label: "Hard" },
] as const

export const MAX_PARTY_SIZE = 20

export const labelOf = (list: readonly { value: string; label: string }[], value?: string) =>
  list.find(item => item.value === value)?.label ?? value ?? ""

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApprovalStatus = "draft" | "pending_review" | "approved" | "rejected"

export type PublicSlot = { id: string; starts_at: string; capacity: number; seats_left: number }

export type PublicExperience = {
  id: string
  title: string
  description: string
  images: string[]
  city: string
  state: string
  category: string
  duration_minutes: number
  difficulty: string
  min_age: number
  languages: string[]
  included: string
  what_to_bring: string
  price_per_person: number
  avg_rating: number
  review_count: number
  next_slot_at: string | null
}

export type ExperienceDetail = PublicExperience & { slots: PublicSlot[] }

export type ExperienceList = { items: PublicExperience[]; total: number }

export type ExperienceQuote = {
  price_per_person: number
  party_size: number
  value: number
  service_fee: number
  taxes: number
  total: number
  charged: { currency: string; amount_minor: number }
}

export type ExperienceReview = { rating: number; text: string; guest_first_name: string; created_at: string }

export type ExperienceBookingStatus = "pending" | "confirmed" | "completed" | "failed_full" | "expired" | "refunded"

export type ExperienceBooking = {
  id: string
  experience_id: string
  slot_id: string
  experience_title: string
  starts_at: string
  party_size: number
  price_per_person: number
  value: number
  service_fee: number
  taxes: number
  total: number
  currency: string
  charged_minor: number
  status: ExperienceBookingStatus
  created_at: string
  voucher_code: string | null
  meeting_point: string | null
  operator_name: string | null
  operator_phone: string | null
  operator_email: string | null
}

export type ExperienceCheckout = {
  booking: ExperienceBooking
  razorpay_order_id: string
  amount: number
  currency: string
  key_id: string
}

export type OperatorExperience = Omit<PublicExperience, "next_slot_at"> & {
  operator_id: string
  meeting_point: string
  approval_status: ApprovalStatus
  pending_changes: Record<string, unknown> | null
  rejection_reason: string | null
  is_published: boolean
  created_at: string
}

export type ExperienceInput = {
  title: string
  description: string
  images: string[]
  city: string
  state: string
  meeting_point: string
  category: string
  duration_minutes: number
  difficulty: string
  min_age: number
  languages: string[]
  included: string
  what_to_bring: string
  price_per_person: number
}

export type OperatorSlot = {
  id: string
  experience_id: string
  starts_at: string
  capacity: number
  seats_booked: number
  seats_left: number
}

export type OperatorBooking = {
  id: string
  experience_title: string
  starts_at: string
  party_size: number
  voucher_code: string
  guest_first_name: string
  guest_phone: string | null
  status: ExperienceBookingStatus
}

export type ExperiencePayout = {
  id: string
  booking_id: string
  operator_id: string
  gross_amount: number
  commission: number
  fees: number
  taxes: number
  operator_amount: number
  status: "owed" | "paid" | "voided"
  paid_at: string | null
  reference: string | null
  created_at: string
  operator_kyc_status?: string | null
}

export type OperatorUser = {
  id: string
  email: string
  full_name: string
  role: string
  operator_status: "pending" | "approved" | "suspended"
  created_at: string
}

export type TravellerRow = {
  user_id: string
  full_name: string
  email: string
  stay_revenue: number
  experience_revenue: number
  total_revenue: number
}

export type TravellerReport = { total: number; items: TravellerRow[] }

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function json<T>(response: Response, what: string): Promise<T> {
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    const detail = (err as { detail?: unknown }).detail
    throw new Error(typeof detail === "string" ? detail : `${what} failed (${response.status})`)
  }
  return response.json()
}

const send = (fetcher: ApiFetcher, method: string, path: string, body?: unknown) =>
  fetcher(buildApiUrl(path), { method, body: body === undefined ? undefined : JSON.stringify(body) })

const query = (params: Record<string, string | number | undefined | null>) => {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") q.set(key, String(value))
  }
  const text = q.toString()
  return text ? `?${text}` : ""
}

export const formatStart = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata",
  }) + " IST"

export const formatDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ")
}

/** A date and time typed as India time, as an ISO string with the +05:30 offset the API expects. */
export const istToIso = (date: string, time: string) => `${date}T${time}:00+05:30`

// ─── Public ───────────────────────────────────────────────────────────────────

export type ExperienceFilters = {
  city?: string; state?: string; category?: string; date?: string; max_price?: number | string
  sort?: "newest" | "price_asc" | "price_desc"; limit?: number; offset?: number
}

export async function listExperiences(params: ExperienceFilters = {}): Promise<ExperienceList> {
  return json(await fetch(buildApiUrl(`/experiences${query(params)}`), { cache: "no-store" }), "Loading experiences")
}

export async function getExperience(id: string): Promise<ExperienceDetail> {
  return json(await fetch(buildApiUrl(`/experiences/${id}`), { cache: "no-store" }), "Loading experience")
}

export async function getExperienceReviews(id: string): Promise<ExperienceReview[]> {
  return json(await fetch(buildApiUrl(`/experiences/${id}/reviews`), { cache: "no-store" }), "Loading reviews")
}

export async function quoteExperience(
  id: string, body: { slot_id: string; party_size: number; currency?: string },
): Promise<ExperienceQuote> {
  return json(
    await fetch(buildApiUrl(`/experiences/${id}/quote`), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    "Price quote",
  )
}

// ─── Guest ────────────────────────────────────────────────────────────────────

export const bookExperience = async (
  body: { slot_id: string; party_size: number; currency?: string }, fetcher: ApiFetcher,
): Promise<ExperienceCheckout> => json(await send(fetcher, "POST", "/experience-bookings", body), "Booking")

export const verifyExperiencePayment = async (
  bookingId: string,
  body: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
  fetcher: ApiFetcher,
): Promise<ExperienceBooking> =>
  json(await send(fetcher, "POST", `/experience-bookings/${bookingId}/verify`, body), "Payment confirmation")

export const myExperienceBookings = async (fetcher: ApiFetcher): Promise<ExperienceBooking[]> =>
  json(await fetcher(buildApiUrl("/experience-bookings/mine")), "Loading your experiences")

export const getExperienceBooking = async (id: string, fetcher: ApiFetcher): Promise<ExperienceBooking> =>
  json(await fetcher(buildApiUrl(`/experience-bookings/${id}`)), "Loading booking")

export const reviewExperienceBooking = async (
  id: string, body: { rating: number; text: string }, fetcher: ApiFetcher,
): Promise<ExperienceReview> => json(await send(fetcher, "POST", `/experience-bookings/${id}/review`, body), "Review")

export const applyToBeOperator = async (fetcher: ApiFetcher): Promise<OperatorUser> =>
  json(await send(fetcher, "POST", "/auth/become-operator"), "Operator application")

// ─── Operator ─────────────────────────────────────────────────────────────────

export const listOperatorExperiences = async (fetcher: ApiFetcher): Promise<OperatorExperience[]> =>
  json(await fetcher(buildApiUrl("/operator/experiences")), "Loading experiences")

export const createExperience = async (data: ExperienceInput, fetcher: ApiFetcher): Promise<OperatorExperience> =>
  json(await send(fetcher, "POST", "/operator/experiences", data), "Creating experience")

export const updateExperience = async (id: string, data: Partial<ExperienceInput>, fetcher: ApiFetcher): Promise<OperatorExperience> =>
  json(await send(fetcher, "PATCH", `/operator/experiences/${id}`, data), "Saving experience")

export const unpublishExperience = async (id: string, fetcher: ApiFetcher): Promise<OperatorExperience> =>
  json(await send(fetcher, "POST", `/operator/experiences/${id}/unpublish`), "Unpublishing")

export const addSlot = async (id: string, body: { starts_at: string; capacity: number }, fetcher: ApiFetcher): Promise<OperatorSlot> =>
  json(await send(fetcher, "POST", `/operator/experiences/${id}/slots`, body), "Adding slot")

export const updateSlot = async (id: string, slotId: string, capacity: number, fetcher: ApiFetcher): Promise<OperatorSlot> =>
  json(await send(fetcher, "PATCH", `/operator/experiences/${id}/slots/${slotId}`, { capacity }), "Saving slot")

export async function deleteSlot(id: string, slotId: string, fetcher: ApiFetcher): Promise<void> {
  const res = await send(fetcher, "DELETE", `/operator/experiences/${id}/slots/${slotId}`)
  if (!res.ok) await json(res, "Deleting slot")
}

export const listOperatorBookings = async (fetcher: ApiFetcher): Promise<OperatorBooking[]> =>
  json(await fetcher(buildApiUrl("/operator/bookings")), "Loading bookings")

export const listOperatorPayouts = async (fetcher: ApiFetcher): Promise<ExperiencePayout[]> =>
  json(await fetcher(buildApiUrl("/operator/payouts")), "Loading payouts")

export async function uploadExperienceImage(file: File, fetcher: ApiFetcher): Promise<string> {
  const form = new FormData()
  form.append("file", file)
  const res = await fetcher(buildApiUrl("/operator/upload-image"), { method: "POST", body: form })
  const data = await json<{ url?: string; image_url?: string }>(res, "Uploading photo")
  const url = data.url ?? data.image_url
  if (!url) throw new Error("Upload did not return an image address")
  return url
}

// ─── Operator profile and KYC (same shape as the host profile) ────────────────

export const operatorProfilePaths = {
  profile: "/operator/profile",
  completeness: "/operator/profile/completeness",
  documents: "/operator/profile/documents",
} as const

// ─── Admin ────────────────────────────────────────────────────────────────────

export const listOperators = async (fetcher: ApiFetcher): Promise<OperatorUser[]> =>
  json(await fetcher(buildApiUrl("/admin/operators")), "Loading operators")

export const setOperatorStatus = async (id: string, operator_status: OperatorUser["operator_status"], fetcher: ApiFetcher): Promise<OperatorUser> =>
  json(await send(fetcher, "PATCH", `/admin/operators/${id}`, { operator_status }), "Saving operator")

export const listExperienceQueue = async (fetcher: ApiFetcher): Promise<OperatorExperience[]> =>
  json(await fetcher(buildApiUrl("/admin/experience-review-queue")), "Loading review queue")

export const approveExperience = async (id: string, fetcher: ApiFetcher): Promise<OperatorExperience> =>
  json(await send(fetcher, "POST", `/admin/experiences/${id}/approve`), "Approving")

export const rejectExperience = async (id: string, reason: string, fetcher: ApiFetcher): Promise<OperatorExperience> =>
  json(await send(fetcher, "POST", `/admin/experiences/${id}/reject`, { reason }), "Rejecting")

export const unpublishExperienceAdmin = async (id: string, fetcher: ApiFetcher): Promise<OperatorExperience> =>
  json(await send(fetcher, "POST", `/admin/experiences/${id}/unpublish`), "Unpublishing")

export const listExperiencePayouts = async (status: string | undefined, fetcher: ApiFetcher): Promise<ExperiencePayout[]> =>
  json(await fetcher(buildApiUrl(`/admin/experience-payouts${query({ status })}`)), "Loading payouts")

export const markExperiencePayoutPaid = async (id: string, reference: string, fetcher: ApiFetcher): Promise<ExperiencePayout> =>
  json(await send(fetcher, "POST", `/admin/experience-payouts/${id}/mark-paid`, { reference }), "Marking paid")

export const getCommission = async (fetcher: ApiFetcher): Promise<{ percent: number }> =>
  json(await fetcher(buildApiUrl("/admin/settings/experience-commission")), "Loading commission")

export const setCommission = async (percent: number, fetcher: ApiFetcher): Promise<{ percent: number }> =>
  json(await send(fetcher, "PUT", "/admin/settings/experience-commission", { percent }), "Saving commission")

export const getTravellerReport = async (
  params: { from?: string; to?: string; limit?: number; offset?: number }, fetcher: ApiFetcher,
): Promise<TravellerReport> => json(await fetcher(buildApiUrl(`/admin/traveller-report${query(params)}`)), "Loading report")

export const refundExperienceBooking = async (id: string, fetcher: ApiFetcher) =>
  json<{ booking_id: string; status: string; payout_needs_recovery: boolean }>(
    await send(fetcher, "POST", `/admin/experience-bookings/${id}/refund`), "Refund",
  )

export const listOperatorSlots = async (id: string, fetcher: ApiFetcher): Promise<OperatorSlot[]> =>
  json(await fetcher(buildApiUrl(`/operator/experiences/${id}/slots`)), "Loading slots")
