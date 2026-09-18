import { Canvas } from './canvas'

/** One badge: a 7x7 pixel emblem drawn from a string map; `.` is empty, other letters index the palette. */
export type BadgeArt = { rows: readonly string[]; palette: Record<string, number> }

const G = { p: 0xff8fab, w: 0xffffff, g: 0x4f9a3f, d: 0x2f6a2a, b: 0x6e4b2a, r: 0xc0392b, y: 0xffd75a, s: 0xb8c0c8, k: 0x2a2a2a, o: 0xe07020, c: 0x8fd3e8, v: 0x9a7fd6, e: 0x4f9a5a }

export const BADGE_ART: Record<string, BadgeArt> = {
  hatsuhana: { palette: G, rows: ['..p.p..', '.ppwpp.', 'p.wyw.p', '.ppwpp.', '..p.p..', '...g...', '..gg...'] },
  jusshu: { palette: G, rows: ['.g...g.', 'ggg.ggg', '.b...b.', '...g...', '..ggg..', '...b...', '.bbbbb.'] },
  shinboku: { palette: G, rows: ['rrrrrrr', '.r...r.', 'rrrrrrr', '.r...r.', '.r...r.', '.r...r.', '.r...r.'] },
  sentei: { palette: G, rows: ['s.....s', '.s...s.', '..s.s..', '...s...', '..k.k..', '.k...k.', '..k.k..'] },
  seirei: { palette: G, rows: ['...y...', '..www..', '.wwwww.', '..w.w..', '...w...', '..w.w..', '.w...w.'] },
  kouhai: { palette: G, rows: ['.pp.vv.', 'pppvvvv', 'pppvvvv', '.pp.vv.', '...b...', '...b...', '..bbb..'] },
  tane: { palette: G, rows: ['...g...', '..ggg..', '.bbbbb.', 'bbbybbb', '.bbbbb.', '..bbb..', '...b...'] },
  chinshu: { palette: G, rows: ['...e...', '.e.e.e.', '.eeeee.', '...e...', '...e...', '..bbb..', '.bbbbb.'] },
  shiki: { palette: G, rows: ['ppp.ooo', 'ppp.ooo', 'ppp.ooo', '.......', 'ggg.www', 'ggg.www', 'ggg.www'] },
  juujikan: { palette: G, rows: ['.yyyyy.', 'y..w..y', 'y..w..y', 'y..ww.y', 'y.....y', 'y.....y', '.yyyyy.'] },
  hyakujikan: { palette: G, rows: ['yyyyyyy', '.ywwwy.', '..ywy..', '...y...', '..y.y..', '.y.w.y.', 'yyyyyyy'] },
}

const LOCKED = 0x55585e

/** Draws every badge in a grid, `perRow` across, each in a `cell` x `cell/2` cell block; locked ones grey. */
export function drawBadges(ids: readonly string[], unlocked: ReadonlySet<string>, columns: number, perRow: number, cellColumns: number, cellRows: number): string {
  const rows = Math.ceil(ids.length / perRow) * cellRows
  const c = new Canvas(columns, rows)
  ids.forEach((id, i) => {
    const art = BADGE_ART[id]
    if (!art) return
    const col = i % perRow, row = Math.floor(i / perRow)
    const ox = col * cellColumns + Math.floor((cellColumns - 9) / 2), oy = row * cellRows * 2 + Math.floor((cellRows * 2 - 9) / 2)
    const on = unlocked.has(id)
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
      const inside = y >= 0 && y < 7 && x >= 0 && x < 7
      const ch = inside ? art.rows[y]![x]! : '.'
      if (inside && ch !== '.') { c.set(ox + x, oy + y, on ? art.palette[ch]! : LOCKED); continue }
      if (!on && !inside && (x === -1 || x === 7 || y === -1 || y === 7)) c.set(ox + x, oy + y, 0x3a3d42)
      if (on && !inside && (x === -1 || x === 7 || y === -1 || y === 7) && ((x + y) & 1) === 0) c.set(ox + x, oy + y, 0xffd75a)
    }
  })
  return c.cells()
}

/** A seed icon in the species' colours: a husk in the bark colour, a sprout in the leaf colour, a dot of bloom or fruit. */
export function drawSeeds(seeds: readonly { leaf: number; bark: number; accent: number | null }[], columns: number, perRow: number, cellColumns: number, cellRows: number): string {
  const rows = Math.ceil(Math.max(1, seeds.length) / perRow) * cellRows
  const c = new Canvas(columns, rows)
  const shape = ['...gg..', '..g....', '.bbbbb.', 'bbbbbbb', 'bbbabbb', '.bbbbb.', '..bbb..']
  seeds.forEach((s, i) => {
    const col = i % perRow, row = Math.floor(i / perRow)
    const ox = col * cellColumns + Math.floor((cellColumns - 7) / 2), oy = row * cellRows * 2 + Math.floor((cellRows * 2 - 7) / 2)
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const ch = shape[y]![x]!
      if (ch === '.') continue
      const color = ch === 'g' ? s.leaf : ch === 'a' ? (s.accent ?? lighten(s.bark)) : x < 2 ? lighten(s.bark) : x > 4 ? darken(s.bark) : s.bark
      c.set(ox + x, oy + y, color)
    }
  })
  return c.cells()
}

const lighten = (color: number) => { const f = (v: number) => Math.round(v + (255 - v) * 0.3); return (f((color >> 16) & 255) << 16) | (f((color >> 8) & 255) << 8) | f(color & 255) }
const darken = (color: number) => { const f = (v: number) => Math.round(v * 0.7); return (f((color >> 16) & 255) << 16) | (f((color >> 8) & 255) << 8) | f(color & 255) }
