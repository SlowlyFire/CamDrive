import { useNavigate } from 'react-router-dom'
import StatusBadge from './StatusBadge'
import { formatDateTime } from '../utils/imageUtils'

export default function InspectionCard({ inspection, linkTo }) {
  const navigate = useNavigate()
  const typeLabel = inspection.type === 'enlistment' ? 'גיוס' : 'שחרור'
  const typeColor = inspection.type === 'enlistment' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 active:bg-gray-50 cursor-pointer"
      onClick={() => linkTo && navigate(linkTo)}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-lg text-gray-900">{inspection.licensePlate}</p>
          <p className="text-sm text-gray-500">{formatDateTime(inspection.createdAt)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typeColor}`}>{typeLabel}</span>
          <StatusBadge status={inspection.status} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
        {inspection.members?.length > 0 && (
          <span>👥 {inspection.members.join(', ')}</span>
        )}
        {inspection.location && <span>📍 {inspection.location}</span>}
        {inspection.vehicleHours != null && <span>⏱ {inspection.vehicleHours} שע״מ</span>}
        <span>🖼 {inspection.photos?.length || 0} תמונות</span>
        {inspection.status === 'partially_approved' && inspection.failedUploads?.length > 0 && (
          <span className="text-orange-600 font-bold">⚠️ {inspection.failedUploads.length} קבצים לא הועלו</span>
        )}
      </div>
    </div>
  )
}
