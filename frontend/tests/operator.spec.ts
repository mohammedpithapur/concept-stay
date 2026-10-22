import { test, expect } from '@playwright/test'
import type { Route } from '@playwright/test'

// Only API (fetch/xhr) calls are mocked: some API paths equal page URLs (/operator/experiences).
const respond = (body: unknown, status = 200) => (route: Route) =>
  route.request().resourceType() === 'document'
    ? route.continue()
    : route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

// Anything a test does not mock must never reach a real backend: a live API answers 401 to the fake admin and logs it out.
test.beforeEach(async ({ page }) => {
  await page.route(/:8000\//, route => route.abort())
  // The profile-incomplete prompt is covered by the host specs; keep it out of the way here.
  await page.route('**/operator/profile/completeness', respond({ complete: true, missing: [], kyc_status: 'submitted' }))
})

// The e2e dev server signs in a fake admin, who may use the operator area. "Plain guest is sent away" is covered by the backend 403 tests.

const experience = (over: Record<string, unknown> = {}) => ({
  id: 'exp1', operator_id: 'op', title: 'Sunrise trek', description: 'A guided walk.', images: [], city: 'Munnar', state: 'Kerala',
  meeting_point: 'Main gate', category: 'adventure', duration_minutes: 180, difficulty: 'easy', min_age: 8, languages: ['English'],
  included: 'Guide', what_to_bring: 'Shoes', price_per_person: 2500, avg_rating: 0, review_count: 0, approval_status: 'approved',
  pending_changes: null, rejection_reason: null, is_published: true, created_at: '2031-01-01T00:00:00', ...over,
})

test.describe('Operator area', () => {
  test('experience list shows status chips and the rejection reason', async ({ page }) => {
    await page.route('**/operator/experiences', respond([
      experience({ id: 'a', title: 'Live trek' }),
      experience({ id: 'b', title: 'Rejected walk', approval_status: 'rejected', is_published: false, rejection_reason: 'Photos too dark' }),
      experience({ id: 'c', title: 'Edited trek', pending_changes: { price_per_person: 3000 } }),
    ]))
    await page.goto('/operator/experiences')
    await expect(page.getByText('Live trek')).toBeVisible()
    await expect(page.getByText('Rejected', { exact: true })).toBeVisible()
    await expect(page.getByText('Photos too dark')).toBeVisible()
    await expect(page.getByText('Edits awaiting review')).toBeVisible()
  })

  test('slot form sends an India time ISO string', async ({ page }) => {
    let posted: { starts_at: string; capacity: number } | null = null
    await page.route('**/operator/experiences', respond([experience()]))
    await page.route('**/operator/experiences/exp1/slots', async route => {
      if (route.request().resourceType() === 'document') return route.continue()
      if (route.request().method() === 'POST') {
        posted = JSON.parse(route.request().postData() || '{}')
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
          id: 's9', experience_id: 'exp1', starts_at: posted!.starts_at, capacity: posted!.capacity, seats_booked: 0, seats_left: posted!.capacity,
        }) })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.goto('/operator/slots')
    await page.getByLabel('Date').fill('2031-05-01')
    await page.getByLabel('Start time (India time)').fill('09:30')
    await page.getByLabel('Seats').fill('6')
    await page.getByRole('button', { name: 'Add slot' }).click()
    await expect.poll(() => posted?.starts_at).toBe('2031-05-01T09:30:00+05:30')
    expect(posted!.capacity).toBe(6)
  })

  test('delete is disabled for a slot with bookings', async ({ page }) => {
    await page.route('**/operator/experiences', respond([experience()]))
    await page.route('**/operator/experiences/exp1/slots', respond([
      { id: 's1', experience_id: 'exp1', starts_at: '2031-05-01T04:00:00Z', capacity: 4, seats_booked: 2, seats_left: 2 },
      { id: 's2', experience_id: 'exp1', starts_at: '2031-05-02T04:00:00Z', capacity: 4, seats_booked: 0, seats_left: 4 },
    ]))
    await page.goto('/operator/slots')
    const deletes = page.getByRole('button', { name: /Delete slot/ })
    await expect(deletes).toHaveCount(2)
    await expect(deletes.nth(0)).toBeDisabled()
    await expect(deletes.nth(1)).toBeEnabled()
  })

  test('bookings table shows first name and phone but no email', async ({ page }) => {
    await page.route('**/operator/bookings', respond([
      { id: 'b1', experience_title: 'Sunrise trek', starts_at: '2031-05-01T04:00:00Z', party_size: 2, voucher_code: 'ABCDE23456',
        guest_first_name: 'Asha', guest_phone: '9876543210', status: 'confirmed' },
    ]))
    await page.goto('/operator/bookings')
    await expect(page.getByText('Asha')).toBeVisible()
    await expect(page.getByText('9876543210')).toBeVisible()
    await expect(page.getByText('ABCDE23456')).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /email/i })).toHaveCount(0)
  })

  test('payouts page totals what is owed', async ({ page }) => {
    await page.route('**/operator/payouts', respond([
      { id: 'p1', booking_id: 'b1', operator_id: 'op', gross_amount: 5880, commission: 750, fees: 250, taxes: 630,
        operator_amount: 4250, status: 'owed', paid_at: null, reference: null, created_at: '2031-01-01T00:00:00' },
    ]))
    await page.goto('/operator/payouts')
    await expect(page.getByText('₹4,250').first()).toBeVisible()
    await expect(page.getByText('Owed to you').first()).toBeVisible()
  })

  test('profile page loads from the operator route', async ({ page }) => {
    let hit = false
    await page.route('**/operator/profile', route => {
      if (route.request().resourceType() === 'document') return route.continue()
      hit = true
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        legal_name: 'Trail Co', phone: null, pan_masked: '******234F', aadhaar_last4: null, gst_number: null, bank_holder: null,
        bank_account_masked: null, bank_ifsc: null, kyc_status: 'incomplete', rejection_reason: null, submitted_at: null,
        verified_at: null, documents: [],
      }) })
    })
    await page.goto('/operator/profile')
    await expect(page.getByLabel('Legal name (as on your PAN)')).toHaveValue('Trail Co')
    expect(hit).toBe(true)
  })
})
