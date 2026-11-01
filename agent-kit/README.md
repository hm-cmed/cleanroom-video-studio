# agent-kit：コード生成AIで自分専用の動画制作パイプラインを作る（上級）

ブラウザ版のスタジオでは足りないとき（もっと凝った動きの図、語ごとに同期する字幕、高音質のナレーション、自動レビューを入れたいとき）に使うキットです。**このフォルダをコード生成AI（Claude Code、Codex 等）に渡すと、AIが仕様に沿って自分のPC上に制作パイプラインを実装します。**

動画をAIの動画生成モデルで作るのではなく、「HTMLで描いたアニメーションを1コマずつ撮影し、ffmpegで動画にする」仕組みです。同じ入力からは同じ映像が出ます。

> [!CAUTION]
> **参照する事実票の多くは、専門家（専門医等）の監修を受けていません。**
> 医学的内容を含む動画は、**必ず専門家が監修したうえで制作し、監修が完了したものだけを配信してください。**
> 本レポジトリの利用により生じたいかなる不利益についても、**責任は利用者にあり、提供者は一切の責任を負いません**（[../DISCLAIMER.md](../DISCLAIMER.md)）。

## 流れ

```
1文のテーマ → 事実票の取得 → 台本（人が確認） → 日本語ナレーション → HTMLのシーンと字幕
→ 静止画4枚（人が確認） → 全フレーム撮影 → 音声合成・音量正規化 → 自動レビュー
→ 動画・字幕・サムネ・監修記録 → 専門家の監修（配信の条件）
```

- 字幕のセーフゾーン、字幕と音声のずれ、音量（−14 LUFS）を機械で検査し、自動で直す
- 必要なソフトはすべて無料で、各自のPCにインストールして使う

## 使い方

### 1. ダウンロードする

レポジトリのトップで「Code」→「Download ZIP」を押して展開するか、次を実行します。

```powershell
git clone https://github.com/hm-cmed/cleanroom-video-studio
cd cleanroom-video-studio\agent-kit
```

### 2. コード生成AIに渡す

`agent-kit` フォルダで Claude Code（または Codex 等）を起動し、次の文を貼り付けます。

```
AGENTS.md を読み、そこに書かれた順に docs/SPEC.md、docs/FACT_CARDS.md、
../DISCLAIMER.md、THIRD_PARTY.md を読んでください。
私の環境は Windows 11 / PowerShell です（違う場合は書き換えてください）。
不明点があれば実装前に質問し、docs/SPEC.md 第9章のフェーズ0から順に実装してください。
インストールが必要なときは、実行前に必ず私の承認を取ってください。
```

完成後は、次の1行で動画を作れます。

```
/short-video "テーマを1文で"
```

### 3. 素材を自分で用意する

フォント・BGM・効果音・音声ライブラリは、権利の都合でレポジトリに含めていません。[THIRD_PARTY.md](THIRD_PARTY.md) のリンク先でライセンスを確認し、`assets/` に置いてください。

### 4. 専門家の監修を受けてから配信する

動画を書き出すと `out/<slug>/medical_review.md`（監修記録）ができます。専門家が確認し、判定が「配信可」になるまで配信しないでください。ブラウザ版のスタジオの「監修・監査」「公開」の工程と記録様式も使えます。

## 事実票（医学的内容の根拠）

医学的な主張は、[hm-cmed/cleanroom-facts](https://github.com/hm-cmed/cleanroom-facts) の事実票を根拠にします。

```powershell
pip install pyyaml
python tools/fetch_facts.py --list-domains           # 領域の一覧（消化器・循環器・呼吸器 ほか）
python tools/fetch_facts.py GD --grep 機能性ディスペプシア
```

取得したカードには監修状況が付き、監修前のカードには警告が表示されます。2026年11月1日時点で、専門家の監修済み（`verified_expert`）のカードは0件です。詳しくは [docs/FACT_CARDS.md](docs/FACT_CARDS.md)。

## フォルダ

| 場所 | 中身 |
| --- | --- |
| `AGENTS.md` / `CLAUDE.md` | コード生成AI向けの作業ルール |
| `docs/SPEC.md` | 実装仕様（工程・品質基準・実装フェーズ） |
| `docs/FACT_CARDS.md` | 事実票の参照方法と注意 |
| `tools/fetch_facts.py` | 事実票の取得 |
| `templates/` | 台本の見本、専門家の監修記録の雛形 |
| `.claude/skills/short-video/` | Claude Code 用スキルの雛形 |
| `THIRD_PARTY.md` | 第三者のソフトウェア・素材・参考資料（リンクのみ） |
| `assets/` | 素材置き場（中身はレポジトリに含めない） |

ライセンス・助成・開発者は、レポジトリ直下の [README](../README.md) と同じです（プログラムは MIT License、説明文は CC BY 4.0）。
