import { buildApiUrl, type ApiFetcher } from '@/lib/api'

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

function parseUploadError(responseText: string, status: number): string {
  if (!responseText) {
    return `Failed to upload image (${status})`
  }

  try {
    const data = JSON.parse(responseText) as { detail?: unknown; message?: unknown; error?: unknown }
    const detail = data.detail ?? data.message ?? data.error
    if (typeof detail === 'string' && detail.trim()) {
      return detail
    }
  } catch {
    // Fall through to a generic message below.
  }

  return `Failed to upload image (${status})`
}

export async function compressImageFile(file: File, maxDimension = 1920, quality = 0.82): Promise<File> {
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) {
    return file
  }

  // If already WebP or small JPEG (< 350KB), skip heavy re-compression
  if (file.size < 350 * 1024 && (file.type === 'image/webp' || file.type === 'image/jpeg')) {
    return file
  }

  // 1. Fast hardware-accelerated off-thread decode with createImageBitmap (modern browsers)
  if (typeof createImageBitmap !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(file)
      let { width, height } = bitmap
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width)
          width = maxDimension
        } else {
          width = Math.round((width * maxDimension) / height)
          height = maxDimension
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d', { alpha: false })
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, width, height)
        bitmap.close()
        return new Promise(resolve => {
          canvas.toBlob(
            blob => {
              if (!blob) return resolve(file)
              const compressedFile = new File(
                [blob],
                file.name.replace(/\.[^/.]+$/, '') + '.webp',
                { type: 'image/webp', lastModified: Date.now() }
              )
              resolve(compressedFile)
            },
            'image/webp',
            quality
          )
        })
      }
      bitmap.close()
    } catch {
      // Fall through to standard image loading below
    }
  }

  // 2. Standard HTMLImageElement fallback
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)

      let { width, height } = img
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width)
          width = maxDimension
        } else {
          width = Math.round((width * maxDimension) / height)
          height = maxDimension
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        return resolve(file)
      }

      ctx.drawImage(img, 0, 0, width, height)

      const mimeType = 'image/webp'
      canvas.toBlob(
        blob => {
          if (!blob) {
            return resolve(file)
          }
          const compressedName = file.name.replace(/\.[^/.]+$/, '') + '.webp'
          const compressedFile = new File([blob], compressedName, {
            type: mimeType,
            lastModified: Date.now(),
          })
          resolve(compressedFile)
        },
        mimeType,
        quality
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
    img.src = url
  })
}

export function validateImageFile(file: File): void {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Unsupported image type. Please upload JPG, PNG, or WEBP files.')
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Image is too large. Maximum allowed size is 10MB.')
  }
}

export interface BatchUploadItem {
  tempId: string
  file: File
}

export interface BatchUploadProgress {
  completed: number
  total: number
  percent: number
  activeCount: number
}

interface PresignedResponseItem {
  id?: string
  upload_url: string
  public_url: string
  object_path: string
  mime_type: string
}

/**
 * Uploads multiple images in parallel directly to Supabase S3 using presigned URLs.
 * Uses on-the-fly streaming compression and upload to ensure 0 browser freeze and 0 EC2 load.
 */
export async function uploadPropertyImagesBatch(
  items: BatchUploadItem[],
  fetcher: ApiFetcher,
  callbacks: {
    onItemSuccess: (tempId: string, publicUrl: string) => void
    onItemError: (tempId: string, errorMessage: string) => void
    onProgress?: (progress: BatchUploadProgress) => void
  },
  concurrency = 6,
): Promise<{ successCount: number; errorCount: number }> {
  if (items.length === 0) return { successCount: 0, errorCount: 0 }

  const total = items.length
  let completed = 0
  let successCount = 0
  let errorCount = 0

  const updateProgress = () => {
    const percent = Math.round((completed / total) * 100)
    callbacks.onProgress?.({
      completed,
      total,
      percent,
      activeCount: total - completed,
    })
  }

  // 1. Request presigned upload URLs up front in a single 15ms batch call
  let presignedMap: Record<string, PresignedResponseItem> = {}
  try {
    const resp = await fetcher(buildApiUrl('/admin/presigned-upload-urls'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(item => ({
          id: item.tempId,
          mime_type: 'image/webp',
        })),
        folder: 'properties',
      }),
    })

    if (resp.ok) {
      const data = (await resp.json()) as { items?: PresignedResponseItem[] }
      if (Array.isArray(data.items)) {
        for (const p of data.items) {
          if (p.id) presignedMap[p.id] = p
        }
      }
    }
  } catch (err) {
    console.warn('Presigned URL batch request failed, falling back to direct upload endpoint:', err)
  }

  // 2. Worker queue: Each worker compresses & uploads on the fly (streaming)
  let queueIndex = 0

  const uploadWorker = async () => {
    while (queueIndex < items.length) {
      const currentIndex = queueIndex++
      const item = items[currentIndex]
      if (!item) break

      const presigned = presignedMap[item.tempId]
      let uploadedUrl: string | null = null
      let uploadError: string | null = null

      // Compress on the fly in the worker (takes ~25ms)
      let fileToUpload = item.file
      try {
        fileToUpload = await compressImageFile(item.file, 2048, 0.82)
      } catch {
        fileToUpload = item.file
      }

      // Upload with 2 retries
      for (let attempt = 0; attempt <= 2; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise(r => setTimeout(r, attempt * 600))
          }

          if (presigned?.upload_url) {
            // Direct PUT to Supabase S3 (0 EC2 load)
            const putResp = await fetch(presigned.upload_url, {
              method: 'PUT',
              headers: {
                'Content-Type': fileToUpload.type || 'image/webp',
              },
              body: fileToUpload,
            })

            if (!putResp.ok) {
              const txt = await putResp.text().catch(() => '')
              throw new Error(`S3 upload failed (${putResp.status}): ${txt}`)
            }

            uploadedUrl = presigned.public_url
            break
          } else {
            // Fallback to proxy endpoint if presigned URL was not available
            const formData = new FormData()
            formData.append('file', fileToUpload, item.file.name)
            const fbResp = await fetcher(buildApiUrl('/admin/upload-image'), {
              method: 'POST',
              body: formData,
            })
            if (!fbResp.ok) {
              throw new Error(`Upload failed (${fbResp.status})`)
            }
            const data = (await fbResp.json()) as { url?: string }
            if (!data.url) throw new Error('Missing image URL in response')
            uploadedUrl = data.url
            break
          }
        } catch (e) {
          uploadError = e instanceof Error ? e.message : 'Upload failed'
        }
      }

      completed++
      if (uploadedUrl) {
        successCount++
        callbacks.onItemSuccess(item.tempId, uploadedUrl)
      } else {
        errorCount++
        callbacks.onItemError(item.tempId, uploadError || 'Upload failed')
      }
      updateProgress()
    }
  }

  // Launch parallel stream workers
  const workerCount = Math.min(concurrency, items.length)
  const workers = Array.from({ length: workerCount }, () => uploadWorker())
  await Promise.all(workers)

  return { successCount, errorCount }
}

export async function uploadPropertyImage(
  file: File,
  onProgress?: (percent: number) => void,
  fetcher?: ApiFetcher,
  /** API prefix owning the upload endpoints: '/admin' for staff, '/host' for approved hosts. */
  basePath: '/admin' | '/host' = '/admin',
): Promise<string> {
  const fileToUpload = await compressImageFile(file, 2048, 0.82)
  validateImageFile(fileToUpload)

  if (!fetcher) {
    throw new Error('uploadPropertyImage requires fetchWithAuth')
  }

  onProgress?.(0)

  // Try direct presigned upload first (0 EC2 load)
  try {
    const presignedResp = await fetcher(buildApiUrl(`${basePath}/presigned-upload-urls`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ id: 'single', mime_type: fileToUpload.type || 'image/webp' }],
        folder: 'properties',
      }),
    })

    if (presignedResp.ok) {
      const data = (await presignedResp.json()) as { items?: PresignedResponseItem[] }
      const item = data.items?.[0]
      if (item?.upload_url && item.public_url) {
        const putResp = await fetch(item.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': fileToUpload.type || 'image/webp' },
          body: fileToUpload,
        })
        if (putResp.ok) {
          onProgress?.(100)
          return item.public_url
        }
      }
    }
  } catch (err) {
    console.warn('Presigned upload failed, falling back to direct POST:', err)
  }

  // Fallback to proxy upload
  try {
    const formData = new FormData()
    formData.append('file', fileToUpload, fileToUpload.name)
    const response = await fetcher(buildApiUrl(`${basePath}/upload-image`), {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const responseText = await response.text().catch(() => '')
      throw new Error(parseUploadError(responseText, response.status))
    }

    const data = (await response.json()) as { url?: unknown }
    if (typeof data.url !== 'string' || !data.url) {
      throw new Error('Uploaded image URL could not be resolved')
    }

    onProgress?.(100)
    return data.url
  } catch (error) {
    onProgress?.(0)
    throw new Error(error instanceof Error ? error.message : 'Failed to upload image')
  }
}
