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

test.describe('Admin marketplace tabs', () => {
  test('review queue lists a pending edit with a diff', async ({ page }) => {
    await page.route('**/admin/dashboard', json({ total_bookings: 0, total_properties: 1, total_revenue: 0, pending_bookings: 0 }))
    await page.route('**/bookings/admin/all**', json({ items: [], total: 0, page: 1, limit: 15 }))
    await page.route('**/admin/review-queue', json([
      {
        id: 'p1', owner_id: 'host-1', name: 'Hill Homestay', city: 'Manali', state: 'Himachal', price_per_night: 4000,
        images: [], approval_status: 'approved', verification_status: 'unverified',
        pending_changes: { price_per_night: 5000 }, rejection_reason: null,
      },
    ]))
    await page.goto('/admin')
    await page.waitForLoadState('networkidle') // let React hydrate before clicking a tab
    await page.getByRole('button', { name: 'Listing Review' }).click()
    await expect(page.getByText('Hill Homestay')).toBeVisible()
    await expect(page.getByText('Edit to live listing')).toBeVisible()
    await expect(page.getByRole('cell', { name: '5000' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Approve/ })).toBeVisible()
  })
})
