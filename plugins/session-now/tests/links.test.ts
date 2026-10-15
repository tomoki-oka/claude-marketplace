import { expect, test } from 'claude-code/testing'

import { artifactId, compilePattern, describe, extractLinks, htmlTitle, isPullRequest, parsePrState, remember } from '../hooks/links'

test('文末の句読点と markdown の括弧を URL に含めない', async () => {
  expect(
    extractLinks('PR は [#12](https://github.com/o/r/pull/12) です。詳細は https://example.com/a.'),
  ).toEqual(['https://github.com/o/r/pull/12', 'https://example.com/a'])
})

test('後に出たものほど先頭に来て、重複は先頭へ移る', async () => {
  expect(remember(['https://a', 'https://b'], ['https://b', 'https://c'])).toEqual([
    'https://c',
    'https://b',
    'https://a',
  ])
})

test('よく使うサービスは印と短い名前を付け、知らないサービスは印を付けない', async () => {
  const cases: [string, string | undefined, string][] = [
    ['https://claude.ai/code/artifact/5b7e2d40-bbbb', '⧉', 'artifact 5b7e2d40'],
    ['https://github.com/o/r/pull/7723', '⊙', 'r#7723'],
    ['https://github.com/o/r/issues/12', '⊙', 'r#12'],
    ['https://github.com/o/r/pull/212#discussion_r1', '⊙', 'r#212 コメント'],
    ['https://github.com/o/r/issues/12#issuecomment-3', '⊙', 'r#12 コメント'],
    ['https://github.com/o/r/pull/212#pullrequestreview-5', '⊙', 'r#212 レビュー'],
    ['https://example.atlassian.net/browse/ABC-1113', '◆', 'ABC-1113'],
    ['https://example.atlassian.net/wiki/spaces/DOC/pages/123456/Editor+%E4%BB%95%E6%A7%98', '≋', 'Editor 仕様'],
    ['https://example.atlassian.net/wiki/x/AbCd', '≋', 'Confluence'],
    ['https://example.slack.com/archives/C0123/p1700000000000100', '#', 'Slack スレッド'],
    ['https://www.notion.so/team/Weekly-Notes-0123456789abcdef0123456789abcdef', '▣', 'Weekly Notes'],
    ['https://docs.google.com/spreadsheets/d/abc/edit', '▤', 'Google スプレッドシート'],
    ['http://localhost:3000/app/pages', '⌂', ':3000/app/pages'],
    ['https://example.com/a/b', undefined, 'example.com/…/b'],
  ]
  for (const [href, glyph, label] of cases) {
    expect([href, describe(href).mark?.glyph, describe(href).label]).toEqual([href, glyph, label])
  }
})

test('preview のパターンに当たるホストだけに印を付け、キャプチャがあれば PR 番号を出す', async () => {
  const href = 'https://pr-7089-app-preview.example.dev/app'
  const withNumber = compilePattern('^pr-(\\d+)-.+-preview\\.example\\.dev$')
  expect([describe(href, withNumber).mark?.glyph, describe(href, withNumber).label]).toEqual(['◐', 'preview #7089'])
  expect(describe(href, null).mark).toBe(undefined)
  expect(describe(href, compilePattern('-preview\\.example\\.dev$')).label).toBe('preview')
  expect(compilePattern('(')).toBe(null)
  expect(compilePattern('')).toBe(null)
})

test('PR の URL だけを状態の取得対象にする', async () => {
  expect(isPullRequest('https://github.com/o/r/pull/12')).toBe(true)
  expect(isPullRequest('https://github.com/o/r/pull/12/files')).toBe(true)
  expect(isPullRequest('https://github.com/o/r/issues/12')).toBe(false)
})

test('gh の出力から PR の状態を読み、読めなければ null', async () => {
  expect(parsePrState('{"state":"MERGED","isDraft":false}')).toBe('merged')
  expect(parsePrState('{"state":"OPEN","isDraft":true}')).toBe('draft')
  expect(parsePrState('{"state":"OPEN","isDraft":false}')).toBe('open')
  expect(parsePrState('{"state":"CLOSED","isDraft":false}')).toBe('closed')
  expect(parsePrState('not json')).toBe(null)
})

test('claude.ai の artifact は id の先頭で短く呼び、それ以外の claude.ai は対象にしない', async () => {
  expect(artifactId('https://claude.ai/artifact/0f3a9c12-aaaa')).toBe('0f3a9c12-aaaa')
  expect(artifactId('https://claude.ai/code/artifact/5b7e2d40-bbbb')).toBe('5b7e2d40-bbbb')
  expect(artifactId('https://claude.ai/code/session_01A4')).toBe(null)
})

test('HTML の題名を 1 行に詰めて読み、無ければ空にする', async () => {
  expect(htmlTitle('<head><title>\n  Deploy\n  Board </title></head>')).toBe('Deploy Board')
  expect(htmlTitle('<p>no title</p>')).toBe('')
  expect(htmlTitle(`<title>${'あ'.repeat(50)}</title>`)).toBe(`${'あ'.repeat(39)}…`)
})

test('jiraUrl のホストの /browse/KEY も Jira として扱い、別のホストは扱わない', async () => {
  const href = 'https://jira.example.com/browse/ABC-1'
  expect(describe(href, null, 'https://jira.example.com')).toEqual({ mark: { glyph: '◆', color: '#2684ff' }, label: 'ABC-1' })
  expect(describe(href).mark).toBe(undefined)
  expect(describe(href, null, 'https://other.example.com').mark).toBe(undefined)
})
