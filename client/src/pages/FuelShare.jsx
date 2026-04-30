import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import api from '../utils/api'
import Spinner from '../components/Spinner'

const STATUS_LABEL = { available: 'בחמל', taken: 'נלקח', empty: 'ריק' }
const STATUS_COLOR = {
  available: 'bg-green-100 text-green-800',
  taken:     'bg-yellow-100 text-yellow-800',
  empty:     'bg-red-100 text-red-800',
}
const FUEL_COLOR = {
  'סולר':  'bg-gray-800 text-white',
  'בנזין': 'bg-red-600 text-white',
}

function formatTime(date) {
  if (!date) return ''
  return new Date(date).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

export default function FuelShare() {
  const { token } = useParams()
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastRefresh, setLastRefresh] = useState(null)
  const [filters, setFilters] = useState({ available: true, taken: true, empty: true })

  const load = useCallback(() => {
    api.get(`/fuel-cards/share/${token}`)
      .then((r) => {
        setCards(r.data)
        setLastRefresh(new Date())
        setError('')
      })
      .catch(() => setError('קישור לא תקין'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    load()
    const interval = setInterval(load, 60000) // auto-refresh every 60s
    return () => clearInterval(interval)
  }, [load])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size={10} />
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center" dir="rtl">
      <div>
        <p className="text-5xl mb-4">⛽</p>
        <p className="text-gray-600 font-semibold">{error}</p>
      </div>
    </div>
  )

  const available = cards.filter((c) => c.status === 'available').length
  const taken     = cards.filter((c) => c.status === 'taken').length
  const empty     = cards.filter((c) => c.status === 'empty').length

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-gray-900 text-white px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">CamDrive — שיתוף</p>
            <h1 className="text-xl font-black">כרטיסי דלק</h1>
          </div>
          <div className="text-left">
            <p className="text-xs text-gray-400">עדכון אוטומטי כל 60 שנ'</p>
            {lastRefresh && (
              <p className="text-xs text-gray-300">{formatTime(lastRefresh)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Summary row */}
      <div className="px-4 pt-4 grid grid-cols-3 gap-2">
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-green-800">{available}</p>
          <p className="text-xs text-green-600 font-semibold">בחמל</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-yellow-800">{taken}</p>
          <p className="text-xs text-yellow-600 font-semibold">נלקחו</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-red-800">{empty}</p>
          <p className="text-xs text-red-600 font-semibold">ריקים</p>
        </div>
      </div>

      {/* Filter buttons */}
      <div className="px-4 pt-3 flex gap-2">
        {[
          { key: 'available', label: 'בחמל',  on: 'bg-green-600 text-white border-green-600',  off: 'bg-white text-green-700 border-green-600' },
          { key: 'taken',     label: 'נלקחו', on: 'bg-yellow-500 text-white border-yellow-500', off: 'bg-white text-yellow-700 border-yellow-500' },
          { key: 'empty',     label: 'ריקים', on: 'bg-red-600 text-white border-red-600',       off: 'bg-white text-red-600 border-red-600' },
        ].map(({ key, label, on, off }) => (
          <button
            key={key}
            onClick={() => setFilters((f) => ({ ...f, [key]: !f[key] }))}
            className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-colors ${filters[key] ? on : off}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Cards list */}
      <div className="p-4 flex flex-col gap-3">
        {cards.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-5xl mb-3">⛽</p>
            <p className="font-semibold">אין כרטיסי דלק</p>
          </div>
        ) : (
          cards.filter((c) => filters[c.status]).map((card) => (
            <div key={card._id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-black text-xl text-gray-900">{card.cardId}</p>
                  {card.status === 'taken' && card.currentHolder && (
                    <p className="text-sm text-gray-600 mt-0.5">אצל: <span className="font-bold">{card.currentHolder}</span></p>
                  )}
                  {card.litersRemaining != null && (
                    <p className="text-sm text-gray-500">יתרה: {card.litersRemaining} ל'</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${FUEL_COLOR[card.fuelType]}`}>
                    {card.fuelType}
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[card.status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABEL[card.status] || card.status}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
