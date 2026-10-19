'use client'
import { useEffect, useRef } from 'react'

interface MapProps {
  latitude: number
  longitude: number
  propertyName: string
  address: string
}

export default function Map({ latitude, longitude, propertyName, address }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<unknown>(null)

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    let L: typeof import('leaflet')
    let map: import('leaflet').Map

    const init = async () => {
      L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      // Fix default icon paths
      delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      if (!mapRef.current) return
      map = L.map(mapRef.current, { scrollWheelZoom: false }).setView([latitude, longitude], 14)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map)

      L.marker([latitude, longitude])
        .addTo(map)
        .bindPopup(`<div style="font-family:Georgia,serif"><strong>${propertyName}</strong><br/><span style="font-size:12px;color:#7a7167">${address}</span></div>`)
        .openPopup()

      mapInstanceRef.current = map
    }

    init().catch(console.error)

    return () => {
      if (map) {
        map.remove()
        mapInstanceRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude])

  return (
    <div
      ref={mapRef}
      style={{ height: '400px', width: '100%', zIndex: 1, borderRadius: '12px', overflow: 'hidden' }}
    />
  )
}
