import { PlanetVisual } from "@/components/planets/PlanetVisual";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { planets } from "@/data/planets";
import type { SolarHomepageState } from "@/hooks/useSolarHomepage";

type Props = Pick<SolarHomepageState, "selectedIndex" | "selectPlanet" | "motionPaused">;

export function PlanetSelector({ selectedIndex, selectPlanet, motionPaused }: Props) {
  return (
    <div
      data-hero-nav
      className="hero-selector-wrap page-container relative z-30"
    >
      <div className="destination-selector">
        <div className="destination-label">
          <span className="mono-label !text-[#8ca1bb]">CHOOSE YOUR</span>
          <span className="font-display text-[16px] font-semibold uppercase tracking-[0.12em] text-white">
            Destination<span className="text-[#8ed0ff]">.</span>
          </span>
        </div>
        <div
          className="planet-list"
          role="group"
          aria-label="Choose a planet to explore"
        >
          {planets.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectPlanet(index)}
              aria-pressed={selectedIndex === index}
              aria-label={`Explore ${item.name}`}
              className={`planet-picker ${selectedIndex === index ? "planet-picker-active" : ""}`}
            >
              <div className="picker-planet-wrap">
                <PlanetVisual planet={item} presentation="thumbnail" motionPaused={motionPaused} />
              </div>
              <span className="planet-picker-name">{item.name}</span>
              <span className="planet-picker-active-line" />
            </button>
          ))}
        </div>
        <div className="destination-controls">
          <button
            onClick={() => selectPlanet(selectedIndex - 1)}
            aria-label="Previous planet"
            className="selector-arrow"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => selectPlanet(selectedIndex + 1)}
            aria-label="Next planet"
            className="selector-arrow"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
