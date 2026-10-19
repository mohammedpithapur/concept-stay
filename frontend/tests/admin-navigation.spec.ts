import { test, expect } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

async function mockAdminApi(page: Page) {
  await page.route('**/admin/dashboard', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_bookings: 0,
        total_properties: 1,
        total_revenue: 0,
        pending_bookings: 0,
      }),
    })
  })

  await page.route('**/bookings/admin/all**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0, page: 1, limit: 15 }),
    })
  })

  await page.route('**/admin/properties', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'e2e-seed-property',
          name: 'Seed Property',
          description: 'Seed property used by Playwright tests',
          price_per_night: 12500,
          cleaning_fee: 1500,
          max_guests: 4,
          bedrooms: 2,
          bathrooms: 1,
          bathrooms_detail: [],
          city: 'Goa',
          state: 'Goa',
          country: 'India',
          latitude: 15.2993,
          longitude: 74.1240,
          is_published: true,
          min_nights: 1,
          pets_allowed: false,
          pet_charge_per_night: 0,
          images: [],
          amenities: [],
          avg_rating: 4.8,
          review_count: 12,
          created_at: '2026-05-31T00:00:00.000Z',
          address: 'Test Address',
          contact_phone: '9999999999',
          contact_email: 'test@example.com',
          check_in_time: '2:00 PM',
          check_out_time: '11:00 AM',
          house_rules: [],
        },
      ]),
    })
  })
}

test.describe('Admin navigation', () => {
  test('Add Property links to editor', async ({ page }) => {
    await mockAdminApi(page)
    await page.goto('/admin')
    await page.getByRole('link', { name: '+ Add Property' }).click()
    await expect(page).toHaveURL(/\/admin\/properties/)
    await expect(page.getByText('Add New Property')).toBeVisible()
  })

  test('View button opens property details', async ({ page }) => {
    await mockAdminApi(page)
    await page.goto('/admin')
    await page.waitForLoadState('networkidle') // let React hydrate before clicking a tab
    await page.getByRole('button', { name: 'Properties' }).click()
    const viewLink = page.getByRole('link', { name: 'View' }).first()
    await expect(viewLink).toHaveAttribute('href', '/properties/e2e-seed-property')
    await page.goto('/properties/e2e-seed-property')
    await expect(page).toHaveURL(/\/properties\//)
  })
})
