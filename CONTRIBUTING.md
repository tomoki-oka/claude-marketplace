# 開発の手順

## 正本

`plugins/<name>/` が唯一の正本です。手元で使うときはコピーではなくシンボリックリンクで読ませます。

```
ln -s "$PWD/plugins/bonsai" ~/.claude/skills/bonsai
```

編集したら、起動中の Claude Code で `/reload-plugins` を打つだけで反映されます。

## 型と検証

```
cd plugins/bonsai
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude -p '/plugin-types'   # .claude/types/ に型を書き出す（git 管理外）
pnpm --package=typescript@5.6 dlx tsc -p tsconfig.json          # 型検査
claude plugin validate .                                        # フックと $ 呼び出しの検証
```

## 画面の確認

`tools/screenshot-tui.py` が疑似端末で Claude Code を起動し、操作手順を流して画面を PNG とテキストに保存します。pyte と Pillow が要ります。

```
python3 tools/screenshot-tui.py <出力dir> '<手順のJSON>' claude --plugin-dir "$PWD/plugins/bonsai"
```

手順は `[{"wait":10},{"type":"/bonsai\r","wait":3,"snap":"01"}]` の形です。文字は 1 文字ずつ送られます。信頼済みのディレクトリから起動しないと trust ダイアログで止まります。

## 配布

`main` に push すれば配布されます。受け取る側は次で更新します。

```
claude plugin marketplace update toka-lab
claude plugin update bonsai@toka-lab
```

自分の端末で marketplace 版を試すときは、上のシンボリックリンクを外してから `claude plugin install bonsai@toka-lab` を打ちます。両方あると `/bonsai` が二重に登録されます。
