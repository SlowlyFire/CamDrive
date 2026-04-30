import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import InspectionCard from '../../components/InspectionCard'
import Spinner from '../../components/Spinner'

const TABS = [
  { id: 'pending',       label: 'ממתינים' },
  { id: 'today',         label: 'היום' },
  { id: 'vehicles',      label: 'כלים' },
  { id: 'people',        label: 'אנשים' },
  { id: 'vehicle-types', label: 'סוגי כלים' },
  { id: 'fuel-cards',    label: '⛽ דלק' },
  { id: 'stats',         label: 'סטטיסטיקות' },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('pending')
  const managerName = localStorage.getItem('managerName') || ''

  function logout() {
    localStorage.removeItem('adminToken')
    localStorage.removeItem('managerName')
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      {/* Header */}
      <div className="bg-blue-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <span className="font-black text-lg">CamDrive — {managerName || 'מנהל'}</span>
        <button onClick={logout} className="text-blue-300 text-sm font-semibold">יציאה</button>
      </div>

      {/* Tabs — scrollable on small screens */}
      <div className="bg-blue-900 border-t border-blue-800 flex sticky top-12 z-10 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-shrink-0 px-3 py-2.5 text-sm font-bold transition-colors whitespace-nowrap ${
              tab === t.id ? 'bg-white text-blue-900' : 'text-blue-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        {tab === 'pending'       && <PendingTab navigate={navigate} />}
        {tab === 'today'         && <TodayTab navigate={navigate} />}
        {tab === 'vehicles'      && <VehiclesTab navigate={navigate} />}
        {tab === 'people'        && <PeopleTab />}
        {tab === 'vehicle-types' && <VehicleTypesTab />}
        {tab === 'fuel-cards'    && <FuelCardsTab />}
        {tab === 'stats'         && <StatsTab />}
      </div>
    </div>
  )
}

// ── Pending Tab ────────────────────────────────────────────────────────────
function PendingTab({ navigate }) {
  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/inspections/pending')
      .then((r) => setInspections(r.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  if (inspections.length === 0) return (
    <div className="text-center py-16 text-gray-400">
      <p className="text-5xl mb-3">✅</p>
      <p className="font-semibold">אין בחינות ממתינות</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {inspections.map((insp) => (
        <InspectionCard
          key={insp._id}
          inspection={insp}
          linkTo={`/admin/inspection/${insp._id}`}
        />
      ))}
    </div>
  )
}

// ── Today Tab ──────────────────────────────────────────────────────────────
function TodayTab({ navigate }) {
  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [showEnlistment, setShowEnlistment] = useState(true)
  const [showRelease, setShowRelease] = useState(true)

  useEffect(() => {
    api.get('/inspections/today')
      .then((r) => setInspections(r.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  const CLASS_LABEL = { reserve: 'רזרבה', temporarily_disqualified: 'נפסל זמנית', disqualified: 'נפסל' }
  const CLASS_COLOR = {
    reserve: 'bg-yellow-100 text-yellow-800',
    temporarily_disqualified: 'bg-orange-200 text-orange-900',
    disqualified: 'bg-red-200 text-red-900',
  }

  const filtered = inspections.filter((insp) =>
    (insp.type === 'enlistment' && showEnlistment) ||
    (insp.type === 'release' && showRelease)
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Filter toggles */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowEnlistment((v) => !v)}
          className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-colors ${
            showEnlistment
              ? 'bg-blue-900 text-white border-blue-900'
              : 'bg-white text-blue-900 border-blue-900'
          }`}
        >
          גיוסים
        </button>
        <button
          onClick={() => setShowRelease((v) => !v)}
          className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-colors ${
            showRelease
              ? 'bg-purple-700 text-white border-purple-700'
              : 'bg-white text-purple-700 border-purple-700'
          }`}
        >
          שחרורים
        </button>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-5xl mb-3">📋</p>
          <p className="font-semibold">{inspections.length === 0 ? 'לא טופלו בחינות היום' : 'אין תוצאות לפילטר הנוכחי'}</p>
        </div>
      )}

      {filtered.map((insp) => (
        <div
          key={insp._id}
          className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer active:bg-gray-50"
          onClick={() => navigate(`/admin/inspection/${insp._id}`)}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-bold text-lg text-gray-900">{insp.licensePlate}</p>
              <p className="text-sm text-gray-500">{insp.vehicleType || ''}</p>
              {insp.approvedBy && (
                <p className="text-xs text-gray-400 mt-0.5">טופל ע״י {insp.approvedBy}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${insp.type === 'enlistment' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                {insp.type === 'enlistment' ? 'גיוס' : 'שחרור'}
              </span>
              {insp.classification ? (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CLASS_COLOR[insp.classification] || 'bg-gray-100 text-gray-700'}`}>
                  {CLASS_LABEL[insp.classification]}
                </span>
              ) : (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800">אושר</span>
              )}
            </div>
          </div>
          {insp.driveFolderId && (
            <a
              href={`https://drive.google.com/drive/folders/${insp.driveFolderId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 text-blue-700 text-xs underline block"
              onClick={(e) => e.stopPropagation()}
            >
              Drive 📂
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Vehicles Tab ───────────────────────────────────────────────────────────
function VehiclesTab({ navigate }) {
  const [vehicles, setVehicles] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/vehicles').then((r) => setVehicles(r.data)).finally(() => setLoading(false))
  }, [])

  const filtered = vehicles.filter((v) =>
    v.licensePlate.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  return (
    <div>
      <input
        type="text"
        placeholder="חיפוש לפי רישוי…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 mb-4 text-base focus:border-blue-900 outline-none"
      />
      <div className="flex flex-col gap-2">
        {filtered.map((v) => {
          const enlistCount = v.driveFolders?.filter((f) => f.type === 'enlistment').length || 0
          const releaseCount = v.driveFolders?.filter((f) => f.type === 'release').length || 0
          return (
            <button
              key={v._id}
              onClick={() => navigate(`/admin/vehicle/${v.licensePlate}`)}
              className="bg-white rounded-xl border border-gray-200 p-4 text-right active:bg-gray-50"
            >
              <p className="font-bold text-lg text-gray-900">{v.licensePlate}</p>
              <p className="text-xs text-gray-500 mt-1">
                {enlistCount} גיוסים · {releaseCount} שחרורים
              </p>
            </button>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 py-8">לא נמצאו כלים</p>
        )}
      </div>
    </div>
  )
}

// ── People Tab ─────────────────────────────────────────────────────────────
function PeopleTab() {
  const [people, setPeople] = useState([])
  const [managers, setManagers] = useState([])
  const [newName, setNewName] = useState('')
  const [newManagerName, setNewManagerName] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [addingManager, setAddingManager] = useState(false)

  const load = useCallback(() => {
    Promise.all([
      api.get('/people').then((r) => setPeople(r.data)),
      api.get('/managers').then((r) => setManagers(r.data)),
    ]).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function add(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    try {
      await api.post('/people', { name: newName.trim() })
      setNewName('')
      api.get('/people').then((r) => setPeople(r.data))
    } finally {
      setAdding(false)
    }
  }

  async function remove(id) {
    if (!confirm('להסיר את האדם מהרשימה?')) return
    await api.delete(`/people/${id}`)
    setPeople((p) => p.filter((x) => x._id !== id))
  }

  async function addManager(e) {
    e.preventDefault()
    if (!newManagerName.trim()) return
    setAddingManager(true)
    try {
      await api.post('/managers', { name: newManagerName.trim() })
      setNewManagerName('')
      api.get('/managers').then((r) => setManagers(r.data))
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה')
    } finally {
      setAddingManager(false)
    }
  }

  async function removeManager(id) {
    if (!confirm('להסיר את המנהל?')) return
    await api.delete(`/managers/${id}`)
    setManagers((m) => m.filter((x) => x._id !== id))
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  return (
    <div className="flex flex-col gap-6">
      {/* Team members */}
      <div>
        <p className="font-black text-gray-700 mb-3">חברי צוות</p>
        <form onSubmit={add} className="flex gap-2 mb-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="שם חדש…"
            className="flex-1 border-2 border-gray-300 rounded-xl px-4 py-3 focus:border-blue-900 outline-none"
          />
          <button
            type="submit"
            disabled={adding || !newName.trim()}
            className="px-5 py-3 bg-blue-900 text-white font-bold rounded-xl disabled:opacity-50"
          >
            הוסף
          </button>
        </form>
        <div className="flex flex-col gap-2">
          {people.map((p) => (
            <div key={p._id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between">
              <span className="font-semibold text-gray-900">{p.name}</span>
              <button onClick={() => remove(p._id)} className="text-red-500 text-sm font-bold px-2 py-1">הסר</button>
            </div>
          ))}
        </div>
      </div>

      {/* Managers */}
      <div>
        <p className="font-black text-gray-700 mb-3">מנהלים</p>
        <form onSubmit={addManager} className="flex gap-2 mb-3">
          <input
            type="text"
            value={newManagerName}
            onChange={(e) => setNewManagerName(e.target.value)}
            placeholder="שם מנהל חדש…"
            className="flex-1 border-2 border-gray-300 rounded-xl px-4 py-3 focus:border-blue-900 outline-none"
          />
          <button
            type="submit"
            disabled={addingManager || !newManagerName.trim()}
            className="px-5 py-3 bg-blue-900 text-white font-bold rounded-xl disabled:opacity-50"
          >
            הוסף
          </button>
        </form>
        <div className="flex flex-col gap-2">
          {managers.map((m) => (
            <div key={m._id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between">
              <span className="font-semibold text-gray-900">{m.name}</span>
              <button onClick={() => removeManager(m._id)} className="text-red-500 text-sm font-bold px-2 py-1">הסר</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Vehicle Types Tab ──────────────────────────────────────────────────────
function VehicleTypesTab() {
  const [types, setTypes] = useState([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    api.get('/vehicle-types').then((r) => setTypes(r.data)).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function add(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    try {
      await api.post('/vehicle-types', { name: newName.trim() })
      setNewName('')
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה')
    } finally {
      setAdding(false)
    }
  }

  async function remove(id) {
    if (!confirm('להסיר סוג כלי?')) return
    await api.delete(`/vehicle-types/${id}`)
    setTypes((t) => t.filter((x) => x._id !== id))
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  return (
    <div>
      <form onSubmit={add} className="flex gap-2 mb-4">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="סוג כלי חדש… (שופל, באגר, מלגזה…)"
          className="flex-1 border-2 border-gray-300 rounded-xl px-4 py-3 focus:border-blue-900 outline-none"
        />
        <button
          type="submit"
          disabled={adding || !newName.trim()}
          className="px-5 py-3 bg-blue-900 text-white font-bold rounded-xl disabled:opacity-50"
        >
          הוסף
        </button>
      </form>
      <div className="flex flex-col gap-2">
        {types.map((t) => (
          <div key={t._id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between">
            <span className="font-semibold text-gray-900">{t.name}</span>
            <button onClick={() => remove(t._id)} className="text-red-500 text-sm font-bold px-2 py-1">הסר</button>
          </div>
        ))}
        {types.length === 0 && <p className="text-center text-gray-400 py-4 text-sm">אין סוגי כלים — הוסף למעלה</p>}
      </div>
    </div>
  )
}

// ── Stats Tab ──────────────────────────────────────────────────────────────
function StatsTab() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/stats').then((r) => setStats(r.data)).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>
  if (!stats) return null

  const topMembers = Object.entries(stats.memberCounts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="ממתינות לאישור" value={stats.pendingCount} color="bg-yellow-50 border-yellow-200" />
        <StatCard label="בחינות השבוע"   value={stats.totalThisWeek}  color="bg-blue-50 border-blue-200" />
        <StatCard label="בחינות החודש"   value={stats.totalThisMonth} color="bg-blue-50 border-blue-200" />
        <StatCard label="כלים מגויסים"   value={stats.currentlyEnlisted} color="bg-green-50 border-green-200" />
      </div>

      {topMembers.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="font-bold text-gray-700 mb-3">בחינות לפי איש צוות (החודש)</p>
          <div className="flex flex-col gap-2">
            {topMembers.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{name}</span>
                <span className="font-bold text-blue-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div className={`rounded-xl border-2 p-4 text-center ${color}`}>
      <p className="text-3xl font-black text-blue-900">{value}</p>
      <p className="text-xs text-gray-600 mt-1">{label}</p>
    </div>
  )
}

// ── Fuel Cards Tab ─────────────────────────────────────────────────────────
const FUEL_STATUS_LABEL = { available: 'בחמל', taken: 'נלקח', empty: 'ריק' }
const FUEL_STATUS_COLOR = {
  available: 'bg-green-100 text-green-800',
  taken:     'bg-yellow-100 text-yellow-800',
  empty:     'bg-red-100 text-red-800',
}
const FUEL_TYPE_COLOR = {
  'סולר':  'bg-gray-800 text-white',
  'בנזין': 'bg-red-600 text-white',
}

function formatRelative(date) {
  if (!date) return '—'
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

function FuelCardsTab() {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newCardId, setNewCardId] = useState('')
  const [newFuelType, setNewFuelType] = useState('סולר')
  const [newLiters, setNewLiters] = useState('')
  const [adding, setAdding] = useState(false)
  const [refreshingCards, setRefreshingCards] = useState(new Set())
  const [addError, setAddError] = useState('')
  const [filters, setFilters] = useState({ available: true, taken: true, empty: true })
  const [deleteConfirm, setDeleteConfirm] = useState(null) // card id
  const [historyCard, setHistoryCard] = useState(null) // card object
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [shareLoading, setShareLoading] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const [deletedData, setDeletedData] = useState([])
  const [deletedLoading, setDeletedLoading] = useState(false)
  const [deletedSearch, setDeletedSearch] = useState('')

  function load() {
    api.get('/fuel-cards').then((r) => setCards(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function addCard(e) {
    e.preventDefault()
    if (!newCardId.trim()) return
    setAdding(true)
    setAddError('')
    try {
      await api.post('/fuel-cards', {
        cardId: newCardId.trim(),
        fuelType: newFuelType,
        litersRemaining: newLiters !== '' ? Number(newLiters) : null,
      })
      setNewCardId('')
      setNewLiters('')
      setShowAdd(false)
      load()
    } catch (err) {
      setAddError(err.response?.data?.error || 'שגיאה')
    } finally {
      setAdding(false)
    }
  }

  async function refreshBalance(card) {
    setRefreshingCards((s) => new Set([...s, card._id]))
    try {
      const r = await api.post(`/fuel-cards/${card.cardId}/refresh-balance`)
      setCards((prev) => prev.map((c) => c._id === card._id ? r.data : c))
    } catch {
      // silent — Goodi might be unreachable
    } finally {
      setRefreshingCards((s) => { const n = new Set(s); n.delete(card._id); return n; })
    }
  }

  async function deleteCard(id) {
    try {
      await api.delete(`/fuel-cards/${id}`)
      setDeleteConfirm(null)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה במחיקה')
    }
  }

  async function openHistory(card) {
    setHistoryCard(card)
    setHistoryLoading(true)
    setHistory([])
    try {
      const r = await api.get(`/fuel-cards/${card.cardId}/history`)
      setHistory(r.data)
    } catch {
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  async function openDeleted() {
    setShowDeleted(true)
    setDeletedLoading(true)
    setDeletedSearch('')
    try {
      const r = await api.get('/fuel-cards/deleted')
      setDeletedData(r.data)
    } catch {
      setDeletedData([])
    } finally {
      setDeletedLoading(false)
    }
  }

  async function generateShare() {
    setShareLoading(true)
    try {
      const r = await api.post('/fuel-cards/share-token')
      const url = `${window.location.origin}/fuel-share/${r.data.token}`
      setShareUrl(url)
    } catch {
      alert('שגיאה ביצירת קישור')
    } finally {
      setShareLoading(false)
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  return (
    <div className="flex flex-col gap-4">
      {/* Actions row */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex-1 py-3 bg-blue-900 text-white font-bold rounded-xl text-sm"
        >
          + הוסף כרטיס
        </button>
        <button
          onClick={generateShare}
          disabled={shareLoading}
          className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl text-sm"
        >
          {shareLoading ? '…' : '🔗 שתף'}
        </button>
      </div>

      {/* Deleted history button */}
      <button
        onClick={openDeleted}
        className="w-full py-3 bg-gray-800 text-white font-bold rounded-xl text-sm"
      >
        🗑️ היסטוריית כרטיסים שנמחקו
      </button>

      {/* Share URL */}
      {shareUrl && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-2">
          <p className="text-xs text-blue-800 font-mono break-all flex-1">{shareUrl}</p>
          <button
            onClick={() => { navigator.clipboard.writeText(shareUrl); alert('הועתק!') }}
            className="text-blue-700 font-bold text-xs shrink-0"
          >
            העתק
          </button>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <form onSubmit={addCard} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
          <p className="font-bold text-gray-700">הוסף כרטיס חדש</p>
          <input
            type="text"
            value={newCardId}
            onChange={(e) => setNewCardId(e.target.value)}
            placeholder="מזהה כרטיס (מספר הכרטיס)"
            className="border-2 border-gray-300 rounded-xl px-4 py-3 text-base focus:border-blue-900 outline-none"
          />
          <div className="flex gap-2">
            {['סולר', 'בנזין'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setNewFuelType(t)}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-colors ${
                  newFuelType === t
                    ? t === 'סולר' ? 'bg-gray-800 text-white border-gray-800' : 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {/* Liters — optional, auto-fetched from Goodi after creation */}
          <input
            type="number"
            value={newLiters}
            onChange={(e) => setNewLiters(e.target.value)}
            placeholder="ליטרים (אופציונלי)"
            className="border-2 border-gray-300 rounded-xl px-4 py-3 text-base focus:border-blue-900 outline-none"
          />
          {addError && <p className="text-red-600 text-sm">{addError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl text-sm">ביטול</button>
            <button type="submit" disabled={adding || !newCardId.trim()} className="flex-1 py-3 bg-blue-900 text-white font-bold rounded-xl text-sm disabled:opacity-50">
              {adding ? '…' : 'הוסף'}
            </button>
          </div>
        </form>
      )}

      {/* Filter buttons */}
      <div className="flex gap-2">
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
      {cards.filter((c) => filters[c.status]).length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">⛽</p>
          <p className="font-semibold">{cards.length === 0 ? 'אין כרטיסי דלק — הוסף למעלה' : 'אין כרטיסים לפילטר הנוכחי'}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {cards.filter((c) => filters[c.status]).map((card) => (
            <div
              key={card._id}
              className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer active:bg-gray-50"
              onClick={() => openHistory(card)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-black text-lg text-gray-900">{card.cardId}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatRelative(card.lastUpdated)}</p>
                  {card.currentHolder && (
                    <p className="text-sm text-gray-600">אצל: {card.currentHolder}</p>
                  )}
                  {card.litersRemaining != null && (
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm text-gray-500">יתרה: {card.litersRemaining} ל'</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); refreshBalance(card) }}
                        disabled={refreshingCards.has(card._id)}
                        className="text-blue-500 text-xs disabled:opacity-40 leading-none"
                        title="רענן יתרה מגודי"
                      >
                        {refreshingCards.has(card._id) ? '…' : '🔄'}
                      </button>
                    </div>
                  )}
                  {!card.litersRemaining && (
                    <button
                      onClick={(e) => { e.stopPropagation(); refreshBalance(card) }}
                      disabled={refreshingCards.has(card._id)}
                      className="text-blue-500 text-xs disabled:opacity-40 mt-0.5"
                    >
                      {refreshingCards.has(card._id) ? '…' : '🔄 בדוק יתרה'}
                    </button>
                  )}
                  {card.balanceCheckedAt && (
                    <p className="text-xs text-blue-400 mt-0.5">{formatCheckedAt(card.balanceCheckedAt)}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${FUEL_TYPE_COLOR[card.fuelType]}`}>
                      {card.fuelType}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(card._id) }}
                      className="text-red-400 text-lg font-bold px-1"
                    >
                      🗑️
                    </button>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${FUEL_STATUS_COLOR[card.status] || 'bg-gray-100 text-gray-600'}`}>
                    {card.status === 'taken' && card.currentHolder
                      ? `אצל ${card.currentHolder}`
                      : FUEL_STATUS_LABEL[card.status] || card.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" dir="rtl">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4">
            <p className="font-bold text-gray-800">למחוק את הכרטיס?</p>
            <p className="text-sm text-gray-600 font-semibold">לחץ אשר רק במידה והכרטיס הוחזר למשרד לוגיסטיקה</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl">ביטול</button>
              <button onClick={() => deleteCard(deleteConfirm)} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl">אשר</button>
            </div>
          </div>
        </div>
      )}

      {/* Deleted cards history panel */}
      {showDeleted && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" dir="rtl">
          <div className="bg-white w-full rounded-t-2xl p-5 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-black text-xl">כרטיסים שנמחקו</h2>
              <button onClick={() => setShowDeleted(false)} className="text-gray-400 text-2xl font-bold leading-none">×</button>
            </div>
            <input
              type="text"
              value={deletedSearch}
              onChange={(e) => setDeletedSearch(e.target.value)}
              placeholder="חיפוש לפי מזהה כרטיס…"
              className="border-2 border-gray-300 rounded-xl px-4 py-2 text-base focus:border-blue-900 outline-none mb-3"
            />
            <div className="overflow-y-auto flex-1">
              {deletedLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : deletedData.length === 0 ? (
                <p className="text-center text-gray-400 py-8">אין כרטיסים שנמחקו</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {deletedData
                    .filter(({ card }) =>
                      !deletedSearch.trim() ||
                      card.cardId.toLowerCase().includes(deletedSearch.trim().toLowerCase())
                    )
                    .map(({ card, logs }) => (
                      <div key={card._id} className="border border-gray-200 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="font-black text-lg text-gray-900">{card.cardId}</p>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${FUEL_TYPE_COLOR[card.fuelType]}`}>{card.fuelType}</span>
                          </div>
                          <span className="text-xs text-gray-400">
                            נמחק: {new Date(card.lastUpdated).toLocaleDateString('he-IL')}
                          </span>
                        </div>
                        {logs.length === 0 ? (
                          <p className="text-xs text-gray-400">אין פעילות מתועדת</p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {logs.map((log) => (
                              <div key={log._id} className="flex items-center justify-between gap-2 py-1 border-t border-gray-100">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0 ${log.action === 'taken' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                    {log.action === 'taken' ? 'נלקח' : 'הוחזר'}
                                  </span>
                                  <span className="text-sm text-gray-800 truncate">{log.person}</span>
                                  {log.litersRemaining != null && (
                                    <span className="text-xs text-gray-500 shrink-0">{log.litersRemaining} ל'</span>
                                  )}
                                </div>
                                <span className="text-xs text-gray-400 shrink-0">
                                  {new Date(log.createdAt).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* History panel */}
      {historyCard && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" dir="rtl">
          <div className="bg-white w-full rounded-t-2xl p-5 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-xl">היסטוריה — {historyCard.cardId}</h2>
              <button onClick={() => setHistoryCard(null)} className="text-gray-400 text-2xl font-bold leading-none">×</button>
            </div>
            <div className="overflow-y-auto flex-1">
              {historyLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : history.length === 0 ? (
                <p className="text-center text-gray-400 py-8">אין פעילות ב-30 הימים האחרונים</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {history.map((log) => (
                    <div key={log._id} className="border border-gray-200 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${log.action === 'taken' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                            {log.action === 'taken' ? 'נלקח' : 'הוחזר'}
                          </span>
                          <span className="text-sm font-bold text-gray-900 mr-2">{log.person}</span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(log.createdAt).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {log.litersRemaining != null && (
                        <p className="text-xs text-gray-500 mt-1">יתרה: {log.litersRemaining} ל'</p>
                      )}
                      {log.notes && <p className="text-xs text-gray-500 mt-0.5">הערה: {log.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
