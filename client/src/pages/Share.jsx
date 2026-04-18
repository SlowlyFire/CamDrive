import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import api from '../utils/api'
import PhotoGrid from '../components/PhotoGrid'
import StatusBadge from '../components/StatusBadge'
import Spinner from '../components/Spinner'
import { formatDateTime } from '../utils/imageUtils'

export default function Share() {
  const { token } = useParams()
  const [inspection, setInspection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/inspections/share/${token}`)
      .then((r) => setInspection(r.data))
      .catch(() => setError('קישור לא תקין או פג תוקף'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size={10} />
    </div>
  )

  if (error || !inspection) return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center" dir="rtl">
      <div>
        <p className="text-5xl mb-4">🔗</p>
        <p className="text-gray-600 font-semibold">{error || 'לא נמצא'}</p>
      </div>
    </div>
  )

  const typeLabel = inspection.type === 'enlistment' ? 'גיוס' : 'שחרור'

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-blue-900 text-white px-4 py-4">
        <p className="text-xs text-blue-300 mb-1">CamDrive — קישור שיתוף</p>
        <h1 className="text-2xl font-black">{typeLabel} — {inspection.licensePlate}</h1>
        <p className="text-blue-200 text-sm mt-1">{formatDateTime(inspection.createdAt)}</p>
      </div>

      <div className="p-4 flex flex-col gap-4 pb-8">
        {/* Status */}
        <div className="flex justify-end">
          <StatusBadge status={inspection.status} />
        </div>

        {/* Details */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2">
          {inspection.members?.length > 0 && <Row label="צוות" value={inspection.members.join(', ')} />}
          {inspection.location && <Row label="מיקום" value={inspection.location} />}
          {inspection.vehicleHours != null && <Row label="שע״מ" value={inspection.vehicleHours} />}
          {inspection.securityCode && <Row label="קודן" value={inspection.securityCode} />}
          {inspection.notes && <Row label="הערות" value={inspection.notes} />}
        </div>

        {/* Photos — read-only */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="font-bold text-gray-700 mb-3">תמונות וסרטונים ({inspection.photos.length})</p>
          <PhotoGrid
            photos={inspection.photos}
            inspectionId={inspection._id}
            readOnly
          />
        </div>
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
