# session-now

Claude Code の右パネルに、このセッションの状況を出し続ける Mod です。

## 表示するもの

- 目的、ゴール、流れ（段階ごとの詳細つき）、判断待ち、次にやること
- 会話に出たリンク（PR は状態つき）、タスク、動いている subagent
- 要約は Haiku が毎ターン更新する。呼び出しは 1 日 150 回まで

「変更の図解を HTML で開く」ボタンは、`explain-change` という名前のスキルかコマンドが別に入っているときだけ動きます。
「eli5 で説明する」ボタンは、`eli5` スキル（claude-community marketplace の eli5 プラグイン）が別に入っているときだけ動きます。

## 入れ方

1. Function Hooks を有効にする（Claude Code 2.1.274 以降）。`~/.claude/settings.json` に次を足す

```json
{ "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }
```

2. 次を打つ

```
claude plugin marketplace add tomoki-oka/claude-marketplace
claude plugin install session-now@toka-lab
```

3. 起動するとパネルが自動で開く。閉じたあとは `/session-now` で開き直せる

## 設定

`/config` のプラグイン設定から変える。変えるとプラグインが再読み込みされる。

| 項目 | 何をするか | 例 |
|---|---|---|
| `jiraUrl` | 文中の Jira キー（ABC-123）をこのサイトの課題へのリンクにする。本文に出たキーはリンク欄にも載る。空ならリンクにしない | `https://example.atlassian.net` |
| `jiraProjects` | リンクにする Jira のプロジェクトキーをカンマ区切りで指定する。前後の空白は無視し、大文字小文字は区別する。空ならすべてのキーをリンクにする | `ABC,XYZ` |
| `previewHostPattern` | preview 環境のホスト名に当てる正規表現。最初のキャプチャグループを PR 番号として `preview #番号` と出す。正規表現として正しくなければ無視する。空なら preview として扱わない | `^pr-(\d+)\.preview\.example\.com$` |

## 注意

- Function Hooks は早期アクセスの API で、Claude Code の更新で動かなくなることがある
