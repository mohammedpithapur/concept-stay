import { test, expect } from '@playwright/test'
import type { Route } from '@playwright/test'

// Only API (fetch/xhr) calls are mocked: some API paths (e.g. /host/properties) equal page URLs.
const json = (body: unknown) => (route: Route) =>
  route.request().resourceType() === 'document'
    ? route.continue()
    : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

// Anything a test does not mock must never reach a real backend: a live API answers 401 to the fake admin token and logs it out.
test.beforeEach(async ({ page }) => {
  await page.route(/:8000\//, route => route.abort())
})

// The dev server for e2e runs with NEXT_PUBLIC_E2E_SKIP_AUTH=1, which signs in a fake admin.
// Admins may use the host area; "plain guest" redirects are covered by the backend 403 tests.

test.describe('Host area', () => {
  test('dashboard shows this month stats', async ({ page }) => {
    await page.route('**/host/dashboard', json({
      bookings_this_month: 3, revenue: 45000, occupancy_percent: 41.5, upcoming: [],
    }))
    await page.goto('/host')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText('₹45,000')).toBeVisible()
    await expect(page.getByText('41.5%')).toBeVisible()
    await expect(page.getByText('No upcoming bookings yet.')).toBeVisible()
  })

  test('listings page shows status chips and reviewer notes', async ({ page }) => {
    await page.route('**/host/properties', json([
      {
        id: 'p1', name: 'Rejected Cottage', city: 'Shillong', state: 'Meghalaya', property_type: 'cottage',
        price_per_night: 3000, images: [], approval_status: 'rejected', pending_changes: null,
        rejection_reason: 'Photos too dark', verification_status: 'unverified',
      },
    ]))
    await page.goto('/host/properties')
    await expect(page.getByText('Rejected Cottage')).toBeVisible()
    await expect(page.getByText('Rejected', { exact: true })).toBeVisible()
    await expect(page.getByText('Photos too dark')).toBeVisible()
  })

  test('payouts page totals what is owed', async ({ page }) => {
    await page.route('**/host/payouts', json([
      { id: 'a', booking_id: 'b1', host_id: 'h', gross_amount: 18350, commission: 2250, fees: 750, taxes: 1800,
        host_amount: 13550, status: 'owed', paid_at: null, reference: null, created_at: '2031-01-01T00:00:00' },
    ]))
    await page.goto('/host/payouts')
    await expect(page.getByText('₹13,550').first()).toBeVisible()
    await expect(page.getByText('Owed to you').first()).toBeVisible()
  })
})

test.describe('Host profile', () => {
  const dash = { bookings_this_month: 0, revenue: 0, occupancy_percent: 0, upcoming: [] }

  test('banner shows when profile incomplete', async ({ page }) => {
    await page.route('**/host/dashboard', json(dash))
    await page.route('**/host/profile/completeness', json({ complete: false, missing: ['pan_number'], kyc_status: 'incomplete' }))
    await page.goto('/host')
    await expect(page.getByRole('status').getByText('Your profile is not completed yet.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible() // the page stays usable under the banner
    await page.getByRole('link', { name: 'Complete profile' }).click()
    await expect(page).toHaveURL(/\/host\/profile/)
  })

  test('banner hidden when complete', async ({ page }) => {
    await page.route('**/host/dashboard', json(dash))
    await page.route('**/host/profile/completeness', json({ complete: true, missing: [], kyc_status: 'submitted' }))
    await page.goto('/host')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('status')).toHaveCount(0)
  })

  test('banner shows the KYC rejection reason on every host page', async ({ page }) => {
    await page.route('**/host/dashboard', json(dash))
    await page.route('**/host/profile/completeness', json({
      complete: true, missing: [], kyc_status: 'rejected', rejection_reason: 'PAN image is unreadable',
    }))
    await page.goto('/host')
    const banner = page.getByRole('status')
    await expect(banner.getByText('Your KYC was rejected')).toBeVisible()
    await expect(banner.getByText('PAN image is unreadable')).toBeVisible()
    await expect(banner.getByRole('link', { name: 'Complete profile' })).toBeVisible()
  })

  test('profile page shows masked PAN and lists documents', async ({ page }) => {
    await page.route('**/host/profile', json({
      legal_name: 'Asha Verma', phone: null, pan_masked: '******234F', aadhaar_last4: '4321', gst_number: null,
      bank_holder: 'Asha Verma', bank_account_masked: '********9012', bank_ifsc: 'HDFC0001234',
      kyc_status: 'submitted', rejection_reason: null, submitted_at: '2031-01-01T00:00:00', verified_at: null,
      documents: [{ id: 'd1', doc_type: 'pan', filename: 'pan.png', mime: 'image/png', size: 100, uploaded_at: '2031-01-01T00:00:00' }],
    }))
    await page.goto('/host/profile')
    await expect(page.getByText('On file: ******234F')).toBeVisible()
    await expect(page.getByText('On file: ********9012')).toBeVisible()
    await expect(page.getByText('pan.png')).toBeVisible()
    await expect(page.getByText('Submitted, awaiting verification')).toBeVisible()
    await expect(page.getByRole('status')).toHaveCount(0) // the banner is not repeated on the profile page itself
  })
  test('bookings page shows a pending ID with approve and report actions', async ({ page }) => {
    await page.route('**/host/profile/completeness', json({ complete: true, missing: [], kyc_status: 'verified' }))
    await page.route('**/host/bookings**', json({
      items: [{
        id: 'b1', property_id: 'p1', check_in: '2031-05-01', check_out: '2031-05-04', nights: 3, guests: 2, total: 18536,
        status: 'confirmed', payment_status: 'paid', booking_ref: 'CS-1234', guest_name: 'Rhea Shah',
        guest_email: 'rhea@example.com', guest_phone: null, guest_id_status: 'pending',
      }],
      total: 1, page: 1, limit: 20,
    }))
    await page.goto('/host/bookings')
    await expect(page.getByText('Rhea Shah')).toBeVisible()
    await expect(page.getByText('ID waiting for your review')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible()
    await page.getByRole('button', { name: 'Report to admin' }).click()
    await expect(page.getByPlaceholder('Why is this not legitimate?')).toBeVisible()
  })
})

test.describe('Admin marketplace tabs', () => {
  test('host KYC status filter loads the chosen status, not the first one', async ({ page }) => {
    await page.route('**/admin/dashboard', json({ total_bookings: 0, total_properties: 1, total_revenue: 0, pending_bookings: 0 }))
    await page.route('**/bookings/admin/all**', json({ items: [], total: 0, page: 1, limit: 15 }))
    await page.route('**/admin/kyc**', route => {
      if (route.request().resourceType() === 'document') return route.continue()
      const status = new URL(route.request().url()).searchParams.get('status')
      const rows = status === 'rejected'
        ? [{ user_id: 'u1', email: 'rej@example.com', full_name: 'Rejected Host', legal_name: 'Rejected Host', kyc_status: 'rejected', submitted_at: '2031-01-01T00:00:00' }]
        : []
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) })
    })
    await page.goto('/admin')
    await page.waitForLoadState('networkidle') // let React hydrate before clicking a tab
    await page.getByRole('button', { name: 'Host KYC' }).click()
    await expect(page.getByText('No host profiles in this view.')).toBeVisible()
    await page.getByLabel('Filter KYC').selectOption('rejected')
    await expect(page.getByText('rej@example.com')).toBeVisible()
  })

  test('review queue lists a new listing awaiting approval', async ({ page }) => {
    await page.route('**/admin/dashboard', json({ total_bookings: 0, total_properties: 1, total_revenue: 0, pending_bookings: 0 }))
    await page.route('**/bookings/admin/all**', json({ items: [], total: 0, page: 1, limit: 15 }))
    await page.route('**/admin/review-queue', json([
      {
        id: 'p1', owner_id: 'host-1', name: 'Hill Homestay', city: 'Manali', state: 'Himachal', price_per_night: 4000,
        images: [], approval_status: 'pending_review', verification_status: 'unverified',
        pending_changes: null, rejection_reason: null,
      },
    ]))
    await page.goto('/admin')
    await page.waitForLoadState('networkidle') // let React hydrate before clicking a tab
    await page.getByRole('button', { name: 'Listing Review' }).click()
    await expect(page.getByText('Hill Homestay')).toBeVisible()
    await expect(page.getByText('New listing', { exact: false }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Approve/ })).toBeVisible()
  })
  test('disputes tab lists an open report with refund and dismiss', async ({ page }) => {
    await page.route('**/admin/dashboard', json({ total_bookings: 0, total_properties: 1, total_revenue: 0, pending_bookings: 0 }))
    await page.route('**/bookings/admin/all**', json({ items: [], total: 0, page: 1, limit: 15 }))
    await page.route('**/admin/disputes**', json([{
      id: 'd1', booking_id: 'b1', booking_ref: 'CS-1234', property_name: 'Hill Homestay', guest_name: 'Rhea Shah',
      guest_email: 'rhea@example.com', host_name: 'Asha', total: 18536, reason: 'Name on ID does not match',
      status: 'open', admin_note: null, created_at: '2031-01-01T00:00:00', decided_at: null, guest_id_url: null,
    }]))
    await page.goto('/admin')
    await page.waitForLoadState('networkidle') // let React hydrate before clicking a tab
    await page.getByRole('button', { name: 'Disputes' }).click()
    await expect(page.getByText('Name on ID does not match')).toBeVisible()
    await expect(page.getByRole('button', { name: /Refund/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dismiss' })).toBeVisible()
  })
})

test.describe('Travel buddies', () => {
  const stats = { upcoming_bookings: 0, past_stays: 0, total_spent: 0, profile: {} }
  const empty = { items: [], total: 0, page: 1, limit: 50 }

  async function openTab(page: import('@playwright/test').Page, connections: unknown) {
    await page.route('**/users/dashboard', json(stats))
    await page.route('**/bookings/mine**', json(empty))
    await page.route('**/connections', json(connections))
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle') // let React hydrate before clicking a tab
    await page.getByRole('button', { name: /Travel buddies/ }).click()
  }

  test('visibility is off by default and explains what is shared', async ({ page }) => {
    await openTab(page, { incoming: [], outgoing: [], connected: [] })
    await expect(page.getByText('Hidden: turned off')).toBeVisible()
    await expect(page.getByText('Contact details are shared only after you accept a request.')).toBeVisible()
    await expect(page.getByText('No connections yet.')).toBeVisible()
  })

  test('connected guests show contact details', async ({ page }) => {
    await openTab(page, {
      incoming: [], outgoing: [],
      connected: [{ id: 'c1', user_id: 'u2', full_name: 'Bela Rao', email: 'bela@example.com', phone: '+919800000001', property_name: 'Lake Cottage' }],
    })
    await expect(page.getByText('Bela Rao')).toBeVisible()
    await expect(page.getByText('bela@example.com')).toBeVisible()
    await expect(page.getByText('+919800000001')).toBeVisible()
  })

  test('an incoming request can be accepted', async ({ page }) => {
    let accepted = false
    await page.route('**/connections/c9/accept', route => { accepted = true; return route.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"c9","status":"accepted","created_at":"2031-01-01T00:00:00"}' }) })
    await openTab(page, {
      incoming: [{ id: 'c9', user_id: 'u3', first_name: 'Chai', property_name: 'Lake Cottage', check_in: '2031-05-01', check_out: '2031-05-04', created_at: '2031-01-01T00:00:00' }],
      outgoing: [], connected: [],
    })
    await expect(page.getByText('Chai')).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'Chai' }).getByText(/@|91\d{8}/)).toHaveCount(0) // no contact details before acceptance
    await page.getByRole('button', { name: 'Accept' }).click()
    await expect.poll(() => accepted).toBe(true)
  })
})

test.describe('International checkout', () => {
  const property = {
    id: 'p1', name: 'Lake Cottage', city: 'Udaipur', state: 'Rajasthan', description: '', images: [], amenities: [],
    price_per_night: 5000, cleaning_fee: 800, pet_charge_per_night: 0, avg_rating: 4.5, review_count: 2, bedrooms: 2,
    bathrooms: 1, bathrooms_detail: [], pets_allowed: false, latitude: 24.58, longitude: 73.68, max_guests: 4,
    base_guests: 2, min_nights: 1, house_rules: [],
  }
  const quote = {
    nights: 3, base_price: 15000, extra_guest_charge: 0, cleaning_fee: 800, pet_charge: 0, taxes: 1986,
    service_fee: 750, total: 18536, nightly_rates: [],
  }
  const url = '/booking/p1?checkIn=2031-05-01&checkOut=2031-05-04&guests=2&pets=0&nights=3&total=18536'

  test.beforeEach(async ({ page }) => {
    await page.route('**/fx-rates', json({ base: 'INR', supported: ['INR', 'USD'], rates: { INR: 1, USD: 0.012 } }))
    await page.route('**/properties/p1', json(property))
    await page.route('**/properties/p1/quote**', route => {
      const usd = route.request().url().includes('currency=USD')
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(usd ? { ...quote, charged: { currency: 'USD', amount_minor: 22243 } } : quote),
      })
    })
  })

  test('choosing USD shows the charged amount on the booking page', async ({ page }) => {
    await page.goto(url)
    await expect(page.getByText('Includes all fees and taxes')).toBeVisible()
    await page.getByLabel('Currency').selectOption('USD')
    await expect(page.getByTestId('charged-line')).toContainText('Charged in USD: 222.43')
    await expect(page.getByTestId('charged-line')).toContainText('rate locked at payment')
  })

  test('INR shows no conversion line', async ({ page }) => {
    await page.goto(url)
    await expect(page.getByText('Includes all fees and taxes')).toBeVisible()
    await expect(page.getByTestId('charged-line')).toHaveCount(0)
  })
})

test.describe('Discovery', () => {
  const listing = {
    id: 'p1', name: 'Lake Cottage', city: 'Udaipur', state: 'Rajasthan', description: '', images: [], amenities: [],
    price_per_night: 60000, avg_rating: 4.5, review_count: 2, bedrooms: 2, bathrooms: 1, bathrooms_detail: [],
    pets_allowed: false, latitude: 24.58, longitude: 73.68, max_guests: 4,
  }

  test('top price stop means 50,000+ and keeps pricier stays; map toggle shows the map', async ({ page }) => {
    await page.route('**/properties?**', json({ items: [listing], total: 1, page: 1, limit: 200 }))
    await page.goto('/properties')
    await expect(page.getByText('Lake Cottage').first()).toBeVisible()
    await page.getByRole('button', { name: 'Map' }).click()
    await expect(page.getByTestId('properties-map')).toBeVisible()
    await page.getByRole('button', { name: 'List' }).click()
    await expect(page.getByTestId('properties-map')).toHaveCount(0)
    await expect(page.getByText('Lake Cottage').first()).toBeVisible() // ₹60,000 stay survives the default "₹50,000+" cap
    await page.getByRole('button', { name: /Filters/ }).click()
    await expect(page.getByText('₹50,000+').first()).toBeVisible()
  })
})
