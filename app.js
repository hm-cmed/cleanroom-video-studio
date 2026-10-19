/* クリーンルーム動画スタジオ 本体 */
(function () {
  const CFG = window.CRVS_CONFIG, P = window.CRVS_PROMPTS, R = window.CRVS_RENDER, SAMPLE = window.CRVS_SAMPLE;
  const KEY = "crvs.project.v1";
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => new Date().toISOString().slice(0, 10);

  const DEFAULT_BANNED = ["治る", "完治", "必ず", "効く", "特効", "あなたは", "診断します", "絶対", "100%安全"];
  const STEPS = [
    { id: "intro", t: "はじめに", s: "仕組みとルール" },
    { id: "plan", t: "企画", s: "誰に何を伝えるか" },
    { id: "cards", t: "事実カード", s: "根拠をそろえる" },
    { id: "series", t: "シリーズ構成", s: "回ごとにカードを割り当て" },
    { id: "script", t: "台本", s: "AIで書いて自動照合" },
    { id: "review", t: "監修", s: "専門家が承認" },
    { id: "video", t: "動画", s: "音声と映像を作る" },
    { id: "publish", t: "公開", s: "説明文と最終確認" },
    { id: "ai", t: "AIに頼む", s: "コード生成AIの案内", sep: true }
  ];

  function fresh() {
    return {
      v: 1, step: "intro",
      project: {
        seriesTitle: "", org: "", supervisor: "", domain: "", prefix: "", topics: "", audience: "public",
        minSec: 30, maxSec: 60, banned: DEFAULT_BANNED.slice(), aiNotice: "原稿はAIが作成し、監修者が確認しました",
        credit: true, os: "Windows", email: "", sourcesHint: "", cardTarget: 20, disclaimer: "個別の医療相談にはお答えできません。症状が続くときは医療機関を受診してください。"
      },
      cards: [], episodes: [], custom: {}, tts: { mode: "none", voice: "ja-JP-Neural2-B", rate: 1.0 },
      ui: { scriptTab: {}, aiTool: "claude", aiTask: "batch", chatTool: "claude" }
    };
  }
  let S = load() || fresh();
  const audioStore = {}; // 回の id → 場面ごとの AudioBuffer（保存しない）
  let apiKey = "";
  let player = null;

  function load() { try { const t = localStorage.getItem(KEY); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
  let saveTimer = 0;
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }, 300); }

  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 2600); }
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); toast("コピーしました"); }
    catch (e) {
      const pre = btn && btn.closest(".prompt") && btn.closest(".prompt").querySelector("pre");
      if (pre) { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      toast("自動でコピーできませんでした。選択した文を Ctrl+C（⌘+C）でコピーしてください");
    }
  }
  function download(name, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || "text/plain;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    toast(name + " を保存します。保存が始まらない場合は、公開版（GitHub Pages）で開いてください");
  }
  function hash(o) { const s = JSON.stringify(o); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16); }
  const cardMap = () => Object.fromEntries(S.cards.map((c) => [c.id, c]));
  const toHalf = (s) => String(s).replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

  /* ---------- 事実カードの読み込みと点検 ---------- */
  function parseCards(text) {
    text = String(text || "").trim(); if (!text) throw new Error("貼り付けた内容が空です。");
    let data = null;
    const fence = [...text.matchAll(/```(?:yaml|yml|json)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
    const bodies = fence.length ? fence : [text];
    const out = [];
    for (const b of bodies) {
      try { data = JSON.parse(b); }
      catch (e) {
        if (!window.jsyaml) throw new Error("YAML を読む部品を読み込めませんでした。JSON で貼り付けるか、インターネットにつながる環境で開いてください。");
        try { data = window.jsyaml.load(b); } catch (e2) { continue; }
      }
      if (data && !Array.isArray(data) && Array.isArray(data.cards)) data = data.cards;
      if (Array.isArray(data)) out.push(...data.filter((x) => x && typeof x === "object" && x.id));
    }
    if (!out.length) throw new Error("事実カードが見つかりませんでした。YAML か JSON のカードの並び（- id: … で始まるもの）を貼り付けてください。");
    return out;
  }
  function cardIssues(c, ids) {
    const e = [], w = [];
    const a = c.assertion || {}, p = c.provenance || {}, pub = c.publication_info || {};
    if (!/^[A-Z]{2,4}-\d{3}$/.test(c.id || "")) e.push("ID の形（例 AB-001）");
    if (ids && ids.filter((x) => x === c.id).length > 1) e.push("ID の重複");
    if (!a.plain_statement_ja || a.plain_statement_ja.length < 10) e.push("主張文がない");
    if (!p.source) e.push("出典がない");
    if (p.legal_basis === "E") e.push("legal_basis E（教育例外）は使わない");
    if (!["OPEN", "RESTRICTED", "GOV_JP", "GOV_US", "UNKNOWN"].includes(p.source_class)) e.push("source_class の値");
    if (/\[\d+\]/.test(JSON.stringify(c))) e.push("脚注番号 [n] が残っている");
    if (/要確認/.test(a.plain_statement_ja || "")) w.push("主張文に「要確認」");
    if (pub.status === "verified_expert" && !pub.verifier) e.push("verified_expert なのに verifier が空");
    if (!a.common_misconception) w.push("よくある誤解が空（問いかけの場面に使えない）");
    if (/二次資料/.test(String(c.uncertainty || ""))) w.push("二次資料経由の数値");
    if (p.source_class === "UNKNOWN") w.push("ライセンス未確認");
    if (pub.status !== "verified_sources" && pub.status !== "verified_expert") w.push("文献照合前（draft）");
    return { e, w };
  }

  /* ---------- 台本の自動照合（ルール） ---------- */
  function runChecks(ep) {
    const pj = S.project, cm = cardMap(), sc = ep.script, res = [];
    if (!sc || !Array.isArray(sc.scenes)) return [{ n: "全体", k: "台本の形", ok: false, d: "scenes がありません" }];
    const durs = R.durations(ep, audioStore[ep.id]);
    sc.scenes.forEach((s, i) => {
      const n = i + 1, text = toHalf(s.narration || ""), ids = s.cards || [];
      if (!s.narration) res.push({ n, k: "字幕あり", ok: false, d: "narration が空" });
      ids.forEach((id) => {
        res.push({ n, k: "カードの存在", ok: !!cm[id], d: id });
        if (cm[id]) {
          const st = (cm[id].publication_info || {}).status;
          res.push({ n, k: "カードの照合状態", ok: st === "verified_sources" || st === "verified_expert", d: id + "：" + st, soft: true });
        }
      });
      if (s.kind !== "closing") res.push({ n, k: "根拠カードあり", ok: ids.length > 0, d: ids.join("、") || "なし" });
      const corpus = toHalf(ids.filter((id) => cm[id]).map((id) => { const a = cm[id].assertion; return a.plain_statement_ja + JSON.stringify(a.condition || "") + (a.common_misconception || ""); }).join(" "));
      (text.match(/\d+(?:\.\d+)?/g) || []).forEach((num) => res.push({ n, k: "数字の裏づけ", ok: corpus.includes(num), d: num }));
      if (s.kind === "misconception") res.push({ n, k: "誤解の欄に対応", ok: ids.some((id) => cm[id] && cm[id].assertion.common_misconception), d: "" });
      const hit = (pj.banned || []).filter((b) => b && (s.narration + (s.caption || "") + (s.speech || "")).includes(b));
      res.push({ n, k: "禁止表現なし", ok: !hit.length, d: hit.join("、") || "—" });
      if (/基準|目安/.test(text)) res.push({ n, k: "基準の名前を明示", ok: /Rome|ガイドライン|基準\s*（|GL/.test(text) || !!sc.standard && text.includes(String(sc.standard).replace(/（.*$/, "")), d: "" });
      const cps = (s.narration || "").length / durs[i];
      res.push({ n, k: "字幕の速さ（6.5字/秒以下）", ok: cps <= 6.5, d: cps.toFixed(1) + "字/秒" });
      if (s.visual && !R.ILL[s.visual] && !S.custom[s.visual]) res.push({ n, k: "絵の種類", ok: false, d: s.visual + " は未登録" });
    });
    const total = durs.reduce((a, b) => a + b, 0);
    res.push({ n: "全体", k: "長さ（" + pj.minSec + "〜" + pj.maxSec + "秒）", ok: total >= pj.minSec && total <= pj.maxSec, d: total.toFixed(1) + "秒" + (audioStore[ep.id] ? "" : "（推定）") });
    res.push({ n: "全体", k: "出典の表示", ok: !!sc.source_line, d: "" });
    res.push({ n: "全体", k: "締めの場面", ok: sc.scenes.length > 0 && sc.scenes[sc.scenes.length - 1].kind === "closing", d: "" });
    return res;
  }
  const hardFail = (r) => r.filter((x) => !x.ok && !x.soft);

  /* ---------- AI を使わない下書き ---------- */
  function draftScript(ep) {
    const cm = cardMap(), cs = ep.cards.map((id) => cm[id]).filter(Boolean);
    if (!cs.length) return null;
    const first = cs.find((c) => c.assertion.common_misconception) || cs[0];
    const mis = first.assertion.common_misconception || "";
    const sent = (t) => String(t).split("。")[0] + "。";
    const scenes = [{ visual: "question", caption: (ep.title || "よくある誤解").slice(0, 20), narration: mis ? "「" + mis + "」と思っていませんか？" : "", speech: mis ? mis + "と思っていませんか？" : "", cards: [first.id], kind: "misconception" }];
    cs.forEach((c) => scenes.push({ visual: "checklist", points: [], caption: String(c.subdomain || "").slice(0, 10), narration: sent(c.assertion.plain_statement_ja), speech: sent(c.assertion.plain_statement_ja), cards: [c.id], kind: "fact" }));
    scenes.push({ visual: "consult", label: "専門医に相談", caption: "気になるときは\n医療機関へ", narration: "症状が続くときは、医療機関に相談してください。", speech: "症状が続くときは、医療機関に相談してください。", cards: [], kind: "closing" });
    const src = [...new Set(cs.map((c) => (c.provenance.source || "").split(".")[0]))].slice(0, 2).join("／");
    return { theme: ep.title, disease: S.project.domain || "", standard: "", scenes, source_line: "出典：" + src, description: "" };
  }

  /* ---------- シリーズの自動構成 ---------- */
  function autoPlan(per) {
    per = per || 3; const groups = {};
    S.cards.forEach((c) => { const k = c.subdomain || "その他"; (groups[k] = groups[k] || []).push(c.id); });
    const eps = []; let n = 1;
    Object.entries(groups).forEach(([k, ids]) => { for (let i = 0; i < ids.length; i += per) eps.push({ id: "ep" + String(n++).padStart(2, "0"), title: k, cards: ids.slice(i, i + per), script: null, checks: [], semantic: "", approval: {} }); });
    return eps;
  }

  /* ---------- 画面 ---------- */
  function stepDone(id) {
    if (id === "intro") return S.ui.seenIntro;
    if (id === "plan") return !!(S.project.seriesTitle && S.project.org && S.project.domain);
    if (id === "cards") return S.cards.length > 0;
    if (id === "series") return S.episodes.length > 0 && S.episodes.every((e) => e.cards.length);
    if (id === "script") return S.episodes.length > 0 && S.episodes.every((e) => e.script && !hardFail(runChecks(e)).length);
    if (id === "review") return S.episodes.length > 0 && S.episodes.every(approved);
    return false;
  }
  function approved(ep) { return !!(ep.approval && ep.approval.approved && ep.script && ep.approval.hash === hash(ep.script)); }

  function renderNav() {
    $("#steps").innerHTML = STEPS.map((s, i) => (s.sep ? "<hr>" : "") +
      `<button type="button" data-go="${s.id}" ${S.step === s.id ? 'aria-current="step"' : ""} data-done="${stepDone(s.id) ? 1 : 0}">
        <span class="no">${s.id === "ai" ? "AI" : i}</span><span class="lbl">${esc(s.t)}<small>${esc(s.s)}</small></span></button>`).join("");
  }
  function renderFooter() {
    const g = CFG.grants.map((x) => `<li><strong>${esc(x.funder)}</strong>${x.title ? "「" + esc(x.title) + "」" : ""}${x.number ? "（" + esc(x.number) + "）" : ""}</li>`).join("");
    $("#footer").innerHTML = `<p>本ツールの開発は、次の助成を受けて行いました。</p><ul style="margin:0;padding-left:1.2em">${g}</ul>
      <p>開発：${esc(CFG.developer)}　｜　プログラム：${esc(CFG.license.code)}、説明文と見本データ：${esc(CFG.license.content)}　｜　<a href="${esc(CFG.repository)}" target="_blank" rel="noopener">ソースコード</a>　｜　v${esc(CFG.version)}</p>
      <p>本ツールは制作の手順を支援するもので、医学的内容の正確さを保証しません。公開する内容の最終判断は、各団体の監修者が行ってください。</p>`;
  }

  const V = {};
  V.intro = () => `
  <section class="panel">
    <h2>医療の短い動画を、根拠をたどれる形で作る</h2>
    <p class="lead">論文やガイドラインの文章をそのまま使わず、事実と数値だけを「事実カード」に書き出し、そのカードだけを根拠に台本を作る方法です（クリーンルーム方式）。台本のどの文がどのカードにもとづくかが残るので、監修と訂正がしやすく、著作権の問題も避けられます。</p>
    <div class="flow">
      <div><b>1 企画</b>誰に何を伝えるか<br><span class="chip who">あなた</span></div>
      <div><b>2 事実カード</b>出典を調べて命題にする<br><span class="chip info who">チャットAI＋あなた</span></div>
      <div><b>3 シリーズ構成</b>回ごとにカードを割り当て<br><span class="chip who">自動＋あなた</span></div>
      <div><b>4 台本</b>カードだけを根拠に書く<br><span class="chip info who">チャットAI</span></div>
      <div><b>照合</b>根拠・数字・禁止表現<br><span class="chip ok who">自動</span></div>
      <div><b>5 監修</b>専門家が承認<br><span class="chip warn who">監修者</span></div>
      <div><b>6 動画</b>音声の長さに合わせて描画<br><span class="chip ok who">自動</span></div>
      <div><b>7 公開</b>説明文・AI表示・出典<br><span class="chip who">あなた</span></div>
    </div>
  </section>
  <section class="panel">
    <h3>守るルール</h3>
    <ol style="margin:0;padding-left:1.4em;max-width:72ch">
      <li>論文やガイドラインの文章・表・図を写さない。事実と数値だけを自分の言葉で書く。</li>
      <li>数値は一次資料で確かめたものだけ。二次資料から取ったものはそう書いておく。</li>
      <li>文献番号（DOI・PMID）やライセンスは、確かめられたものだけを書く。</li>
      <li>台本の各場面には、根拠のカードIDを付ける。カードにない数字は足さない。</li>
      <li>公開は、監修者が承認した動画だけ。AIで作ったことと出典を必ず示す。</li>
      <li>一般向けでは薬の名前を出さず、実在の人物の映像や声を使わない。</li>
    </ol>
  </section>
  <section class="panel quiet">
    <h3>まず見本で試す</h3>
    <p class="lead">日本神経消化器病学会の広報用に作った事実カード6件と台本1本を読み込みます。各工程の画面がどう埋まるかを確かめてから、自分の企画に切り替えてください。</p>
    <div class="row"><button class="b primary" data-act="load-sample" type="button">見本を読み込む</button>
    <button class="b" data-go="plan" type="button">自分の企画から始める</button></div>
    <p class="muted" style="font-size:.85rem">作業の内容はこのブラウザに自動で保存されます。別のパソコンで続けるときは、右上の「作業を保存（ファイル）」を使ってください。</p>
  </section>`;

  const fld = (path, label, help, type, extra) => {
    const val = get(path);
    if (type === "textarea") return `<label class="f">${label}${help ? `<span class="h">${help}</span>` : ""}<textarea id="${path}" data-bind="${path}" ${extra || ""}>${esc(val)}</textarea></label>`;
    return `<label class="f">${label}${help ? `<span class="h">${help}</span>` : ""}<input id="${path}" type="${type || "text"}" data-bind="${path}" value="${esc(val)}" ${extra || ""}></label>`;
  };
  const sel = (path, label, opts, help) => `<label class="f">${label}${help ? `<span class="h">${help}</span>` : ""}<select id="${path}" data-bind="${path}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(get(path)) === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
  function get(path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), S); }
  function set(path, v) { const ks = path.split("."); const last = ks.pop(); const o = ks.reduce((o, k) => o[k], S); o[last] = v; }

  V.plan = () => `
  <section class="panel">
    <h2>企画</h2>
    <p class="lead">シリーズの名前、発信する団体、視聴者を決めます。ここで決めた内容は、AI への依頼文や動画の表示に自動で入ります。</p>
    <div class="grid2">
      ${fld("project.seriesTitle", "シリーズの名前", "例：おなかの不調、それって気のせい？")}
      ${fld("project.org", "発信する団体名", "動画の左上に出ます")}
      ${fld("project.domain", "領域・病名", "例：過敏性腸症候群（IBS）。動画の病名ラベルにも使います")}
      ${fld("project.supervisor", "監修者（氏名・所属）", "説明文と承認記録に入ります")}
      ${sel("project.audience", "視聴者", [["public", "一般の人（患者・家族）"], ["student", "医療系の学生"], ["pro", "医療者"]])}
      ${fld("project.prefix", "事実カードの ID の頭文字", "英大文字2〜4字。例：IBS、NG", "text", 'maxlength="4"')}
      ${fld("project.minSec", "1本の長さ（最短・秒）", "", "number", 'min="10" max="180"')}
      ${fld("project.maxSec", "1本の長さ（最長・秒）", "", "number", 'min="10" max="180"')}
    </div>
    ${fld("project.topics", "扱うテーマ", "1行に1つ。事実カードの調査依頼に使います", "textarea")}
    <div class="grid2">
      ${fld("project.aiNotice", "AI で作ったことの表示", "動画の最後と説明文に入ります")}
      ${fld("project.disclaimer", "説明文に入れる注意書き", "")}
    </div>
    ${fld("project.bannedText", "使わない言葉", "読点（、）で区切る。台本の照合で使います。一般向けでは薬の名前も入れてください", "textarea", 'style="min-height:70px"')}
    <div class="row">
      <label class="f" style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="project.credit" data-bind="project.credit" ${S.project.credit ? "checked" : ""}> 動画の最後に「${esc(CFG.videoCredit)}」を小さく入れる</label>
    </div>
    <div class="row"><button class="b primary" data-go="cards" type="button">事実カードへ進む</button></div>
  </section>`;

  V.cards = () => {
    const ids = S.cards.map((c) => c.id);
    const rows = S.cards.map((c) => {
      const { e, w } = cardIssues(c, ids);
      const st = e.length ? `<span class="chip ng">要修正 ${e.length}</span>` : w.length ? `<span class="chip warn">注意 ${w.length}</span>` : `<span class="chip ok">OK</span>`;
      return `<tr><td class="mono">${esc(c.id)}</td><td>${st}</td><td style="min-width:260px">${esc(c.assertion && c.assertion.plain_statement_ja)}<div class="muted" style="font-size:.8rem">${esc([...e, ...w].join("／"))}</div></td><td>${esc(c.assertion && c.assertion.common_misconception)}</td><td><span class="chip">${esc(c.provenance && c.provenance.source_class)}</span><div class="muted" style="font-size:.8rem">${esc((c.provenance && c.provenance.source || "").slice(0, 60))}</div></td><td><button class="b small" data-act="del-card" data-id="${esc(c.id)}" type="button">削除</button></td></tr>`;
    }).join("");
    const errN = S.cards.filter((c) => cardIssues(c, ids).e.length).length;
    return `
  <section class="panel">
    <h2>事実カード</h2>
    <p class="lead">動画の根拠になる「事実の札」です。1枚に1つの命題と、その出典を書きます。既にカードがあれば読み込み、なければチャットAI に調査を頼みます。</p>
    <div class="tabs" role="tablist">
      ${[["ai", "AI に調査を頼む"], ["paste", "貼り付け・ファイル"], ["sample", "見本"]].map(([k, t]) => `<button role="tab" type="button" data-act="cards-tab" data-tab="${k}" aria-selected="${(S.ui.cardsTab || "ai") === k}">${t}</button>`).join("")}
    </div>
    ${(S.ui.cardsTab || "ai") === "ai" ? `
      <ol style="margin:0;padding-left:1.4em;max-width:72ch">
        <li>下の依頼文をコピーし、ウェブ検索ができるチャットAI（Claude、ChatGPT、Gemini など）に貼り付けて送ります。</li>
        <li>返ってきた答えを全部コピーし、「貼り付け・ファイル」のタブに貼ります。</li>
        <li>自動の点検で「要修正」が出たら、AI に直すよう頼むか、手で直します。</li>
      </ol>
      ${promptBox(P.research(projectForPrompt()), "research")}
      <p class="note warn">チャットAI は、存在しない論文や数字を作ることがあります。カードは必ず人が出典で確かめ、公開前に「AIに頼む」→「文献番号とライセンスの照合」も行ってください。</p>` : ""}
    ${(S.ui.cardsTab || "ai") === "paste" ? `
      <label class="f">AI の答え、または YAML／JSON のカード<span class="h">\`\`\`yaml … \`\`\` の囲みごと貼り付けて構いません</span><textarea id="cards-paste" class="mono tall" placeholder="- id: IBS-001&#10;  domain: IBS&#10;  ..."></textarea></label>
      <div class="row"><button class="b primary" data-act="cards-import" type="button">読み込む（同じIDは置き換え）</button>
      <label class="b" for="cards-file">ファイルから読み込む</label><input id="cards-file" type="file" accept=".yaml,.yml,.json,.md,.txt" hidden></div>` : ""}
    ${(S.ui.cardsTab || "ai") === "sample" ? `<p>見本の事実カード6件（過敏性腸症候群と機能性ディスペプシア、Rome V）を加えます。</p><div class="row"><button class="b primary" data-act="load-sample" type="button">見本を読み込む</button></div>` : ""}
  </section>
  <section class="panel">
    <div class="row" style="justify-content:space-between"><h3>読み込んだカード <span class="num muted">${S.cards.length}件</span></h3>
      <div class="row">${errN ? `<span class="chip ng">要修正 ${errN}件</span>` : S.cards.length ? '<span class="chip ok">形式の点検は合格</span>' : ""}
      <button class="b small" data-act="cards-export" type="button" ${S.cards.length ? "" : "disabled"}>cards.json を書き出す</button></div></div>
    ${S.cards.length ? `<div class="tablewrap"><table><thead><tr><th>ID</th><th>点検</th><th>主張文</th><th>よくある誤解</th><th>出典</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<p class="muted">まだカードがありません。上の方法のどれかで読み込んでください。</p>`}
    ${S.cards.length ? `<div class="row"><button class="b primary" data-go="series" type="button">シリーズ構成へ進む</button></div>` : ""}
  </section>`;
  };

  V.series = () => {
    const cm = cardMap();
    const eps = S.episodes.map((ep, i) => `
      <div class="ep">
        <div class="hd"><div class="row" style="flex:1;min-width:0"><span class="chip">第${i + 1}回</span>
          <input type="text" id="ep-title-${ep.id}" data-ep="${ep.id}" data-epf="title" value="${esc(ep.title)}" style="flex:1;min-width:180px" aria-label="回の題"></div>
          <button class="b small" data-act="ep-del" data-id="${ep.id}" type="button">この回を削除</button></div>
        <div class="cardlist">${S.cards.map((c) => `<label class="cardpick"><input type="checkbox" data-act="ep-card" data-ep="${ep.id}" data-id="${esc(c.id)}" ${ep.cards.includes(c.id) ? "checked" : ""}>${esc(c.id)}</label>`).join("")}</div>
        <p class="muted" style="font-size:.85rem">${ep.cards.map((id) => cm[id] ? esc(id + "：" + (cm[id].assertion.common_misconception || cm[id].assertion.plain_statement_ja).slice(0, 40)) : "").join("<br>") || "カードを選んでください"}</p>
      </div>`).join("");
    return `
  <section class="panel">
    <h2>シリーズ構成</h2>
    <p class="lead">1本の動画で扱うカードは2〜3枚が目安です。自動で小見出しごとに分けたあと、題やカードを手で直せます。</p>
    <div class="row"><button class="b" data-act="auto-plan" type="button" ${S.cards.length ? "" : "disabled"}>カードから自動で構成する</button>
    <button class="b" data-act="ep-add" type="button">回を1つ追加</button></div>
    ${S.episodes.length ? eps : '<p class="muted">まだ回がありません。</p>'}
    ${S.episodes.length ? '<div class="row"><button class="b primary" data-go="script" type="button">台本へ進む</button></div>' : ""}
  </section>`;
  };

  function promptBox(text, key) {
    return `<div class="prompt"><pre id="prompt-${key}">${esc(text)}</pre><div class="row"><button class="b primary small" data-act="copy" data-src="prompt-${key}" type="button">依頼文をコピー</button><span class="muted" style="font-size:.8rem">${text.length.toLocaleString()}字</span></div></div>`;
  }
  function projectForPrompt() {
    return Object.assign({}, S.project, { sourceRepo: CFG.sourceRepository, repo: CFG.repository, ttsPlan: S.tts.mode === "google" ? "Google Cloud Text-to-Speech" : "" });
  }

  function checksHtml(ep) {
    const r = ep.script ? runChecks(ep) : [];
    if (!r.length) return "";
    const bad = hardFail(r), soft = r.filter((x) => !x.ok && x.soft);
    return `<details ${bad.length ? "open" : ""}><summary>${bad.length ? `<span class="chip ng">自動照合：不合格 ${bad.length}件</span>` : '<span class="chip ok">自動照合：合格</span>'} ${soft.length ? `<span class="chip warn">確認 ${soft.length}件</span>` : ""}</summary>
      <ul class="checks">${r.filter((x) => !x.ok).map((x) => `<li>${x.soft ? "△" : "×"} 場面${esc(x.n)}　${esc(x.k)}　<span class="muted">${esc(x.d)}</span></li>`).join("") || "<li>すべて合格</li>"}</ul>
      <p class="muted" style="font-size:.8rem">△はカードの文献照合（draft → verified_sources）が済むと消えます。公開前に「AIに頼む」→「文献番号とライセンスの照合」を行ってください。</p></details>`;
  }

  V.script = () => {
    if (!S.episodes.length) return `<section class="panel"><h2>台本</h2><p>先に「シリーズ構成」で回を作ってください。</p><div class="row"><button class="b primary" data-go="series" type="button">シリーズ構成へ</button></div></section>`;
    const cm = cardMap();
    return `<section class="panel"><h2>台本</h2>
      <p class="lead">回ごとに依頼文をチャットAI に送り、返ってきた JSON を貼り付けます。貼るとすぐに、根拠カード・数字・禁止表現・字幕の速さを自動で照合します。AI を使わない下書きも作れます。</p></section>` +
      S.episodes.map((ep, i) => {
        const cards = ep.cards.map((id) => cm[id]).filter(Boolean);
        const tab = S.ui.scriptTab[ep.id] || (ep.script ? "edit" : "ai");
        return `<section class="panel">
          <div class="row" style="justify-content:space-between"><h3>第${i + 1}回　${esc(ep.title)}</h3>
            <div class="row">${approved(ep) ? '<span class="chip ok">承認済み</span>' : ep.approval && ep.approval.approved ? '<span class="chip warn">承認後に変更あり</span>' : ""}</div></div>
          <div class="tabs" role="tablist">${[["ai", "AI に頼む"], ["paste", "貼り付け"], ["edit", "確認・修正"], ["check", "別のAIで意味を照合"]].map(([k, t]) => `<button role="tab" type="button" data-act="script-tab" data-ep="${ep.id}" data-tab="${k}" aria-selected="${tab === k}">${t}</button>`).join("")}</div>
          ${tab === "ai" ? promptBox(P.script(S.project, ep, cards, Object.keys(S.custom)), "script-" + ep.id) + `<div class="row"><button class="b small" data-act="draft" data-ep="${ep.id}" type="button">AI を使わずに下書きを作る</button><span class="muted" style="font-size:.8rem">カードの文をそのまま並べた下書きです。字幕が長すぎるので、手で短くする必要があります。</span></div>` : ""}
          ${tab === "paste" ? `<label class="f">AI が返した JSON<textarea id="script-paste-${ep.id}" class="mono tall"></textarea></label><div class="row"><button class="b primary" data-act="script-import" data-ep="${ep.id}" type="button">読み込んで照合する</button></div>` : ""}
          ${tab === "edit" ? (ep.script ? editScript(ep) : '<p class="muted">まだ台本がありません。</p>') : ""}
          ${tab === "check" ? (ep.script ? promptBox(P.semantic(ep, cards), "sem-" + ep.id) + `<p class="muted" style="font-size:.85rem">台本を書いたものとは別のチャットAI に送ると、意味の取り違えを見つけやすくなります。結果は監修者への申し送りとして残せます。</p>${fld2("sem-" + ep.id, "照合の結果（メモ）", ep.semantic)}` : '<p class="muted">台本ができてから使えます。</p>') : ""}
          ${ep.script ? checksHtml(ep) : ""}
        </section>`;
      }).join("") + `<section class="panel quiet"><div class="row"><button class="b primary" data-go="review" type="button">監修へ進む</button></div></section>`;
  };
  function fld2(id, label, val) { return `<label class="f">${label}<textarea id="${id}" data-semantic="${id.replace("sem-", "")}">${esc(val || "")}</textarea></label>`; }

  function editScript(ep) {
    const sc = ep.script; const vis = Object.keys(R.ILL).filter((k) => !["gutbrain", "check", "doctor"].includes(k)).concat(Object.keys(S.custom));
    return `<div class="grid3">
        ${sf(ep, "theme", "問いかけの題")}${sf(ep, "disease", "病名ラベル")}${sf(ep, "standard", "基準名")}</div>
      ${sc.scenes.map((s, i) => `<div class="scene"><div class="hd"><div class="row"><span class="chip">場面${i + 1}</span>
          <select id="sv-${ep.id}-${i}" data-sc="${ep.id}" data-i="${i}" data-k="visual" aria-label="絵の種類">${vis.map((v) => `<option ${s.visual === v ? "selected" : ""}>${v}</option>`).join("")}</select>
          <select id="sk-${ep.id}-${i}" data-sc="${ep.id}" data-i="${i}" data-k="kind" aria-label="場面の役割">${[["misconception", "誤解の問いかけ"], ["fact", "事実"], ["closing", "締め"]].map(([v, t]) => `<option value="${v}" ${s.kind === v ? "selected" : ""}>${t}</option>`).join("")}</select></div>
          <span class="muted" style="font-size:.8rem">根拠：${esc((s.cards || []).join("、") || "なし")}</span></div>
        <div class="grid2">
          <label class="f">大見出し（改行は \\n）<input type="text" id="sc-${ep.id}-${i}" data-sc="${ep.id}" data-i="${i}" data-k="caption" value="${esc(s.caption)}"></label>
          <label class="f">根拠カード（ID を読点で区切る）<input type="text" id="sd-${ep.id}-${i}" data-sc="${ep.id}" data-i="${i}" data-k="cards" value="${esc((s.cards || []).join("、"))}"></label>
          <label class="f">字幕<textarea id="sn-${ep.id}-${i}" data-sc="${ep.id}" data-i="${i}" data-k="narration" style="min-height:70px">${esc(s.narration)}</textarea></label>
          <label class="f">読み上げ（略語はカタカナ）<textarea id="ss-${ep.id}-${i}" data-sc="${ep.id}" data-i="${i}" data-k="speech" style="min-height:70px">${esc(s.speech)}</textarea></label>
          <label class="f">絵の文字（big・label・ratio・marks）<input type="text" id="sx-${ep.id}-${i}" data-sc="${ep.id}" data-i="${i}" data-k="extra" value="${esc(s.big || s.label || s.ratio || s.marks || "")}"></label>
          <label class="f">項目（checklist・compare。読点で区切る）<input type="text" id="sp-${ep.id}-${i}" data-sc="${ep.id}" data-i="${i}" data-k="points" value="${esc((s.points || []).join("、"))}"></label>
        </div></div>`).join("")}
      ${sf(ep, "source_line", "出典の表示（改行は \\n）")}
      <label class="f">投稿の説明文<textarea id="sdesc-${ep.id}" data-scf="${ep.id}" data-k="description">${esc(sc.description || "")}</textarea></label>`;
  }
  function sf(ep, k, label) { return `<label class="f">${label}<input type="text" id="sf-${ep.id}-${k}" data-scf="${ep.id}" data-k="${k}" value="${esc(ep.script[k] || "")}"></label>`; }

  V.review = () => {
    if (!S.episodes.some((e) => e.script)) return `<section class="panel"><h2>監修</h2><p>台本ができた回から監修できます。</p></section>`;
    const cm = cardMap();
    return `<section class="panel"><h2>監修</h2><p class="lead">監修者は、場面ごとの字幕と根拠カードを見比べて承認します。承認したあとに台本を変えると、承認は自動で外れます。監修用の資料（Markdown）を書き出して、メールなどで渡すこともできます。</p></section>` +
      S.episodes.filter((e) => e.script).map((ep) => {
        const bad = hardFail(runChecks(ep)).length, ap = ep.approval || {};
        return `<section class="panel">
          <div class="row" style="justify-content:space-between"><h3>${esc(ep.title)}</h3><div class="row">${bad ? `<span class="chip ng">照合 不合格 ${bad}件</span>` : '<span class="chip ok">照合 合格</span>'}${approved(ep) ? '<span class="chip ok">承認済み</span>' : '<span class="chip warn">未承認</span>'}</div></div>
          <div class="tablewrap"><table><thead><tr><th>場面</th><th>字幕</th><th>根拠カードの内容</th></tr></thead><tbody>
          ${ep.script.scenes.map((s, i) => `<tr><td class="mono">${i + 1}</td><td style="min-width:200px">${esc(s.narration)}</td><td style="min-width:260px">${(s.cards || []).map((id) => cm[id] ? `<b class="mono">${esc(id)}</b> ${esc(cm[id].assertion.plain_statement_ja)}<div class="muted" style="font-size:.8rem">${esc(cm[id].provenance.source)}</div>` : `<span class="chip ng">${esc(id)} なし</span>`).join("<hr style='border:0;border-top:1px solid var(--line)'>") || '<span class="muted">（締めの言葉）</span>'}</td></tr>`).join("")}
          </tbody></table></div>
          ${ep.semantic ? `<div class="note"><b>別のAIによる照合メモ</b><br>${esc(ep.semantic)}</div>` : ""}
          <div class="grid3">
            <label class="f">監修者<input type="text" id="ap-r-${ep.id}" data-ap="${ep.id}" data-k="reviewer" value="${esc(ap.reviewer || S.project.supervisor || "")}"></label>
            <label class="f">承認日<input type="date" id="ap-d-${ep.id}" data-ap="${ep.id}" data-k="date" value="${esc(ap.date || today())}"></label>
            <label class="f">コメント<input type="text" id="ap-c-${ep.id}" data-ap="${ep.id}" data-k="comment" value="${esc(ap.comment || "")}"></label>
          </div>
          <div class="row">
            ${approved(ep) ? `<button class="b warn" data-act="unapprove" data-ep="${ep.id}" type="button">承認を取り消す</button>` : `<button class="b primary" data-act="approve" data-ep="${ep.id}" type="button" ${bad ? "disabled" : ""}>承認する</button>`}
            <button class="b" data-act="packet" data-ep="${ep.id}" type="button">監修用資料を書き出す</button>
            ${bad ? '<span class="muted" style="font-size:.85rem">自動照合の不合格を直してから承認できます</span>' : ""}
          </div></section>`;
      }).join("");
  };

  V.video = () => {
    const eps = S.episodes.filter((e) => e.script);
    if (!eps.length) return `<section class="panel"><h2>動画</h2><p>台本ができた回から動画を作れます。</p></section>`;
    const cur = S.ui.videoEp && eps.find((e) => e.id === S.ui.videoEp) ? S.ui.videoEp : eps[0].id;
    const ep = eps.find((e) => e.id === cur);
    const mime = R.pickMime();
    const au = audioStore[ep.id];
    return `<section class="panel"><h2>動画</h2>
      <p class="lead">先に音声を用意し、その長さに合わせて場面を切り替えます。音声がなければ、読む速さから長さを見積もって字幕だけの動画にします。</p>
      <div class="row"><label class="f" style="min-width:240px">回を選ぶ<select id="video-ep" data-act-change="video-ep">${eps.map((e) => `<option value="${e.id}" ${e.id === cur ? "selected" : ""}>${esc(e.title)}${approved(e) ? "" : "（未承認）"}</option>`).join("")}</select></label></div>
    </section>
    <section class="panel">
      <h3>1. 音声</h3>
      <div class="tabs" role="tablist">${[["none", "字幕のみ（音声なし）"], ["upload", "音声ファイルを使う"], ["google", "クラウドの音声合成"], ["browser", "ブラウザで試聴"]].map(([k, t]) => `<button role="tab" type="button" data-act="tts-tab" data-tab="${k}" aria-selected="${S.tts.mode === k}">${t}</button>`).join("")}</div>
      ${S.tts.mode === "none" ? '<p>音声を入れずに書き出します。場面の長さは読む速さ（1秒7.5字）から見積もります。</p>' : ""}
      ${S.tts.mode === "upload" ? `<p>場面ごとの音声ファイル（WAV・MP3 など）を選んでください。自分の声の録音や、別のソフトで作った音声を使えます。</p>
        <div class="grid2">${ep.script.scenes.map((s, i) => `<label class="f">場面${i + 1}<span class="h">${esc((s.speech || s.narration || "").slice(0, 40))}</span><input type="file" accept="audio/*" data-audio="${ep.id}" data-i="${i}" id="au-${ep.id}-${i}"></label>`).join("")}</div>` : ""}
      ${S.tts.mode === "google" ? `<p>Google Cloud Text-to-Speech で、場面ごとの読み上げを作ります（有料。少量なら無料枠に収まることがあります）。API キーは保存せず、このページを閉じると消えます。</p>
        <div class="grid3"><label class="f">API キー<input type="password" id="tts-key" autocomplete="off" value="${esc(apiKey)}"></label>
        ${sel("tts.voice", "声", [["ja-JP-Neural2-B", "女性 Neural2-B"], ["ja-JP-Neural2-C", "男性 Neural2-C"], ["ja-JP-Neural2-D", "男性 Neural2-D"], ["ja-JP-Wavenet-A", "女性 Wavenet-A"]])}
        ${fld("tts.rate", "話す速さ", "1.0 が標準", "number", 'step="0.05" min="0.7" max="1.4"')}</div>
        <div class="row"><button class="b primary" data-act="tts-google" data-ep="${ep.id}" type="button">音声を作る</button></div>` : ""}
      ${S.tts.mode === "browser" ? `<p>ブラウザの読み上げで、台本の聞こえ方を確かめます。この音声は動画に録音できません。動画に入れるときは、ほかの方法を使ってください。</p><div class="row"><button class="b" data-act="speak" data-ep="${ep.id}" type="button">読み上げる</button><button class="b" data-act="speak-stop" type="button">止める</button></div>` : ""}
      <p class="muted" style="font-size:.85rem">${au ? "音声：" + au.filter(Boolean).length + "/" + ep.script.scenes.length + " 場面" : "音声：なし"}</p>
    </section>
    <section class="panel">
      <h3>2. 確認と書き出し</h3>
      <div class="player"><canvas id="cv" aria-label="動画のプレビュー"></canvas>
        <div style="display:grid;gap:12px;min-width:0">
          <div class="row"><button class="b" data-act="play" type="button">再生</button><button class="b" data-act="pause" type="button">止める</button>
          ${ep.script.scenes.map((s, i) => `<button class="b small" data-act="show" data-i="${i}" type="button">場面${i + 1}</button>`).join("")}</div>
          <p class="num" id="vinfo"></p>
          <label class="f" style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="ui.reviewMode" data-bind="ui.reviewMode" ${S.ui.reviewMode ? "checked" : ""}> 監修用（画面下に根拠カードの ID を出す）</label>
          ${approved(ep) ? "" : '<p class="note warn">この回は未承認なので、画面右上に「監修前サンプル」と表示されます。</p>'}
          <div class="row"><button class="b primary" data-act="record" data-ep="${ep.id}" type="button" ${mime === null ? "disabled" : ""}>動画を書き出す</button>
          <span class="muted" style="font-size:.85rem">${mime === null ? "このブラウザは書き出しに対応していません" : "形式：" + (mime.includes("mp4") ? "MP4" : "WebM（投稿先が MP4 のみなら「AIに頼む」→「MP4 に変換」）")}</span></div>
          <div class="progress" aria-hidden="true"><i id="rec-bar"></i></div>
          <p class="muted" style="font-size:.85rem">書き出しは実際の長さの時間がかかります。終わるまでこのタブを前面に出したままにしてください。</p>
        </div></div>
    </section>`;
  };

  function sourcesOf(ep) {
    const cm = cardMap(); const ids = [...new Set(ep.script.scenes.flatMap((s) => s.cards || []))];
    return [...new Set(ids.map((id) => cm[id] && cm[id].provenance.source).filter(Boolean))];
  }
  function description(ep, platform) {
    const pj = S.project, sc = ep.script, ap = ep.approval || {};
    const tags = platform === "x" ? "" : "\n\n#" + (pj.domain || "医療").replace(/[（）()\s]/g, "") + " #医療情報";
    const src = sourcesOf(ep);
    return [sc.description || sc.theme || ep.title, "", pj.disclaimer, "", "出典：", ...src.map((s) => "・" + s),
      "", "監修：" + (ap.reviewer || pj.supervisor || "（監修者）") + (ap.date ? "（" + ap.date + " 承認）" : ""), pj.aiNotice + "。", "発信：" + (pj.org || "（団体名）")].join("\n") + tags;
  }

  V.publish = () => {
    const eps = S.episodes.filter((e) => e.script);
    const items = [
      ["事実カードの形式の点検に合格", S.cards.length && S.cards.every((c) => !cardIssues(c, S.cards.map((x) => x.id)).e.length)],
      ["すべての回の台本が自動照合に合格", eps.length && eps.every((e) => !hardFail(runChecks(e)).length)],
      ["すべての回を監修者が承認", eps.length && eps.every(approved)],
      ["事実カードの文献照合が済んでいる（verified_sources 以上）", S.cards.length && S.cards.every((c) => ["verified_sources", "verified_expert"].includes((c.publication_info || {}).status))],
      ["AI で作ったことの表示がある", !!S.project.aiNotice],
      ["監修者の氏名・所属がある", !!S.project.supervisor]
    ];
    const plat = S.ui.plat || "youtube";
    return `<section class="panel"><h2>公開</h2>
      <p class="lead">公開前の最終確認と、投稿の説明文づくりです。説明文には、出典・監修者・AI で作ったことを自動で入れます。投稿は、各サービスの画面から人が行ってください。</p>
      <ul class="checks" style="list-style:none;padding:0">${items.map(([t, ok]) => `<li>${ok ? '<span class="chip ok">済</span>' : '<span class="chip warn">未</span>'}　${esc(t)}</li>`).join("")}</ul>
    </section>
    <section class="panel"><h3>投稿の説明文</h3>
      <div class="tabs" role="tablist">${[["youtube", "YouTube"], ["tiktok", "TikTok"], ["instagram", "Instagram"], ["x", "X"]].map(([k, t]) => `<button role="tab" type="button" data-act="plat" data-tab="${k}" aria-selected="${plat === k}">${t}</button>`).join("")}</div>
      ${eps.map((ep) => `<div class="prompt"><h3 style="font-size:.95rem">${esc(ep.title)} ${approved(ep) ? "" : '<span class="chip warn">未承認</span>'}</h3><pre id="desc-${ep.id}">${esc(description(ep, plat))}</pre><div class="row"><button class="b small" data-act="copy" data-src="desc-${ep.id}" type="button">コピー</button></div></div>`).join("") || '<p class="muted">台本ができた回がありません。</p>'}
      <p class="note">YouTube と TikTok では、AI で作った内容であることを投稿時の設定でも示してください（各サービスの「改変・合成コンテンツ」などの項目）。</p>
    </section>
    <section class="panel"><h3>シリーズ一式の書き出し</h3>
      <p>台本（JSON）、事実カード、監修の記録、説明文をまとめた ZIP を作ります。自分のパソコンで高音質の音声を使って一括作成するとき（「AIに頼む」）にも使います。</p>
      <div class="row"><button class="b primary" data-act="zip" type="button" ${eps.length ? "" : "disabled"}>series_package.zip を書き出す</button></div>
    </section>`;
  };

  V.ai = () => {
    const tool = S.ui.aiTool, task = S.ui.aiTask, t = P.CODE_TASKS[task], T = P.TOOLS[tool];
    return `<section class="panel"><h2>AI に頼む</h2>
      <p class="lead">このページだけではできない作業は、コード生成AI に頼みます。使う AI を選ぶと、その AI に合わせた手順と依頼文を出します。できたものは、このページに戻って貼り付けられます。</p>
      <div class="tabs" role="tablist">${Object.entries(P.TOOLS).map(([k, v]) => `<button role="tab" type="button" data-act="ai-tool" data-tab="${k}" aria-selected="${tool === k}">${esc(v.name)}</button>`).join("")}</div>
      <div class="grid2">
        <label class="f">頼みたい作業<select id="ai-task" data-act-change="ai-task">${Object.entries(P.CODE_TASKS).map(([k, v]) => `<option value="${k}" ${task === k ? "selected" : ""}>${esc(v.title)}</option>`).join("")}</select></label>
        ${sel("project.os", "使っているパソコン", [["Windows", "Windows"], ["Mac", "Mac"], ["Linux", "Linux"]])}
      </div>
      <div class="note"><b>こんなとき：</b>${esc(t.when)}<br><b>用意するもの：</b>${esc(t.needs)}</div>
      <h3>手順（${esc(T.name)}）</h3>
      <ol style="margin:0;padding-left:1.4em">${T.setup.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
      ${task === "verify" ? fld("project.email", "連絡先メール（Crossref の利用ルールで送る）", "依頼文にだけ入り、どこにも送信しません", "text") : ""}
      ${promptBox(P.codeTask(task, tool, projectForPrompt()), "code")}
      <details><summary>作業フォルダに置く ${esc(T.memo)}（AI に守ってほしいルール）</summary>${promptBox(P.agentsMemo(S.project, tool), "memo")}
        <div class="row"><button class="b small" data-act="memo-dl" type="button">${esc(T.memo === "README" ? "AI_RULES.md" : T.memo)} として保存</button></div></details>
    </section>
    ${t.back === "cards" ? `<section class="panel"><h3>結果を貼り付ける：照合済みのカード</h3><p>AI が作った cards_verified.json の中身を貼ると、同じ ID のカードを置き換えます。</p><textarea id="back-cards" class="mono tall"></textarea><div class="row"><button class="b primary" data-act="back-cards" type="button">取り込む</button></div></section>` : ""}
    <section class="panel"><h3>新しい挿絵</h3>
      <p>チャットAI かコード生成AI に SVG を作ってもらい、貼り付けると台本の「絵の種類」に加わります。</p>
      <div class="grid2"><label class="f">絵の名前（英数字）<input type="text" id="svg-name" value="${esc(S.ui.svgName || "")}" placeholder="stomach_light"></label>
      <label class="f">描きたいもの<input type="text" id="svg-desc" value="${esc(S.ui.svgDesc || "")}" placeholder="胃のイラストと食事の皿"></label></div>
      <div class="row"><button class="b small" data-act="svg-prompt" type="button">依頼文を作る</button></div>
      ${S.ui.svgPrompt ? promptBox(S.ui.svgPrompt, "svg") : ""}
      <label class="f">できた SVG（&lt;svg …&gt;…&lt;/svg&gt;）<textarea id="svg-paste" class="mono"></textarea></label>
      <div class="row"><button class="b primary" data-act="svg-add" type="button">挿絵に加える</button>
      ${Object.keys(S.custom).map((k) => `<span class="chip info">${esc(k)} <button class="b small" data-act="svg-del" data-id="${esc(k)}" type="button" aria-label="${esc(k)} を削除">×</button></span>`).join("")}</div>
    </section>`;
  };

  /* ---------- 描画と配線 ---------- */
  function render() {
    if (S.step === "plan") S.project.bannedText = (S.project.banned || []).join("、");
    renderNav();
    $("#main").innerHTML = (V[S.step] || V.intro)();
    if (S.step === "video") setupPlayer();
    save();
  }
  function go(step) { if (player) player.stop(); S.step = step; if (step === "intro") S.ui.seenIntro = true; render(); window.scrollTo({ top: 0 }); }

  async function setupPlayer() {
    const eps = S.episodes.filter((e) => e.script); if (!eps.length) return;
    const ep = eps.find((e) => e.id === S.ui.videoEp) || eps[0];
    player = R.Player($("#cv"));
    const durs = await player.load(ep, optFor(ep), audioStore[ep.id]);
    const info = $("#vinfo"); if (info) info.textContent = "長さ " + durs.reduce((a, b) => a + b, 0).toFixed(1) + "秒（" + durs.map((d) => d.toFixed(1)).join(" / ") + "）";
  }
  function optFor(ep) { return { org: S.project.org, approved: approved(ep), review: !!S.ui.reviewMode, aiNotice: S.project.aiNotice, credit: S.project.credit ? CFG.videoCredit : "" }; }

  function loadSample() {
    const have = new Set(S.cards.map((c) => c.id));
    SAMPLE.cards.forEach((c) => { if (!have.has(c.id)) S.cards.push(JSON.parse(JSON.stringify(c))); });
    const p = S.project;
    if (!p.seriesTitle) Object.assign(p, { seriesTitle: "おなかの不調、それって気のせい？", org: "日本神経消化器病学会（見本）", domain: "過敏性腸症候群（IBS）", supervisor: "（監修者名）", prefix: "NG", topics: "過敏性腸症候群の診断基準（Rome V）\n機能性ディスペプシアの診断基準（Rome V）" });
    if (!S.episodes.length) {
      S.episodes = [
        { id: "ep01", title: "「検査で異常なし」は気のせい？", cards: ["NG-130", "NG-232", "NG-127"], script: JSON.parse(JSON.stringify(SAMPLE.script)), checks: [], semantic: "", approval: {} },
        { id: "ep02", title: "食後のもたれ、胃の病気？", cards: ["NG-198", "NG-199", "NG-200"], script: null, checks: [], semantic: "", approval: {} }
      ];
      // 見本の台本は旧来の絵の名前を使っているので、新しい名前に寄せる
      S.episodes[0].script.scenes.forEach((s) => { if (s.visual === "gutbrain") s.visual = "brain_gut"; if (s.visual === "check") { s.visual = "checklist"; s.points = ["警告症状がない", "検査は必要な分だけ", "症状から診断"]; } if (s.visual === "doctor") { s.visual = "consult"; s.label = "消化器の専門医に相談"; } });
    }
    toast("見本を読み込みました（カード" + SAMPLE.cards.length + "件・2回分）"); render();
  }

  function importCards(text) {
    const cs = parseCards(text); const m = new Map(S.cards.map((c) => [c.id, c]));
    cs.forEach((c) => m.set(c.id, c)); S.cards = [...m.values()].sort((a, b) => a.id.localeCompare(b.id));
    toast(cs.length + "件のカードを読み込みました"); render();
  }

  function importScript(ep, text) {
    let t = String(text || "").trim(); const m = t.match(/```(?:json)?\s*\n([\s\S]*?)```/); if (m) t = m[1];
    const a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a < 0 || b < a) throw new Error("JSON が見つかりませんでした。AI の答えを全部貼り付けてください。");
    const sc = JSON.parse(t.slice(a, b + 1));
    if (!Array.isArray(sc.scenes) || !sc.scenes.length) throw new Error("scenes（場面の並び）がありません。");
    sc.scenes.forEach((s) => { s.cards = Array.isArray(s.cards) ? s.cards : []; if (!s.speech) s.speech = s.narration; });
    ep.script = sc; S.ui.scriptTab[ep.id] = "edit";
    const bad = hardFail(runChecks(ep)).length; toast(bad ? "読み込みました。照合で " + bad + " 件の不合格があります" : "読み込みました。照合はすべて合格です");
    render();
  }

  function packet(ep) {
    const cm = cardMap(), pj = S.project;
    const L = ["# 監修用資料：" + ep.title, "", "- シリーズ：" + pj.seriesTitle, "- 発信：" + pj.org, "- 視聴者：" + pj.audience, "- 作成日：" + today(), "", "## 場面と根拠", ""];
    ep.script.scenes.forEach((s, i) => {
      L.push("### 場面" + (i + 1) + "（" + s.kind + "）", "- 大見出し：" + String(s.caption || "").replace(/\n/g, " "), "- 字幕：" + s.narration, "- 読み上げ：" + (s.speech || ""), "- 根拠：");
      (s.cards || []).forEach((id) => { const c = cm[id]; L.push("  - " + id + "：" + (c ? c.assertion.plain_statement_ja + "（" + c.provenance.source + "）" : "見つからない")); });
      L.push("");
    });
    L.push("## 自動照合の結果", "");
    runChecks(ep).forEach((r) => L.push("- " + (r.ok ? "OK" : r.soft ? "確認" : "NG") + " 場面" + r.n + " " + r.k + " " + r.d));
    if (ep.semantic) L.push("", "## 別のAIによる照合メモ", "", ep.semantic);
    L.push("", "## 承認", "", "- 監修者：", "- 承認日：", "- コメント：", "", "---", "クリーンルーム動画スタジオで作成");
    return L.join("\n");
  }

  async function makeZip() {
    if (!window.JSZip) { toast("ZIP を作る部品を読み込めませんでした。インターネットにつながる環境で開いてください"); return; }
    const z = new window.JSZip(); const eps = S.episodes.filter((e) => e.script);
    z.file("cards.json", JSON.stringify(S.cards, null, 1));
    eps.forEach((ep) => {
      const sc = Object.assign({}, ep.script, { ai_notice: S.project.aiNotice, approved: approved(ep), approval: ep.approval });
      z.file("scripts/" + ep.id + ".json", JSON.stringify(sc, null, 1));
      z.file("review/" + ep.id + ".md", packet(ep));
      z.file("descriptions/" + ep.id + ".txt", description(ep, "youtube"));
    });
    z.file("AI_RULES.md", P.agentsMemo(S.project, "other"));
    z.file("CLAUDE.md", P.agentsMemo(S.project, "claude"));
    z.file("AGENTS.md", P.agentsMemo(S.project, "codex"));
    z.file("README.txt", [S.project.seriesTitle, "", "クリーンルーム動画スタジオで作ったシリーズ一式です。", "scripts/：台本（JSON）　cards.json：事実カード　review/：監修用資料　descriptions/：投稿の説明文", "", "本ツールの開発は、" + CFG.grants.map((g) => g.funder).join("、") + "の助成を受けて行いました。", CFG.repository].join("\n"));
    download("series_package.zip", await z.generateAsync({ type: "blob" }));
  }

  document.addEventListener("click", async (ev) => {
    const g = ev.target.closest("[data-go]"); if (g) { go(g.dataset.go); return; }
    const b = ev.target.closest("[data-act]"); if (!b || b.tagName === "SELECT" || (b.tagName === "INPUT" && b.type !== "checkbox")) return;
    const act = b.dataset.act, epOf = (id) => S.episodes.find((e) => e.id === id);
    try {
      if (act === "load-sample") loadSample();
      else if (act === "copy") copy($("#" + b.dataset.src).textContent, b);
      else if (act === "cards-tab") { S.ui.cardsTab = b.dataset.tab; render(); }
      else if (act === "cards-import") importCards($("#cards-paste").value);
      else if (act === "del-card") { S.cards = S.cards.filter((c) => c.id !== b.dataset.id); render(); }
      else if (act === "cards-export") download("cards.json", JSON.stringify(S.cards, null, 1), "application/json");
      else if (act === "auto-plan") { S.episodes = autoPlan(3); toast(S.episodes.length + "回に分けました"); render(); }
      else if (act === "ep-add") { S.episodes.push({ id: "ep" + Date.now().toString(36), title: "新しい回", cards: [], script: null, checks: [], semantic: "", approval: {} }); render(); }
      else if (act === "ep-del") { S.episodes = S.episodes.filter((e) => e.id !== b.dataset.id); render(); }
      else if (act === "ep-card") { const ep = epOf(b.dataset.ep); const id = b.dataset.id; ep.cards = b.checked ? [...new Set([...ep.cards, id])] : ep.cards.filter((x) => x !== id); save(); renderNav(); }
      else if (act === "script-tab") { S.ui.scriptTab[b.dataset.ep] = b.dataset.tab; render(); }
      else if (act === "script-import") importScript(epOf(b.dataset.ep), $("#script-paste-" + b.dataset.ep).value);
      else if (act === "draft") { const ep = epOf(b.dataset.ep); ep.script = draftScript(ep); if (!ep.script) throw new Error("この回にカードがありません"); S.ui.scriptTab[ep.id] = "edit"; toast("下書きを作りました。字幕を短く直してください"); render(); }
      else if (act === "approve") { const ep = epOf(b.dataset.ep); const ap = ep.approval || {}; if (!ap.reviewer && !S.project.supervisor) throw new Error("監修者の名前を入れてください"); ep.approval = Object.assign({ reviewer: S.project.supervisor, date: today() }, ap, { approved: true, hash: hash(ep.script) }); toast("承認しました"); render(); }
      else if (act === "unapprove") { epOf(b.dataset.ep).approval.approved = false; render(); }
      else if (act === "packet") { const ep = epOf(b.dataset.ep); download("review_" + ep.id + ".md", packet(ep), "text/markdown;charset=utf-8"); }
      else if (act === "tts-tab") { S.tts.mode = b.dataset.tab; render(); }
      else if (act === "tts-google") {
        const ep = epOf(b.dataset.ep); apiKey = $("#tts-key").value.trim(); if (!apiKey) throw new Error("API キーを入れてください");
        b.disabled = true; b.textContent = "作成中…";
        audioStore[ep.id] = await R.googleTTS(ep, apiKey, S.tts.voice, parseFloat(S.tts.rate) || 1); toast("音声を作りました"); render();
      }
      else if (act === "speak") { const ep = epOf(b.dataset.ep); speechSynthesis.cancel(); ep.script.scenes.forEach((s) => { const u = new SpeechSynthesisUtterance(s.speech || s.narration); u.lang = "ja-JP"; speechSynthesis.speak(u); }); }
      else if (act === "speak-stop") speechSynthesis.cancel();
      else if (act === "play") player && player.play();
      else if (act === "pause") player && player.stop();
      else if (act === "show") player && player.show(+b.dataset.i);
      else if (act === "record") {
        const ep = epOf(b.dataset.ep); b.disabled = true; b.textContent = "書き出し中…"; if (player) player.stop();
        const out = await R.record(ep, optFor(ep), audioStore[ep.id], (p) => { const bar = $("#rec-bar"); if (bar) bar.style.width = (p * 100).toFixed(1) + "%"; });
        download((S.project.prefix || "video") + "_" + ep.id + "." + out.ext, out.blob); b.disabled = false; b.textContent = "動画を書き出す";
      }
      else if (act === "plat") { S.ui.plat = b.dataset.tab; render(); }
      else if (act === "zip") await makeZip();
      else if (act === "ai-tool") { S.ui.aiTool = b.dataset.tab; render(); }
      else if (act === "memo-dl") { const T = P.TOOLS[S.ui.aiTool]; download(T.memo === "README" ? "AI_RULES.md" : T.memo, P.agentsMemo(S.project, S.ui.aiTool), "text/markdown;charset=utf-8"); }
      else if (act === "back-cards") importCards($("#back-cards").value);
      else if (act === "svg-prompt") { S.ui.svgName = $("#svg-name").value.trim(); S.ui.svgDesc = $("#svg-desc").value.trim(); S.ui.svgPrompt = P.svg(S.ui.svgName, S.ui.svgDesc); render(); }
      else if (act === "svg-add") {
        const name = ($("#svg-name").value || "").trim(); if (!/^[a-z][a-z0-9_]{1,30}$/.test(name)) throw new Error("絵の名前は英小文字で始まる英数字（_ 可）にしてください");
        const svg = $("#svg-paste").value.trim(); await R.addCustomVisual(name, svg); S.custom[name] = svg; toast(name + " を加えました"); render();
      }
      else if (act === "svg-del") { delete S.custom[b.dataset.id]; render(); }
    } catch (e) { toast(e.message || String(e)); if (act === "record" || act === "tts-google") render(); }
  });

  document.addEventListener("input", (ev) => {
    const el = ev.target;
    if (el.dataset.bind) {
      let v = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value;
      if (el.dataset.bind === "project.bannedText") { S.project.banned = v.split(/[、,\n]/).map((x) => x.trim()).filter(Boolean); }
      set(el.dataset.bind, v);
      if (el.dataset.bind === "project.prefix") S.project.prefix = String(v).toUpperCase();
      save(); renderNav();
      if (el.type === "checkbox" && S.step === "video") setupPlayer();
    } else if (el.dataset.ep && el.dataset.epf) { const ep = S.episodes.find((e) => e.id === el.dataset.ep); ep[el.dataset.epf] = el.value; save(); }
    else if (el.dataset.sc) {
      const ep = S.episodes.find((e) => e.id === el.dataset.sc), s = ep.script.scenes[+el.dataset.i], k = el.dataset.k;
      if (k === "cards") s.cards = el.value.split(/[、,\s]+/).filter(Boolean);
      else if (k === "points") s.points = el.value.split(/[、,]/).map((x) => x.trim()).filter(Boolean);
      else if (k === "extra") { const v = el.value; if (s.visual === "big_number") s.big = v; else if (s.visual === "people") s.ratio = v; else if (s.visual === "calendar") s.marks = v; else s.label = v; }
      else s[k] = el.value;
      save(); clearTimeout(window.__chk); window.__chk = setTimeout(() => { const pos = scrollY; const id = document.activeElement && document.activeElement.id; render(); scrollTo(0, pos); if (id && $("#" + CSS.escape(id))) { const n = $("#" + CSS.escape(id)); n.focus(); if (n.setSelectionRange && n.value != null) { try { n.setSelectionRange(n.value.length, n.value.length); } catch (e) { } } } }, 900);
    } else if (el.dataset.scf) { const ep = S.episodes.find((e) => e.id === el.dataset.scf); ep.script[el.dataset.k] = el.value; save(); }
    else if (el.dataset.ap) { const ep = S.episodes.find((e) => e.id === el.dataset.ap); ep.approval = ep.approval || {}; ep.approval[el.dataset.k] = el.value; save(); }
    else if (el.dataset.semantic) { const ep = S.episodes.find((e) => e.id === el.dataset.semantic); ep.semantic = el.value; save(); }
  });

  document.addEventListener("change", async (ev) => {
    const el = ev.target;
    if (el.dataset.actChange === "video-ep") { S.ui.videoEp = el.value; render(); }
    else if (el.dataset.actChange === "ai-task") { S.ui.aiTask = el.value; render(); }
    else if (el.dataset.sc && el.tagName === "SELECT") { render(); }
    else if (el.dataset.bind && el.tagName === "SELECT") { render(); }
    else if (el.id === "cards-file" && el.files[0]) { try { importCards(await el.files[0].text()); } catch (e) { toast(e.message); } }
    else if (el.dataset.audio && el.files[0]) {
      const id = el.dataset.audio, i = +el.dataset.i; const ep = S.episodes.find((e) => e.id === id);
      try { const [buf] = await R.decodeFiles([el.files[0]]); audioStore[id] = audioStore[id] || new Array(ep.script.scenes.length).fill(null); audioStore[id][i] = buf; toast("場面" + (i + 1) + "の音声：" + buf.duration.toFixed(1) + "秒"); setupPlayer(); }
      catch (e) { toast("この音声ファイルは読めませんでした（WAV か MP3 を使ってください）"); }
    }
    else if (el.id === "file-import-project" && el.files[0]) {
      try { const d = JSON.parse(await el.files[0].text()); if (!d.project || !Array.isArray(d.cards)) throw new Error(); S = Object.assign(fresh(), d); await restoreCustom(); toast("作業を読み込みました"); render(); }
      catch (e) { toast("作業ファイルとして読めませんでした"); }
      el.value = "";
    }
  });

  $("#btn-export-project").addEventListener("click", () => download("cleanroom_project_" + today() + ".json", JSON.stringify(S, null, 1), "application/json"));
  let resetArmed = false;
  $("#btn-reset").addEventListener("click", (e) => {
    if (!resetArmed) { resetArmed = true; e.target.textContent = "もう一度押すと消去"; setTimeout(() => { resetArmed = false; e.target.textContent = "はじめからやり直す"; }, 4000); return; }
    S = fresh(); for (const k in audioStore) delete audioStore[k]; try { localStorage.removeItem(KEY); } catch (er) { } resetArmed = false; e.target.textContent = "はじめからやり直す"; toast("消去しました"); render();
  });

  async function restoreCustom() { for (const [k, v] of Object.entries(S.custom || {})) { try { await R.addCustomVisual(k, v); } catch (e) { delete S.custom[k]; } } }

  // 起動
  S = Object.assign(fresh(), S); S.ui = Object.assign(fresh().ui, S.ui || {}); S.project = Object.assign(fresh().project, S.project || {});
  renderFooter(); restoreCustom().then(render);
  window.CRVS_APP = { state: () => S, runChecks, parseCards, cardIssues, draftScript };
})();
