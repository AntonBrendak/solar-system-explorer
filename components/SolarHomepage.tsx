"use client";

import { useSolarHomepage } from "@/hooks/useSolarHomepage";
import { useAmbientMotion } from "@/hooks/useAmbientMotion";
import { SiteHeader } from "./solar/SiteHeader";
import { HeroSection } from "./solar/HeroSection";
import { FeaturedDestinations } from "./solar/FeaturedDestinations";
import { ExperienceSection } from "./solar/ExperienceSection";
import { SiteFooter } from "./solar/SiteFooter";

export default function SolarHomepage() {
  const experience = useSolarHomepage();
  const { rootRef, motionPaused, planet } = experience;
  useAmbientMotion(rootRef, motionPaused);
  return (
    <main
      ref={rootRef}
      className={`relative min-h-screen overflow-hidden bg-[#030712] text-[#f5f9ff] ${motionPaused ? "motion-paused" : ""}`}
    >
      <div
        className="selection-glow"
        style={{
          background: `radial-gradient(ellipse at 72% 35%, ${planet.accent}15 0%, transparent 49%)`,
        }}
        aria-hidden="true"
      />
      <SiteHeader
        menuOpen={experience.menuOpen}
        setMenuOpen={experience.setMenuOpen}
      />
      <HeroSection
        selectedIndex={experience.selectedIndex}
        selectPlanet={experience.selectPlanet}
        planet={experience.planet}
        planetRef={experience.planetRef}
        planetContentRef={experience.planetContentRef}
        informationRef={experience.informationRef}
        motionPaused={experience.motionPaused}
        setMotionPaused={experience.setMotionPaused}
        handlePointerMove={experience.handlePointerMove}
        handlePointerLeave={experience.handlePointerLeave}
      />
      <FeaturedDestinations selectPlanet={experience.selectPlanet} />
      <ExperienceSection />
      <SiteFooter />
    </main>
  );
}
