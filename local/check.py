"""原稿の自動照合（ルール照合）。本番ではこれに加えて別のAIによる意味の照合を行う。
content_checks: 音声を作る前に行う照合（根拠カード・数字・禁止表現など）
timing_checks : 音声の長さが決まった後に行う照合（全体の長さ・字幕の速さ）"""
import re

BANNED = ["治る", "完治", "必ず", "効く", "特効", "あなたは", "診断します", "アコチアミド", "ラモセトロン", "リナクロチド",
          "エロビキシバット", "リファキシミン", "ルビプロストン", "アミトリプチリン", "ミルタザピン"]
MAX_CPS = 6.5
SOFT = {"監修状態"}  # 人の承認で解消する項目（不合格扱いにしない）


def _corpus(cards, ids):
    t = ""
    for i in ids:
        a = cards[i]["assertion"]
        t += a["plain_statement_ja"] + str(a.get("condition")) + str(a.get("common_misconception"))
    return t


def content_checks(sc, cards):
    r = []
    for n, s in enumerate(sc["scenes"], 1):
        text = s["narration"]
        for i in s["cards"]:
            r.append((n, "カード番号の存在", i in cards, i))
            if i in cards:
                st = cards[i]["publication_info"]["status"]
                r.append((n, "監修状態", st == "verified", f"{i}: {st}"))
        if s["kind"] != "closing":
            r.append((n, "根拠カードあり", len(s["cards"]) > 0, ",".join(s["cards"])))
        if s["cards"] and all(i in cards for i in s["cards"]):
            cp = _corpus(cards, s["cards"])
            for num in re.findall(r"\d+", text):
                r.append((n, "数字の裏づけ", num in cp, num))
        if s["kind"] == "misconception":
            mis = [cards[i]["assertion"]["common_misconception"] for i in s["cards"] if i in cards]
            r.append((n, "誤解の欄に対応", any(m for m in mis), " / ".join(map(str, mis))))
        hit = [b for b in BANNED if b in text + s["caption"] + s.get("speech", "")]
        r.append((n, "禁止表現なし", not hit, ",".join(hit) or "—"))
        if "基準" in text or "目安" in text:
            r.append((n, "基準の明示（Rome V／日本GL）", "Rome V" in text or "ガイドライン" in text, ""))
    r.append(("全体", "出典・AI表示あり", bool(sc.get("source_line")) and "AI" in sc.get("ai_notice", ""), ""))
    r.append(("全体", "締めの定型文あり", sc["scenes"][-1]["kind"] == "closing", ""))
    return r


def timing_checks(sc, durs):
    r = []
    for n, (s, d) in enumerate(zip(sc["scenes"], durs), 1):
        cps = len(s["narration"]) / d
        r.append((n, f"字幕の速さ≤{MAX_CPS}字/秒", cps <= MAX_CPS, f"{cps:.1f}字/秒"))
    total = round(sum(durs), 2)
    r.append(("全体", "長さ30〜60秒", 30 <= total <= 60, f"{total}秒"))
    return r


def failed(results):
    return [x for x in results if not x[2] and x[1] not in SOFT]
