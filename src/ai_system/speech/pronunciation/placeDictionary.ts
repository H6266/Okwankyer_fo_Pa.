/**
 * Ɔkwankyerɛfo Pa - Ghanaian Place & Telecom Dictionary
 */

import { PronunciationEntry } from "./nameDictionary";

export const GHANAIAN_PLACES: Record<string, PronunciationEntry> = {
  accra: {
    displayName: "Accra",
    spokenForm: "Ah-krah",
    language: "ga",
    phonemes: "/əˈkrɑː/",
    aliases: ["Accra"],
  },
  kumasi: {
    displayName: "Kumasi",
    spokenForm: "Koo-mah-see",
    language: "ak",
    phonemes: "/kuːˈmɑːsi/",
    aliases: ["Kumasi", "Kumase"],
  },
  tamale: {
    displayName: "Tamale",
    spokenForm: "Tah-mah-leh",
    language: "en",
    phonemes: "/ˈtɑːməleɪ/",
    aliases: ["Tamale"],
  },
  kejetia: {
    displayName: "Kejetia",
    spokenForm: "Keh-jeh-tee-ah",
    language: "ak",
    phonemes: "/kɛˈdʒɛtiə/",
    aliases: ["Kejetia"],
  },
  makola: {
    displayName: "Makola",
    spokenForm: "Mah-koh-lah",
    language: "ga",
    phonemes: "/məˈkoʊlə/",
    aliases: ["Makola"],
  },
  adum: {
    displayName: "Adum",
    spokenForm: "Ah-doom",
    language: "ak",
    phonemes: "/əˈduːm/",
    aliases: ["Adum"],
  },
  bantama: {
    displayName: "Bantama",
    spokenForm: "Bahn-tah-mah",
    language: "ak",
    phonemes: "/bɑːnˈtɑːmə/",
    aliases: ["Bantama"],
  },
};

export const GHANAIAN_TERMS: Record<string, PronunciationEntry> = {
  momo: {
    displayName: "MoMo",
    spokenForm: "Moh-Moh",
    language: "en",
    phonemes: "/ˈmoʊ.moʊ/",
    aliases: ["MoMo", "Mobile Money"],
  },
  telecel: {
    displayName: "Telecel",
    spokenForm: "Teh-leh-sehl",
    language: "en",
    phonemes: "/ˈtɛl.ə.sɛl/",
    aliases: ["Telecel"],
  },
  cedi: {
    displayName: "Cedi",
    spokenForm: "See-dee",
    language: "ak",
    phonemes: "/ˈsiːdi/",
    aliases: ["Cedi", "Cedis"],
  },
  pesewa: {
    displayName: "Pesewa",
    spokenForm: "Peh-seh-wah",
    language: "ak",
    phonemes: "/pɛˈseɪwə/",
    aliases: ["Pesewa", "Pesewas"],
  },
};
