/**
 * The single source of truth for teachable languages.
 *
 * The list is Whisper's own supported set — the transcription model defines
 * what the grading pipeline can actually hear, so anything outside it could be
 * offered but never scored. Previously "English" and "French" were hardcoded in
 * six places (two Zod enums, two prompt ternaries, a status ternary, and the
 * read-along voice map), which is why adding a language meant hunting through
 * route handlers.
 *
 * `tier` is deliberately honest rather than flattering — see GRADING_BY_TIER.
 * A teacher choosing Yoruba should know up front that they get a transcript and
 * pacing, not phoneme scores, instead of discovering it from a suspiciously
 * round number in the gradebook.
 *
 * NOTE ON SCOPE: exposing Yoruba/Hausa here is NOT the v2 "Meta MMS / Nigerian
 * language support" item (AGENTS.md). Those languages appear only because
 * Whisper already supports them; no MMS model, dependency, or code path is
 * added. Proper Nigerian-language support still means MMS, and is still v2.
 */

/** What the pipeline can actually produce for a language. */
export type LanguageTier =
  /** Transcription + forced-alignment pronunciation scoring (MFA pretrained). */
  | "full"
  /** Whisper transcribes reliably: transcript, WPM, WER, fluency, CEFR. */
  | "transcription"
  /** Low-resource in Whisper. Transcripts are usable but error-prone. */
  | "limited";

export interface Language {
  /** Whisper / ISO-639-1 code, e.g. "fr". */
  code: string;
  /** English display name, and the value stored in activities.target_language. */
  name: string;
  /** BCP-47 tag for speech synthesis in the read-along player. */
  bcp47: string;
  tier: LanguageTier;
}

export const GRADING_BY_TIER: Record<LanguageTier, string> = {
  full: "Transcript, pacing, and pronunciation scoring.",
  transcription: "Transcript, pacing, and fluency. No pronunciation scoring yet.",
  limited:
    "Transcript quality varies for this language. Pacing is reported; treat scores as a guide.",
};

export const LANGUAGES: readonly Language[] = [
  // Full pipeline: MFA pretrained acoustic models exist for these.
  { code: "en", name: "English", bcp47: "en-US", tier: "full" },
  { code: "fr", name: "French", bcp47: "fr-FR", tier: "full" },

  // Whisper transcribes these reliably.
  { code: "es", name: "Spanish", bcp47: "es-ES", tier: "transcription" },
  { code: "de", name: "German", bcp47: "de-DE", tier: "transcription" },
  { code: "it", name: "Italian", bcp47: "it-IT", tier: "transcription" },
  { code: "pt", name: "Portuguese", bcp47: "pt-PT", tier: "transcription" },
  { code: "nl", name: "Dutch", bcp47: "nl-NL", tier: "transcription" },
  { code: "ru", name: "Russian", bcp47: "ru-RU", tier: "transcription" },
  { code: "pl", name: "Polish", bcp47: "pl-PL", tier: "transcription" },
  { code: "uk", name: "Ukrainian", bcp47: "uk-UA", tier: "transcription" },
  { code: "cs", name: "Czech", bcp47: "cs-CZ", tier: "transcription" },
  { code: "sv", name: "Swedish", bcp47: "sv-SE", tier: "transcription" },
  { code: "da", name: "Danish", bcp47: "da-DK", tier: "transcription" },
  { code: "no", name: "Norwegian", bcp47: "nb-NO", tier: "transcription" },
  { code: "fi", name: "Finnish", bcp47: "fi-FI", tier: "transcription" },
  { code: "tr", name: "Turkish", bcp47: "tr-TR", tier: "transcription" },
  { code: "el", name: "Greek", bcp47: "el-GR", tier: "transcription" },
  { code: "ro", name: "Romanian", bcp47: "ro-RO", tier: "transcription" },
  { code: "hu", name: "Hungarian", bcp47: "hu-HU", tier: "transcription" },
  { code: "ar", name: "Arabic", bcp47: "ar-SA", tier: "transcription" },
  { code: "he", name: "Hebrew", bcp47: "he-IL", tier: "transcription" },
  { code: "hi", name: "Hindi", bcp47: "hi-IN", tier: "transcription" },
  { code: "ur", name: "Urdu", bcp47: "ur-PK", tier: "transcription" },
  { code: "fa", name: "Persian", bcp47: "fa-IR", tier: "transcription" },
  { code: "zh", name: "Chinese (Mandarin)", bcp47: "zh-CN", tier: "transcription" },
  { code: "ja", name: "Japanese", bcp47: "ja-JP", tier: "transcription" },
  { code: "ko", name: "Korean", bcp47: "ko-KR", tier: "transcription" },
  { code: "vi", name: "Vietnamese", bcp47: "vi-VN", tier: "transcription" },
  { code: "th", name: "Thai", bcp47: "th-TH", tier: "transcription" },
  { code: "id", name: "Indonesian", bcp47: "id-ID", tier: "transcription" },
  { code: "ms", name: "Malay", bcp47: "ms-MY", tier: "transcription" },
  { code: "ta", name: "Tamil", bcp47: "ta-IN", tier: "transcription" },
  { code: "bn", name: "Bengali", bcp47: "bn-BD", tier: "transcription" },
  { code: "ca", name: "Catalan", bcp47: "ca-ES", tier: "transcription" },
  { code: "bg", name: "Bulgarian", bcp47: "bg-BG", tier: "transcription" },
  { code: "hr", name: "Croatian", bcp47: "hr-HR", tier: "transcription" },
  { code: "sk", name: "Slovak", bcp47: "sk-SK", tier: "transcription" },
  { code: "sl", name: "Slovenian", bcp47: "sl-SI", tier: "transcription" },
  { code: "lt", name: "Lithuanian", bcp47: "lt-LT", tier: "transcription" },
  { code: "lv", name: "Latvian", bcp47: "lv-LV", tier: "transcription" },
  { code: "et", name: "Estonian", bcp47: "et-EE", tier: "transcription" },
  { code: "sr", name: "Serbian", bcp47: "sr-RS", tier: "transcription" },
  { code: "mk", name: "Macedonian", bcp47: "mk-MK", tier: "transcription" },
  { code: "af", name: "Afrikaans", bcp47: "af-ZA", tier: "transcription" },
  { code: "sw", name: "Swahili", bcp47: "sw-KE", tier: "transcription" },
  { code: "tl", name: "Tagalog", bcp47: "tl-PH", tier: "transcription" },
  { code: "te", name: "Telugu", bcp47: "te-IN", tier: "transcription" },
  { code: "ml", name: "Malayalam", bcp47: "ml-IN", tier: "transcription" },
  { code: "kn", name: "Kannada", bcp47: "kn-IN", tier: "transcription" },
  { code: "mr", name: "Marathi", bcp47: "mr-IN", tier: "transcription" },
  { code: "gu", name: "Gujarati", bcp47: "gu-IN", tier: "transcription" },
  { code: "pa", name: "Punjabi", bcp47: "pa-IN", tier: "transcription" },
  { code: "ne", name: "Nepali", bcp47: "ne-NP", tier: "transcription" },
  { code: "si", name: "Sinhala", bcp47: "si-LK", tier: "transcription" },
  { code: "km", name: "Khmer", bcp47: "km-KH", tier: "transcription" },
  { code: "az", name: "Azerbaijani", bcp47: "az-AZ", tier: "transcription" },
  { code: "kk", name: "Kazakh", bcp47: "kk-KZ", tier: "transcription" },
  { code: "hy", name: "Armenian", bcp47: "hy-AM", tier: "transcription" },
  { code: "ka", name: "Georgian", bcp47: "ka-GE", tier: "transcription" },
  { code: "bs", name: "Bosnian", bcp47: "bs-BA", tier: "transcription" },
  { code: "sq", name: "Albanian", bcp47: "sq-AL", tier: "transcription" },
  { code: "gl", name: "Galician", bcp47: "gl-ES", tier: "transcription" },
  { code: "eu", name: "Basque", bcp47: "eu-ES", tier: "transcription" },
  { code: "is", name: "Icelandic", bcp47: "is-IS", tier: "transcription" },
  { code: "cy", name: "Welsh", bcp47: "cy-GB", tier: "transcription" },
  { code: "be", name: "Belarusian", bcp47: "be-BY", tier: "transcription" },
  { code: "my", name: "Burmese", bcp47: "my-MM", tier: "transcription" },
  { code: "lo", name: "Lao", bcp47: "lo-LA", tier: "transcription" },
  { code: "mn", name: "Mongolian", bcp47: "mn-MN", tier: "transcription" },
  { code: "uz", name: "Uzbek", bcp47: "uz-UZ", tier: "transcription" },

  // Low-resource in Whisper — offered, but honestly labelled.
  { code: "yo", name: "Yoruba", bcp47: "yo-NG", tier: "limited" },
  { code: "ha", name: "Hausa", bcp47: "ha-NG", tier: "limited" },
  { code: "sn", name: "Shona", bcp47: "sn-ZW", tier: "limited" },
  { code: "so", name: "Somali", bcp47: "so-SO", tier: "limited" },
  { code: "am", name: "Amharic", bcp47: "am-ET", tier: "limited" },
  { code: "mg", name: "Malagasy", bcp47: "mg-MG", tier: "limited" },
  { code: "ln", name: "Lingala", bcp47: "ln-CD", tier: "limited" },
  { code: "mi", name: "Maori", bcp47: "mi-NZ", tier: "limited" },
  { code: "haw", name: "Hawaiian", bcp47: "haw-US", tier: "limited" },
  { code: "ht", name: "Haitian Creole", bcp47: "ht-HT", tier: "limited" },
  { code: "lb", name: "Luxembourgish", bcp47: "lb-LU", tier: "limited" },
  { code: "mt", name: "Maltese", bcp47: "mt-MT", tier: "limited" },
  { code: "fo", name: "Faroese", bcp47: "fo-FO", tier: "limited" },
  { code: "br", name: "Breton", bcp47: "br-FR", tier: "limited" },
  { code: "oc", name: "Occitan", bcp47: "oc-FR", tier: "limited" },
  { code: "la", name: "Latin", bcp47: "la", tier: "limited" },
  { code: "sa", name: "Sanskrit", bcp47: "sa-IN", tier: "limited" },
  { code: "yi", name: "Yiddish", bcp47: "yi", tier: "limited" },
  { code: "tg", name: "Tajik", bcp47: "tg-TJ", tier: "limited" },
  { code: "tk", name: "Turkmen", bcp47: "tk-TM", tier: "limited" },
  { code: "tt", name: "Tatar", bcp47: "tt-RU", tier: "limited" },
  { code: "ba", name: "Bashkir", bcp47: "ba-RU", tier: "limited" },
  { code: "ps", name: "Pashto", bcp47: "ps-AF", tier: "limited" },
  { code: "sd", name: "Sindhi", bcp47: "sd-PK", tier: "limited" },
  { code: "as", name: "Assamese", bcp47: "as-IN", tier: "limited" },
  { code: "bo", name: "Tibetan", bcp47: "bo-CN", tier: "limited" },
  { code: "nn", name: "Norwegian Nynorsk", bcp47: "nn-NO", tier: "limited" },
  { code: "jw", name: "Javanese", bcp47: "jv-ID", tier: "limited" },
  { code: "su", name: "Sundanese", bcp47: "su-ID", tier: "limited" },
  { code: "bh", name: "Bihari", bcp47: "bh", tier: "limited" },
  { code: "mrj", name: "Hill Mari", bcp47: "mrj", tier: "limited" },
] as const;

const BY_NAME = new Map(LANGUAGES.map((l) => [l.name.toLowerCase(), l]));
const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

/** Every language name, for Zod validation and the teacher dropdown. */
export const LANGUAGE_NAMES = LANGUAGES.map((l) => l.name);

/**
 * Resolve a stored `target_language` value. Accepts a display name or a code
 * and is case-insensitive, because existing rows hold "English"/"French" while
 * the AI service speaks in codes.
 */
export function findLanguage(value: string | null | undefined): Language | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  return BY_NAME.get(key) ?? BY_CODE.get(key) ?? null;
}

/** BCP-47 tag for speech synthesis; falls back to English rather than throwing. */
export function speechLocale(value: string | null | undefined): string {
  return findLanguage(value)?.bcp47 ?? "en-US";
}

/** Whisper language code for the AI service, or null to let it auto-detect. */
export function whisperCode(value: string | null | undefined): string | null {
  return findLanguage(value)?.code ?? null;
}

/** One-line description of what grading a language actually receives. */
export function gradingSummary(value: string | null | undefined): string {
  const language = findLanguage(value);
  return language
    ? GRADING_BY_TIER[language.tier]
    : GRADING_BY_TIER.transcription;
}

/** Grouped for an <optgroup> dropdown, most-supported first. */
export const LANGUAGE_GROUPS: ReadonlyArray<{
  label: string;
  tier: LanguageTier;
  languages: readonly Language[];
}> = [
  {
    label: "Full grading",
    tier: "full",
    languages: LANGUAGES.filter((l) => l.tier === "full"),
  },
  {
    label: "Transcript & fluency",
    tier: "transcription",
    languages: LANGUAGES.filter((l) => l.tier === "transcription"),
  },
  {
    label: "Limited support",
    tier: "limited",
    languages: LANGUAGES.filter((l) => l.tier === "limited"),
  },
];
