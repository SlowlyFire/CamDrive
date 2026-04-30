import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import TopBar from '../../components/TopBar'
import Spinner from '../../components/Spinner'

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

function formatRelative(date) {
  if (!date) return ''
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'עכשיו'
  if (mins < 60) return `לפני ${mins} דק'`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `לפני ${hrs} שע'`
  return `לפני ${Math.floor(hrs / 24)} ימים`
}

function formatCheckedAt(date) {
  if (!date) return null
  const d = new Date(date)
  const now = new Date()
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return `עודכן: ${time}`
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `עודכן: אתמול ${time}`
  return `עודכן: ${d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })} ${time}`
}

export default function FuelCards() {
  const navigate = useNavigate()
  const myName = localStorage.getItem('myName') || ''

  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState(null) // { card, type: 'take' | 'return' }
  const [form, setForm] = useState({ person: myName, liters: '', notes: '', isEmpty: false })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function load() {
    api.get('/fuel-cards')
      .then((r) => setCards(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function openTake(card) {
    setForm({ person: myName, liters: card.litersRemaining ?? '', notes: '', isEmpty: false })
    setAction({ card, type: 'take' })
    setError('')
  }

  function openReturn(card, presetEmpty = false) {
    setForm({ person: card.currentHolder || myName, liters: presetEmpty ? '' : (card.litersRemaining ?? ''), notes: '', isEmpty: presetEmpty })
    setAction({ card, type: 'return' })
    setError('')
  }

  async function submit() {
    if (!form.isEmpty && (form.liters === '' || form.liters == null)) {
      setError('יש להזין יתרת ליטרים')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const endpoint = action.type === 'take' ? 'take' : 'return'
      await api.post(`/fuel-cards/${action.card.cardId}/${endpoint}`, {
        person: form.person,
        litersRemaining: form.liters !== '' ? Number(form.liters) : null,
        notes: form.notes,
        ...(action.type === 'return' ? { isEmpty: form.isEmpty } : {}),
      })
      setAction(null)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      <TopBar title="כרטיסי דלק" back="/team/menu" />

      {/* Fuel admin link */}
      <div className="px-4 pt-4">
        <a
          href="https://fueladmin.goodi.co.il/_fuel/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 bg-blue-50 border-2 border-blue-200 rounded-xl text-blue-800 font-bold text-sm active:bg-blue-100"
        >
          ⛽ בדוק יתרה באתר דלק
        </a>
      </div>

      {/* Cards list */}
      <div className="flex-1 p-4 flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : cards.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-5xl mb-3">⛽</p>
            <p className="font-semibold">אין כרטיסי דלק פעילים</p>
          </div>
        ) : (
          cards.filter((card) => card.status !== 'empty').map((card) => {
            const isTakenByMe = card.status === 'taken' && card.currentHolder === myName
            const isTakenByOther = card.status === 'taken' && card.currentHolder !== myName

            return (
              <div key={card._id} className="bg-white rounded-xl border border-gray-200 p-4">
                {/* Card header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-black text-xl text-gray-900">{card.cardId}</p>
                    {card.litersRemaining != null && (
                      <p className="text-sm text-gray-500 mt-0.5">יתרה: {card.litersRemaining} ל'</p>
                    )}
                    {card.balanceCheckedAt && (
                      <p className="text-xs text-blue-400 mt-0.5">{formatCheckedAt(card.balanceCheckedAt)}</p>
                    )}
                    {card.currentHolder && (
                      <p className="text-sm text-gray-500">אצל: {card.currentHolder}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">{formatRelative(card.lastUpdated)}</p>
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

                {/* Actions */}
                {card.status === 'available' && (
                  <button
                    onClick={() => openTake(card)}
                    className="w-full py-2.5 bg-blue-900 text-white font-bold rounded-xl text-sm active:opacity-80"
                  >
                    לקחת כרטיס
                  </button>
                )}
                {isTakenByMe && (
                  <button
                    onClick={() => openReturn(card)}
                    className="w-full py-2.5 bg-green-600 text-white font-bold rounded-xl text-sm active:opacity-80"
                  >
                    להחזיר כרטיס
                  </button>
                )}
                {isTakenByOther && (
                  <p className="text-center text-sm text-yellow-700 font-semibold py-1 break-words">
                    🔒 נמצא אצל {card.currentHolder}
                  </p>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Action modal */}
      {action && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" dir="rtl">
          <div className="bg-white w-full rounded-t-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-xl text-gray-900">
                {action.type === 'take' ? 'לקיחת כרטיס' : 'החזרת כרטיס'} — {action.card.cardId}
              </h2>
              <button
                onClick={() => setAction(null)}
                className="text-gray-400 text-2xl font-bold leading-none"
              >
                ×
              </button>
            </div>

            {/* Person */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">שם</label>
              <input
                type="text"
                value={form.person}
                onChange={(e) => setForm((f) => ({ ...f, person: e.target.value }))}
                placeholder="שמך"
                className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-base focus:border-blue-900 outline-none"
              />
            </div>

            {/* Liters */}
            {!form.isEmpty && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">יתרה בליטרים</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.liters}
                  onChange={(e) => setForm((f) => ({ ...f, liters: e.target.value }))}
                  placeholder="כמה ליטרים נותרו"
                  className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-base focus:border-blue-900 outline-none"
                />
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">הערות (אופציונלי)</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="הערות נוספות..."
                className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-base focus:border-blue-900 outline-none"
              />
            </div>

            {/* Empty toggle (return only) */}
            {action.type === 'return' && (
              <label className="flex items-center gap-3 cursor-pointer">
                <span className="font-bold text-red-600">הכרטיס ריק</span>
                <div
                  onClick={() => setForm((f) => ({ ...f, isEmpty: !f.isEmpty, liters: '' }))}
                  className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${form.isEmpty ? 'bg-red-600' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-0 w-6 h-6 bg-white rounded-full shadow transition-all ${form.isEmpty ? 'left-6' : 'left-0'}`} />
                </div>
              </label>
            )}

            {error && <p className="text-red-600 text-sm font-semibold">{error}</p>}

            <button
              onClick={submit}
              disabled={submitting || !form.person.trim() || (!form.isEmpty && form.liters === '')}
              className="w-full py-4 bg-blue-900 text-white font-black text-lg rounded-xl disabled:opacity-50"
            >
              {submitting ? <Spinner size={5} /> : action.type === 'take' ? 'לקחת' : 'להחזיר'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
