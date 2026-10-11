import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { NowMeta, NowSummary, NowTask, PrState } from '../types'
import {
  DAILY_MAX_CALLS,
  SYSTEM,
  addTask,
  buildPrompt,
  linkify,
  parseSummary,
  replaceTodos,
  syncTaskList,
  today,
  updateTask,
} from './lib'
import { PR_MARK, artifactId, compilePattern, describe, extractLinks, htmlTitle, isPullRequest, parsePrState, remember } from './links'

const PANE = 'session-now'
const TITLE = 'いまの状況'
const tasks = atom({ plugin: 'session-now', key: 'tasks' } as const, [] as NowTask[])
const summary = atom({ plugin: 'session-now', key: 'summary' } as const, null as NowSummary | null)
const meta = atom({ plugin: 'session-now', key: 'meta' } as const, {
  isBusy: false,
  error: '',
  day: '',
  calls: 0,
  tokens: 0,
} as NowMeta)
// null は「今の段階の詳細を開く」。人が選ぶか閉じると文字列になり、今の段階が進むと null に戻す
const selected = atom({ plugin: 'session-now', key: 'selected' } as const, null as string | null)
const links = atom({ plugin: 'session-now', key: 'links' } as const, [] as string[])
const prStates = atom({ plugin: 'session-now', key: 'prStates' } as const, {} as Record<string, PrState>)
// artifact の id から題名。セッションをまたいで使うので store には 1 つのキーで残す
const artifactTitles = atom({ plugin: 'session-now', key: 'artifactTitles' } as const, {} as Record<string, string>)
const TITLES_KEY = 'artifact-titles'

// パネルに出すリンクの件数。古いものは store に残るが出さない
const LINKS_SHOWN = 6

let lastPrompt = ''
// PR 番号のリンク先。セッションの作業ディレクトリが GitHub のリポジトリでなければ空のまま
let repoUrl = ''
let isDraining = false
const queue: { prompt: string; answer: string }[] = []

async function storeKey($: EngineInterface) {
  return `session:${await $.session.id()}`
}

async function linksKey($: EngineInterface) {
  return `links:${await $.session.id()}`
}

async function collectLinks($: EngineInterface, text: string) {
  const found = extractLinks(text)
  if (found.length === 0) return
  const next = await update($, links, list => remember(list, found))
  // --resume で戻ったときに一覧を復元できるよう、セッション単位で残す
  await $.store.set(await linksKey($), next)
}

// マージ済みは戻らないので引き直さない。それ以外の PR は呼ばれるたびに gh で引く
// ponytail: ターンごとに未マージの PR の数だけ gh を呼ぶ。重くなったら間隔を空ける
async function refreshPrStates($: EngineInterface) {
  const known = await read($, prStates)
  const targets = (await read($, links))
    .slice(0, LINKS_SHOWN)
    .filter(href => isPullRequest(href) && known[href] !== 'merged')
  const found = await Promise.all(
    targets.map(async href => {
      const r = await $.process
        .run(['gh', 'pr', 'view', href, '--json', 'state,isDraft'], { timeoutMs: 15_000 })
        .catch(() => null)
      return [href, r?.exitCode === 0 ? parsePrState(r.stdout) : null] as const
    }),
  )
  const fresh = Object.fromEntries(found.filter((f): f is readonly [string, PrState] => f[1] !== null))
  if (Object.keys(fresh).length > 0) await update($, prStates, s => ({ ...s, ...fresh }))
}

// claude.ai の artifact はログインが要り、題名を外から引けない。このセッションで公開したときに覚えておく
// ponytail: 題名は増える一方。溜まって困るようになったら古いものから捨てる
async function noteArtifact($: EngineInterface, args: Record<string, unknown>, result: unknown) {
  if (args.action !== undefined && args.action !== 'publish') return
  if (args.asset === true) return
  const href = extractLinks(JSON.stringify(result ?? '')).find(artifactId)
  const id = href && artifactId(href)
  if (!href || !id) return
  const file = typeof args.file_path === 'string' && args.file_path.endsWith('.html') ? args.file_path : ''
  const fromFile = file ? htmlTitle(await $.fs.read(file).catch(() => '')) : ''
  const title = fromFile || (typeof args.title === 'string' ? args.title.trim() : '')
  await collectLinks($, href)
  if (!title) return
  const next = await update($, artifactTitles, t => ({ ...t, [id]: title }))
  await $.store.set(TITLES_KEY, next)
}

async function summarize($: EngineInterface, prompt: string, answer: string) {
  const day = today(new Date())
  const m = await read($, meta)
  const calls = m.day === day ? m.calls : 0
  const tokens = m.day === day ? m.tokens : 0
  if (calls >= DAILY_MAX_CALLS) {
    await update($, meta, () => ({ isBusy: false, day, calls, tokens, error: `今日の上限 ${DAILY_MAX_CALLS} 回に達したので更新を止めています` }))
    return
  }
  await update($, meta, x => ({ ...x, isBusy: true }))
  const r = await $.model.complete({
    model: 'haiku',
    system: SYSTEM,
    prompt: buildPrompt(await read($, summary), await read($, tasks), prompt, answer),
    maxTokens: 1200,
  })
  const spent = r.usage.input_tokens + r.usage.output_tokens
  const parsed = r.isAnswered ? parseSummary(r.text, Date.now()) : null
  if (parsed) {
    const before = await read($, summary)
    const currentOf = (x: NowSummary | null) => x?.flow.find(f => !f.done)?.text
    if (currentOf(before) !== currentOf(parsed)) await update($, selected, () => null)
    await update($, summary, () => parsed)
    await $.store.set(await storeKey($), parsed)
  }
  const error = parsed ? '' : r.isAnswered ? '要約の形が崩れたので前回のまま' : `要約に失敗（${r.reason}）`
  await update($, meta, () => ({ isBusy: false, error, day, calls: calls + 1, tokens: tokens + spent }))
}

// 要約中に終わったターンはためておき、次の 1 回でまとめて渡す
async function drain($: EngineInterface) {
  if (isDraining) return
  isDraining = true
  try {
    while (queue.length > 0) {
      const batch = queue.splice(0)
      await summarize(
        $,
        batch.map(b => b.prompt).filter(Boolean).join('\n---\n'),
        batch.map(b => b.answer).join('\n---\n'),
      )
    }
  } catch (err) {
    await update($, meta, x => ({ ...x, isBusy: false, error: `要約に失敗（${String(err).slice(0, 80)}）` }))
  } finally {
    isDraining = false
  }
}

// 前回の要約を捨て、直近の会話から作り直す
async function rebuild($: EngineInterface) {
  const recent = (await $.session.messages()).filter(m => m.text.trim()).slice(-12)
  await update($, summary, () => null)
  queue.push({
    prompt: recent.filter(m => m.role === 'user').map(m => m.text).join('\n---\n'),
    answer: recent.filter(m => m.role === 'assistant').map(m => m.text).join('\n---\n'),
  })
  await drain($)
}

async function loadRepoUrl($: EngineInterface) {
  const r = await $.process.run(['gh', 'repo', 'view', '--json', 'url', '-q', '.url']).catch(() => null)
  if (r?.exitCode !== 0) return
  repoUrl = r.stdout.trim()
  await $.ui.invalidate('ui.render')
}

// 人が /explain-change と打ったのと同じ扱い。作業中に押したら、手が空いてから走る
async function explain($: EngineInterface) {
  try {
    await $.command.run({ command: 'explain-change' })
  } catch (err) {
    await update($, meta, x => ({ ...x, error: `explain-change を起動できません（${String(err).slice(0, 80)}）` }))
  }
}

export const register: Register = (on, options) => {
  const jiraUrl = typeof options.jiraUrl === 'string' ? options.jiraUrl : ''
  const previewPattern = compilePattern(typeof options.previewHostPattern === 'string' ? options.previewHostPattern : '')
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'session-now', description: 'このセッションの状況パネルを開く' })
    const saved = await $.store.get(await storeKey($))
    if (saved && typeof saved === 'object') await update($, summary, s => s ?? (saved as NowSummary))
    const savedLinks = await $.store.get(await linksKey($))
    if (Array.isArray(savedLinks)) await update($, links, list => (list.length > 0 ? list : savedLinks))
    const savedTitles = await $.store.get(TITLES_KEY)
    if (savedTitles && typeof savedTitles === 'object') {
      await update($, artifactTitles, t => ({ ...(savedTitles as Record<string, string>), ...t }))
    }
    void refreshPrStates($)
    void $.ui.open({ id: PANE, title: TITLE })
    void loadRepoUrl($)
    return next(e)
  })

  on('command.run', { command: 'session-now' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: '状況パネルを開きました。' }
  })

  on('prompt.submit', async ($, e, next) => {
    lastPrompt = e.text
    await collectLinks($, e.text)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId && e.reason === 'answer') {
      queue.push({ prompt: lastPrompt, answer: e.answer })
      lastPrompt = ''
      void drain($)
      await collectLinks($, e.answer)
      void refreshPrStates($)
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    if (e.tool === 'TaskCreate') {
      const t = (ran.result as { task?: { id: string; subject: string } }).task
      if (t) await update($, tasks, list => addTask(list, t.id, t.subject, e.description))
    } else if (e.tool === 'TaskUpdate') {
      await update($, tasks, list =>
        updateTask(list, e.taskId, { subject: e.subject, description: e.description, status: e.status }),
      )
    } else if (e.tool === 'TaskGet') {
      const t = (ran.result as { task?: { id: string; description: string } | null }).task
      if (t) await update($, tasks, list => updateTask(list, t.id, { description: t.description }))
    } else if (e.tool === 'TodoWrite') {
      await update($, tasks, list => replaceTodos(list, e.todos))
    } else if (e.tool === 'TaskList') {
      const all = (ran.result as { tasks?: NowTask[] }).tasks
      if (all) await update($, tasks, list => syncTaskList(list, all))
    } else if ((e.tool as string) === 'Artifact') {
      await noteArtifact($, e as unknown as Record<string, unknown>, ran.result)
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    // ボタンの文言の中にはリンクを置けないので、流れとタスクの名前はそのまま出す
    const rich = (text: string) =>
      linkify(text, repoUrl, jiraUrl).map(seg => (seg.href ? <Link href={seg.href} label={seg.text} /> : seg.text))
    const s = await read($, summary)
    const list = await read($, tasks)
    const m = await read($, meta)
    const agents = (await $.agent.list()).filter(a => a.status === 'running' || a.status === 'pending')
    const shownLinks = (await read($, links)).slice(0, LINKS_SHOWN)
    const states = await read($, prStates)
    const titles = await read($, artifactTitles)
    const current = s ? s.flow.findIndex(step => !step.done) : -1
    const done = list.filter(t => t.status === 'completed').length
    // 流れと判断待ちは要約し直すと順番が変わるので、文面で選択を覚える
    const chosen = await read($, selected)
    const pickedId = chosen ?? (s && current >= 0 ? `flow:${s.flow[current]?.text}` : '')
    const step = s?.flow.find(f => `flow:${f.text}` === pickedId)
    const task = list.find(t => t.id === pickedId)
    const decision = s?.decisions.find(d => `decision:${d.text}` === pickedId)
    const picked = step
      ? {
          title: step.text,
          meta: step.done ? '済み' : step === s?.flow[current] ? '今ここ' : 'この先',
          body: step.detail || '詳細なし',
        }
      : decision
        ? { title: decision.text, meta: '判断待ち', body: decision.detail || '詳細なし' }
        : task
        ? {
            title: task.subject,
            meta: `${task.status === 'completed' ? '完了' : task.status === 'in_progress' ? '進行中' : '未着手'}${task.id.startsWith('todo:') ? '' : ` · #${task.id}`}`,
            body: task.description || '説明なし',
          }
        : undefined
    const rows = e.props.scroll.bodyRows

    // 外枠をパネルの高さに固定し、ボタン行を常に最下段に置く。溢れた内容は下から切る
    return (
      <Box flexDirection="column" height={rows}>
        <Box flexDirection="column" gap={1} flexGrow={1} overflow="hidden">
          {s ? (
            <Box flexDirection="column">
              <Text>
                <Text bold>目的 </Text>
                {s.purpose ? rich(s.purpose) : '—'}
              </Text>
              <Text>
                <Text bold>ゴール </Text>
                {s.goal ? rich(s.goal) : '—'}
              </Text>
            </Box>
          ) : (
            <Text dimColor>ターンが 1 回終わると、ここに目的と流れが出ます。</Text>
          )}

          {s && s.flow.length > 0 && (
            <Box flexDirection="column">
              <Text bold>流れ</Text>
              {s.flow.map((f, i) => (
                <Box>
                  <Text dimColor={f.done} color={i === current ? 'cyan' : undefined}>
                    {f.done ? ' ✓ ' : i === current ? ' ▸ ' : ' · '}
                  </Text>
                  <Button
                    plain
                    key={`flow:${i}`}
                    label={pickedId === `flow:${f.text}` ? `${f.text} ◂` : f.text}
                    dimColor={f.done ? true : undefined}
                    onPress={() => update($, selected, () => (pickedId === `flow:${f.text}` ? '' : `flow:${f.text}`))}
                  />
                </Box>
              ))}
            </Box>
          )}

          {s && s.decisions.length > 0 && (
            <Box flexDirection="column">
              <Text bold color="yellow">
                判断待ち
              </Text>
              {s.decisions.map((d, i) => (
                <Box>
                  <Text color="yellow"> ? </Text>
                  <Button
                    plain
                    key={`decision:${i}`}
                    label={pickedId === `decision:${d.text}` ? `${d.text} ◂` : d.text}
                    onPress={() =>
                      update($, selected, () => (pickedId === `decision:${d.text}` ? '' : `decision:${d.text}`))
                    }
                  />
                </Box>
              ))}
            </Box>
          )}

          {s?.next && (
            <Text>
              <Text bold>次 </Text>
              {rich(s.next)}
            </Text>
          )}

          {shownLinks.length > 0 && (
            <Box flexDirection="column">
              <Text bold>リンク</Text>
              {shownLinks.map(href => {
                const service = describe(href, previewPattern)
                const prMark = states[href] && PR_MARK[states[href]]
                const mark = prMark ?? service.mark
                return (
                  <Text>
                    {mark ? (
                      <Text color={mark.color}>
                        {` ${mark.glyph} `}
                      </Text>
                    ) : (
                      ' · '
                    )}
                    <Link href={href} label={titles[artifactId(href) ?? ''] ?? service.label} />
                  </Text>
                )
              })}
            </Box>
          )}

          {list.length > 0 && (
            <Box flexDirection="column">
              <Text bold>
                タスク {done}/{list.length}
              </Text>
              {list.map(t => (
                <Box>
                  <Text dimColor={t.status === 'completed'} color={t.status === 'in_progress' ? 'cyan' : undefined}>
                    {t.status === 'completed' ? ' ✓ ' : t.status === 'in_progress' ? ' ● ' : ' ○ '}
                  </Text>
                  <Button
                    plain
                    key={`task:${t.id}`}
                    label={t.id === pickedId ? `${t.subject} ◂` : t.subject}
                    dimColor={t.status === 'completed' ? true : undefined}
                    onPress={() => update($, selected, () => (pickedId === t.id ? '' : t.id))}
                  />
                </Box>
              ))}
            </Box>
          )}

          {agents.length > 0 && (
            <Box flexDirection="column">
              <Text bold>動いている subagent</Text>
              {agents.map(a => (
                <Text>
                  {' ⟳ '}
                  {a.description} <Text dimColor>({a.type})</Text>
                </Text>
              ))}
            </Box>
          )}
        </Box>

        {picked && (
          <Box flexDirection="column" height={Math.floor(rows / 2)} flexShrink={0} borderStyle="round" overflow="hidden">
            <Text bold>{rich(picked.title)}</Text>
            <Text dimColor>{picked.meta}</Text>
            <Box flexGrow={1} overflow="hidden">
              <Text wrap="wrap">{rich(picked.body)}</Text>
            </Box>
            <Button label="閉じる" onPress={() => update($, selected, () => '')} />
          </Box>
        )}

        <Box flexDirection="column" flexShrink={0}>
          {m.error !== '' && <Text color="red">{m.error}</Text>}
          <Text dimColor>
            {m.isBusy ? '更新中…' : s ? `更新 ${new Date(s.at).toTimeString().slice(0, 5)}` : '未更新'}
            {` · 今日 ${m.calls} 回 / ${(m.tokens / 1000).toFixed(1)}k tokens`}
          </Text>
          <Box gap={2}>
            <Button label="直近の会話から作り直す" onPress={() => rebuild($)} />
            <Button label="変更の図解を HTML で開く" onPress={() => explain($)} />
          </Box>
        </Box>
      </Box>
    )
  })
}
