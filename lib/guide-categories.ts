// Groups the topic guides on /guide and drives the "関連する解説" fallback (same group first).

export const GUIDE_CATEGORIES: { id: string; name: string; slugs: string[] }[] = [
  {
    id: "seido",
    name: "減算の制度",
    slugs: ["gyakutai-boushi-gensan", "shintai-kousoku-gensan", "bcp-gensan-jidou", "jidou-hyouka-kouhyou", "gensan-kasan-hayamihyo", "reiwa9-kaitei-jidou", "jinin-ketsujo-gensan-jidou", "teiin-chouka-gensan", "shogu-kaizen-keikakusho"],
  },
  {
    id: "shorui",
    name: "委員会・指針・研修の書類",
    slugs: [
      "gyakutai-iinkai-gijiroku",
      "iinkai-ittai-kaisai",
      "gyakutai-iinkai-kosei",
      "gyakutai-tantousha",
      "shintai-kousoku-shishin",
      "houkago-day-shintai-kousoku-rei",
      "gyakutai-kenshu-shiryou",
      "kenshu-rikaido-test",
      "nenkan-kenshu-keikaku",
      "gyakutai-boushi-self-check",
      "unei-kitei-gyakutai",
    ],
  },
  {
    id: "unei",
    name: "支援と安全の運営（計画・記録・委員会）",
    slugs: ["kobetsu-shien-keikaku-kakikata", "assessment-kakikata", "monitoring-kakikata", "shien-kiroku-kakikata", "kobetsu-shien-kaigi-gijiroku", "shien-program-rei", "anzen-keikaku-jidou", "hiyari-hatto-houkokusho", "jiko-houkoku", "sougei-anzen-souchi", "hijou-saigai-keikaku", "kansen-taisaku-iinkai", "kujou-kaiketsu", "kasuhara-taisaku"],
  },
  {
    id: "kasan",
    name: "加算の算定要件と記録（放課後等デイサービス・児童発達支援）",
    slugs: ["jido-shidoin-kahai-kasan", "sougei-kasan", "encho-shien-kasan", "kobetsu-support-kasan", "kazoku-shien-kasan", "kankei-kikan-renkei-kasan", "senmonteki-shien-jisshi-kasan", "fukushi-senmonshoku-kasan", "kyodo-kodo-shougai-kasan", "kesseki-taiou-kasan-kiroku"],
  },
  {
    id: "shidou",
    name: "運営指導と減算への対応",
    slugs: ["unei-shidou-junbi", "unei-shidou-tsuchi", "unei-shidou-shiteki-jidou", "gensan-kaizen-keikaku", "kinmu-keitai-ichiran"],
  },
];

export function categoryOf(slug: string) {
  return GUIDE_CATEGORIES.find((c) => c.slugs.includes(slug));
}
