export function isVideoFile(file) {
  return file.type.startsWith('video/')
}

function isHeicFile(file) {
  if (file.type === 'image/heic' || file.type === 'image/heif') return true
  return /\.hei[cf]$/i.test(file.name)
}

/**
 * Compress an image File to max 1200px width at 80% JPEG quality.
 * HEIC/HEIF files are converted to JPEG first via heic2any so they
 * work on Chrome / Android (which cannot decode HEIC natively).
 * Returns a new File object (.jpg).
 */
export async function compressImage(file, maxWidth = 1200, quality = 0.8) {
  let imageFile = file

  // Convert HEIC → JPEG blob before canvas compression
  if (isHeicFile(file)) {
    const heic2any = (await import('heic2any')).default
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality })
    // heic2any may return a single blob or an array (multi-frame); take the first
    const blob = Array.isArray(result) ? result[0] : result
    imageFile = new File([blob], file.name.replace(/\.hei[cf]$/i, '.jpg'), { type: 'image/jpeg' })
  }

  // Standard canvas resize + JPEG compression
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(imageFile)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Compression failed'))
          resolve(new File([blob], imageFile.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
        },
        'image/jpeg',
        quality
      )
    }
    img.onerror = reject
    img.src = url
  })
}

export function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function formatDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('he-IL', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}
