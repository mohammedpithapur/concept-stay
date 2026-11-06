const HOME_BY_ROLE: Record<string, string> = {
  guest: '/dashboard',
  host: '/host',
  operator: '/operator',
  admin: '/admin/properties',
}

/** Where to send a signed-in user: the page they asked for, else their role's home. */
export function landingFor(role: string, next: string | null): string {
  if (next && next !== '/dashboard') return next
  return HOME_BY_ROLE[role] ?? '/dashboard'
}
