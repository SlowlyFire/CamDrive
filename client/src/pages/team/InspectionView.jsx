import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import TopBar from '../../components/TopBar'
import PhotoGrid from '../../components/PhotoGrid'
import PhotoUploader from '../../components/PhotoUploader'
import StatusBadge from '../../components/StatusBadge'
import Spinner from '../../components/Spinner'
import { formatDateTime } from '../../utils/imageUtils'

export default function InspectionView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [inspection, setInspection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [resubmitting, setResubmitting] = useState(false)
  const [error, setError] = useState('')

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [vehicleTypes, setVehicleTypes] = useState([])

  useEffect(() => {
    load()
    api.get('/vehicle-types').then((r) => setVehicleTypes(r.data)).catch(() => {})
  }, [id])

  async function load() {
    setLoading(true)
    try {
      const r = await api.get(`/inspections/${id}`)
      setInspection(r.data)
    } catch {
      setError('לא ניתן לטעון את הבחינה')
    } finally {
      setLoading(false)
    }
  }

  function startEdit() {
    setEditForm({
      type: inspection.type || 'enlistment',
      vehicleType: inspection.vehicleType || '',
      notes: inspection.notes || '',
      location: inspection.location || '',
      vehicleHours: inspection.vehicleHours != null ? String(inspection.vehicleHours) : '',
      vehicleHoursDigital: inspection.vehicleHoursDigital != null ? String(inspection.vehicleHoursDigital) : '',
      vehicleHoursAnalog: inspection.vehicleHoursAnalog != null ? String(inspection.vehicleHoursAnalog) : '',
      kilometers: inspection.kilometers != null ? String(inspection.kilometers) : '',
      securityCode: inspection.securityCode || '',
    })
    setIsEditing(true)
    setError('')
  }

  function cancelEdit() {
    setIsEditing(false)
    setError('')
  }

  async function saveText() {
    setSaving(true)
    setError('')
    try {
      const r = await api.put(`/inspections/${id}/text`, {
        type: editForm.type,
        vehicleType: editForm.vehicleType,
        notes: editForm.notes,
        location: editForm.location,
        vehicleHours: editForm.vehicleHours,
        vehicleHoursDigital: editForm.vehicleHoursDigital,
        vehicleHoursAnalog: editForm.vehicleHoursAnalog,
        kilometers: editForm.kilometers,
        securityCode: editForm.securityCode,
      })
      setInspection(r.data)
      setIsEditing(false)
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  async function addPhotos(files) {
    setUploading(true)
    try {
      const fd = new FormData()
      files.forEach((f) => fd.append('photos', f))
      const r = await api.put(`/inspections/${id}/photos`, fd)
      setInspection(r.data)
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בהעלאה')
    } finally {
      setUploading(false)
    }
  }

  async function deletePhoto(filename) {
    try {
      await api.delete(`/inspections/${id}/photos/${filename}`)
      setInspection((i) => ({ ...i, photos: i.photos.filter((p) => p.filename !== filename) }))
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה במחיקה')
    }
  }

  async function addDocuments(e) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    e.target.value = ''
    setUploading(true)
    try {
      const fd = new FormData()
      files.forEach((f) => fd.append('documents', f))
      const r = await api.put(`/inspections/${id}/documents`, fd)
      setInspection(r.data)
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בהעלאה')
    } finally {
      setUploading(false)
    }
  }

  async function deleteDocument(filename) {
    try {
      await api.delete(`/inspections/${id}/documents/${filename}`)
      setInspection((i) => ({ ...i, documents: (i.documents || []).filter((d) => d.filename !== filename) }))
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה במחיקה')
    }
  }

  async function resubmit() {
    setResubmitting(true)
    setError('')
    try {
      const r = await api.put(`/inspections/${id}/resubmit`)
      setInspection(r.data.inspection)
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בשליחה מחדש')
    } finally {
      setResubmitting(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      <TopBar title="בחינה" back="/team/pending" />
      <div className="flex justify-center py-16"><Spinner /></div>
    </div>
  )

  if (!inspection) return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      <TopBar title="שגיאה" back="/team/pending" />
      <p className="p-4 text-red-600">{error}</p>
    </div>
  )

  const isPending = inspection.status === 'pending'
  const isRejected = inspection.status === 'rejected'
  const isEditable = isPending || isRejected
  const typeLabel = inspection.type === 'enlistment' ? 'גיוס' : 'שחרור'

  const editAction = isEditable ? (
    isEditing ? (
      <button
        onClick={cancelEdit}
        className="text-blue-200 text-sm font-bold px-2 py-1"
      >
        ביטול
      </button>
    ) : (
      <button
        onClick={startEdit}
        className="text-white text-lg px-1"
        aria-label="ערוך פרטים"
      >
        ✏️
      </button>
    )
  ) : null

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      <TopBar title={`${typeLabel} — ${inspection.licensePlate}`} back="/team/pending" action={editAction} />

      <div className="flex-1 p-4 flex flex-col gap-4 pb-8">
        {/* Rejection banner */}
        {isRejected && (
          <div className="bg-red-50 border-2 border-red-400 rounded-xl p-4">
            <p className="text-red-800 font-black text-base mb-1">❌ הבחינה נדחתה</p>
            {inspection.rejectionReason && (
              <p className="text-red-700 text-sm">{inspection.rejectionReason}</p>
            )}
            <p className="text-red-600 text-xs mt-2">ניתן להוסיף / להחליף תמונות ולשלוח מחדש</p>
          </div>
        )}

        {/* Status */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
          <span className="text-gray-500 text-sm">{formatDateTime(inspection.createdAt)}</span>
          <StatusBadge status={inspection.status} />
        </div>

        {/* Details — view or edit mode */}
        {isEditing ? (
          <div className="bg-white rounded-xl border-2 border-blue-300 p-4 flex flex-col gap-3">
            <p className="font-bold text-blue-900 text-sm mb-1">עריכת פרטים</p>

            {/* Type toggle */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">סוג בחינה</label>
              <div className="flex rounded-xl overflow-hidden border-2 border-blue-900">
                {[['enlistment', 'גיוס'], ['release', 'שחרור']].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setEditForm((f) => ({ ...f, type: val }))}
                    className={`flex-1 py-2.5 text-base font-black transition-colors ${
                      editForm.type === val ? 'bg-blue-900 text-white' : 'bg-white text-blue-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">סוג כלי</label>
              <select
                value={editForm.vehicleType}
                onChange={(e) => setEditForm((f) => ({ ...f, vehicleType: e.target.value }))}
                className="w-full border-2 border-gray-300 rounded-xl px-3 py-2 text-base focus:border-blue-900 outline-none bg-white"
              >
                <option value="">בחר סוג כלי...</option>
                {vehicleTypes.map((t) => (
                  <option key={t._id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">מיקום</label>
              <input type="text" value={editForm.location}
                onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="שם הבסיס / מיקום"
                className="w-full border-2 border-gray-300 rounded-xl px-3 py-2 text-base focus:border-blue-900 outline-none" />
            </div>

            {/* Dynamic hours fields */}
            {(() => {
              const vt = editForm.vehicleType || ''
              const isBager = vt.includes('באגר גלגלי') || vt.includes('באגר זחל')
              const isRaizer = vt.includes('רייזר')
              if (isBager) return (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-gray-500 mb-1">שע״מ דיגיטלי</label>
                    <input type="number" inputMode="numeric" value={editForm.vehicleHoursDigital}
                      onChange={(e) => setEditForm((f) => ({ ...f, vehicleHoursDigital: e.target.value }))}
                      className="w-full border-2 border-gray-300 rounded-xl px-3 py-2 text-base focus:border-blue-900 outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-gray-500 mb-1">שע״מ אנלוגי</label>
                    <input type="number" inputMode="numeric" value={editForm.vehicleHoursAnalog}
                      onChange={(e) => setEditForm((f) => ({ ...f, vehicleHoursAnalog: e.target.value }))}
                      className="w-full border-2 border-gray-300 rounded-xl px-3 py-2 text-base focus:border-blue-900 outline-none" />
                  </div>
                </div>
              )
              return (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">שע״מ</label>
                    <input type="number" inputMode="numeric" value={editForm.vehicleHours}
                      onChange={(e) => setEditForm((f) => ({ ...f, vehicleHours: e.target.value }))}
                      className="w-full border-2 border-gray-300 rounded-xl px-3 py-2 text-base focus:border-blue-900 outline-none" />
                  </div>
                  {isRaizer && (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">ק״מ</label>
                      <input type="number" inputMode="numeric" value={editForm.kilometers}
                        onChange={(e) => setEditForm((f) => ({ ...f, kilometers: e.target.value }))}
                        className="w-full border-2 border-gray-300 rounded-xl px-3 py-2 text-base focus:border-blue-900 outline-none" />
                    </div>
                  )}
                </>
              )
            })()}

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">קודן / קוד מיגון</label>
              <input type="text" value={editForm.securityCode}
                onChange={(e) => setEditForm((f) => ({ ...f, securityCode: e.target.value }))}
                placeholder="קוד מיגון"
                className="w-full border-2 border-gray-300 rounded-xl px-3 py-2 text-base focus:border-blue-900 outline-none" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">הערות / תקלות</label>
              <textarea value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3} placeholder="פרט תקלות, מצב הרכב..."
                className="w-full border-2 border-gray-300 rounded-xl px-3 py-2 text-base focus:border-blue-900 outline-none resize-none" />
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button onClick={saveText} disabled={saving}
              className="w-full py-3 bg-blue-900 text-white font-black rounded-xl disabled:opacity-50">
              {saving ? <Spinner size={4} /> : 'שמור שינויים'}
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2">
            {inspection.members?.length > 0 && <Row label="צוות" value={inspection.members.join(', ')} />}
            {inspection.location && <Row label="מיקום" value={inspection.location} />}
            {(() => {
              const vt = inspection.vehicleType || ''
              const isBager = vt.includes('באגר גלגלי') || vt.includes('באגר זחל')
              const isRaizer = vt.includes('רייזר')
              if (isBager) return (
                <>
                  {inspection.vehicleHoursDigital != null && <Row label="שע״מ דיגיטלי" value={inspection.vehicleHoursDigital} />}
                  {inspection.vehicleHoursAnalog != null && <Row label="שע״מ אנלוגי" value={inspection.vehicleHoursAnalog} />}
                </>
              )
              return (
                <>
                  {inspection.vehicleHours != null && <Row label="שע״מ" value={inspection.vehicleHours} />}
                  {isRaizer && inspection.kilometers != null && <Row label="ק״מ" value={inspection.kilometers} />}
                </>
              )
            })()}
            {inspection.securityCode && <Row label="קודן" value={inspection.securityCode} />}
            {inspection.notes && <Row label="הערות" value={inspection.notes} />}
          </div>
        )}

        {/* Documents */}
        {(isEditable || (inspection.documents?.length > 0)) && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="font-bold text-gray-700 mb-3">מסמכים וטפסים ({inspection.documents?.length || 0})</p>
            {inspection.documents?.length > 0 && (
              <PhotoGrid
                photos={inspection.documents}
                inspectionId={id}
                urlBase="documents"
                onDelete={isEditable ? deleteDocument : null}
                readOnly={!isEditable}
              />
            )}
            {isEditable && (
              <label className="flex items-center justify-center gap-2 w-full py-3 mt-2 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-white active:bg-gray-50 text-gray-600 font-semibold text-sm">
                <span>📄 הוסף מסמכים</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={addDocuments}
                  disabled={uploading}
                />
              </label>
            )}
          </div>
        )}

        {/* Photos */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="font-bold text-gray-700 mb-3">תמונות וסרטונים ({inspection.photos.length})</p>
          <PhotoGrid
            photos={inspection.photos}
            inspectionId={id}
            onDelete={isEditable ? deletePhoto : null}
            readOnly={!isEditable}
          />
          {isEditable && (
            <div className="mt-3">
              <PhotoUploader onFilesReady={addPhotos} disabled={uploading} />
            </div>
          )}
        </div>

        {/* Resubmit button for rejected inspections */}
        {isRejected && (
          <button
            onClick={resubmit}
            disabled={resubmitting}
            className="w-full py-4 bg-blue-900 text-white font-black text-xl rounded-xl disabled:opacity-50"
          >
            {resubmitting ? <Spinner size={5} /> : '🔄 שלח מחדש לאישור'}
          </button>
        )}

        {!isEditing && error && <p className="text-red-600 text-sm">{error}</p>}
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-gray-500 shrink-0">{label}:</span>
      <span className="text-gray-900 font-medium break-words min-w-0">{value}</span>
    </div>
  )
}
