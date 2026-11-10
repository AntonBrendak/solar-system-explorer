"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Group,
  Light,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type SphereGeometry,
} from "three";
import type { PlanetId } from "@/entities/planet/types";
import {
  TextureTierContext,
  clampTier,
  getTexturePolicy,
  nextTier,
  textureTiers,
  type TextureTier,
} from "../model/texture-quality";
import {
  gpuTextureMaximum,
  getModelTextureTarget,
} from "../model/texture-assets";
import { useDeviceProfile } from "../model/useDeviceProfile";
import { TextureSourceContext } from "../model/useSceneTexture";
import { PlanetMotionContext, type PlanetMotion } from "../model/planet-motion";
import { getPlanetVisual } from "../scenes/registry";
import { PrepareScene, NotifyRendered } from "./PreparedModel";
import { modelPresentation } from "../model/model-presentation";

type Props = {
  planetId: PlanetId;
  radius: number;
  animate: boolean;
  quality: "2k" | "8k";
  detail?: "lite" | "full";
  visible?: boolean;
  sunDirection?: Vector3;
  preview?: boolean;
  motion?: PlanetMotion;
  onReady?: () => void;
  onPrepared?: () => void;
  textureSources?: Readonly<Record<string, string>>;
  pixelDiameter?: number;
  fallback?: boolean;
};

/** Geometry only: callers share their Canvas, camera and lighting across all models. */
export function PlanetModel(props: Props) {
  const { gl, size } = useThree();
  const profile = useDeviceProfile();
  const input = {
    ...profile,
    viewWidth: size.width,
    viewHeight: size.height,
    dpr: gl.getPixelRatio(),
    maxTextureSize: gl.capabilities.maxTextureSize,
  };
  const policy = getTexturePolicy(input);
  const target =
    props.detail === "full"
      ? clampTier(
          getModelTextureTarget(
            props.planetId,
            input,
            (props.pixelDiameter ?? Math.min(size.width, size.height)) *
              input.dpr,
          ),
          props.quality,
        )
      : clampTier("2k", gpuTextureMaximum(input.maxTextureSize));
  const [ready, setReady] = useState<TextureTier | null>(null);
  const [pending, setPending] = useState<TextureTier | null>(() =>
    clampTier(props.detail === "full" ? policy.base : "2k", target),
  );
  useEffect(() => {
    if (pending || !ready || ready === target || profile.hidden) return;
    const timer = window.setTimeout(
      () => setPending(nextTier(ready, policy.base, target)),
      policy.upgradeDelay,
    );
    return () => window.clearTimeout(timer);
  }, [
    pending,
    ready,
    target,
    profile.hidden,
    policy.base,
    policy.upgradeDelay,
  ]);
  const tiers = [
    ...new Set(
      [ready, pending].filter((tier): tier is TextureTier => tier !== null),
    ),
  ];
  return (
    <Suspense fallback={null}>
      {tiers.map((tier) => (
        <Suspense key={tier} fallback={null}>
          <ModelContent
            key={`${props.planetId}:${props.detail ?? "lite"}:${tier}`}
            {...props}
            tier={tier}
            visible={(props.visible ?? true) && tier === ready}
            onPrepared={() => {
              setReady(tier);
              setPending(null);
              props.onPrepared?.();
            }}
          />
        </Suspense>
      ))}
    </Suspense>
  );
}

function ModelContent({
  planetId,
  radius,
  animate,
  tier,
  preview = false,
  detail = "lite",
  visible = true,
  sunDirection,
  motion,
  onReady,
  onPrepared,
  textureSources,
  fallback = false,
}: Props & { tier: TextureTier }) {
  const model = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const needsPlacement = useRef(true);
  const [prepared, setPrepared] = useState(false);
  const prepareListener = useRef(onPrepared);
  useEffect(() => {
    prepareListener.current = onPrepared;
  }, [onPrepared]);
  const preparedCallback = useCallback(() => {
    setPrepared(true);
    prepareListener.current?.();
  }, []);
  const readyCallback = useRef(onReady);
  const notified = useRef(false);
  useEffect(() => {
    readyCallback.current = onReady;
  }, [onReady]);
  const notifyReady = useCallback(() => {
    if (notified.current) return;
    notified.current = true;
    readyCallback.current?.();
  }, []);
  const size = useThree((state) => state.size);
  const { Scene, PreviewScene, Environment } = getPlanetVisual(planetId);
  const Content = detail === "lite" ? PreviewScene : Scene;
  const active = visible && prepared;
  const gl = useThree((state) => state.gl);
  const presentation = useRef({
    prepared,
    visible,
    fallback,
    priority: detail === "full" ? 10 + textureTiers.indexOf(tier) : 0,
  });
  useLayoutEffect(() => {
    presentation.current = {
      prepared,
      visible,
      fallback,
      priority: detail === "full" ? 10 + textureTiers.indexOf(tier) : 0,
    };
  });
  useLayoutEffect(() => {
    if (!model.current) return;
    return modelPresentation.register(
      gl,
      planetId,
      model.current,
      () => presentation.current,
    );
  }, [gl, planetId]);
  useFrame(() => modelPresentation.flush(gl, gl.info.render.frame), -1.8);
  const scratch = useMemo(
    () => ({
      inverse: new Matrix4(),
      local: new Matrix4(),
      position: new Vector3(),
      scale: new Vector3(),
      rotation: new Quaternion(),
    }),
    [],
  );

  useLayoutEffect(() => {
    needsPlacement.current = true;
  }, [radius, size.width, size.height]);
  useFrame((_, delta) => {
    const root = model.current;
    if (!root) return;
    if (motion && spin.current)
      spin.current.quaternion.copy(motion.rotation.quaternion);
    if (needsPlacement.current) {
      root.scale.setScalar(1);
      root.updateWorldMatrix(true, true);
      scratch.inverse.copy(root.matrixWorld).invert();
      let globe: Mesh | null = null;
      root.traverse((object) => {
        // Lighting is supplied once by the containing scene/view.
        if (object instanceof Light) object.visible = false;
        if (
          !globe &&
          object instanceof Mesh &&
          object.geometry.type === "SphereGeometry"
        )
          globe = object;
      });
      const sphere = globe as Mesh<SphereGeometry> | null;
      if (sphere) {
        scratch.local
          .multiplyMatrices(scratch.inverse, sphere.matrixWorld)
          .decompose(scratch.position, scratch.rotation, scratch.scale);
        const nativeRadius =
          sphere.geometry.parameters.radius *
          Math.max(Math.abs(scratch.scale.x), Math.abs(scratch.scale.z));
        root.scale.setScalar(radius / Math.max(nativeRadius, 0.0001));
        needsPlacement.current = false;
      }
    }
    if (!motion && preview && active && animate && spin.current)
      spin.current.rotation.y += Math.min(delta, 0.1) * 0.18;
  }, -2);

  if (!Content || !Environment) return null;
  return (
    <TextureTierContext.Provider value={tier}>
      <TextureSourceContext.Provider
        value={detail === "lite" ? (textureSources ?? null) : null}
      >
        <group
          ref={model}
          name={`planet-model-${planetId}-${detail}`}
          visible={active}
        >
          <PlanetMotionContext.Provider value={motion ?? null}>
            <Environment
              active={active}
              animate={animate && active}
              lighting="studio"
              sunDirection={sunDirection}
            >
              <group ref={spin}>
                <Content active={active} animate={animate && active} />
              </group>
            </Environment>
          </PlanetMotionContext.Provider>
          <PrepareScene
            root={model}
            active
            onPrepared={preparedCallback}
            resourceId={`${preview ? "preview" : "orbit"}:${planetId}:${detail}:${tier}`}
          />
          <NotifyRendered
            active={visible}
            ready={prepared}
            onReady={notifyReady}
          />
        </group>
      </TextureSourceContext.Provider>
    </TextureTierContext.Provider>
  );
}

/** A local, texture-free replacement also completes the caller's readiness gate. */
export function PlanetModelFallback({
  radius,
  color = "#8c9aa9",
  onReady,
  visible = true,
}: {
  radius: number;
  color?: string;
  onReady: () => void;
  visible?: boolean;
}) {
  return (
    <group visible={visible}>
      <mesh>
        <sphereGeometry args={[radius, 24, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <NotifyRendered active ready onReady={onReady} />
    </group>
  );
}
