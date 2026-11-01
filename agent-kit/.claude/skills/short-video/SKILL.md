---
name: short-video
description: 1文のテーマから縦型ショート動画（1080×1920のMP4）を、事実票を根拠にHTML描画・Playwright撮影・ffmpeg合成で作る。「ショート動画」「リール」「縦型動画」を作る依頼のときに使う。
---

# short-video

この SKILL.md は雛形です。`docs/SPEC.md` のフェーズ6で、実装に合わせて完成させてください。

## 手順

1. `python pipeline/doctor.py` で環境を点検する。不足があれば導入コマンドを提示し、利用者の承認を得てから実行する。
2. テーマに関係する事実票を `python tools/fetch_facts.py <接頭辞> --grep <語>` で取得する。
3. `templates/script.example.json` の形式で台本 `out/<slug>/script.json` を作る。全ビートに根拠カードIDを付け、字幕の数字は根拠カードの数字だけにする。
4. 台本を利用者に見せて承認を得る。監修前のカードを使っている場合はその旨を明示する。
5. `pipeline/tts.py` → `pipeline/build_scene.py` → 静止画4枚を利用者に確認 → `pipeline/render.py` → `pipeline/mux.py` → `pipeline/review.py` の順に実行する。レビュー不合格ならシーンを直して再実行（最大3回）。
6. `templates/medical-review-checklist.md` から `out/<slug>/medical_review.md` を作る。
7. 最後に必ず次の文を利用者に伝える：「この動画は専門家の監修前です。専門家が監修し、medical_review.md の判定が『配信可』になるまで配信しないでください。」

## してはいけないこと

- 記憶や推測で医学的事実を書き足す
- 外部の画像・ロゴ・キャラクター・実在人物の顔、権利不明の音源・フォントを使う
- SNS へ自動投稿する
