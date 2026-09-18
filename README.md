# claude-marketplace

tomoki-oka の Claude Code プラグインを配布するマーケットプレイスです。

<p align="center"><img src="docs/bonsai.png" alt="右ドックで満開になった桜の盆栽" width="420"></p>

## 入れ方

```
claude plugin marketplace add tomoki-oka/claude-marketplace
claude plugin install bonsai@toka-lab
```

Claude Code の中なら `/plugin marketplace add tomoki-oka/claude-marketplace` と `/plugin install bonsai@toka-lab` です。

## プラグイン

| 名前 | 何か | 前提 |
|---|---|---|
| [bonsai](plugins/bonsai) | 右ドックで育つピクセルアートの盆栽。セッションごとに 1 鉢 | Claude Code 2.1.274 以降。`~/.claude/settings.json` の `env` に `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` |

## 更新

```
claude plugin marketplace update toka-lab
claude plugin update bonsai@toka-lab
```
