/**
 * Preach Mode - AI Prompt Builder Engine
 * Implements Sections 35, 36, 37, 38, 39 of Study Implementation Skill
 *
 * Deterministic and testable prompt builder for contextual study actions.
 */

import { AiAction, DocumentSelection } from './types';

export class AiPromptBuilder {
  /**
   * Constructs the structured prompt for a given study action and document selection.
   */
  public build(
    action: AiAction,
    selection: DocumentSelection,
    userQuestion?: string
  ): string {
    const selectedText = selection.extractedText?.trim() || '';
    const nearbyContext = selection.nearbyText?.trim() || '';
    const detectedRefs = selection.scriptureReferences || [];
    const scriptureContextStr = detectedRefs.length > 0
      ? `Detected Canonical Scripture References: ${detectedRefs.map((r) => r.rawText).join(', ')}`
      : '';

    const baseContext = [
      `### SELECTED DOCUMENT EXCERPT:`,
      selectedText ? `"${selectedText}"` : `[Visual region selected from document image; refer to visual rendering.]`,
      nearbyContext ? `\n### SURROUNDING DOCUMENT CONTEXT:\n"${nearbyContext}"` : '',
      scriptureContextStr ? `\n### CANONICAL SCRIPTURE CONTEXT:\n${scriptureContextStr}` : '',
    ].filter(Boolean).join('\n');

    switch (action) {
      case 'dictionary':
        return [
          `You are an expert biblical scholar, lexicographer, and pastoral study assistant in Preach Mode.`,
          `Task: Provide a comprehensive biblical and contextual dictionary definition for the selected word or phrase.`,
          baseContext,
          `\nInstructions:`,
          `1. Identify the primary word or key phrase in the selection.`,
          `2. Provide its standard definition and lexical meaning.`,
          `3. Specify part of speech and grammatical function where useful.`,
          `4. Explain its exact theological meaning and practical nuance in this specific selected context.`,
          `5. If the selection is ambiguous or multi-faceted, present the plausible options without fabricating details.`,
          `Format your response with clear markdown headings, bullet points, and concise definitions.`,
        ].join('\n');

      case 'explain':
        return [
          `You are an expository preacher and theologian assisting in sermon preparation and deep document study.`,
          `Task: Provide an insightful expository explanation of the selected text in its literary and theological context.`,
          baseContext,
          `\nInstructions:`,
          `1. Explain what this excerpt means in its immediate literary flow.`,
          `2. Unpack key theological doctrines or principles present in the text.`,
          `3. Highlight homiletical insights or practical ministry applications for teaching and preaching.`,
          `4. Maintain fidelity to historic orthodox Christian hermeneutics while remaining clear and accessible.`,
        ].join('\n');

      case 'lexicon':
        return [
          `You are an academic biblical languages scholar specializing in Biblical Hebrew, Aramaic, and Koine Greek.`,
          `Task: Provide original-language lexical analysis for the key biblical terms in the selected excerpt.`,
          baseContext,
          `\nInstructions:`,
          `1. Identify relevant original-language terms (Hebrew for Old Testament, Greek for New Testament) ONLY when justified by the selected text and biblical passage.`,
          `2. For each key term provide:`,
          `   - Original script (Hebrew/Greek)`,
          `   - Transliteration`,
          `   - Root word and Strong's concordance number (if standard)`,
          `   - Basic lexical meaning / gloss`,
          `   - Grammatical morphology where confidently identifiable`,
          `   - Contextual nuance in this specific passage`,
          `3. Clearly distinguish verified textual evidence from theological inference. Do not present speculative etymology as fact.`,
        ].join('\n');

      case 'cross_references':
        return [
          `You are a biblical cross-reference specialist assisting in scripture study and preaching.`,
          `Task: Identify and explain the most relevant Scripture cross-references for the selected text.`,
          baseContext,
          `\nInstructions:`,
          `1. Identify 3 to 6 high-value Scripture references that directly illuminate the selected passage or theme.`,
          `2. For each reference:`,
          `   - State the canonical book, chapter, and verse clearly (e.g., Romans 5:8).`,
          `   - Provide a concise quote or summary of the verse.`,
          `   - Explain briefly WHY this reference is relevant and how it enriches the understanding of the excerpt.`,
          `3. Prioritize parallel verses, prophetic fulfillments, or thematic parallels over vaguely related texts.`,
        ].join('\n');

      case 'scripture_context':
        return [
          `You are a biblical theologian providing immediate literary and historical context for the passage.`,
          `Task: Situate the selected text and scripture references in their broader biblical context.`,
          baseContext,
          `\nInstructions:`,
          `1. Detail the immediate literary context (what occurs right before and right after this passage).`,
          `2. Describe the historical background, author, audience, and occasion for the book.`,
          `3. Explain the overarching message and structural outline where this excerpt fits.`,
          `4. Summarize the central truth the original author communicated to the original recipients.`,
        ].join('\n');

      case 'summarize':
        return [
          `You are a homiletical editor summarizing sermon and study notes for Preach Mode.`,
          `Task: Provide a concise, memorable summary of the selected excerpt.`,
          baseContext,
          `\nInstructions:`,
          `1. Core Thesis: 1-2 sentence distillation of the central idea.`,
          `2. 3-4 Key Supporting Truths formatted as crisp bullet points.`,
          `3. Pastoral Takeaway / Application for faith and daily life.`,
        ].join('\n');

      case 'translate':
        return [
          `You are a multilingual biblical translator.`,
          `Task: Translate and unpack the selected excerpt across relevant languages for preaching and teaching.`,
          baseContext,
          `\nInstructions:`,
          `1. Provide faithful and natural translations in:`,
          `   - Contemporary English (ESV/NIV cadence)`,
          `   - Akan / Asante Twi (for Ghanaian and West African pulpit ministry)`,
          `   - Latin / French / Spanish (for comparative theological reference where helpful)`,
          `2. Note any key theological terms where meaning shifts slightly between languages.`,
        ].join('\n');

      case 'ask_ai':
        return [
          `You are an intelligent study partner in Preach Mode assisting a pastor or student.`,
          `User Question: "${userQuestion || 'Explain this text in detail and provide insights.'}"`,
          baseContext,
          `\nInstructions:`,
          `1. Answer the user's specific question directly, using the selected document excerpt as the primary reference.`,
          `2. Ground your response in scripture and sound hermeneutical principles.`,
          `3. Keep the explanation rigorous, clear, and actionable for ministry and study.`,
        ].join('\n');

      default:
        return [
          `You are an assistant in Preach Mode.`,
          baseContext,
          `Please provide a helpful study analysis of the selected passage.`,
        ].join('\n');
    }
  }
}

export const aiPromptBuilder = new AiPromptBuilder();
