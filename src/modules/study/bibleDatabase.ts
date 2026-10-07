/**
 * Preach Mode - Offline Scripture Database & Cross-Reference Engine
 * Provides offline passage texts, theological context, and cross-references.
 */

import { ScriptureReference } from './types';

export interface BiblePassage {
  reference: string;
  book: string;
  chapter: number;
  verseRange: string;
  translation: string;
  text: string;
  crossReferences: string[];
  historicalContext?: string;
  theme?: string;
  lexiconHighlights?: { term: string; original: string; meaning: string }[];
}

// Curated high-frequency passages commonly found in sermons and preach studies
const CURATED_PASSAGES: Record<string, BiblePassage> = {
  'John 3:16': {
    reference: 'John 3:16',
    book: 'John',
    chapter: 3,
    verseRange: '16-17',
    translation: 'ESV / WEB',
    text: 'For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life. For God did not send his Son into the world to condemn the world, but in order that the world might be saved through him.',
    crossReferences: ['Romans 5:8', '1 John 4:9-10', 'Ephesians 2:4-5'],
    historicalContext: 'Jesus speaks to Nicodemus, a ruler of the Pharisees who came by night, revealing the necessity of the new birth and the supreme extent of divine love.',
    theme: 'Divine Love & Salvation by Grace',
  },
  'John 3:16-18': {
    reference: 'John 3:16-18',
    book: 'John',
    chapter: 3,
    verseRange: '16-18',
    translation: 'ESV / WEB',
    text: 'For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life. For God did not send his Son into the world to condemn the world, but in order that the world might be saved through him. Whoever believes in him is not condemned, but whoever does not believe is condemned already, because he has not believed in the name of the only Son of God.',
    crossReferences: ['Romans 8:1', 'John 5:24', '1 John 5:11-12'],
    historicalContext: 'Discourse with Nicodemus explaining the contrast between faith and judgment under the revelation of Christ.',
    theme: 'Eternal Life & Justification',
  },
  'Romans 5:1': {
    reference: 'Romans 5:1',
    book: 'Romans',
    chapter: 5,
    verseRange: '1-5',
    translation: 'ESV / WEB',
    text: 'Therefore, since we have been justified by faith, we have peace with God through our Lord Jesus Christ. Through him we have also obtained access by faith into this grace in which we stand, and we rejoice in hope of the glory of God. Not only that, but we rejoice in our sufferings, knowing that suffering produces endurance, and endurance produces character, and character produces hope, and hope does not put us to shame, because God\'s love has been poured into our hearts through the Holy Spirit who has been given to us.',
    crossReferences: ['Romans 3:28', 'Romans 8:31-39', 'Philippians 4:7', 'Ephesians 2:14'],
    historicalContext: 'Paul articulates the fruits of justification by faith alone: reconciliation with God, unfailing hope through trials, and the indwelling Holy Spirit.',
    theme: 'Justification by Faith and Reconciliation',
    lexiconHighlights: [
      { term: 'justified', original: 'δικαιωθέντες (dikaiōthentes)', meaning: 'declared righteous forensically' },
      { term: 'peace', original: 'εἰρήνην (eirēnēn)', meaning: 'state of reconciliation and tranquil harmony' },
      { term: 'access', original: 'προσαγωγήν (prosagōgēn)', meaning: 'introduction or ushering into royal presence' },
    ],
  },
  'Romans 5:17': {
    reference: 'Romans 5:17',
    book: 'Romans',
    chapter: 5,
    verseRange: '17',
    translation: 'ESV / WEB',
    text: 'For if, because of one man\'s trespass, death reigned through that one man, much more will those who receive the abundance of grace and the free gift of righteousness reign in life through the one man Jesus Christ.',
    crossReferences: ['1 Corinthians 15:21-22', 'Romans 6:23', 'Ephesians 1:7'],
    historicalContext: 'Paul\'s comparison of the two covenant heads: Adam bringing death and Christ bringing triumphant life and righteousness.',
    theme: 'The Reign of Grace through Christ',
  },
  'Psalm 23': {
    reference: 'Psalm 23',
    book: 'Psalms',
    chapter: 23,
    verseRange: '1-6',
    translation: 'KJV / WEB',
    text: 'The Lord is my shepherd; I shall not want. He maketh me to lie down in green pastures: he leadeth me beside the still waters. He restoreth my soul: he leadeth me in the paths of righteousness for his name\'s sake. Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me. Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over. Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the Lord for ever.',
    crossReferences: ['John 10:11-14', 'Isaiah 40:11', 'Revelation 7:17'],
    historicalContext: 'A Psalm of David expressing intimate trust in Yahweh as the covenantal Shepherd and Kingly Provider through valleys of testing.',
    theme: 'The Divine Shepherd\'s Providential Care',
  },
  'Psalm 23:1': {
    reference: 'Psalm 23:1',
    book: 'Psalms',
    chapter: 23,
    verseRange: '1-3',
    translation: 'ESV / WEB',
    text: 'The Lord is my shepherd; I shall not want. He makes me lie down in green pastures. He leads me beside still waters. He restores my soul. He leads me in paths of righteousness for his name\'s sake.',
    crossReferences: ['John 10:11', 'Philippians 4:19', 'Psalm 84:11'],
    historicalContext: 'David reflects on God\'s watchful provision and sovereign restoration of the soul.',
    theme: 'Unfailing Provision and Spiritual Rest',
  },
  '1 Corinthians 13:4-7': {
    reference: '1 Corinthians 13:4-7',
    book: '1 Corinthians',
    chapter: 13,
    verseRange: '4-7',
    translation: 'ESV / WEB',
    text: 'Love is patient and kind; love does not envy or boast; it is not arrogant or rude. It does not insist on its own way; it is not irritable or resentful; it does not rejoice at wrongdoing, but rejoices with the truth. Love bears all things, believes all things, hopes all things, endures all things.',
    crossReferences: ['Colossians 3:12-14', '1 John 4:7-8', 'Galatians 5:22'],
    historicalContext: 'Paul addresses spiritual pride and division in Corinth by holding up agape love as the "more excellent way" superior to spiritual gifts without charity.',
    theme: 'The Characteristics of Biblical Agape Love',
  },
  '1 Cor 13:4-7': {
    reference: '1 Cor 13:4-7',
    book: '1 Corinthians',
    chapter: 13,
    verseRange: '4-7',
    translation: 'ESV / WEB',
    text: 'Love is patient and kind; love does not envy or boast; it is not arrogant or rude. It does not insist on its own way; it is not irritable or resentful; it does not rejoice at wrongdoing, but rejoices with the truth. Love bears all things, believes all things, hopes all things, endures all things.',
    crossReferences: ['Colossians 3:12-14', '1 John 4:7-8', 'Galatians 5:22'],
    historicalContext: 'Paul addresses spiritual pride and division in Corinth.',
    theme: 'The Characteristics of Biblical Agape Love',
  },
  '2 Corinthians 5:17': {
    reference: '2 Corinthians 5:17',
    book: '2 Corinthians',
    chapter: 5,
    verseRange: '17',
    translation: 'ESV / WEB',
    text: 'Therefore, if anyone is in Christ, he is a new creation. The old has passed away; behold, the new has come.',
    crossReferences: ['Galatians 6:15', 'Ephesians 4:22-24', 'Isaiah 43:18-19'],
    historicalContext: 'Paul explains the ministry of reconciliation and the radical transformation believers receive when united to the resurrected Christ.',
    theme: 'New Creation in Christ',
  },
  'Genesis 1:1': {
    reference: 'Genesis 1:1',
    book: 'Genesis',
    chapter: 1,
    verseRange: '1-3',
    translation: 'ESV / WEB',
    text: 'In the beginning, God created the heavens and the earth. The earth was without form and void, and darkness was over the face of the deep. And the Spirit of God was hovering over the face of the waters. And God said, "Let there be light," and there was light.',
    crossReferences: ['John 1:1-3', 'Colossians 1:16', 'Hebrews 11:3', 'Psalm 33:6'],
    historicalContext: 'The foundational cosmological opening of the Torah, proclaiming Yahweh\'s absolute sovereignty and ex nihilo creation.',
    theme: 'Cosmic Creation and Divine Sovereignty',
  },
  'Revelation 21:1-4': {
    reference: 'Revelation 21:1-4',
    book: 'Revelation',
    chapter: 21,
    verseRange: '1-4',
    translation: 'ESV / WEB',
    text: 'Then I saw a new heaven and a new earth, for the first heaven and the first earth had passed away, and the sea was no more. And I saw the holy city, new Jerusalem, coming down out of heaven from God, prepared as a bride adorned for her husband. And I heard a loud voice from the throne saying, "Behold, the dwelling place of God is with man. He will dwell with them, and they will be his people, and God himself will be with them as their God. He will wipe away every tear from their eyes, and death shall be no more, neither shall there be mourning, nor crying, nor pain anymore, for the former things have passed away."',
    crossReferences: ['Isaiah 65:17', '2 Peter 3:13', 'Revelation 7:17'],
    historicalContext: 'John\'s apocalyptic vision of the consummation of all redemptive history, the eternal fellowship of God with His redeemed people.',
    theme: 'The New Heaven, New Earth, and Consummation',
  },
  'Rev 21:1-4': {
    reference: 'Rev 21:1-4',
    book: 'Revelation',
    chapter: 21,
    verseRange: '1-4',
    translation: 'ESV / WEB',
    text: 'Then I saw a new heaven and a new earth, for the first heaven and the first earth had passed away, and the sea was no more. And I saw the holy city, new Jerusalem, coming down out of heaven from God, prepared as a bride adorned for her husband. And I heard a loud voice from the throne saying, "Behold, the dwelling place of God is with man. He will dwell with them, and they will be his people, and God himself will be with them as their God. He will wipe away every tear from their eyes, and death shall be no more, neither shall there be mourning, nor crying, nor pain anymore, for the former things have passed away."',
    crossReferences: ['Isaiah 65:17', '2 Peter 3:13', 'Revelation 7:17'],
    historicalContext: 'John\'s apocalyptic vision of the new creation.',
    theme: 'The Consummation of All Things',
  },
  'Ephesians 2:8-10': {
    reference: 'Ephesians 2:8-10',
    book: 'Ephesians',
    chapter: 2,
    verseRange: '8-10',
    translation: 'ESV / WEB',
    text: 'For by grace you have been saved through faith. And this is not your own doing; it is the gift of God, not a result of works, so that no one may boast. For we are his workmanship, created in Christ Jesus for good works, which God prepared beforehand, that we should walk in them.',
    crossReferences: ['Romans 3:24', 'Titus 3:5', '2 Timothy 1:9'],
    historicalContext: 'Paul explains the unearned nature of salvation and the purposeful fruit of believers as God\'s workmanship (poiēma).',
    theme: 'Grace Alone, Faith Alone, Fruitful Calling',
  },
  'Hebrews 11:1': {
    reference: 'Hebrews 11:1',
    book: 'Hebrews',
    chapter: 11,
    verseRange: '1-3',
    translation: 'ESV / WEB',
    text: 'Now faith is the assurance of things hoped for, the conviction of things not seen. For by it the people of old received their commendation. By faith we understand that the universe was created by the word of God, so that what is seen was not made out of things that have appeared.',
    crossReferences: ['Romans 8:24-25', '2 Corinthians 5:7', 'Hebrews 11:6'],
    historicalContext: 'The author of Hebrews encourages persecuted believers to persevere in steadfast faith, presenting the cloud of witnesses.',
    theme: 'The Nature and Power of Biblical Faith',
  },
};

/**
 * Retrieves Bible passage text and metadata for a given scripture reference.
 * If passage is in the local curated repository, returns full text;
 * otherwise provides contextual commentary and structured canonical metadata.
 */
export function getBiblePassage(ref: Partial<ScriptureReference> | string): BiblePassage {
  let refKey = '';
  if (typeof ref === 'string') {
    refKey = ref.trim();
  } else if (ref && ref.rawText) {
    refKey = ref.rawText.trim();
  } else if (ref && ref.book) {
    refKey = `${ref.book} ${ref.chapter || 1}${ref.verseStart ? `:${ref.verseStart}` : ''}${ref.verseEnd ? `-${ref.verseEnd}` : ''}`;
  }

  // Exact match
  if (CURATED_PASSAGES[refKey]) {
    return CURATED_PASSAGES[refKey];
  }

  // Normalized key search
  for (const [key, passage] of Object.entries(CURATED_PASSAGES)) {
    if (key.toLowerCase() === refKey.toLowerCase()) {
      return passage;
    }
  }

  // Book + Chapter match if verse was omitted or partial
  if (typeof ref === 'object' && ref.book && ref.chapter) {
    const bookChapPrefix = `${ref.book} ${ref.chapter}:`.toLowerCase();
    for (const [key, passage] of Object.entries(CURATED_PASSAGES)) {
      if (key.toLowerCase().startsWith(bookChapPrefix)) {
        return passage;
      }
    }
  }

  // Fallback generation using canonical scripture structure
  const parsedBook = typeof ref === 'object' && ref.book ? ref.book : refKey.split(' ')[0] || 'Passage';
  const parsedChapter = typeof ref === 'object' && ref.chapter ? ref.chapter : parseInt(refKey.match(/(\d+)/)?.[1] || '1', 10);
  const parsedVerse = typeof ref === 'object' && ref.verseStart ? `${ref.verseStart}${ref.verseEnd ? `-${ref.verseEnd}` : ''}` : '1';

  return {
    reference: typeof ref === 'object' && ref.book ? `${parsedBook} ${parsedChapter}:${parsedVerse}` : refKey || 'Scripture',
    book: parsedBook,
    chapter: parsedChapter,
    verseRange: parsedVerse,
    translation: 'Biblical Canonical Index (Offline)',
    text: `Canonical reference ${parsedBook} ${parsedChapter}:${parsedVerse}. In biblical exposition, this passage illuminates divine truth in ${parsedBook}. Study actions below offer deep original Greek/Hebrew root lookup, cross-references, and expository commentary.`,
    crossReferences: [
      `${parsedBook} ${Math.max(1, parsedChapter - 1)}`,
      `${parsedBook} ${parsedChapter + 1}`,
      'Psalm 119:105',
    ],
    historicalContext: `The canonical book of ${parsedBook} forms part of the ${typeof ref === 'object' && ref.testament === 'NT' ? 'New Testament covenant revelation' : 'Old Testament covenant scriptures'}.`,
    theme: `${parsedBook} Exposition & Study`,
  };
}

/**
 * Searches local Bible database for passages containing the query string.
 */
export function searchBibleByText(query: string): BiblePassage[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const results: BiblePassage[] = [];
  for (const passage of Object.values(CURATED_PASSAGES)) {
    if (
      passage.text.toLowerCase().includes(q) ||
      passage.reference.toLowerCase().includes(q) ||
      passage.theme?.toLowerCase().includes(q) ||
      passage.book.toLowerCase().includes(q)
    ) {
      if (!results.some(r => r.reference === passage.reference)) {
        results.push(passage);
      }
    }
  }
  return results;
}
