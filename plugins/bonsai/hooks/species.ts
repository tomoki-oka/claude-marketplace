export type Species = {
  id: string
  name: string
  /** [mid, dark, light] */
  leaves: readonly number[]
  /** Leaf colours while the leaves turn before falling; null keeps the leaves as they are. */
  autumn: readonly number[] | null
  bark: number
  bloom: readonly number[] | null
  bloomAt: number
  /** How much of a pad the bloom covers at full bloom, 0..1. */
  bloomCover: number
  /** Bloom drawn as dots over the pad, or as strands hanging under it. */
  bloomStyle: 'dots' | 'hang'
  fruit: number | null
  fruitAt: number
  ornament: 'burst' | 'fruit' | 'fallen' | 'star' | 'glow' | 'cone' | 'hang' | 'pebble'
  falling: boolean
  twinkle: boolean
  /** Keeps its pads through autumn and winter. */
  evergreen: boolean
  /** Flat, ragged pads (needles) instead of round ones. */
  needles: boolean
  /** A fantasy trait that changes how the tree is drawn or behaves. */
  magic: 'none' | 'moonlight' | 'glass' | 'dragon' | 'clock' | 'forgetful'
  /** Who comes to live in the tree at full bloom. */
  spirit: string
  /** Trunk shape: the usual S-curve, or one straight pole with short tiers of branches. */
  form: 'curved' | 'pole' | 'baobab' | 'cactus' | 'barrel' | 'bamboo' | 'stone'
  /** Long strands of leaves hang from each pad. */
  weeping: boolean
}

const base = {
  autumn: null as readonly number[] | null,
  bark: 0x6e4b2a,
  bloom: null as readonly number[] | null,
  bloomAt: 2, bloomCover: 0, bloomStyle: 'dots' as const,
  fruit: null as number | null, fruitAt: 2,
  falling: false, twinkle: false, evergreen: false, needles: false,
  magic: 'none' as const, spirit: '蝶', form: 'curved' as const, weeping: false,
}

export const SPECIES: readonly Species[] = [
  { ...base, id: 'sakura', name: '桜', leaves: [0x5f9a3f, 0x3d6b2a, 0x8fc25a], autumn: [0xc9782a, 0x8a4a1a, 0xe0a040],
    bloom: [0xffb7c5, 0xff8fab, 0xffd6e0], bloomAt: 0.55, bloomCover: 0.9, ornament: 'burst', falling: true, spirit: '蝶' },
  { ...base, id: 'apple', name: 'りんごの木', leaves: [0x3f8f3f, 0x27602a, 0x6fb85a], autumn: [0xb8862a, 0x7a5218, 0xd8b040],
    bloom: [0xfff0f0], bloomAt: 0.5, bloomCover: 0.2, fruit: 0xd8262c, fruitAt: 0.75, ornament: 'fruit', spirit: '小鳥' },
  { ...base, id: 'maple', name: '紅葉', leaves: [0xe0552b, 0x9a2f1a, 0xf6a42a], autumn: [0x9a2f1a, 0x5a1a10, 0xc0401a],
    ornament: 'fallen', falling: true, spirit: '鹿' },
  { ...base, id: 'hoshi', name: '星降りの木', leaves: [0x1f7a72, 0x124a48, 0x3fb3a3], bark: 0x4a4560,
    fruit: 0xffe066, fruitAt: 0.6, ornament: 'star', twinkle: true, evergreen: true, spirit: '月の兎' },
  { ...base, id: 'matsu', name: '松', leaves: [0x2f6b3a, 0x1c4526, 0x4f9455], bark: 0x5a3a24,
    fruit: 0x6b4423, fruitAt: 0.7, ornament: 'cone', evergreen: true, needles: true, spirit: '鶴' },
  { ...base, id: 'ume', name: '梅', leaves: [0x5a9a4a, 0x36662e, 0x86c06a], autumn: [0xc08a3a, 0x7a5220, 0xe0b050], bark: 0x4f3826,
    bloom: [0xe8506e, 0xffffff, 0xf58aa0], bloomAt: 0.4, bloomCover: 0.7, ornament: 'burst', spirit: '鶯' },
  { ...base, id: 'icho', name: '銀杏', leaves: [0x8fb84a, 0x5f8a2a, 0xb8d86a], autumn: [0xf2c53d, 0xb8901f, 0xffe27a], bark: 0x7a7a70,
    ornament: 'fallen', falling: true, spirit: '狸' },
  { ...base, id: 'fuji', name: '藤', leaves: [0x4f8f3f, 0x2f5f2a, 0x7fbf5a], autumn: [0xb89a3a, 0x7a6420, 0xd8c060],
    bloom: [0x9a7fd6, 0x7a5fc0, 0xc7b6ee], bloomAt: 0.5, bloomCover: 0.35, bloomStyle: 'hang', ornament: 'hang', spirit: '蜜蜂' },
  { ...base, id: 'yanagi', name: '枝垂れ柳', leaves: [0x6fae4a, 0x4a7f30, 0xa4d66a], autumn: [0xd8c040, 0x9a8a20, 0xf0dc70], bark: 0x6a5a3a,
    ornament: 'fallen', falling: true, weeping: true, spirit: '蛙' },
  { ...base, id: 'take', name: '竹', leaves: [0x5fa848, 0x3f7a30, 0x9fd070], bark: 0x7fb85a,
    ornament: 'fallen', evergreen: true, form: 'bamboo', spirit: '雀' },
  { ...base, id: 'ishi', name: '盆石', leaves: [0x5f8a3a, 0x3f5f28, 0x8fb85a], bark: 0x6a6a70,
    ornament: 'pebble', evergreen: true, form: 'stone', spirit: '蝸牛' },
  { ...base, id: 'hotaru', name: '蛍の木', leaves: [0x1e3f2e, 0x102418, 0x2e6a48], bark: 0x2e2a2a,
    fruit: 0xb8ff5a, fruitAt: 0.55, ornament: 'glow', twinkle: true, evergreen: true, spirit: '狐火' },
  { ...base, id: 'metasequoia', name: 'メタセコイア', leaves: [0x4f8a3a, 0x2f5a26, 0x7fb85a], autumn: [0xd8702a, 0x8a4018, 0xf0a050], bark: 0x7a4a2a,
    ornament: 'fallen', falling: true, needles: true, form: 'pole', spirit: '啄木鳥' },
  { ...base, id: 'baobab', name: 'バオバブ', leaves: [0x5f9a4a, 0x3a6a30, 0x8fc46a], bark: 0x8a7868,
    fruit: 0x9a7a4a, fruitAt: 0.7, ornament: 'fruit', form: 'baobab', spirit: '狐猿' },
  { ...base, id: 'cactus', name: 'サボテン', leaves: [0x4f9a5a, 0x2f6a3a, 0x8fd08a], bark: 0x4f9a5a,
    bloom: [0xff6fa8, 0xffe066, 0xffffff], bloomAt: 0.6, bloomCover: 0, ornament: 'burst', evergreen: true, form: 'cactus', spirit: '砂漠の梟' },
  { ...base, id: 'barrel', name: '金鯱', leaves: [0x3f8a4a, 0x2a5f34, 0x7fc07a], bark: 0x3f8a4a,
    bloom: [0xffd23f, 0xfff3a8, 0xe0a020], bloomAt: 0.6, bloomCover: 0, ornament: 'burst', evergreen: true, form: 'barrel', spirit: '砂漠の蜥蜴' },
  { ...base, id: 'gekko', name: '月光樹', leaves: [0xb8bfc9, 0x7d8592, 0xe6ebf2], bark: 0x5c5f6b,
    fruit: 0xcfe6ff, fruitAt: 0.6, ornament: 'star', evergreen: true, magic: 'moonlight', spirit: '白い梟' },
  { ...base, id: 'glass', name: '硝子の木', leaves: [0x8fd3e8, 0x5aa7c4, 0xd8f4fb], bark: 0x9fb8c4,
    bloom: [0xffb3c6, 0xfff1a8, 0xb8ffd0, 0xc9b8ff], bloomAt: 0.7, bloomCover: 0.15, ornament: 'burst', falling: true, magic: 'glass', spirit: '硝子の蝶' },
  { ...base, id: 'ryurin', name: '龍鱗樹', leaves: [0x2f6b4a, 0x1a4030, 0x4d9a6a], bark: 0x5a3a3a,
    fruit: 0xff6a1a, fruitAt: 0.6, ornament: 'fruit', evergreen: true, magic: 'dragon', spirit: '小さな龍' },
  { ...base, id: 'tokei', name: '時計草', leaves: [0x4f8f5f, 0x2f5f3a, 0x8fc48f], bark: 0x6e5a3a,
    bloom: [0xfff6d5, 0x3a2a1a, 0xd8a040], bloomAt: 0.5, bloomCover: 0, ornament: 'burst', magic: 'clock', spirit: '歯車の甲虫' },
  { ...base, id: 'bokyaku', name: '忘却の木', leaves: [0x9a8fc9, 0x5f5690, 0xcfc6f0], bark: 0x4a4560,
    ornament: 'fallen', falling: true, magic: 'forgetful', spirit: '霞の蛇' },
]

export const speciesOf = (id: string) => SPECIES.find(s => s.id === id) ?? null

const isFantasy = (s: Species) => s.magic !== 'none' || s.twinkle

/** The species a session grows: a fantasy tree in about three sessions of a hundred, an ordinary one otherwise. */
export function speciesForSeed(seed: number): Species {
  const rare = Math.floor(seed / 10000) % 100
  if (rare < 1) return speciesOf('metasequoia')!
  if (rare < 2) return speciesOf('baobab')!
  if (rare < 3) return speciesOf('cactus')!
  if (rare < 4) return speciesOf('barrel')!
  if (rare < 5) return speciesOf('take')!
  if (rare < 6) return speciesOf('ishi')!
  const pool = SPECIES.filter(s => s.form === 'curved' && isFantasy(s) === (seed % 100 < 3))
  return pool[Math.floor(seed / 100) % pool.length]!
}

/** A child of two species: leaves and bloom mixed, the rest from the first parent. */
export function crossbreed(a: Species, b: Species, seed: number): Species {
  const pick = (i: number) => ((seed >> i) & 1) === 0
  const mixColor = (x: number, y: number) => {
    const ch = (s: number) => Math.round((((x >> s) & 255) + ((y >> s) & 255)) / 2)
    return (ch(16) << 16) | (ch(8) << 8) | ch(0)
  }
  const leaves = a.leaves.map((c, i) => mixColor(c, b.leaves[i] ?? c))
  const bloom = a.bloom && b.bloom ? a.bloom.map((c, i) => mixColor(c, b.bloom![i] ?? c)) : a.bloom ?? b.bloom
  return {
    ...(pick(0) ? a : b),
    id: `${a.id}+${b.id}`,
    name: `${a.name.slice(0, 1)}${b.name}`,
    leaves,
    autumn: pick(1) ? a.autumn : b.autumn,
    bark: mixColor(a.bark, b.bark),
    bloom,
    bloomAt: Math.min(a.bloomAt, b.bloomAt),
    bloomCover: Math.max(a.bloomCover, b.bloomCover),
    fruit: a.fruit ?? b.fruit,
    fruitAt: Math.min(a.fruitAt, b.fruitAt),
    ornament: pick(2) ? a.ornament : b.ornament,
    falling: a.falling || b.falling,
    twinkle: a.twinkle || b.twinkle,
    evergreen: pick(3) ? a.evergreen : b.evergreen,
    needles: pick(4) ? a.needles : b.needles,
    magic: pick(5) ? a.magic : b.magic,
    spirit: pick(6) ? a.spirit : b.spirit,
    form: pick(7) ? a.form : b.form,
    weeping: a.weeping || b.weeping,
  }
}

/** `<id>.<seed36>`; a crossbreed's id is `a+b`. */
export function seedStringOf(species: Species, seed: number): string {
  return `${species.id}.${seed.toString(36)}`
}

export function parseSeedString(text: string): { species: Species; seed: number } | null {
  const m = /^([a-z]+(?:\+[a-z]+)?)\.([0-9a-z]+)$/.exec(text.trim())
  if (!m) return null
  const seed = parseInt(m[2]!, 36)
  if (!Number.isFinite(seed)) return null
  const [a, b] = m[1]!.split('+')
  const sa = speciesOf(a!)
  if (!sa) return null
  if (!b) return { species: sa, seed }
  const sb = speciesOf(b)
  return sb ? { species: crossbreed(sa, sb, seed), seed } : null
}
