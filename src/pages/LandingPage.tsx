import React from "react";
import { Header } from "../components/landing/Header";
import { HeroSlider } from "../components/landing/HeroSlider";
import { TheProblem } from "../components/landing/TheProblem";
import { WhoItsFor } from "../components/landing/WhoItsFor";
import { HowItWorks } from "../components/landing/HowItWorks";
import { SafetyPillars } from "../components/landing/SafetyPillars";
import { LanguagesSection } from "../components/landing/LanguagesSection";
import { PartnersSection } from "../components/landing/PartnersSection";
import { FinalCta } from "../components/landing/FinalCta";
import { Footer } from "../components/landing/Footer";

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 font-sans">
      <Header />
      <main id="main-content" className="flex-1">
        <HeroSlider />
        <TheProblem />
        <WhoItsFor />
        <HowItWorks />
        <SafetyPillars />
        <LanguagesSection />
        <PartnersSection />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
};
