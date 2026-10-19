'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'

export default function Navbar() {
  const [mounted, setMounted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [logoHover, setLogoHover] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { user, logout, loading } = useAuth()

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleLogout = async () => {
    setDropdownOpen(false)
    setMenuOpen(false)
    await logout()
    router.push('/')
  }

  const navLinkStyle = {
    color: 'var(--color-navbar-text)',
    fontSize: '13px',
    letterSpacing: '1px',
    textDecoration: 'none',
    textTransform: 'uppercase' as const,
    fontWeight: '500' as const,
    transition: 'color 0.2s ease',
  }

  const userInitial = user?.full_name?.charAt(0)?.toUpperCase() || '?'

  return (
    <nav style={{ backgroundColor: 'var(--color-navbar)', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, width: '100%' }}>
      <div className="px-5 py-4 md:px-6 md:py-5" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '1400px', margin: '0 auto', width: '100%', minHeight: '74px', paddingInline: '16px' }}>

        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none', cursor: 'pointer' }}
          onMouseEnter={() => setLogoHover(true)} onMouseLeave={() => setLogoHover(false)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              color: 'var(--color-gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: mounted && logoHover ? 'scale(1.08)' : 'scale(1)',
              transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}>
              {mounted ? (
                <img
                  src="/Untitled_design-removebg-preview.png?v=2"
                  alt="Concept Stay Logo"
                  width="42"
                  height="42"
                  style={{ objectFit: 'contain' }}
                />
              ) : (
                <div style={{ width: '42px', height: '42px' }} />
              )}
            </div>
            <span style={{ color: 'var(--color-navbar-text)', fontSize: '14px', letterSpacing: '2px', fontWeight: '700', fontFamily: "'Figtree', sans-serif" }}>
              CONCEPT STAY
            </span>
          </div>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-8">
          {[
            { label: 'Our Properties', href: '/properties' },
            { label: 'Corporate', href: '/corporate' },
            { label: 'Wedding', href: '/wedding' },
            { label: 'Articles', href: '/articles' },
            { label: 'Contact Us', href: '/contact' },
          ].map(link => (
            <Link key={link.href} href={link.href} style={navLinkStyle}
              onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-gold)'}
              onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-navbar-text)'}>
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop right side */}
        <div className="hidden md:flex items-center gap-4">
          {loading ? (
            <div style={{ width: '80px', height: '36px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }} />
          ) : user ? (
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setDropdownOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'transparent', border: '1px solid var(--color-navbar-border)', borderRadius: '999px', padding: '6px 14px 6px 6px', cursor: 'pointer', color: 'var(--color-navbar-text)', transition: 'border-color 0.2s ease' }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-gold)'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-navbar-border)'}
              >
                <div style={{ width: '32px', height: '32px', backgroundColor: 'var(--color-gold)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '800', color: 'var(--color-text-primary)' }}>
                  {userInitial}
                </div>
                <span style={{ fontSize: '13px', fontWeight: '600', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.full_name.split(' ')[0]}
                </span>
                <span style={{ fontSize: '10px', opacity: 0.7 }}>▼</span>
              </button>

              {dropdownOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '8px', minWidth: '200px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100 }}>
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)', marginBottom: '4px' }}>
                    <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '2px' }}>{user.full_name}</p>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{user.email}</p>
                  </div>
                  {[
                    { label: 'My Dashboard', href: '/dashboard' },
                    ...(user.role === 'host' || user.role === 'admin' ? [{ label: 'Host Dashboard', href: '/host' }] : [{ label: 'Become a host', href: '/host/apply' }]),
                    ...(user.role === 'admin' ? [{ label: 'Admin Panel', href: '/admin' }] : []),
                  ].map(item => (
                    <Link key={item.href} href={item.href}
                      onClick={() => setDropdownOpen(false)}
                      style={{ display: 'block', padding: '10px 12px', fontSize: '14px', color: 'var(--color-text-primary)', textDecoration: 'none', borderRadius: '8px', transition: 'background 0.15s ease' }}
                      onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'var(--color-bg-soft)'}
                      onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent'}>
                      {item.label}
                    </Link>
                  ))}
                  <button
                    onClick={handleLogout}
                    style={{ display: 'block', width: '100%', padding: '10px 12px', fontSize: '14px', color: '#C62828', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '8px', transition: 'background 0.15s ease' }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#FFF5F5'}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'}
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/login" style={navLinkStyle}
              onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-gold)'}
              onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-navbar-text)'}>
              Login
            </Link>
          )}

          <Link
            href="/properties"
            style={{ backgroundColor: 'var(--color-gold)', color: 'var(--color-text-primary)', border: 'none', padding: '10px 20px', fontSize: '12px', letterSpacing: '1px', fontWeight: '700', textDecoration: 'none', borderRadius: '8px', textTransform: 'uppercase' as const, transition: 'all 0.2s ease' }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.opacity = '0.9'; el.style.transform = 'scale(1.03)' }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.opacity = '1'; el.style.transform = 'scale(1)' }}
          >
            Book Now
          </Link>
        </div>

        {/* Mobile right side */}
        <div className="md:hidden flex items-center gap-3" style={{ marginLeft: 'auto', flexShrink: 0 }}>
          {mounted && !loading && (
            user ? (
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                style={{ width: '36px', height: '36px', backgroundColor: 'var(--color-gold)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '800', color: 'var(--color-text-primary)', border: 'none', cursor: 'pointer' }}
              >
                {userInitial}
              </button>
            ) : (
              <button
                onClick={() => router.push('/login')}
                style={{ background: 'transparent', border: '1px solid var(--color-navbar-border)', color: 'var(--color-navbar-text)', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: '700', padding: '8px 14px', borderRadius: '999px', cursor: 'pointer' }}
              >
                Login
              </button>
            )
          )}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-3 flex flex-col gap-1.5"
            aria-label="Toggle navigation menu"
            style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <span style={{ backgroundColor: 'var(--color-navbar-text)', height: '2px', width: '24px', display: 'block', borderRadius: '2px' }} />
            <span style={{ backgroundColor: 'var(--color-navbar-text)', height: '2px', width: '24px', display: 'block', borderRadius: '2px' }} />
            <span style={{ backgroundColor: 'var(--color-navbar-text)', height: '2px', width: '24px', display: 'block', borderRadius: '2px' }} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mounted && menuOpen && (
        <div className="md:hidden flex flex-col w-full" style={{ backgroundColor: 'var(--color-navbar)', borderTop: '1px solid var(--color-navbar-border)', padding: '16px 24px', gap: '16px', maxWidth: '1400px', margin: '0 auto' }}>
          {[
            { label: 'Our Properties', href: '/properties' },
            { label: 'Corporate', href: '/corporate' },
            { label: 'Wedding', href: '/wedding' },
            { label: 'Articles', href: '/articles' },
            { label: 'Contact Us', href: '/contact' },
          ].map(link => (
            <Link key={link.href} href={link.href}
              style={{ color: 'var(--color-navbar-text)', fontSize: '14px', letterSpacing: '1px', textDecoration: 'none', textTransform: 'uppercase', fontWeight: '500' }}
              onClick={() => setMenuOpen(false)}>
              {link.label}
            </Link>
          ))}

          {user && (
            <>
              <Link href="/dashboard" onClick={() => setMenuOpen(false)}
                style={{ color: 'var(--color-navbar-text)', fontSize: '14px', letterSpacing: '1px', textDecoration: 'none', textTransform: 'uppercase', fontWeight: '500' }}>
                My Dashboard
              </Link>
              <Link href={user.role === 'host' || user.role === 'admin' ? '/host' : '/host/apply'} onClick={() => setMenuOpen(false)}
                style={{ color: 'var(--color-navbar-text)', fontSize: '14px', letterSpacing: '1px', textDecoration: 'none', textTransform: 'uppercase', fontWeight: '500' }}>
                {user.role === 'host' || user.role === 'admin' ? 'Host Dashboard' : 'Become a host'}
              </Link>
              {user.role === 'admin' && (
                <Link href="/admin" onClick={() => setMenuOpen(false)}
                  style={{ color: 'var(--color-gold)', fontSize: '14px', letterSpacing: '1px', textDecoration: 'none', textTransform: 'uppercase', fontWeight: '700' }}>
                  Admin Panel
                </Link>
              )}
              <button onClick={handleLogout}
                style={{ background: 'none', border: 'none', color: '#C62828', fontSize: '14px', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: '600', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                Sign Out
              </button>
            </>
          )}

          <Link href="/properties" onClick={() => setMenuOpen(false)}
            style={{ backgroundColor: 'var(--color-gold)', color: 'var(--color-text-primary)', border: 'none', padding: '12px 24px', fontSize: '12px', letterSpacing: '1px', fontWeight: '700', textAlign: 'center', textDecoration: 'none', borderRadius: '8px', textTransform: 'uppercase' }}>
            Book Now
          </Link>
        </div>
      )}
    </nav>
  )
}