/* 動画の描画と書き出し。1080×1920・30fps。音声を先に作り、その長さで場面の長さを決める（音声先行） */
(function () {
  const W = 1080, H = 1920, FPS = 30;
  const LEAD = 0.4, TAIL = 0.5, LAST_TAIL = 1.8, CPS_EST = 7.5;
  const C = { bg: "#F7F4EE", ink: "#1E2A32", grey: "#6B7680", acc: "#1F7A8C", acc2: "#E07A5F", light: "#E2EEF0", white: "#FFFFFF", track: "#DCD8D0" };
  const FONT = '"Zen Kaku Gothic New","BIZ UDPGothic","Hiragino Sans","Yu Gothic",sans-serif';
  const f = (w, s) => w + " " + s + "px " + FONT;

  const customImages = {}; // name -> HTMLImageElement（利用者が追加した SVG）

  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  function txt(ctx, s, x, y, font, color, align) {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || "center"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y);
  }
  function wrap(ctx, text, font, maxw) {
    ctx.font = font; const lines = []; let cur = "";
    for (const ch of String(text)) {
      if (ch === "\n") { lines.push(cur); cur = ""; continue; }
      if (ctx.measureText(cur + ch).width > maxw && cur) {
        if ("、。」）！？".includes(ch)) { lines.push(cur + ch); cur = ""; continue; }
        lines.push(cur); cur = ch;
      } else cur += ch;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  /* ---------- 挿絵（1200×1200 の座標で描く） ---------- */
  const ILL = {
    question(ctx, s) {
      ctx.lineWidth = 10; ctx.strokeStyle = C.ink;
      rr(ctx, 180, 260, 580, 740, 48); ctx.fillStyle = C.white; ctx.fill(); ctx.stroke();
      rr(ctx, 360, 210, 220, 100, 30); ctx.fillStyle = C.acc; ctx.fill(); ctx.stroke();
      txt(ctx, s.label || "検査結果", 470, 400, f(700, 64), C.ink);
      for (const y of [520, 620, 720]) {
        ctx.strokeStyle = "#BEC6CC"; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(260, y); ctx.lineTo(520, y); ctx.stroke();
        txt(ctx, "✓", 640, y, f(700, 60), C.acc);
      }
      txt(ctx, s.sub || "異常なし", 470, 880, f(700, 72), C.acc);
      ctx.beginPath(); ctx.arc(900, 480, 180, 0, Math.PI * 2); ctx.fillStyle = C.acc2; ctx.fill();
      txt(ctx, "？", 900, 490, f(900, 230), C.white);
    },
    brain_gut(ctx) {
      ctx.lineWidth = 12; ctx.strokeStyle = C.acc; ctx.fillStyle = C.light;
      ctx.beginPath(); ctx.ellipse(600, 260, 220, 170, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 10;
      for (let k = 0; k < 4; k++) { const x = 450 + k * 95; ctx.beginPath(); ctx.arc(x, 225, 60, Math.PI * 1.15, Math.PI * 1.9); ctx.stroke(); ctx.beginPath(); ctx.arc(x, 325, 60, Math.PI * 0.1, Math.PI * 0.85); ctx.stroke(); }
      txt(ctx, "脳", 600, 470, f(700, 70), C.ink);
      ctx.lineWidth = 12; rr(ctx, 330, 720, 540, 360, 120); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 10;
      for (let k = 0; k < 3; k++) { const y = 810 + k * 90; ctx.beginPath(); ctx.ellipse(600, y, 190, 50, 0, 0, Math.PI); ctx.stroke(); }
      txt(ctx, "腸", 600, 1135, f(700, 70), C.ink);
      ctx.fillStyle = C.acc2; ctx.strokeStyle = C.acc2; ctx.lineWidth = 14;
      for (const [x, up] of [[520, true], [680, false]]) {
        for (let y = 540; y < 690; y += 34) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 18); ctx.stroke(); }
        ctx.beginPath();
        if (up) { ctx.moveTo(x, 515); ctx.lineTo(x - 34, 565); ctx.lineTo(x + 34, 565); }
        else { ctx.moveTo(x, 715); ctx.lineTo(x - 34, 665); ctx.lineTo(x + 34, 665); }
        ctx.fill();
      }
    },
    calendar(ctx, s) {
      ctx.lineWidth = 10; ctx.strokeStyle = C.ink;
      rr(ctx, 170, 200, 860, 860, 40); ctx.fillStyle = C.white; ctx.fill(); ctx.stroke();
      rr(ctx, 170, 200, 860, 140, 40); ctx.fillStyle = C.acc; ctx.fill(); ctx.fillRect(170, 300, 860, 40);
      txt(ctx, s.label || "1か月", 600, 270, f(700, 70), C.white);
      const n = Math.max(0, Math.min(35, parseInt(s.marks || 3, 10)));
      const marked = new Set(); const step = Math.max(1, Math.floor(35 / Math.max(1, n)));
      for (let i = 0; i < n; i++) marked.add((i * step + 8) % 35);
      for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) {
        const x = 230 + c * 113, y = 400 + r * 128, idx = r * 7 + c;
        if (marked.has(idx)) { ctx.beginPath(); ctx.arc(x + 40, y + 40, 44, 0, Math.PI * 2); ctx.fillStyle = C.acc2; ctx.fill(); }
        else { rr(ctx, x + 14, y + 14, 52, 52, 10); ctx.fillStyle = "#E8E4DC"; ctx.fill(); }
      }
    },
    checklist(ctx, s) {
      const pts = (s.points && s.points.length ? s.points : ["", "", ""]).slice(0, 3);
      pts.forEach((t, k) => {
        const y = 180 + k * 340, col = k === pts.length - 1 ? C.acc2 : C.acc;
        ctx.lineWidth = 12; ctx.strokeStyle = col; rr(ctx, 150, y, 900, 220, 110); ctx.fillStyle = C.white; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(260, y + 110, 70, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
        txt(ctx, "✓", 260, y + 115, f(700, 90), C.white);
        const lines = wrap(ctx, t, f(700, 58), 640);
        lines.slice(0, 2).forEach((ln, i) => txt(ctx, ln, 700, y + 110 + (i - (Math.min(2, lines.length) - 1) / 2) * 68, f(700, 58), C.ink));
        if (k < pts.length - 1) { ctx.beginPath(); ctx.moveTo(600, y + 300); ctx.lineTo(560, y + 250); ctx.lineTo(640, y + 250); ctx.fillStyle = C.grey; ctx.fill(); }
      });
    },
    consult(ctx, s) {
      ctx.beginPath(); ctx.moveTo(200, 430); ctx.lineTo(600, 200); ctx.lineTo(1000, 430); ctx.fillStyle = C.acc; ctx.fill();
      ctx.lineWidth = 10; ctx.strokeStyle = C.ink; ctx.fillStyle = C.white; ctx.fillRect(250, 430, 700, 570); ctx.strokeRect(250, 430, 700, 570);
      ctx.lineWidth = 6; ctx.strokeStyle = C.acc;
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { const x = 320 + c * 210, y = 500 + r * 170; rr(ctx, x, y, 140, 110, 14); ctx.fillStyle = C.light; ctx.fill(); ctx.stroke(); }
      rr(ctx, 520, 840, 160, 160, 12); ctx.fillStyle = C.acc2; ctx.fill();
      txt(ctx, s.label || "専門医に相談", 600, 1090, f(700, 64), C.ink);
    },
    big_number(ctx, s) {
      ctx.beginPath(); ctx.arc(600, 560, 420, 0, Math.PI * 2); ctx.fillStyle = C.light; ctx.fill();
      ctx.lineWidth = 14; ctx.strokeStyle = C.acc; ctx.stroke();
      const t = String(s.big || "？"); const size = t.length <= 3 ? 260 : t.length <= 5 ? 190 : 140;
      txt(ctx, t, 600, 570, f(900, size), C.acc2);
      if (s.label) txt(ctx, s.label, 600, 1080, f(700, 64), C.ink);
    },
    people(ctx, s) {
      const m = String(s.ratio || "3/10").match(/(\d+)\s*\/\s*(\d+)/); const k = m ? Math.min(10, +m[1]) : 3;
      for (let i = 0; i < 10; i++) {
        const x = 200 + (i % 5) * 200, y = 330 + Math.floor(i / 5) * 420, col = i < k ? C.acc2 : "#C9D3D6";
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 62, 0, Math.PI * 2); ctx.fill();
        rr(ctx, x - 80, y + 80, 160, 220, 70); ctx.fill();
      }
      txt(ctx, s.label || (m ? m[2] + "人に" + m[1] + "人" : ""), 600, 1130, f(700, 64), C.ink);
    },
    compare(ctx, s) {
      const p = s.points || ["", ""];
      [[C.acc, "○", p[0], 330], [C.acc2, "×", p[1], 870]].forEach(([col, mark, t, x]) => {
        ctx.lineWidth = 12; ctx.strokeStyle = col; rr(ctx, x - 250, 200, 500, 800, 40); ctx.fillStyle = C.white; ctx.fill(); ctx.stroke();
        txt(ctx, mark, x, 420, f(900, 260), col);
        wrap(ctx, t || "", f(700, 56), 420).slice(0, 4).forEach((ln, i) => txt(ctx, ln, x, 700 + i * 70, f(700, 56), C.ink));
      });
    }
  };
  ILL.gutbrain = ILL.brain_gut; ILL.check = ILL.checklist; ILL.doctor = ILL.consult;

  function drawIll(ctx, scene) {
    const off = document.createElement("canvas"); off.width = 1200; off.height = 1200;
    const o = off.getContext("2d");
    const name = scene.visual;
    if (customImages[name]) o.drawImage(customImages[name], 0, 0, 1200, 1200);
    else (ILL[name] || ILL.question)(o, scene);
    return off;
  }

  function ease(t) { t = Math.min(Math.max(t, 0), 1); return 1 - Math.pow(1 - t, 3); }

  /* 1枚の場面の静的な素材をまとめて作っておく */
  function prepare(ep, opt) {
    const sc = ep.script, scenes = sc.scenes;
    return scenes.map((s, i) => ({ ill: drawIll(null, s), i, s }));
  }

  function drawFrame(ctx, ep, opt, prep, i, t) {
    const sc = ep.script, scenes = sc.scenes, s = scenes[i];
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "alphabetic";
    txt(ctx, opt.org || "", 60, 113, f(700, 40), C.ink, "left");
    if (!opt.approved) {
      ctx.lineWidth = 4; ctx.strokeStyle = C.acc2; rr(ctx, 760, 80, 260, 66, 33); ctx.stroke();
      txt(ctx, "監修前サンプル", 890, 114, f(700, 32), C.acc2);
    }
    if (sc.disease) {
      ctx.font = f(700, 40); const w = ctx.measureText(sc.disease).width + 60;
      rr(ctx, 60, 190, w, 72, 36); ctx.fillStyle = C.acc; ctx.fill();
      txt(ctx, sc.disease, 90, 227, f(700, 40), C.white, "left");
    }
    // 挿絵
    const a = ease(t / 0.5), scl = 0.85 + 0.15 * a, size = 600 * scl;
    ctx.globalAlpha = a; ctx.drawImage(prep[i].ill, (W - size) / 2, 330 + (600 - size) / 2, size, size); ctx.globalAlpha = 1;
    // 大見出し
    const b = ease((t - 0.2) / 0.5); const lines = String(s.caption || "").split("\n");
    ctx.globalAlpha = b;
    lines.forEach((ln, k) => txt(ctx, ln, W / 2, 960 + 40 * (1 - b) + 165 + (k - (lines.length - 1) / 2) * 120, f(900, 92), C.ink));
    ctx.globalAlpha = 1;
    // 字幕
    const e = ease((t - 0.5) / 0.5);
    if (s.narration) {
      const sl = wrap(ctx, s.narration, f(700, 46), W - 170); const h = sl.length * 66 + 50; const y0 = 1330;
      ctx.globalAlpha = e; rr(ctx, 60, y0, W - 120, h, 28); ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.fill();
      sl.forEach((ln, k) => txt(ctx, ln, W / 2, y0 + 58 + k * 66, f(700, 46), C.ink));
      ctx.globalAlpha = 1;
    }
    // 進行バー
    const n = scenes.length, seg = (W - 120 - (n - 1) * 12) / n;
    for (let k = 0; k < n; k++) { rr(ctx, 60 + k * (seg + 12), 1790, seg, 12, 6); ctx.fillStyle = k <= i ? C.acc : C.track; ctx.fill(); }
    if (opt.review && s.cards && s.cards.length) txt(ctx, "根拠カード：" + s.cards.join("、"), 60, 1855, f(400, 30), C.grey, "left");
    if (s.kind === "closing") {
      const extra = String(sc.source_line || "").split("\n").concat([opt.aiNotice || ""]);
      if (opt.credit) extra.push(opt.credit);
      extra.filter(Boolean).forEach((ln, k) => txt(ctx, ln, 60, 1600 + k * 40, f(400, 27), C.grey, "left"));
    }
  }

  function estDur(s) { return String(s.speech || s.narration || "").length / CPS_EST; }

  function durations(ep, audio) {
    const n = ep.script.scenes.length;
    return ep.script.scenes.map((s, i) => {
      const sec = audio && audio[i] ? audio[i].duration : estDur(s);
      return Math.round((LEAD + sec + (i === n - 1 ? LAST_TAIL : TAIL)) * FPS) / FPS;
    });
  }

  /* 時刻 t（秒）にあたる場面と場面内の経過時間 */
  function locate(durs, t) {
    let acc = 0;
    for (let i = 0; i < durs.length; i++) { if (t < acc + durs[i]) return [i, t - acc]; acc += durs[i]; }
    return [durs.length - 1, durs[durs.length - 1]];
  }

  async function ensureFonts() {
    if (!document.fonts) return;
    try { await Promise.all(["900 92px", "700 46px", "400 30px"].map((w) => document.fonts.load(w + ' "Zen Kaku Gothic New"', "検査あ"))); } catch (e) { /* 代わりのフォントで描く */ }
  }

  /* プレビュー再生 */
  function Player(canvas) {
    const ctx = canvas.getContext("2d"); canvas.width = W; canvas.height = H;
    let raf = 0, ep = null, opt = {}, prep = null, durs = [], start = 0, audio = null, actx = null, srcs = [];
    function frameAt(t) { const [i, tt] = locate(durs, t); drawFrame(ctx, ep, opt, prep, i, tt); return i; }
    function stopAudio() { srcs.forEach((s) => { try { s.stop(); } catch (e) { } }); srcs = []; }
    return {
      async load(e, o, au) { this.stop(); await ensureFonts(); ep = e; opt = o; audio = au; prep = prepare(ep, opt); durs = durations(ep, audio); frameAt(1.5); return durs; },
      total() { return durs.reduce((a, b) => a + b, 0); },
      show(i) { if (!ep) return; let acc = 0; for (let k = 0; k < i; k++) acc += durs[k]; frameAt(acc + 1.5); },
      play(onEnd) {
        if (!ep) return; this.stop();
        if (audio && audio.some(Boolean)) {
          actx = actx || new (window.AudioContext || window.webkitAudioContext)();
          let acc = 0; const t0 = actx.currentTime + 0.1;
          durs.forEach((d, i) => { if (audio[i]) { const s = actx.createBufferSource(); s.buffer = audio[i]; s.connect(actx.destination); s.start(t0 + acc + LEAD); srcs.push(s); } acc += d; });
        }
        start = performance.now() + 100; const total = this.total();
        const loop = () => { const t = (performance.now() - start) / 1000; frameAt(Math.max(0, t)); if (t < total) raf = requestAnimationFrame(loop); else onEnd && onEnd(); };
        raf = requestAnimationFrame(loop);
      },
      stop() { cancelAnimationFrame(raf); stopAudio(); }
    };
  }

  function pickMime() {
    const c = ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    if (!window.MediaRecorder) return null;
    return c.find((m) => MediaRecorder.isTypeSupported(m)) || "";
  }

  /* 書き出し（実時間で録画する。録画中はタブを前面に出しておく） */
  async function record(ep, opt, audio, onProgress) {
    await ensureFonts();
    const mime = pickMime(); if (mime === null) throw new Error("このブラウザは動画の書き出し（MediaRecorder）に対応していません。Chrome か Edge の最新版を使ってください。");
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d"); const prep = prepare(ep, opt); const durs = durations(ep, audio); const total = durs.reduce((a, b) => a + b, 0);
    drawFrame(ctx, ep, opt, prep, 0, 0);
    const vstream = canvas.captureStream(FPS);
    const actx = new (window.AudioContext || window.webkitAudioContext)(); await actx.resume();
    const dest = actx.createMediaStreamDestination();
    const osc = actx.createConstantSource ? actx.createConstantSource() : null; // 無音でも音声トラックを保つ
    if (osc) { const g = actx.createGain(); g.gain.value = 0; osc.connect(g); g.connect(dest); osc.start(); }
    const stream = new MediaStream([...vstream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, Object.assign({ videoBitsPerSecond: 6000000 }, mime ? { mimeType: mime } : {}));
    const chunks = []; rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise((res) => { rec.onstop = res; });
    rec.start(500);
    const t0 = actx.currentTime + 0.15; let acc = 0;
    durs.forEach((d, i) => { if (audio && audio[i]) { const s = actx.createBufferSource(); s.buffer = audio[i]; s.connect(dest); s.start(t0 + acc + LEAD); } acc += d; });
    await new Promise((res) => {
      const loop = () => {
        const t = actx.currentTime - t0;
        const [i, tt] = locate(durs, Math.max(0, t)); drawFrame(ctx, ep, opt, prep, i, tt);
        onProgress && onProgress(Math.min(1, t / total));
        if (t < total + 0.2) requestAnimationFrame(loop); else res();
      };
      requestAnimationFrame(loop);
    });
    rec.stop(); await done; if (osc) osc.stop(); actx.close();
    const type = (mime || "video/webm").split(";")[0];
    return { blob: new Blob(chunks, { type }), ext: type.includes("mp4") ? "mp4" : "webm", seconds: total };
  }

  /* 音声の用意 */
  async function decodeFiles(files) {
    const actx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 48000, 48000);
    const out = [];
    for (const fl of files) {
      if (!fl) { out.push(null); continue; }
      const buf = await fl.arrayBuffer(); out.push(await actx.decodeAudioData(buf.slice(0)));
    }
    return out;
  }

  async function googleTTS(ep, key, voice, rate) {
    const actx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 48000, 48000);
    const out = [];
    for (const s of ep.script.scenes) {
      const r = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize?key=" + encodeURIComponent(key), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: { text: s.speech || s.narration }, voice: { languageCode: "ja-JP", name: voice }, audioConfig: { audioEncoding: "MP3", speakingRate: rate || 1.0 } })
      });
      if (!r.ok) throw new Error("音声合成に失敗しました（" + r.status + "）。API キーと、Text-to-Speech API が有効になっているかを確認してください。");
      const j = await r.json(); const bin = Uint8Array.from(atob(j.audioContent), (ch) => ch.charCodeAt(0));
      out.push(await actx.decodeAudioData(bin.buffer));
    }
    return out;
  }

  function addCustomVisual(name, svgText) {
    return new Promise((res, rej) => {
      if (!/^\s*<svg[\s>]/i.test(svgText) || /<script|on\w+\s*=|<foreignObject|href\s*=\s*["']?(?!#)/i.test(svgText)) {
        rej(new Error("SVG として使えないか、安全でない要素（script、外部参照など）が含まれています。")); return;
      }
      const img = new Image();
      img.onload = () => { customImages[name] = img; res(img); };
      img.onerror = () => rej(new Error("SVG を読み込めませんでした。<svg …>…</svg> の全体を貼り付けてください。"));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
    });
  }

  window.CRVS_RENDER = { W, H, FPS, LEAD, TAIL, LAST_TAIL, ILL, Player, record, durations, decodeFiles, googleTTS, addCustomVisual, pickMime, estDur };
})();
