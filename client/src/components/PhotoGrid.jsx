import { useState } from 'react'

export default function PhotoGrid({ photos, inspectionId, onDelete, readOnly = false }) {
  const [lightbox, setLightbox] = useState(null)

  if (!photos || photos.length === 0) {
    return <p className="text-gray-400 text-sm text-center py-4">אין תמונות</p>
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-1">
        {photos.map((photo, i) => (
          <div key={photo.filename} className="relative aspect-square bg-gray-100">
            <img
              src={`/api/inspections/${inspectionId}/photos/${photo.filename}`}
              alt={photo.originalName}
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => setLightbox(i)}
              loading="lazy"
            />
            {!readOnly && onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(photo.filename) }}
                className="absolute top-1 left-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute top-4 left-4 text-white text-3xl">×</button>
          <button
            className="absolute right-4 text-white text-3xl px-4"
            onClick={(e) => { e.stopPropagation(); setLightbox((l) => Math.max(0, l - 1)) }}
          >›</button>
          <img
            src={`/api/inspections/${inspectionId}/photos/${photos[lightbox].filename}`}
            className="max-h-screen max-w-screen object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute left-4 text-white text-3xl px-4"
            onClick={(e) => { e.stopPropagation(); setLightbox((l) => Math.min(photos.length - 1, l + 1)) }}
          >‹</button>
          <span className="absolute bottom-4 text-white text-sm">
            {lightbox + 1} / {photos.length}
          </span>
        </div>
      )}
    </>
  )
}
