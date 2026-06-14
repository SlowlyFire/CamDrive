import { useState, useEffect, useRef } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import api from '../../utils/api'
import TopBar from '../../components/TopBar'
import Spinner from '../../components/Spinner'
import { idbSaveForm, idbGetForm, idbMarkSynced } from '../../utils/inspectionFormIdb'
import {
  HEADER_FIELDS,
  SECTION_LABELS,
  FORM_PAGES,
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

  const sections = {}
  for (const key of Object.keys(defaults.sections)) {
    sections[key] = serverData.sections?.[key]?.length > 0
      ? serverData.sections[key]
      : defaults.sections[key]
  }

  return {
    formType: ft,
    header: { ...defaults.header, ...(serverData.header || {}) },
    fuelGauge: {
      level: serverData.fuelGauge?.level || null,
      liters: serverData.fuelGauge?.liters != null ? String(serverData.fuelGauge.liters) : '',
    },
    sections,
    damageTable: serverData.damageTable?.length > 0
      ? serverData.damageTable
      : defaults.damageTable,
    status: serverData.status || 'draft',
  }
}

export default function InspectionForm1651() {
  const { id } = useParams()
  const location = useLocation()

  const isDraft = !id
  const idbKey = isDraft
    ? (location.state?.draftKey || sessionStorage.getItem('form1651DraftKey') || 'form1651-fallback')
    : id
  const backUrl = isDraft ? '/team/new' : `/team/inspection/${id}`

  const [loading, setLoading] = useState(true)
  const [formData, setFormData] = useState(null)
  const [syncStatus, setSyncStatus] = useState(isDraft ? 'draft' : 'synced')
  const [vehicleTypes, setVehicleTypes] = useState([])
  const [currentPage, setCurrentPage] = useState(0)
  const [expandedSections, setExpandedSections] = useState(() => new Set(['__header']))

  const syncTimer = useRef(null)
  const formDataRef = useRef(null)
  const isMounted = useRef(true)

  function toggleSection(key) {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function goToPage(page) {
    setCurrentPage(page)
    if (FORM_PAGES[page]?.sections?.length > 0) {
      setExpandedSections(new Set([FORM_PAGES[page].sections[0]]))
    } else {
      setExpandedSections(new Set())
    }
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  async function syncToServer(data) {
    if (!isMounted.current || isDraft) return
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
    api.get('/vehicle-types').then((r) => setVehicleTypes(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    isMounted.current = true

    async function load() {
      if (isDraft) {
        const idbEntry = await idbGetForm(idbKey)
        const ft = location.state?.formType || 'enlistment'
        const resolved = idbEntry?.data || initFormData(ft)
        setFormData(resolved)
        formDataRef.current = resolved
        setSyncStatus('draft')
        setLoading(false)
        return
      }

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
      if (!isDraft && formDataRef.current) syncToServer(formDataRef.current)
    }
    window.addEventListener('online', handleOnline)

    return () => {
      isMounted.current = false
      window.removeEventListener('online', handleOnline)
      clearTimeout(syncTimer.current)
    }
  }, [id, idbKey])

  function applyUpdate(updater) {
    setFormData((prev) => {
      const next = updater(prev)
      formDataRef.current = next
      idbSaveForm(idbKey, next, !isDraft)
      if (!isDraft) {
        clearTimeout(syncTimer.current)
        syncTimer.current = setTimeout(() => syncToServer(next), 2000)
      }
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

  function updateDamageRow(index, field, value) {
    applyUpdate((prev) => ({
      ...prev,
      damageTable: (prev.damageTable || []).map((row, i) =>
        i === index ? { ...row, [field]: value } : row
      ),
    }))
  }

  function addDamageRow() {
    applyUpdate((prev) => ({
      ...prev,
      damageTable: [...(prev.damageTable || []), { location: '', description: '' }],
    }))
  }

  function removeDamageRow(index) {
    applyUpdate((prev) => ({
      ...prev,
      damageTable: (prev.damageTable || []).filter((_, i) => i !== index),
    }))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
        <TopBar title="טופס 1651" back={backUrl} />
        <div className="flex justify-center py-16"><Spinner /></div>
      </div>
    )
  }

  if (!formData) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
        <TopBar title="טופס 1651" back={backUrl} />
        <p className="p-4 text-red-600">שגיאה בטעינת הטופס</p>
      </div>
    )
  }

  const typeLabel = formData.formType === 'enlistment' ? 'גיוס' : 'שחרור'
  const damageTitle = formData.formType === 'enlistment'
    ? 'פירוט תאונות/מכות/ליקויים נוספים בכלי - בגיוס'
    : 'פירוט תאונות/מכות/ליקויים נוספים בכלי - בזיכוי'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      <TopBar title={`טופס 1651 — ${typeLabel}`} back={backUrl} />

      {/* Sync status bar */}
      <div className="flex items-center justify-end gap-1.5 px-4 py-1.5 text-xs font-semibold border-b border-gray-100 bg-white sticky top-[52px] z-10">
        {syncStatus === 'draft'   && <><span className="w-2 h-2 rounded-full bg-gray-400 shrink-0" /><span className="text-gray-500">טיוטה — יסונכרן לאחר שליחת הבחינה</span></>}
        {syncStatus === 'synced'  && <><span className="w-2 h-2 rounded-full bg-green-500 shrink-0" /><span className="text-green-700">נשמר</span></>}
        {syncStatus === 'syncing' && <><span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" /><span className="text-blue-700">שומר...</span></>}
        {syncStatus === 'offline' && <><span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" /><span className="text-orange-700">נשמר במכשיר — יסונכרן כשיחזור חיבור</span></>}
      </div>

      {/* Page tabs */}
      <div className="flex bg-white border-b border-gray-200 sticky top-[80px] z-10">
        {FORM_PAGES.map((page, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goToPage(i)}
            className={`flex-1 py-2.5 text-sm font-black transition-colors border-b-2 ${
              currentPage === i
                ? 'border-blue-900 text-blue-900'
                : 'border-transparent text-gray-400'
            }`}
          >
            {page.title}
          </button>
        ))}
      </div>

      <div className="flex-1 px-4 pb-8 pt-3 flex flex-col gap-3">

        {/* ── Page 1: כותרת + דלק + 9 sections ──────────────────── */}
        {currentPage === 0 && (
          <>
            <CollapsibleSection
              title="כותרת הטופס"
              expanded={expandedSections.has('__header')}
              onToggle={() => toggleSection('__header')}
            >
              {HEADER_FIELDS.map(({ key, label, type }) => (
                <div key={key}>
                  <label className="block text-xs font-bold text-gray-500 mb-1">{label}</label>
                  {key === 'vehicleType' ? (
                    <select
                      value={formData.header.vehicleType ?? ''}
                      onChange={(e) => updateHeader('vehicleType', e.target.value)}
                      className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-base focus:border-blue-900 outline-none bg-white"
                    >
                      <option value="">בחר סוג כלי...</option>
                      {vehicleTypes.map((t) => (
                        <option key={t._id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={type || 'text'}
                      inputMode={type === 'number' ? 'numeric' : type === 'tel' ? 'tel' : undefined}
                      value={formData.header[key] ?? ''}
                      onChange={(e) => updateHeader(key, e.target.value)}
                      className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-base focus:border-blue-900 outline-none bg-white"
                    />
                  )}
                </div>
              ))}
            </CollapsibleSection>

            <CollapsibleSection
              title="מד דלק"
              expanded={expandedSections.has('__fuel')}
              onToggle={() => toggleSection('__fuel')}
            >
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
            </CollapsibleSection>

            {FORM_PAGES[0].sections.map((sectionKey) => (
              <CollapsibleSection
                key={sectionKey}
                title={SECTION_LABELS[sectionKey]}
                expanded={expandedSections.has(sectionKey)}
                onToggle={() => toggleSection(sectionKey)}
              >
                <ChecklistHeader typeLabel={typeLabel} />
                {(formData.sections[sectionKey] || []).map((item, index) => (
                  <ChecklistRow
                    key={index}
                    label={item.label}
                    value={item.value}
                    onChange={(v) => updateSectionItem(sectionKey, index, v)}
                  />
                ))}
              </CollapsibleSection>
            ))}
          </>
        )}

        {/* ── Page 2: 5 sections ──────────────────────────────────── */}
        {currentPage === 1 && (
          <>
            {FORM_PAGES[1].sections.map((sectionKey) => (
              <CollapsibleSection
                key={sectionKey}
                title={SECTION_LABELS[sectionKey]}
                expanded={expandedSections.has(sectionKey)}
                onToggle={() => toggleSection(sectionKey)}
              >
                <ChecklistHeader typeLabel={typeLabel} />
                {(formData.sections[sectionKey] || []).map((item, index) => (
                  <ChecklistRow
                    key={index}
                    label={item.label}
                    value={item.value}
                    onChange={(v) => updateSectionItem(sectionKey, index, v)}
                  />
                ))}
              </CollapsibleSection>
            ))}
          </>
        )}

        {/* ── Page 3: Damage table ────────────────────────────────── */}
        {currentPage === 2 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-blue-900 px-4 py-2.5">
              <h2 className="text-white font-black text-sm leading-snug">{damageTitle}</h2>
            </div>
            <div className="p-3 flex flex-col gap-2">
              <div className="grid gap-2 px-1" style={{ gridTemplateColumns: '1fr 2fr 1.75rem' }}>
                <span className="text-xs font-black text-gray-500">מיקום</span>
                <span className="text-xs font-black text-gray-500">תיאור הנזק</span>
                <span />
              </div>

              {(formData.damageTable || []).map((row, index) => (
                <div key={index} className="grid gap-2 items-center" style={{ gridTemplateColumns: '1fr 2fr 1.75rem' }}>
                  <input
                    type="text"
                    value={row.location}
                    onChange={(e) => updateDamageRow(index, 'location', e.target.value)}
                    placeholder="מיקום"
                    className="border-2 border-gray-200 rounded-lg px-2 py-2 text-sm focus:border-blue-900 outline-none bg-white min-w-0"
                  />
                  <input
                    type="text"
                    value={row.description}
                    onChange={(e) => updateDamageRow(index, 'description', e.target.value)}
                    placeholder="תיאור הנזק"
                    className="border-2 border-gray-200 rounded-lg px-2 py-2 text-sm focus:border-blue-900 outline-none bg-white min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => removeDamageRow(index)}
                    className="w-7 h-7 rounded-full bg-red-50 text-red-500 text-base font-black flex items-center justify-center leading-none shrink-0"
                  >
                    ×
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addDamageRow}
                className="mt-1 w-full py-2.5 border-2 border-dashed border-blue-300 text-blue-700 font-black text-sm rounded-xl"
              >
                + הוסף שורה
              </button>
            </div>
          </div>
        )}

        {/* Page navigation */}
        <div className="flex gap-3 mt-2">
          {currentPage > 0 && (
            <button
              type="button"
              onClick={() => goToPage(currentPage - 1)}
              className="flex-1 py-3 border-2 border-gray-300 text-gray-700 font-black text-base rounded-xl"
            >
              {FORM_PAGES[currentPage - 1].title} ›
            </button>
          )}
          {currentPage < FORM_PAGES.length - 1 && (
            <button
              type="button"
              onClick={() => goToPage(currentPage + 1)}
              className="flex-1 py-3 bg-blue-900 text-white font-black text-base rounded-xl"
            >
              ‹ {FORM_PAGES[currentPage + 1].title}
            </button>
          )}
        </div>

      </div>
    </div>
  )
}

function CollapsibleSection({ title, expanded, onToggle, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between bg-blue-900 px-4 py-2.5 text-right"
      >
        <span className="text-white font-black text-base">{title}</span>
        <span className="text-white text-base font-black leading-none">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="p-4 flex flex-col gap-3">
          {children}
        </div>
      )}
    </div>
  )
}

function ChecklistHeader({ typeLabel }) {
  return (
    <div className="flex items-center justify-between text-xs font-bold text-gray-400 pb-1 border-b border-gray-100">
      <div className="flex gap-1.5 shrink-0">
        <span className="min-w-[68px] text-center">לא תקין</span>
        <span className="min-w-[52px] text-center">תקין</span>
      </div>
      <span>{typeLabel}</span>
    </div>
  )
}

function ChecklistRow({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-gray-100 last:border-0">
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
