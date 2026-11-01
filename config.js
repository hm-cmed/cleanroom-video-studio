/*
 * 設定（このファイルだけ書き換えれば、表示がまとめて変わります）
 * 助成：funder（財団名）、title（研究課題）、number（助成の種別・年度）。英語の表記は funderEn / titleEn / numberEn。
 * 財団の英語名は各財団サイトの表記に合わせています。助成の種別の英語は財団に公式表記がないため、訳語です。
 */
window.CRVS_CONFIG = {
  appName: "クリーンルーム動画スタジオ",
  version: "1.2.0",
  developer: "三原 弘（札幌医科大学 医療人育成センター）",
  repository: "https://github.com/hm-cmed/cleanroom-video-studio",
  sourceRepository: "https://github.com/hm-cmed/cleanroom-facts",
  grants: [
    {
      funder: "公益財団法人 中山隼雄科学技術文化財団",
      funderEn: "Hayao Nakayama Foundation for Science & Technology and Culture",
      title: "生成AIを活用したゲーム性の高い医学教育コンテンツの開発と公開",
      titleEn: "Development and Public Release of Highly Game-Based Medical Education Content Using Generative AI",
      number: "2025年度助成研究（A）重点研究（A-1）「人間性・社会性を高めるゲーム2」、2026年ワークショップ延長助成",
      numberEn: "FY2025 Research Grant (A), Priority Research (A-1) \"Games that Enhance Humanity and Sociality 2\"; 2026 Workshop Extension Grant"
    },
    {
      funder: "公益財団法人 医学教育振興財団",
      funderEn: "Japan Medical Education Foundation (JMEF)",
      title: "動画生成AIによって生成された医療教育用シナリオ動画によるワークショップ型授業が医療系学生の自己評価に与える影響",
      titleEn: "The Impact of Workshop-Based Classes Using AI-Generated Medical Education Scenario Videos on Medical Students' Self-Assessment",
      number: "2025–2026年度 助成",
      numberEn: "Research Grant, 2025–2026"
    },
    {
      funder: "札幌医科大学",
      funderEn: "Sapporo Medical University",
      title: "北海道医療人教育施設とのオンライン連携システムの構築",
      titleEn: "Development of an Online Collaboration System with Healthcare Professional Education Institutions in Hokkaido",
      number: "2026年度 札幌医科大学研究・学術支援事業（支援事業）学術振興事業 助成",
      numberEn: "FY2026 Research and Academic Support Program, Academic Promotion Grant"
    }
  ],
  license: {
    code: "MIT License",
    content: "CC BY 4.0"
  },
  // 制作手順の拠りどころにしているマニュアル
  manual: {
    title: "著作権等に配慮した教育コンテンツ作成マニュアル",
    version: "Version 1.2（公開版）",
    enacted: "2026年7月16日",
    revised: "2026年10月20日",
    author: "札幌医科大学 医療人育成センター 教育開発研究部門",
    url: "" // 公開先の URL が決まったら入れる
  },
  // 動画の最後に入れる任意の制作クレジット（企画画面で表示の有無を選べる）
  videoCredit: "制作ツール：クリーンルーム動画スタジオ"
};
