import { describe, it, expect } from 'vitest';
import { documentParser, SAMPLE_STUDY_DOCUMENTS } from '../src/modules/study/documentParser';
import { bibleDatabase, getBiblePassage, searchBibleByText } from '../src/modules/study/bibleDatabase';
import { scriptureDetector } from '../src/modules/study/scriptureDetector';

describe('DocumentParser Engine', () => {
  it('parses plain text documents with paragraph chunking', () => {
    const rawText = `First paragraph here about justification.\n\nSecond paragraph about sanctification.\n\nThird paragraph about glorification.\n\nFourth paragraph about eternal life.`;
    const doc = documentParser.parseTxt(rawText, 'Test.txt');

    expect(doc.type).toBe('txt');
    expect(doc.title).toBe('Test.txt');
    expect(doc.pages.length).toBeGreaterThan(0);
    expect(doc.fullText).toBe(rawText);
  });

  it('provides built-in sample study documents (Romans 5, Psalm 23, 1 Cor 13)', () => {
    expect(SAMPLE_STUDY_DOCUMENTS.length).toBeGreaterThanOrEqual(3);
    const romans = SAMPLE_STUDY_DOCUMENTS.find(d => d.id === 'sample_romans5');
    const psalm = SAMPLE_STUDY_DOCUMENTS.find(d => d.id === 'sample_psalm23');
    const corinthians = SAMPLE_STUDY_DOCUMENTS.find(d => d.id === 'sample_agape');

    expect(romans).toBeDefined();
    expect(psalm).toBeDefined();
    expect(corinthians).toBeDefined();

    expect(romans?.fullText).toContain('Romans 5:1');
    expect(psalm?.fullText).toContain('Psalm 23:1');
    expect(corinthians?.fullText).toContain('1 Corinthians 13:4');
  });

  it('scans sample documents for scripture references successfully', () => {
    const romansDoc = SAMPLE_STUDY_DOCUMENTS.find(d => d.id === 'sample_romans5')!;
    const refs = scriptureDetector.detect(romansDoc.fullText);

    expect(refs.length).toBeGreaterThan(0);
    const hasRomans51 = refs.some(r => r.book === 'Romans' && r.chapter === 5 && r.verseStart === 1);
    expect(hasRomans51).toBe(true);
  });
});

describe('Offline Bible Database & Cross-References', () => {
  it('retrieves full passage text for known references offline', () => {
    const passage = getBiblePassage({
      book: 'Romans',
      chapter: 5,
      verseStart: 1,
    });

    expect(passage).toBeDefined();
    expect(passage?.text).toContain('justified by faith');
    expect(passage?.crossReferences.length).toBeGreaterThan(0);
    expect(passage?.lexiconHighlights).toBeDefined();
  });

  it('retrieves passage with chapter only or partial match', () => {
    const psalm = getBiblePassage({
      book: 'Psalm',
      chapter: 23,
    });

    expect(psalm).toBeDefined();
    expect(psalm?.text.toLowerCase()).toContain('the lord is my shepherd');
  });

  it('searches Bible database by keyword query', () => {
    const results = searchBibleByText('shepherd');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].reference).toContain('Psalm 23');
  });
});
