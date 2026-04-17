import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import TopBar from '../../components/TopBar'
import InspectionCard from '../../components/InspectionCard'
import Spinner from '../../components/Spinner'

export default function PendingInspections() {
  const navigate = useNavigate()
  const name = localStorage.getItem('myName')
  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!name) { navigate('/team'); return }
    api.get(`/inspections/my/${encodeURIComponent(name)}`)
      .then((r) => setInspections(r.data))
      .finally(() => setLoading(false))
  }, [name, navigate])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      <TopBar title="בחינות פתוחות" back="/team/menu" />

      <div className="flex-1 p-4">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : inspections.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-5xl mb-3">📋</p>
            <p className="font-semibold">אין בחינות פתוחות</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {inspections.map((insp) => (
              <InspectionCard
                key={insp._id}
                inspection={insp}
                linkTo={`/team/inspection/${insp._id}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
