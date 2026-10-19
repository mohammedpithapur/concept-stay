import type { Metadata } from 'next'
import { buildApiUrl } from '@/lib/api'

type Props = {
  params: Promise<{ id: string }>
  children: React.ReactNode
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  try {
    const res = await fetch(buildApiUrl(`/properties/${id}`), {
      next: { revalidate: 60 },
    })

    if (!res.ok) {
      return {
        title: 'Property | Concept Stay',
        description: 'A hand-picked property - book now on Concept Stay',
        openGraph: {
          title: 'Property | Concept Stay',
          description: 'A hand-picked property - book now on Concept Stay',
          images: ['https://conceptstay.in/og-image.jpg'],
        },
      }
    }

    const property = await res.json()
    const primaryImg = property.images?.find((img: any) => img.is_primary)?.image_url
    const firstImg = property.images?.[0]?.image_url
    const rawCover = primaryImg || firstImg || 'https://conceptstay.in/og-image.jpg'
    const coverImage = rawCover.startsWith('blob:') ? 'https://conceptstay.in/og-image.jpg' : rawCover

    const title = property.name ? `Property | Concept Stay | ${property.name}` : 'Property | Concept Stay'
    const description = 'A hand-picked property - book now on Concept Stay'
    const url = `https://conceptstay.in/properties/${id}`

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url,
        siteName: 'Concept Stay',
        type: 'website',
        images: [
          {
            url: coverImage,
            secureUrl: coverImage,
            width: 1200,
            height: 630,
            alt: property.name || 'Property Cover',
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [coverImage],
      },
    }
  } catch {
    return {
      title: 'Property | Concept Stay',
      description: 'A hand-picked property - book now on Concept Stay',
      openGraph: {
        title: 'Property | Concept Stay',
        description: 'A hand-picked property - book now on Concept Stay',
        images: ['https://conceptstay.in/og-image.jpg'],
      },
    }
  }
}

export default function PropertyDetailLayout({ children }: Props) {
  return <>{children}</>
}
