export type Lang = "ja" | "en";
/** Language of finding messages and report labels. */
export type Locale = "en" | "ja";
export type Side = "source" | "target";
export type Severity = "error" | "warning" | "info";
export type Category =
  | "term"
  | "name"
  | "honorific"
  | "voice"
  | "notation"
  | "placeholder"
  | "tag"
  | "ruby"
  | "length"
  | "untranslated";

/** One translatable string. `line` is the 1-based line in the original file where the record starts. */
export interface Row {
  file: string;
  line: number;
  id: string;
  source: string;
  target: string;
  speaker?: string;
  addressee?: string;
  context?: string;
  maxLength?: number;
  /** PO `#, fuzzy`: a draft translation gettext ignores at runtime. Reported as untranslated.fuzzy. */
  fuzzy?: boolean;
}

/** Concrete format a table was parsed as. */
export type TableFormat = "csv" | "tsv" | "json" | "xliff" | "xlsx" | "po" | "i18n-json" | "unity-csv" | "unreal-csv" | "yaml" | "renpy";

export interface Table {
  file: string;
  format: TableFormat;
  sourceLang: Lang;
  targetLang: Lang;
  rows: Row[];
  /**
   * Set on single-language tables (a locale JSON, a CSV/XLSX with one text column, an Unreal string table):
   * the text is in `Row.source` and `Row.target` is empty. `loadInputs` pairs a ja table with an en table by key;
   * an unpaired one is still checked on its own (source-side rules only).
   */
  singleLang?: Lang;
}

export interface GlossaryTerm {
  source: string;
  target: string;
  /** Other renderings that are also acceptable. */
  allowed?: string[];
  /** Known-wrong renderings that should be flagged wherever they appear. */
  forbidden?: string[];
  note?: string;
  /** Proposed by `kotomark draft` and not yet reviewed: its term.missing findings are reported as info. */
  draft?: boolean;
}

export interface VoiceProfile {
  ja?: {
    /** Expected first-person pronouns, e.g. ["俺"]. */
    firstPerson?: string[];
    politeness?: "polite" | "plain";
  };
  en?: {
    contractions?: "never" | "any";
    /** Words or phrases this character never says. */
    avoid?: string[];
    /** Free-text description handed to the reviewer model. */
    description?: string;
  };
}

export interface GlossaryCharacter {
  id: string;
  ja: string;
  en: string;
  aliases?: { ja?: string[]; en?: string[] };
  forbidden?: { ja?: string[]; en?: string[] };
  voice?: VoiceProfile;
}

export interface Glossary {
  /** How Japanese honorifics should appear in English. "keep" = Lisette-sama, "drop"/"localize" = no romanized suffixes. */
  honorificPolicy?: "keep" | "drop" | "localize";
  terms: GlossaryTerm[];
  characters: GlossaryCharacter[];
  /** Capitalized words that should never be reported as name misspellings. */
  ignoreWords?: string[];
}

export interface Finding {
  category: Category;
  severity: Severity;
  rule: string;
  file: string;
  line: number;
  id: string;
  side: Side;
  message: string;
  /** Groups related findings in the report, e.g. "魔導石 → Mana Stone". */
  group?: string;
  found?: string;
  expected?: string;
}

/** Usage tally for one group (e.g. how a glossary term was rendered across the script). */
export interface UsageSummary {
  category: Category;
  group: string;
  counts: Record<string, number>;
}

/** Lines the deterministic engine cannot judge alone; the user's own assistant reviews them. */
export interface ReviewPacket {
  kind: "voice" | "unglossaried-term";
  subject: string;
  instructions: string;
  profile?: VoiceProfile;
  lines: { ref: string; id: string; speaker?: string; source: string; target: string; flagged?: string }[];
}

export interface CheckOptions {
  /** Run the bonus rule checks (placeholders, tags, ruby, length). Default true. */
  rules?: boolean;
  /** Count East Asian wide characters as 2 for length limits. Default false. */
  wideAsTwo?: boolean;
  /** Minimum lines per speaker before a voice packet is built. Default 3. */
  minLinesForVoice?: number;
  /** Language of `Finding.message` (and voice packet `flagged` notes). Default "en". */
  locale?: Locale;
}

export interface CheckResult {
  tables: { file: string; format: string; rows: number; sourceLang: Lang; targetLang: Lang }[];
  glossary: { terms: number; characters: number };
  findings: Finding[];
  usage: UsageSummary[];
  reviewPackets: ReviewPacket[];
}
