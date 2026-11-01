# 第三者のソフトウェア・素材・参考資料

`agent-kit/` には、以下のものを**一切同梱していません**。利用者が各自でリンク先からライセンス・利用規約を確認し、入手してください。ここに記載したライセンスの種類は作成時点（2026年11月）の参考情報であり、正確な条件は必ずリンク先の最新情報で確認してください。

## 実行に必要なソフトウェア（各自インストール）

| 名称 | 用途 | ライセンス（参考） | 入手先 |
| --- | --- | --- | --- |
| Python | パイプライン本体 | PSF License | https://www.python.org/ |
| Node.js | Claude Code 等の実行環境 | MIT License | https://nodejs.org/ |
| Playwright（Python版）＋Chromium | HTMLを1コマずつ撮影 | Apache License 2.0 | https://playwright.dev/python/ |
| FFmpeg / ffprobe | エンコード・音声合成・音量正規化・検査 | LGPL 2.1以降（ビルドによりGPL） | https://ffmpeg.org/ |
| VOICEVOX | 日本語ナレーション（ローカルTTS） | ソフトウェア本体と**音声ライブラリ（キャラクター）ごとに別の利用規約** | https://voicevox.hiroshiba.jp/ |
| PyYAML / Pillow / NumPy / requests | 補助ライブラリ | 各プロジェクトのライセンス | PyPI 各ページ |

FFmpeg・VOICEVOX等のバイナリは再配布せず、各自のPCにインストールして呼び出す設計です。

## 素材（各自が権利を確認して `assets/` に置く）

| 種類 | 注意点 | 例 |
| --- | --- | --- |
| 日本語フォント | MITではなく各フォントのライセンス（例：SIL Open Font License）に従う | Noto Sans JP（https://fonts.google.com/noto/specimen/Noto+Sans+JP） |
| 音声（VOICEVOX） | 多くの音声ライブラリは動画内または説明欄へのクレジット表記（例：「VOICEVOX:キャラクター名」）を求める。商用可否も音声ライブラリごとに異なる | 各キャラクターの利用規約ページ |
| BGM・効果音 | 商用利用・改変・クレジットの条件を確認。権利不明の音源は使わない | 各配布サイトの規約 |
| 画像・アイコン | 他人の画像、ロゴ、既存キャラクター、実在人物の顔は使わない | — |

`assets/` 配下はリポジトリに含めない設定（`.gitignore`）になっています。使った素材の出典は、各自のPCで `assets/LICENSES.md` に記録してください。

## 事実票（医学的内容）

| 名称 | 内容 | 場所 |
| --- | --- | --- |
| cleanroom-facts | 著作権で保護される表現を含まない医学の事実票と出典の記録。**多くは専門家の監修前** | https://github.com/hm-cmed/cleanroom-facts |

事実票は本レポジトリに複製せず、上記リポジトリから参照します（[docs/FACT_CARDS.md](docs/FACT_CARDS.md)）。事実票の利用条件は、上記リポジトリの記載に従ってください。

## 設計の参考にした公開資料（リンクのみ。コードは複製していません）

`agent-kit/` の設計（スキル＋HTML描画＋Playwright＋ffmpeg、コンタクトシートによる自己点検）は、以下の公開資料の考え方を参考にし、仕様から独自に書き起こしました。

- claude-motion-design — https://github.com/howseen-ai/claude-motion-design
- Motion Video Director — https://github.com/Miftahul-Islam-Efaz/Motion-graphics-skill
- Make videos with Claude — https://awesomeclaude.ai/claude-video
- Remotion Agent Skills — https://www.remotion.dev/docs/ai/skills （Remotion は独自ライセンスで、組織規模により有償ライセンスが必要な場合があります。`agent-kit/` は Remotion に依存していません）
- Agent Skills（SKILL.md）の仕組み — https://docs.claude.com/

これらのリポジトリのコードを利用する場合は、それぞれのライセンスに従ってください。
