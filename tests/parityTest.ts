/**
 * Parity test: English vs Akan Twi across the IVR routes.
 *
 * Run (server must already be running):
 *   BASE_URL=http://localhost:3000 npx tsx tests/parityTest.ts
 *
 * Env flags:
 *   STRICT_AUDIO=1          fail (instead of warn) when a prompt file is missing
 *   RUN_PAYMENT_HANDOFF=1   also run safe-outcome key 1 (starts a MoMo sandbox/emulator payment)
 *
 * Rows tagged [spec] encode the behaviour described in the parity summary.
 * If a [spec] row fails, either the route or the spec is wrong. Decide which.
 */

const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || "3000"}`;
const STRICT_AUDIO = process.env.STRICT_AUDIO === "1";
const RUN_PAYMENT = process.env.RUN_PAYMENT_HANDOFF === "1";

type Lang = "en" | "twi";
const LANGS: Lang[] = ["en", "twi"];

let passed = 0;
let failed = 0;
let warned = 0;
const failures: string[] = [];
const seenXml: Array<{ name: string; xml: string }> = [];
const playUrls = new Set<string>();

function ok(cond: boolean, name: string, detail = "") {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.error(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

function warn(name: string, detail = "") {
  warned++;
  console.warn(`  WARN  ${name}${detail ? "\n        " + detail : ""}`);
}

async function get(path: string): Promise<{ status: number; xml: string }> {
  const res = await fetch(BASE + path);
  const text = (await res.text()).replace(/&amp;/g, "&");
  for (const m of text.matchAll(/<Play\s+url="([^"]+)"/g)) playUrls.add(m[1]);
  seenXml.push({ name: path, xml: text });
  return { status: res.status, xml: text };
}

const hasPlay = (xml: string) => /<Play\s+url="/.test(xml);
const hasRedirect = (xml: string) => /<Redirect>/.test(xml);
const hasReject = (xml: string) => /<Reject\s*\/?>/.test(xml);
// The "wrong figure" prompt is prompt 11 in both languages, followed by a redirect.
const isInvalid = (xml: string) => /Audio_prompt_(twi_)?11\.mp3/.test(xml) && hasRedirect(xml);

const PHONE = "0553838464";
const NAME = "Kwame%20Nyamebere";
const ctx = (lang: Lang) => `lang=${lang}&provider=MTN&phone=${PHONE}&name=${NAME}`;

// ── Section A: every menu route plays the right prompt, inside <GetDigits> ──
async function sectionA() {
  console.log("\nA. Menu prompts and barge-in structure");

  const menus: Array<{ label: string; path: (l: Lang) => string; file: Record<Lang, string> }> = [
    { label: "service-select", path: (l) => `/service-select?lang=${l}`, file: { en: "English/Audio_prompt_02.mp3", twi: "Audio_prompt_twi_03.mp3" } },
    { label: "provider-select", path: (l) => `/provider-select?lang=${l}&service=momo`, file: { en: "English/Audio_prompt_03.mp3", twi: "Audio_prompt_twi_02.mp3" } },
    { label: "action-select", path: (l) => `/action-select?lang=${l}&provider=MTN`, file: { en: "English/Audio_prompt_05.mp3", twi: "Audio_prompt_twi_04.mp3" } },
    { label: "enter-recipient", path: (l) => `/enter-recipient?lang=${l}&provider=MTN`, file: { en: "English/Audio_prompt_06.mp3", twi: "Audio_prompt_twi_05.mp3" } },
    { label: "recipient-verify", path: (l) => `/recipient-verify?${ctx(l)}`, file: { en: "English/Audio_prompt_08.mp3", twi: "Audio_prompt_twi_06.mp3" } },
    { label: "enter-amount", path: (l) => `/enter-amount?${ctx(l)}`, file: { en: "English/Audio_prompt_09.mp3", twi: "Audio_prompt_twi_07.mp3" } },
    { label: "safe-confirmation", path: (l) => `/safe-confirmation?${ctx(l)}&amount=500`, file: { en: "English/Audio_prompt_10.mp3", twi: "Audio_prompt_twi_08.mp3" } },
  ];

  for (const m of menus) {
    for (const lang of LANGS) {
      const { status, xml } = await get(m.path(lang));
      ok(status === 200, `${m.label} [${lang}] responds 200`);
      ok(xml.includes(m.file[lang]), `${m.label} [${lang}] plays ${m.file[lang]}`);
      const nested = /<GetDigits[^>]*>[\s\S]*?<Play\s+url="[^"]+"[\s\S]*?<\/GetDigits>/i.test(xml);
      ok(nested, `${m.label} [${lang}] nests <Play> inside <GetDigits> (barge-in)`);
      const otherLang = lang === "en" ? "Audio_prompt_twi_" : "English/";
      ok(!xml.includes(otherLang), `${m.label} [${lang}] contains no ${lang === "en" ? "Twi" : "English"} audio`);
    }
  }

  const welcome = await get("/voice-menu");
  ok(welcome.xml.includes("Welcome_prompt_01.mp3"), "voice-menu plays Welcome_prompt_01.mp3");
}

// ── Section B: language selection branches into service selection ──
async function sectionB() {
  console.log("\nB. Language selection [spec: both languages go to service-select]");
  const en = await get("/language-selection?dtmfDigits=1");
  ok(en.xml.includes("/service-select?lang=en"), "[spec] key 1 -> /service-select?lang=en");
  const twi = await get("/language-selection?dtmfDigits=2");
  ok(twi.xml.includes("/service-select?lang=twi"), "[spec] key 2 -> /service-select?lang=twi", twi.xml.trim());
  const bad = await get("/language-selection?dtmfDigits=7");
  ok(isInvalid(bad.xml), "key 7 on welcome -> invalid-input prompt");
}

// ── Section C: explicit routing table, run for both languages ──
interface Row {
  name: string;
  path: (l: Lang) => string;
  expect: (l: Lang) => string[];
  reject?: boolean;
  invalid?: boolean;
}

async function runRows(title: string, rows: Row[]) {
  console.log(`\n${title}`);
  for (const row of rows) {
    for (const lang of LANGS) {
      const { xml } = await get(row.path(lang));
      const label = `${row.name} [${lang}]`;
      if (row.reject) ok(hasReject(xml), `${label} ends the call (<Reject/>)`, xml.trim());
      if (row.invalid) ok(isInvalid(xml), `${label} plays invalid-input prompt`, xml.trim());
      for (const needle of row.expect(lang)) {
        ok(xml.includes(needle), `${label} contains "${needle}"`, xml.trim());
      }
    }
  }
}

async function sectionC() {
  const rows: Row[] = [
    // service-choice
    { name: "service 1 (MoMo)", path: (l) => `/service-choice?lang=${l}&dtmfDigits=1`, expect: (l) => [`/provider-select?lang=${l}&service=momo`] },
    { name: "service 2 (Banking)", path: (l) => `/service-choice?lang=${l}&dtmfDigits=2`, expect: (l) => [`/provider-select?lang=${l}&service=banking`] },
    { name: "service 9 (repeat)", path: (l) => `/service-choice?lang=${l}&dtmfDigits=9`, expect: (l) => [`/service-select?lang=${l}`] },
    { name: "service 0 (exit)", path: (l) => `/service-choice?lang=${l}&dtmfDigits=0`, expect: () => [], reject: true },
    // provider-choice
    { name: "network 1 (MTN)", path: (l) => `/provider-choice?lang=${l}&service=momo&dtmfDigits=1`, expect: (l) => [`/action-select?lang=${l}&provider=MTN`] },
    { name: "network 2 (Telecel)", path: (l) => `/provider-choice?lang=${l}&service=momo&dtmfDigits=2`, expect: (l) => [`/action-select?lang=${l}&provider=Telecel`] },
    { name: "network 3 (AT)", path: (l) => `/provider-choice?lang=${l}&service=momo&dtmfDigits=3`, expect: (l) => [`/action-select?lang=${l}&provider=AT`] },
    { name: "network 9 (repeat)", path: (l) => `/provider-choice?lang=${l}&service=momo&dtmfDigits=9`, expect: (l) => [`/provider-select?lang=${l}`] },
    { name: "network 0 (exit)", path: (l) => `/provider-choice?lang=${l}&service=momo&dtmfDigits=0`, expect: () => [], reject: true },
    // action-choice
    { name: "action 1 (Send money)", path: (l) => `/action-choice?lang=${l}&provider=MTN&dtmfDigits=1`, expect: (l) => [`/enter-recipient?lang=${l}`] },
    { name: "action 2 (Pay bills)", path: (l) => `/action-choice?lang=${l}&provider=MTN&dtmfDigits=2`, expect: (l) => [`/pay-bills?lang=${l}`] },
    { name: "action 9 (repeat)", path: (l) => `/action-choice?lang=${l}&provider=MTN&dtmfDigits=9`, expect: (l) => [`/action-select?lang=${l}`] },
    { name: "action 0 (exit)", path: (l) => `/action-choice?lang=${l}&provider=MTN&dtmfDigits=0`, expect: () => [], reject: true },
    // recipient number
    { name: "recipient 10 digits", path: (l) => `/verify-recipient?lang=${l}&provider=MTN&dtmfDigits=${PHONE}`, expect: (l) => [`/recipient-verify?lang=${l}`, `phone=${PHONE}`] },
    { name: "recipient too short", path: (l) => `/verify-recipient?lang=${l}&provider=MTN&dtmfDigits=05538`, expect: () => [], invalid: true },
    { name: "recipient 0 (exit)", path: (l) => `/verify-recipient?lang=${l}&provider=MTN&dtmfDigits=0`, expect: () => [], reject: true },
    // KYC verification
    { name: "verify 1 (confirm)", path: (l) => `/recipient-verify-choice?${ctx(l)}&dtmfDigits=1`, expect: (l) => [`/enter-amount?lang=${l}`] },
    { name: "verify 2 (re-enter)", path: (l) => `/recipient-verify-choice?${ctx(l)}&dtmfDigits=2`, expect: (l) => [`/enter-recipient?lang=${l}`] },
    { name: "verify 9 (repeat)", path: (l) => `/recipient-verify-choice?${ctx(l)}&dtmfDigits=9`, expect: (l) => [`/recipient-verify?lang=${l}`] },
    { name: "verify 0 (exit)", path: (l) => `/recipient-verify-choice?${ctx(l)}&dtmfDigits=0`, expect: () => [], reject: true },
    // amount
    { name: "amount 500", path: (l) => `/verify-amount?${ctx(l)}&dtmfDigits=500`, expect: (l) => [`/safe-confirmation?lang=${l}`, "amount=500"] },
    { name: "amount 50*10 (pesewas)", path: (l) => `/verify-amount?${ctx(l)}&dtmfDigits=50*10`, expect: () => ["amount=50.1"] },
    { name: "amount over limit", path: (l) => `/verify-amount?${ctx(l)}&dtmfDigits=5001`, expect: () => [], invalid: true },
    // safe confirmation
    { name: "confirm 2 (cancel)", path: (l) => `/safe-outcome?${ctx(l)}&amount=500&dtmfDigits=2`, expect: (l) => [`/enter-recipient?lang=${l}`] },
    { name: "confirm 0 (exit)", path: (l) => `/safe-outcome?${ctx(l)}&amount=500&dtmfDigits=0`, expect: () => [], reject: true },
  ];
  await runRows("C. Key routing, both languages", rows);
}

// ── Section D: back (8) chain [spec] ──
async function sectionD() {
  const rows: Row[] = [
    { name: "[spec] service 8 -> welcome", path: (l) => `/service-choice?lang=${l}&dtmfDigits=8`, expect: () => ["/voice-menu"] },
    { name: "[spec] network 8 -> service", path: (l) => `/provider-choice?lang=${l}&service=momo&dtmfDigits=8`, expect: (l) => [`/service-select?lang=${l}`] },
    { name: "[spec] action 8 -> network", path: (l) => `/action-choice?lang=${l}&provider=MTN&dtmfDigits=8`, expect: (l) => [`/provider-select?lang=${l}`] },
    { name: "[spec] recipient 8 -> action", path: (l) => `/verify-recipient?lang=${l}&provider=MTN&dtmfDigits=8`, expect: (l) => [`/action-select?lang=${l}`] },
    { name: "[spec] verify 8 -> recipient", path: (l) => `/recipient-verify-choice?${ctx(l)}&dtmfDigits=8`, expect: (l) => [`/enter-recipient?lang=${l}`] },
    { name: "[spec] amount 8 -> verify", path: (l) => `/verify-amount?${ctx(l)}&dtmfDigits=8`, expect: (l) => [`/recipient-verify?lang=${l}`] },
    { name: "[spec] confirm 8 -> amount", path: (l) => `/safe-outcome?${ctx(l)}&amount=500&dtmfDigits=8`, expect: (l) => [`/enter-amount?lang=${l}`] },
  ];
  await runRows("D. Back key (8) chain", rows);
}

// ── Section E: keys not advertised in a menu must be rejected ──
async function sectionE() {
  console.log("\nE. Unadvertised keys are rejected (per language)");
  interface Menu {
    label: string;
    path: (l: Lang, d: string) => string;
    advertised: Record<Lang, string[]>;
    tolerated: Record<Lang, string[]>; // accepted aliases that are not asserted either way
  }
  const menus: Menu[] = [
    {
      label: "service-choice",
      path: (l, d) => `/service-choice?lang=${l}&dtmfDigits=${d}`,
      advertised: { en: ["1", "2", "9", "0"], twi: ["1", "2", "9", "0"] },
      tolerated: { en: ["8"], twi: ["8"] },
    },
    {
      label: "provider-choice",
      path: (l, d) => `/provider-choice?lang=${l}&service=momo&dtmfDigits=${d}`,
      advertised: { en: ["1", "2", "3", "9", "0"], twi: ["1", "2", "3", "4", "0"] },
      tolerated: { en: ["8"], twi: ["8", "9"] },
    },
    {
      label: "action-choice",
      path: (l, d) => `/action-choice?lang=${l}&provider=MTN&dtmfDigits=${d}`,
      advertised: { en: ["1", "2", "3", "4", "5", "8", "9", "0"], twi: ["1", "2", "3", "4", "5", "8", "9", "0"] },
      tolerated: { en: [], twi: [] },
    },
    {
      label: "recipient-verify-choice",
      path: (l, d) => `/recipient-verify-choice?${ctx(l)}&dtmfDigits=${d}`,
      advertised: { en: ["1", "2", "0"], twi: ["1", "2", "0"] },
      tolerated: { en: ["8", "9"], twi: ["8", "9"] },
    },
    {
      label: "safe-outcome",
      path: (l, d) => `/safe-outcome?${ctx(l)}&amount=500&dtmfDigits=${d}`,
      advertised: { en: ["1", "2", "0"], twi: ["1", "2", "0"] },
      tolerated: { en: ["8", "9"], twi: ["8", "9"] },
    },
  ];

  const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  for (const menu of menus) {
    for (const lang of LANGS) {
      for (const d of digits) {
        if (menu.advertised[lang].includes(d) || menu.tolerated[lang].includes(d)) continue;
        // key 1 on safe-outcome would start a payment; it is advertised so never reached here
        const { xml } = await get(menu.path(lang, d));
        ok(isInvalid(xml), `${menu.label} [${lang}] key ${d} is rejected`, xml.trim());
      }
    }
  }

  // Twi network replay key is 4; English key 4 must be invalid
  const twi4 = await get("/provider-choice?lang=twi&service=momo&dtmfDigits=4");
  ok(twi4.xml.includes("/provider-select?lang=twi"), "provider-choice [twi] key 4 replays the network prompt", twi4.xml.trim());
  const en4 = await get("/provider-choice?lang=en&service=momo&dtmfDigits=4");
  ok(isInvalid(en4.xml), "provider-choice [en] key 4 is invalid");
}

// ── Section F: silence handling matches across languages ──
async function sectionF() {
  console.log("\nF. Silence: first retry records speech, third attempt ends the call");
  const steps: Array<{ route: string; query: (l: Lang) => string; step: string }> = [
    { route: "/service-choice", query: (l) => `lang=${l}`, step: "service-select" },
    { route: "/provider-choice", query: (l) => `lang=${l}&service=momo`, step: "provider-select" },
    { route: "/action-choice", query: (l) => `lang=${l}&provider=MTN`, step: "action-select" },
    { route: "/recipient-verify-choice", query: (l) => ctx(l), step: "recipient-verify" },
    { route: "/safe-outcome", query: (l) => `${ctx(l)}&amount=500`, step: "safe-confirmation" },
  ];
  for (const s of steps) {
    for (const lang of LANGS) {
      const first = await get(`${s.route}?${s.query(lang)}&retry=0`);
      ok(/<Record/.test(first.xml) && first.xml.includes(`step=${s.step}`), `${s.route} [${lang}] silence -> <Record> for ${s.step}`, first.xml.trim());
      const last = await get(`${s.route}?${s.query(lang)}&retry=2`);
      ok(hasReject(last.xml), `${s.route} [${lang}] retry 2 -> polite exit`, last.xml.trim());
    }
  }
}

// ── Section G: spoken words map to the same keys in both languages ──
async function sectionG() {
  console.log("\nG. Spoken words -> keys (speech-fallback, no ASR provider needed)");
  interface Say { step: string; lang: Lang; say: string; dtmf: string; extra?: string }
  const rows: Say[] = [
    { step: "language-selection", lang: "en", say: "english", dtmf: "1" },
    { step: "language-selection", lang: "en", say: "one", dtmf: "1" },
    { step: "language-selection", lang: "twi", say: "twi", dtmf: "2" },
    { step: "language-selection", lang: "twi", say: "mmienu", dtmf: "2" },
    { step: "service-select", lang: "en", say: "mobile money", dtmf: "1" },
    { step: "service-select", lang: "twi", say: "momo", dtmf: "1" },
    { step: "service-select", lang: "twi", say: "baako", dtmf: "1" },
    { step: "service-select", lang: "en", say: "banking", dtmf: "2" },
    { step: "service-select", lang: "twi", say: "sikakorabea", dtmf: "2" },
    { step: "service-select", lang: "twi", say: "mmienu", dtmf: "2" },
    { step: "provider-select", lang: "en", say: "mtn", dtmf: "1", extra: "&service=momo" },
    { step: "provider-select", lang: "twi", say: "telecel", dtmf: "2", extra: "&service=momo" },
    { step: "provider-select", lang: "twi", say: "airteltigo", dtmf: "3", extra: "&service=momo" },
    { step: "provider-select", lang: "twi", say: "mmeensa", dtmf: "3", extra: "&service=momo" },
    { step: "action-select", lang: "en", say: "send money", dtmf: "1", extra: "&provider=MTN" },
    { step: "action-select", lang: "twi", say: "mane sika", dtmf: "1", extra: "&provider=MTN" },
    { step: "recipient-verify", lang: "en", say: "confirm", dtmf: "1", extra: `&provider=MTN&phone=${PHONE}&name=${NAME}` },
    { step: "recipient-verify", lang: "twi", say: "aane", dtmf: "1", extra: `&provider=MTN&phone=${PHONE}&name=${NAME}` },
    { step: "recipient-verify", lang: "twi", say: "dabi", dtmf: "2", extra: `&provider=MTN&phone=${PHONE}&name=${NAME}` },
    { step: "safe-confirmation", lang: "twi", say: "aane", dtmf: "1", extra: `&provider=MTN&phone=${PHONE}&name=${NAME}&amount=500` },
    { step: "safe-confirmation", lang: "twi", say: "dabi", dtmf: "2", extra: `&provider=MTN&phone=${PHONE}&name=${NAME}&amount=500` },
  ];
  for (const r of rows) {
    const { xml } = await get(`/speech-fallback?step=${r.step}&lang=${r.lang}&speechText=${encodeURIComponent(r.say)}${r.extra || ""}`);
    ok(xml.includes(`dtmfDigits=${r.dtmf}`), `"${r.say}" at ${r.step} [${r.lang}] -> key ${r.dtmf}`, xml.trim());
  }

  const exitWords: Array<[Lang, string]> = [["en", "cancel"], ["twi", "gyae"], ["twi", "firi ha"]];
  for (const [lang, say] of exitWords) {
    const { xml } = await get(`/speech-fallback?step=service-select&lang=${lang}&speechText=${encodeURIComponent(say)}`);
    ok(hasReject(xml), `"${say}" [${lang}] ends the call`, xml.trim());
  }

  const repeatRoute = "/service-select?lang=twi";
  const rep = await get(`/speech-fallback?step=service-select&lang=twi&retryUrl=${encodeURIComponent(repeatRoute)}&speechText=${encodeURIComponent("tie biom")}`);
  ok(rep.xml.includes(repeatRoute), '"tie biom" repeats the current prompt', rep.xml.trim());
}

// ── Section H: PIN handoff (opt-in because it starts a payment) ──
async function sectionH() {
  console.log("\nH. Zero-PIN handoff");
  if (!RUN_PAYMENT) {
    warn("skipped safe-outcome key 1 (set RUN_PAYMENT_HANDOFF=1 to run; starts a sandbox/emulator payment)");
    return;
  }
  for (const lang of LANGS) {
    const { xml } = await get(`/safe-outcome?${ctx(lang)}&amount=5&dtmfDigits=1`);
    ok(hasPlay(xml), `handoff [${lang}] plays the screen-PIN prompt`);
    ok(!/<GetDigits|<Record/.test(xml), `handoff [${lang}] collects no digits or audio`);
    ok(hasReject(xml), `handoff [${lang}] ends the call so the PIN goes on the handset`);
  }
}

// ── Section I: every prompt URL the routes emit resolves to audio ──
async function sectionI() {
  console.log("\nI. Prompt files exist");
  for (const url of playUrls) {
    let pathname = "";
    try {
      pathname = new URL(url).pathname;
    } catch {
      pathname = url;
    }
    const res = await fetch(BASE + pathname, { headers: { Range: "bytes=0-0" } });
    const type = res.headers.get("content-type") || "";
    const good = (res.status === 200 || res.status === 206) && type.startsWith("audio/");
    if (good) {
      ok(true, `audio ${pathname}`);
    } else if (STRICT_AUDIO) {
      ok(false, `audio ${pathname}`, `status ${res.status}`);
    } else {
      warn(`audio missing: ${pathname} (status ${res.status})`);
    }
  }
}

// ── Section J: no route ever asks for a PIN ──
function sectionJ() {
  console.log("\nJ. Zero-PIN scan across all responses");
  const offenders = seenXml.filter(({ xml }) => /<(GetDigits|Record)[^>]*pin/i.test(xml));
  ok(offenders.length === 0, `no <GetDigits> or <Record> mentions a PIN (${seenXml.length} responses scanned)`, offenders.map((o) => o.name).join(", "));
}

async function main() {
  console.log(`Parity test against ${BASE}`);
  try {
    await get("/health");
  } catch (e: any) {
    console.error(`Cannot reach ${BASE}. Start the server first. (${e.message})`);
    process.exit(2);
  }

  await sectionA();
  await sectionB();
  await sectionC();
  await sectionD();
  await sectionE();
  await sectionF();
  await sectionG();
  await sectionH();
  await sectionI();
  sectionJ();

  console.log("\n" + "=".repeat(60));
  console.log(`${passed} passed, ${failed} failed, ${warned} warnings`);
  if (failed) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
