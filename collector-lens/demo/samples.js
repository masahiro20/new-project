/* Fictional sample listings written for the Collector Lens demo. Not copied from any real listing. */
(function (root) {
  root.DEMO_SAMPLES = [
    {
      id: "camera-junk-rangefinder",
      label: "Camera · Junk rangefinder",
      genre: "camera",
      text: [
        "レンジファインダー フィルムカメラ 50mm F2 レンズ付き ジャンク",
        "商品の状態：ジャンク品",
        "祖父の遺品整理で出てきたカメラです。",
        "動作未確認です。シャッターは切れるようですが、速度が合っているかはわかりません。",
        "レンズにカビ・くもりあり。ファインダー内もかなり暗いです。",
        "素人のため詳しい方の判断にお任せします。",
        "返品：ノークレームノーリターンでお願いします。"
      ].join("\n")
    },
    {
      id: "camera-shop-slr",
      label: "Camera · Shop-graded SLR",
      genre: "camera",
      text: [
        "一眼レフカメラ ボディ + 標準レンズ 50mm F1.8 セット",
        "ランク：AB",
        "Condition: Exc+++",
        "当店にて動作確認済みです。シャッター全速OK、露出計OKです。",
        "レンズは光学良好、カビ・くもりなし。",
        "外観は使用に伴う小傷がございますが、目立つものではありません。",
        "前後キャップ・ストラップ付属。",
        "返品：返品可（商品到着後7日以内）"
      ].join("\n")
    },
    {
      id: "camera-lens-balsam",
      label: "Camera · Lens with separation",
      genre: "camera",
      text: [
        "中判カメラ用 交換レンズ 80mm F2.8",
        "状態：中古品",
        "絞り羽根に油滲みはなく、作動は問題ありません。",
        "ただし中玉にバルサム切れが見られます。強い光源で確認できる程度です。",
        "前玉に拭き傷が少々あります。写りに影響ありませんでした。",
        "ヘリコイドは少し重めです。",
        "写真でご判断ください。",
        "返品：初期不良のみ対応いたします。"
      ].join("\n")
    },
    {
      id: "watch-authenticity-redial",
      label: "Watch · Authenticity unknown",
      genre: "watch",
      text: [
        "アンティーク 手巻き 腕時計 メンズ スモールセコンド",
        "状態：現状品",
        "知人から譲り受けた時計です。真贋不明のためノーブランド扱いで出品します。",
        "文字盤はリダンと思われます。針の夜光も塗り直されているようです。",
        "竜頭を巻くと動きますが、OH歴不明です。",
        "神経質な方はご遠慮ください。",
        "返品：返品不可"
      ].join("\n")
    },
    {
      id: "watch-shop-serviced",
      label: "Watch · Serviced shop automatic",
      genre: "watch",
      text: [
        "自動巻き 腕時計 デイト付き 3針 ステンレス",
        "商品の状態：目立った傷や汚れなし",
        "当店にてOH済み、防水検査済みです。",
        "日差+5秒程度で安定して稼働中です。",
        "日差しの当たらない場所で保管しておりました。",
        "純正ブレス、余りコマ2つ、元箱付き。",
        "返品：返品可（商品到着後7日以内にご連絡ください）"
      ].join("\n")
    },
    {
      id: "watch-assembled-parts",
      label: "Watch · Assembled from parts",
      genre: "watch",
      text: [
        "手巻き 腕時計 ヴィンテージ風 ケース径36mm",
        "コンディション：現状品",
        "ムーブメントとケースは別々に入手したもので、寄せ集めの一本です。",
        "社外ベルトに交換しています。リューズも後年交換品です。",
        "動いてはいますが、時々止まることがあります。",
        "風防には小傷があります。",
        "中古品にご理解のある方のみご入札ください。",
        "返品について：現状渡しとなります。"
      ].join("\n")
    }
  ];
  if (typeof module !== "undefined" && module.exports) module.exports = root.DEMO_SAMPLES;
})(typeof globalThis !== "undefined" ? globalThis : this);
