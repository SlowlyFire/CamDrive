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

  useEffect(() => {
    load()
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      <TopBar title={`${typeLabel} — ${inspection.licensePlate}`} back="/team/pending" />

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

        {/* Details */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2">
          {inspection.members?.length > 0 && (
            <Row label="צוות" value={inspection.members.join(', ')} />
          )}
          {inspection.location && <Row label="מיקום" value={inspection.location} />}
          {inspection.vehicleHours != null && <Row label="שע״מ" value={inspection.vehicleHours} />}
          {inspection.securityCode && <Row label="קודן" value={inspection.securityCode} />}
          {inspection.notes && <Row label="הערות" value={inspection.notes} />}
        </div>

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

        {error && <p className="text-red-600 text-sm">{error}</p>}
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
