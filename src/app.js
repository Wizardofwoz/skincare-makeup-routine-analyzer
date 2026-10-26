// Skincare & Makeup Routine Analyzer. Plain JS, state kept in localStorage.
// Everything stays on this device: no network calls.
import { initPhotos } from './photos.js'
const KEY = 'petal.v1'
const TABS = ['morning', 'evening', 'makeup']
const CATEGORIES = ['Cleanser', 'Toner', 'Serum', 'Moisturizer', 'SPF', 'Foundation', 'Concealer', 'Blush', 'Eyeshadow', 'Mascara', 'Lip', 'Other']

const DEFAULT_STEPS = {
  morning: ['Cleanser', 'Toner', 'Serum', 'Moisturizer', 'SPF'],
  evening: ['Remove makeup', 'Cleanser', 'Toner', 'Serum', 'Moisturizer'],
  makeup: ['Primer', 'Foundation', 'Concealer', 'Blush', 'Eyeshadow', 'Mascara', 'Lip'],
}

// ---------- state ----------
let uid = 0
const newId = () => `${Date.now().toString(36)}${(uid++).toString(36)}`

function defaults() {
  const routines = {}
  for (const t of TABS) routines[t] = DEFAULT_STEPS[t].map((name) => ({ id: newId(), name }))
  return { routines, checks: { date: '', ids: [] }, days: [], products: [], quiz: null }
}

function load() {
  const base = defaults()
  try {
    const saved = JSON.parse(localStorage.getItem(KEY))
    if (!saved || typeof saved !== 'object') return base
    const s = { ...base, ...saved }
    for (const t of TABS) if (!Array.isArray(s.routines?.[t])) s.routines = { ...s.routines, [t]: base.routines[t] }
    if (!Array.isArray(s.days)) s.days = []
    if (!Array.isArray(s.products)) s.products = []
    if (!s.checks || !Array.isArray(s.checks.ids)) s.checks = base.checks
    return s
  } catch {
    return base
  }
}

let state = load()

delete state.lastCheck
delete state.bestTags
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* private mode / full: keep going in memory */ }
}

// ---------- dates (all local time) ----------
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today = () => ymd(new Date())
const toUtcDay = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const daysBetween = (a, b) => Math.round((toUtcDay(b) - toUtcDay(a)) / 86400000)
function addMonths(s, n) {
  const [y, m, d] = s.split('-').map(Number)
  const target = new Date(y, m - 1 + n, 1)
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(d, last))
  return ymd(target)
}

// Checked state is per day: a new day starts with a fresh checklist.
function rollover() {
  if (state.checks.date !== today()) {
    state.checks = { date: today(), ids: [] }
    save()
  }
}

// ---------- dom helpers ----------
const $ = (id) => document.getElementById(id)
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (v === true) el.setAttribute(k, '')
    else if (v !== false && v != null) el.setAttribute(k, v)
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid)
  return el
}
function toast(msg) {
  document.querySelector('.toast')?.remove()
  const t = h('div', { class: 'toast', role: 'status' }, msg)
  document.body.append(t)
  setTimeout(() => t.remove(), 3200)
}

// ---------- streak ----------
const isDone = (tab) => {
  const steps = state.routines[tab]
  return steps.length > 0 && steps.every((s) => state.checks.ids.includes(s.id))
}

function currentStreak() {
  const set = new Set(state.days)
  let d = new Date()
  if (!set.has(ymd(d))) d.setDate(d.getDate() - 1) // today not done yet: streak still alive through yesterday
  let n = 0
  while (set.has(ymd(d))) { n++; d.setDate(d.getDate() - 1) }
  return n
}

// Returns true when today newly became complete.
function syncStreak(allowRevoke = false) {
  const t = today()
  const complete = isDone('morning') || isDone('evening')
  const has = state.days.includes(t)
  if (complete && !has) { state.days.push(t); state.days = state.days.slice(-400); return true }
  if (!complete && has && allowRevoke) state.days = state.days.filter((d) => d !== t)
  return false
}

function renderStreak() {
  const n = currentStreak()
  const doneToday = state.days.includes(today())
  $('streak').classList.toggle('on', n > 0)
  $('streak-count').textContent = n === 1 ? '1 day streak' : `${n} day streak`
  $('streak-msg').textContent = doneToday
    ? 'Today is done. You are glowing!'
    : n > 0
      ? 'Finish a routine today to keep it going!'
      : 'Finish your morning or evening routine to start one!'
}

// ---------- routine ----------
let tab = new Date().getHours() < 15 ? 'morning' : 'evening'

const CHEERS = {
  0: ['Ready when you are.', 'A little self-care goes a long way.'],
  mid: ['Lovely, keep going!', 'Look at you go!'],
  done: ['All done. Gorgeous!', 'Routine complete. Go shine!'],
}
const pick = (a) => a[Math.floor(Math.random() * a.length)]
let cheerCache = { key: '', text: '' }

function renderTabs() {
  document.querySelectorAll('.tabs [role=tab]').forEach((b) => {
    const on = b.dataset.tab === tab
    b.setAttribute('aria-selected', on)
    b.tabIndex = on ? 0 : -1
  })
  $('steps-panel').setAttribute('aria-labelledby', `tab-${tab}`)
}

function renderSteps() {
  const steps = state.routines[tab]
  const checked = steps.filter((s) => state.checks.ids.includes(s.id)).length
  const pct = steps.length ? Math.round((checked / steps.length) * 100) : 0
  $('bar').style.width = `${pct}%`
  $('progress').setAttribute('aria-valuenow', pct)
  $('progress').setAttribute('aria-label', `${tab} progress`)
  $('progress-text').textContent = `${checked}/${steps.length}`

  const phase = steps.length && checked === steps.length ? 'done' : checked ? 'mid' : 0
  const ck = `${tab}:${phase}`
  if (cheerCache.key !== ck) cheerCache = { key: ck, text: pick(CHEERS[phase]) }
  $('cheer').textContent = steps.length ? cheerCache.text : ''

  const list = $('steps')
  list.replaceChildren()
  if (!steps.length) list.append(h('li', { class: 'empty' }, 'No steps yet. Add your first one below!'))
  for (const s of steps) {
    const cb = h('input', { type: 'checkbox', onchange: () => toggle(s.id) })
    cb.checked = state.checks.ids.includes(s.id)
    list.append(h('li', {},
      h('label', { class: 'step' }, cb, h('span', { class: 'box', 'aria-hidden': 'true' }), h('span', { class: 'name' }, s.name)),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Remove ${s.name}`, onclick: () => removeStep(s.id) }, '✕'),
    ))
  }
}

function toggle(id) {
  rollover()
  const i = state.checks.ids.indexOf(id)
  if (i >= 0) state.checks.ids.splice(i, 1)
  else state.checks.ids.push(id)
  const won = syncStreak(true) // unchecking can undo a mis-tap; editing the list never revokes
  save()
  renderSteps()
  renderStreak()
  if (won) {
    const n = currentStreak()
    toast(n > 1 ? `${n} days in a row! You're on a roll 🌸` : 'Routine complete! Streak started 🌸')
  }
}

function removeStep(id) {
  state.routines[tab] = state.routines[tab].filter((s) => s.id !== id)
  state.checks.ids = state.checks.ids.filter((x) => x !== id)
  syncStreak()
  save()
  renderSteps()
  renderStreak()
}

function addStep(name, to = tab) {
  name = name.trim().replace(/\s+/g, ' ')
  if (!name) return false
  if (state.routines[to].some((s) => s.name.toLowerCase() === name.toLowerCase())) return false
  state.routines[to].push({ id: newId(), name })
  save()
  return true
}

// ---------- shelf ----------
const monthsFor = (cat) => (cat === 'Mascara' ? 6 : 12)

function renderProducts() {
  const list = $('products')
  list.replaceChildren()
  if (!state.products.length) {
    list.append(h('li', { class: 'empty', style: 'display:block;background:none;border:0' }, 'Your shelf is empty. Add a favorite above!'))
    return
  }
  const now = today()
  const items = [...state.products].sort((a, b) => a.opened.localeCompare(b.opened))
  for (const p of items) {
    const days = Math.max(0, daysBetween(p.opened, now))
    const months = monthsFor(p.category)
    const expires = addMonths(p.opened, months)
    const left = daysBetween(now, expires)
    let note = ''
    if (left <= 0) note = `Time to say goodbye? Opened over ${months} months ago. Makeup and skincare don't last forever.`
    else if (left <= 30) note = `Heads up: reaches ${months} months in ${left} day${left === 1 ? '' : 's'}.`
    list.append(h('li', { class: note ? 'warn' : '' },
      h('div', { class: 'p-main' },
        h('div', { class: 'p-name' }, p.name),
        h('div', { class: 'p-meta' }, `${p.category} · opened ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}`),
        note && h('div', { class: 'p-note' }, `⚠️ ${note}`),
      ),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Remove ${p.name}`, onclick: () => {
        state.products = state.products.filter((x) => x.id !== p.id); save(); renderProducts()
      } }, '✕'),
    ))
  }
}

// ---------- quiz ----------
const QUESTIONS = [
  { q: 'By midday, how does your bare skin usually feel?', a: [
    ['Shiny and slick all over', { type: 'oily' }],
    ['Tight or a bit flaky', { type: 'dry' }],
    ['Shiny on my T-zone, normal elsewhere', { type: 'combination' }],
    ['Itchy, red, or easily upset', { type: 'sensitive' }],
  ] },
  { q: 'After washing your face, you notice...', a: [
    ['It feels fresh and clean, and oil returns fast', { type: 'oily' }],
    ['It feels tight until I moisturize', { type: 'dry' }],
    ['My cheeks feel tight, but my nose and forehead feel fine', { type: 'combination' }],
    ['It can sting or turn pink', { type: 'sensitive' }],
  ] },
  { q: 'What would you most love to focus on?', a: [
    ['Breakouts and clogged pores', { concern: 'acne' }],
    ['Dryness and a lack of glow', { concern: 'dryness' }],
    ['Fine lines and aging', { concern: 'aging' }],
    ['Dark spots and uneven tone', { concern: 'spots' }],
  ] },
  { q: 'How much time do you want to spend on skincare?', a: [
    ['Keep it quick: just the basics', { time: 'quick' }],
    ['I enjoy a fuller ritual', { time: 'full' }],
  ] },
]

const TYPE_INFO = {
  oily: { title: 'Dewy & Balanced', blurb: 'Your skin makes plenty of its own glow. Light textures tend to feel best.', cleanser: 'gentle gel or foaming formula', moist: 'lightweight gel moisturizer' },
  dry: { title: 'Thirsty & Cozy', blurb: 'Your skin loves comfort. Creamy, hydrating textures are your friends.', cleanser: 'creamy, non-stripping formula', moist: 'rich cream' },
  combination: { title: 'Best of Both', blurb: 'A mix of zones, so keep things light and balanced.', cleanser: 'gentle, balanced formula', moist: 'lightweight lotion' },
  sensitive: { title: 'Soft & Gentle', blurb: 'Your skin likes calm, simple routines with few products at a time.', cleanser: 'fragrance-free, mild formula', moist: 'fragrance-free soothing cream' },
}
const CONCERN_INFO = {
  acne: { label: 'breakouts', am: 'light serum, oil-free', pm: 'light serum, oil-free', tip: 'Be gentle: over-scrubbing can make skin cranky. Pick oil-free, non-comedogenic labels.' },
  dryness: { label: 'dryness', am: 'hydrating serum', pm: 'hydrating serum', tip: 'Apply moisturizer on slightly damp skin to lock in that fresh feeling.' },
  aging: { label: 'fine lines', am: 'antioxidant serum', pm: 'night serum (introduce new ones slowly)', tip: 'Daily SPF is the habit most worth keeping. Sunscreen is your best friend.' },
  spots: { label: 'dark spots', am: 'brightening serum', pm: 'night serum (introduce new ones slowly)', tip: 'Wear SPF daily and reapply. Dark spots love sunshine.' },
}

let quizStep = 0
let quizAnswers = []

function skinType(a) {
  const [t1, t2] = [a[0].type, a[1].type]
  if (t1 === t2) return t1
  if (t1 === 'sensitive' || t2 === 'sensitive') return 'sensitive'
  return 'combination'
}

function computeResult(a) {
  const type = skinType(a)
  const concern = a[2].concern
  const quick = a[3].time === 'quick'
  const T = TYPE_INFO[type], C = CONCERN_INFO[concern]
  const morning = [['Cleanser', T.cleanser]]
  const evening = [['Cleanser', T.cleanser]]
  if (!quick) { morning.push(['Toner', 'alcohol-free, hydrating']); evening.push(['Toner', 'alcohol-free, hydrating']) }
  if (!quick) { morning.push(['Serum', C.am]); evening.push(['Serum', C.pm]) }
  morning.push(['Moisturizer', T.moist])
  evening.push(['Moisturizer', type === 'oily' ? T.moist : 'a slightly richer cream for night'])
  morning.push(['SPF', 'broad spectrum, SPF 30 or higher'])
  return { type, concern, quick, morning, evening, T, C }
}

function renderQuiz() {
  const body = $('quiz-body')
  body.replaceChildren()
  if (state.quiz && quizStep >= QUESTIONS.length) return renderResult(body, state.quiz)
  if (quizStep === 0 && state.quiz && !quizAnswers.length) {
    // first load with a saved result
    quizStep = QUESTIONS.length
    return renderResult(body, state.quiz)
  }
  const q = QUESTIONS[quizStep]
  const dots = h('div', { class: 'q-dots', 'aria-hidden': 'true' }, QUESTIONS.map((_, i) => h('i', { class: i < quizStep ? 'done' : '' })))
  body.append(
    dots,
    h('div', { class: 'q-count' }, `Question ${quizStep + 1} of ${QUESTIONS.length}`),
    h('p', { class: 'q-title' }, q.q),
    h('div', { class: 'options' }, q.a.map(([label, val]) => h('button', { class: 'option', type: 'button', onclick: () => answer(val) }, label))),
    quizStep > 0 && h('div', { class: 'row' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => { quizAnswers.pop(); quizStep--; renderQuiz() } }, '← Back')),
  )
}

function answer(val) {
  quizAnswers[quizStep] = val
  quizStep++
  if (quizStep >= QUESTIONS.length) {
    state.quiz = { answers: quizAnswers.slice() }
    save()
  }
  renderQuiz()
  if (quizStep >= QUESTIONS.length) $('quiz-h').scrollIntoView({ behavior: 'smooth' })
}

function renderResult(body, quiz) {
  const r = computeResult(quiz.answers)
  const stepList = (rows) => h('ul', {}, rows.map(([n, d]) => h('li', {}, h('strong', {}, n), ` · ${d}`)))
  body.append(h('div', { class: 'result' },
    h('div', { class: 'q-count' }, 'Your result'),
    h('h3', {}, `${r.T.title} (${r.type} skin)`),
    h('p', {}, `${r.T.blurb} Here's a ${r.quick ? 'quick' : 'full'} routine with a little love for ${r.C.label}:`),
    h('h4', {}, '☀️ Morning'), stepList(r.morning),
    h('h4', {}, '🌙 Evening'), stepList(r.evening),
    h('div', { class: 'tip' }, `💡 ${r.C.tip}`),
    h('p', { class: 'hint', style: 'margin:12px 0 0' }, 'This is a friendly starting point, not medical advice. Patch test anything new, and chat with a dermatologist about skin concerns.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => applyQuiz(r) }, 'Add to my routine'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { quizStep = 0; quizAnswers = []; state.quiz = null; save(); renderQuiz() } }, 'Retake quiz'),
    ),
  ))
}

function applyQuiz(r) {
  let added = 0
  for (const [n] of r.morning) added += addStep(n, 'morning')
  for (const [n] of r.evening) added += addStep(n, 'evening')
  renderSteps()
  renderStreak()
  toast(added ? `Added ${added} step${added === 1 ? '' : 's'} to your routine ✨` : 'You already have all of these steps!')
}


// ---------- boot ----------
function renderAll() {
  rollover()
  const hr = new Date().getHours()
  $('greeting').textContent = hr < 12 ? 'Good morning, gorgeous' : hr < 18 ? 'Hello, gorgeous' : 'Good evening, gorgeous'
  renderTabs(); renderSteps(); renderStreak(); renderProducts()
}

document.querySelectorAll('.tabs [role=tab]').forEach((b) => {
  b.addEventListener('click', () => { tab = b.dataset.tab; renderTabs(); renderSteps() })
  b.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    tab = TABS[(TABS.indexOf(tab) + d + TABS.length) % TABS.length]
    renderTabs(); renderSteps(); $(`tab-${tab}`).focus()
  })
})

$('step-form').addEventListener('submit', (e) => {
  e.preventDefault()
  const input = $('step-input')
  const name = input.value
  if (!name.trim()) return
  if (!addStep(name)) toast('That step is already on your list 💗')
  input.value = ''
  renderSteps(); renderStreak()
})

const cat = $('p-cat')
CATEGORIES.forEach((c) => cat.append(h('option', { value: c }, c)))
$('p-date').max = today()
$('p-date').value = today()
$('product-form').addEventListener('submit', (e) => {
  e.preventDefault()
  const name = $('p-name').value.trim()
  const opened = $('p-date').value
  if (!name || !opened) return
  state.products.push({ id: newId(), name, category: cat.value, opened: opened > today() ? today() : opened })
  save()
  $('p-name').value = ''
  renderProducts()
  toast('Added to your shelf 🧴')
})

initPhotos({ $, h, toast, newId })
renderAll()
renderQuiz()

// ---------- reminders (checked only while this page is open) ----------
const REM_KEY = 'petal.reminders.v1'
const REM_IDS = ['morning', 'evening']
const REM_LABEL = { morning: 'morning', evening: 'evening', test: '' }
const SNOOZE_MS = 10 * 60 * 1000
const CATCHUP_MS = 2 * 60 * 1000 // still fire if the timer was throttled by up to 2 min

function loadRem() {
  const base = { enabled: false, items: { morning: { on: true, time: '07:30' }, evening: { on: true, time: '21:00' } }, fired: {}, snooze: {} }
  try {
    const r = JSON.parse(localStorage.getItem(REM_KEY))
    if (!r || typeof r !== 'object') return base
    for (const id of REM_IDS) {
      const it = r.items && r.items[id]
      if (it && /^([01]\d|2[0-3]):[0-5]\d$/.test(it.time)) base.items[id] = { on: it.on !== false, time: it.time }
    }
    base.enabled = r.enabled === true
    if (r.fired && typeof r.fired === 'object') base.fired = r.fired
    if (r.snooze && typeof r.snooze === 'object') base.snooze = r.snooze
    return base
  } catch { return base }
}
let rem = loadRem()
const saveRem = () => { try { localStorage.setItem(REM_KEY, JSON.stringify(rem)) } catch { /* keep going in memory */ } }

const fmtTime = (hhmm) => { const [hh, mm] = hhmm.split(':').map(Number); return new Date(2000, 0, 1, hh, mm).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }
const reminderText = (id) => (REM_LABEL[id] ? `Time for your ${REM_LABEL[id]} skincare routine!` : 'Time for your skincare routine!')

// Which reminders are due right now? Pure given (now, rem), so it is easy to reason about.
function dueReminders(now = new Date()) {
  const due = []
  if (!rem.enabled) return due
  for (const id of REM_IDS) {
    const it = rem.items[id]
    if (!it.on) continue
    const [hh, mm] = it.time.split(':').map(Number)
    const diff = now - new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm)
    const key = `${ymd(now)} ${it.time}`
    if (diff >= 0 && diff < CATCHUP_MS && rem.fired[id] !== key) due.push({ id, key })
  }
  for (const [id, at] of Object.entries(rem.snooze)) if (now.getTime() >= at) due.push({ id, snoozed: true })
  return due
}

function checkReminders(now = new Date()) {
  const due = dueReminders(now)
  if (!due.length) return
  for (const d of due) {
    if (d.snoozed) delete rem.snooze[d.id]
    else rem.fired[d.id] = d.key
  }
  saveRem()
  const ids = [...new Set(due.map((d) => d.id))]
  showAlert(ids)
}

// --- sound, voice, notification: each one optional and failure-proof ---
let audioCtx = null
function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (AC && !audioCtx) audioCtx = new AC()
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume()
  } catch { /* no audio */ }
  // Some browsers only allow speech after a user gesture; a silent utterance unlocks it.
  try {
    if ('speechSynthesis' in window && !unlockAudio.spoke) {
      unlockAudio.spoke = true
      const u = new SpeechSynthesisUtterance(' ')
      u.volume = 0
      window.speechSynthesis.speak(u)
    }
  } catch { /* no speech */ }
}
for (const ev of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(ev, unlockAudio, { once: true, passive: true })

function chime() {
  try {
    if (!audioCtx) return
    const t0 = audioCtx.currentTime
    ;[[784, 0], [988, 0.22], [1175, 0.44]].forEach(([f, dt]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain()
      o.type = 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t0 + dt)
      g.gain.exponentialRampToValueAtTime(0.25, t0 + dt + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.5)
      o.connect(g).connect(audioCtx.destination)
      o.start(t0 + dt); o.stop(t0 + dt + 0.55)
    })
  } catch { /* chime is optional */ }
}
function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text.replace('!', '.'))
    u.rate = 0.95
    window.speechSynthesis.speak(u)
  } catch { /* speech is optional */ }
}
function notify(text) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return
    const n = new Notification('Skincare & Makeup Routine Analyzer 🌸', { body: text, tag: 'petal-reminder' })
    n.onclick = () => { window.focus(); n.close() }
  } catch { /* some mobile browsers only allow notifications via a service worker */ }
}

let alertIds = []
function showAlert(ids) {
  alertIds = ids
  const names = ids.map((i) => REM_LABEL[i]).filter(Boolean)
  const text = names.length > 1 ? 'Time for your skincare routine!' : reminderText(ids[0])
  $('rem-alert-title').textContent = text
  $('rem-alert-msg').textContent = names.length === 1 ? `Your ${names[0]} routine is waiting. A few minutes of glow time 💗` : 'A few minutes of glow time 💗'
  // jump to the matching checklist so it's ready to tick off
  const go = ids.find((i) => TABS.includes(i))
  if (go) { tab = go; renderTabs(); renderSteps() }
  $('rem-alert').hidden = false
  document.body.style.overflow = 'hidden'
  $('rem-dismiss').focus()
  chime(); speak(text); notify(text)
  try { navigator.vibrate && navigator.vibrate([200, 100, 200, 100, 400]) } catch { /* ignore */ }
}
function closeAlert() {
  if ($('rem-alert').hidden) return
  $('rem-alert').hidden = true
  document.body.style.overflow = ''
  try { 'speechSynthesis' in window && window.speechSynthesis.cancel() } catch { /* ignore */ }
}
function snoozeAlert() {
  const at = Date.now() + SNOOZE_MS
  for (const id of alertIds) rem.snooze[id] = at
  saveRem()
  closeAlert()
  toast('Snoozed for 10 minutes 😴')
}

function renderReminders() {
  for (const id of REM_IDS) {
    $(`rem-${id}-on`).checked = rem.items[id].on
    $(`rem-${id}-time`).value = rem.items[id].time
  }
  const btn = $('rem-enable')
  btn.setAttribute('aria-pressed', String(rem.enabled))
  btn.textContent = rem.enabled ? '🔔 Reminders on (tap to turn off)' : '🔔 Turn on reminders'
  const lines = []
  if (!rem.enabled) lines.push('Reminders are off.')
  else {
    const on = REM_IDS.filter((i) => rem.items[i].on).map((i) => `${REM_LABEL[i]} ${fmtTime(rem.items[i].time)}`)
    lines.push(on.length ? `On for ${on.join(' and ')}. Keep this page open.` : 'On, but both times are switched off below.')
    if (!('Notification' in window)) lines.push("This browser doesn't support notifications; on-screen alerts and voice still work.")
    else if (Notification.permission === 'granted') lines.push('Notifications allowed.')
    else if (Notification.permission === 'denied') lines.push('Notifications are blocked in your browser settings; on-screen alerts and voice still work.')
  }
  $('rem-status').textContent = lines.join(' ')
}

async function toggleReminders() {
  unlockAudio()
  if (rem.enabled) { rem.enabled = false; rem.snooze = {}; saveRem(); renderReminders(); return toast('Reminders off') }
  rem.enabled = true
  saveRem()
  if ('Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission() } catch { /* ignore */ }
  }
  renderReminders()
  toast('Reminders on 🔔')
}

for (const id of REM_IDS) {
  $(`rem-${id}-on`).addEventListener('change', (e) => { rem.items[id].on = e.target.checked; saveRem(); renderReminders() })
  $(`rem-${id}-time`).addEventListener('change', (e) => {
    if (!/^\d{2}:\d{2}$/.test(e.target.value)) { e.target.value = rem.items[id].time; return }
    rem.items[id].time = e.target.value
    delete rem.fired[id]
    saveRem(); renderReminders()
  })
}
$('rem-enable').addEventListener('click', toggleReminders)
$('rem-test').addEventListener('click', () => { unlockAudio(); showAlert(['test']) })
$('rem-dismiss').addEventListener('click', closeAlert)
$('rem-snooze').addEventListener('click', snoozeAlert)
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAlert() })
renderReminders()
setInterval(checkReminders, 5000)
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders() })
checkReminders()


// keep things fresh across midnight / when the tab returns to focus
const refresh = () => { $('p-date').max = today(); renderAll() }
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh() })
setInterval(() => { if (state.checks.date !== today()) refresh() }, 60000)
