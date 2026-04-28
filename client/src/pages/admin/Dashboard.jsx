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
