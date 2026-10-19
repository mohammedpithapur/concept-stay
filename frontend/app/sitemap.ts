import type { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://conceptstay.in'
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.conceptstay.in'

  // Static routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/properties`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/events`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ]

  // Dynamic property routes
  let propertyRoutes: MetadataRoute.Sitemap = []
  try {
    const res = await fetch(`${apiUrl}/properties`, {
      next: { revalidate: 3600 },
    })
    if (res.ok) {
      const properties: Array<{ id: string; updated_at?: string; created_at?: string }> = await res.json()
      propertyRoutes = properties.map(prop => ({
        url: `${baseUrl}/properties/${prop.id}`,
        lastModified: prop.updated_at ? new Date(prop.updated_at) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }))
    }
  } catch (err) {
    console.error('Failed to fetch properties for sitemap:', err)
  }

  return [...staticRoutes, ...propertyRoutes]
}
