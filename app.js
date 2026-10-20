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
    { id: "review", t: "監修・監査", s: "正確さと類似性を確認" },
    { id: "video", t: "動画", s: "音声と映像を作る" },
    { id: "publish", t: "公開", s: "説明文と最終確認" },
    { id: "ai", t: "AIに頼む", s: "コード生成AIの案内", sep: true }
  ];

  function fresh() {
    return {
      v: 2, step: "intro",
      project: {
        seriesTitle: "", org: "", supervisor: "", domain: "", prefix: "", topics: "", audience: "public",
        minSec: 30, maxSec: 60, banned: DEFAULT_BANNED.slice(), aiNotice: "原稿はAIが作成し、監修者が確認しました",
        credit: true, os: "Windows", email: "", sourcesHint: "", cardTarget: 20, disclaimer: "個別の医療相談にはお答えできません。症状が続くときは医療機関を受診してください。",
        // 段階0 企画登録
        mgmtNo: "", edition: "1.0", owner: "", coauthors: "", scope: "", lang: "日本語", translation: "なし", period: "", updater: "",
        risks: { patient: false, others: false, photo: false, video: false, exam: false },
        // 段階1 学習目標
        objLevel: "", objAction: "", objScene: "", objEval: "", objOut: ""
      },
      cards: [], episodes: [], custom: {}, tts: { mode: "none", voice: "ja-JP-Neural2-B", rate: 1.0 },
      aiLog: [],
      publish: { license: "ccby", pubDate: "", checks: {}, legalReview: "", incident: false },
      ui: { scriptTab: {}, aiTool: "claude", aiTask: "batch", chatTool: "claude" }
    };
  }
  const SCOPES = [["", "（選ぶ）"], ["campus", "学内限定"], ["students", "受講者限定"], ["partners", "共同研究者・複数機関"], ["public", "一般公開（SNS・ウェブ）"], ["sale", "販売・有償研修"]];
  const RISK_ITEMS = [["patient", "患者情報（症例・画像など）"], ["others", "他者の教材・出版物"], ["photo", "写真・イラスト（自作以外）"], ["video", "動画・音楽（自作以外）"], ["exam", "試験問題"]];
  /* マニュアル 7.1 のリスク分類 */
  function riskLevel() {
    const p = S.project, r = p.risks || {};
    if (!p.owner || !p.scope) return { lv: "停止", why: "責任者か公開範囲が決まっていません（段階0の停止条件）" };
    if (["public", "sale"].includes(p.scope) || r.patient || r.exam || (p.translation && p.translation !== "なし")) return { lv: "高", why: "一般公開・販売、患者情報、試験問題、翻訳・国外公開のいずれかがあるため、法務・知財担当または専門家の確認が必要です" };
    if (p.scope === "partners" || r.others || r.photo || r.video) return { lv: "中", why: "複数機関での利用か第三者の素材があるため、権利担当または別の担当者による監査が必要です" };
    return { lv: "低", why: "制作者のセルフチェックと責任者の確認で進められます" };
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
    if (p.legal_basis === "E") e.push("利用根拠 E（教育目的の例外）は一般公開の根拠にならない");
    if (!["OPEN", "RESTRICTED", "GOV_JP", "GOV_US", "UNKNOWN"].includes(p.source_class)) e.push("source_class の値");
    if (/\[\d+\]/.test(JSON.stringify(c))) e.push("脚注番号 [n] が残っている");
    if (/要確認/.test(a.plain_statement_ja || "")) w.push("主張文に「要確認」");
    if (pub.status === "verified_expert" && !pub.verifier) e.push("verified_expert なのに verifier が空");
    if (!a.common_misconception) w.push("よくある誤解が空（問いかけの場面に使えない）");
    if (/二次資料/.test(String(c.uncertainty || ""))) w.push("二次資料経由の数値（一次資料で確認）");
    if (p.source_class === "UNKNOWN") w.push("ライセンス未確認");
    if (pub.status !== "verified_sources" && pub.status !== "verified_expert") w.push("文献照合前（draft）");
    if (!(c.verification && c.verification.by && c.verification.date)) w.push("確認者・確認日が未記入（様式1）");
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
    if (id === "plan") return !!(S.project.seriesTitle && S.project.org && S.project.domain && S.project.owner && S.project.scope && S.project.objAction);
    if (id === "cards") return S.cards.length > 0;
    if (id === "series") return S.episodes.length > 0 && S.episodes.every((e) => e.cards.length);
    if (id === "script") return S.episodes.length > 0 && S.episodes.every((e) => e.script && !hardFail(runChecks(e)).length);
    if (id === "review") return S.episodes.length > 0 && S.episodes.every(approved);
    return false;
  }
  const AUDIT_ITEMS = [
    ["text", "字幕・読み上げに、元の文章の語順・文の構造・比喩・例示が残っていない"],
    ["structure", "回の構成・見出し・説明の順序が、元の教科書やガイドラインの章立てに沿っていない"],
    ["visual", "挿絵が既存の図の項目・配置・矢印・配色を写していない"],
    ["case", "症例や問いかけが既存の症例・問題を写しておらず、実在の患者を思わせない"],
    ["third", "第三者の素材（写真・図・音楽・ロゴ）を使っていない、または全件に利用根拠がある"],
    ["rights", "肖像・ロゴ・商標・サービスの利用規約を確認した"]
  ];
  const AUDIT_RESULTS = [["", "（選ぶ）"], ["approve", "承認"], ["conditional", "条件付き承認"], ["return", "差し戻し"], ["legal", "法務確認へ回す"]];
  function auditOk(ep) { const a = ep.audit || {}; return AUDIT_ITEMS.every(([k]) => a.checks && a.checks[k]) && ["approve", "conditional"].includes(a.result) && !!a.auditor; }
  function approved(ep) { return !!(ep.approval && ep.approval.approved && ep.script && ep.approval.hash === hash(ep.script) && auditOk(ep)); }
  function logAI(entry) { S.aiLog.push(Object.assign({ date: new Date().toISOString().slice(0, 16).replace("T", " ") }, entry)); }

  function renderNav() {
    $("#steps").innerHTML = STEPS.map((s, i) => (s.sep ? "<hr>" : "") +
      `<button type="button" data-go="${s.id}" ${S.step === s.id ? 'aria-current="step"' : ""} data-done="${stepDone(s.id) ? 1 : 0}">
        <span class="no">${s.id === "ai" ? "AI" : i}</span><span class="lbl">${esc(s.t)}<small>${esc(s.s)}</small></span></button>`).join("");
  }
  function manualName() { const m = CFG.manual; return "『" + m.title + "』" + m.version + "（" + m.author + "）"; }
  function renderFooter() {
    const g = CFG.grants.map((x) => `<li><strong>${esc(x.funder)}</strong>${x.title ? "「" + esc(x.title) + "」" : ""}${x.number ? "（" + esc(x.number) + "）" : ""}</li>`).join("");
    const m = CFG.manual;
    $("#footer").innerHTML = `<p>本ツールの開発は、次の助成を受けて行いました。</p><ul style="margin:0;padding-left:1.2em">${g}</ul>
      <p>制作の手順は、${m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(manualName())}</a>` : esc(manualName())}に沿っています。</p>
      <p>開発：${esc(CFG.developer)}　｜　プログラム：${esc(CFG.license.code)}、説明文と見本データ：${esc(CFG.license.content)}　｜　<a href="${esc(CFG.repository)}" target="_blank" rel="noopener">ソースコード</a>　｜　v${esc(CFG.version)}</p>
      <p>本ツールは制作の手順を支援するもので、医学的内容の正確さや、権利侵害がないことを保証するものではなく、法律上の助言でもありません。公開する内容の最終判断は各団体の責任者・監修者が行い、高額・商用・大規模公開・権利関係が不明な案件・国外公開は、所属機関の法務・知財担当または弁護士に確認してください。</p>`;
  }

  const V = {};
  V.intro = () => `
  <section class="panel">
    <h2>医療の短い動画を、根拠をたどれる形で作る</h2>
    <p class="lead">他の人の文章を言い換えるのではなく、論文やガイドラインから事実とデータだけを「事実カード」に取り出して確かめ、学習目標とそのカードだけを材料に、新しい表現として動画を作ります（クリーンルーム方式）。台本のどの文がどのカードにもとづくかが残るので、監修と訂正がしやすく、著作権にも配慮できます。</p>
    <div class="flow">
      <div><b>1 企画</b>責任者・公開範囲・学習目標<br><span class="chip who">あなた</span></div>
      <div><b>2 事実カード</b>事実を取り出して確かめる<br><span class="chip info who">チャットAI＋あなた</span></div>
      <div><b>3 シリーズ構成</b>学習目標から回を組む<br><span class="chip who">自動＋あなた</span></div>
      <div><b>4 台本</b>カードと目標だけで書く<br><span class="chip info who">チャットAI</span></div>
      <div><b>照合</b>根拠・数字・禁止表現<br><span class="chip ok who">自動</span></div>
      <div><b>5 監修・監査</b>正確さと類似性を確認<br><span class="chip warn who">監修者・監査担当</span></div>
      <div><b>6 動画</b>音声の長さに合わせて描画<br><span class="chip ok who">自動</span></div>
      <div><b>7 公開</b>表示・記録・最終確認<br><span class="chip who">責任者</span></div>
    </div>
  </section>
  <section class="panel">
    <h3>マニュアルの10段階との対応</h3>
    <p class="lead">このツールの工程は、${esc(manualName())}の標準作業手順（段階0〜9）に沿っています。既存の出版物を許諾を得て動画化する場合（許諾型）は対象外で、複数の資料から事実を取り出して新しく作る場合（独立創作型）を支援します。</p>
    <div class="tablewrap"><table><thead><tr><th>段階</th><th>内容</th><th>このツールの画面</th></tr></thead><tbody>
      <tr><td class="mono">0</td><td>企画登録（責任者・公開範囲・高リスク素材）</td><td>1 企画</td></tr>
      <tr><td class="mono">1</td><td>学習目標を、元資料の章立てではなく学習者の行動から決める</td><td>1 企画、3 シリーズ構成</td></tr>
      <tr><td class="mono">2</td><td>情報源の棚卸し（書誌・権利表示）</td><td>2 事実カード（出典の欄）</td></tr>
      <tr><td class="mono">3</td><td>素材ごとの利用根拠（A〜G）</td><td>2 事実カード（利用根拠 B）、7 公開（素材・権利台帳）</td></tr>
      <tr><td class="mono">4</td><td>事実・データの抽出（表現は写さない）</td><td>2 事実カード</td></tr>
      <tr><td class="mono">5</td><td>一次資料・独立した資料での検証</td><td>2 事実カード（確認者・確認日）、AIに頼む（文献照合）</td></tr>
      <tr><td class="mono">6</td><td>元資料を閉じて、事実カードと学習目標から新しく作る</td><td>4 台本、6 動画</td></tr>
      <tr><td class="mono">7</td><td>第三者素材の権利処理</td><td>5 監修・監査、7 公開</td></tr>
      <tr><td class="mono">8</td><td>類似性・権利の監査</td><td>5 監修・監査（様式4）</td></tr>
      <tr><td class="mono">9</td><td>版の固定・公開・記録の保存</td><td>7 公開（版・記録一式の書き出し）</td></tr>
    </tbody></table></div>
  </section>
  <section class="panel">
    <h3>守るルール</h3>
    <ol style="margin:0;padding-left:1.4em;max-width:72ch">
      <li>論文やガイドラインの文章・表・図・章立てを写さない。事実と数値だけを取り出し、自分の言葉と自分の構成で作る。</li>
      <li>数値は対象・分母・単位・時点と一緒に、一次資料で確かめる。孫引きは確認したことにならない。</li>
      <li>文献番号（DOI・PMID）やライセンスは、確かめられたものだけを書く。</li>
      <li>有料の論文・書籍・出版社の PDF の全文を、許諾なく AI に読み込ませない。患者情報・個人情報・試験問題を AI に入力しない。</li>
      <li>台本の各場面には根拠のカードIDを付け、カードにない数字は足さない。AI を使った記録を残す。</li>
      <li>公開は、監修と類似性の監査を経て承認された動画だけ。AIで作ったこと、出典、版を示す。</li>
      <li>一般向けでは薬の名前を出さず、実在の人物の映像や声、ロゴを使わない。</li>
    </ol>
    <div class="note warn"><b>判断に迷ったとき</b><br>「教育目的だからよい」「複数のサイトに載っているからよい」「AI に書き換えさせたから別物」とは考えず、使わない、許諾を得る、または法務・知財担当に相談する、のどれかにしてください。</div>
  </section>
  <section class="panel quiet">
    <h3>まず見本で試す</h3>
    <p class="lead">架空の団体「サンプル消化器ケア協会」が作った想定の、事実カード6件と台本1本を読み込みます。各工程の画面がどう埋まるかを確かめてから、自分の企画に切り替えてください。</p>
    <div class="row"><button class="b primary" data-act="load-sample" type="button">見本を読み込む</button>
    <button class="b" data-go="plan" type="button">自分の企画から始める</button></div>
    <p class="muted" style="font-size:.85rem">作業の内容はこのブラウザに自動で保存されます。別のパソコンで続けるときは、右上の「作業を保存（ファイル）」を使ってください。</p>
  </section>
  <section class="panel quiet">
    <h3>参考資料（公式資料）</h3>
    <ul style="margin:0;padding-left:1.2em;font-size:.9rem">
      <li><a href="https://laws.e-gov.go.jp/law/345AC0000000048" target="_blank" rel="noopener">e-Gov法令検索「著作権法」</a></li>
      <li><a href="https://www.bunka.go.jp/seisaku/chosakuken/seidokaisetsu/pdf/94383901_01.pdf" target="_blank" rel="noopener">文化庁「著作権テキスト」</a></li>
      <li><a href="https://sartras.or.jp/seido/" target="_blank" rel="noopener">SARTRAS「授業目的公衆送信補償金制度とは」</a></li>
      <li><a href="https://creativecommons.org/licenses/by/4.0/deed.ja" target="_blank" rel="noopener">Creative Commons「表示 4.0 国際（CC BY 4.0）」</a></li>
      <li><a href="https://www.bunka.go.jp/seisaku/chosakuken/pdf/94097701_01.pdf" target="_blank" rel="noopener">文化庁「AIと著作権に関するチェックリスト＆ガイダンス」</a></li>
      <li><a href="https://www.bunka.go.jp/seisaku/bunkashingikai/chosakuken/pdf/94037901_01.pdf" target="_blank" rel="noopener">文化審議会著作権分科会法制度小委員会「AIと著作権に関する考え方について」</a></li>
      <li><a href="https://www.ppc.go.jp/news/careful_information/230602_AI_utilize_alert/" target="_blank" rel="noopener">個人情報保護委員会「生成AIサービスの利用に関する注意喚起等について」</a></li>
    </ul>
  </section>`;

  const fld = (path, label, help, type, extra) => {
    const val = get(path);
    if (type === "textarea") return `<label class="f">${label}${help ? `<span class="h">${help}</span>` : ""}<textarea id="${path}" data-bind="${path}" ${extra || ""}>${esc(val)}</textarea></label>`;
    return `<label class="f">${label}${help ? `<span class="h">${help}</span>` : ""}<input id="${path}" type="${type || "text"}" data-bind="${path}" value="${esc(val)}" ${extra || ""}></label>`;
  };
  const sel = (path, label, opts, help) => `<label class="f">${label}${help ? `<span class="h">${help}</span>` : ""}<select id="${path}" data-bind="${path}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(get(path)) === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
  function get(path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), S); }
  function set(path, v) { const ks = path.split("."); const last = ks.pop(); const o = ks.reduce((o, k) => o[k], S); o[last] = v; }

  V.plan = () => {
    const rk = riskLevel(); const rc = { "停止": "ng", "高": "warn", "中": "info", "低": "ok" }[rk.lv];
    return `
  <section class="panel">
    <h2>企画</h2>
    <p class="lead">制作を始める前に、責任者・公開範囲・学習目標を決めます（マニュアルの段階0・1）。ここで決めた内容は、AI への依頼文、動画の表示、記録の書類に自動で入ります。</p>
    <div class="note ${rc === "ng" ? "ng" : rc === "warn" ? "warn" : ""}"><b>リスク区分：<span class="chip ${rc}">${esc(rk.lv)}</span></b>　${esc(rk.why)}</div>
  </section>
  <section class="panel">
    <h3>企画登録（段階0）</h3>
    <div class="grid2">
      ${fld("project.seriesTitle", "シリーズの名前（教材名）", "例：おなかの不調、それって気のせい？")}
      ${fld("project.mgmtNo", "教材管理番号", "団体で決めた番号。記録の書類すべてに入ります")}
      ${fld("project.edition", "版", "例：1.0。公開後に直したら上げます")}
      ${fld("project.owner", "責任者（氏名・所属）", "必須。決まらないと先へ進めません")}
      ${fld("project.coauthors", "共同制作者", "")}
      ${fld("project.org", "発信する団体名", "動画の左上に出ます")}
      ${sel("project.scope", "公開範囲", SCOPES, "必須。一般公開・販売は確認が厳しくなります")}
      ${fld("project.period", "公開予定期間", "例：2027年3月まで")}
      ${fld("project.lang", "使用言語", "")}
      ${fld("project.translation", "翻訳・国外公開の予定", "なければ「なし」")}
      ${fld("project.updater", "更新責任者", "内容が古くなっていないかを見直す人")}
      ${fld("project.supervisor", "監修者（氏名・所属）", "医学的内容を確認する人。説明文と承認記録に入ります")}
    </div>
    <div class="f" style="font-weight:700">高リスク素材の有無<span class="h" style="font-weight:400;color:var(--muted);font-size:.8rem">使う予定があるものに印をつけてください</span>
      <div class="row">${RISK_ITEMS.map(([k, t]) => `<label style="display:flex;gap:6px;align-items:center;font-weight:400"><input type="checkbox" id="project.risks.${k}" data-bind="project.risks.${k}" ${S.project.risks && S.project.risks[k] ? "checked" : ""}> ${esc(t)}</label>`).join("")}</div></div>
    ${S.project.risks && S.project.risks.patient ? '<p class="note ng">患者情報は AI に入力しないでください。症例を使う場合は、同意など適法に使える根拠を確かめ、再識別されないよう複数症例を合成した架空症例にしてください。</p>' : ""}
    ${S.project.risks && S.project.risks.others ? '<p class="note warn">他者の教材・出版物を主な素材にして作り直す企画は、このツールの対象外です（許諾型）。制作を始める前に、権利者から許諾を得る方針を決めてください。</p>' : ""}
  </section>
  <section class="panel">
    <h3>学習目標（段階1）</h3>
    <p class="lead">元の教科書やガイドラインを開く前に、見た人が何をできるようになるかを決めます。「第1章を要約する」ではなく、「腹痛のある人が、受診を急ぐべきサインに気づける」のように、行動で書きます。</p>
    <div class="grid2">
      ${sel("project.audience", "視聴者", [["public", "一般の人（患者・家族）"], ["student", "医療系の学生"], ["pro", "医療者"]])}
      ${fld("project.objLevel", "視聴者のレベルと前提知識", "例：医学の知識はない。病名は聞いたことがある")}
    </div>
    ${fld("project.objAction", "見終わったあとにできること", "必須。1行に1つ", "textarea", 'style="min-height:70px"')}
    <div class="grid2">
      ${fld("project.objScene", "扱う場面", "例：受診を迷っているとき")}
      ${fld("project.objEval", "伝わったかの確かめ方", "例：視聴後の1問クイズ、コメントの内容")}
    </div>
    ${fld("project.objOut", "扱わない範囲", "例：薬の選び方、個別の治療相談", "textarea", 'style="min-height:60px"')}
  </section>
  <section class="panel">
    <h3>動画の設定</h3>
    <div class="grid2">
      ${fld("project.domain", "領域・病名", "例：過敏性腸症候群（IBS）。動画の病名ラベルにも使います")}
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
  };

  const aiServiceField = (id) => `<label class="f">使った AI（サービス名・モデル名）<span class="h">AI 利用の記録（様式3）に残します。例：Claude（Claude Opus 5.5）、ChatGPT（GPT-5）</span><input type="text" id="${id}" data-bind="ui.aiService" value="${esc(S.ui.aiService || "")}"></label>`;

  V.cards = () => {
    const ids = S.cards.map((c) => c.id);
    const rows = S.cards.map((c) => {
      const { e, w } = cardIssues(c, ids); const v = c.verification || {};
      const st = e.length ? `<span class="chip ng">要修正 ${e.length}</span>` : w.length ? `<span class="chip warn">注意 ${w.length}</span>` : `<span class="chip ok">OK</span>`;
      return `<tr><td class="mono">${esc(c.id)}</td><td>${st}</td><td style="min-width:260px">${esc(c.assertion && c.assertion.plain_statement_ja)}<div class="muted" style="font-size:.8rem">${esc([...e, ...w].join("／"))}</div></td><td>${esc(c.assertion && c.assertion.common_misconception)}</td><td style="min-width:160px"><span class="chip">${esc(c.provenance && c.provenance.source_class)}</span> <span class="chip">利用根拠 ${esc(c.provenance && c.provenance.legal_basis || "?")}</span><div class="muted" style="font-size:.8rem">${esc((c.provenance && c.provenance.source || "").slice(0, 60))}</div></td>
        <td style="min-width:150px"><input type="text" id="vb-${esc(c.id)}" data-ver="${esc(c.id)}" data-k="by" value="${esc(v.by || "")}" placeholder="確認者" aria-label="${esc(c.id)} の確認者"><input type="date" id="vd-${esc(c.id)}" data-ver="${esc(c.id)}" data-k="date" value="${esc(v.date || "")}" aria-label="${esc(c.id)} の確認日" style="margin-top:4px"></td>
        <td><button class="b small" data-act="del-card" data-id="${esc(c.id)}" type="button">削除</button></td></tr>`;
    }).join("");
    const errN = S.cards.filter((c) => cardIssues(c, ids).e.length).length;
    const tab = S.ui.cardsTab || "ai";
    return `
  <section class="panel">
    <h2>事実カード</h2>
    <p class="lead">動画の根拠になる「事実の札」です（マニュアルの段階2〜5、様式1）。1枚に1つの命題を、元の文章を写さず中立的な短い文で書き、出典・利用根拠・確認者を記録します。</p>
    <div class="note warn"><b>AI に資料を読ませるときの注意</b><br>有料の論文・書籍・出版社の PDF などの全文を、許諾なく AI に入力して要約させることは、著作権法第30条の4の対象にならず、許諾などの根拠が必要になります。オープンライセンス（CC BY など）の資料や公的資料を優先し、判断できないものは入力しないでください。患者情報・個人情報・試験問題も入力しません。</div>
    <div class="tabs" role="tablist">
      ${[["ai", "AI に調査を頼む"], ["paste", "貼り付け・ファイル"], ["sample", "見本"]].map(([k, t]) => `<button role="tab" type="button" data-act="cards-tab" data-tab="${k}" aria-selected="${tab === k}">${t}</button>`).join("")}
    </div>
    ${tab === "ai" ? `
      <ol style="margin:0;padding-left:1.4em;max-width:72ch">
        <li>下の依頼文をコピーし、ウェブ検索ができるチャットAI（Claude、ChatGPT、Gemini など）に貼り付けて送ります。</li>
        <li>返ってきた答えを全部コピーし、「貼り付け・ファイル」のタブに貼ります。</li>
        <li>自動の点検で「要修正」が出たら、AI に直すよう頼むか、手で直します。</li>
        <li>人が一次資料を開いて内容を確かめ、表の「確認者・確認日」を記入します。</li>
      </ol>
      ${promptBox(P.research(projectForPrompt()), "research")}
      <p class="note warn">チャットAI は、存在しない論文や数字を作ることがあります。カードは必ず人が出典で確かめ、公開前に「AIに頼む」→「文献番号とライセンスの照合」も行ってください。</p>` : ""}
    ${tab === "paste" ? `
      ${aiServiceField("ai-service-cards")}
      <label class="f">AI の答え、または YAML／JSON のカード<span class="h">\`\`\`yaml … \`\`\` の囲みごと貼り付けて構いません</span><textarea id="cards-paste" class="mono tall" placeholder="- id: IBS-001&#10;  domain: IBS&#10;  ..."></textarea></label>
      <div class="row"><button class="b primary" data-act="cards-import" type="button">読み込む（同じIDは置き換え）</button>
      <label class="b" for="cards-file">ファイルから読み込む</label><input id="cards-file" type="file" accept=".yaml,.yml,.json,.md,.txt" hidden></div>` : ""}
    ${tab === "sample" ? `<p>見本の事実カード6件（過敏性腸症候群と機能性ディスペプシア、Rome V）を加えます。</p><div class="row"><button class="b primary" data-act="load-sample" type="button">見本を読み込む</button></div>` : ""}
  </section>
  <section class="panel">
    <div class="row" style="justify-content:space-between"><h3>読み込んだカード <span class="num muted">${S.cards.length}件</span></h3>
      <div class="row">${errN ? `<span class="chip ng">要修正 ${errN}件</span>` : S.cards.length ? '<span class="chip ok">形式の点検は合格</span>' : ""}
      <button class="b small" data-act="cards-export" type="button" ${S.cards.length ? "" : "disabled"}>cards.json を書き出す</button></div></div>
    ${S.cards.length ? `<div class="tablewrap"><table><thead><tr><th>ID</th><th>点検</th><th>主張文</th><th>よくある誤解</th><th>出典・利用根拠</th><th>確認者・確認日</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted" style="font-size:.85rem">利用根拠 B は「著作権で保護されない事実・データを自分の文で書いたもの」です。事実カードは原則 B で作ります。E（教育目的の例外、著作権法第35条）は一般公開の根拠にならないため使いません。</p>`
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
        <div class="grid2">
          <label class="f">この回の学習目標<span class="h">見終わったあとにできること</span><input type="text" id="ep-obj-${ep.id}" data-ep="${ep.id}" data-epf="objective" value="${esc(ep.objective || "")}"></label>
          <label class="f">自分で決めた構成<span class="h">例：誤解の問いかけ → 基準の数字 → 受診の目安。AI はこの順に沿って書きます</span><input type="text" id="ep-plan-${ep.id}" data-ep="${ep.id}" data-epf="plan" value="${esc(ep.plan || "")}"></label>
        </div>
        <div class="cardlist">${S.cards.map((c) => `<label class="cardpick"><input type="checkbox" data-act="ep-card" data-ep="${ep.id}" data-id="${esc(c.id)}" ${ep.cards.includes(c.id) ? "checked" : ""}>${esc(c.id)}</label>`).join("")}</div>
        <p class="muted" style="font-size:.85rem">${ep.cards.map((id) => cm[id] ? esc(id + "：" + (cm[id].assertion.common_misconception || cm[id].assertion.plain_statement_ja).slice(0, 40)) : "").join("<br>") || "カードを選んでください"}</p>
      </div>`).join("");
    return `
  <section class="panel">
    <h2>シリーズ構成</h2>
    <p class="lead">1本の動画で扱うカードは2〜3枚が目安です。回の分け方と説明の順序は、元の教科書やガイドラインの章立てに沿わせず、学習目標と視聴者の疑問から自分で決めます（マニュアルの原則2）。自動で小見出しごとに分けたあと、題・目標・構成・カードを手で直してください。</p>
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

  function editedScenes(ep) {
    if (!ep.aiOriginal || !ep.script) return null;
    const o = JSON.parse(ep.aiOriginal).scenes || [];
    return ep.script.scenes.filter((s, i) => !o[i] || ["caption", "narration", "speech"].some((k) => (s[k] || "") !== (o[i][k] || ""))).length;
  }
  V.script = () => {
    if (!S.episodes.length) return `<section class="panel"><h2>台本</h2><p>先に「シリーズ構成」で回を作ってください。</p><div class="row"><button class="b primary" data-go="series" type="button">シリーズ構成へ</button></div></section>`;
    const cm = cardMap();
    return `<section class="panel"><h2>台本</h2>
      <p class="lead">元の資料を閉じた状態で、事実カードと学習目標だけを材料に新しく書きます（マニュアルの段階6）。回ごとに依頼文をチャットAI に送り、返ってきた JSON を貼り付けると、根拠カード・数字・禁止表現・字幕の速さを自動で照合します。</p>
      <p class="note">AI の出力はそのまま使わず、人が言い回し・構成・例を選び直して仕上げてください。どの場面を人が直したかは自動で記録されます（様式3）。</p></section>` +
      S.episodes.map((ep, i) => {
        const cards = ep.cards.map((id) => cm[id]).filter(Boolean);
        const tab = S.ui.scriptTab[ep.id] || (ep.script ? "edit" : "ai");
        const ed = editedScenes(ep);
        return `<section class="panel">
          <div class="row" style="justify-content:space-between"><h3>第${i + 1}回　${esc(ep.title)}</h3>
            <div class="row">${ed !== null ? `<span class="chip info">人が直した場面 ${ed}/${ep.script.scenes.length}</span>` : ""}${approved(ep) ? '<span class="chip ok">承認済み</span>' : ep.approval && ep.approval.approved ? '<span class="chip warn">承認後に変更あり</span>' : ""}</div></div>
          ${!ep.objective && !S.project.objAction ? '<p class="note warn">学習目標が未設定です。「企画」か「シリーズ構成」で決めてから依頼文を作ってください。</p>' : ""}
          <div class="tabs" role="tablist">${[["ai", "AI に頼む"], ["paste", "貼り付け"], ["edit", "確認・修正"], ["check", "別のAIで意味を照合"]].map(([k, t]) => `<button role="tab" type="button" data-act="script-tab" data-ep="${ep.id}" data-tab="${k}" aria-selected="${tab === k}">${t}</button>`).join("")}</div>
          ${tab === "ai" ? promptBox(P.script(S.project, ep, cards, Object.keys(S.custom)), "script-" + ep.id) + `<div class="row"><button class="b small" data-act="draft" data-ep="${ep.id}" type="button">AI を使わずに下書きを作る</button><span class="muted" style="font-size:.8rem">カードの文をそのまま並べた下書きです。字幕が長すぎるので、手で短くする必要があります。</span></div>` : ""}
          ${tab === "paste" ? `${aiServiceField("ai-service-" + ep.id)}<label class="f">AI が返した JSON<textarea id="script-paste-${ep.id}" class="mono tall"></textarea></label><div class="row"><button class="b primary" data-act="script-import" data-ep="${ep.id}" type="button">読み込んで照合する</button></div>` : ""}
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
    if (!S.episodes.some((e) => e.script)) return `<section class="panel"><h2>監修・監査</h2><p>台本ができた回から監修できます。</p></section>`;
    const cm = cardMap();
    return `<section class="panel"><h2>監修・監査</h2><p class="lead">回ごとに2つの確認をします。<b>監修</b>は、監修者が字幕と根拠カードを見比べて医学的に正しいかを確かめます。<b>監査</b>は、監査担当が元の資料と見比べて、表現・構成・図が似すぎていないか、権利の処理が漏れていないかを確かめます（マニュアルの段階8、様式4）。同じ人が兼ねても構いません。両方がそろうと承認され、承認後に台本を変えると承認は自動で外れます。</p></section>` +
      S.episodes.filter((e) => e.script).map((ep) => {
        const bad = hardFail(runChecks(ep)).length, ap = ep.approval || {}, au = ep.audit || {}, ch = au.checks || {};
        const auOk = auditOk(ep);
        return `<section class="panel">
          <div class="row" style="justify-content:space-between"><h3>${esc(ep.title)}</h3><div class="row">${bad ? `<span class="chip ng">照合 不合格 ${bad}件</span>` : '<span class="chip ok">照合 合格</span>'}${auOk ? '<span class="chip ok">監査 済</span>' : '<span class="chip warn">監査 未</span>'}${approved(ep) ? '<span class="chip ok">承認済み</span>' : '<span class="chip warn">未承認</span>'}</div></div>
          <h3 style="font-size:.95rem">監修：字幕と根拠</h3>
          <div class="tablewrap"><table><thead><tr><th>場面</th><th>字幕</th><th>根拠カードの内容</th></tr></thead><tbody>
          ${ep.script.scenes.map((s, i) => `<tr><td class="mono">${i + 1}</td><td style="min-width:200px">${esc(s.narration)}</td><td style="min-width:260px">${(s.cards || []).map((id) => cm[id] ? `<b class="mono">${esc(id)}</b> ${esc(cm[id].assertion.plain_statement_ja)}<div class="muted" style="font-size:.8rem">${esc(cm[id].provenance.source)}</div>` : `<span class="chip ng">${esc(id)} なし</span>`).join("<hr style='border:0;border-top:1px solid var(--line)'>") || '<span class="muted">（締めの言葉）</span>'}</td></tr>`).join("")}
          </tbody></table></div>
          ${ep.semantic ? `<div class="note"><b>別のAIによる照合メモ</b><br>${esc(ep.semantic)}</div>` : ""}
          <h3 style="font-size:.95rem">監査：類似性と権利（様式4）</h3>
          <p class="muted" style="font-size:.85rem">文字の一致率だけで判断せず、元の資料を知っている人が見て、その特徴が感じ取れないかを確かめます。事実やデータが同じことは問題ではありません。</p>
          <div style="display:grid;gap:4px">${AUDIT_ITEMS.map(([k, t]) => `<label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" id="au-${ep.id}-${k}" data-audit="${ep.id}" data-k="${k}" ${ch[k] ? "checked" : ""}> <span>${esc(t)}</span></label>`).join("")}</div>
          <div class="grid3">
            <label class="f">監査担当<input type="text" id="au-a-${ep.id}" data-audit="${ep.id}" data-k="auditor" value="${esc(au.auditor || "")}"></label>
            <label class="f">監査日<input type="date" id="au-d-${ep.id}" data-audit="${ep.id}" data-k="date" value="${esc(au.date || today())}"></label>
            <label class="f">監査結果<select id="au-r-${ep.id}" data-audit="${ep.id}" data-k="result">${AUDIT_RESULTS.map(([v, t]) => `<option value="${v}" ${au.result === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
          </div>
          ${au.result === "return" ? '<p class="note warn">差し戻し：似ている箇所を削る、新しく作り直す、引用の要件を満たす形にする、許諾を得る、のどれかで直してから、もう一度監査してください。</p>' : ""}
          ${au.result === "legal" ? '<p class="note ng">法務確認へ回す：所属機関の法務・知財担当か弁護士の確認を受けるまで、公開しないでください。</p>' : ""}
          <h3 style="font-size:.95rem">承認</h3>
          <div class="grid3">
            <label class="f">監修者<input type="text" id="ap-r-${ep.id}" data-ap="${ep.id}" data-k="reviewer" value="${esc(ap.reviewer || S.project.supervisor || "")}"></label>
            <label class="f">承認日<input type="date" id="ap-d-${ep.id}" data-ap="${ep.id}" data-k="date" value="${esc(ap.date || today())}"></label>
            <label class="f">コメント<input type="text" id="ap-c-${ep.id}" data-ap="${ep.id}" data-k="comment" value="${esc(ap.comment || "")}"></label>
          </div>
          <div class="row">
            ${approved(ep) ? `<button class="b warn" data-act="unapprove" data-ep="${ep.id}" type="button">承認を取り消す</button>` : `<button class="b primary" data-act="approve" data-ep="${ep.id}" type="button" ${bad || !auOk ? "disabled" : ""}>承認する</button>`}
            <button class="b" data-act="packet" data-ep="${ep.id}" type="button">監修・監査用の資料を書き出す</button>
            ${bad ? '<span class="muted" style="font-size:.85rem">自動照合の不合格を直してから承認できます</span>' : !auOk ? '<span class="muted" style="font-size:.85rem">監査の6項目、監査担当、結果（承認か条件付き承認）がそろうと承認できます</span>' : ""}
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
      <p class="note">ナレーションにも権利があります。自分以外の人の声を録音して使うときは、その人の同意を得てください。音声合成サービスは、一般公開や商用での利用が利用規約で認められているかを確かめてください。音楽（BGM）はこのツールでは入れません。</p>
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
  const LICENSES = [["arr", "著作権表示のみ（All rights reserved）"], ["ccby", "CC BY 4.0（表示）"], ["ccbysa", "CC BY-SA 4.0（表示-継承）"], ["ccbync", "CC BY-NC 4.0（表示-非営利）"]];
  function licenseText() {
    const pj = S.project, y = (S.publish.pubDate || today()).slice(0, 4), who = pj.org || "（団体名）";
    const name = { ccby: "Creative Commons 表示 4.0 国際（CC BY 4.0）", ccbysa: "Creative Commons 表示-継承 4.0 国際（CC BY-SA 4.0）", ccbync: "Creative Commons 表示-非営利 4.0 国際（CC BY-NC 4.0）" }[S.publish.license];
    if (!name) return "© " + y + " " + who + ". All rights reserved. 本動画の無断複製、転載、改変、公衆送信および第三者への配布を禁じます。ただし、法令上認められる利用を除きます。";
    return "© " + y + " " + who + "　特に表示がない限り、本動画のうち制作者が独自に作成した文章・構成・挿絵は、" + name + "で提供します。引用部分、第三者素材、ロゴ、写真および個別に利用条件を表示した素材は対象外です。";
  }
  function description(ep, platform) {
    const pj = S.project, sc = ep.script, ap = ep.approval || {};
    const tags = platform === "x" ? "" : "\n\n#" + (pj.domain || "医療").replace(/[（）()\s]/g, "") + " #医療情報";
    const src = sourcesOf(ep);
    return [sc.description || sc.theme || ep.title, "", pj.disclaimer, "", "出典：", ...src.map((s) => "・" + s),
      "", "監修：" + (ap.reviewer || pj.supervisor || "（監修者）") + (ap.date ? "（" + ap.date + " 承認）" : ""), pj.aiNotice + "。",
      "発信：" + (pj.org || "（団体名）") + "　版：" + (pj.edition || "1.0") + (S.publish.pubDate ? "（" + S.publish.pubDate + " 公開）" : ""),
      platform === "x" ? "" : licenseText()].filter((x) => x !== "").join("\n") + tags;
  }
  const MANUAL_CHECKS = [
    ["recheck", "公開の直前に、重要な事実・数値を一次資料で確かめ直した（版・発行年・アクセス日を確認）"],
    ["ledger", "素材・権利台帳（様式2）を確認し、出典と権利の情報をたどれる"],
    ["art35", "教育目的の例外（著作権法第35条）を、一般公開の根拠にしていない"],
    ["persons", "患者情報・肖像・ロゴ・商標・サービスの利用規約を確認した"],
    ["aiinput", "AI に入力した資料について、許諾・ライセンス・利用規約・所属機関の手順を確認した（患者情報・個人情報・試験問題は入力していない）"],
    ["aistage", "AI への入力・生成の段階と、動画の公開・配布の段階を分けて、権利の根拠を確認した"],
    ["cc", "CC ライセンスは、自分たちが権利を持つ部分にだけ付けた"],
    ["incident", "権利侵害の指摘を受けたときの対応（所属内での共有、公開の停止、権利者への対応、原因の解明、再発防止）を決めた"]
  ];
  function publishItems() {
    const eps = S.episodes.filter((e) => e.script), pj = S.project, rk = riskLevel(), ids = S.cards.map((x) => x.id);
    const auto = [
      ["責任者と公開範囲が決まっている（段階0）", !!(pj.owner && pj.scope)],
      ["学習目標が決まっている（段階1）", !!pj.objAction],
      ["事実カードの形式の点検に合格", S.cards.length && S.cards.every((c) => !cardIssues(c, ids).e.length)],
      ["すべてのカードに確認者・確認日がある（段階5・様式1）", S.cards.length && S.cards.every((c) => c.verification && c.verification.by && c.verification.date)],
      ["事実カードの文献照合が済んでいる（verified_sources 以上）", S.cards.length && S.cards.every((c) => ["verified_sources", "verified_expert"].includes((c.publication_info || {}).status))],
      ["すべての回の台本が自動照合に合格", eps.length && eps.every((e) => !hardFail(runChecks(e)).length)],
      ["すべての回が監修と監査を経て承認されている（段階8・様式4）", eps.length && eps.every(approved)],
      ["AI を使った作業が記録されている（様式3）", S.aiLog.length > 0 || !eps.some((e) => e.aiOriginal)],
      ["版・公開日・責任者が決まっている（段階9）", !!(pj.edition && S.publish.pubDate && pj.owner)],
      ["AI で作ったことの表示がある", !!pj.aiNotice]
    ];
    const manual = MANUAL_CHECKS.map(([k, t]) => [t, !!S.publish.checks[k], k]);
    if (rk.lv === "高") manual.push(["法務・知財担当または専門家の確認を受けた（リスク区分：高）", !!(S.publish.checks.legal && S.publish.legalReview), "legal"]);
    if (pj.translation && pj.translation !== "なし") manual.push(["国外で公開する国・地域の法令と契約条件を確認した", !!S.publish.checks.abroad, "abroad"]);
    return { auto, manual, rk };
  }

  V.publish = () => {
    const eps = S.episodes.filter((e) => e.script);
    const { auto, manual, rk } = publishItems();
    const allOk = auto.every((x) => x[1]) && manual.every((x) => x[1]) && rk.lv !== "停止";
    const plat = S.ui.plat || "youtube";
    return `<section class="panel"><h2>公開</h2>
      <p class="lead">公開前の最終確認（マニュアルの10．最終チェックリスト、7.2 公開承認の最低条件）と、投稿の説明文・権利表示・記録一式の書き出しです。投稿は、各サービスの画面から人が行ってください。</p>
      <div class="note ${allOk ? "" : "warn"}"><b>${allOk ? "公開の条件がそろっています" : "まだ公開の条件がそろっていません"}</b>　リスク区分：<span class="chip ${{ "停止": "ng", "高": "warn", "中": "info", "低": "ok" }[rk.lv]}">${esc(rk.lv)}</span>　${esc(rk.why)}</div>
      <div class="grid2">
        <label class="f">公開日<input type="date" id="publish.pubDate" data-bind="publish.pubDate" value="${esc(S.publish.pubDate || "")}"></label>
        <label class="f">版<input type="text" id="project.edition2" data-bind="project.edition" value="${esc(S.project.edition || "")}"></label>
      </div>
      <h3 style="font-size:.95rem">自動で確かめた項目</h3>
      <ul class="checks" style="list-style:none;padding:0">${auto.map(([t, ok]) => `<li>${ok ? '<span class="chip ok">済</span>' : '<span class="chip warn">未</span>'}　${esc(t)}</li>`).join("")}</ul>
      <h3 style="font-size:.95rem">責任者が確かめる項目</h3>
      <div style="display:grid;gap:4px">${manual.map(([t, ok, k]) => `<label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" id="pc-${k}" data-pcheck="${k}" ${ok || S.publish.checks[k] ? "checked" : ""}> <span>${esc(t)}</span></label>`).join("")}</div>
      ${rk.lv === "高" ? `<label class="f">確認を受けた法務・知財担当または専門家（氏名・日付）<input type="text" id="publish.legalReview" data-bind="publish.legalReview" value="${esc(S.publish.legalReview || "")}"></label>` : ""}
    </section>
    <section class="panel"><h3>権利表示</h3>
      <p class="lead">CC ライセンスは、自分たちが権利を持つ部分（独自に作った文章・構成・挿絵）にだけ付けられます。BY-NC を選ぶと有償の研修などに使えなくなり、ND（改変禁止）は翻訳や字幕の付け直しを妨げるので選択肢から外しています。</p>
      ${sel("publish.license", "動画に付ける表示", LICENSES)}
      <div class="prompt"><pre id="lic-text">${esc(licenseText())}</pre><div class="row"><button class="b small" data-act="copy" data-src="lic-text" type="button">コピー</button></div></div>
    </section>
    <section class="panel"><h3>投稿の説明文</h3>
      <div class="tabs" role="tablist">${[["youtube", "YouTube"], ["tiktok", "TikTok"], ["instagram", "Instagram"], ["x", "X"]].map(([k, t]) => `<button role="tab" type="button" data-act="plat" data-tab="${k}" aria-selected="${plat === k}">${t}</button>`).join("")}</div>
      ${eps.map((ep) => `<div class="prompt"><h3 style="font-size:.95rem">${esc(ep.title)} ${approved(ep) ? "" : '<span class="chip warn">未承認</span>'}</h3><pre id="desc-${ep.id}">${esc(description(ep, plat))}</pre><div class="row"><button class="b small" data-act="copy" data-src="desc-${ep.id}" type="button">コピー</button></div></div>`).join("") || '<p class="muted">台本ができた回がありません。</p>'}
      <p class="note">YouTube と TikTok では、AI で作った内容であることを投稿時の設定でも示してください（各サービスの「改変・合成コンテンツ」などの項目）。</p>
    </section>
    <section class="panel"><h3>シリーズ一式と記録の書き出し</h3>
      <p>台本（JSON）、事実カード、説明文に加えて、マニュアルの記録様式（様式1 事実抽出・検証票、様式2 素材・権利台帳、様式3 独立創作記録と AI 利用記録、様式4 類似性・公開前監査票、最終承認）を、同じ版番号でまとめた ZIP を作ります。完成した動画と一緒に、所属の規程に従って保管してください。</p>
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
    if (!p.seriesTitle) Object.assign(p, { seriesTitle: "おなかの不調、それって気のせい？", org: "サンプル消化器ケア協会（架空の団体）", domain: "過敏性腸症候群（IBS）", supervisor: "（監修者名）", owner: "（責任者名）", mgmtNo: "SAMPLE-001", scope: "public", period: "（公開予定期間）", updater: "（更新責任者）",
      objLevel: "医学の知識はない。病名は聞いたことがある", objAction: "検査で異常がなくても、おなかの症状が続くときは専門医に相談しようと思える", objScene: "受診を迷っているとき", objOut: "薬の選び方、個別の治療相談", prefix: "NG", topics: "過敏性腸症候群の診断基準（Rome V）\n機能性ディスペプシアの診断基準（Rome V）" });
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

  function importCards(text, purpose) {
    const cs = parseCards(text); const m = new Map(S.cards.map((c) => [c.id, c]));
    cs.forEach((c) => { const old = m.get(c.id); if (old && old.verification && !c.verification) c.verification = old.verification; m.set(c.id, c); });
    S.cards = [...m.values()].sort((a, b) => a.id.localeCompare(b.id));
    logAI({ step: "事実カード", service: S.ui.aiService || "（未記入）", purpose: purpose || "事実カードの作成・取り込み", detail: cs.length + "件（" + cs.map((c) => c.id).slice(0, 5).join("、") + (cs.length > 5 ? "…" : "") + "）" });
    toast(cs.length + "件のカードを読み込みました"); render();
  }

  function importScript(ep, text) {
    let t = String(text || "").trim(); const m = t.match(/```(?:json)?\s*\n([\s\S]*?)```/); if (m) t = m[1];
    const a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a < 0 || b < a) throw new Error("JSON が見つかりませんでした。AI の答えを全部貼り付けてください。");
    const sc = JSON.parse(t.slice(a, b + 1));
    if (!Array.isArray(sc.scenes) || !sc.scenes.length) throw new Error("scenes（場面の並び）がありません。");
    sc.scenes.forEach((s) => { s.cards = Array.isArray(s.cards) ? s.cards : []; if (!s.speech) s.speech = s.narration; });
    ep.script = sc; ep.aiOriginal = JSON.stringify(sc); S.ui.scriptTab[ep.id] = "edit";
    logAI({ step: "台本", service: S.ui.aiService || "（未記入）", purpose: "台本の下書き（" + ep.title + "）", detail: "依頼文：スタジオの台本用の依頼文（事実カード " + ep.cards.join("、") + "、学習目標、構成メモ）" });
    const bad = hardFail(runChecks(ep)).length; toast(bad ? "読み込みました。照合で " + bad + " 件の不合格があります" : "読み込みました。照合はすべて合格です");
    render();
  }

  const AUD = { public: "一般の人", student: "医療系の学生", pro: "医療者" };
  const scopeName = () => (SCOPES.find(([v]) => v === S.project.scope) || ["", "未定"])[1];
  function headLines(title) {
    const pj = S.project;
    return ["# " + title, "", "| 項目 | 内容 |", "|---|---|", "| 教材名 | " + pj.seriesTitle + " |", "| 教材管理番号 | " + (pj.mgmtNo || "") + " |", "| 版 | " + (pj.edition || "") + " |",
      "| 責任者 | " + (pj.owner || "") + " |", "| 公開範囲 | " + scopeName() + " |", "| 作成日 | " + today() + " |", "", "準拠：" + manualName(), ""];
  }
  function packet(ep) {
    const cm = cardMap(), pj = S.project, au = ep.audit || {}, ap = ep.approval || {};
    const L = headLines("監修・監査用資料（様式4を含む）：" + ep.title);
    L.push("- 発信：" + pj.org, "- 視聴者：" + (AUD[pj.audience] || pj.audience), "- 学習目標：" + (ep.objective || pj.objAction || ""), "- 自分で決めた構成：" + (ep.plan || ""), "", "## 場面と根拠", "");
    ep.script.scenes.forEach((s, i) => {
      L.push("### 場面" + (i + 1) + "（" + s.kind + "）", "- 大見出し：" + String(s.caption || "").replace(/\n/g, " "), "- 字幕：" + s.narration, "- 読み上げ：" + (s.speech || ""), "- 根拠：");
      (s.cards || []).forEach((id) => { const c = cm[id]; L.push("  - " + id + "：" + (c ? c.assertion.plain_statement_ja + "（" + c.provenance.source + "）" : "見つからない")); });
      L.push("");
    });
    L.push("## 自動照合の結果", "");
    runChecks(ep).forEach((r) => L.push("- " + (r.ok ? "OK" : r.soft ? "確認" : "NG") + " 場面" + r.n + " " + r.k + " " + r.d));
    if (ep.semantic) L.push("", "## 別のAIによる照合メモ", "", ep.semantic);
    L.push("", "## 類似性・公開前監査（様式4）", "");
    AUDIT_ITEMS.forEach(([k, t]) => L.push("- [" + (au.checks && au.checks[k] ? "x" : " ") + "] " + t));
    L.push("", "- 監査結果：" + ((AUDIT_RESULTS.find(([v]) => v === au.result) || ["", "（未記入）"])[1]), "- 監査担当：" + (au.auditor || ""), "- 監査日：" + (au.date || ""));
    L.push("", "## 監修と承認", "", "- 監修者：" + (ap.reviewer || ""), "- 承認日：" + (ap.date || ""), "- コメント：" + (ap.comment || ""), "- 状態：" + (approved(ep) ? "承認済み" : "未承認"), "", "---", "クリーンルーム動画スタジオで作成");
    return L.join("\n");
  }
  const csv = (rows) => "﻿" + rows.map((r) => r.map((x) => '"' + String(x == null ? "" : x).replace(/"/g, '""') + '"').join(",")).join("\r\n");
  function form1() {
    const eps = S.episodes;
    return csv([["教材管理番号", "事実ID", "中立的な事実・命題", "一次資料（著者・題名・年・DOI/URL）", "DOI", "ライセンス", "利用根拠", "対象・条件・単位・時点", "一致・不一致／限界", "教材での使用箇所", "確認者", "確認日", "照合状態"]].concat(
      S.cards.map((c) => [S.project.mgmtNo, c.id, c.assertion.plain_statement_ja, c.provenance.source, c.provenance.doi, c.provenance.source_license, c.provenance.legal_basis, JSON.stringify(c.assertion.condition || ""), c.uncertainty || "",
        eps.filter((e) => e.cards.includes(c.id)).map((e) => e.title).join("／"), (c.verification || {}).by, (c.verification || {}).date, (c.publication_info || {}).status])));
  }
  function form2() {
    const eps = S.episodes.filter((e) => e.script), rows = [["素材ID", "素材・出典", "利用箇所", "利用根拠（A〜G）", "条件・表示・取得日", "証拠ファイル"]];
    const used = new Set(eps.flatMap((e) => e.script.scenes.flatMap((s) => s.cards || [])));
    S.cards.filter((c) => used.has(c.id)).forEach((c) => rows.push([c.id, c.provenance.source, eps.filter((e) => e.script.scenes.some((s) => (s.cards || []).includes(c.id))).map((e) => e.id).join("／"), c.provenance.legal_basis || "B", (c.provenance.source_license || "") + (c.provenance.accessed ? "／確認日 " + c.provenance.accessed : ""), "cards.json"]));
    eps.forEach((e) => rows.push(["SCRIPT-" + e.id, "台本（字幕・読み上げ・構成）", e.id, "A（自作。AI の利用は様式3）", "", "scripts/" + e.id + ".json、records/form3_independent_creation.md"]));
    const vis = new Set(eps.flatMap((e) => e.script.scenes.map((s) => s.visual)));
    [...vis].forEach((v) => rows.push(["ILL-" + v, S.custom[v] ? "追加した挿絵（SVG）" : "組み込みの挿絵（クリーンルーム動画スタジオ）", "各回", S.custom[v] ? "A（自作。AI で作った場合は様式3に記録）" : "F（MIT License）", "", S.custom[v] ? "作業ファイル（custom）" : CFG.repository]));
    rows.push(["FONT", "Zen Kaku Gothic New・BIZ UDPGothic（Google Fonts）", "全体", "F（SIL Open Font License）", "", "https://fonts.google.com/"]);
    const tts = { none: ["なし（字幕のみ）", "—"], upload: ["自分で用意した音声", "A または G（話者・実演者の同意と権利を確認）"], google: ["Google Cloud Text-to-Speech", "G（サービスの利用規約）"], browser: ["なし（試聴のみ）", "—"] }[S.tts.mode] || ["", ""];
    rows.push(["VOICE", "ナレーション：" + tts[0], "全体", tts[1], "", ""]);
    rows.push(["BGM", "使用しない", "—", "—", "", ""]);
    return csv(rows);
  }
  function form3() {
    const pj = S.project, eps = S.episodes.filter((e) => e.script);
    const L = headLines("独立創作記録（様式3）");
    L.push("## 学習目標と独自の教育設計", "", "- 視聴者：" + (AUD[pj.audience] || ""), "- レベルと前提知識：" + (pj.objLevel || ""), "- 見終わったあとにできること：" + (pj.objAction || ""), "- 扱う場面：" + (pj.objScene || ""), "- 確かめ方：" + (pj.objEval || ""), "- 扱わない範囲：" + (pj.objOut || ""), "");
    eps.forEach((e) => {
      const ed = editedScenes(e);
      L.push("### " + e.title, "- 事実カード：" + e.cards.join("、"), "- 学習目標：" + (e.objective || ""), "- 自分で決めた構成：" + (e.plan || ""),
        "- AI の下書き：" + (e.aiOriginal ? "あり" : "なし（人が作成）"), "- 人が直した場面：" + (ed === null ? "—" : ed + "/" + e.script.scenes.length), "");
    });
    L.push("## 生成AIの利用", "", "| 日時 | 工程 | サービス名・モデル名 | 用途 | 内容 |", "|---|---|---|---|---|");
    S.aiLog.forEach((a) => L.push("| " + [a.date, a.step, a.service, a.purpose, a.detail].map((x) => String(x || "").replace(/\|/g, "／")).join(" | ") + " |"));
    L.push("", "## 共同制作者と担当", "", "- 責任者：" + (pj.owner || ""), "- 共同制作者：" + (pj.coauthors || ""), "- 監修者：" + (pj.supervisor || ""));
    return L.join("\n");
  }
  function finalApproval() {
    const { auto, manual, rk } = publishItems(), pj = S.project;
    const L = headLines("最終チェックと最終承認");
    L.push("- リスク区分：" + rk.lv + "（" + rk.why + "）", "- 公開日：" + (S.publish.pubDate || ""), "- 権利表示：" + licenseText(), S.publish.legalReview ? "- 法務・専門家の確認：" + S.publish.legalReview : null, "", "## 自動で確かめた項目", "");
    auto.forEach(([t, ok]) => L.push("- [" + (ok ? "x" : " ") + "] " + t));
    L.push("", "## 責任者が確かめた項目", "");
    manual.forEach(([t, ok]) => L.push("- [" + (ok ? "x" : " ") + "] " + t));
    L.push("", "## 最終承認", "", "| 項目 | 内容 |", "|---|---|", "| 教材名 | " + pj.seriesTitle + " |", "| 版 | " + (pj.edition || "") + " |", "| 責任者 | " + (pj.owner || "") + " |", "| 承認日 |  |", "| 公開範囲 | " + scopeName() + " |", "| 未解決事項 |  |");
    return L.filter((x) => x !== null).join("\n");
  }

  async function makeZip() {
    if (!window.JSZip) { toast("ZIP を作る部品を読み込めませんでした。インターネットにつながる環境で開いてください"); return; }
    const z = new window.JSZip(); const eps = S.episodes.filter((e) => e.script);
    z.file("cards.json", JSON.stringify(S.cards, null, 1));
    eps.forEach((ep) => {
      const sc = Object.assign({}, ep.script, { ai_notice: S.project.aiNotice, approved: approved(ep), approval: ep.approval, audit: ep.audit || {}, edition: S.project.edition });
      z.file("scripts/" + ep.id + ".json", JSON.stringify(sc, null, 1));
      z.file("records/form4_audit_" + ep.id + ".md", packet(ep));
      z.file("descriptions/" + ep.id + ".txt", description(ep, "youtube"));
    });
    z.file("records/form1_fact_verification.csv", form1());
    z.file("records/form2_rights_ledger.csv", form2());
    z.file("records/form3_independent_creation.md", form3());
    z.file("records/ai_log.csv", csv([["日時", "工程", "サービス名・モデル名", "用途", "内容"]].concat(S.aiLog.map((a) => [a.date, a.step, a.service, a.purpose, a.detail]))));
    z.file("records/final_approval.md", finalApproval());
    z.file("LICENSE_NOTICE.txt", licenseText());
    z.file("AI_RULES.md", P.agentsMemo(S.project, "other"));
    z.file("CLAUDE.md", P.agentsMemo(S.project, "claude"));
    z.file("AGENTS.md", P.agentsMemo(S.project, "codex"));
    z.file("README.txt", [S.project.seriesTitle + "　版 " + (S.project.edition || ""), "", "クリーンルーム動画スタジオで作ったシリーズ一式です。", "scripts/：台本（JSON）　cards.json：事実カード　descriptions/：投稿の説明文", "records/：記録様式（様式1〜4、AI利用記録、最終承認）", "", "準拠：" + manualName(), "", "本ツールの開発は、" + CFG.grants.map((g) => g.funder).join("、") + "の助成を受けて行いました。", CFG.repository].join("\n"));
    download("series_package_v" + (S.project.edition || "1") + ".zip", await z.generateAsync({ type: "blob" }));
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
      else if (act === "approve") { const ep = epOf(b.dataset.ep); const ap = ep.approval || {}; if (!ap.reviewer && !S.project.supervisor) throw new Error("監修者の名前を入れてください"); if (!auditOk(ep)) throw new Error("監査（6項目・監査担当・結果）がそろっていません"); ep.approval = Object.assign({ reviewer: S.project.supervisor, date: today() }, ap, { approved: true, hash: hash(ep.script) }); toast("承認しました"); render(); }
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
      else if (act === "back-cards") importCards($("#back-cards").value, "文献番号とライセンスの照合（コード生成AI）");
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
    else if (el.dataset.ver) { const c = S.cards.find((x) => x.id === el.dataset.ver); c.verification = c.verification || {}; c.verification[el.dataset.k] = el.value; save(); }
    else if (el.dataset.audit && el.type !== "checkbox" && el.tagName !== "SELECT") { const ep = S.episodes.find((e) => e.id === el.dataset.audit); ep.audit = ep.audit || { checks: {} }; ep.audit[el.dataset.k] = el.value; save(); }
    else if (el.dataset.semantic) { const ep = S.episodes.find((e) => e.id === el.dataset.semantic); ep.semantic = el.value; save(); }
  });

  document.addEventListener("change", async (ev) => {
    const el = ev.target;
    if (el.dataset.actChange === "video-ep") { S.ui.videoEp = el.value; render(); }
    else if (el.dataset.actChange === "ai-task") { S.ui.aiTask = el.value; render(); }
    else if (el.dataset.sc && el.tagName === "SELECT") { render(); }
    else if (el.dataset.audit) { const ep = S.episodes.find((e) => e.id === el.dataset.audit); ep.audit = ep.audit || { checks: {} }; ep.audit.checks = ep.audit.checks || {}; if (el.type === "checkbox") ep.audit.checks[el.dataset.k] = el.checked; else ep.audit[el.dataset.k] = el.value; render(); }
    else if (el.dataset.audit === undefined && el.dataset.pcheck) { S.publish.checks[el.dataset.pcheck] = el.checked; render(); }
    else if (el.dataset.bind && (el.tagName === "SELECT" || el.type === "checkbox" || el.type === "date")) { const pos = scrollY; render(); scrollTo(0, pos); }
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
  S.project.risks = Object.assign(fresh().project.risks, S.project.risks || {}); S.publish = Object.assign(fresh().publish, S.publish || {}); S.publish.checks = S.publish.checks || {}; S.aiLog = S.aiLog || [];
  renderFooter(); restoreCustom().then(render);
  window.CRVS_APP = { state: () => S, runChecks, parseCards, cardIssues, draftScript, records: () => ({ form1: form1(), form2: form2(), form3: form3(), final: finalApproval(), packet: S.episodes[0] && S.episodes[0].script ? packet(S.episodes[0]) : "" }) };
})();
