# 自分のパソコンで動画を一括作成する

スタジオの「公開」で書き出した `series_package.zip` を展開し、このフォルダの中身をそこにコピーして使います。

## 準備（最初の1回）

Windows の PowerShell で次を実行します。

```powershell
winget install Python.Python.3.12
winget install Gyan.FFmpeg
pip install -r requirements.txt
```

## 使い方

```powershell
python make_all.py --org "団体名"
```

- 承認済みの台本だけを、Windows 標準の日本語音声で読み上げ、`out/<回>/<回>.mp4` を作ります。
- 未承認の台本も「監修前サンプル」の表示付きで作るときは `--include-unapproved`、画面下に根拠カードの ID を出すときは `--review` を付けます。
- 音声なしで流れだけ確かめるときは `--tts dummy` を付けます。
- 照合（根拠カード・数字・禁止表現・長さ）で不合格の台本は作らずに飛ばし、理由を表示します。

分からないところは、スタジオの「AIに頼む」→「高音質のナレーションで動画を一括作成する」で、Claude Code・Codex 向けの依頼文を出せます。
