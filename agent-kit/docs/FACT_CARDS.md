# 事実票（cleanroom-facts）の参照方法

> **重要：事実票の多くは、専門家（専門医等）の監修を受けていません。**
> 2026年11月1日時点で、公開中の事実票3,679件（取り下げ35件を含む）のうち、専門家の監修済み（`verified_expert`）は0件です。出典との照合のみ済んだもの（`verified_sources`）が341件、下書き（`draft`）が3,303件です。
> 医学的内容を含む動画は、**必ず専門家が監修したうえで制作し、監修後に配信**してください。

## 事実票とは

[hm-cmed/cleanroom-facts](https://github.com/hm-cmed/cleanroom-facts) は、医学知識を「著作権で保護される表現を含まない事実の記述」と「その出典の書誌情報」に分けて記録したデータです（クリーンルーム方式）。1枚のカードに1つの主張が書かれ、出典（DOI・PMID・URL）と監修状況が付いています。

| 項目 | 場所（cleanroom-facts 内） |
| --- | --- |
| 事実票の正本 | `data/facts/<接頭辞>.yaml`（例：`GD.yaml` は胃・十二指腸） |
| 領域の一覧 | `data/domains.yaml` |
| 出典の一覧 | `data/sources/sources.yaml` |
| カードの形式 | `schema/fact.schema.json` |
| 専門家による監修の方法 | `review/github/README.md` |

## 使い方

本レポジトリには事実票を複製していません。使うときに正本から取得します。

```powershell
pip install pyyaml
python tools/fetch_facts.py --list-domains          # 領域の一覧
python tools/fetch_facts.py GD --grep 機能性ディスペプシア
python tools/fetch_facts.py GD-001 GD-002           # カードIDを指定
python tools/fetch_facts.py GD --expert-only        # 監修済みだけ
```

取得結果は `facts_cache/*.json` に保存され、各カードに `status`（監修状況）と `expert_reviewed`（監修済みか）が付きます。ネットワークに制限がある場合は、`git clone https://github.com/hm-cmed/cleanroom-facts` したうえで `--local <フォルダ>` を付けてください。

## 台本に使うときのルール

1. 台本の各ビートに、根拠にしたカードIDを `cards` として必ず書く。
2. 字幕・ナレーションに出す数字は、根拠カードに書かれた数字だけにする。
3. `retired`（取り下げ）のカードは使わない。
4. `verified_expert` 以外のカードを使った台本は「監修前」として扱い、専門家の監修が終わるまで配信しない。
5. 動画の説明欄に、根拠カードの出典（論文名・DOI）と、監修者・監修日を記載する。

## 事実票の誤りを見つけたら

[cleanroom-facts の Issues](https://github.com/hm-cmed/cleanroom-facts/issues) から報告してください。専門家の方の監修協力も歓迎します。
