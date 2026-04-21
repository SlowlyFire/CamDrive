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
  const [photos, setPhotos] = useState([]) // { file, preview }
  const [documents, setDocuments] = useState([]) // { file, preview }
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

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
  }

  function addPhotos(files) {
    const newPhotos = files.map((f) => ({ file: f, preview: URL.createObjectURL(f) }))
    setPhotos((p) => [...p, ...newPhotos])
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
    // Reset input so same file can be added again if removed
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
    if (!form.licensePlate.trim()) { setError('נא להזין מספר רישוי'); return }
    if (!form.vehicleType) { setError('נא לבחור סוג כלי'); return }
    if (photos.length === 0) { setError('נא להוסיף לפחות תמונה אחת'); return }
    setError('')
    setSubmitting(true)
    setProgress(0)

    const fd = new FormData()
    fd.append('data', JSON.stringify({
      ...form,
      vehicleHours: form.vehicleHours ? Number(form.vehicleHours) : null,
    }))
    photos.forEach((p) => fd.append('photos', p.file))
    documents.forEach((d) => fd.append('documents', d.file))

    try {
      await api.post('/inspections', fd, {
        onUploadProgress: (e) => setProgress(Math.round((e.loaded / e.total) * 100)),
      })
      // Cleanup previews
      photos.forEach((p) => URL.revokeObjectURL(p.preview))
      documents.forEach((d) => URL.revokeObjectURL(d.preview))
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'שגיאה בשליחה')
      setSubmitting(false)
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
          <label className="block text-sm font-bold text-gray-700 mb-1">מספר רישוי</label>
          <input
            type="text"
            inputMode="numeric"
            value={form.licensePlate}
            onChange={(e) => setForm((f) => ({ ...f, licensePlate: e.target.value }))}
            placeholder="למשל: 181398"
            className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-lg font-mono focus:border-blue-900 outline-none"
          />
        </div>

        {/* Vehicle type */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">סוג כלי *</label>
          <select
            value={form.vehicleType}
            onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value }))}
            className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-lg focus:border-blue-900 outline-none bg-white"
            required
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
          <label className="block text-sm font-bold text-gray-700 mb-2">חברי צוות</label>
          <div className="flex flex-wrap gap-2">
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
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={addDocuments}
              disabled={submitting}
            />
          </label>
          {documents.length > 0 && (
            <div className="grid grid-cols-4 gap-1 mt-2">
              {documents.map((d, i) => (
                <div key={i} className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
                  <img src={d.preview} className="w-full h-full object-cover" alt="" />
                  <button
                    type="button"
                    onClick={() => removeDocument(i)}
                    className="absolute top-0.5 left-0.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Photos & Videos */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">תמונות וסרטונים ({photos.length})</label>
          <PhotoUploader onFilesReady={addPhotos} disabled={submitting} />
          {photos.length > 0 && (
            <div className="grid grid-cols-4 gap-1 mt-2">
              {photos.map((p, i) => (
                <div key={i} className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
                  {isVideoFile(p.file) ? (
                    <VideoPreview src={p.preview} name={p.file.name} />
                  ) : (
                    <img src={p.preview} className="w-full h-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-0.5 left-0.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-red-600 text-sm font-semibold">{error}</p>}

        {submitting && (
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-blue-900 h-3 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-4 bg-blue-900 text-white font-black text-xl rounded-xl disabled:opacity-50 mt-2"
        >
          {submitting ? <span className="flex items-center justify-center gap-2"><Spinner size={5} /> שולח…</span> : 'שלח בחינה'}
        </button>
      </form>
    </div>
  )
}
