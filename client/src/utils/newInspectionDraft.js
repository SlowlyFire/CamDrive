// Persists NewInspection in-progress state across SPA navigations.
// Text fields go to sessionStorage; File objects live in module scope
// (they can't be serialized but survive within-session route changes).

const FIELDS_KEY = 'niDraftFields'

let _photos = []    // { file: File, preview: string }
let _documents = [] // { file: File, preview: string }

export function saveDraft(form, photos, documents) {
  try { sessionStorage.setItem(FIELDS_KEY, JSON.stringify(form)) } catch {}
  _photos = photos
  _documents = documents
}

export function loadDraft() {
  try {
    const raw = sessionStorage.getItem(FIELDS_KEY)
    return { form: raw ? JSON.parse(raw) : null, photos: _photos, documents: _documents }
  } catch {
    return { form: null, photos: [], documents: [] }
  }
}

export function clearDraft() {
  try { sessionStorage.removeItem(FIELDS_KEY) } catch {}
  _photos = []
  _documents = []
}
