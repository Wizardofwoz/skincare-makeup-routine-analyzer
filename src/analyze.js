// On-device face + skin look-over. Pure functions (no DOM, no network).
//
// IMPORTANT: this is a colour/texture heuristic, not a trained model and not a
// medical tool. It looks at pixel colours and small-scale contrast inside the
// face area and can miss things or mislabel shadows, makeup, beards, filters,
// etc. Everything is presented as a cosmetic estimate.

export const SEVERITY = ['none', 'mild', 'moderate', 'severe']

// Face regions as fractions of the face box: [x0, y0, x1, y1]
export const REGIONS = {
  forehead: [0.22, 0.03, 0.78, 0.26],
  'left cheek': [0.08, 0.46, 0.36, 0.74],
  'right cheek': [0.64, 0.46, 0.92, 0.74],
  nose: [0.4, 0.34, 0.6, 0.66],
  chin: [0.34, 0.86, 0.66, 0.99],
}
const EYE_BAND = [0.12, 0.34, 0.88, 0.45] // only used for fine lines
const CW = 200
const CH = 260

// ---------- colour helpers ----------
const LIN = new Float32Array(256)
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
function lab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b]
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047)
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B)
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
function isSkin(r, g, b) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
  return y > 50 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173
}

// ---------- image helpers ----------
function blur(src, w, h, r) {
  if (r <= 0) return Float32Array.from(src)
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    let sum = 0, cnt = 0
    const row = y * w
    for (let x = -r; x <= r; x++) if (x >= 0 && x < w) { sum += src[row + x]; cnt++ }
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / cnt
      const add = x + r + 1, rem = x - r
      if (add < w) { sum += src[row + add]; cnt++ }
      if (rem >= 0) { sum -= src[row + rem]; cnt-- }
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0, cnt = 0
    for (let y = -r; y <= r; y++) if (y >= 0 && y < h) { sum += tmp[y * w + x]; cnt++ }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / cnt
      const add = y + r + 1, rem = y - r
      if (add < h) { sum += tmp[add * w + x]; cnt++ }
      if (rem >= 0) { sum -= tmp[rem * w + x]; cnt-- }
    }
  }
  return out
}
// Blur that only averages over mask pixels, so hair/eyes/background don't bleed in.
function maskedBlur(vals, mask, w, h, r) {
  const num = new Float32Array(w * h), den = new Float32Array(w * h)
  for (let i = 0; i < num.length; i++) if (mask[i]) { num[i] = vals[i]; den[i] = 1 }
  const n = blur(num, w, h, r), d = blur(den, w, h, r)
  const out = new Float32Array(w * h)
  for (let i = 0; i < out.length; i++) out[i] = d[i] > 0.02 ? n[i] / d[i] : vals[i]
  return out
}
function erode(mask, w, h, r) {
  const f32 = Float32Array.from(mask)
  const b = blur(f32, w, h, r)
  const out = new Uint8Array(w * h)
  const need = 1 - 1e-4
  for (let i = 0; i < out.length; i++) out[i] = mask[i] && b[i] >= need ? 1 : 0
  return out
}
function components(bin, w, h, minA, maxA) {
  const seen = new Uint8Array(w * h), res = [], stack = []
  for (let s = 0; s < bin.length; s++) {
    if (!bin[s] || seen[s]) continue
    let area = 0, sx = 0, sy = 0
    stack.push(s); seen[s] = 1
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p - x) / w
      area++; sx += x; sy += y
      if (x > 0 && bin[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1) }
      if (x < w - 1 && bin[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1) }
      if (y > 0 && bin[p - w] && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w) }
      if (y < h - 1 && bin[p + w] && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w) }
    }
    if (area >= minA && area <= maxA) res.push({ area, cx: sx / area, cy: sy / area })
  }
  return res
}
const median = (a) => { if (!a.length) return 0; const s = Float32Array.from(a).sort(); return s[s.length >> 1] }
const sev = (v, t) => (v >= t[2] ? 3 : v >= t[1] ? 2 : v >= t[0] ? 1 : 0)

// ---------- face finding ----------
// Fallback when the browser has no FaceDetector: look for a large skin-coloured
// blob that is roughly face-shaped and has two separate "feature" gaps (eyes/brows).
export function findFaceBox(data, w, h) {
  const S = Math.max(1, Math.round(Math.max(w, h) / 120))
  const gw = Math.floor(w / S), gh = Math.floor(h / S)
  if (gw < 12 || gh < 12) return null
  const g = new Uint8Array(gw * gh)
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    let r = 0, gg = 0, b = 0, n = 0
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
      const i = ((y * S + dy) * w + (x * S + dx)) * 4
      r += data[i]; gg += data[i + 1]; b += data[i + 2]; n++
    }
    g[y * gw + x] = isSkin(r / n, gg / n, b / n) ? 1 : 0
  }
  // largest skin component
  const seen = new Uint8Array(gw * gh)
  let best = null
  const stack = []
  for (let s = 0; s < g.length; s++) {
    if (!g[s] || seen[s]) continue
    let area = 0, x0 = gw, y0 = gh, x1 = 0, y1 = 0
    stack.push(s); seen[s] = 1
    while (stack.length) {
      const p = stack.pop(), x = p % gw, y = (p - x) / gw
      area++
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      if (x > 0 && g[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1) }
      if (x < gw - 1 && g[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1) }
      if (y > 0 && g[p - gw] && !seen[p - gw]) { seen[p - gw] = 1; stack.push(p - gw) }
      if (y < gh - 1 && g[p + gw] && !seen[p + gw]) { seen[p + gw] = 1; stack.push(p + gw) }
    }
    if (!best || area > best.area) best = { area, x0, y0, x1, y1 }
  }
  if (!best) return null
  let bw = best.x1 - best.x0 + 1, bh = best.y1 - best.y0 + 1
  if (best.area < 0.04 * gw * gh) return null // too small
  if (bw / bh > 1.3 || bh / bw > 2.0) return null // not head-shaped (arm, torso, wall...)
  if (best.area / (bw * bh) < 0.5) return null // ragged blob
  bh = Math.min(bh, Math.round(bw * 1.35)) // trim neck
  // two separate gaps in the eye band (eyes / brows / glasses)
  const ey0 = best.y0 + Math.round(bh * 0.2), ey1 = best.y0 + Math.round(bh * 0.72)
  const mid = best.x0 + bw / 2
  let left = 0, right = 0, cells = 0
  for (let y = ey0; y < ey1; y++) for (let x = best.x0 + Math.round(bw * 0.12); x < best.x0 + bw - Math.round(bw * 0.12); x++) {
    cells++
    if (!g[y * gw + x]) { if (x < mid) left++; else right++ }
  }
  const half = cells / 2
  if (!cells || left / half < 0.02 || right / half < 0.02 || (left + right) / cells > 0.5) return null
  return { x: best.x0 * S, y: best.y0 * S, w: bw * S, h: bh * S }
}

function crop(data, w, h, box) {
  const out = new Uint8ClampedArray(CW * CH * 3)
  for (let cy = 0; cy < CH; cy++) {
    const ya = box.y + (cy * box.h) / CH, yb = box.y + ((cy + 1) * box.h) / CH
    const iy0 = Math.max(0, Math.floor(ya)), iy1 = Math.min(h, Math.max(iy0 + 1, Math.ceil(yb)))
    for (let cx = 0; cx < CW; cx++) {
      const xa = box.x + (cx * box.w) / CW, xb = box.x + ((cx + 1) * box.w) / CW
      const ix0 = Math.max(0, Math.floor(xa)), ix1 = Math.min(w, Math.max(ix0 + 1, Math.ceil(xb)))
      let r = 0, g = 0, b = 0, n = 0
      for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) {
        const i = (y * w + x) * 4
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
      }
      const o = (cy * CW + cx) * 3
      if (n) { out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n }
    }
  }
  return out
}

function rect(fr, w = CW, h = CH) {
  return { x0: Math.round(fr[0] * w), y0: Math.round(fr[1] * h), x1: Math.round(fr[2] * w), y1: Math.round(fr[3] * h) }
}
const regionOf = (cx, cy) => {
  for (const [name, fr] of Object.entries(REGIONS)) {
    const r = rect(fr)
    if (cx >= r.x0 && cx < r.x1 && cy >= r.y0 && cy < r.y1) return name
  }
  return null
}

// ---------- main analysis ----------
// opts.box: optional {x,y,w,h} from the browser's FaceDetector (pixels of the image).
export function analyzeFace(data, w, h, opts = {}) {
  let box = opts.box ? { ...opts.box } : null
  let source = 'browser'
  if (box) {
    // detector boxes tend to start around the eyebrows: stretch up to include the forehead
    const grow = box.h * 0.2
    box.y = Math.max(0, box.y - grow); box.h = Math.min(h - box.y, box.h + grow * 1.1)
    box.x = Math.max(0, box.x); box.w = Math.min(w - box.x, box.w)
  } else {
    box = findFaceBox(data, w, h)
    source = 'estimate'
  }
  if (!box || box.w < 40 || box.h < 40) return { found: false }

  const px = crop(data, w, h, box)
  const N = CW * CH
  const L = new Float32Array(N), A = new Float32Array(N), B = new Float32Array(N)
  const skin = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    const r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2]
    const [l, a, bb] = lab(r | 0, g | 0, b | 0)
    L[i] = l; A[i] = a; B[i] = bb
    skin[i] = isSkin(r, g, b) ? 1 : 0
  }
  // Learn this person's own skin colour from the middle of the face, then keep only
  // pixels close to it. That drops eyes, brows, lips, hair, glasses and background.
  {
    const probe = []
    for (const fr of [REGIONS['left cheek'], REGIONS['right cheek'], REGIONS.forehead, REGIONS.nose]) {
      const r = rect(fr)
      for (let y = r.y0; y < r.y1; y += 2) for (let x = r.x0; x < r.x1; x += 2) if (skin[y * CW + x]) probe.push(y * CW + x)
    }
    if (probe.length < 300) return { found: false, reason: 'too-little-skin' }
    const mL = median(probe.map((i) => L[i])), mA = median(probe.map((i) => A[i])), mB = median(probe.map((i) => B[i]))
    for (let i = 0; i < N; i++) {
      if (skin[i] && (A[i] - mA > 13 || mA - A[i] > 10 || Math.abs(B[i] - mB) > 13 || Math.abs(L[i] - mL) > 38)) skin[i] = 0
    }
  }
  const core = erode(skin, CW, CH, 3)

  // pixels per region (core only)
  const regs = {}
  let skinCount = 0
  for (const [name, fr] of Object.entries(REGIONS)) {
    const r = rect(fr), idx = []
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) if (core[y * CW + x]) idx.push(y * CW + x)
    regs[name] = idx
    skinCount += idx.length
  }
  if (skinCount < 800) return { found: false, reason: 'too-little-skin' }
  const usable = Object.keys(regs).filter((k) => regs[k].length >= 120)

  const notes = []
  const allIdx = usable.flatMap((k) => regs[k])
  const meanL = allIdx.reduce((s, i) => s + L[i], 0) / allIdx.length
  if (meanL < 35) notes.push('The photo is quite dark. Move into soft daylight for a more reliable look.')
  else if (meanL > 88) notes.push('The photo is very bright or washed out. Step out of direct sun for a more reliable look.')

  // smoothed layers
  const Ls1 = maskedBlur(L, core, CW, CH, 1)
  const Ls8 = maskedBlur(L, core, CW, CH, 8)
  const As1 = maskedBlur(A, core, CW, CH, 1)
  const As8 = maskedBlur(A, core, CW, CH, 8)
  const Bs1 = maskedBlur(B, core, CW, CH, 1)
  const Bs8 = maskedBlur(B, core, CW, CH, 8)

  // fine-detail strength (also tells us if the photo is blurry)
  const Lfine = new Float32Array(N)
  for (let i = 0; i < N; i++) Lfine[i] = L[i] - Ls1[i]
  const rough = {}
  for (const k of usable) rough[k] = Math.sqrt(regs[k].reduce((s, i) => s + Lfine[i] ** 2, 0) / regs[k].length)
  const roughMed = median(usable.map((k) => rough[k]))
  if (roughMed < 0.35) notes.push('The photo looks soft or blurry, so small details may be missed. Hold steady and tap to focus.')

  const results = {} // id -> { regionName: severity }
  const add = (id, region, s) => { if (s > 0) (results[id] = results[id] || {})[region] = Math.max(s, (results[id] || {})[region] || 0) }

  // 1) acne / breakouts: small red spots
  const red = new Uint8Array(N)
  for (let i = 0; i < N; i++) if (core[i] && As1[i] - As8[i] > 4.5) red[i] = 1
  const redBlobs = components(red, CW, CH, 5, 160)
  const acneCount = {}
  for (const b of redBlobs) { const r = regionOf(b.cx, b.cy); if (r) acneCount[r] = (acneCount[r] || 0) + 1 }
  for (const [r, n] of Object.entries(acneCount)) add('acne', r, sev(n, [2, 4, 8]))

  // 2) dark spots: small dark, non-red patches
  const dark = new Uint8Array(N)
  for (let i = 0; i < N; i++) if (core[i] && Ls1[i] - Ls8[i] < -6 && As1[i] - As8[i] < 3.5) dark[i] = 1
  const darkBlobs = components(dark, CW, CH, 6, 220)
  const darkCount = {}
  for (const b of darkBlobs) { const r = regionOf(b.cx, b.cy); if (r) darkCount[r] = (darkCount[r] || 0) + 1 }
  for (const [r, n] of Object.entries(darkCount)) add('darkspots', r, sev(n, [2, 4, 7]))

  // 3) redness: broad areas redder than the rest of the face
  const refA = median(allIdx.map((i) => As8[i]))
  for (const k of usable) {
    const mean = regs[k].reduce((s, i) => s + As8[i], 0) / regs[k].length
    const score = Math.max(mean - refA, (mean - 19) * 0.9)
    add('redness', k, sev(score, [3.5, 5.5, 8]))
  }

  // 4) fine lines: long thin dark horizontal creases (forehead + around the eyes)
  const lineMask = new Uint8Array(N)
  const off = 4
  for (let y = off; y < CH - off; y++) for (let x = 0; x < CW; x++) {
    const i = y * CW + x
    if (!core[i] || !core[i - off * CW] || !core[i + off * CW]) continue
    const ctx = (Ls1[i - off * CW] + Ls1[i + off * CW]) / 2
    if (Ls1[i] < ctx - 2.2) lineMask[i] = 1
  }
  const lineAreas = { forehead: rect(REGIONS.forehead), 'around the eyes': rect(EYE_BAND) }
  for (const [name, r] of Object.entries(lineAreas)) {
    let segs = 0
    for (let y = r.y0; y < r.y1; y++) {
      let run = 0, gap = 0
      for (let x = r.x0; x <= r.x1; x++) {
        if (x < r.x1 && lineMask[y * CW + x]) { run += 1 + gap; gap = 0 }
        else if (x < r.x1 && run > 0 && gap < 2) gap++
        else { if (run >= 14) segs++; run = 0; gap = 0 }
      }
    }
    // neighbouring rows describe the same crease, so count roughly one per 3 rows
    add('lines', name, sev(Math.round(segs / 3), [2, 4, 7]))
  }

  // 5) dryness / flakiness: rougher fine texture than the rest of the face
  for (const k of usable) {
    const ratio = rough[k] / Math.max(roughMed, 0.01)
    if (rough[k] >= 2.0) add('dryness', k, sev(ratio, [1.5, 1.9, 2.4]))
  }

  // 6) enlarged pores: many tiny dark dots on nose and cheeks
  const pores = new Uint8Array(N)
  for (let i = 0; i < N; i++) if (core[i] && Ls1[i] - Ls8[i] < -2.2 && Ls1[i] - Ls8[i] > -6) pores[i] = 1
  const poreBlobs = components(pores, CW, CH, 1, 8)
  const poreCount = {}
  for (const b of poreBlobs) { const r = regionOf(b.cx, b.cy); if (r) poreCount[r] = (poreCount[r] || 0) + 1 }
  for (const k of ['nose', 'left cheek', 'right cheek']) {
    if (!usable.includes(k)) continue
    const density = ((poreCount[k] || 0) / regs[k].length) * 100
    add('pores', k, sev(density, [0.35, 0.7, 1.3]))
  }

  // 7) uneven tone: remove a simple lighting gradient, then look at what remains
  {
    const Ll = maskedBlur(L, core, CW, CH, 5), Al = maskedBlur(A, core, CW, CH, 5), Bl = maskedBlur(B, core, CW, CH, 5)
    const resid = (arr) => {
      // least-squares plane arr ~ c0 + c1*x + c2*y over skin pixels
      let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0
      for (const i of allIdx) {
        const x = (i % CW) / CW, y = Math.floor(i / CW) / CH, z = arr[i]
        n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sz += z; sxz += x * z; syz += y * z
      }
      const M = [[n, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]], v = [sz, sxz, syz]
      const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
      const D = det(M)
      const c = [0, 1, 2].map((j) => { const m = M.map((row, r) => row.map((val, col) => (col === j ? v[r] : val))); return D ? det(m) / D : 0 })
      return (i) => arr[i] - (c[0] + c[1] * ((i % CW) / CW) + c[2] * (Math.floor(i / CW) / CH))
    }
    const rl = resid(Ll), ra = resid(Al), rb = resid(Bl)
    const std = (fn) => { let s = 0; for (const i of allIdx) s += fn(i) ** 2; return Math.sqrt(s / allIdx.length) }
    const score = Math.sqrt(std(rl) ** 2 + std(ra) ** 2 + std(rb) ** 2)
    const level = sev(score, [3.4, 5, 7.5])
    if (level > 0) {
      // point at the regions that deviate most
      const dev = usable.map((k) => ({ k, d: Math.sqrt((regs[k].reduce((s, i) => s + rl(i), 0) / regs[k].length) ** 2 + (regs[k].reduce((s, i) => s + ra(i), 0) / regs[k].length) ** 2) }))
        .sort((p, q) => q.d - p.d)
      const top = dev.filter((x) => x.d > 1.2).slice(0, 3)
      for (const t of (top.length ? top : dev.slice(0, 1))) add('uneven', t.k, level)
    }
  }

  const order = ['acne', 'redness', 'darkspots', 'uneven', 'lines', 'dryness', 'pores']
  const flaws = order.filter((id) => results[id]).map((id) => {
    const regions = Object.entries(results[id]).map(([region, severity]) => ({ region, severity })).sort((a, b) => b.severity - a.severity)
    return { id, severity: Math.max(...regions.map((r) => r.severity)), regions }
  }).sort((a, b) => b.severity - a.severity)

  return { found: true, source, box, flaws, notes }
}
