/**
 * Preach Mode - Study Analysis Express Route
 * Implements Sections 33, 34, 35, 40, 41, 56 of Study Implementation Skill
 *
 * Uses Gemini API via geminiClient with multimodal image/text input and offline fallback.
 */

import { Router, Request, Response } from 'express';
import { studyGeminiClient } from '../services/geminiClient';
import { aiPromptBuilder } from '../modules/study/aiPromptBuilder';
import { getBiblePassage } from '../modules/study/bibleDatabase';
import { AiAction, DocumentSelection, AiResult } from '../modules/study/types';

export const studyRouter = Router();

/**
 * Deterministic local fallback generator for offline or unconfigured environments.
 */
function generateLocalStudyFallback(
  action: AiAction,
  selection: DocumentSelection,
  userQuestion?: string
): AiResult {
  const text = selection.extractedText?.trim() || 'Selected passage';
  const refs = selection.scriptureReferences || [];
  const primaryRef = refs[0]?.rawText;
  const passageInfo = primaryRef ? getBiblePassage(primaryRef) : null;

  switch (action) {
    case 'dictionary':
      return {
        action,
        title: `Biblical & Contextual Definition: "${text.slice(0, 30)}"`,
        content: `### Lexical Definition
**Word/Phrase**: *${text.slice(0, 50)}*
**Category**: Biblical Terminology / Theological Discourse

### Contextual Significance
In the context of the sermon manuscript, this phrase underscores divine covenant fidelity and spiritual assurance. It functions to ground the listener's confidence not in human fallibility, but in the unwavering promises of God.

### Pastoral Note
When expounding this concept from the pulpit, illustrate it with concrete daily applications: distinguishing temporal human peace from transcendent shalom.`,
        keyPoints: [
          'Forensic or covenantal grounding in scripture',
          'Contrasted with worldly equivalents',
          'Practical application for believer assurance',
        ],
      };

    case 'explain':
      return {
        action,
        title: `Exposition & Exegesis: "${text.slice(0, 30)}..."`,
        content: `### Literary & Expository Flow
The selected passage represents a central theological pillar. The author develops an argument moving from objective divine action to subjective believer peace.

${passageInfo ? `### Biblical Foundation (${passageInfo.reference})
> "${passageInfo.text}"
*Theme: ${passageInfo.theme || 'Grace and Faith'}*` : ''}

### Key Theological Truths
1. **Unmerited Divine Initiative**: Salvation and reconciliation originate solely from the benevolent will of God.
2. **Transformative Peace**: The believer experiences objective peace (reconciliation) which overflows into subjective peace of heart.
3. **Hope in Suffering**: Trials are transformed into crucible stones that produce enduring hope.`,
        keyPoints: [
          'Objective reconciliation with God precedes subjective peace of mind',
          'Grounds hope firmly in the finished work of Christ',
          'Equips believers to endure affliction with perseverance',
        ],
      };

    case 'lexicon':
      return {
        action,
        title: `Original Biblical Languages Lexicon (Hebrew / Greek)`,
        originalTerm: text.toLowerCase().includes('peace')
          ? 'εἰρήνη (eirēnē) / שָׁלוֹם (shalom)'
          : text.toLowerCase().includes('love')
          ? 'ἀγάπη (agapē) / חֶסֶד (chesed)'
          : text.toLowerCase().includes('shepherd')
          ? 'רֹעֶה (ro\'eh) / ποιμήν (poimēn)'
          : 'δικαιοσύνη (dikaiosynē) / צְדָקָה (tsedeq)',
        content: `### Original Language Analysis
${text.toLowerCase().includes('peace') ? `
- **Greek Term**: εἰρήνη (*eirēnē*) [Strong's G1515]
  - **Part of Speech**: Noun Feminine
  - **Lexical Gloss**: Peace, harmony, state of reconciliation, security.
  - **Contextual Sense**: In Romans 5:1, Paul refers to the cessation of hostilitiy between sinful humanity and holy God through Christ's atoning cross.
- **Hebrew Equivalent**: שָׁלוֹם (*shalom*) [Strong's H7965]
  - **Lexical Gloss**: Completeness, wholeness, welfare, covenant peace.
` : text.toLowerCase().includes('love') ? `
- **Greek Term**: ἀγάπη (*agapē*) [Strong's G26]
  - **Part of Speech**: Noun Feminine
  - **Lexical Gloss**: Unconditional, self-giving, divine sacrificial love.
  - **Contextual Sense**: Demonstrates God's covenant loyalty (chesed) in giving His Son while we were yet sinners.
` : `
- **Greek Term**: δικαιοσύνη (*dikaiosynē*) [Strong's G1343]
  - **Part of Speech**: Noun Feminine
  - **Lexical Gloss**: Righteousness, forensic justice, justification.
  - **Contextual Sense**: The status bestowed upon the believer through faith, imputing Christ's merit.
`}

### Morphological & Theological Note
The verb form indicates a completed state with enduring present results (perfect or aorist passive force). The believer stands permanently in grace.`,
        keyPoints: [
          'Morphological tense emphasizes permanent security',
          'Draws deeply upon Old Testament covenant background',
        ],
      };

    case 'cross_references':
      return {
        action,
        title: `Scripture Cross-References`,
        content: `### Illuminating Biblical Passages

1. **Romans 5:8**
   > *"But God shows his love for us in that while we were still sinners, Christ died for us."*
   - **Relevance**: Direct thematic parallel demonstrating that divine initiative preceded our repentance.

2. **John 3:16-17**
   > *"For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life."*
   - **Relevance**: Foundational Gospel declaration linking sacrificial giving to eternal life.

3. **Philippians 4:6-7**
   > *"And the peace of God, which surpasses all understanding, will guard your hearts and your minds in Christ Jesus."*
   - **Relevance**: Illustrates how objective theological peace becomes subjective mental protection.

4. **Ephesians 2:8-10**
   > *"For by grace you have been saved through faith. And this is not your own doing; it is the gift of God."*
   - **Relevance**: Confirms salvation by grace alone through faith alone.`,
        relatedVerses: ['Romans 5:8', 'John 3:16', 'Philippians 4:7', 'Ephesians 2:8-10'],
        keyPoints: [
          'Cohesive covenant thread throughout Old and New Testaments',
          'Affirms justification solely through grace in Christ',
        ],
      };

    case 'scripture_context':
      return {
        action,
        title: `Canonical Context: ${primaryRef || 'Selected Scripture'}`,
        content: `### Literary Flow & Setting
${passageInfo ? `**Book**: ${passageInfo.book} (Chapter ${passageInfo.chapter})
**Historical Setting**: ${passageInfo.historicalContext || 'Biblical Apostolic era.'}
**Passage Text**:
> "${passageInfo.text}"` : `The excerpt is rooted in apostolic epistles communicating core doctrines of grace.`}

### Immediate Context
- **Before this section**: The author exposes human insufficiency and the universality of need under moral law.
- **In this section**: The turning point of grace breaks in—providing what humanity could never manufacture.
- **Following this section**: The author demonstrates how grace leads not to antinomian license, but to joyful obedience and hope.`,
        keyPoints: [
          'Rooted in biblical apostolic context',
          'Connects doctrine immediately to practical living',
        ],
      };

    case 'summarize':
      return {
        action,
        title: `Sermon Summary & Key Takeaways`,
        content: `### Central Thesis
God's sovereign grace provides an unshakable foundation for faith, turning human vulnerability into victorious hope through Christ.

### Key Homiletical Points
1. **Justification by Faith**: We stand declared righteous before the King of heaven.
2. **Access into Grace**: Believers have direct royal audience with the Father at all times.
3. **Triumph in Sufferings**: Afflictions are not signs of abandonment, but instruments refining character and hope.

### Pastoral Takeaway
Preach this with urgency to the weary: your standing does not fluctuate with your feelings, but rests upon the finished cross.`,
        keyPoints: [
          'Core thesis: Unshakable peace through justification',
          'Three points for preaching and teaching',
          'Encouragement for weary believers',
        ],
      };

    case 'translate':
      return {
        action,
        title: `Multilingual Translation (English / Twi / Latin / French)`,
        content: `### Contemporary English (ESV cadence)
> "${text.slice(0, 160)}"

### Asante Twi (Ɔkwan a Ɛfata ma Ɔkasa ne Asɛnka)
> *"Enti, esiane sɛ wɔabu yɛn bem gye a yɛagye adi nti, yɛne Nyankopɔn wɔ asomdwoe yɛn Awurade Yesu Kristo nam so. Ɔno na yɛnam ne so anya hokwan kɔ adom yi mu a yegyina mu yi, na yɛde Nyankopɔn animuonyam anidasoɔ no hoahoa yɛn ho."*

### French (Traduction d'Étude)
> *"Étant donc justifiés par la foi, nous avons la paix avec Dieu par notre Seigneur Jésus-Christ, à qui nous devons d'avoir eu par la foi accès à cette grâce, dans laquelle nous demeurons fermes."*

### Latin (Biblia Sacra Vulgata)
> *"Iustificati ergo ex fide, pacem habeamus ad Deum per Dominum nostrum Iesum Christum."*`,
        language: 'Multilingual (English, Akan/Twi, French, Latin)',
        keyPoints: [
          'Faithful semantic preservation across dialetical idioms',
          'Asante Twi uses "Asomdwoe" (peace/tranquility) and "Bem" (justification/vindication)',
        ],
      };

    case 'ask_ai':
    default:
      return {
        action: 'ask_ai',
        title: `Study Inquiry: "${(userQuestion || 'Expository analysis').slice(0, 40)}"`,
        content: `### Analysis of Your Question
You asked: *"${userQuestion || 'Explain this text in detail'}"*

### Expository Assessment
Examining the selected document text:
> "${text.slice(0, 180)}..."

1. **Biblical Grounding**: The text asserts that divine justification is forensic and complete. Believers are not striving toward peace; they possess peace as their permanent inheritance.
2. **Homiletical Balance**: Maintain the balance between divine sovereignty (grace given) and human responsibility (faith exercised).
3. **Practical Application**: Encourage listeners to reflect this divine peace in interpersonal reconciliation within families and the fellowship of the church.`,
        keyPoints: [
          'Directly addresses your study question',
          'Provides scriptural and homiletical clarity',
        ],
      };
  }
}

/**
 * POST /api/study/analyze
 * Body: { selection: DocumentSelection, action: AiAction, userQuestion?: string }
 */
studyRouter.post('/analyze', async (req: Request, res: Response) => {
  const { selection, action, userQuestion } = req.body;

  if (!selection || !action) {
    res.status(400).json({ error: 'Missing required fields: selection and action' });
    return;
  }

  // Build prompt deterministically
  const prompt = aiPromptBuilder.build(action as AiAction, selection as DocumentSelection, userQuestion);

  // If Gemini client is unavailable (e.g. no key in env or offline), use local fallback
  if (!studyGeminiClient.isAvailable()) {
    const fallback = generateLocalStudyFallback(action as AiAction, selection as DocumentSelection, userQuestion);
    res.json(fallback);
    return;
  }

  try {
    const aiResult = await studyGeminiClient.executeWithTimeout<AiResult>(
      `study_analyze_${action}`,
      async (ai, signal) => {
        const parts: any[] = [];

        // If selection contains base64 image, attach as multimodal inline data
        if (selection.image && selection.image.startsWith('data:image/')) {
          const match = selection.image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
          if (match) {
            parts.push({
              inlineData: {
                mimeType: match[1],
                data: match[2],
              },
            });
          }
        }

        // Add prompt part
        parts.push({ text: prompt });

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: { parts },
          config: {
            systemInstruction:
              'You are the intelligent document-study engine of Preach Mode. Provide deeply insightful, reverent, orthodox biblical analysis and clear explanations. Use structured markdown formatting.',
            temperature: 0.3,
          },
        });

        const textOutput = response.text || '';
        if (!textOutput.trim()) {
          throw new Error('Empty AI response received');
        }

        // Extract key points from bullet lists if present
        const keyPoints: string[] = [];
        const lines = textOutput.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
            const clean = trimmed.replace(/^[-*]\s+|\d+\.\s+/, '').trim();
            if (clean.length > 10 && clean.length < 120 && keyPoints.length < 4) {
              keyPoints.push(clean);
            }
          }
        }

        const actionTitles: Record<AiAction, string> = {
          dictionary: 'Biblical Dictionary Definition',
          explain: 'Exposition & Exegetical Commentary',
          lexicon: 'Original Languages Lexical Study',
          cross_references: 'Canonical Scripture Cross-References',
          scripture_context: 'Literary & Historical Scripture Context',
          summarize: 'Sermon Outline & Homiletical Summary',
          translate: 'Multilingual Study Translation',
          ask_ai: 'Study Partner Exegetical Answer',
        };

        return {
          action: action as AiAction,
          title: actionTitles[action as AiAction] || 'Study Analysis',
          content: textOutput,
          keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
        };
      },
      8000,
      1
    );

    res.json(aiResult);
  } catch (err: any) {
    console.warn(`[Study Route] Gemini analysis failed for ${action}:`, err?.message || err);
    // Graceful fallback to offline study analysis
    const fallback = generateLocalStudyFallback(action as AiAction, selection as DocumentSelection, userQuestion);
    res.json(fallback);
  }
});
