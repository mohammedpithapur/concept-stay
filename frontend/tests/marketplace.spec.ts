import { test, expect } from '@playwright/test'
import type { Route } from '@playwright/test'

// Only API (fetch/xhr) calls are mocked: some API paths (e.g. /host/properties) equal page URLs.
const json = (body: unknown) => (route: Route) =>
  route.request().resourceType() === 'document'
    ? route.continue()
    : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

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

  test('modal shows when profile incomplete', async ({ page }) => {
    await page.route('**/host/dashboard', json(dash))
    await page.route('**/host/profile/completeness', json({ complete: false, missing: ['pan_number'], kyc_status: 'incomplete' }))
    await page.goto('/host')
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Your profile is not completed yet.')).toBeVisible()
    await page.getByRole('button', { name: 'Later' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('modal hidden when complete', async ({ page }) => {
    await page.route('**/host/dashboard', json(dash))
    await page.route('**/host/profile/completeness', json({ complete: true, missing: [], kyc_status: 'submitted' }))
    await page.goto('/host')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
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
    await expect(page.getByRole('dialog')).toHaveCount(0) // the pop-up never covers the profile page itself
  })
})

test.describe('Admin marketplace tabs', () => {
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
