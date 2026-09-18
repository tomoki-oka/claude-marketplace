import { Canvas } from './canvas'
import { type Rng, rngOf } from './rng'
import type { Species } from './species'

export type Ornament = { seed: number }

export type Vitals = {
  /** 0..1, how full the context window is: fuller means denser foliage, past 0.8 the leaves yellow. */
  context: number
  /** Session cost in USD: each dollar hangs a little more bloom or fruit. */
  usd: number
  turns: number
}

export type SeasonName = 'peak' | 'autumn' | 'winter' | 'spring'

/** Where the year stands once the tree is full grown; `t` runs 0..1 through the phase. */
export type Season = { name: SeasonName; t: number }

/** A cut branch: which one, and how far the tree had grown when it was cut. */
export type Cut = { branch: number; atMs: number }

export type Scene = {
  seed: number
  species: Species
  g: number
  /** Milliseconds of growth so far; a cut regrows once the tree has grown REGROW_MS past it. */
  grownMs: number
  cuts: readonly Cut[]
  /** Pads lost to rough commands (rm -rf, force push); each hides one pad. */
  wounds: number
  /** Buds from subagents' answers, drawn on the trunk. */
  sprouts: number
  /** Hour of the tree's day, 0..24; from the real clock or the sped-up one. */
  hour: number
  /** How many full years the tree has seen since its first bloom. */
  years: number
  /** Time the session has been open with the tree planted. */
  elapsedMs: number
  /** Names of the spirits living in the tree, and the tick of the last answer (they stir for a moment). */
  spirits: readonly string[]
  lastAnswerTick: number
  /** Seed for the day's weather: the calendar date on the real clock, the day count on the fast one. */
  daySeed: number
  /** 0..1 sunshine: leaves dull as it fades. */
  sun: number
  /** The branch the person is about to cut, drawn bright. */
  highlight?: number
  /** Debug only: forces the day's weather. */
  weather?: Weather
  season: Season
  tick: number
  ornaments: readonly Ornament[]
  vitals: Vitals
}

type Pt = { x: number; y: number }

export const REGROW_MS = 20 * 60_000
type Pad = { x: number; y: number; rx: number; ry: number }
type Bark = { light: number; mid: number; dark: number; line: number }

export const STAGES = ['鉢だけ', '芽', '若木', '育ち盛り', '成木', '見頃'] as const
export const SEASON_NAMES: Record<SeasonName, string> = { peak: '見頃', autumn: '葉落ち', winter: '冬木', spring: '芽吹き' }

export function stageOf(g: number, season: Season): string {
  if (g >= 1) return SEASON_NAMES[season.name]
  if (g < 0.05) return STAGES[0]
  if (g < 0.2) return STAGES[1]
  if (g < 0.45) return STAGES[2]
  if (g < 0.7) return STAGES[3]
  if (g < 0.9) return STAGES[4]
  return STAGES[5]
}

/** How yellow the leaves are from a crowded context, 0..1. */
export const wiltOf = (vitals: Vitals) => Math.min(1, Math.max(0, (vitals.context - 0.8) / 0.2))

const POT = { light: 0xd98b63, body: 0xb5613f, dark: 0x7d3d27, line: 0x4a2216, soil: 0x33241a, moss: 0x4f6b2a, mossLight: 0x6f8f3a, table: 0x2b2b2b }
const SNOW = 0xf4f7fb
const WILT = 0xd8c04a
const SPRING_LEAF = 0xa8d86a
const MOSS = 0x4f7a3a
const SKY_NIGHT = 0x0e1326
const STAR = 0xfff6cc
const MOON = 0xf7f1d0
const HIGHLIGHT = 0xffd75a
const ROPE = 0xf2ecd8
const ELDER_YEARS = 3
export const SACRED_MS = 24 * 60 * 60_000

export const isElder = (s: Scene) => s.years >= ELDER_YEARS
export const isSacred = (s: Scene) => s.elapsedMs >= SACRED_MS
export const isNight = (hour: number) => hour >= 19 || hour < 5

export function drawScene(scene: Scene, columns: number, rows: number): string {
  const c = new Canvas(columns, rows)
  paintScene(c, scene)
  return c.cells()
}

/** Draws one tree, its pot and its weather onto `c`. */
export function paintScene(c: Canvas, scene: Scene): void {
  const { w, h } = c
  // Small canvases (the shelf) draw the trunk, pads and pot thinner so the tree keeps its proportions.
  const k = Math.min(1, w / 72)
  const small = k < 1
  const g = Math.min(1, Math.max(0, scene.g))
  const { season, species } = scene
  const cx = Math.floor(w / 2)
  const pole = species.form === 'pole'
  const baobab = species.form === 'baobab'
  const cactus = species.form === 'cactus'
  const barrel = species.form === 'barrel'
  const bamboo = species.form === 'bamboo'
  const stone = species.form === 'stone'
  const wide = pole || baobab || barrel || stone
  const potW = Math.min(Math.floor(w * (wide ? 0.7 : 0.55)), wide ? 76 : 60)
  const potH = Math.max(3, Math.min(wide ? 7 : 9, Math.floor(h * (wide ? 0.08 : 0.1) * (0.6 + 0.4 * k))))
  const potTop = h - potH - 4
  const weather = weatherOf(scene)
  drawSky(c, scene, potTop)
  drawPot(c, cx, potTop, potW, potH, season, cactus || barrel)
  if (barrel) {
    drawBarrel(c, scene, cx, potTop - 1, potW, g)
    drawWeather(c, scene, weather, potTop)
    return
  }
  if (stone) {
    drawStone(c, scene, cx, potTop - 1, potW, g)
    drawOrnaments(c, [], [], scene, potTop)
    drawWeather(c, scene, weather, potTop)
    return
  }
  if (bamboo) {
    const tips = drawBamboo(c, scene, cx, potTop - 1, potW, g)
    if (g >= 1 && season.name === 'winter') snowOn(c, rngOf(scene.seed ^ 0x77777777), potTop)
    drawOrnaments(c, tips.map(t => ({ x: t.x, y: t.y, rx: 3, ry: 1 })), tips, scene, potTop)
    drawSpirits(c, tips.map(t => ({ x: t.x, y: t.y, rx: 3, ry: 1 })), scene)
    drawWeather(c, scene, weather, potTop)
    return
  }

  const bark = barkOf(species.bark)
  const rng = rngOf(scene.seed)
  const room = potTop - 4
  const height = pole ? room * 0.97 : baobab ? room * 0.5 : cactus ? room * 0.85 : room * (0.72 + rng() * 0.12)
  const trunk = pole ? poleTrunkOf(rng, cx, potTop - 1, height) : baobab ? poleTrunkOf(rng, cx, potTop - 1, height, 4) : cactus ? poleTrunkOf(rng, cx, potTop - 1, height, 4, true) : trunkOf(rng, cx, potTop - 1, height, w)
  if ((pole || baobab) && g >= 0.05) drawRootFlare(c, cx, potTop - 1, potW, bark, g)
  const tips: Pt[] = []
  const pads: Pad[] = []
  const litSegments: [Pt, Pt][] = []

  if (g >= 0.05) {
    const shown = Math.min(1, g / 0.55)
    drawTrunk(c, trunk, shown, g, bark, k * (isElder(scene) ? 1.35 : 1) * (pole ? 0.6 : baobab ? 3.4 : cactus ? 2.2 : 1), species.magic === 'dragon' ? 'scales' : cactus ? 'spines' : 'none', baobab)
    if (isElder(scene)) drawElderMarks(c, rngOf(scene.seed ^ 0x0e1de7), trunk)
    if (isSacred(scene)) drawShimenawa(c, trunk, potTop)
    if (g >= 0.18) drawBranches(c, rng, trunk, shown, g, tips, w, bark, scene, litSegments)
  }

  const leafScale = cactus ? 0 : leafScaleOf(g, season, species)
  if (cactus && g >= species.bloomAt && isBlooming(scene) && species.bloom) for (const t of tips) cactusFlowerAt(c, t, species.bloom)
  if (g >= 0.3 && leafScale > 0) {
    const padRng = rngOf(scene.seed ^ 0x9e3779b9)
    for (const t of tips) padsAt(padRng, t, g, leafScale * k, scene.vitals, pads, pole || baobab, small)
    const top = trunk[trunk.length - 1]!
    if (g >= 0.5) padsAt(padRng, { x: top.x, y: top.y - (pole ? 3 : 1) }, g, leafScale * k, scene.vitals, pads, pole || baobab, small)
    for (let i = 0; i < scene.wounds && pads.length > 1; i++) pads.splice(Math.floor(padRng() * pads.length), 1)
    drawPads(c, pads, scene, padRng)
  }
  if (g >= 0.18 && scene.sprouts > 0) drawSprouts(c, rngOf(scene.seed ^ 0x5bd1e995), trunk, Math.min(1, g / 0.55), scene.sprouts)
  if (g >= 1 && season.name === 'winter') snowOn(c, rngOf(scene.seed ^ 0x77777777), potTop)
  if (!small) drawOrnaments(c, pads, tips, scene, potTop)
  if (!small) drawSpirits(c, pads, scene)
  for (const [a, b] of litSegments) c.line(a.x, a.y, b.x, b.y, 1.6, ((scene.tick >> 1) & 1) ? HIGHLIGHT : 0xffffff)
  if (litSegments.length) { const t = litSegments[litSegments.length - 1]![1]; c.disc(Math.round(t.x), Math.round(t.y), 2, HIGHLIGHT) }
  if (!small && isFalling(scene)) drawFalling(c, scene, potTop)
  drawWeather(c, scene, weather, potTop)
  if (!small && species.twinkle && g >= species.fruitAt && isBlooming(scene)) drawTwinkle(c, pads, scene)
}

/** 1 while growing and in peak; shrinks through autumn, 0 in winter, regrows in spring. Evergreens keep theirs. */
function leafScaleOf(g: number, season: Season, species: Species): number {
  if (g < 1 || species.evergreen) return 1
  switch (season.name) {
    case 'peak': return 1
    case 'autumn': return Math.max(0, 1 - season.t * 1.15)
    case 'winter': return 0
    case 'spring': return Math.min(1, 0.25 + season.t * 0.85)
  }
}

const isBlooming = (s: Scene) => s.g < 1 || s.season.name === 'peak' || (s.season.name === 'spring' && s.season.t > 0.85)
const isFalling = (s: Scene) => {
  if (s.g >= 1 && s.season.name === 'autumn' && !s.species.evergreen) return true
  return s.species.falling && s.g >= s.species.bloomAt && isBlooming(s)
}

function barkOf(mid: number): Bark {
  return { light: lighten(mid, 0.28), mid, dark: darken(mid, 0.62), line: darken(mid, 0.38) }
}

function drawPot(c: Canvas, cx: number, top: number, w: number, h: number, season: Season, sandy = false) {
  const half = Math.floor(w / 2)
  for (let x = -half - 4; x <= half + 4; x++) c.set(cx + x, top + h + 2, POT.table)
  for (const fx of [-half + 4, half - 4]) for (let x = -2; x <= 2; x++) c.set(cx + fx + x, top + h + 1, POT.dark)
  for (let x = -half - 2; x <= half + 2; x++) { c.set(cx + x, top, POT.light); c.set(cx + x, top + 1, x > half - 3 ? POT.dark : POT.body) }
  for (let y = 2; y <= h; y++) {
    const shrink = Math.floor(((y - 2) / h) * 3)
    for (let x = -half + shrink; x <= half - shrink; x++) {
      const t = (x + half) / (2 * half)
      const color = t < 0.12 ? POT.light : t > 0.8 ? POT.dark : y === h ? POT.dark : POT.body
      c.set(cx + x, top + y, color)
    }
    c.set(cx - half + shrink - 1, top + y, POT.line); c.set(cx + half - shrink + 1, top + y, POT.line)
  }
  for (let x = -half + 1; x <= half - 1; x++) c.set(cx + x, top - 1, sandy ? 0xd9c28a : POT.soil)
  const rng = rngOf(0xbadd1e)
  const snowy = season.name === 'winter'
  for (let x = -half + 2; x <= half - 2; x++) if (rng() < 0.55) c.set(cx + x, top - 2, snowy ? SNOW : sandy ? (rng() < 0.3 ? 0xb89a6a : 0xe8d9a8) : rng() < 0.3 ? POT.mossLight : POT.moss)
}

/** One straight trunk, its joints evenly spaced so the tiers of branches sit at each. */
function poleTrunkOf(rng: Rng, x0: number, y0: number, height: number, tiers = 6 + Math.floor(rng() * 3), straight = false): Pt[] {
  const lean = straight ? 0 : (rng() - 0.5) * 1.5
  const pts: Pt[] = [{ x: x0, y: y0 }]
  for (let i = 1; i <= tiers; i++) pts.push({ x: x0 + (lean * i) / tiers, y: y0 - (height / tiers) * i })
  return pts
}

/** Roots spreading over the soil to the pot's rim: the trunk fills the pot. */
function drawRootFlare(c: Canvas, cx: number, y: number, potW: number, bark: Bark, g: number) {
  const reach = Math.floor((potW / 2 - 3) * Math.min(1, g / 0.55))
  for (let dx = -reach; dx <= reach; dx++) {
    const t = Math.abs(dx) / Math.max(1, reach)
    const rise = Math.round((1 - t) * (1 - t) * 3)
    for (let dy = 0; dy <= rise; dy++) c.set(cx + dx, y - dy, dy === rise ? bark.light : dx % 4 === 0 ? bark.dark : bark.mid)
  }
}

function trunkOf(rng: Rng, x0: number, y0: number, height: number, w: number): Pt[] {
  const bends = 3 + Math.floor(rng() * 2)
  const pts: Pt[] = [{ x: x0, y: y0 }]
  let dir = rng() < 0.5 ? -1 : 1
  let x = x0
  for (let i = 1; i <= bends; i++) {
    const rise = height / bends
    const sway = w * (0.05 + rng() * 0.07) * (1 - i / (bends + 2))
    x += dir * sway
    pts.push({ x, y: y0 - rise * i })
    dir = -dir
  }
  return pts
}

function drawTrunk(c: Canvas, pts: Pt[], shown: number, g: number, bark: Bark, girth: number, pattern: 'none' | 'scales' | 'spines', bottle = false) {
  const total = pts.length - 1
  const visible = shown * total
  for (let i = 0; i < total; i++) {
    if (i >= visible) break
    const f = Math.min(1, visible - i)
    const a = pts[i]!, b = pts[i + 1]!
    const bx = a.x + (b.x - a.x) * f, by = a.y + (b.y - a.y) * f
    const steps = Math.ceil(Math.hypot(bx - a.x, by - a.y))
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const x = a.x + (bx - a.x) * t, y = a.y + (by - a.y) * t
      const along = (i + t * f) / total
      const taper = bottle ? 3.2 - along * 2.6 : 3.2 - along * 2.2
      const r = taper * (0.55 + g * 0.5) * girth
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        if (Math.abs(dx) > r) continue
        let shade = dx < -r * 0.45 ? bark.light : dx > r * 0.45 ? bark.dark : bark.mid
        if (pattern === 'scales' && (Math.round(y) + dx) % 3 === 0 && Math.round(y) % 2 === 0) shade = mix(shade, 0xc0392b, 0.35)
        if (pattern === 'spines') { if (dx % 3 === 0) shade = darken(shade, 0.75); if (dx % 3 === 0 && Math.round(y) % 4 === 0) shade = 0xf0f0d8 }
        c.set(Math.round(x) + dx, y, shade)
      }
      if (r >= 1.5) { c.set(Math.round(x) - Math.ceil(r) - 1, y, bark.line); c.set(Math.round(x) + Math.ceil(r) + 1, y, bark.line) }
    }
  }
}

/** Draws the branches in a fixed order, numbering them; returns how many there are. `c` null only counts. */
function drawBranches(c: Canvas | null, rng: Rng, trunk: Pt[], shown: number, g: number, tips: Pt[], w: number, bark: Bark, scene: Scene, litSegments: [Pt, Pt][] = []): number {
  const total = trunk.length - 1
  const form = scene.species.form
  const pole = form === 'pole'
  let index = 0
  if (form === 'cactus') {
    for (let i = 1; i <= total; i++) {
      if (i > shown * total + 0.01 || i > 2) break
      const from = trunk[i]!
      const dir = i === 1 ? -1 : 1
      const reach = Math.min(11 + Math.floor(rng() * 3), Math.floor(w * 0.14)), rise = Math.min(10 + Math.floor(rng() * 8), Math.floor(c ? c.h * 0.22 : 18))
      const grow = Math.min(1, (g - 0.18) / 0.5 + 0.2)
      const cut = scene.cuts.find(x => x.branch === index)
      const lit = scene.highlight === index
      index++
      if (!c || cut) continue
      const ex = from.x + dir * reach, ey = from.y
      if (lit) litSegments.push([from, { x: ex, y: ey }], [{ x: ex, y: ey }, { x: ex, y: ey - rise * Math.min(1, (g - 0.18) / 0.5 + 0.2) }])
      c.line(from.x, from.y, ex, ey, 2.4, bark.mid)
      for (let x = Math.min(from.x, ex); x <= Math.max(from.x, ex); x++) { c.set(x, ey - 2, bark.light); c.set(x, ey + 2, bark.dark) }
      const top = Math.round(ey - rise * grow)
      c.line(ex, ey, ex, top, 2.4, bark.mid)
      for (let y = top; y <= ey; y++) { c.set(ex - 2, y, bark.light); c.set(ex + 2, y, bark.dark); if (y % 4 === 0) { c.set(ex, y, 0xf0f0d8); c.set(ex - 2, y + 2, 0xf0f0d8); c.set(ex + 2, y + 2, 0xf0f0d8) } }
      c.disc(Math.round(ex), top, 2, bark.mid); c.set(Math.round(ex) - 1, top - 1, bark.light)
      tips.push({ x: ex, y: ey - rise * grow })
    }
    tips.push({ x: trunk[total]!.x, y: trunk[total]!.y })
    return index
  }
  for (let i = 1; i <= total; i++) {
    if (i > shown * total + 0.01) break
    const from = trunk[i]!
    const side = (trunk[i]!.x - trunk[i - 1]!.x) > 0 ? 1 : -1
    if (form === 'baobab' && i < total - 1) continue
    const count = pole ? (i === total ? 0 : 2) : form === 'baobab' ? 3 : i === total ? 1 : 1 + (rng() < 0.6 ? 1 : 0)
    for (let k = 0; k < count; k++) {
      const dir = k === 0 ? side : -side
      const len = pole
        ? w * (0.05 + rng() * 0.03) * (1.3 - i / total) * Math.min(1, (g - 0.18) / 0.5 + 0.35)
        : form === 'baobab'
          ? w * (0.06 + rng() * 0.05) * Math.min(1, (g - 0.18) / 0.5 + 0.35)
          : w * (0.12 + rng() * 0.1) * (1 - i / (total + 3)) * Math.min(1, (g - 0.18) / 0.5 + 0.35)
      const lift = pole ? -(0.02 + rng() * 0.08) : form === 'baobab' ? -(0.5 + rng() * 0.6) : -(0.12 + rng() * 0.2)
      const hasTwig = !pole && g > 0.55 && rng() < 0.7
      const cut = scene.cuts.find(x => x.branch === index)
      const lit = scene.highlight === index
      index++
      const ex = from.x + dir * len, ey = from.y + lift * len
      const midx = from.x + dir * len * 0.5, midy = ey + 1.5
      if (!c) continue
      if (lit && !cut) litSegments.push([from, { x: midx, y: midy }], [{ x: midx, y: midy }, { x: ex, y: ey }])
      if (cut) {
        const stubx = from.x + dir * Math.min(len * 0.25, 4), stuby = from.y + lift * Math.min(len * 0.25, 4)
        c.line(from.x, from.y, stubx, stuby, 1.0, bark.mid)
        c.set(Math.round(stubx), Math.round(stuby), lighten(bark.light, 0.4))
        const age = scene.grownMs - cut.atMs
        if (age >= REGROW_MS) {
          const t = Math.min(1, (age - REGROW_MS) / REGROW_MS)
          const twig = rngOf(scene.seed ^ (cut.branch * 2654435761))
          for (let j = 0; j < 2; j++) {
            const tl = len * (0.35 + twig() * 0.25) * (0.3 + t * 0.7)
            const ta = lift - 0.25 - j * 0.45 - twig() * 0.2
            const tx = stubx + dir * tl, ty = stuby + ta * tl
            c.line(stubx, stuby, tx, ty, 0.6, bark.mid)
            tips.push({ x: tx, y: ty })
          }
        }
        continue
      }
      c.line(from.x, from.y, midx, midy, 1.1, bark.mid)
      c.line(midx, midy, ex, ey, 0.8, bark.mid)
      c.line(from.x, from.y + 1, midx, midy + 1, 0.4, bark.dark)
      tips.push({ x: ex, y: ey })
      if (hasTwig) {
        const tx = midx + dir * len * 0.2, ty = midy - len * 0.35
        c.line(midx, midy, tx, ty, 0.5, bark.mid)
        tips.push({ x: tx, y: ty })
      }
    }
  }
  return index
}

/** How many branches the tree has right now, so a cut can name one. */
export function branchCountOf(scene: Scene, columns: number, rows: number): number {
  if (scene.species.form === 'barrel' || scene.species.form === 'stone') return 0
  if (scene.species.form === 'bamboo') return culmCountOf(scene.g)
  const c = new Canvas(columns, rows)
  const g = Math.min(1, Math.max(0, scene.g))
  if (g < 0.18) return 0
  const cx = Math.floor(c.w / 2)
  const potH = Math.max(6, Math.min(9, Math.floor(c.h * 0.1)))
  const potTop = c.h - potH - 4
  const rng = rngOf(scene.seed)
  const height = (potTop - 4) * (0.72 + rng() * 0.12)
  const trunk = trunkOf(rng, cx, potTop - 1, height, c.w)
  return drawBranches(null, rng, trunk, Math.min(1, g / 0.55), g, [], c.w, barkOf(scene.species.bark), scene)
}

function padsAt(rng: Rng, tip: Pt, g: number, leafScale: number, vitals: Vitals, pads: Pad[], small = false, sparse = false) {
  const scale = Math.min(1, (g - 0.3) / 0.5 + 0.25) * leafScale * (small ? 0.55 : 1) * (sparse ? 0.8 : 1)
  const density = 1 + Math.round(vitals.context * 2)
  const n = sparse ? 1 : 1 + density
  for (let i = 0; i < n; i++) {
    const rx = Math.max(1, Math.round((4 + rng() * 5) * scale))
    const ry = Math.max(1, Math.round(rx * (0.35 + rng() * 0.15)))
    pads.push({ x: Math.round(tip.x + (rng() - 0.5) * rx * 1.4), y: Math.round(tip.y - ry * 0.6 + (rng() - 0.5) * ry * 1.5), rx, ry })
  }
}

function leafShades(scene: Scene): [number, number, number] {
  const { species, season, g, vitals } = scene
  let [mid, dark, light] = [species.leaves[0]!, species.leaves[1]!, species.leaves[2]!]
  if (g >= 1 && !species.evergreen && species.autumn) {
    const [am, ad, al] = [species.autumn[0]!, species.autumn[1]!, species.autumn[2]!]
    const k = season.name === 'autumn' ? Math.min(1, season.t * 1.6) : 0
    mid = mix(mid, am, k); dark = mix(dark, ad, k); light = mix(light, al, k)
  }
  if (g >= 1 && season.name === 'spring' && !species.evergreen) {
    const k = 1 - season.t
    mid = mix(mid, SPRING_LEAF, k * 0.6); light = mix(light, SPRING_LEAF, k * 0.6)
  }
  const shade = (1 - Math.min(1, Math.max(0, scene.sun))) * 0.45
  if (shade > 0) { mid = mix(mid, 0x6f6f66, shade); dark = mix(dark, 0x4a4a44, shade); light = mix(light, 0x8a8a80, shade) }
  const wilt = wiltOf(vitals)
  if (wilt > 0) { mid = mix(mid, WILT, wilt * 0.7); dark = mix(dark, darken(WILT, 0.6), wilt * 0.7); light = mix(light, lighten(WILT, 0.3), wilt * 0.7) }
  return [dark, mid, light]
}

export type Weather = 'clear' | 'snow' | 'meteors' | 'rain'

/** The day's weather, the same all day for everyone opening a tree that day: mostly clear. */
function weatherOf(scene: Scene): Weather {
  if (scene.weather) return scene.weather
  const roll = rngOf(scene.daySeed ^ 0x77e47e)() 
  if (roll < 0.03) return 'snow'
  if (roll < 0.06) return scene.g >= 1 ? 'meteors' : 'clear'
  if (roll < 0.11) return 'rain'
  return 'clear'
}

/** Night: one small moon in the corner. Day: nothing. */
function drawSky(c: Canvas, scene: Scene, _potTop: number) {
  if (!isNight(scene.hour)) return
  const mx = Math.floor(c.w * 0.84), my = 4
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const d = dx * dx + dy * dy
    const shadow = (dx + 1) * (dx + 1) + dy * dy
    if (d <= 5 && shadow > 3) c.set(mx + dx, my + dy, MOON)
  }
}

function drawWeather(c: Canvas, scene: Scene, weather: Weather, potTop: number) {
  if (weather === 'clear') return
  const rng = rngOf(scene.daySeed ^ 0x3e47)
  if (weather === 'meteors') {
    if (!isNight(scene.hour)) return
    const period = 48
    const phase = scene.tick % period
    if (phase > 14) return
    const x0 = 6 + rng() * (c.w * 0.6), y0 = 2 + rng() * 6
    for (let i = 0; i < 5; i++) {
      const x = x0 + phase * 2 + i, y = y0 + phase + i * 0.5
      c.set(x, y, i === 4 ? 0xffffff : mix(STAR, SKY_NIGHT, i / 5))
    }
    return
  }
  const n = weather === 'snow' ? 26 : 34
  for (let i = 0; i < n; i++) {
    const speed = weather === 'snow' ? 0.25 + rng() * 0.3 : 1.4 + rng() * 0.6
    const x0 = rng() * c.w, phase = rng() * 100
    const y = ((scene.tick * speed + phase) % (potTop + 4)) - 2
    const x = weather === 'snow' ? x0 + Math.sin((scene.tick + phase) * 0.08) * 2 : x0 - (y * 0.15)
    if (weather === 'rain') { c.set(x, y, 0x7f9fc9); c.set(x, y - 1, 0x5f7fa9) }
    else c.set(x, y, SNOW)
  }
}

export const culmCountOf = (g: number) => Math.min(6, 1 + Math.floor(Math.max(0, g - 0.05) * 6))

/** Bamboo: culms rise one by one as it grows, each ringed at the nodes with a spray of leaves near the top; it sways a little. */
function drawBamboo(c: Canvas, scene: Scene, cx: number, ground: number, potW: number, g: number): Pt[] {
  const tips: Pt[] = []
  if (g < 0.05) return tips
  const rng = rngOf(scene.seed ^ 0xba3b00)
  const bark = barkOf(scene.species.bark)
  const [leafMid, leafDark, leafLight] = [scene.species.leaves[0]!, scene.species.leaves[1]!, scene.species.leaves[2]!]
  const count = culmCountOf(g)
  const room = ground - 6
  for (let i = 0; i < 6; i++) {
    const x0 = cx + Math.round((rng() - 0.5) * potW * 0.6)
    const full = room * (0.6 + rng() * 0.4)
    const nodeGap = 7 + Math.floor(rng() * 4)
    const lean = (rng() - 0.5) * 6
    if (i >= count) continue
    const age = Math.min(1, (g - 0.05 - i / 6) * 6 + 0.3)
    const h = full * Math.max(0.15, age)
    const cut = scene.cuts.find(x => x.branch === i)
    if (cut) { c.line(x0, ground, x0, ground - 4, 1.2, bark.mid); c.set(x0, ground - 5, bark.light); continue }
    if (scene.highlight === i) c.line(x0, ground, x0 + lean, ground - full * Math.max(0.15, Math.min(1, (g - 0.05 - i / 6) * 6 + 0.3)), 2.6, HIGHLIGHT)
    const sway = Math.sin(scene.tick * 0.05 + i) * 1.2
    for (let y = 0; y <= h; y++) {
      const x = x0 + (lean + sway) * (y / full)
      const node = y % nodeGap === 0 && y > 0
      c.set(x - 1, ground - y, node ? bark.light : bark.light)
      c.set(x, ground - y, node ? lighten(bark.light, 0.4) : bark.mid)
      c.set(x + 1, ground - y, node ? bark.light : bark.dark)
    }
    const topX = x0 + (lean + sway) * (h / full), topY = ground - h
    tips.push({ x: topX, y: topY })
    if (age > 0.4) for (let k = 0; k < 3 + Math.floor(rng() * 3); k++) {
      const ny = topY + Math.floor(rng() * Math.min(h * 0.5, 14))
      const dir = rng() < 0.5 ? -1 : 1
      const len = 4 + Math.floor(rng() * 4)
      const nx = x0 + (lean + sway) * ((ground - ny) / full)
      for (let s = 0; s <= len; s++) {
        const color = s === len ? leafLight : s % 2 === 0 ? leafMid : leafDark
        c.set(nx + dir * s, ny - Math.round(s * 0.4) + (s === len ? 1 : 0), color)
      }
    }
  }
  return tips
}

/** A viewing stone: one grey rock in the pot, moss creeping over it and the soil as the years pass; snow in winter. */
function drawStone(c: Canvas, scene: Scene, cx: number, ground: number, potW: number, g: number) {
  const rng = rngOf(scene.seed ^ 0x570e)
  const rx = Math.max(6, Math.round(potW * (0.16 + rng() * 0.08))), ry = Math.max(5, Math.round(rx * (0.7 + rng() * 0.4)))
  const ox = Math.round((rng() - 0.5) * potW * 0.2)
  const cy = ground - ry + 1
  const bumps = Array.from({ length: 4 }, () => ({ a: rng() * Math.PI, k: 0.75 + rng() * 0.35 }))
  const rockAt = (x: number, y: number) => {
    const ang = Math.atan2(y / ry, x / rx)
    let r = 1
    for (const b of bumps) r += Math.cos((ang - b.a) * 2) * (b.k - 1) * 0.25
    return (x * x) / (rx * rx) + (y * y) / (ry * ry) <= r
  }
  const grey = [0x5a5a62, 0x74747c, 0x8e8e96] as const
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    if (!rockAt(x, y) || cy + y > ground) continue
    let color: number = grey[1]
    if (x < -rx * 0.3 && y < 0) color = grey[2]
    if (x > rx * 0.35 || y > ry * 0.5) color = grey[0]
    if (((x * 7 + y * 13) % 11) === 0) color = darken(color, 0.85)
    c.set(cx + ox + x, cy + y, color)
  }
  const moss = Math.min(1, g)
  const mossRng = rngOf(scene.seed ^ 0x3055)
  const [mid, dark, light] = [scene.species.leaves[0]!, scene.species.leaves[1]!, scene.species.leaves[2]!]
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    if (!rockAt(x, y) || cy + y > ground) continue
    const onTop = !rockAt(x, y - 1) || y < -ry * 0.4
    const chance = onTop ? moss * 0.9 : moss * 0.25 * (1 + y / ry)
    if (mossRng() < chance) c.set(cx + ox + x, cy + y, mossRng() < 0.3 ? light : mossRng() < 0.6 ? mid : dark)
  }
  const reach = Math.round((potW / 2 - 4) * moss)
  for (let dx = -reach; dx <= reach; dx++) if (mossRng() < 0.6) c.set(cx + dx, ground, mossRng() < 0.4 ? light : mid)
  if (scene.g >= 1 && scene.season.name === 'winter') for (let x = -rx; x <= rx; x++) { const y = -ry; let yy = y; while (yy <= ry && !rockAt(x, yy)) yy++; if (yy <= ry) c.set(cx + ox + x, cy + yy - 1, SNOW) }
  drawSpirits(c, [{ x: cx + ox, y: cy - ry + 2, rx: Math.max(2, Math.round(rx * 0.5)), ry: 1 }], scene)
}

/** A golden barrel cactus: one ribbed ball that fills the pot, spines along the ribs, a ring of flowers on top in season. */
function drawBarrel(c: Canvas, scene: Scene, cx: number, ground: number, potW: number, g: number) {
  if (g < 0.05) return
  const bark = barkOf(scene.species.bark)
  const grow = Math.min(1, 0.15 + g * 0.85)
  const rx = Math.max(3, Math.round((potW / 2 - 4) * grow)), ry = Math.max(3, Math.round(rx * 0.8))
  const cy = ground - ry + 1
  const ribs = Math.max(6, Math.round(rx / 2))
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    if ((x * x) / (rx * rx) + (y * y) / (ry * ry) > 1) continue
    const phase = Math.round(((x / rx) * 0.5 + 0.5) * ribs * 2)
    let color = phase % 2 === 0 ? bark.mid : bark.dark
    if (x < -rx * 0.35 && y < 0) color = phase % 2 === 0 ? bark.light : bark.mid
    if (phase % 2 === 0 && (y + ry) % 3 === 0) color = 0xf0c860
    c.set(cx + x, cy + y, color)
  }
  for (let x = -rx; x <= rx; x++) { const yy = cy - Math.round(Math.sqrt(Math.max(0, 1 - (x * x) / (rx * rx))) * ry); if (c.get(cx + x, yy - 1) === null) c.set(cx + x, yy - 1, 0xf5d98a) }
  const blooming = g >= scene.species.bloomAt && isBlooming(scene) && scene.species.bloom
  if (blooming) {
    const palette = scene.species.bloom!
    const ringR = Math.max(1, Math.round(rx * 0.45))
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const fx = cx + Math.round(Math.cos(a) * ringR), fy = cy - ry + 3 + Math.round(Math.sin(a) * ringR * 0.35)
      c.set(fx, fy, palette[0]!); c.set(fx - 1, fy, palette[2]!); c.set(fx + 1, fy, palette[2]!); c.set(fx, fy - 1, palette[1]!)
    }
  }
  drawSpirits(c, [{ x: cx, y: cy - ry + 2, rx: Math.max(2, ringR2(rx)), ry: 1 }], scene)
}

const ringR2 = (rx: number) => Math.round(rx * 0.5)

/** A cactus flower: a bright cup of petals on an arm's tip. */
function cactusFlowerAt(c: Canvas, tip: Pt, palette: readonly number[]) {
  const x = Math.round(tip.x), y = Math.round(tip.y) - 1
  c.set(x - 1, y, palette[0]!); c.set(x + 1, y, palette[0]!); c.set(x, y - 1, palette[0]!); c.set(x, y, palette[1]!)
  c.set(x - 1, y - 1, palette[2]!); c.set(x + 1, y - 1, palette[2]!)
}

/** Moss on the lower trunk and a hollow: an old tree. */
function drawElderMarks(c: Canvas, rng: Rng, trunk: Pt[]) {
  const a = trunk[0]!, b = trunk[1]!
  for (let i = 0; i < 14; i++) {
    const t = rng() * 0.6
    const x = Math.round(a.x + (b.x - a.x) * t) + Math.round((rng() - 0.5) * 6), y = Math.round(a.y + (b.y - a.y) * t)
    if (c.get(x, y) !== null) c.set(x, y, rng() < 0.4 ? lighten(MOSS, 0.2) : MOSS)
  }
  const hx = Math.round(a.x + (b.x - a.x) * 0.45), hy = Math.round(a.y + (b.y - a.y) * 0.45)
  for (let y = -2; y <= 2; y++) for (let x = -1; x <= 1; x++) if (Math.abs(x) + Math.abs(y) <= 2 && c.get(hx + x, hy + y) !== null) c.set(hx + x, hy + y, 0x1e1410)
}

/** A rope round the trunk with two paper streamers, and a small shrine gate beside the pot. */
function drawShimenawa(c: Canvas, trunk: Pt[], potTop: number) {
  const a = trunk[0]!, b = trunk[1]!
  const y = Math.round(a.y + (b.y - a.y) * 0.3), x = Math.round(a.x + (b.x - a.x) * 0.3)
  for (let dx = -6; dx <= 6; dx++) { if (c.get(x + dx, y) !== null || Math.abs(dx) <= 5) c.set(x + dx, y, dx % 3 === 0 ? darken(ROPE, 0.8) : ROPE) }
  for (const sx of [x - 3, x + 3]) { c.set(sx, y + 1, ROPE); c.set(sx + 1, y + 2, ROPE); c.set(sx, y + 3, ROPE) }
  const gx = Math.floor(c.w / 2) + Math.floor(c.w * 0.34), base = potTop + 6
  const red = 0xc0392b
  for (let dy = 0; dy < 7; dy++) { c.set(gx - 3, base - dy, red); c.set(gx + 3, base - dy, red) }
  for (let dx = -5; dx <= 5; dx++) { c.set(gx + dx, base - 7, red); if (Math.abs(dx) <= 4) c.set(gx + dx, base - 5, red) }
  c.set(gx - 5, base - 8, darken(red, 0.8)); c.set(gx + 5, base - 8, darken(red, 0.8))
}

/** One small figure per spirit, perched on a pad; it stirs for a moment after each answer. */
function drawSpirits(c: Canvas, pads: Pad[], scene: Scene) {
  if (pads.length === 0) return
  const stir = scene.tick - scene.lastAnswerTick < 12 ? ((scene.tick >> 1) & 1) : 0
  scene.spirits.forEach((name, i) => {
    const rng = rngOf(scene.seed ^ (0x59617 + i * 7919))
    const pad = pads[Math.floor(rng() * pads.length)]!
    const x = pad.x + Math.round((rng() - 0.5) * pad.rx), y = pad.y - pad.ry - 2 - stir
    const [body, accent] = spiritColorsOf(name)
    c.set(x, y, body); c.set(x - 1, y + 1, body); c.set(x + 1, y + 1, body); c.set(x, y - 1, accent)
    if (stir) { c.set(x - 2, y, accent); c.set(x + 2, y, accent) }
  })
}

function spiritColorsOf(name: string): [number, number] {
  switch (name) {
    case '蝶': case '硝子の蝶': return [0xffc8e0, 0xffffff]
    case '小鳥': case '鶯': return [0xf0c060, 0xffffff]
    case '鹿': return [0xb07040, 0xffffff]
    case '月の兎': case '白い梟': return [0xffffff, 0xffe066]
    case '鶴': return [0xffffff, 0xd8262c]
    case '狸': return [0x8a6a4a, 0x2a1a10]
    case '蜜蜂': return [0xf5c518, 0x2a1a10]
    case '狐火': return [0xb8ff5a, 0xffffff]
    case '小さな龍': return [0xff6a1a, 0xffe066]
    case '歯車の甲虫': return [0xb08040, 0xffe066]
    case '霞の蛇': return [0xcfc6f0, 0xffffff]
    default: return [0xffffff, 0xffe066]
  }
}

/** A clock face the size of a bloom whose hand points at the tree's hour. */
function clockFaceAt(c: Canvas, x: number, y: number, hour: number, colors: readonly number[]) {
  const [face, hand, rim] = [colors[0]!, colors[1]!, colors[2]!]
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const d = dx * dx + dy * dy
    if (d <= 5) c.set(x + dx, y + dy, d >= 4 ? rim : face)
  }
  const a = ((hour % 12) / 12) * Math.PI * 2 - Math.PI / 2
  c.set(x, y, hand); c.set(x + Math.round(Math.cos(a)), y + Math.round(Math.sin(a)), hand); c.set(x + Math.round(Math.cos(a) * 2), y + Math.round(Math.sin(a) * 2), hand)
}

function drawPads(c: Canvas, pads: Pad[], scene: Scene, rng: Rng) {
  const { species, g } = scene
  const blooming = isBlooming(scene)
  const night = isNight(scene.hour)
  const bloomMix = species.bloom && blooming ? Math.min(1, Math.max(0, (g - species.bloomAt) / 0.3)) : 0
  let [dark, mid, light] = leafShades(scene)
  if (species.magic === 'moonlight' && night) { dark = mix(dark, 0x7fb3ff, 0.5); mid = mix(mid, 0xbfe0ff, 0.6); light = mix(light, 0xffffff, 0.7) }
  if (species.magic === 'forgetful') { const fade = Math.min(0.85, scene.vitals.context); dark = mix(dark, 0x2a2a2a, fade); mid = mix(mid, 0x2a2a2a, fade); light = mix(light, 0x2a2a2a, fade) }
  const outline = darken(dark, 0.55)
  const sorted = [...pads].sort((a, b) => a.y - b.y)
  for (const p of sorted) {
    for (let y = -p.ry - 1; y <= p.ry + 1; y++) for (let x = -p.rx - 1; x <= p.rx + 1; x++) {
      const ragged = species.needles ? (Math.abs(x) % 2 === 1 && y === -p.ry) || (x % 3 === 0 && y === p.ry) : false
      const inside = !ragged && (x * x) / ((p.rx + 0.5) ** 2) + (y * y) / ((p.ry + 0.5) ** 2) <= 1
      const edge = (x * x) / ((p.rx + 1.5) ** 2) + (y * y) / ((p.ry + 1.5) ** 2) <= 1
      if (!inside && edge) { if (c.get(p.x + x, p.y + y) === null && !species.needles) c.set(p.x + x, p.y + y, outline); continue }
      if (!inside) continue
      if (species.magic === 'glass' && (x + y) % 2 !== 0 && Math.abs(y) < p.ry) continue
      let color = y > p.ry * 0.35 ? dark : y < -p.ry * 0.45 && x < p.rx * 0.5 ? light : mid
      if (species.needles && (x + y) % 2 === 0 && y <= 0) color = mix(color, light, 0.4)
      if (bloomMix > 0 && species.bloom && species.bloomStyle === 'dots' && rng() < bloomMix * species.bloomCover) color = species.bloom[Math.floor(rng() * species.bloom.length)]!
      c.set(p.x + x, p.y + y, color)
    }
    if (species.magic === 'clock' && bloomMix > 0 && species.bloom && rng() < 0.5) clockFaceAt(c, p.x + Math.round((rng() - 0.5) * p.rx), p.y - 1, scene.hour, species.bloom)
    if (species.magic === 'moonlight' && night && species.fruit && rng() < 0.5) c.set(p.x + Math.round((rng() - 0.5) * p.rx * 1.6), p.y - p.ry - 1, ((scene.tick >> 2) + Math.floor(rng() * 3)) % 3 ? species.fruit : 0xffffff)
    if (species.magic === 'dragon' && species.fruit && g >= species.fruitAt && blooming) {
      const fx = p.x + Math.round((rng() - 0.5) * p.rx), fy = p.y + Math.round(rng() * p.ry)
      const flick = (scene.tick + Math.floor(rng() * 4)) & 3
      c.set(fx, fy, species.fruit); c.set(fx, fy - 1, flick < 2 ? 0xffe066 : species.fruit); if (flick === 0) c.set(fx + (rng() < 0.5 ? -1 : 1), fy - 2, 0xffe066)
    }
    if (species.weeping && c.w >= 72) hangAt(c, rng, p, [mid, dark, light], 4 + Math.round(p.rx * 0.8), 6 + Math.round(p.rx * 1.2))
    if (bloomMix > 0 && species.bloom && species.bloomStyle === 'hang') hangAt(c, rng, p, species.bloom, Math.round(2 + bloomMix * 4 * species.bloomCover * 3))
    if (species.fruit && !species.twinkle && blooming && g >= species.fruitAt && rng() < 0.55 + Math.min(0.4, scene.vitals.usd * 0.05)) {
      if (species.ornament === 'cone') coneAt(c, p.x + Math.round((rng() - 0.5) * p.rx), p.y + p.ry, species.fruit)
      else fruitAt(c, p.x + Math.round((rng() - 0.5) * p.rx), p.y + Math.round(rng() * p.ry), species.fruit)
    }
  }
}

function hangAt(c: Canvas, rng: Rng, p: Pad, palette: readonly number[], strands: number, maxLen = 8) {
  for (let s = 0; s < strands; s++) {
    const x = p.x + Math.round((rng() - 0.5) * p.rx * 1.8)
    const len = 3 + Math.floor(rng() * (maxLen - 2))
    for (let i = 0; i < len; i++) {
      const color = palette[i === len - 1 ? 2 : i % 2 === 0 ? 0 : 1] ?? palette[0]!
      c.set(x, p.y + p.ry + 1 + i, color)
      if (i > 0 && i < len - 1 && rng() < 0.4) c.set(x + (rng() < 0.5 ? -1 : 1), p.y + p.ry + 1 + i, palette[1] ?? color)
    }
  }
}

function fruitAt(c: Canvas, x: number, y: number, color: number) {
  c.set(x, y, color); c.set(x + 1, y, darken(color, 0.7)); c.set(x, y + 1, darken(color, 0.7)); c.set(x + 1, y + 1, darken(color, 0.55))
  c.set(x, y - 1, 0xfff3d0)
}

function coneAt(c: Canvas, x: number, y: number, color: number) {
  c.set(x, y, lighten(color, 0.2)); c.set(x, y + 1, color); c.set(x - 1, y + 1, darken(color, 0.7)); c.set(x + 1, y + 1, darken(color, 0.7)); c.set(x, y + 2, darken(color, 0.55))
}

function drawOrnaments(c: Canvas, pads: Pad[], tips: Pt[], scene: Scene, potTop: number) {
  const { species } = scene
  const blooming = isBlooming(scene)
  for (const o of scene.ornaments) {
    const rng = rngOf(o.seed)
    const pad = pads.length ? pads[Math.floor(rng() * pads.length)]! : null
    const tip = tips.length ? tips[Math.floor(rng() * tips.length)]! : null
    switch (species.ornament) {
      case 'burst':
        if (pad && species.bloom && blooming) for (let i = 0; i < 7; i++) c.set(pad.x + (rng() - 0.5) * pad.rx * 2.4, pad.y - pad.ry + (rng() - 0.6) * 3, species.bloom[i % species.bloom.length]!)
        break
      case 'fruit':
        if (pad && species.fruit && blooming) fruitAt(c, pad.x + Math.round((rng() - 0.5) * pad.rx), pad.y + Math.round(rng() * pad.ry), species.fruit)
        break
      case 'cone':
        if (tip && species.fruit) coneAt(c, Math.round(tip.x + (rng() - 0.5) * 3), Math.round(tip.y) + 1, species.fruit)
        break
      case 'hang':
        if (pad && species.bloom && blooming) hangAt(c, rng, pad, species.bloom, 2)
        break
      case 'pebble': {
        const x = Math.floor(c.w / 2) + Math.round((rng() - 0.5) * c.w * 0.45)
        const shade = [0x8a8a90, 0x6a6a70, 0xa0a0a8][Math.floor(rng() * 3)]!
        c.set(x, potTop - 2, shade); c.set(x + 1, potTop - 2, darken(shade, 0.8)); if (rng() < 0.5) c.set(x, potTop - 3, lighten(shade, 0.2))
        break
      }
      case 'fallen': {
        const x = Math.floor(c.w / 2) + Math.round((rng() - 0.5) * c.w * 0.5)
        const palette = species.autumn ?? species.leaves
        c.set(x, potTop - 3, palette[Math.floor(rng() * palette.length)]!)
        break
      }
      case 'star':
        if (pad && species.fruit) starAt(c, pad.x + Math.round((rng() - 0.5) * pad.rx * 2), pad.y - Math.round(rng() * pad.ry) - 1, species.fruit, true)
        break
      case 'glow':
        if (pad && species.fruit) glowAt(c, pad.x + Math.round((rng() - 0.5) * pad.rx * 2), pad.y + Math.round((rng() - 0.5) * pad.ry * 2), species.fruit, ((scene.tick >> 3) + Math.floor(rng() * 4)) % 4 !== 0)
        break
    }
  }
}

function starAt(c: Canvas, x: number, y: number, color: number, bright: boolean) {
  c.set(x, y, bright ? 0xfff9d6 : color)
  if (!bright) return
  c.set(x - 1, y, color); c.set(x + 1, y, color); c.set(x, y - 1, color); c.set(x, y + 1, color)
}

function glowAt(c: Canvas, x: number, y: number, color: number, on: boolean) {
  if (!on) return
  c.set(x, y, lighten(color, 0.5)); c.set(x + 1, y, darken(color, 0.8)); c.set(x - 1, y, darken(color, 0.8))
}

/** Small light buds along the trunk, one per subagent answer, oldest lowest. */
function drawSprouts(c: Canvas, rng: Rng, trunk: Pt[], shown: number, count: number) {
  const total = trunk.length - 1
  for (let i = 0; i < Math.min(count, 24); i++) {
    const along = (0.15 + rng() * 0.8) * shown * total
    const seg = Math.min(total - 1, Math.floor(along))
    const t = along - seg
    const a = trunk[seg]!, b = trunk[seg + 1]!
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t
    const side = rng() < 0.5 ? -1 : 1
    const bx = Math.round(x) + side * 3, by = Math.round(y)
    c.set(bx - side, by, 0x6e4b2a)
    c.set(bx, by, SPRING_LEAF); c.set(bx, by - 1, lighten(SPRING_LEAF, 0.3))
  }
}

function snowOn(c: Canvas, rng: Rng, potTop: number) {
  for (let y = 1; y < potTop - 1; y++) for (let x = 0; x < c.w; x++) {
    if (c.get(x, y) !== null && c.get(x, y - 1) === null && rng() < 0.75) c.set(x, y - 1, SNOW)
  }
}

function drawFalling(c: Canvas, scene: Scene, potTop: number) {
  const autumnal = scene.g >= 1 && scene.season.name === 'autumn'
  const palette = autumnal ? (scene.species.autumn ?? scene.species.leaves) : (scene.species.bloom ?? scene.species.leaves)
  const rng = rngOf(scene.seed ^ 0x51ed270b)
  const n = autumnal ? 14 : 5 + Math.round(scene.g * 7)
  for (let i = 0; i < n; i++) {
    const speed = 0.3 + rng() * 0.4
    const x0 = rng() * c.w, phase = rng() * 100
    const y = ((scene.tick * speed + phase) % (potTop + 3)) - 2
    const x = x0 + Math.sin((scene.tick + phase) * 0.1) * 3
    c.set(x, y, palette[i % palette.length]!)
  }
}

function drawTwinkle(c: Canvas, pads: Pad[], scene: Scene) {
  const rng = rngOf(scene.seed ^ 0x3c6ef372)
  const n = 5 + Math.round(scene.g * 8) + Math.min(6, Math.floor(scene.vitals.usd))
  const glow = scene.species.ornament === 'glow'
  for (let i = 0; i < n; i++) {
    const pad = pads[Math.floor(rng() * pads.length)]
    if (!pad) return
    const x = pad.x + Math.round((rng() - 0.5) * pad.rx * 2), y = pad.y - Math.round(rng() * pad.ry) - (glow ? 0 : 1)
    const phase = Math.floor(rng() * 24)
    const on = ((scene.tick + phase) >> 2) % 4
    if (on === 0) continue
    if (glow) glowAt(c, x, y + Math.round((rng() - 0.5) * pad.ry), scene.species.fruit!, true)
    else starAt(c, x, y, scene.species.fruit!, on === 2)
  }
}

function darken(color: number, k: number): number {
  const r = ((color >> 16) & 255) * k, g = ((color >> 8) & 255) * k, b = (color & 255) * k
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
}

function lighten(color: number, k: number): number {
  const f = (v: number) => Math.round(v + (255 - v) * k)
  return (f((color >> 16) & 255) << 16) | (f((color >> 8) & 255) << 8) | f(color & 255)
}

function mix(a: number, b: number, k: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

/** The shelf: every saved tree drawn small in a grid, `perRow` across. */
export function drawShelf(scenes: readonly Scene[], columns: number, rows: number, perRow: number, thumbRows: number): { cells: string; thumbColumns: number; thumbRows: number } {
  const thumbColumns = Math.max(12, Math.floor(columns / perRow))
  const c = new Canvas(columns, rows)
  scenes.forEach((scene, i) => {
    const col = i % perRow, row = Math.floor(i / perRow)
    if ((row + 1) * thumbRows > rows) return
    const mini = new Canvas(thumbColumns - 1, thumbRows)
    paintScene(mini, { ...scene, weather: 'clear' })
    c.paste(mini, col * thumbColumns, row * thumbRows * 2)
  })
  return { cells: c.cells(), thumbColumns, thumbRows }
}
