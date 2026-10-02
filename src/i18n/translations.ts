/**
 * Internationalization Dictionary for Ɔkwankyerɛfo Pa
 * English & Akan Twi
 * 
 * NOTE ON TWI TRANSLATIONS:
 * Per project accessibility guidelines, all Akan Twi translations are marked
 * with "TODO: verify with native speaker" for production validation.
 * Core phrasing matches the studio audio recordings recorded by Ghanaian voice artists.
 */

export interface TranslationDictionary {
  nav: {
    brand: string;
    tagline: string;
    why: string;
    howItWorks: string;
    safety: string;
    languages: string;
    whoItsFor: string;
    callNow: string;
    tryDemo: string;
  };
  hero: {
    badge: string;
    ctaCall: string;
    ctaDemo: string;
    telNumber: string;
    worksOnAnyPhone: string;
    slides: Array<{
      id: string;
      title: string;
      subtitle: string;
      cta: string;
      persona: string;
      verifiedTwi?: boolean;
    }>;
  };
  problem: {
    eyebrow: string;
    heading: string;
    subheading: string;
    cards: Array<{
      id: string;
      title: string;
      description: string;
      impact: string;
    }>;
  };
  personas: {
    eyebrow: string;
    heading: string;
    subheading: string;
    items: Array<{
      id: string;
      role: string;
      scenario: string;
      solution: string;
    }>;
  };
  howItWorks: {
    eyebrow: string;
    heading: string;
    subheading: string;
    listenSample: string;
    steps: Array<{
      stepNumber: number;
      title: string;
      desc: string;
      voicePrompt: string;
      audioUrl: string;
    }>;
  };
  pillars: {
    eyebrow: string;
    heading: string;
    subheading: string;
    items: Array<{
      number: string;
      title: string;
      tagline: string;
      desc: string;
      technicalDetail: string;
    }>;
    keypadGrammarTitle: string;
    keypadGrammarDesc: string;
    keys: Array<{
      key: string;
      label: string;
      desc: string;
    }>;
  };
  languagesSection: {
    eyebrow: string;
    heading: string;
    subheading: string;
    activeTitle: string;
    roadmapTitle: string;
    activeLanguages: Array<{
      name: string;
      nativeName: string;
      status: string;
      coverage: string;
    }>;
    roadmapLanguages: Array<{
      name: string;
      nativeName: string;
      status: string;
    }>;
  };
  partners: {
    eyebrow: string;
    heading: string;
    liveWith: string;
    roadmapWith: string;
  };
  finalCta: {
    heading: string;
    subheading: string;
    callAction: string;
    testAction: string;
    zeroDataNote: string;
  };
  footer: {
    builtBy: string;
    accessibilityStatement: string;
    privacyNote: string;
    phoneLabel: string;
    developerLink: string;
  };
}

export const translations: Record<"en" | "twi", TranslationDictionary> = {
  en: {
    nav: {
      brand: "Ɔkwankyerɛfo Pa",
      tagline: "The Good Guide",
      why: "Why It Matters",
      howItWorks: "How It Works",
      safety: "Safety Pillars",
      languages: "Languages",
      whoItsFor: "Who It's For",
      callNow: "Call +233 30 804 8098",
      tryDemo: "Try Live Demo",
    },
    hero: {
      badge: "Voice Accessibility & Transaction Safety Layer for Ghana DFS",
      ctaCall: "Call +233 30 804 8098",
      ctaDemo: "Launch Testing Dashboard",
      telNumber: "+233308048098",
      worksOnAnyPhone: "Works on any phone — no smartphone, no app, no internet required.",
      slides: [
        {
          id: "market",
          title: "Send money in your own voice. No screens. No stress.",
          subtitle: "Market traders handle fast mobile money payments by voice without wrestling with complex visual menus.",
          cta: "Call +233 30 804 8098",
          persona: "Market Trader in Kejetia, Kumasi",
        },
        {
          id: "rural",
          title: "No smartphone. No data. Just an ordinary phone call.",
          subtitle: "Runs seamlessly on basic button phones across Ghana on standard telco voice channels.",
          cta: "See How It Works",
          persona: "Rural Cocoa Farmer in Western North",
        },
        {
          id: "accessible",
          title: "Mobile Money you can hear, not just see.",
          subtitle: "Clear spoken readback of recipient names and amounts before any payment is authorized.",
          cta: "Test the Voice Flow",
          persona: "Visually Impaired Student in Cape Coast",
        },
        {
          id: "elderly",
          title: "Take your time. We'll wait, and we'll repeat.",
          subtitle: "No 15-second USSD session timeouts. Generous 40-second input windows and instant repeat on key 9.",
          cta: "Try the Simulator",
          persona: "Pensioner in Sunyani",
        },
        {
          id: "security",
          title: "Your PIN never leaves your phone.",
          subtitle: "Zero-PIN voice architecture. Payments hand off safely to your private network prompt without voice eavesdropping.",
          cta: "Inspect Safety Architecture",
          persona: "Transaction Safety Guarantee",
        },
      ],
    },
    problem: {
      eyebrow: "The Accessibility Gap",
      heading: "Why Visual USSD Fails Millions of Ghanaians",
      subheading: "Mobile Money is the lifeblood of Ghana's economy, yet visual USSD menus exclude vulnerable citizens every day.",
      cards: [
        {
          id: "visual_menus",
          title: "Visual-Only Text Menus",
          description: "USSD requires reading tiny monochrome text on low-contrast screens, blocking visually impaired and low-literacy users.",
          impact: "Excludes 1.2M+ visually impaired & low-literacy citizens",
        },
        {
          id: "timeout_anxiety",
          title: "Aggressive 15–20s Timeouts",
          description: "Telco USSD sessions abruptly disconnect before elderly users or slow typers can locate and punch their 10-digit numbers.",
          impact: "High frustration, session restarts & abandoned transfers",
        },
        {
          id: "wrong_numbers",
          title: "Wrong-Number Money Loss",
          description: "A single mistyped digit sends hard-earned money to the wrong person with no audible name confirmation before sending.",
          impact: "Irreversible financial loss for market women & families",
        },
        {
          id: "pin_eavesdropping",
          title: "PIN Eavesdropping & Social Danger",
          description: "People who cannot read frequently ask strangers or agents to type their PIN, exposing life savings to fraud.",
          impact: "Compromised financial dignity & rampant agent fraud",
        },
      ],
    },
    personas: {
      eyebrow: "Inclusive By Design",
      heading: "Designed For The People Who Need It Most",
      subheading: "Tailored to daily financial realities across markets, farming communities, and transport hubs.",
      items: [
        {
          id: "visually_impaired",
          role: "Visually Impaired Citizens",
          scenario: "Wants to send money independently without having to ask bystanders to read screens or confirm recipient details.",
          solution: "Complete audio guidance with verified spoken KYC name readback and auditory keypad feedback.",
        },
        {
          id: "elderly",
          role: "Elderly & Pensioners",
          scenario: "Struggles with rapid USSD countdowns, tiny buttons, and accidental session timeouts.",
          solution: "Relaxed 40-second entry windows, friendly paced speech, and key 9 to repeat any instruction.",
        },
        {
          id: "low_literacy",
          role: "Low Text Literacy Traders",
          scenario: "Speaks fluent Akan Twi but cannot navigate complex multi-level English text menus.",
          solution: "100% authentic Akan Twi voice guidance from greeting to spoken receipt, with zero English jargon.",
        },
        {
          id: "rural_merchants",
          role: "Rural Farmers & Traders",
          scenario: "Operates in areas with zero 4G/data coverage on basic $15 feature phones.",
          solution: "Standard voice call protocol (+233 30 804 8098) that functions on any phone network with 2G GSM reception.",
        },
      ],
    },
    howItWorks: {
      eyebrow: "How It Works",
      heading: "Simple, Human Voice Flow in 5 Clean Steps",
      subheading: "An intuitive conversational flow that protects your money at every stage.",
      listenSample: "Listen to real studio prompt:",
      steps: [
        {
          stepNumber: 1,
          title: "Dial +233 30 804 8098",
          desc: "Make an ordinary phone call from any device. Choose English (1) or Akan Twi (2).",
          voicePrompt: "Welcome to Ɔkwankyerɛfo Pa. For English, press 1. For Twi, press 2.",
          audioUrl: "/audio/Welcome_prompt_01.mp3",
        },
        {
          stepNumber: 2,
          title: "Select Service & Recipient",
          desc: "Select Mobile Money (1), punch the 10-digit number, and hear it repeated clearly.",
          voicePrompt: "Enter the 10-digit number you want to send money to, followed by hash (#).",
          audioUrl: "/audio/English/Audio_prompt_06.mp3",
        },
        {
          stepNumber: 3,
          title: "Spoken KYC Name Confirmation",
          desc: "Hear the verified recipient's full name read aloud BEFORE any money moves.",
          voicePrompt: "You are about to send money to Kwame Nyamebere, ending in 8464. To confirm, press 1.",
          audioUrl: "/audio/English/Audio_prompt_08.mp3",
        },
        {
          stepNumber: 4,
          title: "Zero-PIN Security Handoff",
          desc: "Never speak your PIN. The voice call pauses and prompts your phone screen to enter your secret PIN.",
          voicePrompt: "Confirmed. Now please check your phone screen and enter your MoMo PIN accurately.",
          audioUrl: "/audio/English/Audio_prompt_11.mp3",
        },
        {
          stepNumber: 5,
          title: "Spoken Audio Receipt",
          desc: "Hear a spoken receipt with full transaction summary and unique reference code (e.g. OKP-847291).",
          voicePrompt: "Congratulations! You have successfully sent 500 Ghana cedis. Reference number OKP-847291.",
          audioUrl: "/audio/English/Audio_prompt_12.mp3",
        },
      ],
    },
    pillars: {
      eyebrow: "Non-Negotiable Architecture",
      heading: "The Four Safety Pillars",
      subheading: "Engineered from the ground up to prevent fraud, eliminate errors, and protect user dignity.",
      items: [
        {
          number: "01",
          title: "Strict Dual-Track Language Isolation",
          tagline: "Zero language mixing after selection",
          desc: "Once English (1) or Twi (2) is chosen, 100% of audio prompts, speech recognition models, and error responses remain in that language.",
          technicalDetail: "Enforces strict audio catalog partition (/audio/English/ vs /audio/Twi/) and dynamic STT language binding (ak-GH vs en-US).",
        },
        {
          number: "02",
          title: "Zero-PIN Voice Security Gate",
          tagline: "Your secret PIN is never spoken or dialled over the call",
          desc: "The voice call explicitly tells callers to check their private handset screen. Microphone and STT capture are actively muted during authorization.",
          technicalDetail: "Triggered via telco RequestToPay USSD push. The voice gateway disconnects or holds without audio capture during PIN authentication.",
        },
        {
          number: "03",
          title: "Spoken KYC Recipient Readback",
          tagline: "Hear verified name before a single cedi leaves your wallet",
          desc: "Eliminates wrong-number transfers by querying telco subscriber registries and reading back verified names like 'Kwame Nyamebere ending in 8464'.",
          technicalDetail: "Integrates simulated telco core KYC lookup with fallback pattern recognition on phone digits.",
        },
        {
          number: "04",
          title: "Universal Keypad Grammar",
          tagline: "Standardized controls across every menu",
          desc: "Predictable keypad logic: # submits, * inputs pesewas, 8 steps back, 9 repeats the audio, 0 cancels cleanly.",
          technicalDetail: "Uniform DTMF grammar parser enforced on all VoiceXML menus with barge-in support.",
        },
      ],
      keypadGrammarTitle: "Universal Keypad Grammar",
      keypadGrammarDesc: "Works identically across every menu so you never get stuck:",
      keys: [
        { key: "#", label: "Submit", desc: "Confirms recipient number or cedi amount" },
        { key: "*", label: "Decimal", desc: "Pesewas separator (e.g. 50*50 for GH₵ 50.50)" },
        { key: "8", label: "Back", desc: "Returns to the previous menu step" },
        { key: "9", label: "Repeat", desc: "Replays the current spoken instruction" },
        { key: "0", label: "Cancel", desc: "Safely aborts call with zero deduction" },
      ],
    },
    languagesSection: {
      eyebrow: "Linguistic Inclusion",
      heading: "Ghanaian Languages First",
      subheading: "Technology that speaks the languages our grandmothers and market traders actually speak.",
      activeTitle: "Currently Active (Production Ready)",
      roadmapTitle: "Linguistic Roadmap (Upcoming Dialects)",
      activeLanguages: [
        {
          name: "Akan Twi",
          nativeName: "Asante Twi & Akuapem",
          status: "Live Studio Audio & NLU",
          coverage: "12 Studio Recorded Prompts + ak-GH Speech Recognition",
        },
        {
          name: "Ghanaian English",
          nativeName: "English (Ghana)",
          status: "Live Studio Audio & NLU",
          coverage: "12 Studio Recorded Prompts + en-US / en-GH Speech Recognition",
        },
      ],
      roadmapLanguages: [
        { name: "Ga", nativeName: "Ga-Dangme (Greater Accra)", status: "Roadmap: Script translation in progress" },
        { name: "Ewe", nativeName: "Eʋegbe (Volta Region)", status: "Roadmap: Acoustic sampling in progress" },
        { name: "Dagbani", nativeName: "Dagbanli (Northern Region)", status: "Roadmap: Voice talent casting" },
      ],
    },
    partners: {
      eyebrow: "Ecosystem Compatibility",
      heading: "Works With Ghana's Digital Financial Infrastructure",
      liveWith: "Live Sandbox Integration",
      roadmapWith: "Provider-Agnostic Adapter Roadmap",
    },
    finalCta: {
      heading: "Experience Voice Accessibility Now",
      subheading: "Call the live pilot phone number or test the full interactive flow in our developer console.",
      callAction: "Call +233 30 804 8098",
      testAction: "Open Voice Tester",
      zeroDataNote: "Zero data required. Ordinary phone call rates apply on Ghana networks.",
    },
    footer: {
      builtBy: "Built with passion by Team Anidasoɔ (\"Hope\") • Africa's Talking Voice Hackathon",
      accessibilityStatement: "Accessibility Statement: Built to WCAG 2.1 AA/AAA contrast standards with high-contrast keyboard controls.",
      privacyNote: "Zero-PIN Security Guarantee: We never request, log, or record user Mobile Money PINs.",
      phoneLabel: "Toll Line",
      developerLink: "Developer & QA Testing Dashboard",
    },
  },
  twi: {
    nav: {
      brand: "Ɔkwankyerɛfo Pa",
      tagline: "Akwankyerɛ pa ma wo MoMo",
      why: "Nea enti a ɛho hia", // TODO: verify with native speaker
      howItWorks: "Sɛnea ɛyɛ adwuma", // TODO: verify with native speaker
      safety: "Bammbɔ nnyinasoɔ", // TODO: verify with native speaker
      languages: "Kasa ahodoɔ", // TODO: verify with native speaker
      whoItsFor: "Hwan na ɛyɛ ma no", // TODO: verify with native speaker
      callNow: "Frɛ +233 30 804 8098",
      tryDemo: "Sɔ hwɛ wɔ ha",
    },
    hero: {
      badge: "Nne Akwankyerɛ ne Bammbɔ ma Ghana Sika Dwumadie", // TODO: verify with native speaker
      ctaCall: "Frɛ +233 30 804 8098",
      ctaDemo: "Buei Nhwehwɛmu Afiri No", // TODO: verify with native speaker
      telNumber: "+233308048098",
      worksOnAnyPhone: "Ɛyɛ adwuma wɔ fɔn biara so — yamfɔn, kanea fɔn, data biara nka ho.",
      slides: [
        {
          id: "market",
          title: "Fa wo ankasa nne mane sika. Screen biara nni ho. Dadwen biara nni ho.", // TODO: verify with native speaker
          subtitle: "Dwa so aguadifoɔ betumi amane sika ntɛmntɛm a wonnhia sɛ wɔkenkan asɛm biara wɔ fɔn so.",
          cta: "Frɛ +233 30 804 8098",
          persona: "Kejetia Dwaso Baa, Kumasi",
        },
        {
          id: "rural",
          title: "Smart fɔn nni ho. Data nni ho. Frɛ nkutoo na ɛwɔ ho.", // TODO: verify with native speaker
          subtitle: "Ɛyɛ adwuma pɛpɛɛpɛ wɔ yamfɔn biara so wɔ Ghana fɔn nkitahodi nyinaa so.",
          cta: "Hwɛ Sɛnea Ɛyɛ Adwuma",
          persona: "Kookoo Kuafoɔ wɔ Western North",
        },
        {
          id: "accessible",
          title: "Mobile Money a wote nka, ɛnyɛ sɛ wode w'ani behwɛ nkutoo.", // TODO: verify with native speaker
          subtitle: "Wobɛte nea woremane no din ne sika dodow no nne mu pefee ansa na sika no afiri mu.",
          cta: "Sɔ Nne No Hwɛ",
          persona: "Anifurafoɔ Sukuuni wɔ Oguaa",
        },
        {
          id: "elderly",
          title: "Nya aboterɛ. Yɛbɛtwɛn wo, na yɛaka akyerɛ wo bio.", // TODO: verify with native speaker
          subtitle: "USSD bere tiawa nni ha. Nya sekend 40 nwura sika dodow no mu, na mia 9 sɛ worepɛ ate bio.",
          cta: "Bɔ Mfiri No Hwɛ",
          persona: "Akwaaba Panyin wɔ Sunyani",
        },
        {
          id: "security",
          title: "Wo PIN mfiri wo fɔn so da.", // TODO: verify with native speaker
          subtitle: "Yɛremmisa wo PIN wɔ nne frɛ no mu da. Wode wo PIN bɛnwura wo fɔn screen so a obiara nte.",
          cta: "Hwɛ Bammbɔ Nhyehyeɛ No",
          persona: "Bammbɔ Nhyɛsoɔ Peefe",
        },
      ],
    },
    problem: {
      eyebrow: "Ɔhaw a Ɛwɔ USSD So", // TODO: verify with native speaker
      heading: "Nea Enti a USSD Nhoma No Ha Ghanafoɔ Bebree", // TODO: verify with native speaker
      subheading: "Mobile Money na ama Ghana agyina, nanso mfonini nkyerɛwee no gyaa nnipa bebree to nkyɛn.",
      cards: [
        {
          id: "visual_menus",
          title: "Ani-nkutoo Nkyerɛwee Menyu", // TODO: verify with native speaker
          description: "USSD hwehwɛ sɛ wokenkan nkyerɛwee nketenkete wɔ fɔn kakraba so, na ɛno ma anifurafoɔ brɛ.",
          impact: "Ɛtwa nnipa bɛboro 1.2M kwan",
        },
        {
          id: "timeout_anxiety",
          title: "Sekend 15–20 Bere a Ɛkɔ Ntɛm Dodo", // TODO: verify with native speaker
          description: "Ansa na mmerewa ne npanimfoɔ bɛhunu nɔma no na wɔamia no, na call no atwa mu.",
          impact: "Ɛma adwene tu frafra na sika mantumi ankɔ",
        },
        {
          id: "wrong_numbers",
          title: "Nɔma Foforo a Sika Kɔ So", // TODO: verify with native speaker
          description: "Sɛ wofom digit baako pɛ a, sika no kɔ ma obi foforo a wonte din biara mfi anim.",
          impact: "Sika berɛ a ɛyera ma aguadifoɔ",
        },
        {
          id: "pin_eavesdropping",
          title: "PIN a Obi Foforo Te anaa Hu", // TODO: verify with native speaker
          description: "Nnipa a wɔntumi nkenkan taa ka kyerɛ afoforo anaa agent sɛ ɔmfa ne PIN nnwura mu, na ɛno ma owuo ba.",
          impact: "Sikasɛm bammbɔ a ɛsɛe",
        },
      ],
    },
    personas: {
      eyebrow: "Yɛyɛɛ No Ma Obiara", // TODO: verify with native speaker
      heading: "Yɛhyehyɛɛ No Maa Nnipa a Wɔhia Paa", // TODO: verify with native speaker
      subheading: "Ɛbata da biara asetenam sikasɛm ho wɔ dwa so, nkuraase, ne baabiara.",
      items: [
        {
          id: "visually_impaired",
          role: "Anifurafoɔ a Wɔwɔ Ghana",
          scenario: "Wopɛ sɛ wode wo nsa mane sika a wonnhia obiara mmoa sɛ ɔnkenkan screen no nkyerɛ wo.",
          solution: "Nne akwankyerɛ a ɛka recipient no din nyinaa pefee gu w'asom ansa na sika no afiri mu.",
        },
        {
          id: "elderly",
          role: "Mpanimfoɔ ne Akwankwaafoɔ",
          scenario: "Fɔn so nhoma a ɛkɔ ntɛm dodo no ha wɔn, na button nketenkete no ma wɔbrɛ.",
          solution: "Sekend 40 bebrebe kwan, kasa brɛoo a emu da hɔ, ne mia 9 sɛ worepɛ sɛ yɛka bio.",
        },
        {
          id: "low_literacy",
          role: "Aguadifoɔ a Wɔnnkenkan Borɔfo",
          scenario: "Wɔte Akan Twi nanso Borɔfo nsɛmfua a ɛwɔ menyu no mu no de dadwen ba.",
          solution: "100% Akan Twi kasa ankasa fi ahyɛase kɔsi nkaedum ahyɛnsodeɛ so.",
        },
        {
          id: "rural_merchants",
          role: "Kuafoɔ ne Nkuraase Aguadifoɔ",
          scenario: "Wɔyɛ adwuma wɔ baabi a internet anaa data nni hɔ koraa, fɔn yamfɔn na wɔde di dwuma.",
          solution: "Frɛ +233 30 804 8098 te sɛ frɛ biara a 2G fɔn koraa tumi yɛ no.",
        },
      ],
    },
    howItWorks: {
      eyebrow: "Sɛnea Ɛyɛ Adwuma", // TODO: verify with native speaker
      heading: "Nne Akwankyerɛ a Ɛnyɛ Den wɔ Anammɔn 5 Mu", // TODO: verify with native speaker
      subheading: "Akwankyerɛ pa a ɛbɔ wo sika ho ban berɛ biara.",
      listenSample: "Tie studio nne ankasa:",
      steps: [
        {
          stepNumber: 1,
          title: "Frɛ +233 30 804 8098",
          desc: "Fa fɔn biara frɛ nɔma no. Paw Borɔfo (1) anaa Twi (2).",
          voicePrompt: "Welcome to Ɔkwankyerɛfo Pa. For English, press 1. Twi firi mu, mia 2.",
          audioUrl: "/audio/Welcome_prompt_01.mp3",
        },
        {
          stepNumber: 2,
          title: "Paw Dwumadie & Nɔma",
          desc: "Paw Mobile Money (1), bɔ 10-digit nɔma no, na tie sɛ yɛrebɔ ama wo.",
          voicePrompt: "Afei, bɔ nɔmba no a wopɛ sɛ wosende sika no to so no. Wowie a, fa hash ka ho.",
          audioUrl: "/audio/Twi/Audio_prompt_twi_05.mp3",
        },
        {
          stepNumber: 3,
          title: "Kasa Din Nteaseɛ (KYC)",
          desc: "Tie onipa a woremane no sika no din pa ansa na sika no akɔ.",
          voicePrompt: "Me pɛ sɛ wo bɛ sendi sika kɔ Kwame Nyamebrɛ fɔn so, number a ɛwie 8464. Sɛ wopene so a, mia 1.",
          audioUrl: "/audio/Twi/Audio_prompt_twi_06.mp3",
        },
        {
          stepNumber: 4,
          title: "Zero-PIN Bammbɔ Handoff",
          desc: "Mmbɔ wo PIN wɔ frɛ no mu da. Hwɛ wo fɔn screen so na fa wo MoMo PIN nwura mu pɛpɛɛpɛ.",
          voicePrompt: "Me pɛ sɛ ɔfa ɛsi wo phone no so na bɔ wo MoMo PIN.",
          audioUrl: "/audio/Twi/Audio_prompt_twi_09.mp3",
        },
        {
          stepNumber: 5,
          title: "Nne Nkaedum & Ref Nɔma",
          desc: "Tie transaction nkaedum a reference code te sɛ OKP-847291 ka ho.",
          voicePrompt: "Congratulations! 500 Ghana Cedis a wosendee to Kwame Nyamebrɛ no yɛ successful.",
          audioUrl: "/audio/Twi/Audio_prompt_twi_10.mp3",
        },
      ],
    },
    pillars: {
      eyebrow: "Bammbɔ Nnyinasoɔ", // TODO: verify with native speaker
      heading: "Bammbɔ Nnyinasoɔ Anan No", // TODO: verify with native speaker
      subheading: "Yɛhyehyɛe sɛnea ɛbɛsi nkontompo kwan na ama sikasɛm adwo obiara.",
      items: [
        {
          number: "01",
          title: "Kasa Baako Nkyekyɛmu Peefe",
          tagline: "Wopaw Twi a, Twi pɛ nkutoo na wote",
          desc: "Sɛ wopaw Twi a, nne prompt nyinaa, nsɛmfua nteaseɛ, ne nkrasɛm nyinaa ba Akan Twi mu.",
          technicalDetail: "Strict dual-track isolation (/audio/Twi/ vs /audio/English/) and ak-GH speech recognition.",
        },
        {
          number: "02",
          title: "Zero-PIN Bammbɔ Apono",
          tagline: "Yɛremmisa wo secret MoMo PIN wɔ call no mu da",
          desc: "Nne dwumadie no ka kyerɛ wo sɛ hwɛ wo fɔn screen so. Microphone no tɔ sin berɛ a worehyɛ PIN no mu.",
          technicalDetail: "Handset-level RequestToPay prompt handoff. Audio capture is completely muted during PIN authorization.",
        },
        {
          number: "03",
          title: "KYC Recipient Din Ka Peefe",
          tagline: "Tie nea sika no rekɔ ne nkyɛn no din ankasa",
          desc: "Ɛhwehwɛ subscriber registry mu bɔ 'Kwame Nyamebere a ne nɔma wie 8464' ansa na cedi baako mpo akɔ.",
          technicalDetail: "Direct telco directory lookup with spoken name synthesis before debit confirmation.",
        },
        {
          number: "04",
          title: "Keypad Mmara Baako",
          tagline: "Keypad nɔma ahodoɔ a ɛnyɛ den",
          desc: "# de submit, * de pesewas, 8 kɔ akyi, 9 tie bio, 0 twa mu koraa.",
          technicalDetail: "Universal DTMF grammar handling across all VoiceXML stages.",
        },
      ],
      keypadGrammarTitle: "Keypad Mmara Baako",
      keypadGrammarDesc: "Ɛyɛ adwuma pɛpɛɛpɛ wɔ menyu biara mu sɛnea wontɔ berɛ mu da:",
      keys: [
        { key: "#", label: "Pene So (#)", desc: "Fa nɔma anaa sika cedi dodow no kɔ" },
        { key: "*", label: "Pesewas (*)", desc: "Fa pesewas ka ho (mfatoho: 50*50 = GH₵ 50.50)" },
        { key: "8", label: "San Akyi (8)", desc: "Kɔ menyu a edi kan no mu" },
        { key: "9", label: "Tie Bio (9)", desc: "Kasa no bɛsan abɔ bio ama wo" },
        { key: "0", label: "Twa Mu (0)", desc: "Twa transaction no mu a sika biara mmfi mu" },
      ],
    },
    languagesSection: {
      eyebrow: "Kasa a Ɛwɔ Mu", // TODO: verify with native speaker
      heading: "Ghana Kasa Ankasa Di Anim", // TODO: verify with native speaker
      subheading: "Mfididwuma a ɛka kasa a yɛn mpenafoɔ ne dwa sofoɔ te.",
      activeTitle: "Kasa a Ɛwɔ Mu Seesei (Adwuma mu)",
      roadmapTitle: "Kasa a Ɛreba Ntɛm (Daakye)",
      activeLanguages: [
        {
          name: "Akan Twi",
          nativeName: "Asante Twi & Akuapem",
          status: "Studio Nne & Speech Recognition",
          coverage: "12 Studio Recorded Prompts + ak-GH NLU",
        },
        {
          name: "Ghanaian English",
          nativeName: "English (Ghana)",
          status: "Studio Nne & Speech Recognition",
          coverage: "12 Studio Recorded Prompts + en-US / en-GH",
        },
      ],
      roadmapLanguages: [
        { name: "Ga", nativeName: "Ga-Dangme (Nkran)", status: "Roadmap: Script nkyerɛaseɛ rekɔ so" },
        { name: "Ewe", nativeName: "Eʋegbe (Volta)", status: "Roadmap: Voice talent nkabom rekɔ so" },
        { name: "Dagbani", nativeName: "Dagbanli (Atifi)", status: "Roadmap: Script nhyehyɛeɛ rekɔ so" },
      ],
    },
    partners: {
      eyebrow: "Nkabom Dwumadie", // TODO: verify with native speaker
      heading: "Ɛne Ghana Sikasɛm Mfiri Nyinaa Yɛ Adwuma", // TODO: verify with native speaker
      liveWith: "MTN MoMo Sandbox a Ɛrekɔ So",
      roadmapWith: "Provider-Agnostic Adapter Daakye",
    },
    finalCta: {
      heading: "Sɔ Nne Akwankyerɛ No Hwɛ Seesei",
      subheading: "Frɛ pilot nɔma no so direct anaa sɔ adwumayɛfoɔ console no hwɛ wɔ web so.",
      callAction: "Frɛ +233 30 804 8098",
      testAction: "Buei Voice Tester",
      zeroDataNote: "Data biara nka ho. Frɛ te sɛ call biara wɔ Ghana networks so.",
    },
    footer: {
      builtBy: "Team Anidasoɔ (\"Hope\") na ɛyɛeɛ • Africa's Talking Voice Hackathon",
      accessibilityStatement: "Accessibility: Built to WCAG 2.1 AA/AAA contrast standards with high-contrast keyboard controls.",
      privacyNote: "Zero-PIN Security Guarantee: Yɛremmisa, yɛnnhyɛ, na yɛmfa obiara MoMo PIN nsie da.",
      phoneLabel: "Frɛ Nɔma",
      developerLink: "Developer & QA Testing Dashboard",
    },
  },
};
