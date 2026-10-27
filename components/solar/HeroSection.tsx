import Link from "next/link";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import { Starfield } from "./Starfield";
import { PlanetSelector } from "./PlanetSelector";
import type { SolarHomepageState } from "@/hooks/useSolarHomepage";
import { PlanetVisual } from "@/components/planets/PlanetVisual";

type Props = Pick<
  SolarHomepageState,
  | "selectedIndex"
  | "selectPlanet"
  | "planet"
  | "planetRef"
  | "planetContentRef"
  | "informationRef"
  | "motionPaused"
  | "setMotionPaused"
  | "handlePointerMove"
  | "handlePointerLeave"
>;

export function HeroSection({
  selectedIndex,
  selectPlanet,
  planet,
  planetRef,
  planetContentRef,
  informationRef,
  motionPaused,
  setMotionPaused,
}: Props) {
  return (
    <section id="home" className="hero-section relative isolate pt-[98px]">
      <Starfield />
      <div
        className="hero-orbit-trace pointer-events-none"
        aria-hidden="true"
      />
      <div className="page-container hero-main relative z-10">
        <div className="hero-content relative z-20 pointer-events-none">
          <div data-hero-eyebrow className="mb-8 flex items-center gap-3.5">
            <span className="eyebrow-line" />
            <span className="mono-label">BEYOND THE ORDINARY / VOL. 001</span>
          </div>
          <h1
            className="hero-heading font-display font-semibold uppercase"
            aria-label="Explore beyond the known"
          >
            <span className="block overflow-hidden">
              <span data-hero-line className="inline-block">
                EXPLORE
              </span>
            </span>
            <span className="block overflow-hidden">
              <span data-hero-line className="inline-block">
                BEYOND
              </span>
            </span>
            <span className="block overflow-hidden">
              <span data-hero-line className="hero-accent inline-block">
                THE KNOWN<span className="hero-period">.</span>
              </span>
            </span>
          </h1>
          <div data-hero-summary className="mt-8 flex max-w-[500px] gap-5">
            <span className="mt-[6px] hidden h-[44px] w-px shrink-0 bg-[#90c9ff]/60 sm:block" />
            <p className="max-w-[425px] text-[15px] leading-[1.9] text-[#a9b8d0] md:text-[16px]">
              Eight extraordinary worlds. One infinite adventure. Discover the
              wonders of our Solar System, one planet at a time.
            </p>
          </div>
          <div
            data-hero-actions
            className="mt-9 flex flex-wrap items-center gap-5 pointer-events-auto"
          >
            <Link href="#planets" className="primary-button group">
              <span>Begin exploration</span>
              <span className="primary-button-icon">
                <ArrowUpRight
                  size={18}
                  className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </span>
            </Link>
            <Link href="#experience" className="text-button group">
              <span className="play-icon">
                <Play size={11} fill="currentColor" />
              </span>
              <span>Discover the mission</span>
            </Link>
          </div>
        </div>

        <div
          data-planet-stage
          className="planet-stage"
        >
          <div className="orbit-circle orbit-circle-one" aria-hidden="true">
            <span className="orbit-traveler orbit-traveler-one" />
          </div>
          <div className="orbit-circle orbit-circle-two" aria-hidden="true">
            <span className="orbit-traveler orbit-traveler-two" />
          </div>
          <div className="orbit-circle orbit-circle-three" aria-hidden="true">
            <span className="orbit-traveler orbit-traveler-three" />
          </div>
          <div
            className="planet-halo"
            style={{ boxShadow: `0 0 150px 35px ${planet.accent}1b` }}
            aria-hidden="true"
          />
          <div ref={planetRef} className="planet-float">
            <div
              ref={planetContentRef}
              className={`planet-visual planet-${planet.id}`}
            >
              <PlanetVisual
                planet={planet}
                presentation="hero"
                motionPaused={motionPaused}
                priority={selectedIndex === 2}
              />
            </div>
          </div>
          <span className="orbit-node orbit-node-one" aria-hidden="true" />
          <span className="orbit-node orbit-node-two" aria-hidden="true" />
          <div className="planet-caption absolute bottom-[15%] left-[4%] z-10 hidden items-center gap-4 xl:flex">
            <span className="relative h-[1px] w-12 bg-[#91bce7]/50" />
            <span className="mono-label text-[#b8c7dc]">
              FIG. {planet.number} — {planet.name.toUpperCase()}
            </span>
          </div>
        </div>

        <div
          data-side-info
          ref={informationRef}
          className="hero-planet-info relative z-30"
        >
          <div className="flex items-center gap-3">
            <span className="info-index">{planet.number}</span>
            <span className="h-px w-[43px] bg-[#8eafce]/40" />
            <span className="mono-label">/ 08</span>
          </div>
          <p className="mt-3 font-display text-[28px] font-semibold uppercase tracking-[0.1em] md:text-[34px]">
            {planet.name}
          </p>
          <p className="mt-[2px] text-[12px] tracking-[0.035em] text-[#94a4bd]">
            {planet.tagline}
          </p>
          <div className="mt-5 flex items-center gap-5 text-[11px] text-[#c4d2e4]">
            <div>
              <span className="block font-mono text-[9px] uppercase tracking-[0.17em] text-[#8193ae]">
                From the sun
              </span>
              <span className="mt-1 block font-medium">{planet.distance}</span>
            </div>
            <span className="h-[23px] w-px bg-[#6e819d]/30" />
            <div>
              <span className="block font-mono text-[9px] uppercase tracking-[0.17em] text-[#8193ae]">
                One orbit
              </span>
              <span className="mt-1 block font-medium">{planet.orbit}</span>
            </div>
          </div>
        </div>

        <div className="hero-edge-label hidden 2xl:flex" aria-hidden="true">
          <span>THE CELESTIAL ARCHIVE</span>
          <span className="h-12 w-px bg-[#6f88a8]/50" />
          <span>001 — 008</span>
        </div>
      </div>

      <PlanetSelector
        selectedIndex={selectedIndex}
        selectPlanet={selectPlanet}
        motionPaused={motionPaused}
      />
      <div className="page-container relative z-20 mt-6 flex items-center justify-between pb-8 text-[#75849f]">
        <div className="flex items-center gap-3">
          <span className="h-[5px] w-[5px] rounded-full bg-[#8dc4ed]" />
          <span className="mono-label">YOUR JOURNEY STARTS HERE</span>
        </div>
        <button
          className="motion-control"
          onClick={() => setMotionPaused(!motionPaused)}
          aria-label={
            motionPaused
              ? "Resume decorative animations"
              : "Pause decorative animations"
          }
          aria-pressed={motionPaused}
        >
          {motionPaused ? (
            <Play size={11} fill="currentColor" />
          ) : (
            <Pause size={11} fill="currentColor" />
          )}{" "}
          {motionPaused ? "RESUME MOTION" : "PAUSE MOTION"}
        </button>
      </div>
    </section>
  );
}
