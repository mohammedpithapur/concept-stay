import { test, expect } from '@playwright/test'
import type { Route } from '@playwright/test'

// Only API (fetch/xhr) calls are mocked: some API paths equal page URLs (/experiences).
const respond = (body: unknown, status = 200) => (route: Route) =>
  route.request().resourceType() === 'document'
    ? route.continue()
    : route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

// Anything a test does not mock must never reach a real backend: a live API answers 401 to the fake admin and logs it out.
test.beforeEach(async ({ page }) => {
  await page.route(/:8000\//, route => route.abort())
})

const trek = {
  id: 'exp1', title: 'Sunrise trek', description: 'A guided walk to the ridge for sunrise.', images: [],
  city: 'Munnar', state: 'Kerala', category: 'adventure', duration_minutes: 180, difficulty: 'easy', min_age: 8,
  languages: ['English'], included: 'Guide, snacks', what_to_bring: 'Comfortable shoes', price_per_person: 2500,
  avg_rating: 4.5, review_count: 2, next_slot_at: '2031-05-01T04:00:00Z',
}
const foodWalk = { ...trek, id: 'exp2', title: 'Old town food walk', category: 'food', city: 'Goa', price_per_person: 1200 }

const slot = { id: 's1', starts_at: '2031-05-01T04:00:00Z', capacity: 4, seats_left: 4 }

const quoteFor = (party: number) => {
  const value = 2500 * party
  const service_fee = Math.round(value * 0.05)
  const taxes = Math.round((value + service_fee) * 0.12)
  const total = value + service_fee + taxes
  return { price_per_person: 2500, party_size: party, value, service_fee, taxes, total, charged: { currency: 'INR', amount_minor: total * 100 } }
}

// One handler for everything under /experiences/<id>: detail, quote and reviews.
const mockExperienceApi = (detail: object) => (route: Route) => {
  if (route.request().resourceType() === 'document') return route.continue()
  const url = route.request().url()
  const fulfill = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  if (url.includes('/quote')) return fulfill(quoteFor(JSON.parse(route.request().postData() || '{}').party_size))
  if (url.includes('/reviews')) return fulfill([{ rating: 5, text: 'Wonderful guide', guest_first_name: 'Asha', created_at: '2031-01-01T00:00:00' }])
  return fulfill(detail)
}

test.describe('Experiences browse', () => {
  test('list shows cards and the category filter reaches the API', async ({ page }) => {
    const seen: string[] = []
    await page.route('**/experiences**', route => {
      if (route.request().resourceType() === 'document') return route.continue()
      seen.push(route.request().url())
      const wantsFood = route.request().url().includes('category=food')
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ items: wantsFood ? [foodWalk] : [trek, foodWalk], total: wantsFood ? 1 : 2 }),
      })
    })
    await page.goto('/experiences')
    await expect(page.getByText('Sunrise trek')).toBeVisible()
    await expect(page.getByText('Old town food walk')).toBeVisible()
    await page.getByRole('button', { name: 'Food' }).click()
    await expect(page.getByText('Sunrise trek')).toHaveCount(0)
    await expect(page.getByText('Old town food walk')).toBeVisible()
    expect(seen.some(u => u.includes('category=food'))).toBe(true)
  })

  test('detail shows slots and updates the price when the party size changes', async ({ page }) => {
    await page.route('**/experiences/exp1**', mockExperienceApi({ ...trek, slots: [slot] }))
    await page.goto('/experiences/exp1')
    await expect(page.getByRole('heading', { name: 'Sunrise trek' })).toBeVisible()
    await expect(page.getByText('4 seats left')).toBeVisible()
    await expect(page.getByText('Wonderful guide')).toBeVisible()
    await expect(page.getByText('₹5,880').first()).toBeVisible() // 2 people by default
    await page.getByRole('button', { name: 'Add one person' }).click()
    await expect(page.getByText('₹8,820').first()).toBeVisible() // 3 people
  })

  test('a sold out slot cannot be chosen', async ({ page }) => {
    await page.route('**/experiences/exp1**', mockExperienceApi({ ...trek, slots: [{ ...slot, seats_left: 0 }] }))
    await page.goto('/experiences/exp1')
    await expect(page.getByRole('button', { name: /Sold out/ })).toBeDisabled()
  })
})

test.describe('Experience checkout', () => {
  test('paying shows the voucher with the meeting point', async ({ page }) => {
    await page.addInitScript(() => {
      // Stand-in for Razorpay checkout: "paying" immediately succeeds.
      ;(window as unknown as { Razorpay: unknown }).Razorpay = class {
        opts: { handler: (r: object) => void; order_id: string }
        constructor(opts: { handler: (r: object) => void; order_id: string }) { this.opts = opts }
        open() {
          this.opts.handler({ razorpay_order_id: this.opts.order_id, razorpay_payment_id: 'pay_1', razorpay_signature: 'sig' })
        }
      }
    })
    const pending = {
      id: 'b1', experience_id: 'exp1', slot_id: 's1', experience_title: 'Sunrise trek', starts_at: slot.starts_at, party_size: 2,
      price_per_person: 2500, value: 5000, service_fee: 250, taxes: 630, total: 5880, currency: 'INR', charged_minor: 588000,
      status: 'pending', created_at: '2031-01-01T00:00:00', voucher_code: null, meeting_point: null,
      operator_name: null, operator_phone: null, operator_email: null,
    }
    await page.route('**/experiences/exp1**', mockExperienceApi({ ...trek, slots: [slot] }))
    await page.route('**/experience-bookings', respond({ booking: pending, razorpay_order_id: 'order_1', amount: 588000, currency: 'INR', key_id: 'rzp_test' }))
    await page.route('**/experience-bookings/b1/verify', respond({
      ...pending, status: 'confirmed', voucher_code: 'ABCDE23456', meeting_point: 'Main gate, Tea Museum road',
      operator_name: 'Trail Co', operator_phone: '9876543210', operator_email: 'trail@example.com',
    }))
    await page.goto('/experiences/exp1')
    await page.getByRole('button', { name: /Pay ₹5,880/ }).click()
    await expect(page.getByText('Your booking is confirmed')).toBeVisible()
    await expect(page.getByText('ABCDE23456')).toBeVisible()
    await expect(page.getByText('Main gate, Tea Museum road')).toBeVisible()
    await expect(page.getByText('Trail Co')).toBeVisible()
  })

  test('a lost last seat explains the refund', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { Razorpay: unknown }).Razorpay = class {
        opts: { handler: (r: object) => void; order_id: string }
        constructor(opts: { handler: (r: object) => void; order_id: string }) { this.opts = opts }
        open() { this.opts.handler({ razorpay_order_id: this.opts.order_id, razorpay_payment_id: 'pay_2', razorpay_signature: 'sig' }) }
      }
    })
    const pending = {
      id: 'b2', experience_id: 'exp1', slot_id: 's1', experience_title: 'Sunrise trek', starts_at: slot.starts_at, party_size: 2,
      price_per_person: 2500, value: 5000, service_fee: 250, taxes: 630, total: 5880, currency: 'INR', charged_minor: 588000,
      status: 'pending', created_at: '2031-01-01T00:00:00', voucher_code: null, meeting_point: null,
      operator_name: null, operator_phone: null, operator_email: null,
    }
    await page.route('**/experiences/exp1**', mockExperienceApi({ ...trek, slots: [slot] }))
    await page.route('**/experience-bookings', respond({ booking: pending, razorpay_order_id: 'order_2', amount: 588000, currency: 'INR', key_id: 'rzp_test' }))
    await page.route('**/experience-bookings/b2/verify', respond({ detail: 'Slot is full, your payment was refunded' }, 409))
    await page.goto('/experiences/exp1')
    await page.getByRole('button', { name: /Pay ₹5,880/ }).click()
    await expect(page.getByText('Slot is full, your payment was refunded')).toBeVisible()
  })

  test('a network failure while confirming a paid booking says the payment was received', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { Razorpay: unknown }).Razorpay = class {
        opts: { handler: (r: object) => void; order_id: string }
        constructor(opts: { handler: (r: object) => void; order_id: string }) { this.opts = opts }
        open() { this.opts.handler({ razorpay_order_id: this.opts.order_id, razorpay_payment_id: 'pay_3', razorpay_signature: 'sig' }) }
      }
    })
    const pending = {
      id: 'b3', experience_id: 'exp1', slot_id: 's1', experience_title: 'Sunrise trek', starts_at: slot.starts_at, party_size: 2,
      price_per_person: 2500, value: 5000, service_fee: 250, taxes: 630, total: 5880, currency: 'INR', charged_minor: 588000,
      status: 'pending', created_at: '2031-01-01T00:00:00', voucher_code: null, meeting_point: null,
      operator_name: null, operator_phone: null, operator_email: null,
    }
    await page.route('**/experiences/exp1**', mockExperienceApi({ ...trek, slots: [slot] }))
    await page.route('**/experience-bookings', respond({ booking: pending, razorpay_order_id: 'order_3', amount: 588000, currency: 'INR', key_id: 'rzp_test' }))
    await page.route('**/experience-bookings/b3/verify', route => route.abort())
    await page.goto('/experiences/exp1')
    await page.getByRole('button', { name: /Pay ₹5,880/ }).click()
    await expect(page.getByText(/Payment received/)).toBeVisible()
    await expect(page.getByText(/not been charged|Failed to fetch/i)).toHaveCount(0)
  })
})
