import Link from "next/link";
import { Compass, MoveUpRight } from "lucide-react";

export function ExperienceSection() {
  return (
    <section
      id="experience"
      className="experience-section relative overflow-hidden py-24 md:py-32"
    >
      <div className="experience-orbit" aria-hidden="true" />
      <div className="page-container relative z-10">
        <div data-reveal className="mb-10 flex items-center gap-4">
          <span className="eyebrow-line" />
          <span className="mono-label">02 / THE EXPLORER&apos;S MINDSET</span>
        </div>
        <div className="grid gap-12 lg:grid-cols-[1fr_0.75fr] lg:gap-24">
          <div data-reveal>
            <div className="mb-5 flex items-center gap-2 text-[#a8d9ff]">
              <Compass size={17} strokeWidth={1.4} />
              <span className="mono-label">MADE FOR THE CURIOUS</span>
            </div>
            <h2 className="font-display text-[clamp(42px,6vw,87px)] font-semibold uppercase leading-[0.99] tracking-[-0.065em]">
              A NEW
              <br />
              PERSPECTIVE
              <br />
              <span className="hero-accent">STARTS HERE.</span>
            </h2>
          </div>
          <div data-reveal className="flex flex-col justify-end gap-9">
            <p className="max-w-[420px] text-[16px] leading-[1.95] text-[#99abc5]">
              Space reminds us how much there is left to discover. Look closer,
              follow your curiosity, and find something extraordinary in every
              orbit.
            </p>
            <Link href="#home" className="primary-button group w-fit">
              <span>Take the first step</span>
              <span className="primary-button-icon">
                <MoveUpRight size={18} />
              </span>
            </Link>
          </div>
        </div>
        <div
          data-reveal
          className="experience-stats mt-24 grid grid-cols-2 gap-y-10 border-t border-[#637795]/25 pt-10 md:grid-cols-4 md:gap-y-0"
        >
          {[
            ["08", "PLANETS TO EXPLORE"],
            ["01", "SOLAR SYSTEM"],
            ["4.6B", "YEARS OF HISTORY"],
            ["∞", "REASONS TO WONDER"],
          ].map(([number, label]) => (
            <div key={label} className="stat-item">
              <div className="font-display text-[41px] font-semibold leading-none tracking-[-0.05em] text-white md:text-[51px]">
                {number}
              </div>
              <div className="mono-label mt-4 !text-[#8fa0b8]">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
