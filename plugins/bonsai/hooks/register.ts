import type { EngineInterface, On, Timer } from 'claude-code'

import { drawBadges, drawSeeds } from './badges'
import { hash } from './rng'
import { crossbreed, parseSeedString, seedStringOf, SPECIES, type Species, speciesForSeed, speciesOf } from './species'
import { branchCountOf, type Cut, drawShelf, type Scene, type Weather, drawScene, isElder, isSacred, type Ornament, type Season, stageOf, type Vitals, wiltOf } from './tree'

const PANE_ID = 'bonsai'
const SHELF_ID = 'bonsai-shelf'
const SHELF_PER_ROW = 3
const INFO_ID = 'bonsai-info'
const BAG_ID = 'bonsai-bag'
const RASTER_KEY = 'tree'
const TICK_MS = 250
const SAVE_EVERY_TICKS = 40
const DEFAULT_FULL_MINUTES = 480
const STORE_MINUTES = 'fullMinutes'
const STORE_CLOCK = 'clock'
const STORE_BAG = 'seedbag'
const STORE_STATS = 'stats'
const SUN_DECAY_PER_MS = 1 / (60 * 60_000)
const SUN_FLOOR = 0.3
const BUTTON_WATER_EVERY_MS = 60 * 60_000
const WATER_MS = 5 * 60_000
const SHELF_LIMIT = 12

const HELP = [
  '/bonsai                  盆栽を出す・片付ける（最初に打った時点から育ち始める）',
  '/bonsai speed <分>       満開までの分数（既定 480、全セッション共通）',
  '/bonsai reset            このセッションの盆栽を鉢に戻す（樹形と樹種はそのまま）',
  '/bonsai species          樹種の一覧',
  '/bonsai species <id>     植え替える（このセッションだけ）',
  '/bonsai prune [番号]     枝を 1 本切る（番号を省くと乱数）。しばらくすると切り口から 2 本生える。Pane の ◁ ▷ で選んで 切る でも',
  '/bonsai seed             この木の種を文字列で出す',
  '/bonsai plant <種> [種]  袋の種から植え直す。2 つ渡すと交配した新種になる',
  '/bonsai clock real       木の一日を実時刻に合わせる（既定。19 時から 5 時が夜）',
  '/bonsai debug <分>       検証用。開いていた累積時間を分で置き換える',
  '/bonsai clock fast [分]  指定した分で一日が巡る（省略時 20 分）。開いている時間で回る',
  '/bonsai name <名>        この鉢に名札を付ける（省くとリポジトリ名）',
  '/bonsai bag              種袋の Pane を出す・片付ける。見頃を 1 巡するごとに種が 1 つ収穫される',
  '/bonsai bag add <種>     もらった種を袋に入れる',
  '/bonsai badges           実績の Pane を出す・片付ける',
  '/bonsai shelf            盆栽棚を出す・片付ける。育てた木を小さく並べる',
  '/bonsai help             この説明',
  '',
  '盆栽はセッション単位。最初の /bonsai から、開いている時間だけ育つ。resume で続きから。',
  '満開のあとは季節が巡る。答えが返るたびに飾りが 1 つ増える。',
  'git commit が通ると水やり（5 分ぶん伸びる）。rm -rf や force push は葉を 1 房落とす。',
  'サブエージェントが答えると幹に芽が 1 つ付く。',
  '日照は開いている間ゆっくり下がり、答えが返ると 15%、commit で 50% 戻る。低いと葉がくすむ。',
  '見頃に答えが返ると、まれに樹種ごとの精霊が来て住みつく。見頃を 3 巡すると古木、累積 24 時間で神木。',
  'ごくまれに、まっすぐ一本のメタセコイア、太い幹のバオバブ、腕のあるサボテン、丸い金鯱、稈が増える竹、苔が広がる盆石になる（各 1%）。',
].join('\n')

/** What one session's bonsai remembers across resumes, under `session:<id>` in the plugin's store. */
type Saved = {
  started: boolean
  elapsedMs: number
  bonusMs: number
  ornaments: number[]
  /** The seed string the tree was planted from (`/bonsai plant`), or null for the session's own. */
  planted: string | null
  cuts: Cut[]
  wounds: number
  sprouts: number
  spirits: string[]
  name: string | null
  /** The species id and growth ratio at the last save, for the shelf without loading the tree. */
  shelf: { species: string; g: number; updatedMs: number }
  sun: number
  yearsSeen: number
}

type BagSeed = { seed: string; name: string }
type Stats = { prunes: number; spirits: number; crosses: number; harvests: number; bloomed: string[]; sacred: number; years: number; rareBloomed: boolean; badges: string[]; totalMs: number }
const EMPTY_STATS: Stats = { prunes: 0, spirits: 0, crosses: 0, harvests: 0, bloomed: [], sacred: 0, years: 0, rareBloomed: false, badges: [], totalMs: 0 }

const BADGES: readonly { id: string; name: string; test: (s: Stats) => boolean }[] = [
  { id: 'hatsuhana', name: '初花', test: s => s.bloomed.length >= 1 },
  { id: 'jusshu', name: '十樹種', test: s => s.bloomed.length >= 10 },
  { id: 'shinboku', name: '神木', test: s => s.sacred >= 1 },
  { id: 'sentei', name: '剪定二十', test: s => s.prunes >= 20 },
  { id: 'seirei', name: '精霊五', test: s => s.spirits >= 5 },
  { id: 'kouhai', name: '交配', test: s => s.crosses >= 1 },
  { id: 'tane', name: '種十', test: s => s.harvests >= 10 },
  { id: 'chinshu', name: '珍種', test: s => s.rareBloomed },
  { id: 'shiki', name: '四季', test: s => s.years >= 1 },
  { id: 'juujikan', name: '十時間', test: s => s.totalMs >= 10 * 60 * 60_000 },
  { id: 'hyakujikan', name: '百時間', test: s => s.totalMs >= 100 * 60 * 60_000 },
]

const hoursMinutesOf = (ms: number) => `${Math.floor(ms / 3_600_000)} 時間 ${Math.floor((ms % 3_600_000) / 60_000)} 分`

type ClockMode = { mode: 'real' } | { mode: 'fast'; dayMinutes: number }

const isSaved = (v: unknown): v is Saved =>
  typeof v === 'object' && v !== null && typeof (v as Saved).elapsedMs === 'number' && Array.isArray((v as Saved).ornaments)

export function register(on: On) {
  let sessionSeed = 0
  let seed = 0
  let storeKey = ''
  let species: Species = SPECIES[0]!
  let planted: string | null = null
  let started = false
  let elapsedMs = 0
  let bonusMs = 0
  let cuts: Cut[] = []
  let wounds = 0
  let sprouts = 0
  let spirits: string[] = []
  let name: string | null = null
  let repoName = ''
  let lastSaveMs = 0
  let sun = 1
  let yearsSeen = 0
  let stats: Stats = { ...EMPTY_STATS, bloomed: [], badges: [] }
  let lastButtonWaterMs = 0
  let lastTickMs = 0
  let pick: number | null = null
  let weatherOverride: Weather | undefined
  let lastAnswerTick = -1000
  let clock: ClockMode = { mode: 'real' }
  let lastStage = ''
  let wiltToasted = false
  let fullMinutes = DEFAULT_FULL_MINUTES
  let tick = 0
  let isOpen = false
  let isShelfOpen = false
  let isInfoOpen = false
  let isBagOpen = false
  let isLoaded = false
  let size = { columns: 0, rows: 0 }
  let ticker: Timer | null = null
  let vitals: Vitals = { context: 0, usd: 0, turns: 0 }
  let ornaments: Ornament[] = []

  // Only time the session is open counts: a closed session's tree waits where it was.
  const grown = () => elapsedMs + bonusMs
  const growth = () => Math.min(1, grown() / (fullMinutes * 60_000))

  // Past full growth the year turns: each phase lasts a quarter of the time it took to grow.
  const seasonOf = (): Season => {
    const full = fullMinutes * 60_000
    const past = grown() - full
    if (past < 0) return { name: 'peak', t: 0 }
    const phase = full / 4
    const names = ['peak', 'autumn', 'winter', 'spring'] as const
    const i = Math.floor(past / phase) % 4
    return { name: names[i]!, t: (past % phase) / phase }
  }

  const hourOf = (nowMs: number) => {
    if (clock.mode === 'real') { const d = new Date(nowMs); return d.getHours() + d.getMinutes() / 60 }
    return ((grown() / (clock.dayMinutes * 60_000)) % 1) * 24
  }

  const yearsOf = () => Math.max(0, Math.floor((grown() - fullMinutes * 60_000) / (fullMinutes * 60_000)))

  const daySeedOf = (nowMs: number) => {
    if (clock.mode === 'real') { const d = new Date(nowMs); return hash(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) }
    return hash(`day-${Math.floor(grown() / (clock.dayMinutes * 60_000))}`)
  }

  const sceneOf = (nowMs: number) => ({ seed, species, g: growth(), grownMs: grown(), cuts, wounds, sprouts, hour: hourOf(nowMs), daySeed: daySeedOf(nowMs), years: yearsOf(), elapsedMs, spirits, lastAnswerTick, season: seasonOf(), tick, ornaments, vitals, sun, highlight: pick ?? undefined, weather: weatherOverride })
  const openBranches = () => {
    const count = branchCountOf(sceneOf(0), size.columns || 80, size.rows || 40)
    return Array.from({ length: count }, (_, i) => i).filter(i => !cuts.some(c => c.branch === i))
  }

  const snapshot = (): Saved => ({ started, elapsedMs, bonusMs, ornaments: ornaments.map(o => o.seed), planted, cuts, wounds, sprouts, spirits, name, shelf: { species: species.id, g: growth(), updatedMs: lastSaveMs }, sun, yearsSeen })

  /** Sets species and shape from a planted seed string, or from the session when none. */
  const applyPlanted = () => {
    const parsed = planted ? parseSeedString(planted) : null
    if (parsed) { species = parsed.species; seed = parsed.seed }
    else { species = speciesForSeed(sessionSeed); seed = sessionSeed }
  }

  on('session.start', async ($, e, next) => {
    const id = await $.session.id()
    sessionSeed = hash(id)
    storeKey = `session:${id}`
    const minutes = await $.store.get(STORE_MINUTES)
    if (typeof minutes === 'number' && minutes > 0) fullMinutes = minutes
    const saved = await $.store.get(storeKey)
    if (isSaved(saved)) {
      started = saved.started === true
      elapsedMs = saved.elapsedMs
      bonusMs = saved.bonusMs
      ornaments = saved.ornaments.map(s => ({ seed: s }))
      planted = typeof saved.planted === 'string' ? saved.planted : null
      cuts = Array.isArray(saved.cuts) ? saved.cuts : []
      wounds = saved.wounds ?? 0
      sprouts = saved.sprouts ?? 0
      spirits = Array.isArray(saved.spirits) ? saved.spirits : []
      name = typeof saved.name === 'string' ? saved.name : null
      sun = typeof saved.sun === 'number' ? saved.sun : 1
      yearsSeen = saved.yearsSeen ?? 0
    }
    applyPlanted()
    isLoaded = true
    repoName = (await $.session.repo())?.root.split('/').filter(Boolean).pop() ?? ''
    const storedClock = await $.store.get(STORE_CLOCK)
    const storedStats = await $.store.get(STORE_STATS)
    if (isStats(storedStats)) stats = { ...EMPTY_STATS, ...storedStats }
    if (isClock(storedClock)) clock = storedClock
    await $.command.register({ name: 'bonsai', description: '盆栽の鉢を出し入れする', argumentHint: 'help | speed <分> | prune | seed | plant <種>' })

    ticker ??= $.clock.every(TICK_MS, async () => {
      tick++
      if (started) { elapsedMs += TICK_MS; stats.totalMs = (stats.totalMs ?? 0) + TICK_MS; sun = Math.max(SUN_FLOOR, sun - TICK_MS * SUN_DECAY_PER_MS) }
      if (started && tick % 8 === 0) {
        const words = await harvestAndBadges($, stats, {
          years: yearsOf(), yearsSeen, g: growth(), speciesId: species.id, speciesName: species.name, rare: species.form !== 'curved',
          sacred: isSacred(sceneOf(0)), seed: seedStringOf(species, seed), label: name ?? repoName,
        })
        if (words.harvested) { yearsSeen = yearsOf(); void saveState($, storeKey, snapshot()) }
        for (const w of words.toasts) toast($, w)
      }
      if (tick % SAVE_EVERY_TICKS === 0) { vitals = (await vitalsOf($)) ?? vitals; lastSaveMs = await $.clock.now(); void saveState($, storeKey, snapshot()) }
      if (started && tick % 8 === 0) for (const word of noticesOf()) toast($, word)
      if (!isLoaded || !isOpen || size.columns < 8 || size.rows < 6) return
      if (tick % 16 === 0) $.ui.invalidate('ui.render')
      void $.ui.blit({ requestId: PANE_ID, key: RASTER_KEY, cells: drawScene(sceneOf(await $.clock.now()), size.columns, size.rows), ...size })
    })
    return next(e)
  })

  // A word once at each milestone: full bloom, a season's turn, the first yellow leaf.
  const noticesOf = (): string[] => {
    const words: string[] = []
    const scene = sceneOf(0)
    const stage = stageOf(scene.g, scene.season)
    if (lastStage && stage !== lastStage) {
      const word = stage === '見頃' ? `${species.name}が見頃になった` : stage === '葉落ち' ? '葉が散り始めた' : stage === '冬木' ? '冬木になった。雪が積もる' : stage === '芽吹き' ? '芽吹いてきた' : null
      if (word) words.push(word)
    }
    lastStage = stage
    const wilting = wiltOf(vitals) > 0
    if (wilting && !wiltToasted) words.push('盆栽の葉が黄ばんできた。休憩どき')
    wiltToasted = wilting
    return words
  }

  // Water from a commit that went through; a rough command costs a pad of leaves.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    if (!started) return result
    const command = String(e.command ?? '')
    if (/\bgit\s+commit\b/.test(command) && !('deny' in result) && !result.isError) {
      bonusMs += WATER_MS
      sun = Math.min(1, sun + 0.5)
      toast($, `${species.name}に水をやった`)
      await saveState($, storeKey, snapshot())
    } else if (/\brm\s+-rf?\b|\bpush\b.*(--force|\s-f\b)/.test(command)) {
      wounds++
      toast($, '荒い手つきで葉が 1 房落ちた')
      await saveState($, storeKey, snapshot())
    }
    return result
  })

  // One more ornament arrives each time Claude answers on the main conversation; a subagent's answer buds on the trunk.
  on('turn.complete', async ($, e, next) => {
    if (started && e.agentId && e.reason === 'answer') {
      sprouts++
      await saveState($, storeKey, snapshot())
    }
    if (started && !e.agentId && e.reason === 'answer') {
      lastAnswerTick = tick
      sun = Math.min(1, sun + 0.15)
      const scene = sceneOf(0)
      const room = isElder(scene) ? 2 : 1
      if (scene.g >= 1 && spirits.length < room && hash(e.turnId) % 33 === 0) {
        spirits = [...spirits, species.spirit]
        toast($, `${species.spirit}が${species.name}に住みついた`)
        stats = { ...stats, spirits: stats.spirits + 1 }
        await $.store.set(STORE_STATS, stats)
      }
      ornaments.push({ seed: hash(e.answer + e.turnId) })
      bonusMs += Math.min(20_000, e.answer.length * 100)
      vitals = (await vitalsOf($)) ?? vitals
      await saveState($, storeKey, snapshot())
    }
    return next(e)
  })

  // The forgetful tree sheds everything when the conversation is compacted, and starts again from a bud.
  on('session.compact', async ($, e, next) => {
    if (started && !e.agentId && species.magic === 'forgetful') {
      elapsedMs = Math.round(fullMinutes * 60_000 * 0.1); bonusMs = 0; ornaments = []; spirits = []
      toast($, '忘却の木の葉が全部散った。芽からやり直し')
      await saveState($, storeKey, snapshot())
    }
    return next(e)
  })

  on('ui.close', { id: PANE_ID }, ($, e, next) => {
    isOpen = false
    return next(e)
  })

  on('ui.close', { id: SHELF_ID }, ($, e, next) => {
    isShelfOpen = false
    return next(e)
  })

  on('ui.close', { id: INFO_ID }, ($, e, next) => {
    isInfoOpen = false
    return next(e)
  })

  on('ui.close', { id: BAG_ID }, ($, e, next) => {
    isBagOpen = false
    return next(e)
  })

  // The seed bag: one icon per seed in its species' colours, name and seed string under each.
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== BAG_ID || e.surface !== 'terminal') return next(e)
    const { Box, Text, Raster, Button } = await $.ui.resolve(e)
    const bag = await bagOf($)
    const columns = Math.max(12, e.props.bodyColumns - 2)
    const perRow = Math.max(2, Math.min(4, Math.floor(columns / 14)))
    const cellColumns = Math.floor(columns / perRow), cellRows = 5
    const seeds = bag.map(x => {
      const sp = parseSeedString(x.seed)?.species
      return { leaf: sp?.leaves[0] ?? 0x5f9a3f, bark: sp?.bark ?? 0x6e4b2a, accent: sp?.bloom?.[0] ?? sp?.fruit ?? null }
    })
    const rows: ReturnType<typeof Text>[] = []
    for (let r = 0; r < Math.ceil(bag.length / perRow); r++) {
      const slice = bag.slice(r * perRow, (r + 1) * perRow)
      rows.push(Raster({ key: `seeds-${r}`, columns, rows: cellRows, cells: drawSeeds(seeds.slice(r * perRow, (r + 1) * perRow), columns, perRow, cellColumns, cellRows) }))
      rows.push(Text({ wrap: 'truncate', children: slice.map(x => fitWidth(x.name, cellColumns)).join('') }))
      rows.push(Text({ dimColor: true, wrap: 'truncate', children: slice.map(x => fitWidth(x.seed, cellColumns)).join('') }))
    }
    return Box({
      flexDirection: 'column', paddingLeft: 1,
      children: [
        Text({ children: `種袋 ${bag.length}` }),
        ...(bag.length ? rows : [Text({ dimColor: true, children: '空。見頃を 1 巡すると種が入る。もらった種は /bonsai bag add <種>' })]),
        Text({ dimColor: true, children: '/bonsai plant <種> [種] で植える' }),
        Button({ key: 'back', label: '戻る', onPress: () => { void $.ui.close({ id: BAG_ID }); isBagOpen = false } }),
      ],
    })
  })

  // The bag and the badges, as text in a small pane of their own.
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== INFO_ID || e.surface !== 'terminal') return next(e)
    const { Box, Text, Raster, Button } = await $.ui.resolve(e)
    const bag = await bagOf($)
    const columns = Math.max(12, e.props.bodyColumns - 2)
    const perRow = Math.max(2, Math.min(4, Math.floor(columns / 12)))
    const cellColumns = Math.floor(columns / perRow), cellRows = 6
    const ids = BADGES.map(b => b.id)
    const unlocked = new Set(stats.badges)
    const badgeRows = Math.ceil(ids.length / perRow)
    const rowsOut: ReturnType<typeof Text>[] = []
    for (let r = 0; r < badgeRows; r++) {
      const slice = BADGES.slice(r * perRow, (r + 1) * perRow)
      rowsOut.push(Raster({ key: `badges-${r}`, columns, rows: cellRows, cells: drawBadges(slice.map(b => b.id), unlocked, columns, perRow, cellColumns, cellRows) }))
      rowsOut.push(Text({ dimColor: true, wrap: 'truncate', children: slice.map(b => fitWidth(unlocked.has(b.id) ? b.name : `（${b.name}）`, cellColumns)).join('') }))
    }
    void bag
    return Box({
      flexDirection: 'column', paddingLeft: 1,
      children: [
        Text({ children: `実績 ${unlocked.size}/${BADGES.length} · 総育成時間 ${hoursMinutesOf(stats.totalMs ?? 0)}` }),
        ...rowsOut,
        Button({ key: 'back', label: '戻る', onPress: () => { void $.ui.close({ id: INFO_ID }); isInfoOpen = false } }),
      ],
    })
  })

  on('command.run', { command: 'bonsai' }, async ($, e) => {
    const [verb, ...args] = e.args.trim().split(/\s+/).filter(Boolean)
    const redraw = () => $.ui.invalidate('ui.render')
    switch (verb) {
      case undefined: {
        if (isOpen) {
          await $.ui.close({ id: PANE_ID }); isOpen = false
          return { text: '盆栽を片付けた' }
        }
        await $.ui.open({ id: PANE_ID, title: '盆栽' }); isOpen = true
        if (!started) {
          started = true
          await saveState($, storeKey, snapshot())
          return { text: `${species.name}を植えた。ここから育ち始める` }
        }
        return { text: `${species.name}を出した` }
      }
      case 'speed': {
        const minutes = Number(args[0])
        if (!(minutes > 0)) return { text: '使い方: /bonsai speed <満開までの分数>' }
        fullMinutes = minutes
        await $.store.set(STORE_MINUTES, minutes)
        redraw()
        return { text: `満開まで ${minutes} 分に設定した` }
      }
      case 'clock': {
        if (args[0] === 'real') clock = { mode: 'real' }
        else if (args[0] === 'fast') clock = { mode: 'fast', dayMinutes: Number(args[1]) > 0 ? Number(args[1]) : 20 }
        else return { text: `今の時計: ${clock.mode === 'real' ? '実時刻' : `${clock.dayMinutes} 分で一日`}\n使い方: /bonsai clock real | fast [分]` }
        await $.store.set(STORE_CLOCK, clock); redraw()
        return { text: clock.mode === 'real' ? '実時刻に合わせた' : `${clock.dayMinutes} 分で一日が巡るようにした` }
      }
      case 'debug': {
        const minutes = Number(args[0])
        if (!(minutes >= 0)) return { text: '使い方: /bonsai debug <累積分>' }
        elapsedMs = minutes * 60_000; bonusMs = 0; started = true
        if (args[1] === 'spirit') spirits = [...spirits, species.spirit]
        if (args[1] === 'snow' || args[1] === 'rain' || args[1] === 'meteors' || args[1] === 'clear') weatherOverride = args[1]
        lastAnswerTick = tick
        await saveState($, storeKey, snapshot()); redraw()
        return { text: `累積を ${minutes} 分にした${args[1] === 'spirit' ? `。${species.spirit}を呼んだ` : ''}` }
      }
      case 'name': {
        name = args.join(' ') || null
        await saveState($, storeKey, snapshot()); redraw()
        return { text: name ? `名札を「${name}」にした` : '名札を外した' }
      }
      case 'shelf': {
        if (isShelfOpen) { await $.ui.close({ id: SHELF_ID }); isShelfOpen = false; return { text: '棚を片付けた' } }
        const rows = await shelfRows($, storeKey)
        if (rows.length === 0) return { text: '棚にはまだ何もない' }
        await $.ui.open({ id: SHELF_ID, title: '盆栽棚' }); isShelfOpen = true
        return { text: `棚に ${rows.length} 鉢` }
      }
      case 'reset': {
        elapsedMs = 0; bonusMs = 0; ornaments = []; cuts = []; wounds = 0; sprouts = 0; spirits = []
        await saveState($, storeKey, snapshot()); redraw()
        return { text: '鉢に戻した' }
      }
      case 'species': {
        const next = args[0] ? speciesOf(args[0]) : null
        if (!next) return { text: `樹種: ${SPECIES.map(s => `${s.id}(${s.name})`).join(' / ')}` }
        planted = seedStringOf(next, seed); applyPlanted()
        await saveState($, storeKey, snapshot()); redraw()
        return { text: `${next.name} に植え替えた` }
      }
      case 'prune': {
        const count = branchCountOf(sceneOf(0), size.columns || 80, size.rows || 40)
        const open = Array.from({ length: count }, (_, i) => i).filter(i => !cuts.some(c => c.branch === i))
        if (open.length === 0) return { text: count === 0 ? 'まだ切れる枝がない' : 'もう切れる枝がない。育つのを待つ' }
        if (args[0] === 'pick') { const n = Number(args[1]); if (!open.includes(n)) return { text: `切れる枝の番号: ${open.join(' ')}` }; pick = n; redraw(); return { text: `${n} 番の枝を選んだ。切る で確定` } }
        const wanted = args[0] !== undefined ? Number(args[0]) : NaN
        if (args[0] !== undefined && !open.includes(wanted)) return { text: `切れる枝の番号: ${open.join(' ')}` }
        const branch = Number.isInteger(wanted) ? wanted : open[hash(`${storeKey}:${cuts.length}`) % open.length]!
        pick = null
        cuts = [...cuts, { branch, atMs: grown() }]
        stats = { ...stats, prunes: stats.prunes + 1 }; await $.store.set(STORE_STATS, stats)
        await saveState($, storeKey, snapshot()); redraw()
        return { text: `枝を 1 本切った（${cuts.length} 本目）。しばらくすると切り口から芽が出る` }
      }
      case 'seed':
        return { text: `種: ${seedStringOf(species, seed)}\n/bonsai plant ${seedStringOf(species, seed)} で同じ木が植えられる` }
      case 'bag': {
        const bag = await bagOf($)
        if (args[0] === 'add') {
          const parsed = args[1] ? parseSeedString(args[1]) : null
          if (!parsed) return { text: '使い方: /bonsai bag add <種>' }
          if (bag.some(x => x.seed === args[1])) return { text: 'その種はもう袋にある' }
          await $.store.set(STORE_BAG, [...bag, { seed: args[1]!, name: parsed.species.name }])
          return { text: `${parsed.species.name}の種を袋に入れた` }
        }
        if (isBagOpen) { await $.ui.close({ id: BAG_ID }); isBagOpen = false; return { text: '種袋を片付けた' } }
        await $.ui.open({ id: BAG_ID, title: '種袋' }); isBagOpen = true; redraw()
        return { text: `種袋 ${bag.length}` }
      }
      case 'badges': {
        if (isInfoOpen) { await $.ui.close({ id: INFO_ID }); isInfoOpen = false; return { text: '実績を片付けた' } }
        await $.ui.open({ id: INFO_ID, title: '実績' }); isInfoOpen = true; redraw()
        return { text: `実績 ${stats.badges.length}/${BADGES.length} · 総育成時間 ${hoursMinutesOf(stats.totalMs ?? 0)}` }
      }
      case 'plant': {
        const bag = await bagOf($)
        const a = args[0] ? parseSeedString(args[0]) : null
        if (!a) return { text: '使い方: /bonsai plant <種> [種]。種は /bonsai bag にあるものだけ' }
        const b = args[1] ? parseSeedString(args[1]) : null
        if (args[1] && !b) return { text: `2 つ目の種が読めない: ${args[1]}` }
        const missing = [args[0]!, ...(args[1] ? [args[1]] : [])].filter(x => !bag.some(y => y.seed === x))
        if (missing.length) return { text: `袋に無い種: ${missing.join(' ')}。/bonsai bag add <種> で入れられる` }
        if (b) { stats = { ...stats, crosses: stats.crosses + 1 }; await $.store.set(STORE_STATS, stats) }
        const child = b ? crossbreed(a.species, b.species, a.seed ^ b.seed) : a.species
        const shape = b ? (a.seed ^ b.seed) >>> 0 : a.seed
        planted = seedStringOf(child, shape); applyPlanted()
        elapsedMs = 0; bonusMs = 0; ornaments = []; cuts = []; wounds = 0; sprouts = 0; spirits = []; started = true
        await saveState($, storeKey, snapshot()); redraw()
        return { text: b ? `${a.species.name}と${b.species.name}を交配して ${species.name} を植えた` : `${species.name}を植え直した` }
      }
      default:
        return { text: HELP }
    }
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== SHELF_ID || e.surface !== 'terminal') return next(e)
    const { Box, Text, Raster, Button } = await $.ui.resolve(e)
    const entries = await shelfEntries($, storeKey, clock)
    const columns = Math.max(1, e.props.bodyColumns - 2)
    const perRow = Math.max(1, Math.min(SHELF_PER_ROW, entries.length))
    const thumbColumns = Math.max(12, Math.floor(columns / perRow))
    const thumbRows = Math.max(6, Math.round(thumbColumns * 0.62))
    const rowsOfThumbs = Math.max(1, Math.min(Math.ceil(entries.length / perRow), Math.floor((e.props.scroll.bodyRows - 1) / (thumbRows + 1))))
    const shown = entries.slice(0, rowsOfThumbs * perRow)
    const drawn = drawShelf(shown.map(x => x.scene), columns, rowsOfThumbs * thumbRows, perRow, thumbRows)
    const labels = Array.from({ length: rowsOfThumbs }, (_, r) =>
      shown.slice(r * perRow, (r + 1) * perRow).map(x => fitWidth(x.label, drawn.thumbColumns)).join(''))
    return Box({
      flexDirection: 'column', paddingLeft: 1,
      children: [
        Raster({ key: 'shelf', columns, rows: rowsOfThumbs * thumbRows, cells: drawn.cells }),
        ...labels.map(l => Text({ dimColor: true, wrap: 'truncate', children: l })),
        Text({ dimColor: true, wrap: 'truncate', children: `${entries.length} 鉢 · ＊は今の鉢` }),
        Button({ key: 'back', label: '戻る', onPress: () => { void $.ui.close({ id: SHELF_ID }); isShelfOpen = false } }),
      ],
    })
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE_ID || e.surface !== 'terminal') return next(e)
    const { Box, Text, Raster, Button } = await $.ui.resolve(e)
    if (!isLoaded) return Box({ children: [Text({ dimColor: true, children: '…' })] })
    size = { columns: Math.max(1, e.props.bodyColumns - 2), rows: Math.max(1, e.props.scroll.bodyRows - 2) }
    const scene = sceneOf(await $.clock.now())
    const elapsedMin = Math.floor(elapsedMs / 60_000)
    const rest = wiltOf(vitals) > 0 ? ' · 葉が黄ばんできた。休憩どき' : ''
    const label = name ?? repoName
    const status = `${label ? `${label} · ` : ''}${species.name} · 日照${Math.round(sun * 100)}% · ${stageOf(scene.g, scene.season)} ${Math.round(scene.g * 100)}% · ${elapsedMin}分 · 満開まで${fullMinutes}分 · 飾り${ornaments.length}${cuts.length ? ` · 剪定${cuts.length}` : ''}${sprouts ? ` · 芽${sprouts}` : ''}${spirits.length ? ` · ${spirits.join('と')}` : ''}${isSacred(scene) ? ' · 神木' : isElder(scene) ? ' · 古木' : ''}${clock.mode === 'fast' ? ` · ${Math.floor(scene.hour)}時` : ''}${rest}`
    return Box({
      flexDirection: 'column', paddingLeft: 1,
      children: [
        Raster({ key: RASTER_KEY, columns: size.columns, rows: size.rows, cells: drawScene(scene, size.columns, size.rows) }),
        Text({ dimColor: true, wrap: 'truncate', children: status }),
        Box({
          flexDirection: 'row', gap: 1,
          children: [
            Button({ key: 'prev', label: '◁', onPress: () => {
              const open = openBranches()
              if (open.length === 0) { $.ui.toast('切れる枝がない'); return }
              const i = pick === null ? open.length - 1 : (open.indexOf(pick) - 1 + open.length) % open.length
              pick = open[i]!; $.ui.invalidate('ui.render')
            } }),
            Button({ key: 'next', label: '▷', onPress: () => {
              const open = openBranches()
              if (open.length === 0) { $.ui.toast('切れる枝がない'); return }
              const i = pick === null ? 0 : (open.indexOf(pick) + 1) % open.length
              pick = open[i]!; $.ui.invalidate('ui.render')
            } }),
            Button({ key: 'cut', label: '切る', onPress: () => {
              const open = openBranches()
              if (open.length === 0) { $.ui.toast('切れる枝がない'); return }
              if (pick === null || !open.includes(pick)) { $.ui.toast('◁ ▷ で切る枝を選ぶ'); return }
              const branch = pick
              pick = null
              cuts = [...cuts, { branch, atMs: grown() }]
              stats = { ...stats, prunes: stats.prunes + 1 }
              void $.store.set(STORE_STATS, stats)
              void $.store.set(storeKey, snapshot())
              $.ui.toast(`枝を 1 本切った（${cuts.length} 本目）`)
              $.ui.invalidate('ui.render')
            } }),
            Button({ key: 'water', label: '水をやる', onPress: () => {
              void $.clock.now().then(now => {
                if (now - lastButtonWaterMs < BUTTON_WATER_EVERY_MS) { $.ui.toast('水はもう十分。1 時間おきに'); return }
                lastButtonWaterMs = now
                bonusMs += WATER_MS; sun = Math.min(1, sun + 0.3)
                void $.store.set(storeKey, snapshot())
                $.ui.toast(`${species.name}に水をやった`)
                $.ui.invalidate('ui.render')
              })
            } }),
            Button({ key: 'shelf', label: '棚', onPress: () => {
              if (isShelfOpen) { void $.ui.close({ id: SHELF_ID }); isShelfOpen = false; return }
              void $.ui.open({ id: SHELF_ID, title: '盆栽棚' }).then(() => { isShelfOpen = true })
            } }),
            Button({ key: 'bag', label: '種袋', onPress: () => {
              if (isBagOpen) { void $.ui.close({ id: BAG_ID }); isBagOpen = false; return }
              void $.ui.open({ id: BAG_ID, title: '種袋' }).then(() => { isBagOpen = true; $.ui.invalidate('ui.render') })
            } }),
            Button({ key: 'info', label: '実績', onPress: () => {
              if (isInfoOpen) { void $.ui.close({ id: INFO_ID }); isInfoOpen = false; return }
              void $.ui.open({ id: INFO_ID, title: '実績' }).then(() => { isInfoOpen = true; $.ui.invalidate('ui.render') })
            } }),
          ],
        }),
      ],
    })
  })
}

const isStats = (v: unknown): v is Stats => typeof v === 'object' && v !== null && Array.isArray((v as Stats).bloomed) && Array.isArray((v as Stats).badges)

async function bagOf($: EngineInterface): Promise<BagSeed[]> {
  const v = await $.store.get(STORE_BAG)
  return Array.isArray(v) ? (v as BagSeed[]).filter(x => typeof x?.seed === 'string') : []
}

/** Once per pass: a seed into the bag when a year turns, the bloom list and badges kept up, new badges named. */
async function harvestAndBadges($: EngineInterface, stats: Stats, now: { years: number; yearsSeen: number; g: number; speciesId: string; speciesName: string; rare: boolean; sacred: boolean; seed: string; label: string }): Promise<{ harvested: boolean; toasts: string[] }> {
  const toasts: string[] = []
  let harvested = false
  let changed = false
  if (now.g >= 1 && !stats.bloomed.includes(now.speciesId)) { stats.bloomed = [...stats.bloomed, now.speciesId]; changed = true }
  if (now.g >= 1 && now.rare && !stats.rareBloomed) { stats.rareBloomed = true; changed = true }
  if (now.sacred && stats.sacred < 1) { stats.sacred = 1; changed = true }
  if (now.years > now.yearsSeen) {
    const bag = await bagOf($)
    if (!bag.some(x => x.seed === now.seed)) {
      await $.store.set(STORE_BAG, [...bag, { seed: now.seed, name: `${now.label ? `${now.label} ` : ''}${now.speciesName}` }])
      toasts.push(`${now.speciesName}の種を収穫した（袋 ${bag.length + 1}）`)
    }
    stats.harvests += 1; stats.years = Math.max(stats.years, now.years); changed = true; harvested = true
  }
  for (const b of BADGES) if (!stats.badges.includes(b.id) && b.test(stats)) { stats.badges = [...stats.badges, b.id]; toasts.push(`実績「${b.name}」`); changed = true }
  if (changed) await $.store.set(STORE_STATS, stats)
  return { harvested, toasts }
}

const isClock = (v: unknown): v is ClockMode =>
  typeof v === 'object' && v !== null && ((v as ClockMode).mode === 'real' || ((v as ClockMode).mode === 'fast' && typeof (v as { dayMinutes: unknown }).dayMinutes === 'number'))

function toast($: EngineInterface, text: string): void {
  $.ui.toast(text)
}

/** Cuts and pads `text` to `width` terminal cells, counting East Asian wide characters as two. */
function fitWidth(text: string, width: number): string {
  let out = '', used = 0
  for (const ch of text) {
    const w = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/.test(ch) ? 2 : 1
    if (used + w > width - 1) break
    out += ch; used += w
  }
  return out + ' '.repeat(Math.max(0, width - used))
}

/** Every saved tree as a small scene for the shelf, newest first, with a one-line label. */
async function shelfEntries($: EngineInterface, ownKey: string, clock: ClockMode): Promise<{ scene: Scene; label: string; updatedMs: number }[]> {
  const keys = (await $.store.keys()).filter(k => k.startsWith('session:'))
  const out: { scene: Scene; label: string; updatedMs: number }[] = []
  const now = await $.clock.now()
  const hour = 12
  void now
  for (const key of keys) {
    const v = await $.store.get(key)
    if (!isSaved(v) || !v.started) continue
    const id = key.slice('session:'.length)
    const planted = v.planted ? parseSeedString(v.planted) : null
    const species = planted?.species ?? speciesForSeed(hash(id))
    const seed = planted?.seed ?? hash(id)
    const g = v.shelf?.g ?? 0
    const scene: Scene = {
      seed, species, g, grownMs: v.elapsedMs + v.bonusMs, cuts: v.cuts ?? [], wounds: v.wounds ?? 0, sprouts: v.sprouts ?? 0,
      hour, daySeed: 0, years: 0, elapsedMs: v.elapsedMs, spirits: v.spirits ?? [], lastAnswerTick: -1000,
      season: { name: 'peak', t: 0 }, tick: 0, ornaments: v.ornaments.map(s => ({ seed: s })), vitals: { context: 0, usd: 0, turns: 0 }, sun: v.sun ?? 1,
    }
    const mark = key === ownKey ? '＊' : ''
    out.push({ scene, label: `${mark}${v.name ? `${v.name} ` : ''}${species.name} ${Math.round(g * 100)}%`, updatedMs: v.shelf?.updatedMs ?? 0 })
  }
  return out.sort((a, b) => b.updatedMs - a.updatedMs).slice(0, SHELF_LIMIT)
}

/** Every saved tree but this one, newest first, one line each. */
async function shelfRows($: EngineInterface, ownKey: string): Promise<string[]> {
  const keys = (await $.store.keys()).filter(k => k.startsWith('session:'))
  const rows: { line: string; updatedMs: number }[] = []
  for (const key of keys) {
    const v = await $.store.get(key)
    if (!isSaved(v) || !v.started) continue
    const id = key.slice('session:'.length)
    const sp = v.planted ? parseSeedString(v.planted)?.species : speciesForSeed(hash(id))
    const speciesName = sp?.name ?? v.shelf?.species ?? '?'
    const g = v.shelf?.g ?? 0
    const label = v.name ? `${v.name} · ` : ''
    const mark = key === ownKey ? '＊' : '　'
    rows.push({ line: `${mark}${label}${speciesName} ${Math.round(g * 100)}% · 飾り${v.ornaments.length}${v.spirits?.length ? ` · ${v.spirits.join('と')}` : ''} · claude --resume ${id}`, updatedMs: v.shelf?.updatedMs ?? 0 })
  }
  return rows.sort((a, b) => b.updatedMs - a.updatedMs).slice(0, SHELF_LIMIT).map(r => r.line)
}

function saveState($: EngineInterface, key: string, state: Saved): Promise<void> {
  return $.store.set(key, state)
}

async function vitalsOf($: EngineInterface): Promise<Vitals | null> {
  try {
    const usage = await $.session.usage()
    const percent = usage.context.percent ?? (usage.context.tokens ? (usage.context.tokens / usage.context.window) * 100 : 0)
    return { context: Math.min(1, percent / 100), usd: usage.cost?.usd ?? 0, turns: await $.session.turns() }
  } catch {
    // ponytail: usage may be refused by a policy above; the tree just stays as it was.
    return null
  }
}
