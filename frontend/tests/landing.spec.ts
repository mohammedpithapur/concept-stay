import { test, expect } from '@playwright/test'
import { landingFor } from '../lib/auth/landing'

test.describe('landingFor', () => {
  test('each role lands on its own dashboard when no page was asked for', () => {
    expect(landingFor('guest', null)).toBe('/dashboard')
    expect(landingFor('host', null)).toBe('/host')
    expect(landingFor('operator', null)).toBe('/operator')
    expect(landingFor('admin', null)).toBe('/admin/properties')
  })

  test('the default /dashboard counts as no page asked for', () => {
    expect(landingFor('host', '/dashboard')).toBe('/host')
    expect(landingFor('admin', '/dashboard')).toBe('/admin/properties')
  })

  test('a page the user asked for is kept', () => {
    expect(landingFor('host', '/properties/12')).toBe('/properties/12')
    expect(landingFor('operator', '/experiences/3')).toBe('/experiences/3')
  })

  test('an unknown role falls back to the guest dashboard', () => {
    expect(landingFor('stranger', null)).toBe('/dashboard')
  })
})
