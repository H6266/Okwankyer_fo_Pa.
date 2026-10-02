export interface SlideConfig {
  id: string;
  src: string;
  fallbackSrc: string;
  alt: string;
  focalPoint: string; // e.g. 'center center' or '50% 40%'
  credit: {
    photographer: string;
    source: string;
    license: string;
    licenseUrl?: string;
  };
  headlineEn: string;
  subtitleEn: string;
  ctaEn: string;
  ctaLink: string;
  personaEn: string;
  tagEn: string;

  headlineTwi: string;
  subtitleTwi: string;
  ctaTwi: string;
  personaTwi: string;
  tagTwi: string;
}

export const HERO_SLIDES: SlideConfig[] = [
  {
    id: "slide_market",
    src: "/images/slides/slide_market_trader.svg",
    fallbackSrc: "/images/slides/slide_market_trader.svg",
    alt: "Confident Ghanaian market woman trader smiling while handling mobile transactions on her phone at an open-air market stall",
    focalPoint: "center 40%",
    credit: {
      photographer: "Team Anidasoɔ Field Archive",
      source: "Ghana Mobile Money Field Research",
      license: "Project Original / CC-BY-4.0",
    },
    headlineEn: "Send money in your own voice. No screens. No stress.",
    subtitleEn: "Market traders conduct fast, safe mobile money transactions by voice without wrestling with complex visual USSD menus.",
    ctaEn: "Call +233 30 804 8098",
    ctaLink: "tel:+233308048098",
    personaEn: "Market Trader • Kejetia Market, Kumasi",
    tagEn: "Inclusive Voice Commerce",

    headlineTwi: "Fa wo ankasa nne mane sika. Screen biara nni ho. Dadwen biara nni ho.", // TODO: verify with native speaker
    subtitleTwi: "Dwa so aguadifoɔ betumi amane sika ntɛmntɛm a wonnhia sɛ wɔkenkan asɛm biara wɔ fɔn so.",
    ctaTwi: "Frɛ +233 30 804 8098",
    personaTwi: "Dwa so Baa • Kejetia Dwaso, Kumasi",
    tagTwi: "Nne Akwankyerɛ Aguadie",
  },
  {
    id: "slide_rural",
    src: "/images/slides/slide_rural_farmer.svg",
    fallbackSrc: "/images/slides/slide_rural_farmer.svg",
    alt: "Ghanaian cocoa farmer resting under shade with a basic button feature phone, making an ordinary voice call to transfer funds",
    focalPoint: "center center",
    credit: {
      photographer: "Team Anidasoɔ Rural Research",
      source: "Western North Agricultural Financial Services",
      license: "Project Original / CC-BY-4.0",
    },
    headlineEn: "No smartphone. No data. Just an ordinary phone call.",
    subtitleEn: "Works seamlessly on basic button phones across Ghana on standard 2G voice channels with zero internet data required.",
    ctaEn: "See How It Works",
    ctaLink: "#how-it-works",
    personaEn: "Farmer • Sefwi Wiawso, Western North",
    tagEn: "100% Feature Phone Native",

    headlineTwi: "Smart fɔn nni ho. Data nni ho. Frɛ nkutoo na ɛwɔ ho.", // TODO: verify with native speaker
    subtitleTwi: "Ɛyɛ adwuma pɛpɛɛpɛ wɔ yamfɔn biara so wɔ Ghana fɔn nkitahodi nyinaa so a data biara nka ho.",
    ctaTwi: "Hwɛ Sɛnea Ɛyɛ Adwuma",
    personaTwi: "Kuafoɔ • Sefwi Wiawso",
    tagTwi: "Yamfɔn So Dwumadie",
  },
  {
    id: "slide_accessible",
    src: "/images/slides/slide_visually_impaired.svg",
    fallbackSrc: "/images/slides/slide_visually_impaired.svg",
    alt: "Visually impaired Ghanaian university student confidently listening to clear spoken recipient KYC name readback through headphones",
    focalPoint: "center 45%",
    credit: {
      photographer: "Team Anidasoɔ Accessibility Lab",
      source: "University of Cape Coast Inclusion Study",
      license: "Project Original / CC-BY-4.0",
    },
    headlineEn: "Mobile Money you can hear, not just see.",
    subtitleEn: "Audible KYC readback of recipient names and amounts before any transfer is authorized, restoring financial autonomy.",
    ctaEn: "Test Live Voice Flow",
    ctaLink: "/dashboard/voice",
    personaEn: "Student • University of Cape Coast",
    tagEn: "Restoring Financial Dignity",

    headlineTwi: "Mobile Money a wote nka, ɛnyɛ sɛ wode w'ani behwɛ nkutoo.", // TODO: verify with native speaker
    subtitleTwi: "Wobɛte nea woremane no din ne sika dodow no nne mu pefee ansa na sika no afiri mu.",
    ctaTwi: "Sɔ Nne No Hwɛ",
    personaTwi: "Sukuuni • Oguaa Sukuupɔn",
    tagTwi: "Ahofadi ma Anifurafoɔ",
  },
  {
    id: "slide_elderly",
    src: "/images/slides/slide_elderly_pensioner.svg",
    fallbackSrc: "/images/slides/slide_elderly_pensioner.svg",
    alt: "Elderly Ghanaian grandfather smiling with his feature phone, calm and confident without USSD countdown timers rushing him",
    focalPoint: "center 35%",
    credit: {
      photographer: "Team Anidasoɔ Senior Inclusion",
      source: "Ghana Pensioner Digital Access Study",
      license: "Project Original / CC-BY-4.0",
    },
    headlineEn: "Take your time. We'll wait, and we'll repeat.",
    subtitleEn: "No aggressive 15-second USSD session timeouts. Generous 40-second input windows and instant prompt replay on key 9.",
    ctaEn: "Try the Simulator",
    ctaLink: "/dashboard/voice",
    personaEn: "Retired Teacher • Sunyani, Bono Region",
    tagEn: "Paced for Humans",

    headlineTwi: "Nya aboterɛ. Yɛbɛtwɛn wo, na yɛaka akyerɛ wo bio.", // TODO: verify with native speaker
    subtitleTwi: "USSD bere tiawa nni ha. Nya sekend 40 nwura sika dodow no mu, na mia 9 sɛ worepɛ ate bio.",
    ctaTwi: "Bɔ Mfiri No Hwɛ",
    personaTwi: "Kyerɛkyerɛni Panyin • Sunyani",
    tagTwi: "Aboterɛ ne Nteaseɛ",
  },
  {
    id: "slide_security",
    src: "/images/slides/slide_security_zero_pin.svg",
    fallbackSrc: "/images/slides/slide_security_zero_pin.svg",
    alt: "Handset screen showing private telco prompt for MoMo PIN entry, while telephone voice call remains completely muted for zero-PIN security",
    focalPoint: "center center",
    credit: {
      photographer: "Team Anidasoɔ Security Lab",
      source: "Zero-PIN Security Architecture Whitepaper",
      license: "Project Original / CC-BY-4.0",
    },
    headlineEn: "Your PIN never leaves your phone.",
    subtitleEn: "Zero-PIN voice architecture. Payments hand off safely to your private network prompt without voice eavesdropping.",
    ctaEn: "Inspect Safety Architecture",
    ctaLink: "#safety",
    personaEn: "Security Protocol • Telco RequestToPay",
    tagEn: "Zero-PIN Voice Gate",

    headlineTwi: "Wo PIN mfiri wo fɔn so da.", // TODO: verify with native speaker
    subtitleTwi: "Yɛremmisa wo PIN wɔ nne frɛ no mu da. Wode wo PIN bɛnwura wo fɔn screen so a obiara nte.",
    ctaTwi: "Hwɛ Bammbɔ Nhyehyeɛ No",
    personaTwi: "Bammbɔ Nhyehyeɛ • Telco RequestToPay",
    tagTwi: "Zero-PIN Bammbɔ Apono",
  },
];
