import Link from "next/link";

export function Logo() {
  return (
    <Link
      href="#home"
      className="logo-lockup group"
      aria-label="Orbital, back to top"
    >
      <span className="logo-symbol" aria-hidden="true">
        <span className="logo-orbit logo-orbit-one" />
        <span className="logo-orbit logo-orbit-two" />
        <span className="logo-symbol-core" />
        <span className="logo-satellite-track">
          <span className="logo-satellite" />
        </span>
      </span>
      <span className="font-display text-[20px] font-bold tracking-[0.20em] text-white">
        ORBITAL<span className="text-[#9fd4ff]">.</span>
      </span>
    </Link>
  );
}
