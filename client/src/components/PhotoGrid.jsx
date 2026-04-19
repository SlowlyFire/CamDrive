import { useState } from 'react'

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm'])

function isVideoFilename(filename) {
  if (!filename) return false
  const ext = '.' + filename.split('.').pop().toLowerCase()
  return VIDEO_EXTS.has(ext)
}

// Renders a video thumbnail: seeks to 1 s after metadata loads so the
// browser paints a real frame instead of a black/blank poster.
// Falls back to a camera-icon placeholder if the video fails to load.
function VideoThumbnail({ src, filename, onClick }) {
  const [failed, setFailed] = useState(false)
  const isMov = filename?.toLowerCase().endsWith('.mov')

  if (failed) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center bg-gray-700 cursor-pointer gap-1 px-1"
        onClick={onClick}
      >
        <span className="text-white text-2xl">📹</span>
        <span className="text-white text-xs text-center leading-tight break-all line-clamp-2">
          {filename}
        </span>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-800 cursor-pointer" onClick={onClick}>
      <video
        src={src}
        className="w-full h-full object-cover"
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => { e.target.currentTime = 1 }}
        onError={() => setFailed(true)}
      />
      <span className="absolute text-white text-3xl pointer-events-none drop-shadow">▶</span>
      {isMov && (
        <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-xs text-center py-0.5 leading-tight">
          יש להוריד לצפייה
        </span>
      )}
    </div>
  )
}

export default function PhotoGrid({ photos, inspectionId, onDelete, readOnly = false }) {
  const [lightbox, setLightbox] = useState(null)

  if (!photos || photos.length === 0) {
    return <p className="text-gray-400 text-sm text-center py-4">אין תמונות</p>
  }

  const url = (filename) => `/api/inspections/${inspectionId}/photos/${filename}`

  return (
    <>
      <div className="grid grid-cols-3 gap-1">
        {photos.map((photo, i) => (
          <div key={photo.filename} className="relative aspect-square bg-gray-100">
            {isVideoFilename(photo.filename) ? (
              <VideoThumbnail
                src={url(photo.filename)}
                filename={photo.originalName || photo.filename}
                onClick={() => setLightbox(i)}
              />
            ) : (
              <img
                src={url(photo.filename)}
                alt={photo.originalName}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setLightbox(i)}
                loading="lazy"
              />
            )}
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

          {isVideoFilename(photos[lightbox].filename) ? (
            <video
              key={photos[lightbox].filename}
              src={url(photos[lightbox].filename)}
              className="max-h-screen max-w-screen object-contain"
              controls
              autoPlay
              playsInline
              preload="metadata"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={url(photos[lightbox].filename)}
              className="max-h-screen max-w-screen object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}

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
