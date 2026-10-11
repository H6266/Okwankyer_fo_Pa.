import { describe, it, expect } from 'vitest';
import { aiPromptBuilder } from '../src/modules/study/aiPromptBuilder';
import { DocumentSelection } from '../src/modules/study/types';

describe('Preach Mode: AI Prompt Builder (Sections 35-39, 61)', () => {
  const mockSelection: DocumentSelection = {
    id: 'sel_test',
    bounds: { x: 50, y: 50, width: 200, height: 80 },
    extractedText: 'Therefore, since we have been justified by faith, we have peace with God.',
    nearbyText: 'Exposition of Romans 5:1. Faith, Grace and Reconciliation.',
    scriptureReferences: [
      {
        id: 'ROM_5_1',
        book: 'Romans',
        bookCode: 'ROM',
        chapter: 5,
        verseStart: 1,
        rawText: 'Romans 5:1',
        startIndex: 0,
        endIndex: 10,
        testament: 'NT',
      },
    ],
    createdAt: Date.now(),
  };

  it('builds dictionary prompt instructing definition, part of speech, and contextual meaning', () => {
    const prompt = aiPromptBuilder.build('dictionary', mockSelection);

    expect(prompt).toContain('SELECTED DOCUMENT EXCERPT');
    expect(prompt).toContain(mockSelection.extractedText);
    expect(prompt).toContain('definition and lexical meaning');
    expect(prompt).toContain('theological meaning');
  });

  it('builds explain prompt instructing expository flow and pastoral application', () => {
    const prompt = aiPromptBuilder.build('explain', mockSelection);

    expect(prompt).toContain('expository explanation');
    expect(prompt).toContain('orthodox Christian hermeneutics');
    expect(prompt).toContain('Romans 5:1');
  });

  it('builds lexicon prompt instructing Greek/Hebrew root, Strong numbers, and morphology', () => {
    const prompt = aiPromptBuilder.build('lexicon', mockSelection);

    expect(prompt).toContain('original-language terms');
    expect(prompt).toContain('Transliteration');
    expect(prompt).toContain('morphology');
    expect(prompt).toContain('distinguish verified textual evidence from theological inference');
  });

  it('builds cross_references prompt asking for directly illuminating biblical passages', () => {
    const prompt = aiPromptBuilder.build('cross_references', mockSelection);

    expect(prompt).toContain('Scripture cross-references');
    expect(prompt).toContain('3 to 6 high-value Scripture references');
    expect(prompt).toContain('canonical book, chapter, and verse');
  });

  it('builds scripture_context prompt including immediate literary flow and authorial intent', () => {
    const prompt = aiPromptBuilder.build('scripture_context', mockSelection);

    expect(prompt).toContain('immediate literary context');
    expect(prompt).toContain('historical background, author, audience');
  });

  it('builds summarize prompt requesting core thesis and homiletical takeaways', () => {
    const prompt = aiPromptBuilder.build('summarize', mockSelection);

    expect(prompt).toContain('Core Thesis');
    expect(prompt).toContain('Key Supporting Truths');
    expect(prompt).toContain('Pastoral Takeaway');
  });

  it('builds translate prompt specifying English, Asante Twi, and comparative languages', () => {
    const prompt = aiPromptBuilder.build('translate', mockSelection);

    expect(prompt).toContain('Contemporary English');
    expect(prompt).toContain('Akan / Asante Twi');
    expect(prompt).toContain('Latin / French / Spanish');
  });

  it('builds ask_ai prompt incorporating specific user question', () => {
    const userQ = 'How does justification differ from sanctification in this verse?';
    const prompt = aiPromptBuilder.build('ask_ai', mockSelection, userQ);

    expect(prompt).toContain(userQ);
    expect(prompt).toContain(mockSelection.extractedText);
  });
});
