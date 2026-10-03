import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Pause, Play, Phone, ArrowRight, Zap, ShieldCheck } from "lucide-react";
import { HERO_SLIDES } from "../../config/slides";
import { useThemeLanguage } from "../../context/ThemeLanguageContext";

export const HeroSlider: React.FC = () => {
  const { language, t } = useThemeLanguage();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const autoplayTimerRef = useRef<any>(null);

  const slidesCount = HERO_SLIDES.length;

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % slidesCount);
  }, [slidesCount]);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + slidesCount) % slidesCount);
  }, [slidesCount]);

  // Autoplay management (6.5s interval)
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches || isPaused) {
      clearInterval(autoplayTimerRef.current);
      return;
    }

    autoplayTimerRef.current = setInterval(() => {
      nextSlide();
    }, 6500);

    return () => clearInterval(autoplayTimerRef.current);
  }, [isPaused, nextSlide]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      prevSlide();
    } else if (e.key === "ArrowRight") {
      nextSlide();
    }
  };

  // Touch swipe support
  const minSwipeDistance = 50;
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isLeftSwipe) nextSlide();
    if (isRightSwipe) prevSlide();
  };

  const currentSlide = HERO_SLIDES[currentIndex];
  const headline = language === "twi" ? currentSlide.headlineTwi : currentSlide.headlineEn;
  const subtitle = language === "twi" ? currentSlide.subtitleTwi : currentSlide.subtitleEn;
  const cta = language === "twi" ? currentSlide.ctaTwi : currentSlide.ctaEn;
  const persona = language === "twi" ? currentSlide.personaTwi : currentSlide.personaEn;
  const tag = language === "twi" ? currentSlide.tagTwi : currentSlide.tagEn;

  return (
    <section
      ref={containerRef}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label="Ɔkwankyerɛfo Pa Voice Stories Carousel"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="relative w-full overflow-hidden bg-gradient-to-b from-white via-slate-50 to-white text-slate-900 border-b border-slate-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
    >
      {/* Visual Canvas */}
      <div className="relative min-h-[560px] sm:min-h-[600px] lg:min-h-[640px] w-full flex items-center">
        {/* Slide Visuals */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-12 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left Content Column */}
            <div className="lg:col-span-7 space-y-6">
              {/* Persona Tag & Badge */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  {persona}
                </span>
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                  {tag}
                </span>
              </div>

              {/* Headline */}
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 leading-[1.08] min-h-[110px] sm:min-h-[140px] flex items-center">
                {headline}
              </h1>

              {/* Subtitle */}
              <p className="text-base sm:text-xl text-slate-600 font-normal leading-relaxed max-w-2xl min-h-[56px]">
                {subtitle}
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a
                  href="tel:+233308048098"
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm sm:text-base shadow-xs transition-colors"
                >
                  <Phone className="w-4 h-4 fill-current" />
                  <span>{cta} (+233 30 804 8098)</span>
                </a>

                <Link
                  to="/dashboard/api"
                  className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-bold text-sm sm:text-base border border-slate-200 shadow-2xs transition-colors"
                >
                  <Zap className="w-4 h-4 text-amber-600" />
                  <span>Test MoMo API Live</span>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </Link>
              </div>

              {/* Zero-PIN security pill */}
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 pt-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Zero-PIN Security Gate: Your secret PIN is entered only on your private phone screen.</span>
              </div>
            </div>

            {/* Right Visual Image Card Column */}
            <div className="lg:col-span-5 relative">
              <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden border border-slate-200 shadow-md bg-white">
                {HERO_SLIDES.map((slide, idx) => (
                  <div
                    key={slide.id}
                    className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                      idx === currentIndex ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
                    }`}
                  >
                    <img
                      src={slide.src}
                      alt={slide.alt}
                      loading={idx === 0 ? "eager" : "lazy"}
                      className="w-full h-full object-cover"
                      style={{ objectPosition: slide.focalPoint }}
                    />
                    {/* Light subtle gradient overlay to ensure contrast */}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/30 via-transparent to-transparent pointer-events-none" />
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] text-white/90 drop-shadow px-2">
                      <span className="font-bold">{slide.credit.photographer}</span>
                      <span className="text-[10px] opacity-80">{slide.credit.license}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Subtle background decoration accent */}
              <div className="absolute -top-4 -right-4 w-32 h-32 bg-emerald-100/50 rounded-full blur-2xl -z-10 pointer-events-none" />
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-amber-100/50 rounded-full blur-2xl -z-10 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Slide Navigation & Carousel Controls (White Theme) ─────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 flex items-center justify-between border-t border-slate-100 pt-4">
        {/* Dot Indicators */}
        <div className="flex items-center gap-2">
          {HERO_SLIDES.map((slide, idx) => (
            <button
              key={slide.id}
              onClick={() => setCurrentIndex(idx)}
              className={`h-2.5 rounded-full transition-all ${
                idx === currentIndex ? "w-8 bg-emerald-600" : "w-2.5 bg-slate-300 hover:bg-slate-400"
              }`}
              aria-label={`Go to slide ${idx + 1}: ${slide.headlineEn}`}
              aria-current={idx === currentIndex}
            />
          ))}
          <span className="text-xs font-mono text-slate-500 font-semibold ml-2">
            {currentIndex + 1} / {slidesCount}
          </span>
        </div>

        {/* Prev / Next & Pause Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPaused((prev) => !prev)}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 shadow-2xs transition-colors"
            title={isPaused ? "Play slider" : "Pause slider"}
            aria-label={isPaused ? "Play slider" : "Pause slider"}
          >
            {isPaused ? <Play className="w-4 h-4 fill-current text-emerald-600" /> : <Pause className="w-4 h-4" />}
          </button>
          <button
            onClick={prevSlide}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 shadow-2xs transition-colors"
            title="Previous slide"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={nextSlide}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 shadow-2xs transition-colors"
            title="Next slide"
            aria-label="Next slide"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};
