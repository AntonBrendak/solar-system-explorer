import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="footer-section relative z-10">
      <div className="page-container flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between">
        <Logo />
        <p className="text-[12px] text-[#71819b]">
          An invitation to look a little further. © {new Date().getFullYear()}{" "}
          Orbital.
        </p>
        <Link
          href="#home"
          className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[#a8bfdc] hover:text-white"
        >
          Back to top <ArrowDown size={13} className="rotate-180" />
        </Link>
      </div>
    </footer>
  );
}
