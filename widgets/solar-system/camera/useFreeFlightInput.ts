"use client";

import { useEffect, type RefObject } from "react";
import { Euler, MathUtils, Spherical, Vector3, type Camera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { CameraRuntime } from "../model/types";
import type { CameraStore } from "./camera-store";

const MOVE_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

type Props = {
  camera: Camera;
  canvas: HTMLCanvasElement;
  runtime: RefObject<CameraRuntime>;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  enabled: boolean;
  canvasLabel: string;
  store: CameraStore;
  remember: () => void;
  stopFlight: () => void;
};

/** Drag tracking uses window events; it never requests native pointer capture or pointer lock. */
export function useFreeFlightInput({
  camera,
  canvas,
  runtime,
  controlsRef,
  enabled,
  canvasLabel,
  store,
  remember,
  stopFlight,
}: Props) {
  useEffect(() => {
    const previousTab = canvas.getAttribute("tabindex"),
      previousLabel = canvas.getAttribute("aria-label");
    canvas.setAttribute("tabindex", "0");
    canvas.setAttribute("aria-label", canvasLabel);
    let drag: { id: number; x: number; y: number } | null = null;
    const look = new Euler(0, 0, 0, "YXZ");
    const forward = new Vector3();
    const heldKeys = new Set<string>();
    store.bindCanvasFocus(() => {
      if (enabled) canvas.focus({ preventScroll: true });
    });
    const clearInput = () => {
      drag = null;
      const state = runtime.current;
      state.keys.clear();
      heldKeys.clear();
      state.velocity.set(0, 0, 0);
      state.moving = false;
    };
    const isFree = () => enabled && store.getSnapshot().mode === "free";
    const ownsKeys = () => document.activeElement === canvas;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ownsKeys()) {
        clearInput();
        return;
      }
      if (
        !enabled ||
        !ownsKeys() ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (store.getSnapshot().mode === "orbit") {
        const keys = [
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Equal",
          "Minus",
          "NumpadAdd",
          "NumpadSubtract",
        ];
        const controls = controlsRef.current;
        if (!controls || !keys.includes(event.code)) return;
        if (!event.repeat) remember();
        stopFlight();
        const spherical = new Spherical().setFromVector3(
          camera.position.clone().sub(controls.target),
        );
        if (event.code === "ArrowLeft") spherical.theta += 0.06;
        if (event.code === "ArrowRight") spherical.theta -= 0.06;
        if (event.code === "ArrowUp") spherical.phi -= 0.06;
        if (event.code === "ArrowDown") spherical.phi += 0.06;
        if (event.code === "Equal" || event.code === "NumpadAdd")
          spherical.radius *= 0.9;
        if (event.code === "Minus" || event.code === "NumpadSubtract")
          spherical.radius /= 0.9;
        spherical.phi = MathUtils.clamp(spherical.phi, 0.01, Math.PI - 0.01);
        spherical.radius = MathUtils.clamp(
          spherical.radius,
          controls.minDistance,
          controls.maxDistance,
        );
        camera.position.setFromSpherical(spherical).add(controls.target);
        camera.lookAt(controls.target);
        event.preventDefault();
        return;
      }
      if (!MOVE_KEYS.has(event.code)) return;
      if (runtime.current.flight) stopFlight();
      runtime.current.keys.add(event.code);
      heldKeys.add(event.code);
      event.preventDefault();
    };
    const keyup = (event: KeyboardEvent) => {
      runtime.current.keys.delete(event.code);
      heldKeys.delete(event.code);
    };
    const focusCanvas = () => {
      if (isFree()) heldKeys.forEach((key) => runtime.current.keys.add(key));
    };
    const down = (event: PointerEvent) => {
      if (!enabled) return;
      canvas.focus({ preventScroll: true });
      if (runtime.current.flight) stopFlight();
      if (
        !isFree() ||
        event.button !== (event.pointerType === "mouse" ? 2 : 0) ||
        drag
      )
        return;
      remember();
      look.setFromQuaternion(camera.quaternion, "YXZ");
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      event.preventDefault();
    };
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      if (
        !isFree() ||
        (event.pointerType === "mouse" && (event.buttons & 2) === 0)
      ) {
        drag = null;
        return;
      }
      const dx = event.clientX - drag.x,
        dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      look.y -= dx * 0.0025;
      look.x = MathUtils.clamp(
        look.x - dy * 0.0025,
        -Math.PI / 2 + 0.01,
        Math.PI / 2 - 0.01,
      );
      camera.quaternion.setFromEuler(look);
      const controls = controlsRef.current;
      if (controls) {
        const distance = Math.max(
          0.01,
          camera.position.distanceTo(controls.target),
        );
        camera.getWorldDirection(forward);
        controls.target
          .copy(camera.position)
          .addScaledVector(forward, distance);
      }
      camera.updateMatrixWorld();
      event.preventDefault();
    };
    const up = (event: PointerEvent) => {
      if (drag?.id === event.pointerId) drag = null;
    };
    const wheel = (event: WheelEvent) => {
      if (runtime.current.flight) stopFlight();
      if (!isFree()) return;
      store.setSpeedKmPerSecond(
        store.getSnapshot().speedKmPerSecond *
          Math.exp(-MathUtils.clamp(event.deltaY, -200, 200) * 0.003),
      );
      event.preventDefault();
    };
    const visibility = () => {
      if (document.hidden) clearInput();
    };
    const contextMenu = (event: MouseEvent) => {
      if (isFree()) event.preventDefault();
    };
    const blurCanvas = () => {
      drag = null;
      const state = runtime.current;
      state.keys.clear();
      state.velocity.set(0, 0, 0);
      state.moving = false;
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", clearInput);
    document.addEventListener("visibilitychange", visibility);
    canvas.addEventListener("pointerdown", down, true);
    canvas.addEventListener("contextmenu", contextMenu);
    window.addEventListener("pointermove", move, {
      passive: false,
      capture: true,
    });
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    canvas.addEventListener("blur", blurCanvas);
    canvas.addEventListener("focus", focusCanvas);
    canvas.addEventListener("wheel", wheel, { passive: false, capture: true });
    return () => {
      clearInput();
      store.bindCanvasFocus(null);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", clearInput);
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("pointerdown", down, true);
      canvas.removeEventListener("contextmenu", contextMenu);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      canvas.removeEventListener("blur", blurCanvas);
      canvas.removeEventListener("focus", focusCanvas);
      canvas.removeEventListener("wheel", wheel, true);
      if (previousTab === null) canvas.removeAttribute("tabindex");
      else canvas.setAttribute("tabindex", previousTab);
      if (previousLabel === null) canvas.removeAttribute("aria-label");
      else canvas.setAttribute("aria-label", previousLabel);
      canvas.style.setProperty("cursor", "");
    };
  }, [
    camera,
    canvas,
    runtime,
    controlsRef,
    enabled,
    canvasLabel,
    remember,
    stopFlight,
    store,
  ]);
}
