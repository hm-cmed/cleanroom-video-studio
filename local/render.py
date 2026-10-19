"""映像の組み立て：原稿（JSON）と場面の長さから縦型動画を作り、ナレーション音声を重ねて MP4 にする。
Windows・Mac・Linux で動く（フォントは自動で探す）。"""
import os, re, subprocess
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1080, 1920, 30
_CANDS = {
    "black": ["/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc", "C:/Windows/Fonts/YuGothB.ttc",
              "C:/Windows/Fonts/meiryob.ttc", "/System/Library/Fonts/ヒラギノ角ゴシック W8.ttc"],
    "bold": ["/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", "C:/Windows/Fonts/YuGothB.ttc",
             "C:/Windows/Fonts/meiryob.ttc", "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"],
    "reg": ["/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "C:/Windows/Fonts/YuGothR.ttc",
            "C:/Windows/Fonts/meiryo.ttc", "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc"],
}
def _find(k):
    for p in _CANDS[k]:
        if os.path.exists(p): return p
    raise FileNotFoundError("日本語フォントが見つかりません: " + k)
BLACK, BOLD, REG = _find("black"), _find("bold"), _find("reg")
def F(path, size): return ImageFont.truetype(path, size, index=0)

BG = (247, 244, 238); INK = (30, 42, 50); GREY = (107, 118, 128); ACC = (31, 122, 140); ACC2 = (224, 122, 95)
LIGHT = (226, 238, 240); WHITE = (255, 255, 255)
sc = None; scenes = None; REVIEW = True

def wrap(text, font, maxw, draw):
    lines, cur = [], ""
    for ch in text:
        if ch == "\n": lines.append(cur); cur = ""; continue
        if draw.textlength(cur + ch, font=font) > maxw and cur:
            # 行頭禁則（句読点・閉じ括弧を行頭に置かない）
            if ch in "、。」）」！？":
                cur += ch; lines.append(cur); cur = ""; continue
            lines.append(cur); cur = ch
        else:
            cur += ch
    if cur: lines.append(cur)
    return lines

# ---------- イラスト（2倍で描いて縮小） ----------
def canvas():
    im = Image.new("RGBA", (1200, 1200), (0, 0, 0, 0)); return im, ImageDraw.Draw(im)

def ill_question(s=None):
    im, d = canvas()
    d.rounded_rectangle((180, 260, 760, 1000), 48, fill=WHITE, outline=INK, width=10)
    d.rounded_rectangle((360, 210, 580, 310), 30, fill=ACC, outline=INK, width=10)
    f = F(BOLD, 64); d.text((470, 400), "検査結果", font=f, fill=INK, anchor="mm")
    for y in (520, 620, 720):
        d.line((260, y, 520, y), fill=(190, 198, 204), width=12)
        d.text((640, y), "✓", font=F(BOLD, 60), fill=ACC, anchor="mm")
    d.text((470, 880), "異常なし", font=F(BOLD, 76), fill=ACC, anchor="mm")
    d.ellipse((720, 300, 1080, 660), fill=ACC2)
    d.text((900, 470), "？", font=F(BLACK, 240), fill=WHITE, anchor="mm")
    return im

def ill_gutbrain(s=None):
    im, d = canvas()
    # 脳
    d.ellipse((380, 90, 820, 430), fill=LIGHT, outline=ACC, width=12)
    for k in range(4):
        x = 450 + k * 95
        d.arc((x - 60, 150, x + 60, 300), 200, 340, fill=ACC, width=10)
        d.arc((x - 60, 250, x + 60, 400), 20, 160, fill=ACC, width=10)
    d.text((600, 470), "脳", font=F(BOLD, 70), fill=INK, anchor="mm")
    # 腸
    d.rounded_rectangle((330, 720, 870, 1080), 120, fill=LIGHT, outline=ACC, width=12)
    for k in range(3):
        y = 800 + k * 90
        d.arc((410, y - 40, 790, y + 60), 0, 180, fill=ACC, width=10)
    d.text((600, 1135), "腸", font=F(BOLD, 70), fill=INK, anchor="mm")
    # 双方向の矢印
    for x, up in ((520, True), (680, False)):
        for y in range(540, 690, 34):
            d.line((x, y, x, y + 18), fill=ACC2, width=14)
        if up: d.polygon([(x, 515), (x - 34, 565), (x + 34, 565)], fill=ACC2)
        else: d.polygon([(x, 715), (x - 34, 665), (x + 34, 665)], fill=ACC2)
    return im

def ill_calendar(s=None):
    im, d = canvas()
    d.rounded_rectangle((170, 200, 1030, 1060), 40, fill=WHITE, outline=INK, width=10)
    d.rounded_rectangle((170, 200, 1030, 340), 40, fill=ACC)
    d.rectangle((170, 300, 1030, 340), fill=ACC)
    d.text((600, 270), "1か月", font=F(BOLD, 70), fill=WHITE, anchor="mm")
    marked = {(1, 1), (3, 2), (5, 3)}
    for r in range(5):
        for c in range(7):
            x = 230 + c * 113; y = 400 + r * 128
            if (c, r) in marked:
                d.ellipse((x - 4, y - 4, x + 84, y + 84), fill=ACC2)
            else:
                d.rounded_rectangle((x + 14, y + 14, x + 66, y + 66), 10, fill=(232, 228, 220))
    return im

def ill_check(s=None):
    im, d = canvas()
    pts = ((s or {}).get("points") or ["", "", ""])[:3]
    for k, t in enumerate(pts):
        col = ACC2 if k == len(pts) - 1 else ACC
        y = 180 + k * 340
        d.rounded_rectangle((150, y, 1050, y + 220), 110, fill=WHITE, outline=col, width=12)
        d.ellipse((190, y + 40, 330, y + 180), fill=col)
        d.text((260, y + 110), "✓", font=F(BOLD, 90), fill=WHITE, anchor="mm")
        d.text((700, y + 110), t, font=F(BOLD, 58), fill=INK, anchor="mm")
        if k < len(pts) - 1:
            d.polygon([(600, y + 300), (560, y + 250), (640, y + 250)], fill=GREY)
    return im

def ill_doctor(s=None):
    im, d = canvas()
    # 医療機関の建物（赤十字に似た十字は使わない）
    d.polygon([(200, 430), (600, 200), (1000, 430)], fill=ACC)
    d.rectangle((250, 430, 950, 1000), fill=WHITE, outline=INK, width=10)
    for r in range(2):
        for c in range(3):
            x = 320 + c * 210; y = 500 + r * 170
            d.rounded_rectangle((x, y, x + 140, y + 110), 14, fill=LIGHT, outline=ACC, width=6)
    d.rounded_rectangle((520, 840, 680, 1000), 12, fill=ACC2)
    d.text((600, 1090), (s or {}).get("label") or "専門医に相談", font=F(BOLD, 64), fill=INK, anchor="mm")
    return im

def ill_big(s=None):
    im, d = canvas(); t = str((s or {}).get("big") or "？")
    d.ellipse((180, 140, 1020, 980), fill=LIGHT, outline=ACC, width=14)
    size = 260 if len(t) <= 3 else 190 if len(t) <= 5 else 140
    d.text((600, 570), t, font=F(BLACK, size), fill=ACC2, anchor="mm")
    if (s or {}).get("label"): d.text((600, 1080), s["label"], font=F(BOLD, 64), fill=INK, anchor="mm")
    return im

def ill_people(s=None):
    im, d = canvas(); m = re.search(r"(\d+)\s*/\s*(\d+)", str((s or {}).get("ratio") or "3/10")); k = min(10, int(m.group(1))) if m else 3
    for i in range(10):
        x = 200 + (i % 5) * 200; y = 330 + (i // 5) * 420; col = ACC2 if i < k else (201, 211, 214)
        d.ellipse((x - 62, y - 62, x + 62, y + 62), fill=col); d.rounded_rectangle((x - 80, y + 80, x + 80, y + 300), 70, fill=col)
    if m: d.text((600, 1130), (s or {}).get("label") or f"{m.group(2)}人に{m.group(1)}人", font=F(BOLD, 64), fill=INK, anchor="mm")
    return im

def ill_compare(s=None):
    im, d = canvas(); p = ((s or {}).get("points") or ["", ""]) + ["", ""]
    for col, mark, t, x in ((ACC, "○", p[0], 330), (ACC2, "×", p[1], 870)):
        d.rounded_rectangle((x - 250, 200, x + 250, 1000), 40, fill=WHITE, outline=col, width=12)
        d.text((x, 420), mark, font=F(BLACK, 240), fill=col, anchor="mm")
        for i, ln in enumerate(wrap(t, F(BOLD, 56), 420, d)[:4]):
            d.text((x, 700 + i * 70), ln, font=F(BOLD, 56), fill=INK, anchor="mm")
    return im

ILL = {"question": ill_question, "gutbrain": ill_gutbrain, "brain_gut": ill_gutbrain, "calendar": ill_calendar, "check": ill_check,
       "checklist": ill_check, "doctor": ill_doctor, "consult": ill_doctor, "big_number": ill_big, "people": ill_people, "compare": ill_compare}

# ---------- 場面ごとの静的レイヤ ----------
def base_layer(i):
    im = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(im)
    d.text((60, 90), sc.get("org", ""), font=F(BOLD, 40), fill=INK)
    if not sc.get("approved"):
        d.rounded_rectangle((760, 80, 1020, 146), 33, outline=ACC2, width=4)
        d.text((890, 113), "監修前サンプル", font=F(BOLD, 32), fill=ACC2, anchor="mm")
    d.rounded_rectangle((60, 190, 60 + d.textlength(sc.get("disease", ""), font=F(BOLD, 40)) + 60, 262), 36, fill=ACC)
    d.text((90, 226), sc.get("disease", ""), font=F(BOLD, 40), fill=WHITE, anchor="lm")
    # 進行バー
    n = len(scenes); seg = (W - 120 - (n - 1) * 12) / n
    for k in range(n):
        x = 60 + k * (seg + 12)
        d.rounded_rectangle((x, 1790, x + seg, 1802), 6, fill=ACC if k <= i else (220, 216, 208))
    s = scenes[i]
    if REVIEW and s["cards"]:
        d.text((60, 1840), "根拠カード：" + "、".join(s["cards"]), font=F(REG, 30), fill=GREY)
    if s["kind"] == "closing":
        f = F(REG, 28)
        for k, line in enumerate([x for x in sc.get("source_line", "").split("\n") + [sc.get("ai_notice", ""), sc.get("credit", "")] if x]):
            d.text((60, 1640 + k * 42), line, font=f, fill=GREY)
    return im

def caption_layer(i):
    s = scenes[i]; im = Image.new("RGBA", (W, 330), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    f = F(BLACK, 92); lines = s["caption"].split("\n")
    for k, line in enumerate(lines):
        y = 165 + (k - (len(lines) - 1) / 2) * 120
        d.text((W / 2, y), line, font=f, fill=INK, anchor="mm")
    return im

def subtitle_layer(i):
    s = scenes[i]; im = Image.new("RGBA", (W, 300), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    f = F(BOLD, 46); lines = wrap(s["narration"], f, W - 170, d)
    h = len(lines) * 66 + 50
    d.rounded_rectangle((60, 0, W - 60, h), 28, fill=(255, 255, 255, 235))
    for k, line in enumerate(lines):
        d.text((W / 2, 25 + 33 + k * 66), line, font=f, fill=INK, anchor="mm")
    return im

def ease(t): return 1 - (1 - min(max(t, 0), 1)) ** 3


def ease(t): return 1 - (1 - min(max(t, 0), 1)) ** 3

def render(script, durations, wav, out_mp4, review=True, stills_dir=None):
    """script: 原稿の辞書, durations: 場面ごとの秒数, wav: ナレーション音声（なければ None）"""
    global sc, scenes, REVIEW
    sc, scenes, REVIEW = script, script["scenes"], review
    for s_, d_ in zip(scenes, durations): s_["dur"] = d_
    unknown = [s["visual"] for s in scenes if s["visual"] not in ILL]
    if unknown: raise ValueError(f"未登録の絵: {unknown}（使える絵: {list(ILL)}）")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-"]
    if wav: cmd += ["-i", wav]
    cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20"]
    if wav: cmd += ["-c:a", "aac", "-b:a", "160k", "-shortest"]
    cmd += ["-movflags", "+faststart", out_mp4]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i, s in enumerate(scenes):
        base = base_layer(i); cap = caption_layer(i); sub = subtitle_layer(i)
        ill = ILL[s["visual"]](s).resize((600, 600), Image.LANCZOS)
        for t in range(round(s["dur"] * FPS)):
            sec = t / FPS
            fr = base.copy()
            a = ease(sec / 0.5); sc_ = 0.85 + 0.15 * a
            il = ill.resize((int(600 * sc_), int(600 * sc_)), Image.BILINEAR)
            il.putalpha(il.getchannel("A").point(lambda v: int(v * a)))
            fr.paste(il, (int((W - il.width) / 2), int(330 + (600 - il.height) / 2)), il)
            b = ease((sec - 0.2) / 0.5)
            c2 = cap.copy(); c2.putalpha(c2.getchannel("A").point(lambda v: int(v * b)))
            fr.paste(c2, (0, int(960 + 40 * (1 - b))), c2)
            e = ease((sec - 0.5) / 0.5)
            s2 = sub.copy(); s2.putalpha(s2.getchannel("A").point(lambda v: int(v * e)))
            fr.paste(s2, (0, 1330 if s["kind"] != "closing" else 1320), s2)
            ff.stdin.write(fr.tobytes())
            if stills_dir and t == int(1.5 * FPS): fr.save(os.path.join(stills_dir, f"still_{i+1}.png"))
    ff.stdin.close()
    if ff.wait() != 0: raise RuntimeError("ffmpeg が失敗しました")
