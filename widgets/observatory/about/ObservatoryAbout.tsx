import ui from "@/shared/ui/presentation.module.css";
import { ArrowUpRight, Globe2, Orbit, Telescope } from "lucide-react";
import { useTranslations } from "next-intl";
import { MotionReveal } from "@/shared/ui/MotionReveal";
import { ObservatoryLogo } from "../header/ObservatoryHeader";
import styles from "./about.module.css";

export function ObservatoryAbout() {
  const t = useTranslations("ui");
  return (
    <>
      <section
        data-page-shell
        id="about"
        className={styles.about}
        aria-labelledby="about-title"
      >
        <p className={ui.eyebrow}>
          <span className={ui.line} />
          {t("aboutEyebrow")}
        </p>
        <div className={styles.aboutGrid}>
          <h2 id="about-title">
            {t("aboutTitle")}
            <br />
            <span>{t("aboutTitleSecond")}</span>
          </h2>
          <div>
            <p className={styles.aboutDescription}>{t("aboutDescription")}</p>
            <a
              href="https://github.com/AntonBrendak/solar-system-explorer"
              target="_blank"
              rel="noreferrer"
              className={ui.textButton}
              data-motion-button="text"
            >
              {t("aboutLink")}
              <ArrowUpRight size={16} />
            </a>
          </div>
        </div>
        <div className={styles.aboutFeatures}>
          {[
            {
              Icon: Telescope,
              title: t("aboutFact"),
              text: t("aboutFactText"),
            },
            { Icon: Orbit, title: t("aboutModel"), text: t("aboutModelText") },
            {
              Icon: Globe2,
              title: t("aboutAccess"),
              text: t("aboutAccessText"),
            },
          ].map(({ Icon, title, text }) => (
            <MotionReveal key={title}>
              <Icon size={22} />
              <h3>{title}</h3>
              <p>{text}</p>
            </MotionReveal>
          ))}
        </div>
      </section>
      <footer data-page-shell className={styles.footer}>
        <ObservatoryLogo compact />
        <span>
          {t("footer")} · © {new Date().getFullYear()}
        </span>
        <a href="#home">
          {t("top")}
          <ArrowUpRight size={15} />
        </a>
      </footer>
    </>
  );
}
