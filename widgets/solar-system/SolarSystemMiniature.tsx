
"use client";

import { useEffect, useRef } from "react";
import styles from "./solar-system-loader.module.css";

type Planet = {
  orbit: number;
  angle: number;
  speed: number;
  size: number;
  light: string;
  middle: string;
  dark: string;
  trail: string;
  saturn?: boolean;
};

const PLANETS: readonly Planet[] = [
  {
    orbit: 1.1,
    angle: 2.1,
    speed: 0.12,
    size: 10,
    light: "#fff0cf",
    middle: "#cc9962",
    dark: "#594038",
    trail: "245,190,141",
  },
  {
    orbit: 1.7,
    angle: 5.1,
    speed: 0.085,
    size: 14,
    light: "#c8f3ff",
    middle: "#378db9",
    dark: "#102c59",
    trail: "111,203,241",
  },
  {
    orbit: 2.25,
    angle: 3.7,
    speed: 0.063,
    size: 11,
    light: "#ffd0a6",
    middle: "#cf7450",
    dark: "#582b30",
    trail: "233,140,102",
  },
  {
    orbit: 2.9,
    angle: 0.55,
    speed: 0.044,
    size: 18,
    light: "#fff0cd",
    middle: "#c8a47a",
    dark: "#554444",
    trail: "230,201,153",
    saturn: true,
  },
];

type Point = {
  x: number;
  y: number;
  depth: number;
  scale: number;
};

function project(
  x: number,
  z: number,
  yaw: number,
  pitch: number,
  unit: number,
  centerX: number,
  centerY: number,
): Point {
  const rotatedX =
    x * Math.cos(yaw) + z * Math.sin(yaw);

  const rotatedZ =
    z * Math.cos(yaw) - x * Math.sin(yaw);

  const height = -rotatedZ * Math.sin(pitch);
  const depth = rotatedZ * Math.cos(pitch);

  const perspective = 1 / (1 - depth * 0.065);

  return {
    x: centerX + rotatedX * unit * perspective,
    y: centerY - height * unit * perspective,
    depth,
    scale: perspective,
  };
}

function drawSphere(
  ctx: CanvasRenderingContext2D,
  point: Point,
  radius: number,
  light: string,
  middle: string,
  dark: string,
  isSun = false,
) {
  if (isSun) {
    const glow = ctx.createRadialGradient(
      point.x, point.y, radius * 0.3,
      point.x, point.y, radius * 4.5,
    );

    glow.addColorStop(0, "rgba(255,164,83,0.29)");
    glow.addColorStop(0.4, "rgba(255,111,47,0.10)");
    glow.addColorStop(1, "rgba(255,111,47,0)");

    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * 4.5, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
  }

  const material = ctx.createRadialGradient(
    point.x - radius * 0.35,
    point.y - radius * 0.4,
    radius * 0.03,
    point.x + radius * 0.18,
    point.y + radius * 0.15,
    radius * 1.2,
  );

  material.addColorStop(0, light);
  material.addColorStop(0.45, middle);
  material.addColorStop(1, dark);

  ctx.save();

  if (isSun) {
    ctx.shadowColor = "#ff9851";
    ctx.shadowBlur = 20;
  }

  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = material;
  ctx.fill();

  ctx.restore();
}

function drawSaturnRing(
  ctx: CanvasRenderingContext2D,
  point: Point,
  radius: number,
  front: boolean,
) {
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(-0.3);

  ctx.beginPath();
  ctx.ellipse(
    0, 0,
    radius * 1.8,
    radius * 0.55,
    0,
    front ? 0 : Math.PI,
    front ? Math.PI : Math.PI * 2,
  );

  ctx.strokeStyle = front
    ? "rgba(235,215,179,0.85)"
    : "rgba(185,159,125,0.50)";

  ctx.lineWidth = radius * 0.3;
  ctx.stroke();
  ctx.restore();
}

export function SolarSystemMiniature() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    if (!canvas || !ctx) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    let frame = 0;
    let visible = false;
    let previousTime = 0;
    let elapsed = 0;
    const stage = canvas.parentElement;
    if (!stage) return;

    let cameraYaw = 0.42;
    let cameraPitch = 0.76;

    let targetYaw = cameraYaw;
    let targetPitch = cameraPitch;

    let autoRotate = true;

    let drag: {
      pointerId: number;
      x: number;
      y: number;
      yaw: number;
      pitch: number;
    } | null = null;
    const render = (now: number) => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (width <= 0 || height <= 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);

      if (
        canvas.width !== pixelWidth ||
        canvas.height !== pixelHeight
      ) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const delta = previousTime
        ? Math.min((now - previousTime) / 1000, 0.05)
        : 0;

      previousTime = now;

      if (!reducedMotion.matches) {
        elapsed += delta;
      }

      if (autoRotate && !drag && !reducedMotion.matches) {
        targetYaw += delta * 0.07;
      }

      const smoothing = Math.min(1, delta * 10);

      cameraYaw += (targetYaw - cameraYaw) * smoothing;
      cameraPitch += (targetPitch - cameraPitch) * smoothing;

      const yaw = cameraYaw;
      const pitch = cameraPitch;

      const unit = Math.min(
        width / 7.5,
        height / 5.5,
        90,
      );

      const centerX = width / 2;
      const centerY = height * 0.48;

      const position = (x: number, z: number) =>
        project(
          x, z, yaw, pitch, unit,
          centerX, centerY,
        );

      // Subtle star field behind the miniature.
      for (let i = 0; i < 100; i++) {
        const starX =
          (Math.sin(i * 127.1) * 43758.5453) % 1;

        const starY =
          (Math.sin(i * 311.7) * 22578.1459) % 1;

        const x = Math.abs(starX) * width;
        const y = Math.abs(starY) * height;

        ctx.fillStyle = "rgba(195,221,242,0.27)";
        ctx.fillRect(x, y, i % 9 === 0 ? 1.5 : 0.7, 0.7);
      }

      // Short fading trails, not full orbit circles.
      PLANETS.forEach((planet) => {
        const angle =
          planet.angle + elapsed * planet.speed;

        const steps = 36;
        const trailLength = 0.85;

        for (let i = 0; i < steps; i++) {
          const startAngle =
            angle - trailLength +
            (trailLength * i) / steps;

          const endAngle =
            angle - trailLength +
            (trailLength * (i + 1)) / steps;

          const start = position(
            Math.cos(startAngle) * planet.orbit,
            Math.sin(startAngle) * planet.orbit,
          );

          const end = position(
            Math.cos(endAngle) * planet.orbit,
            Math.sin(endAngle) * planet.orbit,
          );

          const opacity =
            0.02 + 0.35 * Math.pow((i + 1) / steps, 2);

          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);

          ctx.strokeStyle =
            `rgba(${planet.trail},${opacity})`;

          ctx.lineWidth = 1.1;
          ctx.stroke();
        }
      });

      const sun = position(0, 0);

      const objects = PLANETS.map((planet) => {
        const angle =
          planet.angle + elapsed * planet.speed;

        return {
          planet,
          point: position(
            Math.cos(angle) * planet.orbit,
            Math.sin(angle) * planet.orbit,
          ),
        };
      });

      // Draw farther objects first.
      const bodies = [
        {
          point: sun,
          planet: null as Planet | null,
        },
        ...objects,
      ].sort((a, b) => a.point.depth - b.point.depth);

      for (const body of bodies) {
        if (!body.planet) {
          drawSphere(
            ctx, sun, Math.max(28, unit * 0.52),
            "#fffce7",
            "#ffad57",
            "#7b2d21",
            true,
          );

          continue;
        }

        const { planet, point } = body;

        const radius =
          planet.size * Math.min(1.15, unit / 65) *
          point.scale;

        if (planet.saturn) {
          drawSaturnRing(ctx, point, radius, false);
        }

        drawSphere(
          ctx,
          point,
          radius,
          planet.light,
          planet.middle,
          planet.dark,
        );

        if (planet.saturn) {
          drawSaturnRing(ctx, point, radius, true);
        }
      }
    };

    const animate = (now: number) => {
      render(now);

      if (visible && !document.hidden && !reducedMotion.matches) {
        frame = requestAnimationFrame(animate);
      }
    };

    const refresh = () => {
      cancelAnimationFrame(frame);
      previousTime = 0;

      if (visible && !document.hidden) {
        frame = requestAnimationFrame(animate);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
  if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 2) {
    return;
  }

  drag = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    yaw: targetYaw,
    pitch: targetPitch,
  };

  stage.setPointerCapture(event.pointerId);
};

const onPointerMove = (event: PointerEvent) => {
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;

  if (Math.hypot(dx, dy) < 3) return;

  autoRotate = false;

  targetYaw = drag.yaw + dx * 0.009;

  targetPitch = Math.max(
    0.12,
    Math.min(1.4, drag.pitch + dy * 0.008),
  );
};

    const onPointerUp = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      if (stage.hasPointerCapture(event.pointerId)) {
        stage.releasePointerCapture(event.pointerId);
      }

      drag = null;
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerup", onPointerUp);
    stage.addEventListener("pointercancel", onPointerUp);
    stage.addEventListener("contextmenu", onContextMenu);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      refresh();
    });

    const resizeObserver = new ResizeObserver(refresh);

    observer.observe(canvas);
    resizeObserver.observe(canvas);

    document.addEventListener("visibilitychange", refresh);
    reducedMotion.addEventListener("change", refresh);

    return () => {
      cancelAnimationFrame(frame);

      observer.disconnect();
      resizeObserver.disconnect();

      document.removeEventListener("visibilitychange", refresh);
      reducedMotion.removeEventListener("change", refresh);
      cancelAnimationFrame(frame);

      observer.disconnect();
      resizeObserver.disconnect();

      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerup", onPointerUp);
      stage.removeEventListener("pointercancel", onPointerUp);
      stage.removeEventListener("contextmenu", onContextMenu);

      document.removeEventListener("visibilitychange", refresh);
      reducedMotion.removeEventListener("change", refresh);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      aria-hidden="true"
    />
  );
}
