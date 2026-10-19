# CLAUDE.md — クリーンルーム動画スタジオ

このレポジトリは、医療ショート動画をクリーンルーム方式で作るブラウザ用ツールです。利用者の多くはプログラミングの初心者です。

## 構成

- ブラウザ版はビルド不要の静的ファイル（`index.html`、`app.js`、`render.js`、`prompts.js`、`config.js`、`sample.js`）。GitHub Pages でそのまま公開する。
- 外部の読み込みは CDN の js-yaml と JSZip、Google Fonts だけ。サーバーや API キーをレポジトリに置かない。
- `local/` は自分のパソコンで動画を一括作成する Python（Pillow・ffmpeg）。スタジオで書き出した `cards.json` と `scripts/*.json` を読む。

## 守ること

1. 画面の文言は、初心者が読んで分かる平易な日本語にする。専門用語には短い説明を添える。
2. 事実カードの主張文と数値を、プログラムが書き換えない。
3. 台本の自動照合（`app.js` の `runChecks`、`local/check.py`）のルールを緩める変更は、理由を README に書く。
4. 助成の表記（`config.js` の `grants`、画面下部、README）を消さない。
5. 動画の挿絵は `render.js`（ブラウザ）と `local/render.py`（Python）の両方にある。片方に絵を足したら、もう片方にも足す。
6. 利用者の API キーや個人情報を保存・送信しない（音声合成の API キーはメモリ上だけで使う）。
