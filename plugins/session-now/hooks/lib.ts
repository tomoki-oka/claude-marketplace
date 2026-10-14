import { URL_RE } from './links'
import type { SessionMessage } from 'claude-code'
import type { DecisionDetail, NowDecision, NowStep, NowSummary, NowTask, StepDetail } from '../types'

// ponytail: 1 日の上限は固定値。足りなければ userConfig に出す
export const DAILY_MAX_CALLS = 150

const PROMPT_LIMIT = 1500
const ANSWER_LIMIT = 3500
const LOG_LIMIT = 6000
const TOPIC_LIMIT = 800

export const SYSTEM = `あなたは開発セッションの状況メモを更新する係です。
入力は「前回のメモ」「タスク一覧」「今回のユーザーの指示」「今回のターンの経過」「今回のアシスタントの最終回答」です。経過には、アシスタントがターンの途中で話したことと、呼び出したツール（ツール名と入力の要点）が順に入っています。
前回のメモを今回の内容で更新し、JSON だけを返してください。前置きやコードフェンスは付けません。

{"purpose":"なぜこの作業をしているか","goal":"何ができたら終わりか","flow":[{"text":"段階","done":true,"detail":{"did":["やったこと"],"why":"なぜこの段階が要るか","now":"今どうなっているか","left":"残っていること"}}],"decisions":[{"text":"ユーザーが決める必要のあること","detail":{"ask":"何を決めるのか","options":[{"name":"選択肢の名前","result":"それを選ぶと何が起きるか"}],"recommend":"アシスタントの推奨とその理由"}}],"next":"次にやること"}

規則:
- 日本語で書く。text は各項目 1 文、60 文字以内
- flow の detail.did: その段階でやったことを 1〜4 個。各 60 文字以内。触ったファイル・関数・コマンド・数値が経過や会話に出ていれば入れる。まだ何もしていない段階は []
- flow の detail.why: なぜその段階が要るか。1〜2 文、100 文字以内
- flow の detail.now: 今どうなっているか（終わった・途中・止まっている理由）。1〜2 文、100 文字以内
- flow の detail.left: 残っていること。無ければ空文字
- decisions の detail.ask: 何を決めるのか。1〜2 文
- decisions の detail.options: 会話に出ている選択肢 2〜4 個。name は選択肢の短い名前、result はそれを選ぶと何が起きるか（1 文、80 文字以内）
- decisions の detail.recommend: アシスタントの推奨とその理由。無ければ空文字
- detail のどの欄も text の言い換えにしない。分からない欄は空文字か []
- 会話と経過に出ていない目的・数字・事情を足さない。分からない項目は空文字にする
- decisions には、アシスタントがユーザーに確認・選択を求めていて、まだ答えが出ていないものだけを書く。無ければ []
- flow は 6 段階以内。終わった段階は done: true
- 話題が変わったら、前回のメモを捨てて新しい作業として書き直す

文章の規則（読み手がすぐ理解できることを最優先にする）:
- 何がどうなったか・何をするかが分かる文にする。語を並べただけの見出し風にしない
- 英語の言い回しを直訳しない。字義どおりの動作が浮かぶ述語（運ぶ、開く、住む、効く、刺さる、潰す、担保する、回す）は使わず、誰が何をどうするかを具体的な語で書く
- 無生物を人のように振る舞わせない（×「データが語る」○「データから分かる」）
- 中身のない語を使わない: 不可欠、核心的、鍵となる、多角的、包括的、掘り下げる、言語化する、正面から、〜において、〜の観点から、重要なのは、まとめると
- 一般に使われるカタカナ語・技術用語・製品名・コードの識別子・画面の文言は原文のまま書く。無理に和語へ訳さない。一般的でないカタカナ語は使わない
  （×巻く→○スクロール、×引き金→○トリガー、×引き出し→○ドロップダウン、×覆い→○オーバーレイ、×枡→○セル、×器→○コンテナ、×索引→○index、×受け口→○エンドポイント、×心拍→○ハートビート、×進み→○進捗、×呼び手→○呼び出し元、×（タスクを）立てる→○登録する）
- 「面」を画面上の場所や部品の意味で使わない。画面・ダイアログ・パネル・カード・入力欄など、指しているものの名前で書く
- 推量を断定に変えない。会話に無い事情（競争、焦り、効果の数字）を足さない
- 同じ内容を別の項目で繰り返さない`

function clip(text: string, limit: number): string {
  if (text.length <= limit) return text
  // 回答は冒頭と結論の両方に要点があるので、真ん中を落とす
  const half = Math.floor(limit / 2)
  return `${text.slice(0, half)}\n…（中略）…\n${text.slice(-half)}`
}

export function buildPrompt(
  prev: NowSummary | null,
  tasks: readonly NowTask[],
  prompt: string,
  log: string,
  answer: string,
): string {
  const memo = prev
    ? JSON.stringify({ purpose: prev.purpose, goal: prev.goal, flow: prev.flow, decisions: prev.decisions, next: prev.next })
    : '（なし）'
  const list = tasks.length > 0 ? tasks.map(t => `- [${t.status}] ${t.subject}`).join('\n') : '（なし）'
  return [
    `# 前回のメモ\n${memo}`,
    `# タスク一覧\n${list}`,
    `# 今回のユーザーの指示\n${clip(prompt, PROMPT_LIMIT) || '（なし）'}`,
    `# 今回のターンの経過\n${clip(log, LOG_LIMIT) || '（なし）'}`,
    `# 今回のアシスタントの最終回答\n${clip(answer, ANSWER_LIMIT)}`,
  ].join('\n\n')
}

const SHOWN_INPUTS = ['description', 'file_path', 'command', 'pattern', 'prompt'] as const

const oneLine = (text: string, limit: number) => {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length <= limit ? t : `${t.slice(0, limit)}…`
}

// 最後の人の発言より後の、アシスタントの途中の発言とツール呼び出しを 1 行ずつにする。最後の発言（ツール呼び出しを伴わない最終回答）は別に渡すので入れない
export function turnLog(messages: readonly SessionMessage[]): string {
  const isHuman = (m: SessionMessage) => m.role === 'user' && m.text.trim() !== '' && !m.toolResults?.length
  const from = messages.findLastIndex(isHuman) + 1
  const turn = messages.slice(from)
  const finalIndex = turn.findLastIndex(m => m.role === 'assistant')
  const lines: string[] = []
  turn.forEach((m, i) => {
    if (m.role !== 'assistant') return
    const isFinal = i === finalIndex && m.toolUses.length === 0
    if (m.text.trim() && !isFinal) lines.push(`[発言] ${oneLine(m.text, 600)}`)
    for (const u of m.toolUses) {
      const parts = SHOWN_INPUTS.flatMap(k => (typeof u.input[k] === 'string' ? [`${k}=${oneLine(u.input[k], 120)}`] : []))
      lines.push(`[${u.tool}]${u.isError ? '（エラー）' : ''} ${parts.join(' ')}`.trimEnd())
    }
  })
  return lines.join('\n')
}

export type Section = { label: string; lines: string[]; isList: boolean }

function section(label: string, lines: string[], isList = false): Section[] {
  const kept = lines.filter(Boolean)
  return kept.length ? [{ label, lines: kept, isList }] : []
}

// 詳細欄の欄。空の欄は入れない。保存済みの古い形（detail が文字列）は欄なしになる
export function stepSections(d: StepDetail): Section[] {
  return [...section('やったこと', d?.did ?? [], true), ...section('理由', [d?.why]), ...section('今', [d?.now]), ...section('残り', [d?.left])]
}

export function decisionSections(d: DecisionDetail): Section[] {
  const options = (d?.options ?? []).map(o => (o.result ? `${o.name}: ${o.result}` : o.name))
  return [...section('決めること', [d?.ask]), ...section('選択肢', options, true), ...section('推奨', [d?.recommend])]
}

export const taskSections = (description: string): Section[] => section('', [description || '説明なし'])

export const sectionsText = (sections: Section[]) => sections.map(x => (x.label ? `${x.label}: ` : '') + x.lines.join(' / ')).join(' ')

// eli5 に渡す題材。開いている項目があればその題名と本文、無ければセッションの目的・ゴール・今の段階
export function eli5Topic(
  picked: { title: string; sections: Section[] } | undefined,
  s: NowSummary | null,
): string {
  if (picked) return oneLine(`${picked.title}: ${sectionsText(picked.sections)}`, TOPIC_LIMIT)
  if (!s) return ''
  const step = s.flow.find(f => !f.done)
  const parts = [
    s.purpose && `目的: ${s.purpose}`,
    s.goal && `ゴール: ${s.goal}`,
    step && `今の段階: ${step.text}${step.detail?.now ? ` ${step.detail.now}` : ''}`,
  ]
  return oneLine(parts.filter(Boolean).join(' '), TOPIC_LIMIT)
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export function parseSummary(text: string, at: number): NowSummary | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
  const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : [])
  const stepDetail = (v: unknown): StepDetail => {
    const d = obj(v)
    return { did: strs(d.did), why: str(d.why), now: str(d.now), left: str(d.left) }
  }
  const decisionDetail = (v: unknown): DecisionDetail => {
    const d = obj(v)
    const options = Array.isArray(d.options)
      ? d.options.map(obj).map(o => ({ name: str(o.name), result: str(o.result) })).filter(o => o.name)
      : []
    return { ask: str(d.ask), options, recommend: str(d.recommend) }
  }
  const flow: NowStep[] = Array.isArray(raw.flow)
    ? raw.flow
        .map(obj)
        .map(s => ({ text: str(s.text), done: s.done === true, detail: stepDetail(s.detail) }))
        .filter(s => s.text)
    : []
  // 以前の形（文字列の配列）で保存された要約も読めるようにする
  const decisions: NowDecision[] = Array.isArray(raw.decisions)
    ? raw.decisions
        .map(d =>
          typeof d === 'string'
            ? { text: d.trim(), detail: decisionDetail(null) }
            : { text: str(obj(d).text), detail: decisionDetail(obj(d).detail) },
        )
        .filter(d => d.text)
    : []
  return { purpose: str(raw.purpose), goal: str(raw.goal), flow, decisions, next: str(raw.next), at }
}

type TaskStatus = NowTask['status']

export function addTask(tasks: readonly NowTask[], id: string, subject: string, description = ''): NowTask[] {
  return [...tasks.filter(t => t.id !== id), { id, subject, description, status: 'pending' }]
}

export function updateTask(
  tasks: readonly NowTask[],
  id: string,
  change: { subject?: string; description?: string; status?: TaskStatus | 'deleted' },
): NowTask[] {
  if (change.status === 'deleted') return tasks.filter(t => t.id !== id)
  const status = change.status
  return tasks.map(t =>
    t.id === id
      ? {
          ...t,
          subject: change.subject ?? t.subject,
          description: change.description ?? t.description,
          status: status ?? t.status,
        }
      : t,
  )
}

// TaskList の結果は説明を持たないので、手元の説明を引き継いで差し替える
export function syncTaskList(
  tasks: readonly NowTask[],
  all: readonly { id: string; subject: string; status: TaskStatus }[],
): NowTask[] {
  const known = new Map(tasks.map(t => [t.id, t.description]))
  return [
    ...tasks.filter(t => t.id.startsWith('todo:')),
    ...all.map(t => ({ id: t.id, subject: t.subject, description: known.get(t.id) ?? '', status: t.status })),
  ]
}

// TodoWrite は一覧を丸ごと送ってくるので、その分だけ差し替える
export function replaceTodos(
  tasks: readonly NowTask[],
  todos: readonly { content: string; status: TaskStatus }[],
): NowTask[] {
  const kept = tasks.filter(t => !t.id.startsWith('todo:'))
  return [...kept, ...todos.map((t, i) => ({ id: `todo:${i}`, subject: t.content, description: '', status: t.status }))]
}

export function today(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
}

// Jira のキーと同じ形をした規格名。リンクにしない
const NOT_JIRA = new Set(['UTF', 'ISO', 'SHA', 'RFC', 'CVE', 'ES'])
const REF_RE = /#(\d+)\b|(?<![\w-])([A-Z][A-Z0-9]{1,9})-([1-9]\d*)\b/g

// Jira のキーなら課題の URL、規格名・jiraUrl が空・jiraProjects にないプロジェクトなら空文字。jiraProjects はカンマ区切りで、空なら絞らない
function jiraHref(jiraUrl: string, jiraProjects: string, project: string | undefined, num: string | undefined): string {
  const base = jiraUrl.replace(/\/+$/, '')
  const allowed = jiraProjects.split(',').map(p => p.trim()).filter(Boolean)
  if (!base || !project || NOT_JIRA.has(project)) return ''
  return allowed.length === 0 || allowed.includes(project) ? `${base}/browse/${project}-${num}` : ''
}

export type Segment = { text: string; href?: string }

// 文中の PR 番号（#1234）と Jira のキー（ABC-123）をリンクの区間に分ける。repoUrl が空なら PR 番号、jiraUrl が空なら Jira のキーはそのまま
export function linkify(text: string, repoUrl: string, jiraUrl = '', jiraProjects = ''): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const m of text.matchAll(REF_RE)) {
    const href = m[1]
      ? repoUrl && `${repoUrl}/pull/${m[1]}`
      : jiraHref(jiraUrl, jiraProjects, m[2], m[3])
    if (!href) continue
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    out.push({ text: m[0], href })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

// 本文の Jira キーを課題の URL にする。URL の中のキー（ブランチ名など）は拾わず、同じキーは 1 回だけ出た順
export function extractJiraLinks(text: string, jiraUrl: string, jiraProjects = ''): string[] {
  const hrefs = [...text.replace(URL_RE, ' ').matchAll(REF_RE)].map(m => jiraHref(jiraUrl, jiraProjects, m[2], m[3]))
  return [...new Set(hrefs.filter(Boolean))]
}
