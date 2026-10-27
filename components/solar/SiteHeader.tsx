import Link from "next/link";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import type { SolarHomepageState } from "@/hooks/useSolarHomepage";

type Props = Pick<SolarHomepageState, "menuOpen" | "setMenuOpen">;

export function SiteHeader({ menuOpen, setMenuOpen }: Props) {
  return (
    <>
      <header data-nav className="site-header absolute inset-x-0 top-0 z-50">
        <div className="page-container flex h-[98px] items-center justify-between gap-6">
          <Logo />
          <nav
            className="hidden items-center gap-11 lg:flex"
            aria-label="Primary navigation"
          >
            <Link href="#home" className="nav-link nav-link-active">
              Home
            </Link>
            <Link href="#planets" className="nav-link">
              Planets
            </Link>
            <Link href="#experience" className="nav-link">
              The experience
            </Link>
          </nav>
          <div className="hidden items-center gap-4 sm:flex">
            <span className="hidden items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9faec9] xl:inline-flex">
              <span className="h-[6px] w-[6px] rounded-full bg-[#85d4ff] shadow-[0_0_14px_#85d4ff]" />
              Live exploration
            </span>
            <Link href="#planets" className="header-launch group">
              Start journey{" "}
              <ArrowUpRight
                size={15}
                className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </Link>
          </div>
          <button
            className="mobile-menu-toggle lg:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={23} /> : <Menu size={23} />}
          </button>
        </div>
      </header>
      {menuOpen && (
        <nav
          aria-label="Mobile navigation"
          className="mobile-nav fixed inset-0 z-40 flex flex-col justify-center gap-8 px-8 lg:hidden"
        >
          {[
            ["Home", "#home"],
            ["Planets", "#planets"],
            ["The experience", "#experience"],
          ].map(([label, href]) => (
            <Link
              key={href}
              onClick={() => setMenuOpen(false)}
              href={href}
              className="font-display text-4xl font-semibold text-white"
            >
              {label}
            </Link>
          ))}
          <span className="mono-label mt-6">THE UNIVERSE IS WAITING.</span>
        </nav>
      )}
    </>
  );
}
