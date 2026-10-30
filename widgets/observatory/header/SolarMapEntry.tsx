
"use client";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import styles from "./solar-map-entry.module.css";

// Decorative periods, not real astronomical data.
const ORBITS = [
  { id: "mercury", initialAngle: 35, duration: 6 },
  { id: "earth", initialAngle: 145, duration: 10 },
  { id: "mars", initialAngle: 240, duration: 17 },
] as const;

const DEPTH_LAYERS = Array.from(
  { length: 11 },
  (_, index) => index * 4,
);

const DEFAULT_X = -8;
const DEFAULT_Y = -10;
const HOVER_SPEED = 1.9;

function ExtrudedWord({
  text,
  second = false,
}: {
  text: string;
  second?: boolean;
}) {
  return (
    <span
      className={`${styles.word} ${second ? styles.secondWord : ""}`}
      aria-hidden="true"
    >
      <span className={styles.wordBack}>{text}</span>

      {DEPTH_LAYERS.map((depth) => {
        const light = depth / 44;
        const red = Math.round(33 + light * 65);
        const green = Math.round(56 + light * 102);
        const blue = Math.round(80 + light * 111);

        return (
          <span
            key={depth}
            className={styles.depthSlice}
            style={{
              transform: `translateZ(${depth}px)`,
              color: `rgb(${red}, ${green}, ${blue})`,
            }}
          >
            {text}
          </span>
        );
      })}

      <span className={styles.wordFace}>{text}</span>
    </span>
  );
}

// Preview only. Navigation will be enabled when the route exists.
export function SolarMapEntry({ paused }: { paused: boolean }) {
  const t = useTranslations("ui");
  const locale = useLocale();

  const buttonRef = useRef<HTMLButtonElement>(null);
  const pausedRef = useRef(paused);
  const syncMotionRef = useRef<(() => void) | null>(null);

  // Keep current pause state without recreating GSAP listeners.
  useEffect(() => {
    pausedRef.current = paused;
    syncMotionRef.current?.();
  }, [paused]);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    void import("gsap")
      .then(({ default: gsap }) => {
        // Guard against unmounting during the dynamic import.
        if (disposed) return;

        const world = button.querySelector<HTMLElement>(
          "[data-map-world]",
        );

        const flash = button.querySelector<HTMLElement>(
          "[data-map-flash]",
        );

        const runners = Array.from(
          button.querySelectorAll<HTMLElement>(
            "[data-map-runner]",
          ),
        );

        const carriers = Array.from(
          button.querySelectorAll<HTMLElement>(
            "[data-map-carrier]",
          ),
        );

        if (
          !world ||
          !flash ||
          runners.length !== ORBITS.length ||
          carriers.length !== ORBITS.length
        ) {
          return;
        }

        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        );

        const pose = {
          x: DEFAULT_X,
          y: DEFAULT_Y,
        };

        let inViewport = false;
        let hovered = button.matches(":hover");
        let focused = button.matches(":focus-visible");

        // Update the box and inverse planet orientation together.
        const renderPose = () => {
          world.style.transform =
            `rotateX(${pose.x}deg) rotateY(${pose.y}deg)`;

          world.style.setProperty(
            "--inverse-x",
            `${-pose.x}deg`,
          );

          world.style.setProperty(
            "--inverse-y",
            `${-pose.y}deg`,
          );
        };

        renderPose();

        // quickTo reuses its animation instead of creating a
        // new tween for every pointer movement.
        const xTo = gsap.quickTo(pose, "x", {
          duration: 0.5,
          ease: "power3.out",
          onUpdate: renderPose,
        });

        const yTo = gsap.quickTo(pose, "y", {
          duration: 0.5,
          ease: "power3.out",
          onUpdate: renderPose,
        });

        // Each orbit has synchronized forward and reverse rotations.
        const orbitTimelines = ORBITS.map((orbit, index) => {
          const runner = runners[index];
          const carrier = carriers[index];

          gsap.set(runner, {
            rotation: orbit.initialAngle,
          });

          gsap.set(carrier, {
            rotation: -orbit.initialAngle,
          });

          return gsap
            .timeline({
              repeat: -1,
              paused: true,
            })
            .to(
              runner,
              {
                rotation: orbit.initialAngle + 360,
                duration: orbit.duration,
                ease: "none",
              },
              0,
            )
            .to(
              carrier,
              {
                rotation: -orbit.initialAngle - 360,
                duration: orbit.duration,
                ease: "none",
              },
              0,
            );
        });

        const shouldStop = () =>
          pausedRef.current ||
          reducedMotion.matches ||
          document.hidden ||
          !inViewport;

        // Shared control for pause, viewport visibility and hover speed.
        const syncMotion = () => {
          const stop = shouldStop();

          // Cancel speed changes without destroying orbital progress.
          gsap.killTweensOf(orbitTimelines);

          if (stop) {
            orbitTimelines.forEach((timeline) => {
              timeline.paused(true);
              timeline.timeScale(1);
            });
            return;
          }

          orbitTimelines.forEach((timeline) => {
            timeline.paused(false);
          });

          gsap.to(orbitTimelines, {
            timeScale:
              hovered || focused ? HOVER_SPEED : 1,
            duration: 0.65,
            ease: "power2.out",
            overwrite: true,
          });
        };

        syncMotionRef.current = syncMotion;

        // Stop continuous motion when the button is outside the viewport.
        const observer = new IntersectionObserver(
          ([entry]) => {
            inViewport = entry?.isIntersecting ?? false;
            syncMotion();
          },
          { threshold: 0.01 },
        );

        observer.observe(button);

        document.addEventListener(
          "visibilitychange",
          syncMotion,
        );

        reducedMotion.addEventListener(
          "change",
          syncMotion,
        );

        syncMotion();

        const onEnter = () => {
          hovered = true;
          syncMotion();
        };

        const resetPose = () => {
          if (
            pausedRef.current ||
            reducedMotion.matches
          ) {
            return;
          }

          xTo(DEFAULT_X);
          yTo(DEFAULT_Y);
        };

        const onLeave = () => {
          hovered = false;

          if (!focused) {
            resetPose();
          }

          syncMotion();
        };

        const onFocus = () => {
          // Mouse focus should not behave like keyboard focus.
          focused = button.matches(":focus-visible");
          syncMotion();
        };

        const onBlur = () => {
          focused = false;

          if (!hovered) {
            resetPose();
          }

          syncMotion();
        };

        const onMove = (event: PointerEvent) => {
          if (
            shouldStop() ||
            event.pointerType === "touch"
          ) {
            return;
          }

          const bounds = button.getBoundingClientRect();

          if (!bounds.width || !bounds.height) {
            return;
          }

          const nx = Math.max(
            -1,
            Math.min(
              1,
              (
                (event.clientX - bounds.left) /
                bounds.width - 0.5
              ) * 2,
            ),
          );

          const ny = Math.max(
            -1,
            Math.min(
              1,
              (
                (event.clientY - bounds.top) /
                bounds.height - 0.5
              ) * 2,
            ),
          );

          xTo(DEFAULT_X - ny * 8);
          yTo(DEFAULT_Y + nx * 15);
        };

        // Click feedback while the destination route is not ready.
        const onClick = () => {
          if (shouldStop()) return;

          gsap.fromTo(
            flash,
            {
              opacity: 0.55,
              scale: 0.7,
            },
            {
              opacity: 0,
              scale: 1.4,
              duration: 0.62,
              ease: "power2.out",
              overwrite: true,
            },
          );
        };

        button.addEventListener(
          "pointerenter",
          onEnter,
        );

        button.addEventListener(
          "pointermove",
          onMove,
        );

        button.addEventListener(
          "pointerleave",
          onLeave,
        );

        button.addEventListener("focus", onFocus);
        button.addEventListener("blur", onBlur);
        button.addEventListener("click", onClick);

        // Complete cleanup for React Strict Mode and unmounts.
        cleanup = () => {
          observer.disconnect();

          document.removeEventListener(
            "visibilitychange",
            syncMotion,
          );

          reducedMotion.removeEventListener(
            "change",
            syncMotion,
          );

          button.removeEventListener(
            "pointerenter",
            onEnter,
          );

          button.removeEventListener(
            "pointermove",
            onMove,
          );

          button.removeEventListener(
            "pointerleave",
            onLeave,
          );

          button.removeEventListener("focus", onFocus);
          button.removeEventListener("blur", onBlur);
          button.removeEventListener("click", onClick);

          gsap.killTweensOf(orbitTimelines);

          orbitTimelines.forEach((timeline) => {
            timeline.kill();
          });

          gsap.killTweensOf([pose, flash]);
          syncMotionRef.current = null;
        };
      })
      .catch((error: unknown) => {
        if (!disposed) {
          console.error(
            "Failed to initialize SolarMapEntry animation",
            error,
          );
        }
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <button
      ref={buttonRef}
      className={styles.entry}
      type="button"
      data-paused={paused}
      data-locale={locale}
      title={t("mapEntryPreviewTitle")}
      aria-label={t("mapEntryPreviewLabel")}
    >
      <span className={styles.scale} aria-hidden="true">
        <span className={styles.world} data-map-world>
          {/* 8 front/back edges */}
          <span className={`${styles.frame} ${styles.front}`} />
          <span className={`${styles.frame} ${styles.back}`} />

          {/* 4 depth edges */}
          <span className={styles.strut} />
          <span
            className={`${styles.strut} ${styles.topRight}`}
          />
          <span
            className={`${styles.strut} ${styles.bottomLeft}`}
          />
          <span
            className={`${styles.strut} ${styles.bottomRight}`}
          />

          {/* Localized, extruded text */}
          <span className={styles.textBlock}>
            <ExtrudedWord text={t("mapEntryOpen")} />

            <ExtrudedWord
              text={t("mapEntry3dMap")}
              second
            />

            <span className={styles.subtitle}>
              {t("mapEntrySubtitle")}
            </span>
          </span>

          {/* Miniature Solar System */}
          <span className={styles.system}>
            <span className={styles.sunFacing}>
              <span className={styles.sunHalo} />
              <span className={styles.sun} />
            </span>

            {ORBITS.map((orbit) => (
              <span
                key={orbit.id}
                className={`${styles.orbit} ${styles[orbit.id]}`}
              >
                <span
                  className={styles.runner}
                  data-map-runner
                >
                  <span
                    className={styles.carrier}
                    data-map-carrier
                  >
                    <span className={styles.billboard}>
                      <span
                        className={
                          `${styles.sphere} ` +
                          styles[`${orbit.id}Sphere`]
                        }
                      />
                    </span>
                  </span>
                </span>
              </span>
            ))}
          </span>

          <span
            className={styles.flash}
            data-map-flash
          />
        </span>
      </span>
    </button>
  );
}
