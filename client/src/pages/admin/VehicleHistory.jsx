import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import api from '../../utils/api'
import TopBar from '../../components/TopBar'
import InspectionCard from '../../components/InspectionCard'
import Spinner from '../../components/Spinner'
import { formatDateTime } from '../../utils/imageUtils'

export default function VehicleHistory() {
  const { plate } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/vehicle/${plate}`)
      .then((r) => setData(r.data))
      .finally(() => setLoading(false))
  }, [plate])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      <TopBar title={`רכב ${plate}`} back="/admin" />

      <div className="flex-1 p-4 flex flex-col gap-4 pb-8">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : (
          <>
            {/* Drive folders */}
            {data?.vehicle?.driveFolders?.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="font-bold text-gray-700 mb-3">תיקיות Drive</p>
                <div className="flex flex-col gap-2">
                  {data.vehicle.driveFolders.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 font-mono text-xs">{f.folderName}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        f.type === 'enlistment' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {f.type === 'enlistment' ? 'גיוס' : 'שחרור'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Inspection history */}
            <p className="font-bold text-gray-700">היסטוריית בחינות</p>
            {data?.inspections?.length > 0 ? (
              <div className="flex flex-col gap-3">
                {data.inspections.map((insp) => (
                  <InspectionCard
                    key={insp._id}
                    inspection={insp}
                    linkTo={`/admin/inspection/${insp._id}`}
                  />
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-center py-8">אין בחינות לרכב זה</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
