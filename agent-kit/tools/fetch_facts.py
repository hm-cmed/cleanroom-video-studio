"""事実票（hm-cmed/cleanroom-facts）を取得し、台本づくりに使いやすい形で書き出す。

事実票は本リポジトリに複製せず、利用時に正本から取得する。
取得したカードには監修状況（status）を必ず残し、監修前のカードには警告を付ける。

使い方（PowerShell）:
    python tools/fetch_facts.py --list-domains
    python tools/fetch_facts.py GD                     # 胃・十二指腸の全カード
    python tools/fetch_facts.py GD --grep 機能性ディスペプシア
    python tools/fetch_facts.py GD-001 GD-002          # カードIDを指定
    python tools/fetch_facts.py GD --local ../cleanroom-facts   # 手元のクローンを使う

出力: facts_cache/<名前>.json（台本の根拠として読み込む）と、画面への一覧表示。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    sys.exit("PyYAML が必要です: pip install pyyaml")

REPO = "hm-cmed/cleanroom-facts"
BRANCH = "main"
RAW = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}"
CARD_URL = f"https://github.com/{REPO}/blob/{BRANCH}/data/facts/{{prefix}}.yaml"

STATUS_NOTE = {
    "verified_expert": "専門家の監修済み",
    "verified_sources": "出典照合のみ（専門家の監修は未実施）",
    "draft": "下書き（出典照合も未完了・専門家の監修は未実施）",
    "retired": "取り下げ（使用不可）",
}
WARNING = (
    "注意: 事実票の多くは専門家の監修を受けていません。"
    "医学的内容を含む動画は、必ず専門家が監修したうえで制作・配信してください。"
)


def read_text(rel: str, local: Path | None) -> str:
    if local:
        return (local / rel).read_text(encoding="utf-8")
    try:
        with urllib.request.urlopen(f"{RAW}/{rel}", timeout=30) as r:
            return r.read().decode("utf-8")
    except OSError as e:
        sys.exit(
            f"取得できませんでした（{e}）。\n"
            f"ネットワークを確認するか、git clone https://github.com/{REPO} したうえで "
            "--local <クローンしたフォルダ> を付けて実行してください。"
        )


def load_domain(prefix: str, local: Path | None) -> list[dict]:
    return yaml.safe_load(read_text(f"data/facts/{prefix}.yaml", local)) or []


def simplify(card: dict) -> dict:
    pub = card.get("publication_info", {})
    prov = card.get("provenance", {})
    status = pub.get("status", "draft")
    prefix = card["id"].split("-")[0]
    return {
        "id": card["id"],
        "status": status,
        "status_note": STATUS_NOTE.get(status, status),
        "expert_reviewed": status == "verified_expert",
        "statement": card.get("assertion", {}).get("plain_statement_ja", ""),
        "common_misconception": card.get("assertion", {}).get("common_misconception"),
        "subdomain": card.get("subdomain"),
        "source": prov.get("source"),
        "doi": prov.get("doi"),
        "url": prov.get("url"),
        "card_url": CARD_URL.format(prefix=prefix),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("targets", nargs="*", help="領域の接頭辞（例 GD）またはカードID（例 GD-001）")
    ap.add_argument("--grep", help="本文・小領域に含まれる語で絞り込む")
    ap.add_argument("--expert-only", action="store_true", help="専門家の監修済みカードだけにする")
    ap.add_argument("--local", type=Path, help="cleanroom-facts の手元のクローンを使う")
    ap.add_argument("--out", type=Path, default=Path("facts_cache"))
    ap.add_argument("--list-domains", action="store_true", help="領域の一覧を表示する")
    a = ap.parse_args()

    if a.list_domains:
        for d in yaml.safe_load(read_text("data/domains.yaml", a.local)):
            print(f"{d['prefix']:3} {d['field']}／{d['name']}")
        return
    if not a.targets:
        ap.error("領域の接頭辞かカードIDを指定してください（--list-domains で一覧）")

    ids = [t for t in a.targets if re.fullmatch(r"[A-Z]{2}-\d{3}", t)]
    prefixes = sorted({t for t in a.targets if re.fullmatch(r"[A-Z]{2}", t)} | {i[:2] for i in ids})

    cards = []
    for p in prefixes:
        for c in load_domain(p, a.local):
            if ids and c["id"] not in ids and p not in a.targets:
                continue
            cards.append(simplify(c))

    cards = [c for c in cards if c["status"] != "retired"]
    if a.grep:
        cards = [c for c in cards if a.grep in (c["statement"] or "") or a.grep in (c["subdomain"] or "")]
    if a.expert_only:
        cards = [c for c in cards if c["expert_reviewed"]]

    a.out.mkdir(exist_ok=True)
    name = "_".join(a.targets) + (f"_{a.grep}" if a.grep else "")
    name = re.sub(r'[\\/:*?"<>|\s]', "_", name)
    payload = {"source_repository": f"https://github.com/{REPO}", "warning": WARNING, "cards": cards}
    path = a.out / f"{name}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    reviewed = sum(c["expert_reviewed"] for c in cards)
    print(WARNING)
    print(f"取得 {len(cards)} 件（うち専門家監修済み {reviewed} 件） → {path}")
    for c in cards[:30]:
        mark = "監修済" if c["expert_reviewed"] else "未監修"
        print(f"  [{mark}] {c['id']} {c['statement'][:50]}")
    if len(cards) > 30:
        print(f"  …ほか {len(cards) - 30} 件")


if __name__ == "__main__":
    main()
