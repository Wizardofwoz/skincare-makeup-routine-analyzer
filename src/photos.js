// Face photo diary + on-device skin look-over UI.
// Photos and results are stored only in this browser (localStorage). No uploads, no network calls.
import { analyzeFace } from './analyze.js'
import { FLAWS, LEVEL_NAME, STEP_NAMES, buildRoutine, goalSummary } from './advice.js'

const PHOTO_KEY = 'petal.photos.v1'
const MAX_SIDE = 640
const LEVEL_CLASS = ['', 'mild', 'moderate', 'severe']

export function initPhotos({ $, h, toast, newId }) {
  let photos = load() // newest first
  let pending = null // { img, analysis }

  function load() {
    try {
      const p = JSON.parse(localStorage.getItem(PHOTO_KEY))
      return Array.isArray(p) ? p.filter((x) => x && typeof x.img === 'string') : []
    } catch { return [] }
  }
  const persist = () => { try { localStorage.setItem(PHOTO_KEY, JSON.stringify(photos)); return true } catch { return false } }

  // Shrink on a canvas, find the face (browser FaceDetector when present, colour-based fallback otherwise), analyze.
  function processFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const im = new Image()
      im.onload = async () => {
        try {
          const scale = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight))
          const w = Math.max(1, Math.round(im.naturalWidth * scale)), hh = Math.max(1, Math.round(im.naturalHeight * scale))
          const c = document.createElement('canvas')
          c.width = w; c.height = hh
          const ctx = c.getContext('2d', { willReadFrequently: true })
          ctx.drawImage(im, 0, 0, w, hh)
          let box = null
          try {
            if ('FaceDetector' in window) {
              const faces = await new window.FaceDetector({ fastMode: false, maxDetectedFaces: 1 }).detect(c)
              if (faces[0]) { const b = faces[0].boundingBox; box = { x: b.x, y: b.y, w: b.width, h: b.height } }
            }
          } catch { /* detector unavailable: use the fallback */ }
          let analysis
          try { analysis = analyzeFace(ctx.getImageData(0, 0, w, hh).data, w, hh, box ? { box } : {}) } catch { analysis = { found: false, reason: 'error' } }
          const slim = analysis.found
            ? { found: true, source: analysis.source, flaws: analysis.flaws, notes: analysis.notes }
            : { found: false }
          resolve({ img: c.toDataURL('image/jpeg', 0.72), analysis: { ...slim, date: new Date().toISOString() } })
        } catch (e) { reject(e) } finally { URL.revokeObjectURL(url) }
      }
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load')) }
      im.src = url
    })
  }

  const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' +
    new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  // ---------- result view ----------
  function overall(flaws) {
    const worst = Math.max(0, ...flaws.map((f) => f.severity))
    return worst
  }

  function resultView(a) {
    if (!a) return h('p', { class: 'hint' }, 'No analysis was saved with this photo.')
    if (!a.found) {
      return h('div', { class: 'result-card' },
        h('h3', {}, '🙈 We couldn\'t spot a face'),
        h('p', {}, 'Please try a clearer, front-facing photo in good light: face the sun or a window, look straight at the camera, keep your whole face in the frame, and take off sunglasses or a hat if you can.'),
        h('p', { class: 'disclaimer' }, 'Black and white photos and heavy filters can also make it hard to find a face.'),
      )
    }
    const flaws = a.flaws || []
    const worst = overall(flaws)
    const names = flaws.map((f) => FLAWS[f.id].label.toLowerCase())
    const summary = !flaws.length
      ? 'Nothing stood out in this photo. Your skin looks even and clear from here. Keep up the SPF and gentle habits!'
      : `We noticed ${flaws.length} thing${flaws.length === 1 ? '' : 's'} to look after: ${names.join(', ')}. Overall level: ${LEVEL_NAME[worst]}.`
    const routine = buildRoutine(flaws)
    const goal = goalSummary(flaws)

    const rows = (list) => h('ol', { class: 'r-order' }, list.map(([n, t]) => h('li', {}, h('strong', {}, n), h('span', {}, t))))

    return h('div', { class: 'result-card' },
      h('div', { class: 'q-count' }, 'Your face analysis'),
      h('div', { class: `summary lvl-${LEVEL_CLASS[worst] || 'ok'}` }, summary),
      h('p', { class: 'disclaimer strong' }, '⚠️ This is a cosmetic estimate, not medical advice or a diagnosis. It is a rough look at the photo, and lighting, shadows, makeup, beards and filters can change what shows up.'),
      a.notes && a.notes.length > 0 && h('ul', { class: 'photo-notes' }, a.notes.map((n) => h('li', {}, `📷 ${n}`))),

      flaws.length > 0 && h('h4', {}, '🔍 What we found'),
      flaws.map((f) => {
        const def = FLAWS[f.id]
        return h('div', { class: 'flaw' },
          h('div', { class: 'flaw-head' },
            h('span', { class: 'flaw-name' }, `${def.icon} ${def.label}`),
            h('span', { class: `sev ${LEVEL_CLASS[f.severity]}` }, LEVEL_NAME[f.severity]),
          ),
          h('ul', { class: 'where' }, f.regions.map((r) => h('li', {}, `${r.region} · `, h('em', {}, LEVEL_NAME[r.severity])))),
          h('p', { class: 'flaw-tip' }, `💡 ${def.tip}`),
          f.severity >= 3 && def.severeNote && h('p', { class: 'flaw-warn' }, `🩺 ${def.severeNote}`),
        )
      }),

      flaws.length > 0 && h('h4', {}, '🌿 What your face needs'),
      flaws.map((f) => {
        const def = FLAWS[f.id]
        return h('details', { class: 'needs' },
          h('summary', {}, `${def.icon} ${def.label}`),
          h('p', { class: 'goal-line' }, `Goal: ${def.goal}`),
          h('ul', { class: 'need-list' }, Object.entries(def.needs).map(([k, v]) => h('li', {}, h('strong', {}, `${STEP_NAMES[k]}: `), v))),
        )
      }),

      flaws.length > 0 && h('div', {},
        h('h4', {}, '🎯 Your goal: even tone, clear skin'),
        h('ul', { class: 'need-list' }, goal.steps.map((s) => h('li', {}, s))),
        h('h4', {}, '☀️ Morning order'), rows(routine.morning),
        h('h4', {}, '🌙 Evening order'), rows(routine.evening),
        h('p', { class: 'disclaimer' }, 'Add one new product at a time, patch test it first, and give it 6-8 weeks. Stop anything that stings or irritates.'),
      ),
      h('div', { class: 'derm' }, '🩺 General guidance only, not medical advice. See a dermatologist for persistent, painful, or changing skin concerns.'),
    )
  }

  // ---------- capture / preview ----------
  async function onFile(input) {
    const file = input.files && input.files[0]
    input.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('Please choose an image file 💗')
    $('photo-busy').hidden = false
    $('photo-preview').hidden = true
    try {
      pending = await processFile(file)
    } catch {
      $('photo-busy').hidden = true
      return toast("Couldn't read that photo. Try another one 💗")
    }
    $('photo-busy').hidden = true
    $('preview-img').src = pending.img
    $('photo-note').value = ''
    $('photo-result').replaceChildren(resultView(pending.analysis))
    $('photo-preview').hidden = false
    $('photo-save').textContent = 'Save photo + results'
    $('photo-preview').scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  function cancelPending() {
    pending = null
    $('photo-preview').hidden = true
    $('preview-img').removeAttribute('src')
    $('photo-result').replaceChildren()
  }
  function savePending() {
    if (!pending) return
    const photo = { id: newId(), date: new Date().toISOString(), note: $('photo-note').value.trim().slice(0, 200), img: pending.img, analysis: pending.analysis }
    photos.unshift(photo)
    if (!persist()) { photos.shift(); return toast('Not enough space on this device. Delete an older photo first 💗') }
    cancelPending()
    renderHistory()
    toast('Saved to your history 📸')
  }

  // ---------- history ----------
  function summaryTag(a) {
    if (!a) return null
    if (!a.found) return 'No face found'
    return a.flaws.length ? `${a.flaws.length} to care for` : 'Looks even & clear'
  }
  function renderHistory() {
    const list = $('history')
    list.replaceChildren()
    if (!photos.length) return list.append(h('li', { class: 'empty' }, 'No photos yet. Snap one to start your skin diary!'))
    for (const p of photos) {
      const tag = summaryTag(p.analysis)
      list.append(h('li', { class: 'h-item' },
        h('img', { src: p.img, alt: `Face photo from ${fmtDate(p.date)}`, loading: 'lazy' }),
        h('div', {},
          h('div', { class: 'h-date' }, fmtDate(p.date)),
          p.note && h('div', { class: 'h-note' }, p.note),
          tag && h('span', { class: 'h-tag' }, tag),
          h('div', { class: 'h-btns' },
            h('button', { class: 'btn ghost', type: 'button', onclick: () => openViewer(p.id) }, 'View'),
            h('button', { class: 'btn ghost danger', type: 'button', 'aria-label': `Delete photo from ${fmtDate(p.date)}`, onclick: () => deletePhoto(p.id) }, 'Delete'),
          ),
        ),
      ))
    }
  }
  function deletePhoto(id) {
    if (!confirm('Delete this photo and its results from this device?')) return
    photos = photos.filter((p) => p.id !== id)
    persist()
    closeViewer()
    renderHistory()
  }

  let lastFocus = null
  function openViewer(id) {
    const p = photos.find((x) => x.id === id)
    if (!p) return
    lastFocus = document.activeElement
    $('viewer-body').replaceChildren(
      h('img', { class: 'thumb-big', src: p.img, alt: `Face photo from ${fmtDate(p.date)}` }),
      h('p', { class: 'h-date', style: 'margin:10px 0 2px' }, fmtDate(p.date)),
      h('p', { class: 'h-note' }, p.note ? `📝 ${p.note}` : 'No note.'),
      resultView(p.analysis),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost danger', type: 'button', onclick: () => deletePhoto(p.id) }, 'Delete')),
    )
    $('viewer').hidden = false
    document.body.style.overflow = 'hidden'
    $('viewer-close').focus()
  }
  function closeViewer() {
    if ($('viewer').hidden) return
    $('viewer').hidden = true
    document.body.style.overflow = ''
    lastFocus && lastFocus.isConnected && lastFocus.focus()
  }

  $('cam-input').addEventListener('change', (e) => onFile(e.target))
  $('pick-input').addEventListener('change', (e) => onFile(e.target))
  $('photo-save').addEventListener('click', savePending)
  $('photo-cancel').addEventListener('click', cancelPending)
  $('viewer-close').addEventListener('click', closeViewer)
  $('viewer').addEventListener('click', (e) => { if (e.target === $('viewer')) closeViewer() })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeViewer() })
  renderHistory()
  return { resultView, closeViewer }
}
