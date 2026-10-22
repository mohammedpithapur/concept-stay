import { test, expect } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

// Only API (fetch/xhr) calls are mocked: some API paths equal page URLs.
const respond = (body: unknown, status = 200) => (route: Route) =>
  route.request().resourceType() === 'document'
    ? route.continue()
    : route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

// Anything a test does not mock must never reach a real backend: a live API answers 401 to the fake admin and logs it out.
test.beforeEach(async ({ page }) => {
  await page.route(/:8000\//, route => route.abort())
  await page.route('**/admin/dashboard', respond({ total_bookings: 0, total_properties: 1, total_revenue: 0, pending_bookings: 0 }))
  await page.route('**/bookings/admin/all**', respond({ items: [], total: 0, page: 1, limit: 15 }))
})

async function openTab(page: Page, name: string) {
  await page.goto('/admin')
  await page.waitForLoadState('networkidle') // let React hydrate before clicking a tab
  await page.getByRole('button', { name, exact: true }).click()
}

const operator = (over: Record<string, unknown> = {}) => ({
  id: 'op1', email: 'trail@example.com', full_name: 'Trail Co', phone: null, role: 'operator', operator_status: 'pending',
  is_active: true, is_email_verified: true, created_at: '2031-01-01T00:00:00', ...over,
})

const experience = (over: Record<string, unknown> = {}) => ({
  id: 'e1', operator_id: 'op1', title: 'Sunrise trek', description: '', images: [], city: 'Munnar', state: 'Kerala', meeting_point: '',
  category: 'adventure', duration_minutes: 180, difficulty: 'easy', min_age: 0, languages: [], included: '', what_to_bring: '',
  price_per_person: 2500, avg_rating: 0, review_count: 0, approval_status: 'pending_review', pending_changes: null,
  rejection_reason: null, is_published: false, created_at: '2031-01-01T00:00:00', ...over,
})

const payout = (over: Record<string, unknown> = {}) => ({
  id: 'x1', booking_id: 'b1', operator_id: 'op1', gross_amount: 5880, commission: 750, fees: 250, taxes: 630, operator_amount: 4250,
  status: 'owed', paid_at: null, reference: null, created_at: '2031-01-01T00:00:00', operator_kyc_status: 'verified', ...over,
})

test.describe('Experiences admin', () => {
  test('a pending operator can be approved', async ({ page }) => {
    let patched: unknown = null
    await page.route('**/admin/operators', respond([operator()]))
    await page.route('**/admin/operators/op1', route => {
      patched = JSON.parse(route.request().postData() || '{}')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(operator({ operator_status: 'approved' })) })
    })
    await openTab(page, 'Operators')
    await expect(page.getByText('trail@example.com')).toBeVisible()
    await page.getByRole('button', { name: 'Approve' }).click()
    await expect.poll(() => patched).toEqual({ operator_status: 'approved' })
  })

  test('review queue shows the edit diff and rejection needs a reason', async ({ page }) => {
    let rejected: unknown = null
    await page.route('**/admin/experience-review-queue', respond([
      experience(),
      experience({ id: 'e2', title: 'Edited walk', approval_status: 'approved', is_published: true, pending_changes: { price_per_person: 3000 } }),
    ]))
    await page.route('**/admin/experiences/e1/reject', route => {
      rejected = JSON.parse(route.request().postData() || '{}')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(experience({ approval_status: 'rejected' })) })
    })
    await openTab(page, 'Experience Review')
    await expect(page.getByText('Sunrise trek')).toBeVisible()
    await expect(page.getByText('Edited walk')).toBeVisible()
    await expect(page.getByText('price_per_person')).toBeVisible() // the proposed change
    await page.getByRole('button', { name: 'Reject…' }).first().click()
    const send = page.getByRole('button', { name: 'Send rejection' })
    await expect(send).toBeDisabled()
    await page.getByPlaceholder('Reason shown to the operator').fill('Photos too dark')
    await expect(send).toBeEnabled()
    await send.click()
    await expect.poll(() => rejected).toEqual({ reason: 'Photos too dark' })
  })

  test('mark paid is disabled until the operator KYC is verified', async ({ page }) => {
    await page.route('**/admin/experience-payouts**', respond([
      payout({ id: 'x1', operator_kyc_status: 'incomplete' }),
      payout({ id: 'x2', operator_kyc_status: 'verified' }),
    ]))
    await openTab(page, 'Experience Payouts')
    const buttons = page.getByRole('button', { name: 'Mark paid' })
    await expect(buttons).toHaveCount(2)
    await page.getByPlaceholder('Bank reference').nth(0).fill('UTR1') // a reference alone does not unblock an unverified operator
    await expect(buttons.nth(0)).toBeDisabled()
    await expect(buttons.nth(1)).toBeDisabled() // verified, but no reference yet
    await page.getByPlaceholder('Bank reference').nth(1).fill('UTR2')
    await expect(buttons.nth(1)).toBeEnabled()
    await expect(page.getByText('KYC not verified')).toBeVisible()
  })

  test('a booking can be refunded after confirming', async ({ page }) => {
    let called = false
    await page.route('**/admin/experience-payouts**', respond([]))
    await page.route('**/admin/experience-bookings/b9/refund', route => {
      called = true
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ booking_id: 'b9', status: 'refunded', payout_needs_recovery: true }) })
    })
    await openTab(page, 'Experience Payouts')
    await page.getByLabel('Booking id to refund').fill('b9')
    await page.getByRole('button', { name: 'Refund booking' }).click()
    expect(called).toBe(false) // needs a second click
    await page.getByRole('button', { name: 'Confirm refund' }).click()
    await expect(page.getByText(/already paid the operator/)).toBeVisible()
    expect(called).toBe(true)
  })

  test('commission change sends the percent', async ({ page }) => {
    let put: unknown = null
    await page.route('**/admin/settings/experience-commission', route => {
      if (route.request().resourceType() === 'document') return route.continue()
      if (route.request().method() === 'PUT') {
        put = JSON.parse(route.request().postData() || '{}')
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ percent: 20 }) })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ percent: 15 }) })
    })
    await openTab(page, 'Commission')
    const field = page.getByLabel('Commission percent')
    await expect(field).toHaveValue('15')
    await field.fill('20')
    await page.getByRole('button', { name: 'Save commission' }).click()
    await expect.poll(() => put).toEqual({ percent: 20 })
  })

  test('traveller report renders each traveller with stay and experience revenue', async ({ page }) => {
    await page.route('**/admin/traveller-report**', respond({
      total: 2,
      items: [
        { user_id: 'u1', full_name: 'Asha Verma', email: 'asha@example.com', stay_revenue: 3000, experience_revenue: 1000, total_revenue: 4000 },
        { user_id: 'u2', full_name: 'Ravi Kumar', email: 'ravi@example.com', stay_revenue: 0, experience_revenue: 1000, total_revenue: 1000 },
      ],
    }))
    await openTab(page, 'Traveller Report')
    await expect(page.getByText('asha@example.com')).toBeVisible()
    await expect(page.getByText('₹4,000')).toBeVisible()
    await expect(page.getByText('ravi@example.com')).toBeVisible()
    await expect(page.getByText('2 travellers')).toBeVisible()
  })
})
