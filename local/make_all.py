"""スタジオで書き出したシリーズ一式（cards.json と scripts/*.json）から、ナレーション入り動画をまとめて作る。
承認済みの台本だけを作る（--include-unapproved で未承認も作れる）。

  python make_all.py                 Windows の音声でナレーションを作る（Windows で実行）
  python make_all.py --tts dummy     仮の音で流れだけ確かめる（どの OS でも可）
  python make_all.py --force         作成済みの動画も作り直す
  python make_all.py --only IBS      ファイル名に IBS を含む原稿だけ作る

1本ごとの流れ: 照合 → 場面ごとの音声 → 音声の長さで場面の長さを決める → 照合（長さ）→ 映像＋音声 → MP4
出力: out/<原稿名>/<原稿名>.mp4、still_N.png（監修用の静止画）、check.json（照合結果）
照合で不合格の原稿は動画を作らず、理由を一覧に出して次の原稿へ進む。
"""
import argparse, glob, json, math, os, platform, shutil, struct, subprocess, sys, time, wave


import check
import render

ROOT = os.path.dirname(os.path.abspath(__file__))
LEAD, TAIL, LAST_TAIL, SR = 0.4, 0.5, 1.8, 48000
ORG, INCLUDE_UNAPPROVED, REVIEW = "", False, False


def tts_windows(script_path, audio_dir):
    ps = os.path.join(ROOT, "tools", "tts_windows.ps1")
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps,
                    "-Script", script_path, "-OutDir", audio_dir], check=True)


def tts_dummy(sc, audio_dir):
    # 読み上げ速度を毎秒7.5字と仮定した長さの「ポン」音（同期の確認用）
    os.makedirs(audio_dir, exist_ok=True)
    for i, s in enumerate(sc["scenes"], 1):
        n = int(len(s.get("speech", s["narration"])) / 7.5 * SR)
        fr = bytearray()
        for k in range(n):
            t = k / SR
            fr += struct.pack("<h", int(6000 * math.sin(2 * math.pi * 660 * t)) if (t % 0.5) < 0.06 else 0)
        with wave.open(os.path.join(audio_dir, f"scene_{i}.wav"), "w") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(bytes(fr))


def assemble(n_scenes, audio_dir, out_wav):
    """場面ごとの音声をつなぎ、場面の長さ（前の余白＋音声＋後の余白、1/30秒単位）を返す"""
    durs, track = [], bytearray()
    for i in range(1, n_scenes + 1):
        src, tmp = os.path.join(audio_dir, f"scene_{i}.wav"), os.path.join(audio_dir, f"_norm_{i}.wav")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", str(SR),
                        "-sample_fmt", "s16", tmp], check=True)
        with wave.open(tmp) as w:
            pcm = w.readframes(w.getnframes()); sec = w.getnframes() / SR
        os.remove(tmp)
        tail = LAST_TAIL if i == n_scenes else TAIL
        d = round((LEAD + sec + tail) * 30) / 30
        durs.append(d)
        lead = int(LEAD * SR)
        track += b"\x00\x00" * lead + pcm + b"\x00\x00" * max(0, int(d * SR) - lead - len(pcm) // 2)
    with wave.open(out_wav, "w") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(bytes(track))
    return durs


def build_one(path, cards, tts, force):
    name = os.path.splitext(os.path.basename(path))[0]
    od = os.path.join(ROOT, "out", name); mp4 = os.path.join(od, name + ".mp4")
    sc0 = json.load(open(path, encoding="utf-8"))
    if not sc0.get("approved") and not INCLUDE_UNAPPROVED:
        return name, "未承認のため飛ばしました（--include-unapproved で作成可）", None
    if not force and os.path.exists(mp4) and os.path.getmtime(mp4) > os.path.getmtime(path):
        return name, "作成済み（変更なし）", None
    os.makedirs(od, exist_ok=True)
    sc = json.load(open(path, encoding="utf-8"))
    res = check.content_checks(sc, cards)
    if check.failed(res):
        json.dump(res, open(os.path.join(od, "check.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        return name, "不合格（照合）", check.failed(res)
    audio = os.path.join(od, "audio")
    shutil.rmtree(audio, ignore_errors=True)
    if tts == "windows": tts_windows(path, audio)
    elif tts == "dummy": tts_dummy(sc, audio)
    # tts == "existing": out/<名前>/audio/scene_N.wav を自分で用意した場合
    wav = os.path.join(od, "narration.wav")
    durs = assemble(len(sc["scenes"]), audio, wav)
    res += check.timing_checks(sc, durs)
    json.dump(res, open(os.path.join(od, "check.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if check.failed(res):
        return name, "不合格（長さ・字幕の速さ）", check.failed(res)
    sc.setdefault("org", ORG); sc.setdefault("credit", "")
    render.render(sc, durs, wav, mp4, review=REVIEW, stills_dir=od)
    return name, f"完成 {sum(durs):.1f}秒", None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tts", choices=["windows", "dummy", "existing"],
                    default="windows" if platform.system() == "Windows" else "dummy")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--org", default="", help="動画の左上に出す団体名")
    ap.add_argument("--include-unapproved", action="store_true", help="未承認の台本も「監修前サンプル」付きで作る")
    ap.add_argument("--review", action="store_true", help="画面下に根拠カードの ID を出す（監修用）")
    a = ap.parse_args()
    global ORG, INCLUDE_UNAPPROVED, REVIEW
    ORG, INCLUDE_UNAPPROVED, REVIEW = a.org, a.include_unapproved, a.review
    if not shutil.which("ffmpeg"): sys.exit("ffmpeg が見つかりません（README の準備を参照）")
    cpath = os.path.join(ROOT, "cards.json")
    if not os.path.exists(cpath): sys.exit("cards.json が見つかりません（スタジオで書き出したシリーズ一式を、このフォルダに展開してください）")
    cards = {c["id"]: c for c in json.load(open(cpath, encoding="utf-8"))}
    paths = sorted(p for p in glob.glob(os.path.join(ROOT, "scripts", "*.json")) if a.only in os.path.basename(p))
    print(f"原稿 {len(paths)} 本 / 音声: {a.tts}")
    log = []
    for p in paths:
        t0 = time.time()
        try:
            name, status, why = build_one(p, cards, a.tts, a.force)
        except Exception as e:  # 1本の失敗で全体を止めない
            name, status, why = os.path.basename(p), "エラー", [("", str(e), False, "")]
        print(f"  {name}: {status}（{time.time() - t0:.0f}秒）")
        for x in why or []: print(f"      × 場面{x[0]} {x[1]} {x[3]}")
        log.append({"name": name, "status": status, "problems": [list(x) for x in (why or [])]})
    os.makedirs(os.path.join(ROOT, "out"), exist_ok=True)
    json.dump(log, open(os.path.join(ROOT, "out", "summary.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("一覧: out/summary.json")


if __name__ == "__main__":
    main()
