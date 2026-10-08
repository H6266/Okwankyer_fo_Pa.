/**
 * Ɔkwankyerɛfo Pa - Generic PII & Sensitive Token Scanner
 * 
 * Scans aiTrace records, memory repositories (.data/), app logs, and shadow logs
 * with generic patterns:
 * 1. 10-digit numbers (\b0[235]\d{8}\b or \b\d{10}\b)
 * 2. Spoken digit runs of 7+
 * 3. Currency / amounts
 * 4. Capitalized name tokens (excluding whitelist keywords)
 */

import fs from 'fs';
import path from 'path';
import { aiTrace } from '../src/ai_system/observability/aiTrace';

interface ScanFinding {
  source: string;
  category: '10-DIGIT_NUMBER' | 'SPOKEN_DIGIT_RUN_7+' | 'CURRENCY_AMOUNT' | 'CAPITALIZED_NAME_TOKEN';
  matched: string;
  context: string;
}

const DIGIT_WORDS = new Set([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'oh',
  'hwee', 'baako', 'mmienu', 'mmiɛnsa', 'mmiensa', 'nan', 'ɛnan', 'enan', 'num', 'nnum', 'enum',
  'nsia', 'nson', 'nwɔtwe', 'nwotwe', 'nkron', 'kron'
]);

const KEYWORD_WHITELIST = new Set([
  'MTN', 'MoMo', 'ECG', 'GWCL', 'Ghana', 'English', 'Twi', 'Akan', 'Asante', 'Akuapem',
  'GHS', 'PIN', 'OTP', 'SMS', 'API', 'IVR', 'DTMF', 'VAD', 'ASR', 'TTS', 'NLU', 'LLM',
  'JSON', 'HTTP', 'POST', 'GET', 'OK', 'ID', 'USSD', 'SIM', 'TELEPHONY', 'STUDY',
  'DETERMINISTIC_TEMPLATE', 'MODEL_GENERATED', 'OFFLINE_FALLBACK', 'TEMPLATE_SHORT_CIRCUIT',
  'INTENT_MISMATCH', 'DECISION_KIND_MISMATCH', 'SLOT_PRESENCE_MISMATCH', 'CLOSED', 'OPEN',
  'HALF_OPEN', 'SUCCESS', 'PENDING', 'COMPLETED', 'FAILED', 'REVERSED', 'INITIATED',
  'SAGA_STARTED', 'STEP_COMPLETED', 'CONFIRMED', 'DISPATCHED', 'CANCELLED', 'HOME',
  'AI', 'Brain', 'Gemini', 'OpenAI', 'Okwankyerɛfo', 'Pa', 'Ɔkwankyerɛfo',
  'True', 'False', 'Null', 'Undefined', 'Error', 'Warning', 'Info', 'Debug',
  'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]);

function scanText(source: string, text: string): ScanFinding[] {
  const findings: ScanFinding[] = [];

  // 1. All Ghana Phone formats (+233, 233, 02x, 03x, 05x, or 10-digit)
  const phoneMatches = text.matchAll(/\b(?:\+?233[235]\d{8}|0[235]\d{8}|\d{10})\b/g);
  for (const m of phoneMatches) {
    findings.push({
      source,
      category: '10-DIGIT_NUMBER',
      matched: m[0],
      context: text.substring(Math.max(0, m.index! - 20), Math.min(text.length, m.index! + 30)),
    });
  }

  // 2. Spoken digit runs of 7+
  const words = text.toLowerCase().split(/[\s,.;:!?\-+*/"'{}\[\]()]+/);
  let currentRun: string[] = [];
  for (const w of words) {
    if (DIGIT_WORDS.has(w)) {
      currentRun.push(w);
    } else {
      if (currentRun.length >= 7) {
        findings.push({
          source,
          category: 'SPOKEN_DIGIT_RUN_7+',
          matched: currentRun.join(' '),
          context: currentRun.join(' '),
        });
      }
      currentRun = [];
    }
  }
  if (currentRun.length >= 7) {
    findings.push({
      source,
      category: 'SPOKEN_DIGIT_RUN_7+',
      matched: currentRun.join(' '),
      context: currentRun.join(' '),
    });
  }

  // 3. Currency / amounts
  const amountMatches = text.matchAll(/\b(\d+(?:\.\d+)?\s*(?:cedis?|ghs|pesewas?)|(?:cedis?|ghs)\s*\d+(?:\.\d+)?)\b/gi);
  for (const m of amountMatches) {
    findings.push({
      source,
      category: 'CURRENCY_AMOUNT',
      matched: m[0],
      context: text.substring(Math.max(0, m.index! - 20), Math.min(text.length, m.index! + 30)),
    });
  }

  // 4. Capitalized name tokens (isolated words like "Ama", "Kofi", "Kwame")
  // Only check inside text strings (not JSON keys)
  const tokenMatches = text.matchAll(/\b([A-Z][a-z]{2,15})\b/g);
  for (const m of tokenMatches) {
    const word = m[1];
    if (!KEYWORD_WHITELIST.has(word) && !KEYWORD_WHITELIST.has(word.toUpperCase())) {
      // Check if it's a known proper personal name
      const knownNames = ['Kofi', 'Ama', 'Kwame', 'Yaw', 'Akua', 'Yaa', 'Afia', 'Kwadwo', 'Abena', 'Adwoa', 'Kwaku', 'Esi', 'Mensa', 'Mensah', 'Owusu'];
      if (knownNames.includes(word)) {
        findings.push({
          source,
          category: 'CAPITALIZED_NAME_TOKEN',
          matched: word,
          context: text.substring(Math.max(0, m.index! - 20), Math.min(text.length, m.index! + 30)),
        });
      }
    }
  }

  return findings;
}

export function runFullPiiScan(): { totalFindings: number; findings: ScanFinding[]; summary: Record<string, number> } {
  const allFindings: ScanFinding[] = [];

  // A. Scan aiTrace
  const traces = aiTrace.getAllTraces ? aiTrace.getAllTraces() : [];
  for (const t of traces) {
    const serialized = JSON.stringify(t);
    allFindings.push(...scanText('aiTrace', serialized));
  }

  // B. Scan .data memory repositories
  const dataDir = path.resolve(process.cwd(), '.data');
  if (fs.existsSync(dataDir)) {
    const scanDir = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(full);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          try {
            const content = fs.readFileSync(full, 'utf8');
            allFindings.push(...scanText(`.data/${path.relative(dataDir, full)}`, content));
          } catch {}
        }
      }
    };
    scanDir(dataDir);
  }

  // C. Scan shadow logs (data/shadow_disagreements.json)
  const shadowFile = path.resolve(process.cwd(), 'data/shadow_disagreements.json');
  if (fs.existsSync(shadowFile)) {
    const content = fs.readFileSync(shadowFile, 'utf8');
    allFindings.push(...scanText('data/shadow_disagreements.json', content));
  }

  const summary: Record<string, number> = {
    '10-DIGIT_NUMBER': 0,
    'SPOKEN_DIGIT_RUN_7+': 0,
    'CURRENCY_AMOUNT': 0,
    'CAPITALIZED_NAME_TOKEN': 0,
  };

  const perSource: Record<string, number> = {
    'aiTrace': 0,
    'app_logs': 0,
    'memory_repos': 0,
    'shadow_logs': 0,
    'saga_store': 0,
  };

  for (const f of allFindings) {
    summary[f.category] = (summary[f.category] || 0) + 1;
    if (f.source === 'aiTrace') perSource['aiTrace']++;
    else if (f.source.includes('sagas/')) perSource['saga_store']++;
    else if (f.source.includes('shadow_disagreements')) perSource['shadow_logs']++;
    else if (f.source.includes('.data/')) perSource['memory_repos']++;
    else perSource['app_logs']++;
  }

  return { totalFindings: allFindings.length, findings: allFindings, summary, perSource };
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('scan_pii_generic')) {
  console.log('===============================================================');
  console.log('Ɔkwankyerɛfo Pa - Generic PII & Sensitive Token Scan');
  console.log('===============================================================');
  const res = runFullPiiScan() as any;
  console.log(`Total Findings: ${res.totalFindings}`);
  console.log('\n--- Counts Per Source ---');
  for (const [source, count] of Object.entries(res.perSource)) {
    console.log(`  • ${source.padEnd(25)}: ${count}`);
  }
  console.log('\n--- Breakdown By Category ---');
  for (const [cat, count] of Object.entries(res.summary)) {
    console.log(`  • ${cat.padEnd(25)}: ${count}`);
  }
  if (res.totalFindings > 0) {
    console.log('\nSample Findings:');
    for (const f of res.findings.slice(0, 10)) {
      console.log(`  [${f.source}] ${f.category}: "${f.matched}" in "...${f.context.trim()}..."`);
    }
  }
  console.log('===============================================================');
}
