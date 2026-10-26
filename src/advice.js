// What each visible flaw needs, framed around one goal:
// even skin tone, clear skin, and no other visible flaws.
// General cosmetic guidance only, never medical advice.

export const LEVEL_NAME = ['none', 'mild', 'moderate', 'severe']

export const FLAWS = {
  acne: {
    label: 'Acne / breakouts', icon: '🔴',
    goal: 'Clear skin with no active breakouts.',
    tip: 'Use a gentle cleanser and a targeted treatment. Avoid picking.',
    needs: {
      cleanser: 'Gentle gel cleanser with salicylic acid (BHA), 2 times a day',
      serum: 'Niacinamide serum to calm oil and the look of pores',
      spot: 'Spot treatment with benzoyl peroxide 2.5% or sulfur, dabbed on blemishes only',
      moisturizer: 'Light, oil-free gel moisturizer ("non-comedogenic")',
      spf: 'Oil-free or gel SPF 30+, so SPF doesn\'t feel heavy',
      makeup: 'Green-tinted corrector on red blemishes, then a thin layer of concealer; use clean brushes and sponges',
    },
    severeNote: 'Painful, deep, or widespread breakouts are best checked by a dermatologist.',
  },
  redness: {
    label: 'Redness', icon: '🌹',
    goal: 'Calm, even-looking skin without redness.',
    tip: 'Keep things gentle and fragrance-free, and protect from sun.',
    needs: {
      cleanser: 'Mild, fragrance-free cream or milk cleanser, lukewarm water',
      serum: 'Azelaic acid or a centella (cica) serum to soothe',
      spot: 'No harsh actives on red areas; introduce one new product at a time',
      moisturizer: 'Barrier cream with ceramides',
      spf: 'Mineral (zinc oxide) SPF 30+, often gentler on easily flushed skin',
      makeup: 'Green-tinted color corrector over red areas, then a light mineral foundation',
    },
    severeNote: 'Persistent, burning, or flaring redness is worth a dermatologist visit.',
  },
  darkspots: {
    label: 'Dark spots / hyperpigmentation', icon: '🟤',
    goal: 'Even tone with no dark patches.',
    tip: 'Daily SPF is the big one. Sun darkens spots again.',
    needs: {
      cleanser: 'Gentle cleanser; no scrubbing',
      serum: 'Vitamin C serum in the morning; niacinamide or azelaic acid; add retinol or bakuchiol at night',
      spot: 'Spot treatment with tranexamic acid, azelaic acid or licorice extract on the spots',
      moisturizer: 'Hydrating moisturizer; keep skin comfortable so treatments are tolerated',
      spf: 'Broad-spectrum SPF 50, reapplied every 2 hours outside',
      makeup: 'Peach or orange-toned corrector on darker spots, then a color-matched concealer',
    },
    severeNote: 'A spot that is new, changing, bleeding, or irregular should be checked by a dermatologist.',
  },
  uneven: {
    label: 'Uneven skin tone', icon: '🎨',
    goal: 'Even, balanced skin tone.',
    tip: 'Brightening actives plus daily SPF, and patience: tone changes take weeks.',
    needs: {
      cleanser: 'Gentle cleanser; lactic or mandelic acid cleanser or toner once or twice a week',
      serum: 'Vitamin C in the morning and niacinamide; gentle exfoliating acid 1-2 nights a week',
      spot: 'Dab a targeted brightener on patches if you have a clear dark area',
      moisturizer: 'Hydrating moisturizer with niacinamide or ceramides',
      spf: 'Broad-spectrum SPF 50',
      makeup: 'Color corrector where needed (green for red, peach for dark), then light, buildable foundation or skin tint',
    },
  },
  lines: {
    label: 'Fine lines / wrinkles', icon: '〰️',
    goal: 'Smooth, hydrated skin with fewer visible lines.',
    tip: 'Moisture, SPF every day, and a gentle retinoid at night.',
    needs: {
      cleanser: 'Creamy, hydrating cleanser',
      serum: 'Hyaluronic acid serum on damp skin in the morning; retinol or bakuchiol at night (start 2 nights a week)',
      spot: 'Eye cream with peptides for the eye area',
      moisturizer: 'Richer cream with ceramides and peptides at night',
      spf: 'Broad-spectrum SPF 30-50 every morning, including the eye area',
      makeup: 'Hydrating primer, cream or liquid products (powder can settle in lines), light concealer',
    },
  },
  dryness: {
    label: 'Dryness / flakiness', icon: '🏜️',
    goal: 'Soft, comfortable, smooth skin.',
    tip: 'Add moisture first, exfoliate only gently.',
    needs: {
      cleanser: 'Creamy, non-foaming cleanser, lukewarm water',
      serum: 'Hyaluronic acid on damp skin, plus squalane or glycerin',
      spot: 'Thicker balm or occlusive on flaky patches at night',
      moisturizer: 'Rich cream with ceramides, applied while skin is still damp',
      spf: 'Moisturizing SPF 30+ (cream formulas)',
      makeup: 'Hydrating primer and cream or dewy formulas; skip heavy powders',
    },
    severeNote: 'Very itchy, cracked, or scaly patches that don\'t improve should be checked by a dermatologist.',
  },
  pores: {
    label: 'Enlarged pores', icon: '🔘',
    goal: 'Smooth-looking, refined skin texture.',
    tip: 'Pores can\'t be shrunk, but they can look smaller. Keep them clear and use SPF.',
    needs: {
      cleanser: 'Gel or foaming cleanser, ideally with salicylic acid (BHA)',
      serum: 'Niacinamide serum; BHA 2-3 nights a week',
      spot: 'Clay mask once a week on the nose and cheeks',
      moisturizer: 'Lightweight, oil-free gel moisturizer',
      spf: 'Lightweight, non-greasy SPF 30+',
      makeup: 'Silicone-based pore-blurring primer on the nose and cheeks, thin layers of foundation',
    },
  },
}

const STEP_NAMES = { cleanser: 'Cleanser', serum: 'Treatment serum', spot: 'Spot treatment', moisturizer: 'Moisturizer', spf: 'SPF', makeup: 'Makeup / color corrector' }
export { STEP_NAMES }

// Short, ordered routine built from the flaws found.
export function buildRoutine(flaws) {
  const ids = flaws.map((f) => f.id)
  const has = (id) => ids.includes(id)
  const top = flaws[0] ? FLAWS[flaws[0].id] : null
  const gentle = has('redness') || has('dryness')
  const pick = (key, ...prefer) => {
    for (const id of prefer) if (has(id)) return FLAWS[id].needs[key]
    return top ? top.needs[key] : null
  }
  const morning = [
    ['Cleanser', gentle ? FLAWS[has('redness') ? 'redness' : 'dryness'].needs.cleanser : pick('cleanser', 'acne', 'pores', 'darkspots', 'uneven', 'lines')],
    ['Treatment serum', has('darkspots') || has('uneven') ? FLAWS.darkspots.needs.serum.split(';')[0] : pick('serum', 'redness', 'acne', 'lines', 'dryness', 'pores')],
    ['Moisturizer', pick('moisturizer', 'dryness', 'redness', 'lines', 'acne', 'pores', 'darkspots', 'uneven')],
    ['SPF', has('darkspots') || has('uneven') ? FLAWS.darkspots.needs.spf : pick('spf', 'redness', 'dryness', 'lines', 'acne', 'pores')],
  ]
  if (ids.some((i) => FLAWS[i].needs.makeup)) morning.push(['Makeup (optional)', pick('makeup', 'acne', 'redness', 'darkspots', 'uneven', 'lines', 'dryness', 'pores')])
  const evening = [
    ['Cleanser (twice if you wore SPF or makeup)', gentle ? FLAWS[has('redness') ? 'redness' : 'dryness'].needs.cleanser : pick('cleanser', 'acne', 'pores', 'darkspots', 'uneven', 'lines')],
    ['Treatment serum', has('lines') || has('darkspots') || has('uneven') ? 'Retinol or bakuchiol (start 2 nights a week), skipping any night skin feels irritated' : pick('serum', 'acne', 'redness', 'dryness', 'pores')],
  ]
  if (has('acne')) evening.push(['Spot treatment', FLAWS.acne.needs.spot])
  else if (has('darkspots')) evening.push(['Spot treatment', FLAWS.darkspots.needs.spot])
  evening.push(['Moisturizer', pick('moisturizer', 'dryness', 'lines', 'redness', 'acne', 'pores', 'darkspots', 'uneven')])
  return { morning: morning.filter((r) => r[1]), evening: evening.filter((r) => r[1]) }
}

// What stands between the user and the target state.
export function goalSummary(flaws) {
  if (!flaws.length) return { reached: true, steps: [] }
  const ids = flaws.map((f) => f.id)
  const steps = []
  const clear = ids.includes('acne')
  const tone = ids.some((i) => ['redness', 'darkspots', 'uneven'].includes(i))
  if (clear) steps.push('Clear skin: a gentle BHA cleanser, a targeted spot treatment, and a light moisturizer, used consistently for 6-8 weeks.')
  if (tone) steps.push('Even tone: daily SPF 30-50, a brightening serum (vitamin C, niacinamide, or azelaic acid), and a color corrector for the days you want instant evenness.')
  if (ids.includes('dryness') || ids.includes('lines')) steps.push('Smooth, comfortable skin: layered hydration (hyaluronic acid, then a ceramide cream) and a gentle retinoid at night.')
  if (ids.includes('pores')) steps.push('Refined texture: niacinamide plus a weekly BHA or clay mask.')
  return { reached: false, steps }
}
