/**
 * Ɔkwankyerɛfo Pa - Ghanaian Name Pronunciation Dictionary
 * Provides phonetic guides and spoken forms for Ghanaian day names, surnames, and Akan titles.
 */

export interface PronunciationEntry {
  displayName: string;
  spokenForm: string;
  language: "ak" | "en" | "ga" | "ewe";
  phonemes?: string;
  aliases: string[];
}

export const GHANAIAN_NAMES: Record<string, PronunciationEntry> = {
  kwame: {
    displayName: "Kwame",
    spokenForm: "Kwah-meh",
    language: "ak",
    phonemes: "/ˈkwɑː.meɪ/",
    aliases: ["Kwame", "Kwami"],
  },
  ama: {
    displayName: "Ama",
    spokenForm: "Ah-mah",
    language: "ak",
    phonemes: "/ˈɑː.mɑː/",
    aliases: ["Ama", "Amma"],
  },
  kofi: {
    displayName: "Kofi",
    spokenForm: "Koh-fee",
    language: "ak",
    phonemes: "/ˈkoʊ.fi/",
    aliases: ["Kofi"],
  },
  yaw: {
    displayName: "Yaw",
    spokenForm: "Yow",
    language: "ak",
    phonemes: "/jaʊ/",
    aliases: ["Yaw", "Yao"],
  },
  kwesi: {
    displayName: "Kwesi",
    spokenForm: "Kway-see",
    language: "ak",
    phonemes: "/ˈkweɪ.si/",
    aliases: ["Kwesi", "Kwesi", "Quecy"],
  },
  abena: {
    displayName: "Abena",
    spokenForm: "Ah-beh-nah",
    language: "ak",
    phonemes: "/əˈbɛ.nə/",
    aliases: ["Abena", "Abina"],
  },
  akosua: {
    displayName: "Akosua",
    spokenForm: "Ah-koh-see-wah",
    language: "ak",
    phonemes: "/əˈkoʊ.si.wə/",
    aliases: ["Akosua"],
  },
  boateng: {
    displayName: "Boateng",
    spokenForm: "Bwah-teng",
    language: "ak",
    phonemes: "/ˈbwɑː.tɛŋ/",
    aliases: ["Boateng"],
  },
  mensah: {
    displayName: "Mensah",
    spokenForm: "Mehn-sah",
    language: "ak",
    phonemes: "/ˈmɛn.sɑː/",
    aliases: ["Mensah"],
  },
  nyameba: {
    displayName: "Nyameba",
    spokenForm: "Nyah-meh-bah",
    language: "ak",
    phonemes: "/ˈɲɑː.meɪ.bɑː/",
    aliases: ["Nyameba"],
  },
  nyamebere: {
    displayName: "Nyamebere",
    spokenForm: "Nyah-meh-beh-reh",
    language: "ak",
    phonemes: "/ˈɲɑː.meɪ.bɛ.rɛ/",
    aliases: ["Nyamebere", "Nyamebrɛ"],
  },
  nhyira: {
    displayName: "Nhyira",
    spokenForm: "N-hye-rah",
    language: "ak",
    phonemes: "/nˈçi.rə/",
    aliases: ["Nhyira"],
  },
  okwankyerɛfo: {
    displayName: "Ɔkwankyerɛfo Pa",
    spokenForm: "Oh-kwan-cheh-reh-fo Pah",
    language: "ak",
    phonemes: "/ɔˌkwɑːn.tʃɛ.rɛˈfoʊ pɑː/",
    aliases: ["Okwankyerɛfo Pa", "Okwankyerefo", "Okwankyerɛfo"],
  },
};
