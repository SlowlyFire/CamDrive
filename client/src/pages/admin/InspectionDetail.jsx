import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import TopBar from '../../components/TopBar'
import PhotoGrid from '../../components/PhotoGrid'
import StatusBadge from '../../components/StatusBadge'
import Spinner from '../../components/Spinner'
import { formatDateTime } from '../../utils/imageUtils'

export default function InspectionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [inspection, setInspection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [result, setResult] = useState(null) // { type: 'approved'|'partially_approved'|'rejected', folderName? }
  const [retrying, setRetrying] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/inspections/${id}`)
      .then((r) => setInspection(r.data))
      .catch(() => setError('לא ניתן לטעון'))
      .finally(() => setLoading(false))
  }, [id])

  async function approve() {
    if (!confirm('לאשר את הבחינה ולהעלות לDrive?')) return
    setActionLoading(true)
    setError('')
    try {
      const r = await api.post(`/inspections/${id}/approve`)
      const status = r.data.inspection?.status || 'approved'
      setResult({ type: status, folderName: r.data.driveFolderName })
      setInspection(r.data.inspection)
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה באישור')
    } finally {
      setActionLoading(false)
    }
  }

  async function retryUploads() {
    setRetrying(true)
    setError('')
    try {
      const r = await api.post(`/inspections/${id}/retry-uploads`)
      setInspection(r.data.inspection)
      if (r.data.inspection.status === 'approved') {
        setResult({ type: 'approved', folderName: null })
      }
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בניסיון חוזר')
    } finally {
      setRetrying(false)
    }
  }

  function downloadFailedZip() {
    const a = document.createElement('a')
    a.href = `/api/inspections/${id}/download-failed-zip`
    a.download = `failed-${inspection.licensePlate}.zip`
    a.click()
  }

  async function reject() {
    if (!rejectReason.trim()) return
    setActionLoading(true)
    setError('')
    try {
      await api.post(`/inspections/${id}/reject`, { reason: rejectReason })
      setResult({ type: 'rejected' })
      setInspection((i) => ({ ...i, status: 'rejected', rejectionReason: rejectReason }))
      setShowRejectForm(false)
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בדחייה')
    } finally {
      setActionLoading(false)
    }
  }

  function copyShareLink() {
    const url = `${window.location.origin}/share/${inspection.shareToken}`
    navigator.clipboard.writeText(url).then(() => alert('קישור הועתק!'))
  }

  async function deleteInspection() {
    setActionLoading(true)
    setError('')
    try {
      await api.post(`/inspections/${id}/delete`)
      navigate('/admin')
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה במחיקה')
      setActionLoading(false)
      setShowDeleteConfirm(false)
    }
  }

  async function downloadZip() {
    const a = document.createElement('a')
    a.href = `/api/inspections/${id}/download-zip`
    a.download = `inspection-${inspection.licensePlate}.zip`
    a.click()
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      <TopBar title="בחינה" back="/admin" />
      <div className="flex justify-center py-16"><Spinner /></div>
    </div>
  )

  if (!inspection) return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <TopBar title="שגיאה" back="/admin" />
      <p className="p-4 text-red-600">{error}</p>
    </div>
  )

  const typeLabel = inspection.type === 'enlistment' ? 'גיוס' : 'שחרור'
  const isPending = inspection.status === 'pending'
  const isPartiallyApproved = inspection.status === 'partially_approved'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      <TopBar title={`${typeLabel} — ${inspection.licensePlate}`} back="/admin" />

      <div className="flex-1 p-4 flex flex-col gap-4 pb-8">

        {/* Result banner */}
        {result?.type === 'approved' && (
          <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4">
            <p className="text-green-800 font-bold">✅ הבחינה אושרה ועלתה ל-Drive!</p>
            {result.folderName && (
              <p className="text-green-700 text-sm mt-1">📁 {result.folderName}</p>
            )}
          </div>
        )}
        {result?.type === 'partially_approved' && (
          <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4">
            <p className="text-orange-800 font-bold">⚠️ אושר חלקית — חלק מהקבצים לא הועלו</p>
            <p className="text-orange-700 text-sm mt-1">ראה פירוט בהמשך</p>
          </div>
        )}
        {result?.type === 'rejected' && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
            <p className="text-red-800 font-bold">❌ הבחינה נדחתה</p>
          </div>
        )}

        {/* Status row */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
          <span className="text-gray-500 text-sm">{formatDateTime(inspection.createdAt)}</span>
          <StatusBadge status={inspection.status} />
        </div>

        {/* Metadata */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2">
          {inspection.members?.length > 0 && <Row label="צוות" value={inspection.members.join(', ')} />}
          {inspection.location && <Row label="מיקום" value={inspection.location} />}
          {inspection.vehicleHours != null && <Row label="שע״מ" value={inspection.vehicleHours} />}
          {inspection.securityCode && <Row label="קודן" value={inspection.securityCode} />}
          {inspection.notes && <Row label="הערות" value={inspection.notes} />}
          {inspection.status === 'rejected' && inspection.rejectionReason && (
            <div className="mt-2 p-3 bg-red-50 rounded-lg">
              <p className="text-red-700 text-sm font-bold">סיבת דחייה:</p>
              <p className="text-red-600 text-sm">{inspection.rejectionReason}</p>
            </div>
          )}
        </div>

        {/* Photos */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="font-bold text-gray-700 mb-3">תמונות וסרטונים ({inspection.photos.length})</p>
          {inspection.status === 'approved' && inspection.driveFolderId ? (
            <a
              href={`https://drive.google.com/drive/folders/${inspection.driveFolderId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-4 bg-blue-50 border-2 border-blue-200 rounded-xl text-blue-800 font-bold text-base active:bg-blue-100"
            >
              צפה בתמונות בדרייב 📂
            </a>
          ) : (
            <>
              <PhotoGrid photos={inspection.photos} inspectionId={id} readOnly />
              {inspection.status === 'partially_approved' && inspection.driveFolderId && (
                <a
                  href={`https://drive.google.com/drive/folders/${inspection.driveFolderId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full mt-3 py-3 bg-blue-50 border-2 border-blue-200 rounded-xl text-blue-800 font-bold text-sm active:bg-blue-100"
                >
                  צפה בקבצים שהועלו בדרייב 📂
                </a>
              )}
            </>
          )}
        </div>

        {/* Partially approved — failed uploads warning + actions */}
        {isPartiallyApproved && inspection.failedUploads?.length > 0 && (
          <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4 flex flex-col gap-3">
            <p className="font-black text-orange-800">
              ⚠️ {inspection.failedUploads.length} קבצים לא הועלו לדרייב
            </p>
            <ul className="text-sm text-orange-700 flex flex-col gap-1">
              {inspection.failedUploads.map((f) => (
                <li key={f.filename} className="font-mono truncate">
                  • {f.originalName || f.filename}
                  {f.error && <span className="text-orange-500 text-xs"> — {f.error}</span>}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button
                onClick={retryUploads}
                disabled={retrying}
                className="flex-1 py-3 bg-orange-600 text-white font-bold rounded-xl disabled:opacity-50 text-sm"
              >
                {retrying ? '…' : '🔄 נסה שוב'}
              </button>
              <button
                onClick={downloadFailedZip}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl text-sm"
              >
                📥 הורד קבצים שנכשלו
              </button>
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={copyShareLink}
            className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl text-sm"
          >
            🔗 שתף
          </button>
          {(inspection.status === 'approved' || inspection.status === 'partially_approved') && (
            <button
              onClick={downloadZip}
              className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl text-sm"
            >
              📥 ZIP
            </button>
          )}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="py-3 px-4 bg-red-100 text-red-700 font-bold rounded-xl text-sm"
          >
            🗑️
          </button>
        </div>

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="bg-white border-2 border-red-300 rounded-xl p-4 flex flex-col gap-3">
            <p className="font-bold text-red-700">למחוק את הבחינה?</p>
            <p className="text-gray-600 text-sm">פעולה זו לא ניתנת לביטול. הבחינה תוסר מהרשימה.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl"
              >
                ביטול
              </button>
              <button
                onClick={deleteInspection}
                disabled={actionLoading}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl disabled:opacity-50"
              >
                {actionLoading ? '…' : 'מחק'}
              </button>
            </div>
          </div>
        )}

        {isPending && !result && (
          <>
            {error && !isPartiallyApproved && <p className="text-red-600 text-sm">{error}</p>}

            {!showRejectForm ? (
              <div className="flex flex-col gap-3">
                <button
                  onClick={approve}
                  disabled={actionLoading}
                  className="w-full py-4 bg-green-600 text-white font-black text-xl rounded-xl disabled:opacity-50"
                >
                  {actionLoading ? <Spinner size={5} /> : '✅ אשר ועלה ל-Drive'}
                </button>
                <button
                  onClick={() => setShowRejectForm(true)}
                  className="w-full py-4 bg-red-600 text-white font-black text-xl rounded-xl"
                >
                  ❌ דחה
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-xl border-2 border-red-300 p-4 flex flex-col gap-3">
                <p className="font-bold text-red-700">סיבת דחייה</p>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="פרט את הסיבה לדחייה…"
                  className="border-2 border-gray-300 rounded-xl px-3 py-2 text-base resize-none focus:border-red-400 outline-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowRejectForm(false)}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl"
                  >
                    ביטול
                  </button>
                  <button
                    onClick={reject}
                    disabled={actionLoading || !rejectReason.trim()}
                    className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl disabled:opacity-50"
                  >
                    {actionLoading ? '…' : 'שלח דחייה'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
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
