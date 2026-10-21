export type BathroomType = 'ensuite' | 'shared' | 'detached_private'

export interface BathroomDetail {
  type: BathroomType
  count: number
}

export type SpaceType = 'balcony' | 'terrace' | 'kitchen' | 'hall' | 'living_room' | 'dining_room' | 'entrance'
export type SpaceSharing = 'shared' | 'not_shared' | 'private'

export interface SpaceDetail {
  type: SpaceType
  count: number
  sharing: SpaceSharing
}

export interface PropertyImage {
  id: string
  property_id: string
  image_url: string
  is_primary: boolean
  display_order: number
  album_name?: string
}

export interface Property {
  id: string
  name: string
  description: string
  price_per_night: number
  cleaning_fee: number
  extra_guest_charge_per_night?: number
  base_guests?: number
  max_guests: number
  bedrooms: number
  bathrooms: number
  bathrooms_detail: BathroomDetail[]
  spaces_detail?: SpaceDetail[]
  city: string
  state: string
  country: string
  latitude: number
  longitude: number
  is_published: boolean
  is_featured?: boolean
  min_nights: number
  pets_allowed: boolean
  pet_charge_per_night: number
  max_pets?: number
  images: PropertyImage[]
  amenities: string[]
  avg_rating: number
  review_count: number
  created_at: string
  address: string        // full address
  contact_phone: string  // property contact call number
  contact_email: string  // property contact email
  contact_whatsapp?: string    // property contact whatsapp number
  contact_spare_phone?: string // property contact spare number (optional)
  booking_email_instructions?: string // custom email instructions sent to guest in booking confirmation email
  check_in_time: string  // e.g. "2:00 PM"
  check_out_time: string // e.g. "11:00 AM"
  house_rules: string[]  // list of rules
  local_recommendations?: string[] // list of local recommendations
  override_house_rules?: boolean
  override_amenities?: boolean
  override_details?: boolean
  updated_at?: string
  owner_id?: string
  // marketplace fields
  property_type?: string
  categories?: string[]
  experience_tags?: string[]
  number_of_rooms?: number
  about_stay?: string
  the_space?: string
  location_notes?: string
  what_guests_love?: string
  things_to_know?: string
  cancellation_policy?: 'flexible' | 'moderate' | 'non_refundable'
  approval_status?: string
  verification_status?: string
  verified_at?: string | null
}

export interface Booking {
  id: string
  property_id: string
  user_id: string
  guest_name: string
  guest_email: string
  guest_phone: string
  check_in: string
  check_out: string
  guests: number
  num_nights: number
  num_pets: number
  base_price: number
  cleaning_fee: number
  pet_charge: number
  total_price: number
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  payment_status: 'pending' | 'paid' | 'failed'
  razorpay_order_id: string
  special_requests: string
  created_at: string
  property?: Property
}

export interface Review {
  id: string
  property_id: string
  guest_id?: string | null
  booking_id?: string | null
  guest_name: string
  platform?: string | null
  rating: number
  comment?: string | null
  cleanliness?: number | null
  location?: number | null
  comfort?: number | null
  hospitality?: number | null
  accuracy?: number | null
  would_recommend?: boolean | null
  created_at: string
}

export interface User {
  id: string
  email: string
  full_name: string
  phone: string
  profile_photo: string
  role: 'guest' | 'host' | 'admin'
  host_status?: 'pending' | 'approved' | 'suspended'
  open_to_connections?: boolean
  created_at: string
}

export interface ICalLink {
  id: string
  property_id: string
  platform_name: string
  ical_url: string
  direction: 'import' | 'export'
  last_synced_at: string
  is_active: boolean
}

export interface Article {
  id: string
  title: string
  slug: string
  excerpt?: string | null
  content: string
  cover_image_url?: string | null
  author_name: string
  read_time_minutes: number
  tags: string[]
  is_published: boolean
  created_at: string
  updated_at: string
}