import { describe, it, expect } from 'vitest';
import { scriptureDetector } from '../src/modules/study/scriptureDetector';

describe('Preach Mode: Canonical Scripture Detection (Section 58)', () => {
  it('detects simple verse reference: John 3:16', () => {
    const text = 'For God so loved the world in John 3:16 that he gave his only Son.';
    const refs = scriptureDetector.detect(text);

    expect(refs.length).toBe(1);
    expect(refs[0].book).toBe('John');
    expect(refs[0].chapter).toBe(3);
    expect(refs[0].verseStart).toBe(16);
    expect(refs[0].testament).toBe('NT');
    expect(text.substring(refs[0].startIndex, refs[0].endIndex)).toBe('John 3:16');
  });

  it('detects verse range: John 3:16-18', () => {
    const text = 'Read carefully from John 3:16-18 during the sermon.';
    const refs = scriptureDetector.detect(text);

    expect(refs.length).toBe(1);
    expect(refs[0].book).toBe('John');
    expect(refs[0].chapter).toBe(3);
    expect(refs[0].verseStart).toBe(16);
    expect(refs[0].verseEnd).toBe(18);
    expect(text.substring(refs[0].startIndex, refs[0].endIndex)).toBe('John 3:16-18');
  });

  it('detects comma-separated verses: John 3:16,17', () => {
    const text = 'Notice the promise in John 3:16,17.';
    const refs = scriptureDetector.detect(text);

    expect(refs.length).toBe(1);
    expect(refs[0].book).toBe('John');
    expect(refs[0].chapter).toBe(3);
    expect(refs[0].verseStart).toBe(16);
    expect(refs[0].verseEnd).toBe(17);
  });

  it('detects numbered books: 1 John 3:16 and 2 Corinthians 5:17', () => {
    const text = 'We know love by this: 1 John 3:16, and also 2 Corinthians 5:17 declares new life.';
    const refs = scriptureDetector.detect(text);

    expect(refs.length).toBe(2);
    expect(refs[0].book).toBe('1 John');
    expect(refs[0].chapter).toBe(3);
    expect(refs[0].verseStart).toBe(16);

    expect(refs[1].book).toBe('2 Corinthians');
    expect(refs[1].chapter).toBe(5);
    expect(refs[1].verseStart).toBe(17);
  });

  it('detects abbreviated book references: 1 Cor 13:4-7 and Ps 23:1', () => {
    const text = 'Love is described in 1 Cor 13:4-7 and comfort is found in Ps 23:1.';
    const refs = scriptureDetector.detect(text);

    expect(refs.length).toBe(2);
    expect(refs[0].book).toBe('1 Corinthians');
    expect(refs[0].chapter).toBe(13);
    expect(refs[0].verseStart).toBe(4);
    expect(refs[0].verseEnd).toBe(7);

    expect(refs[1].book).toBe('Psalms');
    expect(refs[1].chapter).toBe(23);
    expect(refs[1].verseStart).toBe(1);
  });

  it('detects chapter-only reference: Psalm 23 and Genesis 1:1', () => {
    const text = 'The shepherd psalm is Psalm 23, beginning with Genesis 1:1 creation.';
    const refs = scriptureDetector.detect(text);

    expect(refs.length).toBe(2);
    expect(refs[0].book).toBe('Psalms');
    expect(refs[0].chapter).toBe(23);
    expect(refs[0].testament).toBe('OT');

    expect(refs[1].book).toBe('Genesis');
    expect(refs[1].chapter).toBe(1);
    expect(refs[1].verseStart).toBe(1);
  });

  it('detects apocalyptic reference: Rev 21:1-4', () => {
    const text = 'The new Jerusalem appears in Rev 21:1-4.';
    const refs = scriptureDetector.detect(text);

    expect(refs.length).toBe(1);
    expect(refs[0].book).toBe('Revelation');
    expect(refs[0].chapter).toBe(21);
    expect(refs[0].verseStart).toBe(1);
    expect(refs[0].verseEnd).toBe(4);
  });

  it('rejects invalid references: John 999:999 (Section 28)', () => {
    const text = 'There is no such passage as John 999:999 or FakeBook 3:16.';
    const refs = scriptureDetector.detect(text);

    expect(refs.length).toBe(0);
  });

  it('verifies exact character slice fidelity for all matches', () => {
    const sample = 'In Genesis 1:1 God created, in Romans 5:1 we have peace, and in Rev 21:1-4 tears cease.';
    const refs = scriptureDetector.detect(sample);

    expect(refs.length).toBe(3);
    for (const ref of refs) {
      const extracted = sample.substring(ref.startIndex, ref.endIndex);
      expect(extracted).toBe(ref.rawText);
    }
  });
});
