import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import TopBar from '../../components/TopBar'

export default function TeamMenu() {
  const navigate = useNavigate()
  const name = localStorage.getItem('myName')
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!name) { navigate('/team'); return }
    api.get(`/inspections/my/${encodeURIComponent(name)}`)
      .then((r) => setPendingCount(r.data.length))
      .catch(() => {})
  }, [name, navigate])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      <TopBar title={`שלום, ${name}`} back="/team" />

      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
        <button
          onClick={() => navigate('/team/new')}
          className="w-full max-w-xs bg-blue-900 text-white font-black text-2xl py-10 rounded-2xl shadow active:scale-95 transition-transform"
        >
          בחינה חדשה
        </button>

        <button
          onClick={() => navigate('/team/pending')}
          className="relative w-full max-w-xs bg-white border-2 border-blue-900 text-blue-900 font-black text-2xl py-10 rounded-2xl shadow active:scale-95 transition-transform"
        >
          בחינות פתוחות
          {pendingCount > 0 && (
            <span className="absolute top-3 left-3 bg-red-600 text-white text-sm font-bold rounded-full w-7 h-7 flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => navigate('/team/fuel-cards')}
          className="w-full max-w-xs bg-white border-2 border-gray-800 text-gray-800 font-black text-2xl py-10 rounded-2xl shadow active:scale-95 transition-transform"
        >
          ⛽ כרטיסי דלק
        </button>
      </div>
    </div>
  )
}
