import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import TopBar from '../../components/TopBar'
import PhotoUploader from '../../components/PhotoUploader'
import Spinner from '../../components/Spinner'
import { isVideoFile } from '../../utils/imageUtils'

function VideoPreview({ src, name }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-700 gap-1 px-1">
        <span className="text-white text-xl">📹</span>
        <span className="text-white text-xs text-center leading-tight break-all line-clamp-2">{name}</span>
      </div>
    )
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-800">
      <video
        src={src}
        className="w-full h-full object-cover"
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => { e.target.currentTime = 1 }}
        onError={() => setFailed(true)}
      />
      <span className="absolute text-white text-2xl pointer-events-none">▶</span>
    </div>
  )
}

/**
 * Upload a single file directly to R2 via a presigned PUT URL.
 * Returns { r2Key, originalName }.
 */
async function uploadToR2(file, onProgress) {
  // 1. Get presigned URL from server
  let url, key
  try {
    const { data } = await api.get('/upload/presign', {
      params: { filename: file.name, contentType: file.type || 'application/octet-stream' },
    })
    url = data.url
    key = data.key
  } catch (err) {
    throw new Error(`שגיאת שרת (presign): ${err.response?.data?.error || err.message}`)
  }

  // 2. PUT file directly to R2 (XHR for upload progress)
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`R2 upload failed: HTTP ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('שגיאת CORS/רשת בהעלאה ל-R2 — בדוק CORS config ב-Cloudflare'))
    xhr.send(file)
  })

  return { r2Key: key, originalName: file.name }
}

export default function NewInspection() {
  const navigate = useNavigate()
  const myName = localStorage.getItem('myName')

  const [people, setPeople] = useState([])
  const [vehicleTypes, setVehicleTypes] = useState([])
  const [form, setForm] = useState({
    licensePlate: '',
    vehicleType: '',
    type: 'enlistment',
    members: myName ? [myName] : [],
    vehicleHours: '',
    location: '',
    notes: '',
    securityCode: '',
  })
  const [photos, setPhotos] = useState([])    // { file, preview }
  const [documents, setDocuments] = useState([]) // { file, preview }
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState('')
  const [done, setDone] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [lightbox, setLightbox] = useState(null) // { items: [{preview, file}], index }
  const [lbTouchStartX, setLbTouchStartX] = useState(null)

  useEffect(() => {
    api.get('/people').then((r) => setPeople(r.data))
    api.get('/vehicle-types').then((r) => setVehicleTypes(r.data)).catch(() => {})
  }, [])

  function toggleMember(name) {
    setForm((f) => ({
      ...f,
      members: f.members.includes(name)
        ? f.members.filter((m) => m !== name)
        : [...f.members, name],
    }))
    setFieldErrors((e) => ({ ...e, members: undefined }))
  }

  function addPhotos(files) {
    const newPhotos = files.map((f) => ({ file: f, preview: URL.createObjectURL(f) }))
    setPhotos((p) => [...p, ...newPhotos])
    setFieldErrors((e) => ({ ...e, photos: undefined }))
  }

  function removePhoto(index) {
    setPhotos((p) => {
      URL.revokeObjectURL(p[index].preview)
      return p.filter((_, i) => i !== index)
    })
  }

  function addDocuments(e) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const newDocs = files.map((f) => ({ file: f, preview: URL.createObjectURL(f) }))
    setDocuments((d) => [...d, ...newDocs])
    e.target.value = ''
  }

  function removeDocument(index) {
    setDocuments((d) => {
      URL.revokeObjectURL(d[index].preview)
      return d.filter((_, i) => i !== index)
    })
  }

  async function submit(e) {
    e.preventDefault()

    // Per-field validation
    const errors = {}
    if (!form.licensePlate.trim()) errors.licensePlate = 'שדה חובה'
    if (!form.vehicleType) errors.vehicleType = 'שדה חובה'
    if (form.members.length === 0) errors.members = 'שדה חובה'
    if (photos.length === 0) errors.photos = 'שדה חובה'
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return }

    setFieldErrors({})
    setSubmitting(true)
    setProgress(0)
    setUploadStatus('')

    try {
      const allFiles = [
        ...photos.map((p) => ({ file: p.file, type: 'photo' })),
        ...documents.map((d) => ({ file: d.file, type: 'document' })),
      ]

      const uploadedPhotos = []
      const uploadedDocuments = []

      // Upload all files directly to R2 with per-file progress and 3 retries
      for (let i = 0; i < allFiles.length; i++) {
        const { file, type } = allFiles[i]
        setUploadStatus(`מעלה קובץ ${i + 1} מתוך ${allFiles.length}…`)

        let result
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            result = await uploadToR2(file, (pct) => {
              const base = i / allFiles.length
              const range = 1 / allFiles.length
              setProgress(Math.round((base + (range * pct) / 100) * 90))
            })
            break
          } catch (err) {
            if (attempt === 2) throw err
            await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)))
          }
        }

        if (type === 'photo') uploadedPhotos.push(result)
        else uploadedDocuments.push(result)
      }

      setProgress(92)
      setUploadStatus('שולח בחינה…')

      // POST metadata (JSON — no files, all already in R2)
      await api.post('/inspections', {
        ...form,
        vehicleHours: form.vehicleHours ? Number(form.vehicleHours) : null,
        photos: uploadedPhotos,
        documents: uploadedDocuments,
      })

      photos.forEach((p) => URL.revokeObjectURL(p.preview))
      documents.forEach((d) => URL.revokeObjectURL(d.preview))
      setDone(true)
    } catch (err) {
      setFieldErrors({ submit: err.response?.data?.error || err.message || 'שגיאה בשליחה' })
      setSubmitting(false)
      setUploadStatus('')
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6 p-6" dir="rtl">
        <div className="text-6xl">✅</div>
        <h2 className="text-2xl font-black text-gray-900">הבחינה נשלחה!</h2>
        <p className="text-gray-500">הבחינה ממתינה לאישור המנהל</p>
        <button
          onClick={() => navigate('/team/menu')}
          className="w-full max-w-xs py-4 bg-blue-900 text-white font-black text-xl rounded-xl"
        >
          חזרה לתפריט
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      <TopBar title="בחינה חדשה" back="/team/menu" />

      <form onSubmit={submit} className="flex-1 p-4 flex flex-col gap-5 pb-8">

        {/* License plate */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">
            מספר רישוי
            {fieldErrors.licensePlate && <span className="text-red-500 font-bold mr-2">{fieldErrors.licensePlate}</span>}
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={form.licensePlate}
            onChange={(e) => {
              setForm((f) => ({ ...f, licensePlate: e.target.value }))
              setFieldErrors((err) => ({ ...err, licensePlate: undefined }))
            }}
            placeholder="למשל: 181398"
            className={`w-full border-2 rounded-xl px-4 py-3 text-lg font-mono focus:outline-none ${
              fieldErrors.licensePlate ? 'border-red-500' : 'border-gray-300 focus:border-blue-900'
            }`}
          />
        </div>

        {/* Vehicle type */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">
            סוג כלי
            {fieldErrors.vehicleType && <span className="text-red-500 font-bold mr-2">{fieldErrors.vehicleType}</span>}
          </label>
          <select
            value={form.vehicleType}
            onChange={(e) => {
              setForm((f) => ({ ...f, vehicleType: e.target.value }))
              setFieldErrors((err) => ({ ...err, vehicleType: undefined }))
            }}
            className={`w-full border-2 rounded-xl px-4 py-3 text-lg focus:outline-none bg-white ${
              fieldErrors.vehicleType ? 'border-red-500' : 'border-gray-300 focus:border-blue-900'
            }`}
          >
            <option value="">בחר סוג כלי...</option>
            {vehicleTypes.map((t) => (
              <option key={t._id} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Type toggle */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">סוג בחינה</label>
          <div className="flex rounded-xl overflow-hidden border-2 border-blue-900">
            {[['enlistment', 'גיוס'], ['release', 'שחרור']].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: val }))}
                className={`flex-1 py-3 text-lg font-black transition-colors ${
                  form.type === val ? 'bg-blue-900 text-white' : 'bg-white text-blue-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Members */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">
            חברי צוות
            {fieldErrors.members && <span className="text-red-500 font-bold mr-2">{fieldErrors.members}</span>}
          </label>
          <div className={`flex flex-wrap gap-2 p-2 rounded-xl ${fieldErrors.members ? 'border-2 border-red-500' : ''}`}>
            {people.map((p) => (
              <button
                key={p._id}
                type="button"
                onClick={() => toggleMember(p.name)}
                className={`px-4 py-2 rounded-full text-sm font-bold border-2 transition-colors ${
                  form.members.includes(p.name)
                    ? 'bg-blue-900 text-white border-blue-900'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Hours */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">שע״מ</label>
          <input
            type="number"
            inputMode="numeric"
            value={form.vehicleHours}
            onChange={(e) => setForm((f) => ({ ...f, vehicleHours: e.target.value }))}
            placeholder="שעות מנוע"
            className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-lg focus:border-blue-900 outline-none"
          />
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">מיקום</label>
          <input
            type="text"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            placeholder="שם הבסיס / מיקום"
            className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-lg focus:border-blue-900 outline-none"
          />
        </div>

        {/* Security code */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">קודן / קוד מיגון</label>
          <input
            type="text"
            value={form.securityCode}
            onChange={(e) => setForm((f) => ({ ...f, securityCode: e.target.value }))}
            placeholder="קוד מיגון של הרכב (אם קיים)"
            className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-lg focus:border-blue-900 outline-none"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">הערות / תקלות</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            placeholder="פרט תקלות, מצב הרכב..."
            className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-base focus:border-blue-900 outline-none resize-none"
          />
        </div>

        {/* Documents */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">מסמכים וטפסים ({documents.length})</label>
          <label className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-white active:bg-gray-50 text-gray-600 font-semibold text-sm">
            <span>📄 הוסף מסמכים</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={addDocuments} disabled={submitting} />
          </label>
          {documents.length > 0 && (
            <div className="grid grid-cols-4 gap-1 mt-2">
              {documents.map((d, i) => (
                <div key={i} className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
                  <img src={d.preview} className="w-full h-full object-cover cursor-pointer" alt=""
                    onClick={() => setLightbox({ items: documents, index: i })} />
                  <button type="button" onClick={() => removeDocument(i)}
                    className="absolute top-0.5 left-0.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Photos & Videos */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">
            תמונות וסרטונים ({photos.length})
            {fieldErrors.photos && <span className="text-red-500 font-bold mr-2">{fieldErrors.photos}</span>}
          </label>
          <div className={fieldErrors.photos ? 'rounded-xl border-2 border-red-500 p-1' : ''}>
            <PhotoUploader onFilesReady={addPhotos} disabled={submitting} />
          </div>
          {photos.length > 0 && (
            <div className="grid grid-cols-4 gap-1 mt-2">
              {photos.map((p, i) => (
                <div key={i} className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
                  <div className="w-full h-full cursor-pointer" onClick={() => setLightbox({ items: photos, index: i })}>
                    {isVideoFile(p.file) ? (
                      <VideoPreview src={p.preview} name={p.file.name} />
                    ) : (
                      <img src={p.preview} className="w-full h-full object-cover" alt="" />
                    )}
                  </div>
                  <button type="button" onClick={() => removePhoto(i)}
                    className="absolute top-0.5 left-0.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {fieldErrors.submit && <p className="text-red-600 text-sm font-semibold">{fieldErrors.submit}</p>}

        {submitting && (
          <div className="flex flex-col gap-2">
            {uploadStatus && <p className="text-sm text-gray-600 text-center font-semibold">{uploadStatus}</p>}
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div className="bg-blue-900 h-3 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-gray-500 text-center">{progress}%</p>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-4 bg-blue-900 text-white font-black text-xl rounded-xl disabled:opacity-50 mt-2"
        >
          {submitting
            ? <span className="flex items-center justify-center gap-2"><Spinner size={5} /> שולח…</span>
            : 'שלח בחינה'}
        </button>
      </form>

      {/* Photo/document preview lightbox */}
      {lightbox !== null && (() => {
        const { items, index } = lightbox
        const item = items[index]
        return (
          <div
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
            onClick={() => setLightbox(null)}
            onTouchStart={(e) => setLbTouchStartX(e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (lbTouchStartX === null) return
              const delta = lbTouchStartX - e.changedTouches[0].clientX
              if (Math.abs(delta) > 50) {
                if (delta > 0) setLightbox((lb) => ({ ...lb, index: Math.min(items.length - 1, lb.index + 1) }))
                else setLightbox((lb) => ({ ...lb, index: Math.max(0, lb.index - 1) }))
              }
              setLbTouchStartX(null)
            }}
          >
            {/* Close — top-right */}
            <button
              className="absolute top-4 right-4 z-10 w-11 h-11 rounded-full bg-black/60 text-white text-2xl font-bold flex items-center justify-center"
              onClick={(e) => { e.stopPropagation(); setLightbox(null) }}
            >×</button>

            {/* Prev arrow — right side */}
            {index > 0 && (
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-14 h-14 rounded-full bg-black/60 text-white text-4xl flex items-center justify-center"
                onClick={(e) => { e.stopPropagation(); setLightbox((lb) => ({ ...lb, index: lb.index - 1 })) }}
              >›</button>
            )}

            {isVideoFile(item.file) ? (
              <video
                key={item.preview}
                src={item.preview}
                className="max-h-screen max-w-screen object-contain"
                controls
                autoPlay
                playsInline
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img
                src={item.preview}
                className="max-h-screen max-w-screen object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            )}

            {/* Next arrow — left side */}
            {index < items.length - 1 && (
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-14 h-14 rounded-full bg-black/60 text-white text-4xl flex items-center justify-center"
                onClick={(e) => { e.stopPropagation(); setLightbox((lb) => ({ ...lb, index: lb.index + 1 })) }}
              >‹</button>
            )}

            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/40 px-3 py-1 rounded-full">
              {index + 1} / {items.length}
            </span>
          </div>
        )
      })()}
    </div>
  )
}
