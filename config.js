/*
 * 設定（このファイルだけ書き換えれば、表示がまとめて変わります）
 * 助成の課題名・課題番号が決まったら grants の title / number に入れてください。
 */
window.CRVS_CONFIG = {
  appName: "クリーンルーム動画スタジオ",
  version: "1.1.1",
  developer: "三原 弘（札幌医科大学 医療人育成センター）",
  repository: "https://github.com/hm-cmed/cleanroom-video-studio",
  sourceRepository: "https://github.com/hm-cmed/cleanroom-gi-facts",
  grants: [
    { funder: "公益財団法人 中山隼雄科学技術文化財団", title: "", number: "" },
    { funder: "公益財団法人 医学教育振興財団", title: "", number: "" },
    { funder: "札幌医科大学", title: "", number: "" }
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
