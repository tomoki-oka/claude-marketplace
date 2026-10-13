import { expect, test } from 'claude-code/testing'
import type { SessionMessage } from 'claude-code'

import { addTask, buildPrompt, decisionSections, eli5Topic, extractJiraLinks, labelWidth, linkify, parseSummary, replaceTodos, stepSections, syncTaskList, taskSections, turnLog, updateTask } from '../hooks/lib'

const noStep = { did: [], why: '', now: '', left: '' }
const noDecision = { ask: '', options: [], recommend: '' }

test('前置きやコードフェンスが付いた返答からも JSON を読み、欠けた項目は空にする', async () => {
  const detail = { did: ['a を直す', ''], why: '理由', now: '途中', left: '' }
  const ask = { ask: '選ぶ', options: [{ name: 'A', result: 'a になる' }, { name: '', result: 'x' }], recommend: 'A' }
  const text = `了解です。\n\`\`\`json\n${JSON.stringify({
    purpose: 'P',
    flow: [{ text: 'a', done: true, detail }, { text: '' }, 'x'],
    decisions: ['決める', 3, { text: '選ぶ', detail: ask }],
  })}\n\`\`\``
  expect(parseSummary(text, 1)).toEqual({
    purpose: 'P',
    goal: '',
    flow: [{ text: 'a', done: true, detail: { did: ['a を直す'], why: '理由', now: '途中', left: '' } }],
    decisions: [
      { text: '決める', detail: noDecision },
      { text: '選ぶ', detail: { ask: '選ぶ', options: [{ name: 'A', result: 'a になる' }], recommend: 'A' } },
    ],
    next: '',
    at: 1,
  })
})

test('以前の形（detail が文字列）は空の detail として読む', async () => {
  const text = '{"flow":[{"text":"a","done":false,"detail":"長い文"}],"decisions":[{"text":"d","detail":"長い文"}]}'
  const s = parseSummary(text, 1)
  expect(s?.flow[0]?.detail).toEqual(noStep)
  expect(s?.decisions[0]?.detail).toEqual(noDecision)
})

test('型の崩れた欄（数値・null）は空にする', async () => {
  const text = JSON.stringify({
    flow: [{ text: 'a', detail: { did: 5, why: null, now: 3, left: [] } }, { text: 'b', detail: { did: [1, null, 'x'] } }],
    decisions: [{ text: 'd', detail: { ask: 1, options: [null, 'z', { name: 2, result: 'r' }, { name: 'n', result: 9 }], recommend: null } }],
  })
  const s = parseSummary(text, 1)
  expect(s?.flow.map(f => f.detail)).toEqual([noStep, { ...noStep, did: ['x'] }])
  expect(s?.decisions[0]?.detail).toEqual({ ask: '', options: [{ name: 'n', result: '' }], recommend: '' })
})

test('詳細欄の欄は空のものを入れず、やったこと・理由・今・残りの順に並べる', async () => {
  expect(stepSections({ did: ['a', 'b'], why: '', now: '済み', left: '確認' })).toEqual([
    { label: 'やったこと', lines: ['a', 'b'], isList: true },
    { label: '今', lines: ['済み'], isList: false },
    { label: '残り', lines: ['確認'], isList: false },
  ])
  expect(stepSections(noStep)).toEqual([])
})

test('判断待ちの欄は選択肢を「名前: 結果」の行にし、決めること・選択肢・推奨の順に並べる', async () => {
  expect(decisionSections({ ask: '決める', options: [{ name: 'A', result: 'a になる' }, { name: 'B', result: '' }], recommend: 'A' })).toEqual([
    { label: '決めること', lines: ['決める'], isList: false },
    { label: '選択肢', lines: ['A: a になる', 'B'], isList: true },
    { label: '推奨', lines: ['A'], isList: false },
  ])
  expect(decisionSections(noDecision)).toEqual([])
})

test('横並びの見出しの幅は、一番長い見出しを全角 2 桁で数えて余白 2 を足す', async () => {
  const sections = decisionSections({ ask: '決める', options: [{ name: 'A', result: '' }], recommend: 'A' })
  expect(labelWidth(sections)).toBe(12)
  expect(labelWidth(stepSections({ did: ['a'], why: '', now: 'x', left: '' }))).toBe(4)
  expect(labelWidth(taskSections('説明'))).toBe(2)
})

test('タスクは見出し無しで説明 1 行、無ければ「説明なし」', async () => {
  expect(taskSections('説明')).toEqual([{ label: '', lines: ['説明'], isList: false }])
  expect(taskSections('')[0]?.lines).toEqual(['説明なし'])
})

test('JSON として読めない返答は null を返し、前回の要約を残させる', async () => {
  expect(parseSummary('要約できませんでした', 1)).toBe(null)
  expect(parseSummary('{"purpose": }', 1)).toBe(null)
})

test('TaskUpdate の deleted は一覧から消し、それ以外は状態と件名を差し替える', async () => {
  const list = addTask(addTask([], '1', 'A'), '2', 'B')
  expect(updateTask(list, '1', { status: 'in_progress' })).toEqual([
    { id: '1', subject: 'A', description: '', status: 'in_progress' },
    { id: '2', subject: 'B', description: '', status: 'pending' },
  ])
  expect(updateTask(list, '2', { status: 'deleted' })).toEqual([{ id: '1', subject: 'A', description: '', status: 'pending' }])
})

test('TodoWrite は自分の分だけ差し替え、TaskCreate のタスクは残す', async () => {
  const list = replaceTodos(addTask([], '1', 'A'), [{ content: 'old', status: 'pending' }])
  expect(replaceTodos(list, [{ content: 'new', status: 'completed' }])).toEqual([
    { id: '1', subject: 'A', description: '', status: 'pending' },
    { id: 'todo:0', subject: 'new', description: '', status: 'completed' },
  ])
})

test('長い回答は冒頭と結論を残して真ん中を落とす', async () => {
  const answer = `冒頭${'あ'.repeat(10000)}結論`
  const prompt = buildPrompt(null, [], '', '', answer)
  expect(prompt.includes('冒頭')).toBe(true)
  expect(prompt.includes('結論')).toBe(true)
  expect(prompt.includes('（中略）')).toBe(true)
  expect(prompt.length < 4600).toBe(true)
})

test('TaskList で差し替えても、TaskCreate で受け取った説明は残る', async () => {
  const list = addTask([], '1', 'A', '説明A')
  expect(syncTaskList(list, [{ id: '1', subject: 'A2', status: 'in_progress' }, { id: '2', subject: 'B', status: 'pending' }])).toEqual([
    { id: '1', subject: 'A2', description: '説明A', status: 'in_progress' },
    { id: '2', subject: 'B', description: '', status: 'pending' },
  ])
})

test('PR 番号と Jira のキーだけをリンクにする', async () => {
  expect(linkify('#7871 と ABC-1113の件。UTF-8 は対象外', 'https://github.com/o/r', 'https://example.atlassian.net')).toEqual([
    { text: '#7871', href: 'https://github.com/o/r/pull/7871' },
    { text: ' と ' },
    { text: 'ABC-1113', href: 'https://example.atlassian.net/browse/ABC-1113' },
    { text: 'の件。UTF-8 は対象外' },
  ])
})

test('リポジトリが分からなければ PR 番号はリンクにしない', async () => {
  expect(linkify('#12 を直す', '')).toEqual([{ text: '#12 を直す' }])
})

test('jiraUrl が空なら Jira のキーはリンクにしない', async () => {
  expect(linkify('ABC-1 を直す', 'https://github.com/o/r')).toEqual([{ text: 'ABC-1 を直す' }])
})

test('jiraUrl の末尾にスラッシュがあっても、リンクにスラッシュが二重に入らない', async () => {
  expect(linkify('ABC-1', '', 'https://example.atlassian.net/')).toEqual([
    { text: 'ABC-1', href: 'https://example.atlassian.net/browse/ABC-1' },
  ])
})

test('jiraUrl があれば本文の Jira キーを課題の URL にし、空なら拾わない', async () => {
  expect(extractJiraLinks('ABC-123 を直す', 'https://jira.example.com/')).toEqual(['https://jira.example.com/browse/ABC-123'])
  expect(extractJiraLinks('ABC-123 を直す', '')).toEqual([])
})

test('UTF-8 のような規格名と PR 番号は Jira のキーとして拾わない', async () => {
  expect(extractJiraLinks('UTF-8 と #12 と ISO-9001', 'https://jira.example.com')).toEqual([])
})

test('直前が英数字・_・ハイフンのものは Jira のキーとして拾わない', async () => {
  expect(extractJiraLinks('F-DS-09 と x-ABC-1 と fooABC-1 と _ABC-1', 'https://jira.example.com')).toEqual([])
})

test('番号の先頭が 0 のものは拾わず、ABC-10 は拾う', async () => {
  expect(extractJiraLinks('ABC-09', 'https://jira.example.com')).toEqual([])
  expect(extractJiraLinks('ABC-10', 'https://jira.example.com')).toEqual(['https://jira.example.com/browse/ABC-10'])
})

test('jiraProjects があればそのプロジェクトのキーだけを拾い、空ならすべて拾う', async () => {
  const url = 'https://jira.example.com'
  expect(extractJiraLinks('ABC-1 と DS-10', url, 'ABC')).toEqual([`${url}/browse/ABC-1`])
  expect(extractJiraLinks('ABC-1 と DS-10', url, '')).toEqual([`${url}/browse/ABC-1`, `${url}/browse/DS-10`])
  expect(extractJiraLinks('XYZ-2 と DS-10 と ABC-1', url, ' ABC , XYZ ')).toEqual([`${url}/browse/XYZ-2`, `${url}/browse/ABC-1`])
  expect(linkify('ABC-1 DS-10', '', url, 'ABC')).toEqual([{ text: 'ABC-1', href: `${url}/browse/ABC-1` }, { text: ' DS-10' }])
})

test('URL の中に含まれるキーは拾わない', async () => {
  expect(extractJiraLinks('https://github.com/o/r/tree/ABC-123-fix と DEF-4', 'https://jira.example.com')).toEqual([
    'https://jira.example.com/browse/DEF-4',
  ])
})

test('同じキーは 1 回だけ、出た順に返す', async () => {
  expect(extractJiraLinks('ABC-2 ABC-1 ABC-2', 'https://jira.example.com')).toEqual([
    'https://jira.example.com/browse/ABC-2',
    'https://jira.example.com/browse/ABC-1',
  ])
})

test('経過は 6000 文字までで、真ん中を落とす', async () => {
  const prompt = buildPrompt(null, [], '', `先頭${'あ'.repeat(10000)}末尾`, '')
  expect(prompt.includes('# 今回のターンの経過')).toBe(true)
  expect(prompt.includes('先頭') && prompt.includes('末尾') && prompt.includes('（中略）')).toBe(true)
  expect(prompt.length < 6300).toBe(true)
})

const msg = (role: 'user' | 'assistant', text: string, extra: Partial<SessionMessage> = {}): SessionMessage => ({
  role,
  text,
  toolUses: [],
  ...extra,
})

test('turnLog は最後の人の発言より後の途中発言とツール呼び出しだけを 1 行ずつにし、最終回答は入れない', async () => {
  const messages = [
    msg('user', '前のターンの指示'),
    msg('assistant', '前のターンの回答'),
    msg('user', '今回の指示'),
    msg('assistant', '調べます', {
      toolUses: [
        { tool_use_id: 'a', tool: 'Read', input: { file_path: '/src/a.ts', offset: 3 } },
        { tool_use_id: 'b', tool: 'Bash', input: { command: 'pnpm\ntest', description: 'テスト' }, isError: true },
      ],
    }),
    msg('user', '', { toolResults: [{ tool_use_id: 'a', text: 'x', isError: false, result: null }] }),
    msg('assistant', '最終回答です'),
  ]
  expect(turnLog(messages)).toBe(
    ['[発言] 調べます', '[Read] file_path=/src/a.ts', '[Bash]（エラー） description=テスト command=pnpm test'].join('\n'),
  )
})

test('turnLog はツール入力を 120 文字で切る', async () => {
  const log = turnLog([
    msg('user', '指示'),
    msg('assistant', '', { toolUses: [{ tool_use_id: 'a', tool: 'Grep', input: { pattern: 'x'.repeat(300) } }] }),
  ])
  expect(log).toBe(`[Grep] pattern=${'x'.repeat(120)}…`)
})

test('eli5 の題材は、開いている項目があればその題名と本文、無ければ目的・ゴール・今の段階にする', async () => {
  const s = {
    purpose: '目的',
    goal: 'ゴール',
    flow: [
      { text: '済み', done: true, detail: noStep },
      { text: '今', done: false, detail: { ...noStep, now: '詳細\nあり' } },
    ],
    decisions: [],
    next: '',
    at: 1,
  }
  expect(eli5Topic({ title: '題\n名', sections: [{ label: '今', lines: ['本文'], isList: false }] }, s)).toBe('題 名: 今: 本文')
  expect(eli5Topic(undefined, s)).toBe('目的: 目的 ゴール: ゴール 今の段階: 今 詳細 あり')
  expect(eli5Topic(undefined, null)).toBe('')
  expect(eli5Topic({ title: 't', sections: [{ label: '', lines: ['あ'.repeat(2000)], isList: false }] }, s).length).toBeLessThanOrEqual(801)
})
