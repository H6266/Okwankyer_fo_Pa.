/**
 * Preach Mode - Canonical Scripture Detection Service
 * Implements Sections 26, 27, 28, 58 of Study Implementation Skill
 */

import { ScriptureReference } from './types';

export interface CanonicalBook {
  code: string;
  name: string;
  aliases: string[];
  maxChapters: number;
  testament: 'OT' | 'NT';
}

export const CANONICAL_BOOKS: CanonicalBook[] = [
  // Old Testament
  { code: 'GEN', name: 'Genesis', aliases: ['Gen', 'Ge', 'Gn'], maxChapters: 50, testament: 'OT' },
  { code: 'EXO', name: 'Exodus', aliases: ['Exod', 'Exo', 'Ex'], maxChapters: 40, testament: 'OT' },
  { code: 'LEV', name: 'Leviticus', aliases: ['Lev', 'Le', 'Lv'], maxChapters: 27, testament: 'OT' },
  { code: 'NUM', name: 'Numbers', aliases: ['Num', 'Nu', 'Nm'], maxChapters: 36, testament: 'OT' },
  { code: 'DEU', name: 'Deuteronomy', aliases: ['Deut', 'Deu', 'Dt'], maxChapters: 34, testament: 'OT' },
  { code: 'JOS', name: 'Joshua', aliases: ['Josh', 'Jos', 'Jsh'], maxChapters: 24, testament: 'OT' },
  { code: 'JDG', name: 'Judges', aliases: ['Judg', 'Jdg', 'Jg'], maxChapters: 21, testament: 'OT' },
  { code: 'RUT', name: 'Ruth', aliases: ['Rth', 'Ru'], maxChapters: 4, testament: 'OT' },
  { code: '1SA', name: '1 Samuel', aliases: ['1 Sam', '1Sam', '1 Sa', '1Sa', 'First Samuel'], maxChapters: 31, testament: 'OT' },
  { code: '2SA', name: '2 Samuel', aliases: ['2 Sam', '2Sam', '2 Sa', '2Sa', 'Second Samuel'], maxChapters: 24, testament: 'OT' },
  { code: '1KI', name: '1 Kings', aliases: ['1 Kgs', '1Kgs', '1 Ki', '1Ki', 'First Kings'], maxChapters: 22, testament: 'OT' },
  { code: '2KI', name: '2 Kings', aliases: ['2 Kgs', '2Kgs', '2 Ki', '2Ki', 'Second Kings'], maxChapters: 25, testament: 'OT' },
  { code: '1CH', name: '1 Chronicles', aliases: ['1 Chron', '1Chr', '1 Chr', '1Ch', 'First Chronicles'], maxChapters: 29, testament: 'OT' },
  { code: '2CH', name: '2 Chronicles', aliases: ['2 Chron', '2Chr', '2 Chr', '2Ch', 'Second Chronicles'], maxChapters: 36, testament: 'OT' },
  { code: 'EZR', name: 'Ezra', aliases: ['Ezr'], maxChapters: 10, testament: 'OT' },
  { code: 'NEH', name: 'Nehemiah', aliases: ['Neh', 'Ne'], maxChapters: 13, testament: 'OT' },
  { code: 'EST', name: 'Esther', aliases: ['Esth', 'Est', 'Es'], maxChapters: 10, testament: 'OT' },
  { code: 'JOB', name: 'Job', aliases: ['Jb'], maxChapters: 42, testament: 'OT' },
  { code: 'PSA', name: 'Psalms', aliases: ['Psalm', 'Ps', 'Psa', 'Psm'], maxChapters: 150, testament: 'OT' },
  { code: 'PRO', name: 'Proverbs', aliases: ['Prov', 'Pro', 'Pr'], maxChapters: 31, testament: 'OT' },
  { code: 'ECC', name: 'Ecclesiastes', aliases: ['Eccl', 'Ecc', 'Ec'], maxChapters: 12, testament: 'OT' },
  { code: 'SNG', name: 'Song of Solomon', aliases: ['Song of Songs', 'Song', 'SOS', 'Canticles'], maxChapters: 8, testament: 'OT' },
  { code: 'ISA', name: 'Isaiah', aliases: ['Isa', 'Is'], maxChapters: 66, testament: 'OT' },
  { code: 'JER', name: 'Jeremiah', aliases: ['Jer', 'Je'], maxChapters: 52, testament: 'OT' },
  { code: 'LAM', name: 'Lamentations', aliases: ['Lam', 'La'], maxChapters: 5, testament: 'OT' },
  { code: 'EZK', name: 'Ezekiel', aliases: ['Ezek', 'Eze', 'Ezk'], maxChapters: 48, testament: 'OT' },
  { code: 'DAN', name: 'Daniel', aliases: ['Dan', 'Da', 'Dn'], maxChapters: 12, testament: 'OT' },
  { code: 'HOS', name: 'Hosea', aliases: ['Hos', 'Ho'], maxChapters: 14, testament: 'OT' },
  { code: 'JOL', name: 'Joel', aliases: ['Joe', 'Jl'], maxChapters: 3, testament: 'OT' },
  { code: 'AMO', name: 'Amos', aliases: ['Am'], maxChapters: 9, testament: 'OT' },
  { code: 'OBA', name: 'Obadiah', aliases: ['Obad', 'Ob'], maxChapters: 1, testament: 'OT' },
  { code: 'JON', name: 'Jonah', aliases: ['Jnh', 'Jon'], maxChapters: 4, testament: 'OT' },
  { code: 'MIC', name: 'Micah', aliases: ['Mic', 'Mc'], maxChapters: 7, testament: 'OT' },
  { code: 'NAH', name: 'Nahum', aliases: ['Nah', 'Na'], maxChapters: 3, testament: 'OT' },
  { code: 'HAB', name: 'Habakkuk', aliases: ['Hab', 'Hb'], maxChapters: 3, testament: 'OT' },
  { code: 'ZEP', name: 'Zephaniah', aliases: ['Zeph', 'Zep'], maxChapters: 3, testament: 'OT' },
  { code: 'HAG', name: 'Haggai', aliases: ['Hag', 'Hg'], maxChapters: 2, testament: 'OT' },
  { code: 'ZEC', name: 'Zechariah', aliases: ['Zech', 'Zec'], maxChapters: 14, testament: 'OT' },
  { code: 'MAL', name: 'Malachi', aliases: ['Mal', 'Ml'], maxChapters: 4, testament: 'OT' },

  // New Testament
  { code: 'MAT', name: 'Matthew', aliases: ['Matt', 'Mat', 'Mt'], maxChapters: 28, testament: 'NT' },
  { code: 'MRK', name: 'Mark', aliases: ['Mrk', 'Mar', 'Mk'], maxChapters: 16, testament: 'NT' },
  { code: 'LUK', name: 'Luke', aliases: ['Luk', 'Lk'], maxChapters: 24, testament: 'NT' },
  { code: 'JHN', name: 'John', aliases: ['Joh', 'Jn'], maxChapters: 21, testament: 'NT' },
  { code: 'ACT', name: 'Acts', aliases: ['Act', 'Ac'], maxChapters: 28, testament: 'NT' },
  { code: 'ROM', name: 'Romans', aliases: ['Rom', 'Ro', 'Rm'], maxChapters: 16, testament: 'NT' },
  { code: '1CO', name: '1 Corinthians', aliases: ['1 Cor', '1Cor', '1 Co', '1Co', 'First Corinthians'], maxChapters: 16, testament: 'NT' },
  { code: '2CO', name: '2 Corinthians', aliases: ['2 Cor', '2Cor', '2 Co', '2Co', 'Second Corinthians'], maxChapters: 13, testament: 'NT' },
  { code: 'GAL', name: 'Galatians', aliases: ['Gal', 'Ga'], maxChapters: 6, testament: 'NT' },
  { code: 'EPH', name: 'Ephesians', aliases: ['Eph', 'Ep'], maxChapters: 6, testament: 'NT' },
  { code: 'PHP', name: 'Philippians', aliases: ['Phil', 'Php', 'Ph'], maxChapters: 4, testament: 'NT' },
  { code: 'COL', name: 'Colossians', aliases: ['Col', 'Cl'], maxChapters: 4, testament: 'NT' },
  { code: '1TH', name: '1 Thessalonians', aliases: ['1 Thess', '1Thess', '1 Th', '1Th', 'First Thessalonians'], maxChapters: 5, testament: 'NT' },
  { code: '2TH', name: '2 Thessalonians', aliases: ['2 Thess', '2Thess', '2 Th', '2Th', 'Second Thessalonians'], maxChapters: 3, testament: 'NT' },
  { code: '1TI', name: '1 Timothy', aliases: ['1 Tim', '1Tim', '1 Ti', '1Ti', 'First Timothy'], maxChapters: 6, testament: 'NT' },
  { code: '2TI', name: '2 Timothy', aliases: ['2 Tim', '2Tim', '2 Ti', '2Ti', 'Second Timothy'], maxChapters: 4, testament: 'NT' },
  { code: 'TIT', name: 'Titus', aliases: ['Tit', 'Ti'], maxChapters: 3, testament: 'NT' },
  { code: 'PHM', name: 'Philemon', aliases: ['Philem', 'Phm', 'Pm'], maxChapters: 1, testament: 'NT' },
  { code: 'HEB', name: 'Hebrews', aliases: ['Heb', 'He'], maxChapters: 13, testament: 'NT' },
  { code: 'JAS', name: 'James', aliases: ['Jas', 'Jm'], maxChapters: 5, testament: 'NT' },
  { code: '1PE', name: '1 Peter', aliases: ['1 Pet', '1Pet', '1 Pe', '1Pe', '1 Pt', '1Pt', 'First Peter'], maxChapters: 5, testament: 'NT' },
  { code: '2PE', name: '2 Peter', aliases: ['2 Pet', '2Pet', '2 Pe', '2Pe', '2 Pt', '2Pt', 'Second Peter'], maxChapters: 3, testament: 'NT' },
  { code: '1JN', name: '1 John', aliases: ['1 Jn', '1Jn', '1 Joh', '1Joh', 'First John'], maxChapters: 5, testament: 'NT' },
  { code: '2JN', name: '2 John', aliases: ['2 Jn', '2Jn', '2 Joh', '2Joh', 'Second John'], maxChapters: 1, testament: 'NT' },
  { code: '3JN', name: '3 John', aliases: ['3 Jn', '3Jn', '3 Joh', '3Joh', 'Third John'], maxChapters: 1, testament: 'NT' },
  { code: 'JUD', name: 'Jude', aliases: ['Jud', 'Jd'], maxChapters: 1, testament: 'NT' },
  { code: 'REV', name: 'Revelation', aliases: ['Rev', 'Re', 'Apocalypse'], maxChapters: 22, testament: 'NT' },
];

/**
 * Normalizes input book name or alias to canonical book representation.
 */
export function lookupBook(nameOrAlias: string): CanonicalBook | null {
  const cleaned = nameOrAlias.trim().toLowerCase().replace(/\./g, '');
  for (const b of CANONICAL_BOOKS) {
    if (b.name.toLowerCase() === cleaned) return b;
    for (const alias of b.aliases) {
      if (alias.toLowerCase().replace(/\./g, '') === cleaned) {
        return b;
      }
    }
  }
  return null;
}

// Build regex alternation of all book names and aliases sorted by descending length
const BOOK_NAMES_FOR_REGEX = CANONICAL_BOOKS.flatMap((b) => [b.name, ...b.aliases])
  .sort((a, b) => b.length - a.length)
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

// Matches patterns:
// 1. "John 3:16" or "1 John 3:16-18" or "John 3:16,17"
// 2. "Psalm 23:1" or "Psalm 23"
// 3. "Genesis 1:1"
const SCRIPTURE_REGEX = new RegExp(
  `\\b(${BOOK_NAMES_FOR_REGEX})\\.?\\s+(\\d{1,3})(?:\\s*[:\\.]\\s*(\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3})|\\s*,\\s*(\\d{1,3}))?)?\\b`,
  'gi'
);

export class ScriptureDetector {
  /**
   * Scans document text and returns all validated Scripture references.
   */
  public detect(text: string): ScriptureReference[] {
    if (!text || typeof text !== 'string') return [];

    const results: ScriptureReference[] = [];
    const regex = new RegExp(SCRIPTURE_REGEX.source, 'gi');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const rawMatch = match[0];
      const bookStr = match[1];
      const chapterNum = parseInt(match[2], 10);
      const verseStartNum = match[3] ? parseInt(match[3], 10) : undefined;
      const verseEndNum = match[4]
        ? parseInt(match[4], 10)
        : match[5]
        ? parseInt(match[5], 10)
        : undefined;

      const book = lookupBook(bookStr);
      if (!book) continue;

      // Section 28: Validation
      // 1. Chapter boundary check
      if (chapterNum < 1 || chapterNum > book.maxChapters) {
        continue;
      }

      // 2. Verse boundary check if specified
      if (verseStartNum !== undefined) {
        // Psalm 119 has 176 verses; no chapter in scripture exceeds 176
        if (verseStartNum < 1 || verseStartNum > 176) {
          continue;
        }
        if (verseEndNum !== undefined && (verseEndNum < 1 || verseEndNum > 176)) {
          continue;
        }
      }

      const id = `${book.code}_${chapterNum}_${verseStartNum || 1}${verseEndNum ? `-${verseEndNum}` : ''}`;

      results.push({
        id,
        book: book.name,
        bookCode: book.code,
        chapter: chapterNum,
        verseStart: verseStartNum || 1,
        verseEnd: verseEndNum,
        rawText: rawMatch,
        startIndex: match.index,
        endIndex: match.index + rawMatch.length,
        testament: book.testament,
      });
    }

    return results;
  }
}

export const scriptureDetector = new ScriptureDetector();
