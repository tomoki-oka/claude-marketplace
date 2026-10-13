export type NowTask = {
  id: string
  subject: string
  description: string
  status: 'pending' | 'in_progress' | 'completed'
}
export type StepDetail = { did: string[]; why: string; now: string; left: string }
export type DecisionDetail = { ask: string; options: { name: string; result: string }[]; recommend: string }
export type NowStep = { text: string; done: boolean; detail: StepDetail }
export type NowDecision = { text: string; detail: DecisionDetail }
export type NowSummary = {
  purpose: string
  goal: string
  flow: NowStep[]
  decisions: NowDecision[]
  next: string
  at: number
}
export type PrState = 'open' | 'draft' | 'merged' | 'closed'
export type NowMeta = { isBusy: boolean; error: string; day: string; calls: number; tokens: number }

declare module 'claude-code' {
  interface PluginState {
    'session-now': {
      tasks: NowTask[]
      summary: NowSummary | null
      meta: NowMeta
      selected: string | null
      links: string[]
      prStates: Record<string, PrState>
      artifactTitles: Record<string, string>
    }
  }
}
