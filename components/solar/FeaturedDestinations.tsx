import Image from "next/image";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { featuredPlanetIds, planets } from "@/data/planets";
import type { SolarHomepageState } from "@/hooks/useSolarHomepage";

type Props = Pick<SolarHomepageState, "selectPlanet">;

export function FeaturedDestinations({ selectPlanet }: Props) {
  return (
    <section
      id="planets"
      className="destinations-section relative overflow-hidden py-24 md:py-32"
    >
      <div
        className="destination-section-glow pointer-events-none"
        aria-hidden="true"
      />
      <div className="page-container relative z-10">
        <div data-reveal className="mb-10 flex items-center gap-4">
          <span className="eyebrow-line" />
          <span className="mono-label">01 / A UNIVERSE TO DISCOVER</span>
        </div>
        <div className="mb-14 flex flex-col justify-between gap-8 lg:mb-[75px] lg:flex-row lg:items-end">
          <h2 data-reveal className="section-heading font-display">
            EIGHT WORLDS.
            <br />
            <span className="text-outline">ENDLESS WONDER.</span>
          </h2>
          <p
            data-reveal
            className="max-w-[350px] text-[15px] leading-[1.9] text-[#91a5c0]"
          >
            From sun-scorched rock to frozen blue giants, every planet has a
            story worth traveling for.
          </p>
        </div>
        <div className="feature-grid">
          {featuredPlanetIds.map((id, i) => {
            const featured = planets.find((item) => item.id === id)!;
            return (
              <button
                key={featured.id}
                data-reveal
                onClick={() => selectPlanet(planets.indexOf(featured), true)}
                className={`feature-card feature-${featured.id} group text-left`}
                aria-label={`Explore ${featured.name}`}
              >
                <div className="feature-card-grid" aria-hidden="true" />
                <div className="flex items-center justify-between">
                  <span className="mono-label">
                    {String(i + 1).padStart(2, "0")} / DESTINATION
                  </span>
                  <span className="feature-arrow">
                    <ArrowUpRight size={20} />
                  </span>
                </div>
                <div className="feature-visual">
                  {id === "saturn" && (
                    <span className="feature-saturn-ring" aria-hidden="true" />
                  )}
                  <span className="feature-spin">
                    <Image
                      src={featured.image}
                      alt=""
                      width={360}
                      height={360}
                      className="feature-planet"
                    />
                  </span>
                </div>
                <div className="relative z-10">
                  <span className="mb-3 block font-mono text-[10px] font-medium tracking-[0.2em] text-[#a0afc4]">
                    {featured.category}
                  </span>
                  <h3 className="font-display text-[37px] font-semibold uppercase tracking-[0.03em] text-white">
                    {featured.name}
                  </h3>
                  <p className="mt-2 text-[13px] leading-[1.7] text-[#a0b1c9]">
                    {featured.highlight}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        <div
          data-reveal
          className="mt-10 flex flex-col items-start justify-between gap-6 border-t border-[#778dab]/15 pt-7 sm:flex-row sm:items-center"
        >
          <p className="text-[13px] text-[#8c9db7]">
            There&apos;s more out there than meets the eye.
          </p>
          <button
            onClick={() => {
              selectPlanet(0, true);
            }}
            className="inline-flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.17em] text-[#b1ddff] transition-colors hover:text-white"
          >
            Explore all eight planets <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
