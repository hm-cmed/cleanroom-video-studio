# 実装仕様：縦型ショート動画の自動制作パイプライン

この文書は、コード生成AI（Claude Code、Codex 等）に読み込ませて実装させるための仕様です。人が読んでも全体像がわかるように書いています。

## 1. 目的と成果物

「1文のテーマ」から、レビュー済みの縦型ショート動画（MP4）を作る仕組みを、利用者のPC上に実装する。動画はAIの動画生成モデルで作らず、**HTMLで描いたアニメーションをブラウザで1コマずつ撮影し、ffmpegで書き出す**。同じ入力からは同じ映像が出る（決定論的レンダリング）。

完成の条件：

- `/short-video "<テーマ>"`（または同等の1コマンド）で `out/<slug>/` に次が出力される
  - `final.mp4`（動画）、`script.json`（台本）、`captions.srt`（字幕）、`cover.png`（サムネ）、`review.md`（自動レビュー結果）、`medical_review.md`（監修記録の雛形）
- 医学的内容を含む場合、`medical_review.md` の監修欄が埋まるまで「配信不可」と表示される

## 2. 前提

| 項目 | 設定 |
| --- | --- |
| OS | Windows 11（PowerShell）を第一に想定。macOS・Linux でも動くように書く |
| 画面 | 1080×1920、30fps、H.264 / yuv420p / bt709 |
| 長さ | 30〜60秒。冒頭0〜3秒はフック |
| 音声 | 日本語ナレーション（VOICEVOX をローカルで利用）。TTS は差し替え可能にする |
| 音量 | −14 LUFS（Integrated）、True Peak −1 dBTP 以下 |
| 投稿 | 自動投稿はしない。書き出しまでを自動化する |

## 3. 全体の流れ

```
入力（1文のテーマ）
  → 事実票の取得（tools/fetch_facts.py）
  → 台本 script.json            ← 人が確認（1回目）
  → ナレーション tts.py（WAV＋語ごとの時刻）
  → シーン build_scene.py（seek(t) で描く HTML、字幕を焼き込み）
  → 静止画4枚（コンタクトシート） ← 人が確認（2回目）
  → 本レンダー render.py（Playwright で全フレーム撮影 → ffmpeg）
  → 合成 mux.py（BGM・効果音、−14 LUFS に正規化）
  → 自動レビュー review.py（不合格ならシーンに戻って修正、最大3回）
  → 納品 out/<slug>/
  → 専門家の監修（medical_review.md）  ← 人が確認（3回目・配信の条件）
```

## 4. 環境とセットアップ

| ツール | 用途 | Windows での導入例 |
| --- | --- | --- |
| Python 3.11 以上 | 本体 | `winget install Python.Python.3.12` |
| Playwright＋Chromium | 撮影 | `pip install playwright` → `python -m playwright install chromium` |
| FFmpeg / ffprobe | エンコード・検査 | `winget install Gyan.FFmpeg` |
| VOICEVOX | 日本語ナレーション（`http://127.0.0.1:50021`） | 公式サイトから導入して起動 |

`pipeline/doctor.py` を最初に作る。各ツールのバージョンを ✅／❌ で表示し、不足があれば導入コマンドを提示する。**インストールは必ず利用者の承認を得てから行う。** 日本語フォント（`assets/fonts/`）の有無も確認する。

## 5. ディレクトリ構成

```
.claude/skills/short-video/SKILL.md   入口の手順書（同梱の雛形を育てる）
pipeline/  doctor.py  tts.py  build_scene.py  render.py  mux.py  review.py
templates/ base.html  components/  script.example.json  medical-review-checklist.md
tools/     fetch_facts.py              事実票の取得（同梱）
assets/    fonts/ bgm/ sfx/ brand.json  ※素材は各自が権利を確認して置く。リポジトリには含めない
out/<slug>/                            成果物（リポジトリには含めない）
```

## 6. 各工程の仕様

### 6.1 事実票と台本

- テーマに関係する事実票を `tools/fetch_facts.py` で取得し、根拠にする（[FACT_CARDS.md](FACT_CARDS.md)）。
- 構成：フック → 本題3〜5ビート → まとめ。1ビート＝1シーン＝ナレーション1〜2文（40〜60字）。
- 各ビートに `id`, `narration`（字幕）, `speech`（読み上げ用。読み方を整える）, `on_screen`, `component`, `emphasis`, `cards`（根拠カードID）を持たせる。形式は [templates/script.example.json](../templates/script.example.json)。
- **検証**：字幕の数字が根拠カードにない場合、`retired` カードを使った場合は不合格。根拠カードのうち `verified_expert` でないものがあれば `medical_review_required: true` にする。
- 台本を利用者に見せ、承認を得てから次へ進む。

### 6.2 ナレーション（tts.py）

- VOICEVOX の `audio_query` → `synthesis` でビートごとに WAV を作り、0.2秒の無音を挟んで連結する。
- `audio_query` のアクセント句・モーラ長から語ごとの開始・終了時刻を求め、`timings.json` に保存する。
- 話者・速度は `assets/brand.json` で固定する。使った音声ライブラリのクレジット文を `credits.txt` に出力する。

### 6.3 シーン（build_scene.py ＋ templates）

- `base.html` は `window.seek(t)` だけで画面全体を描く。実時間や `requestAnimationFrame` に依存するアニメーションは禁止。
- イージングは数式で書く（同じ t なら同じ絵）。シーン境界には 0.3〜0.5秒の遷移を必ず入れる。
- 図や絵は自作の SVG・CSS で描く。外部の画像・ロゴ・既存キャラクター・実在人物の顔は使わない。

### 6.4 字幕

- 1行12〜16字、最大2行、語の途中で改行しない。`timings.json` に合わせて語単位で表示し、`emphasis` の語だけ色を変える。
- HTML 内で焼き込み、同じ内容を `captions.srt` にも出力する。

### 6.5 レンダー（render.py）

- 先に各ビート中央の静止画4枚を出して利用者に確認してもらい、その後に本レンダーする。
- Playwright（Chromium、ヘッドレス、viewport 1080×1920）で `seek(i/30)` → スクリーンショットを繰り返し、ffmpeg にパイプで渡す。
- エンコード：`-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709`

### 6.6 合成（mux.py）

- ナレーション＋BGM（ナレーション中は下げる）＋効果音を合成し、`loudnorm`（`I=-14:TP=-1.0:LRA=11`、2パス）で正規化する。
- `cover.png` はフックのシーンから書き出す。

## 7. 自動レビューの基準

| 項目 | 合格基準 | 方法 |
| --- | --- | --- |
| 形式 | 1080×1920、30fps、H.264、yuv420p | ffprobe |
| 長さ | 30〜60秒、音声と映像の差 0.1秒以内 | ffprobe |
| セーフゾーン | 上250px・下420px・右140px に字幕や要点がない（初期値。`brand.json` で調整） | Playwright で要素の位置を取得 |
| 字幕 | 2行以内、枠からはみ出さない | 同上 |
| 場面転換 | すべてのシーン境界に遷移がある | 台本と描画ログの照合 |
| 音量 | −14 LUFS ±1、True Peak ≦ −1 dBTP | ffmpeg `ebur128` |
| 同期 | 語の表示とナレーションのずれ 0.15秒以内 | `timings.json` と描画ログ |
| 根拠 | 全ビートに根拠カードがあり、字幕の数字がカードと一致 | 台本検証 |

機械検査の後、コード生成AIが1秒ごとの静止画を並べたコンタクトシートを読み、読みにくさ・重なりを確認して `review.md` に記録する。セーフゾーンの数値は各SNSの公式規格ではなく初期値なので、実機で確認して調整する。

## 8. 専門家の監修（配信の条件）

- 医学的内容を含む動画は、`medical_review.md`（[templates/medical-review-checklist.md](../templates/medical-review-checklist.md) から生成）に監修者・監修日・判定を記入するまで「配信不可」とする。
- 自動レビューに合格しても、監修の代わりにはならない。

## 9. 実装フェーズ

| フェーズ | 作るもの | 受け入れ基準 |
| --- | --- | --- |
| 0 | doctor.py、brand.json の雛形 | 全項目 ✅ で終了コード0 |
| 1 | base.html、render.py、部品2種 | 10秒の無音動画が出る。2回のレンダーでフレームのハッシュが一致 |
| 2 | 台本の型と検証、tts.py | 1文から台本が出て、根拠カード検証が動く。WAV と timings.json ができる |
| 3 | build_scene.py、部品5種以上、遷移、字幕 | 字幕が語単位で同期し、強調語の色が変わる |
| 4 | mux.py | −14 LUFS ±1 の final.mp4 が出る |
| 5 | review.py、修正ループ | わざとはみ出させた字幕が検出され、修正後に合格 |
| 6 | SKILL.md の完成、監修記録 | 新しいセッションで1コマンドで最後まで通り、medical_review.md が出る |

各フェーズの最後に、コード生成AI自身が受け入れ基準を実行し、結果を報告してから次へ進む。
