import { expect, test } from 'claude-code/testing'

import { addTask, buildPrompt, linkify, parseSummary, replaceTodos, syncTaskList, updateTask } from '../hooks/lib'

test('前置きやコードフェンスが付いた返答からも JSON を読み、欠けた項目は空にする', async () => {
  const text = '了解です。\n```json\n{"purpose":"P","flow":[{"text":"a","done":true,"detail":"d"},{"text":""},"x"],"decisions":["決める", 3, {"text":"選ぶ","detail":"A か B か"}]}\n```'
  expect(parseSummary(text, 1)).toEqual({
    purpose: 'P',
    goal: '',
    flow: [{ text: 'a', done: true, detail: 'd' }],
    decisions: [
      { text: '決める', detail: '' },
      { text: '選ぶ', detail: 'A か B か' },
    ],
    next: '',
    at: 1,
  })
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
  const prompt = buildPrompt(null, [], '', answer)
  expect(prompt.includes('冒頭')).toBe(true)
  expect(prompt.includes('結論')).toBe(true)
  expect(prompt.includes('（中略）')).toBe(true)
  expect(prompt.length < 4500).toBe(true)
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
