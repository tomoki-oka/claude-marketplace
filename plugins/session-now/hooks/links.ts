import type { PrState } from '../types'

const URL_RE = /https?:\/\/[^\s<>"'`()[\]{}、。「」（）]+/g

export const MAX_LINKS = 30

export function extractLinks(text: string): string[] {
  return (text.match(URL_RE) ?? []).map(u => u.replace(/[.,;:!?*_~]+$/, ''))
}

// 新しく出たものを先頭へ。既に出ていたものは先頭へ移す
export function remember(links: readonly string[], found: readonly string[]): string[] {
  const fresh = [...found].reverse()
  return [...new Set([...fresh, ...links])].slice(0, MAX_LINKS)
}

export type Mark = { glyph: string; color?: string }

type Service = { mark: Mark; match: (url: URL) => boolean; label: (url: URL) => string }

const clip = (text: string, limit = 30) => (text.length > limit ? `${text.slice(0, limit - 1)}…` : text)

// URL に入っているページ名（Confluence・Notion）を読める形に戻す
function slugTitle(segment: string): string {
  try {
    return decodeURIComponent(segment.replace(/\+/g, ' '))
  } catch {
    return segment
  }
}

const isAtlassian = (url: URL) => url.hostname.endsWith('.atlassian.net')
const google = (kind: string, name: string, color: string): Service => ({
  mark: { glyph: '▤', color },
  match: url => url.hostname === 'docs.google.com' && url.pathname.startsWith(`/${kind}/`),
  label: () => name,
})

// 上から順に当てる。印は色と記号でサービスを見分けるため、ラベルは中身を読むためのもの
const SERVICES: Service[] = [
  {
    // Claude のブランドのオレンジ
    mark: { glyph: '⧉', color: '#d97757' },
    match: url => artifactId(url.href) !== null,
    label: url => `artifact ${(artifactId(url.href) ?? '').slice(0, 8)}`,
  },
  {
    // PR は状態が分かると状態の印に差し替わる
    mark: { glyph: '⊙', color: 'gray' },
    match: url => url.hostname === 'github.com',
    label: url => {
      const [, , repo, kind, num] = url.pathname.split('/')
      return repo && num && (kind === 'pull' || kind === 'issues') ? `${repo}#${num}` : clip(url.pathname.slice(1))
    },
  },
  {
    // Jira のロゴのひし形
    mark: { glyph: '◆', color: '#2684ff' },
    match: url => isAtlassian(url) && /^\/browse\/[A-Z][A-Z0-9]+-\d+/.test(url.pathname),
    label: url => url.pathname.split('/')[2] ?? 'Jira',
  },
  {
    // Confluence のロゴの波
    mark: { glyph: '≋', color: '#1868db' },
    match: url => isAtlassian(url) && url.pathname.startsWith('/wiki'),
    label: url => {
      const slug = url.pathname.match(/\/pages\/\d+\/([^/]+)/)?.[1]
      return slug ? clip(slugTitle(slug)) : 'Confluence'
    },
  },
  {
    mark: { glyph: '#', color: '#e01e5a' },
    match: url => url.hostname.endsWith('.slack.com'),
    // チャンネル名は URL に入っていない
    label: url => (/\/archives\/\w+\/p\d+/.test(url.pathname) ? 'Slack スレッド' : 'Slack'),
  },
  {
    mark: { glyph: '▣' },
    match: url => /(^|\.)notion\.(so|com)$/.test(url.hostname),
    label: url => {
      const tail = url.pathname.split('/').filter(Boolean).pop() ?? ''
      const title = slugTitle(tail.replace(/-?[0-9a-f]{32}$/, '')).replace(/-/g, ' ').trim()
      return title ? clip(title) : 'Notion'
    },
  },
  // 題名は URL に入っていないので、種類だけを出す
  google('document', 'Google ドキュメント', '#4285f4'),
  google('spreadsheets', 'Google スプレッドシート', '#0f9d58'),
  google('presentation', 'Google スライド', '#f4b400'),
  {
    mark: { glyph: '⌂', color: 'cyan' },
    match: url => url.hostname === 'localhost' || url.hostname === '127.0.0.1',
    label: url => clip(`:${url.port}${url.pathname.replace(/\/$/, '')}`),
  },
]

// どのサービスのリンクか（印）と、パネルに出す短い名前
// preview は利用者が設定した正規表現に当たるホストで、最初のキャプチャを PR 番号として出す
export function describe(href: string, preview: RegExp | null = null): { mark?: Mark; label: string } {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return { label: clip(href) }
  }
  const previewMatch = preview?.exec(url.hostname)
  if (previewMatch) {
    return { mark: { glyph: '◐', color: 'cyan' }, label: previewMatch[1] ? `preview #${previewMatch[1]}` : 'preview' }
  }
  const service = SERVICES.find(s => s.match(url))
  if (service) return { mark: service.mark, label: service.label(url) }
  const tail = url.pathname.split('/').filter(Boolean).pop() ?? ''
  return { label: clip(tail ? `${url.hostname}/…/${tail}` : url.hostname) }
}

export function isPullRequest(href: string): boolean {
  return /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(href)
}

// gh pr view --json state,isDraft の出力を読む
export function parsePrState(json: string): PrState | null {
  try {
    const { state, isDraft } = JSON.parse(json)
    if (state === 'MERGED') return 'merged'
    if (state === 'CLOSED') return 'closed'
    if (state === 'OPEN') return isDraft ? 'draft' : 'open'
  } catch {}
  return null
}

// 色は GitHub の PR 状態に揃える
export const PR_MARK: Record<PrState, Mark> = {
  open: { glyph: '○', color: 'green' },
  draft: { glyph: '◌', color: 'gray' },
  merged: { glyph: '✓', color: 'magenta' },
  closed: { glyph: '×', color: 'red' },
}

export function artifactId(href: string): string | null {
  return href.match(/^https:\/\/claude\.ai\/(?:code\/)?artifact\/([\w-]+)/)?.[1] ?? null
}

// <title> が長いとパネルの 1 行に収まらないので、表示の前に詰める
export function htmlTitle(html: string): string {
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? ''
  return title.length > 40 ? `${title.slice(0, 39)}…` : title
}

// 不正な正規表現は preview の判定をしない扱いにする
export function compilePattern(source: string): RegExp | null {
  if (!source) return null
  try {
    return new RegExp(source)
  } catch {
    return null
  }
}
