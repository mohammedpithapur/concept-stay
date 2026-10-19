type Props = { status?: string | null; size?: 'sm' | 'md' }

/** "Concept Verified" mark shown on listings an admin has physically verified. Renders nothing otherwise. */
export default function VerifiedBadge({ status, size = 'sm' }: Props) {
  if (status !== 'verified') return null
  const small = size === 'sm'
  return (
    <span
      title="Concept Verified: the property, photos, location and host have been checked by our team"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: small ? '3px 10px' : '6px 14px',
        borderRadius: '999px',
        backgroundColor: 'var(--color-dark)',
        color: 'var(--color-gold)',
        fontSize: small ? '11px' : '13px',
        fontWeight: 700,
        letterSpacing: '0.4px',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true">✓</span> Concept Verified
    </span>
  )
}
