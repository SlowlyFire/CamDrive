import { useState, useEffect, useRef } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import api from '../../utils/api'
import TopBar from '../../components/TopBar'
import Spinner from '../../components/Spinner'
import { idbSaveForm, idbGetForm, idbMarkSynced } from '../../utils/inspectionFormIdb'
import {
  HEADER_FIELDS,
  SECTION_ITEMS,
  SECTION_LABELS,
  initFormData,
} from '../../utils/inspectionForm1651Data'

const FUEL_LEVELS = [
  { label: 'E',  value: 'E' },
  { label: '¼',  value: '1/4' },
  { label: '½',  value: '1/2' },
  { label: '¾',  value: '3/4' },
  { label: 'F',  value: 'F' },
]

function buildSyncPayload(data) {
  if (!data) return {}
  const liters = data.fuelGauge?.liters
  return {
    ...data,
    fuelGauge: {
      level: data.fuelGauge?.level || null,
      liters: liters === '' || liters == null ? null : parseFloat(liters) || null,
    },
  }
}

function normalizeServerData(serverData) {
  const ft = serverData.formType || 'enlistment'
  const defaults = initFormData(ft)
  return {
    formType: ft,
    header: { ...defaults.header, ...(serverData.header || {}) },
    fuelGauge: {
      level: serverData.fuelGauge?.level || null,
      liters: serverData.fuelGauge?.liters != null ? String(serverData.fuelGauge.liters) : '',
    },
    sections: {
      documents:      serverData.sections?.documents?.length      > 0 ? serverData.sections.documents      : defaults.sections.documents,
      operatorCabin:  serverData.sections?.operatorCabin?.length  > 0 ? serverData.sections.operatorCabin  : defaults.sections.operatorCabin,
      engineCheck:    serverData.sections?.engineCheck?.length    > 0 ? serverData.sections.engineCheck    : defaults.sections.engineCheck,
      steeringSystem: serverData.sections?.steeringSystem?.length > 0 ? serverData.sections.steeringSystem : defaults.sections.steeringSystem,
    },
    status: serverData.status || 'draft',
  }
}

export default function InspectionForm1651() {
  const { id } = useParams()
  const location = useLocation()

  const [loading, setLoading] = useState(true)
  const [formData, setFormData] = useState(null)
  const [syncStatus, setSyncStatus] = useState('synced') // 'synced' | 'syncing' | 'offline'

  const syncTimer = useRef(null)
  const formDataRef = useRef(null)
  const isMounted = useRef(true)

  async function syncToServer(data) {
    if (!isMounted.current) return
    setSyncStatus('syncing')
    try {
      await api.patch(`/inspection-forms/${id}`, buildSyncPayload(data))
      await idbMarkSynced(id)
      if (isMounted.current) setSyncStatus('synced')
    } catch {
      if (isMounted.current) setSyncStatus('offline')
    }
  }

  useEffect(() => {
    isMounted.current = true

    async function load() {
      const [idbEntry, serverForm, inspectionType] = await Promise.all([
        idbGetForm(id),
        api.get(`/inspection-forms/${id}`).then((r) => r.data).catch(() => null),
        api.get(`/inspections/${id}`).then((r) => r.data.type).catch(() => null),
      ])

      if (!isMounted.current) return

      let resolved
      let hasPendingSync = false

      if (idbEntry && serverForm) {
        const serverTime = serverForm.lastSavedAt ? new Date(serverForm.lastSavedAt).getTime() : 0
        if (idbEntry.pendingSync && idbEntry.savedAt > serverTime) {
          resolved = idbEntry.data
          hasPendingSync = true
        } else {
          resolved = normalizeServerData(serverForm)
          await idbSaveForm(id, resolved, false)
        }
      } else if (idbEntry) {
        resolved = idbEntry.data
        hasPendingSync = idbEntry.pendingSync
      } else if (serverForm) {
        resolved = normalizeServerData(serverForm)
        await idbSaveForm(id, resolved, false)
      } else {
        const ft = inspectionType || location.state?.formType || 'enlistment'
        resolved = initFormData(ft)
      }

      setFormData(resolved)
      formDataRef.current = resolved

      if (hasPendingSync && navigator.onLine) {
        await syncToServer(resolved)
      } else {
        setSyncStatus(hasPendingSync ? 'offline' : 'synced')
      }

      setLoading(false)
    }

    load()

    const handleOnline = () => {
      if (formDataRef.current) syncToServer(formDataRef.current)
    }
    window.addEventListener('online', handleOnline)

    return () => {
      isMounted.current = false
      window.removeEventListener('online', handleOnline)
      clearTimeout(syncTimer.current)
    }
  }, [id])

  // Apply a state update, immediately save to IDB, and schedule a debounced server sync.
  function applyUpdate(updater) {
    setFormData((prev) => {
      const next = updater(prev)
      formDataRef.current = next
      idbSaveForm(id, next, true)
      clearTimeout(syncTimer.current)
      syncTimer.current = setTimeout(() => syncToServer(next), 2000)
      return next
    })
  }

  function updateHeader(key, value) {
    applyUpdate((prev) => ({ ...prev, header: { ...prev.header, [key]: value } }))
  }

  function updateFuelGauge(key, value) {
    applyUpdate((prev) => ({ ...prev, fuelGauge: { ...prev.fuelGauge, [key]: value } }))
  }

  function updateSectionItem(sectionKey, index, newValue) {
    applyUpdate((prev) => {
      const section = (prev.sections[sectionKey] || []).map((item, i) =>
        i === index ? { ...item, value: newValue } : item
      )
      return { ...prev, sections: { ...prev.sections, [sectionKey]: section } }
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
        <TopBar title="טופס 1651" back={`/team/inspection/${id}`} />
        <div className="flex justify-center py-16"><Spinner /></div>
      </div>
    )
  }

  if (!formData) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
        <TopBar title="טופס 1651" back={`/team/inspection/${id}`} />
        <p className="p-4 text-red-600">שגיאה בטעינת הטופס</p>
      </div>
    )
  }

  const typeLabel = formData.formType === 'enlistment' ? 'גיוס' : 'שחרור'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      <TopBar title={`טופס 1651 — ${typeLabel}`} back={`/team/inspection/${id}`} />

      {/* Sync status bar */}
      <div className="flex items-center justify-end gap-1.5 px-4 py-1.5 text-xs font-semibold border-b border-gray-100 bg-white sticky top-[52px] z-10">
        {syncStatus === 'synced'  && <><span className="w-2 h-2 rounded-full bg-green-500 shrink-0" /><span className="text-green-700">נשמר</span></>}
        {syncStatus === 'syncing' && <><span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" /><span className="text-blue-700">שומר...</span></>}
        {syncStatus === 'offline' && <><span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" /><span className="text-orange-700">נשמר במכשיר — יסונכרן כשיחזור חיבור</span></>}
      </div>

      <div className="flex-1 px-4 pb-8 pt-3 flex flex-col gap-4">

        {/* ── Header ────────────────────────────────────────────── */}
        <FormSection title="כותרת הטופס">
          {HEADER_FIELDS.map(({ key, label, type }) => (
            <div key={key}>
              <label className="block text-xs font-bold text-gray-500 mb-1">{label}</label>
              <input
                type={type || 'text'}
                inputMode={type === 'number' ? 'numeric' : type === 'tel' ? 'tel' : undefined}
                value={formData.header[key] ?? ''}
                onChange={(e) => updateHeader(key, e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-base focus:border-blue-900 outline-none bg-white"
              />
            </div>
          ))}
        </FormSection>

        {/* ── Fuel gauge ────────────────────────────────────────── */}
        <FormSection title="מד דלק">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2">רמת דלק</label>
            <div className="flex rounded-xl overflow-hidden border-2 border-gray-300">
              {FUEL_LEVELS.map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => updateFuelGauge('level', formData.fuelGauge.level === value ? null : value)}
                  className={`flex-1 py-3 text-base font-black transition-colors ${
                    formData.fuelGauge.level === value
                      ? 'bg-blue-900 text-white'
                      : 'bg-white text-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">כמות (ליטרים)</label>
            <input
              type="number"
              inputMode="decimal"
              value={formData.fuelGauge.liters ?? ''}
              onChange={(e) => updateFuelGauge('liters', e.target.value)}
              placeholder="ליטרים"
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-base focus:border-blue-900 outline-none bg-white"
            />
          </div>
        </FormSection>

        {/* ── Checklist sections ────────────────────────────────── */}
        {Object.entries(SECTION_LABELS).map(([sectionKey, sectionTitle]) => (
          <FormSection key={sectionKey} title={sectionTitle}>
            {/* Column header */}
            <div className="flex items-center justify-between text-xs font-bold text-gray-400 pb-1 border-b border-gray-100">
              <div className="flex gap-1.5 shrink-0">
                <span className="min-w-[68px] text-center">לא תקין</span>
                <span className="min-w-[52px] text-center">תקין</span>
              </div>
              <span>{typeLabel}</span>
            </div>
            {(formData.sections[sectionKey] || []).map((item, index) => (
              <ChecklistRow
                key={index}
                label={item.label}
                value={item.value}
                onChange={(v) => updateSectionItem(sectionKey, index, v)}
              />
            ))}
          </FormSection>
        ))}

      </div>
    </div>
  )
}

function FormSection({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="bg-blue-900 px-4 py-2.5">
        <h2 className="text-white font-black text-base">{title}</h2>
      </div>
      <div className="p-4 flex flex-col gap-3">
        {children}
      </div>
    </div>
  )
}

function ChecklistRow({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-gray-100 last:border-0">
      {/* Label on the right (RTL start), buttons on the left (RTL end) */}
      <span className="flex-1 text-sm text-gray-800 leading-snug">{label}</span>
      <div className="flex gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onChange(value === 'not_ok' ? null : 'not_ok')}
          className={`min-w-[68px] px-2 py-1.5 rounded-lg text-xs font-black border-2 transition-colors ${
            value === 'not_ok'
              ? 'bg-red-600 text-white border-red-600'
              : 'border-gray-300 text-gray-500 bg-white'
          }`}
        >
          לא תקין
        </button>
        <button
          type="button"
          onClick={() => onChange(value === 'ok' ? null : 'ok')}
          className={`min-w-[52px] px-2 py-1.5 rounded-lg text-xs font-black border-2 transition-colors ${
            value === 'ok'
              ? 'bg-green-600 text-white border-green-600'
              : 'border-gray-300 text-gray-500 bg-white'
          }`}
        >
          תקין
        </button>
      </div>
    </div>
  )
}
