/* AI への依頼文を組み立てる。チャットAI（調査・台本・照合・イラスト）と、コード生成AI（Claude Code / Codex / その他）の両方 */
(function () {
  const VISUALS = {
    question: "疑問の提示（検査結果の紙と「？」）。label に紙の見出しを書ける",
    brain_gut: "脳と腸の双方向の矢印",
    calendar: "1か月のカレンダーに印。marks に印の数（1〜10）",
    checklist: "3つまでの確認項目。points に短い文の配列",
    consult: "医療機関の建物。label に一言（例：専門医に相談）",
    big_number: "大きな数字を1つ見せる。big に短い文字列（例：週2日）",
    people: "10人の人型のうち何人かを強調。ratio に「3/10」の形",
    compare: "2つを並べて比べる（○と×）。points に2つの短い文"
  };

  const RULES_CORE = [
    "著作物（論文・ガイドライン・教科書・ウェブ記事）の文章、表、図を写さない。事実と数値だけを、自分の言葉で書く。",
    "数値は一次資料（論文の本文か抄録、ガイドラインの本文）で確認できたものだけを書く。二次資料から取った数値は uncertainty に「二次資料経由」と書く。",
    "DOI・PMID・PMCID・ライセンスは、確認できたものだけを書き、確認できなければ null にする。記憶で埋めない。",
    "1枚のカードには1つの命題だけを書き、識別子は1つの文献にそろえる。",
    "ガイドラインを出典にするときは、その版の本文に書いてあることだけを書く。",
    "数値は、対象（誰のデータか）、分母、単位、時点、条件を一緒に書く。研究の結果は、研究デザイン、対象、限界も書く。",
    "著者の推測・評価・独自の分類は、事実と区別する（事実として書かない）。",
    "孫引きは独立した確認とみなさない。別の独立した資料で一致・不一致を確かめ、不一致や限界は uncertainty に書く。",
    "出典の版・発行年・更新日と、確認した日（アクセス日）を書く。"
  ];
  const AI_INPUT = [
    "出典は、CC BY などのオープンライセンスの資料と、公的機関の資料を優先する。",
    "有料の論文・書籍・出版社の PDF など、全文の利用が許されていない資料は、全文を読み込んで要約しない。公開されている抄録や公的な情報に書かれた事実だけを使い、使えない場合はその旨を書く。",
    "患者の情報、個人情報、未公表の研究、試験問題は扱わない。"
  ];

  function audienceText(a) {
    return { public: "一般の人（患者・家族を含む）", student: "医学生・看護学生など医療系の学生", pro: "医療者（専門職）" }[a] || a;
  }

  function cardTemplate(prefix) {
    return [
      "- id: " + prefix + "-001",
      "  domain: " + prefix,
      "  subdomain: （小見出し）",
      "  assertion:",
      "    plain_statement_ja: （自分の言葉で書いた1つの命題。数値は出典で確認したものだけ）",
      "    condition: {criteria: （基準の名前と年版）, population: （対象）, denominator: （分母）, unit: （単位）, timepoint: （時点）, design: （研究デザイン）}",
      "    differential: （紛らわしいもの。なければ null）",
      "    common_misconception: （よくある誤解を1文で）",
      "  provenance:",
      "    source_ref: SRC-001",
      "    source: （著者. 題名. 雑誌 年;巻:頁）",
      "    doi: null",
      "    pmid: null",
      "    pmcid: null",
      "    url: null",
      "    source_license: （CC BY 4.0、CC BY-NC-ND 4.0、出版社の著作物 など）",
      "    accessed: '（確認した日 YYYY-MM-DD）'",
      "    legal_basis: B",
      "    source_class: OPEN  # OPEN / RESTRICTED / GOV_JP / GOV_US / UNKNOWN",
      "  uncertainty: null",
      "  publication_info:",
      "    created: '" + new Date().toISOString().slice(0, 10) + "'",
      "    verifier: null",
      "    verified_at: null",
      "    status: draft"
    ].join("\n");
  }

  const P = {};
  P.VISUALS = VISUALS;

  /* 1. 事実カードの調査（チャットAI。ウェブ検索ができるものを使う） */
  P.research = function (pj) {
    const prefix = (pj.prefix || "XX").toUpperCase();
    return [
      "あなたは医療者教育の教材を作る調査担当です。「クリーンルーム方式」で、著作権で保護される表現を含まない事実カードを作ってください。",
      "",
      "## 対象",
      "- 領域：" + (pj.domain || "（領域）"),
      "- 扱うテーマ：" + (pj.topics || "（テーマを箇条書きで）"),
      "- 使う予定の動画の視聴者：" + audienceText(pj.audience),
      "- 優先する出典：" + (pj.sourcesHint || "日本の診療ガイドライン、国際ガイドライン、公的機関の資料。CC BY の資料を優先"),
      "- 件数の目安：" + (pj.cardTarget || 20) + "件",
      "",
      "## 守るルール（クリーンルーム方式：事実だけを取り出し、表現は写さない）",
      RULES_CORE.map((r, i) => (i + 1) + ". " + r).join("\n"),
      "",
      "## 資料の扱い（著作権に配慮するため）",
      AI_INPUT.map((r) => "- " + r).join("\n"),
      "",
      "## 形式",
      "6. ID は " + prefix + "-001 から連番。作れなかった番号は欠番として一覧にする。",
      "7. 出典は SRC-001 から番号を振り、各カードの provenance.source_ref に入れる。",
      "8. legal_basis は B（事実を自分の文で書いたもの）、status は draft、verifier は null にする。",
      "9. YAML の中に脚注番号（[1] など）、アンカー（&）、マージキー（<<:）を入れない。",
      "10. 主張文に「（要確認）」などの括弧書きを入れず、不確かな点は uncertainty に書く。",
      "",
      "## 出力の形",
      "最初に出典の一覧表（| SRC | 出典 | DOI | ライセンス表示 | source_class |）を書き、次に事実カードを1つの YAML ブロックで書いてください。1枚の形は次のとおりです。",
      "",
      "```yaml",
      cardTemplate(prefix),
      "```"
    ].join("\n");
  };

  /* 2. 台本（チャットAI） */
  P.script = function (pj, ep, cards, customVisuals) {
    const vis = Object.assign({}, VISUALS);
    (customVisuals || []).forEach((n) => { vis[n] = "利用者が追加した絵"; });
    const slim = cards.map((c) => ({
      id: c.id, statement: c.assertion.plain_statement_ja, condition: c.assertion.condition,
      misconception: c.assertion.common_misconception, source: c.provenance && c.provenance.source
    }));
    return [
      "次の事実カードだけを根拠に、縦型ショート動画（" + pj.minSec + "〜" + pj.maxSec + "秒）の台本を JSON で書いてください。",
      "",
      "## 条件",
      "- 視聴者：" + audienceText(pj.audience),
      "- 回のテーマ：" + (ep.title || "（未設定）"),
      "- この回の学習目標（見終わったあとにできること）：" + (ep.objective || pj.objAction || "（未設定）"),
      "- 視聴者のレベルと前提知識：" + (pj.objLevel || "（未設定）"),
      "- 扱わない範囲：" + (pj.objOut || "（なし）"),
      ep.plan ? "- 私が決めた構成（この順と考え方に沿う）：" + ep.plan : "",
      "- 下の事実カードと上の学習目標だけを材料に、独自の例・独自の構成で書く。既存の教科書・論文・ガイドライン・他の動画の文章、図、症例、問題を再現しない。",
      "- 実在の患者を思わせる症例を作らない。症例を使うときは架空のものにする。",
      "- 場面は4〜6個。最初は「よくある誤解」を問いかけ、最後は締めの一言にする。",
      "- 各場面の narration（字幕）は、1秒あたり6.5字以下で読める長さにする（目安は1場面25〜45字）。",
      "- 事実を述べる場面には、根拠のカードIDを cards に必ず入れる。カードにない事実や数字を足さない。",
      "- 数字は、カードに書いてある数字だけを使う。",
      "- 基準や目安を言うときは、基準の名前（例：Rome V、日本のガイドライン）を入れる。",
      "- 次の言葉は使わない：" + (pj.banned || []).join("、"),
      pj.audience === "public" ? "- 一般向けなので、薬の名前を出さず、個人に診断や治療を勧める言い方をしない。" : "",
      "- speech には読み上げ用の文を書く。英字の略語や記号は読み方をカタカナにする（例：IBS→アイビーエス）。",
      "- visual は次から選ぶ：",
      Object.keys(vis).map((k) => "  - " + k + "：" + vis[k]).join("\n"),
      "",
      "## 出力（JSON のみ。前後に説明を書かない）",
      "```json",
      JSON.stringify({
        theme: "（問いかけの題）", disease: "（画面左上の病名ラベル）", standard: "（基準名と年）",
        scenes: [
          { visual: "question", caption: "（大見出し。改行は \\n、2行まで、1行10字以内）", narration: "（字幕）", speech: "（読み上げ用）", cards: ["ID"], kind: "misconception" },
          { visual: "big_number", big: "週2日", caption: "…", narration: "…", speech: "…", cards: ["ID"], kind: "fact" },
          { visual: "consult", label: "専門医に相談", caption: "…", narration: "…", speech: "…", cards: [], kind: "closing" }
        ],
        source_line: "出典：（主な出典を1〜2行。改行は \\n）",
        description: "（投稿の説明文。誤解→事実→相談の順に3〜4文）"
      }, null, 1),
      "```",
      "",
      "## 事実カード",
      "```json",
      JSON.stringify(slim, null, 1),
      "```"
    ].filter((x) => x !== "").join("\n");
  };

  /* 3. 意味の照合（別のチャットAI。台本を書いたAIとは別のものを使う） */
  P.semantic = function (ep, cards) {
    return [
      "あなたは医療情報の照合係です。次の台本の各場面の narration が、示された事実カードの内容だけで裏づけられているかを確かめてください。",
      "言い過ぎ（「必ず」「治る」など）、カードにない事実、数字の違い、意味の取り違えがあれば指摘してください。",
      "出力は次の JSON のみ：{\"scenes\":[{\"no\":1,\"ok\":true,\"issue\":\"\"}],\"overall\":\"\"}",
      "",
      "## 台本",
      "```json", JSON.stringify(ep.script, null, 1), "```",
      "## 事実カード",
      "```json", JSON.stringify(cards.map((c) => ({ id: c.id, statement: c.assertion.plain_statement_ja, condition: c.assertion.condition })), null, 1), "```"
    ].join("\n");
  };

  /* 4. 新しい絵（SVG） */
  P.svg = function (name, desc) {
    return [
      "医療教育用ショート動画の挿絵を、SVG で1枚描いてください。",
      "- 内容：" + (desc || "（描きたいもの）"),
      "- 名前：" + (name || "new_visual"),
      "- 大きさ：viewBox=\"0 0 1200 1200\"。背景は透明。",
      "- 色は4色まで：#1F7A8C（主）、#E07A5F（強調）、#1E2A32（線・文字）、#E2EEF0（淡い面）。",
      "- 線は太め（10〜14）、角は丸く。文字は入れても2語まで。",
      "- 実在の人物、ロゴ、商標、赤十字に似た十字、医薬品の名前や包装は描かない。",
      "- <script> や外部ファイルへの参照を入れない。",
      "出力は <svg …>…</svg> のみ。"
    ].join("\n");
  };

  /* ---------- コード生成AI 向けの案内 ---------- */
  const TOOLS = {
    claude: {
      name: "Claude Code",
      setup: [
        "Claude Code を入れる（初回のみ）：https://docs.claude.com/ja/docs/claude-code の案内に従う。",
        "作業用フォルダを作り、このページで書き出したファイルを置く。",
        "そのフォルダでターミナル（Windows は PowerShell）を開き、claude と入力して起動する。",
        "下の依頼文を貼り付けて送る。確認を求められたら、内容を読んでから許可する。"
      ],
      memo: "CLAUDE.md"
    },
    codex: {
      name: "Codex",
      setup: [
        "Codex（OpenAI）を入れる（初回のみ）：公式の案内に従い、CLI か IDE 拡張を使えるようにする。",
        "作業用フォルダを作り、このページで書き出したファイルを置く。",
        "そのフォルダで codex を起動する（IDE 拡張なら、フォルダを開いて Codex のパネルを開く）。",
        "下の依頼文を貼り付けて送る。変更の提案が出たら、内容を読んでから適用する。"
      ],
      memo: "AGENTS.md"
    },
    other: {
      name: "その他（Cursor、GitHub Copilot など）",
      setup: [
        "使っているエディタで作業用フォルダを開く。",
        "このページで書き出したファイルをフォルダに置く。",
        "AI のチャット（エージェント）パネルを開き、下の依頼文を貼り付ける。",
        "コマンドの実行を求められたら、内容を確かめてから実行する。"
      ],
      memo: "README"
    }
  };
  P.TOOLS = TOOLS;

  const COMMON_TAIL = [
    "",
    "## 進め方の約束",
    "- 私はプログラミングの初心者です。各手順で、何をするのか・何が起きるのかを短く説明してから実行してください。",
    "- コマンドは、私のパソコン（{OS}）でそのまま使える形で示してください。",
    "- 事実カードの主張文と数値は書き換えないでください（クリーンルーム方式のルール）。",
    "- 最後に、できたファイルの場所と、ブラウザのスタジオに戻ってすることを教えてください。"
  ];

  P.CODE_TASKS = {
    batch: {
      title: "高音質のナレーションで動画を一括作成する（自分のパソコンで）",
      when: "ブラウザ内の書き出しより自然な声にしたいとき、本数が多いとき",
      needs: "「公開」の画面で書き出したシリーズ一式（ZIP）",
      back: null,
      body: (pj) => [
        "シリーズ一式（series_package.zip）を展開したフォルダで作業します。scripts/ に台本の JSON、cards.json に事実カードがあります。",
        "次のことを手伝ってください。",
        "1. Python 3 と ffmpeg が使えるようにする（入っていなければ入れ方を案内する）。",
        "2. " + pj.repo + " の local/ フォルダの中身（make_all.py、render.py、check.py、tools/、requirements.txt）を、このフォルダにコピーする。",
        "3. pip install -r requirements.txt を実行する。make_all.py は、このフォルダの cards.json と scripts/*.json を読む。",
        "4. 音声合成は " + (pj.ttsPlan || "Windows 標準の音声（tools/tts_windows.ps1）") + " を使う。",
        "5. scripts/ の全台本を一括で動画にし、out/ に MP4 を作る。照合で不合格の台本は飛ばして理由を表示する。"
      ]
    },
    mp4: {
      title: "WebM の動画を MP4 に変換する",
      when: "書き出した動画が .webm で、投稿先が MP4 を求めるとき",
      needs: "書き出した .webm ファイル",
      back: null,
      body: () => [
        "このフォルダにある .webm の動画を、SNS に投稿できる MP4（H.264・AAC、1080×1920、30fps）に一括変換してください。",
        "ffmpeg が無ければ入れ方を案内してください。元のファイルは消さず、同じ名前で .mp4 を作ってください。"
      ]
    },
    verify: {
      title: "事実カードの文献番号とライセンスを照合する",
      when: "事実カードを公開・共有する前（PMID・DOI・ライセンスを API で確かめる）",
      needs: "「事実カード」の画面で書き出した cards.json",
      back: "cards",
      body: (pj) => [
        "cards.json の各カードについて、provenance の DOI・PMID・PMCID・ライセンスを公開 API で照合するスクリプトを書いて実行してください。",
        "- Crossref（https://api.crossref.org/works/{DOI}、mailto に " + (pj.email || "私のメールアドレス") + " を付ける）で書誌と license を確認する。",
        "- NCBI の ID 変換 API で PMID・PMCID を確認する。毎秒3回を超えないようにする。",
        "- 確定できたものだけを書き込み、食い違いや未確認は書き換えずに一覧にする。値を推測で埋めない。",
        "- license の URL が creativecommons.org/licenses/by/ か publicdomain/zero なら source_class を OPEN、by-nc や by-nd を含めば RESTRICTED にする。",
        "- 照合できたカードには provenance.id_check（checked_at、doi_resolved、pmid_matched、license_from_crossref、notes）を付ける。",
        "- 結果を cards_verified.json に保存し、変更点の一覧を表示する。"
      ]
    },
    visual: {
      title: "新しい挿絵を追加する",
      when: "用意された8種類の絵では内容に合わないとき",
      needs: "なし（チャットAIでも作れます）",
      back: "svg",
      body: () => [
        "医療教育用ショート動画の挿絵 SVG を作ってください。条件は次のとおりです。",
        "（このページの「AIに頼む」→「新しい挿絵」で作った依頼文の内容を、ここに続けて貼ってください）",
        "できた SVG はファイル（例：visual_name.svg）に保存し、中身を表示してください。"
      ]
    },
    pages: {
      title: "自分の団体のサイトとして公開する（GitHub Pages）",
      when: "このスタジオを団体の名前で公開し、設定（団体名・色など）を変えたいとき",
      needs: "GitHub のアカウント",
      back: null,
      body: (pj) => [
        pj.repo + " を自分の GitHub アカウントにフォーク（コピー）して、GitHub Pages で公開する手順を一つずつ案内してください。",
        "- config.js の団体名などを、私の団体用に書き換える手伝いをしてください。",
        "- 助成の表記（config.js の grants と画面下部）は、元の開発者の情報として残してください。",
        "- 公開した URL を最後に教えてください。"
      ]
    },
    schedule: {
      title: "定期的な自動作成の仕組みを作る（上級）",
      when: "毎週決まった本数を自動で作り、監修待ちの状態まで進めたいとき",
      needs: "GitHub のアカウント、クラウドの音声合成（例：Google Cloud Text-to-Speech）の API キー",
      back: null,
      body: (pj) => [
        "GitHub Actions で、毎週、scripts/ の承認済み台本から動画を作り、成果物として保存するワークフローを作ってください。",
        "- 音声合成はクラウド（" + (pj.ttsPlan || "Google Cloud Text-to-Speech") + "）を使い、API キーは GitHub の Secrets に入れる。",
        "- 公開（SNS への投稿）は自動にせず、人が確認してから行う運用にする。",
        "- 費用がかかる箇所と、止め方を最初に説明してください。"
      ]
    }
  };

  P.codeTask = function (taskKey, toolKey, pj) {
    const t = P.CODE_TASKS[taskKey], tool = TOOLS[toolKey];
    const os = pj.os || "Windows";
    const head = "# 依頼：" + t.title + "\n\n";
    const toolLine = toolKey === "claude"
      ? "（Claude Code へ）このフォルダに CLAUDE.md があれば、先に読んでから始めてください。"
      : toolKey === "codex"
        ? "（Codex へ）このフォルダに AGENTS.md があれば、先に読んでから始めてください。"
        : "（AI アシスタントへ）このフォルダの README を先に読んでから始めてください。";
    return head + toolLine + "\n\n" + t.body(pj).join("\n") + "\n" + COMMON_TAIL.join("\n").replace("{OS}", os);
  };

  P.agentsMemo = function (pj, toolKey) {
    const name = TOOLS[toolKey].memo;
    return [
      "# " + name + "（このフォルダで AI に作業を頼むときのルール）",
      "",
      "このフォルダは「" + (pj.seriesTitle || "動画シリーズ") + "」の制作物です。クリーンルーム方式で作っています。",
      "",
      "1. 論文やガイドラインの本文・PDF・図表をこのフォルダに保存しない。書誌情報だけを置く。",
      "2. 事実カードの主張文（assertion.plain_statement_ja）と数値を、AI の判断で書き換えない。直すべき点は提案として一覧にする。",
      "3. DOI・PMID・ライセンスは API で確認できたものだけを書く。推測で埋めない。",
      "4. verifier と status: verified_expert は人だけが設定する。",
      "5. 台本の各場面は事実カードの ID を根拠に持つ。カードにない数字を足さない。",
      "6. 動画の公開は、監修者が承認したものに限る。",
      "7. 有料の論文・書籍・出版社の PDF の全文を、許諾なく AI に読み込ませない。患者情報・個人情報・試験問題を AI に入力しない。",
      "8. AI を使った作業は、サービス名・モデル名・日付・用途・主な指示を記録する（records/ai_log.csv に追記する）。"
    ].join("\n");
  };

  window.CRVS_PROMPTS = P;
})();
