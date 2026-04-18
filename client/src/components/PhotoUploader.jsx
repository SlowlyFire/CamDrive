import { useRef, useState } from 'react'
import { compressImage } from '../utils/imageUtils'

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
      const compressed = await Promise.all(files.map((f) => compressImage(f)))
      onFilesReady(compressed)
    } catch (err) {
      console.error('Image compression failed:', err)
      setError('שגיאה בעיבוד התמונות — נסה שנית')
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
      {/* Camera — opens rear camera directly */}
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
      {/* Gallery — opens file picker / photo library */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
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
        {processing ? 'מעבד…' : '🖼️ גלריה'}
      </button>
      </div>
    </div>
  )
}
