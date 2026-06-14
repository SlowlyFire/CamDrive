import { get, set, createStore } from 'idb-keyval'

const formStore = createStore('camdrive-forms', 'inspection-forms')

export async function idbSaveForm(inspectionId, data, pendingSync = true) {
  try {
    await set(inspectionId, { data, pendingSync, savedAt: Date.now() }, formStore)
  } catch {
    // IDB unavailable (private mode, quota exceeded) — fail silently
  }
}

export async function idbGetForm(inspectionId) {
  try {
    return (await get(inspectionId, formStore)) || null
  } catch {
    return null
  }
}

export async function idbMarkSynced(inspectionId) {
  try {
    const existing = await get(inspectionId, formStore)
    if (existing) {
      await set(inspectionId, { ...existing, pendingSync: false }, formStore)
    }
  } catch {
    // silent
  }
}
