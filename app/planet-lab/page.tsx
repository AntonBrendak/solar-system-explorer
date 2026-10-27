import { PlanetVisual } from "@/components/planets/PlanetVisual";
import { planets } from "@/data/planets";

const earth = planets.find((planet) => planet.id === "earth")!;

export default function PlanetLabPage() {
  return (
    <main className="min-h-screen bg-[#030712]">
      <div className="h-[650px] w-full">
        <PlanetVisual planet={earth} presentation="lab" />
      </div>
    </main>
  );
}
