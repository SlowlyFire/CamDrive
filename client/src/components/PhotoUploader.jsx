import { useRef, useState } from 'react'
import { compressImage, isVideoFile } from '../utils/imageUtils'

const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/x-msvideo,video/x-matroska'

export default function PhotoUploader({ onFilesReady, disabled = false }) {
  const cameraRef = useRef()
  const galleryRef = useRef()
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)

  async function handleChange(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setProcessing(true)
    setError(null)
    try {
      const processed = await Promise.all(
        files.map(async (f) => {
          if (isVideoFile(f)) return f  // pass videos through unchanged
          try {
            return await compressImage(f)
          } catch {
            return f  // fall back to original if compression fails (e.g. HEIC on non-Safari)
          }
        })
      )
      onFilesReady(processed)
    } catch (err) {
      console.error('File processing failed:', err)
      setError('שגיאה בעיבוד הקבצים — נסה שנית')
    } finally {
      setProcessing(false)
      e.target.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="text-red-600 text-sm text-center">{error}</p>
      )}
      <div className="flex gap-2">
        {/* Camera — opens rear camera directly (photos only) */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          className="hidden"
          onChange={handleChange}
          disabled={disabled}
        />
        {/* Gallery — opens file picker: images + videos */}
        <input
          ref={galleryRef}
          type="file"
          accept={`image/*,${VIDEO_ACCEPT}`}
          multiple
          className="hidden"
          onChange={handleChange}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => cameraRef.current.click()}
          disabled={disabled || processing}
          className="flex-1 py-4 border-2 border-dashed border-blue-300 rounded-xl text-blue-700 font-semibold text-base active:bg-blue-50 disabled:opacity-50"
        >
          {processing ? '…' : '📷 מצלמה'}
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current.click()}
          disabled={disabled || processing}
          className="flex-1 py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 font-semibold text-base active:bg-gray-50 disabled:opacity-50"
        >
          {processing ? 'מעבד…' : '🖼️ גלריה / סרטון'}
        </button>
      </div>
    </div>
  )
}
