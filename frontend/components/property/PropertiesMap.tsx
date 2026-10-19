'use client'
import { useEffect, useRef } from 'react'
import type { Property } from '@/lib/types'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export default function PropertiesMap({ properties }: { properties: Property[] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let map: import('leaflet').Map | undefined
    let cancelled = false

    const init = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (cancelled || !ref.current) return

      delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      map = L.map(ref.current, { scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView([22.5, 79], 5)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map)

      const points: [number, number][] = []
      for (const p of properties) {
        if (!p.latitude && !p.longitude) continue // 0,0 = coordinates never set
        points.push([p.latitude, p.longitude])
        L.marker([p.latitude, p.longitude]).addTo(map).bindPopup(
          `<div style="font-family:Georgia,serif"><strong>${escapeHtml(p.name)}</strong><br/>` +
          `<span style="font-size:12px;color:#7a7167">${escapeHtml(p.city)}, ₹${p.price_per_night.toLocaleString('en-IN')}/night</span><br/>` +
          `<a href="/properties/${encodeURIComponent(p.id)}">View stay</a></div>`,
        )
      }
      if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 12, animate: false })
    }

    init().catch(console.error)
    return () => {
      cancelled = true
      map?.remove()
    }
  }, [properties])

  return (
    <div
      ref={ref}
      data-testid="properties-map"
      style={{ height: '70vh', minHeight: '420px', width: '100%', borderRadius: '12px', border: '1px solid var(--color-border)', zIndex: 0 }}
    />
  )
}
