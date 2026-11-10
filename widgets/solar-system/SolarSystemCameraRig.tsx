"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import { catalog } from "@/entities/planet/catalog";
import { SATURN_RINGS } from "@/entities/planet/shape";
import { kmToSceneUnits, sceneUnitsToKm } from "@/entities/planet/position";
import type { PlanetId } from "@/entities/planet/types";
import {
  advancePath,
  cameraPath,
  cinematicEase,
  constrainCamera,
  framingDistance,
  type CameraBody,
} from "./camera/camera-geometry";
import { useFreeFlightInput } from "./camera/useFreeFlightInput";
import type { CameraStore } from "./camera/camera-store";
import type { SimulationStore } from "./simulation/simulation-store";

import type { SolarMapFocus, CameraPose, CameraRuntime } from "./model/types";
import {
  orientation,
  initialPose,
  copyPose,
  samePose,
  travelProgress,
} from "./camera/camera-transitions";

type Props = {
  simulation: SimulationStore;
  focus: SolarMapFocus;
  requestId: number;
  bottomInset: number;
  sideInset: number;
  topInset: number;
  enabled: boolean;
  canvasLabel: string;
  store: CameraStore;
  onRestoreFocus: (focus: SolarMapFocus) => void;
};
const FORWARD = new Vector3(0, 0, -1);

export function SolarSystemCameraRig({
  simulation,
  focus,
  requestId,
  bottomInset,
  sideInset,
  topInset,
  enabled,
  canvasLabel,
  store,
  onRestoreFocus,
}: Props) {
  const { camera, size, gl } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const telemetryAt = useRef(0);
  const runtime = useRef<CameraRuntime>({
    focus: null,
    request: null,
    flight: null,
    history: [],
    overview: null,
    tracked: null,
    safe: camera.position.clone(),
    velocity: new Vector3(),
    keys: new Set(),
    moving: false,
    viewport: "",
    autoFrame: false,
  });
  const bodies = useMemo<CameraBody[]>(
    () => [
      { id: "sun", center: new Vector3(), radius: 2.12, framingRadius: 3 },
      ...catalog.map((planet) => {
        const p = simulation.getFrame().positions[planet.id];
        const radius = kmToSceneUnits(planet.diameterKm / 2);
        return {
          id: planet.id,
          center: new Vector3(p.x, p.y, p.z),
          radius: radius * 1.008,
          framingRadius:
            radius * (planet.id === "saturn" ? SATURN_RINGS.outer : 1.04),
          ring:
            planet.id === "saturn"
              ? {
                  normal: simulation.getFrame().rotations.saturn.north.clone(),
                  inner: radius * (SATURN_RINGS.inner - 0.02),
                  outer: radius * (SATURN_RINGS.outer + 0.02),
                  thickness: radius * 0.02,
                }
              : undefined,
        };
      }),
    ],
    [simulation],
  );

  const snapshot = useCallback((): CameraPose | null => {
    const controls = controlsRef.current;
    if (!controls) return null;
    const state = runtime.current;
    const mode = store.getSnapshot().mode;
    const pose: CameraPose = {
      position: camera.position.clone(),
      target: controls.target.clone(),
      rotation: camera.quaternion.clone(),
      focus: state.focus,
      mode,
    };
    if (mode === "orbit" && state.focus && state.focus !== "sun") {
      const p = simulation.getFrame().positions[state.focus];
      pose.anchor = new Vector3(p.x, p.y, p.z);
    }
    return pose;
  }, [camera, store, simulation]);
  const remember = useCallback(() => {
    const pose = snapshot();
    if (!pose) return;
    const history = runtime.current.history;
    if (!history.length || !samePose(history[history.length - 1], pose)) {
      history.push(pose);
      if (history.length > 24) history.shift();
      store.update({ canGoBack: true });
    }
  }, [snapshot, store]);
  const stopFlight = useCallback(() => {
    const state = runtime.current;
    state.flight = null;
    state.autoFrame = false;
    state.velocity.set(0, 0, 0);
    const controls = controlsRef.current;
    if (controls) {
      // Consume pending orbital inertia, then restore the exact interrupted pose.
      const position = camera.position.clone(),
        rotation = camera.quaternion.clone(),
        target = controls.target.clone();
      controls.enableDamping = false;
      controls.update();
      controls.enableDamping = true;
      camera.position.copy(position);
      camera.quaternion.copy(rotation);
      controls.target.copy(target);
      if (store.getSnapshot().mode === "free") {
        const lookDistance = Math.max(0.01, camera.position.distanceTo(target));
        controls.target
          .copy(FORWARD)
          .applyQuaternion(camera.quaternion)
          .multiplyScalar(lookDistance)
          .add(camera.position);
      }
      controls.enabled = enabled && store.getSnapshot().mode === "orbit";
    }
    store.update({ flying: false });
  }, [camera, enabled, store]);

  useFreeFlightInput({
    camera,
    canvas: gl.domElement,
    runtime,
    controlsRef,
    enabled,
    canvasLabel,
    store,
    remember,
    stopFlight,
  });

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    camera.setViewOffset(
      size.width,
      size.height,
      -Math.min(sideInset, size.width * 0.8) / 2,
      (Math.min(bottomInset, size.height * 0.8) -
        Math.min(topInset, size.height * 0.8)) /
        2,
      size.width,
      size.height,
    );
    return () => camera.clearViewOffset();
  }, [camera, size.width, size.height, bottomInset, sideInset, topInset]);

  useFrame(({ camera, gl }, delta) => {
    const controls = controlsRef.current;
    if (!controls || !(camera instanceof PerspectiveCamera)) return;
    const state = runtime.current;
    const positions = simulation.getFrame().positions;
    for (const body of bodies) {
      if (body.id === "sun") continue;
      const p = positions[body.id as PlanetId];
      body.center.set(p.x, p.y, p.z);
      if (body.ring)
        body.ring.normal.copy(simulation.getFrame().rotations.saturn.north);
    }
    // Follow the moving anchor before collision checks, including date jumps.
    // Free flight stays in heliocentric space and is independent of the time rate.
    if (
      store.getSnapshot().mode === "orbit" &&
      state.focus &&
      state.tracked?.id === state.focus
    ) {
      const center = bodies.find((body) => body.id === state.focus)!.center;
      const offset = center.clone().sub(state.tracked.position);
      camera.position.add(offset);
      controls.target.add(offset);
      state.safe.add(offset);
      if (state.flight) {
        state.flight.path.points.forEach((point) => point.add(offset));
        state.flight.from.position.add(offset);
        state.flight.to.position.add(offset);
        state.flight.from.target.add(offset);
        state.flight.to.target.add(offset);
      }
    }
    const dt = Math.min(delta, 0.05);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const apply = (pose: CameraPose) => {
      camera.position.copy(pose.position);
      camera.quaternion.copy(pose.rotation);
      controls.target.copy(pose.target);
    };
    const begin = (destination: CameraPose, record = true) => {
      if (record) remember();
      const from = snapshot()!;
      stopFlight();
      state.keys.clear();
      const to = copyPose(destination);
      const path = cameraPath(camera.position, to.position, bodies);
      to.position.copy(path.points[path.points.length - 1]);
      state.focus = to.focus;
      state.tracked = null;
      store.update({ mode: to.mode });
      onRestoreFocus(to.focus);
      // Free flight can carry a distant look target close to a small globe.
      // Use nearby physical geometry for departure/arrival speed, not that stale look distance.
      const motionScale = (pose: CameraPose) =>
        Math.max(
          0.001,
          Math.min(
            pose.position.distanceTo(pose.target),
            ...bodies.map((body) => pose.position.distanceTo(body.center)),
          ),
        );
      const startScale = motionScale(from);
      const endScale = motionScale(to);
      const duration = MathUtils.clamp(
        1.15 +
          Math.log1p(path.length / Math.sqrt(startScale * endScale)) * 0.24 +
          from.rotation.angleTo(to.rotation) * 0.15,
        1.2,
        6,
      );
      if (
        reduced ||
        (path.length < 1e-8 && from.rotation.angleTo(to.rotation) < 1e-5)
      ) {
        apply(to);
        state.safe.copy(camera.position);
        store.update({ flying: false });
      } else {
        state.flight = {
          path,
          from,
          to,
          elapsed: 0,
          duration,
          startScale,
          endScale,
        };
        controls.enabled = false;
        store.update({ flying: true });
      }
    };
    const focusedPose = (target: Exclude<SolarMapFocus, null>): CameraPose => {
      const body = bodies.find((body) => body.id === target)!;
      const direction =
        store.getSnapshot().mode === "free"
          ? FORWARD.clone().applyQuaternion(camera.quaternion).negate()
          : camera.position.clone().sub(controls.target);
      if (direction.lengthSq() < 1e-15) direction.set(0, 0.45, 1);
      const distance = framingDistance(
        body.framingRadius,
        camera.fov,
        size.width,
        size.height,
        bottomInset,
        sideInset,
        topInset,
      );
      const position = body.center
        .clone()
        .addScaledVector(direction.normalize(), distance);
      return {
        position,
        target: body.center.clone(),
        rotation: orientation(position, body.center),
        focus: target,
        mode: "orbit",
        anchor: target === "sun" ? undefined : body.center.clone(),
      };
    };
    // Repair orbital steps before starting a new route; controls update earlier at priority -1.
    camera.position.copy(constrainCamera(state.safe, camera.position, bodies));
    if (state.request === null) state.request = requestId;
    else if (state.request !== requestId) {
      state.request = requestId;
      if (state.focus === null && focus !== null) state.overview = snapshot();
      begin(
        focus === null
          ? copyPose(state.overview ?? initialPose())
          : focusedPose(focus),
      );
      state.autoFrame = focus !== null;
    }
    for (const command of store.consumeCommands()) {
      if (!enabled) continue;
      if (command.type === "reset") {
        state.overview = initialPose();
        begin(initialPose());
        state.autoFrame = false;
      } else if (command.type === "back") {
        const current = snapshot()!;
        let previous = state.history.pop();
        while (previous && samePose(previous, current))
          previous = state.history.pop();
        if (previous) {
          const pose = copyPose(previous);
          if (
            pose.anchor &&
            pose.focus &&
            pose.focus !== "sun" &&
            pose.mode === "orbit"
          ) {
            const center = bodies.find(
              (body) => body.id === pose.focus,
            )!.center;
            const displacement = center.clone().sub(pose.anchor);
            pose.position.add(displacement);
            pose.target.add(displacement);
          }
          begin(pose, false);
          state.autoFrame = false;
        }
        store.update({ canGoBack: state.history.length > 0 });
      } else if (command.mode !== store.getSnapshot().mode) {
        if (command.mode === "orbit" && state.focus !== null) {
          begin(focusedPose(state.focus));
          state.autoFrame = true;
        } else {
          remember();
          stopFlight();
          store.update({ mode: command.mode });
          const lookDistance = Math.max(
            0.01,
            camera.position.distanceTo(controls.target),
          );
          controls.target
            .copy(FORWARD)
            .applyQuaternion(camera.quaternion)
            .multiplyScalar(lookDistance)
            .add(camera.position);
        }
        gl.domElement.focus({ preventScroll: true });
      }
    }
    const mode = store.getSnapshot().mode;
    if (mode === "orbit" && state.focus && state.focus !== "sun") {
      const center = bodies.find((body) => body.id === state.focus)!.center;
      state.tracked = { id: state.focus, position: center.clone() };
    } else state.tracked = null;
    const viewport = `${size.width}:${size.height}:${bottomInset}:${sideInset}:${topInset}`;
    if (
      state.viewport &&
      state.viewport !== viewport &&
      state.autoFrame &&
      mode === "orbit" &&
      state.focus
    ) {
      begin(focusedPose(state.focus), false);
      state.autoFrame = true;
    }
    state.viewport = viewport;
    const flight = state.flight;
    if (flight) {
      flight.elapsed += dt;
      const progress = reduced
        ? 1
        : Math.min(1, flight.elapsed / flight.duration);
      const distance =
        progress === 1
          ? flight.path.length
          : flight.path.length * travelProgress(flight, progress);
      camera.position.copy(
        advancePath(flight.path, distance, camera.position, bodies),
      );
      camera.quaternion.slerpQuaternions(
        flight.from.rotation,
        flight.to.rotation,
        cinematicEase(progress),
      );
      const lookDistance = Math.exp(
        MathUtils.lerp(
          Math.log(
            Math.max(
              0.0001,
              flight.from.position.distanceTo(flight.from.target),
            ),
          ),
          Math.log(
            Math.max(0.0001, flight.to.position.distanceTo(flight.to.target)),
          ),
          cinematicEase(progress),
        ),
      );
      controls.target
        .copy(FORWARD)
        .applyQuaternion(camera.quaternion)
        .multiplyScalar(lookDistance)
        .add(camera.position);
      if (progress === 1) {
        controls.target.copy(flight.to.target);
        state.flight = null;
        store.update({ flying: false });
      }
    } else if (enabled && mode === "free") {
      const pressed = (...keys: string[]) =>
        keys.some((key) => state.keys.has(key));
      const x =
        Number(pressed("KeyD", "ArrowRight")) -
        Number(pressed("KeyA", "ArrowLeft"));
      const y = Number(pressed("KeyE")) - Number(pressed("KeyQ"));
      const z =
        Number(pressed("KeyS", "ArrowDown")) -
        Number(pressed("KeyW", "ArrowUp"));
      const input = new Vector3(x, y, z);
      if (input.lengthSq() > 0 && !state.moving) {
        remember();
        state.moving = true;
      }
      if (input.lengthSq() === 0) state.moving = false;
      const speed = kmToSceneUnits(store.getSnapshot().speedKmPerSecond);
      // Constant speed in real elapsed seconds, including when frame rate drops.
      const movementDelta = Math.max(0, delta);
      state.velocity
        .copy(input.normalize().applyQuaternion(camera.quaternion))
        .multiplyScalar(speed);
      const desired = camera.position
        .clone()
        .addScaledVector(state.velocity, movementDelta)
        .clampLength(0, Math.max(45000, camera.position.length()));
      const position = constrainCamera(camera.position, desired, bodies);
      const offset = position.clone().sub(camera.position);
      if (movementDelta > 0)
        state.velocity.copy(offset).divideScalar(movementDelta);
      camera.position.copy(position);
      controls.target.add(offset);
    }
    controls.enabled = enabled && mode === "orbit" && !state.flight;
    controls.dampingFactor = reduced ? 1 : 1 - Math.exp(-6 * dt);
    controls.minDistance =
      mode === "orbit" && state.focus
        ? bodies.find((body) => body.id === state.focus)!.radius * 1.02
        : 0.0001;
    if (controls.enabled) camera.lookAt(controls.target);
    let clearance = Infinity;
    for (const body of bodies)
      clearance = Math.min(
        clearance,
        Math.max(0, camera.position.distanceTo(body.center) - body.radius),
      );
    const near = MathUtils.clamp(clearance * 0.025, 0.00002, 0.5);
    if (Math.abs(camera.near - near) > Math.max(0.000001, camera.near * 0.15)) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
    state.safe.copy(camera.position);
    camera.updateMatrixWorld();
    const now = performance.now();
    if (
      now - telemetryAt.current >= 100 ||
      store.getSnapshot().distanceTarget !== state.focus
    ) {
      telemetryAt.current = now;
      const body = bodies.find((body) => body.id === state.focus);
      store.update({
        distanceTarget: state.focus,
        distanceKm: body
          ? sceneUnitsToKm(camera.position.distanceTo(body.center))
          : null,
      });
    }
  }, -0.5);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      enablePan={false}
      enableRotate
      enableZoom
      maxDistance={35000}
      rotateSpeed={0.5}
      zoomSpeed={0.75}
      onStart={() => {
        if (enabled && store.getSnapshot().mode === "orbit") {
          remember();
          runtime.current.autoFrame = false;
        }
      }}
    />
  );
}
