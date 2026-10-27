"use client";

import {
  Component,
  Suspense,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Canvas, addAfterEffect, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Texture, type Group, type Material, type Mesh, type ShaderMaterial } from "three";
import { afterPaint, idleTurn } from "@/lib/idle-task";
import { useSceneMotion } from "@/hooks/useSceneMotion";
import type { CachedPlanetScene, PlanetPresentation, PlanetEnvironmentProps } from "./types";

type Props = {
  entries: CachedPlanetScene[];
  activeId: string;
  presentation: PlanetPresentation;
  motionPaused: boolean;
  onReady: (id: string) => void;
  onError: (id: string) => void;
};

class SceneBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function DefaultEnvironment({ children, lighting }: PlanetEnvironmentProps) {
  return (
    <>
      {lighting === "scene" && (
        <>
          <ambientLight intensity={0.15} />
          <directionalLight position={[-5, 2, 5]} intensity={3} />
        </>
      )}
      {children}
    </>
  );
}

function sceneTextures(root: Group) {
  const textures = new Set<Texture>();
  const collect = (value: unknown) => {
    if (value instanceof Texture) textures.add(value);
    else if (Array.isArray(value))
      value.forEach((item) => { if (item instanceof Texture) textures.add(item); });
  };
  root.traverse((object) => {
    const material = (object as Mesh).material;
    if (!material) return;
    const materials: Material[] = Array.isArray(material) ? material : [material];
    materials.forEach((item) => {
      Object.values(item).forEach(collect);
      const uniforms = (item as ShaderMaterial).uniforms;
      if (uniforms) Object.values(uniforms).forEach((uniform) => collect(uniform.value));
    });
  });
  return textures;
}

/** Upload one texture per idle turn, then compile without a synchronous readiness wait. */
function PrepareScene({
  root,
  active,
  onPrepared,
}: {
  root: RefObject<Group | null>;
  active: boolean;
  onPrepared: () => void;
}) {
  const { gl, camera, scene, invalidate } = useThree();
  const prepared = useRef(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!active || prepared.current || !root.current) return;
    const group = root.current;
    const controller = new AbortController();
    const { signal } = controller;
    async function prepare() {
      for (const texture of sceneTextures(group)) {
        if (!(await idleTurn(signal))) return;
        gl.initTexture(texture);
      }
      if (!(await idleTurn(signal))) return;
      await gl.compileAsync(group, camera, scene);
      if (signal.aborted) return;
      prepared.current = true;
      onPrepared();
      invalidate();
    }
    void prepare().catch((cause: unknown) => {
      if (!signal.aborted) setError(cause);
    });
    return () => controller.abort();
  }, [active, camera, gl, invalidate, onPrepared, root, scene]);
  if (error) throw error;
  return null;
}

/** Reveal the Canvas only after its own first prepared frame has been rendered. */
function NotifyRendered({ active, ready, onReady }: {
  active: boolean;
  ready: boolean;
  onReady: () => void;
}) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    if (!active || !ready) return;
    const initialFrame = gl.info.render.frame;
    const remove = addAfterEffect(() => {
      if (gl.info.render.frame <= initialFrame) return;
      remove();
      onReady();
    });
    invalidate();
    return remove;
  }, [active, gl, invalidate, onReady, ready]);
  return null;
}

function CachedScene({ entry, active, animate, previewOnly, onReady, onError }: {
  entry: CachedPlanetScene;
  active: boolean;
  animate: boolean;
  previewOnly: boolean;
  onReady: () => void;
  onError: () => void;
}) {
  const { Scene, PreviewScene, Environment = DefaultEnvironment } = entry.definition;
  const InitialScene = PreviewScene ?? Scene;
  const initialRoot = useRef<Group>(null);
  const fullRoot = useRef<Group>(null);
  const axisRoot = useRef<Group>(null);
  const [initialReady, setInitialReady] = useState(false);
  const [loadFull, setLoadFull] = useState(false);
  const [fullReady, setFullReady] = useState(false);
  const [fullFailed, setFullFailed] = useState(false);
  const initialPrepared = useCallback(() => setInitialReady(true), []);
  const fullPrepared = useCallback(() => setFullReady(true), []);
  const fullError = useCallback(() => {
    setFullFailed(true);
    setFullReady(false);
    onError();
  }, [onError]);

  useEffect(() => {
    if (!active || previewOnly || !PreviewScene || !Scene || !initialReady || loadFull || fullFailed)
      return;
    return afterPaint(() => startTransition(() => setLoadFull(true)));
  }, [active, initialReady, loadFull, fullFailed, previewOnly, PreviewScene, Scene]);

  useFrame((_, delta) => {
    if (axisRoot.current && previewOnly && active && animate)
      axisRoot.current.rotation.y += Math.min(delta, 0.1) * 0.18;
  });

  if (!InitialScene) return null;
  return (
    <group visible={active}>
      {previewOnly && (
        <>
          <ambientLight intensity={0.8} />
          <directionalLight position={[3, 2, 6]} intensity={2.2} />
          <directionalLight position={[-4, -1, 3]} intensity={0.6} />
        </>
      )}
      <Environment active={active} animate={animate} lighting={previewOnly ? "studio" : "scene"}>
        <group ref={axisRoot}>
          {!fullReady && (
            <Suspense fallback={null}>
              <group ref={initialRoot} visible={initialReady}>
                <InitialScene active={active} animate={animate && initialReady} />
                <PrepareScene root={initialRoot} active={active} onPrepared={initialPrepared} />
                <NotifyRendered active={active} ready={initialReady} onReady={onReady} />
              </group>
            </Suspense>
          )}
          {loadFull && Scene && !fullFailed && (
            <SceneBoundary onError={fullError}>
              <Suspense fallback={null}>
                <group ref={fullRoot} visible={fullReady}>
                  <Scene active={active} animate={animate && fullReady} />
                  <PrepareScene root={fullRoot} active={active} onPrepared={fullPrepared} />
                  <NotifyRendered active={active} ready={fullReady} onReady={onReady} />
                </group>
              </Suspense>
            </SceneBoundary>
          )}
        </group>
      </Environment>
    </group>
  );
}

function SceneEntry({ entry, activeId, animate, previewOnly, onReady, onError }: {
  entry: CachedPlanetScene;
  activeId: string;
  animate: boolean;
  previewOnly: boolean;
  onReady: Props["onReady"];
  onError: Props["onError"];
}) {
  const ready = useCallback(() => onReady(entry.id), [entry.id, onReady]);
  const failed = useCallback(() => onError(entry.id), [entry.id, onError]);
  return (
    <SceneBoundary onError={failed}>
      <Suspense fallback={null}>
        <CachedScene
          entry={entry}
          active={entry.id === activeId}
          animate={animate && entry.id === activeId}
          previewOnly={previewOnly}
          onReady={ready}
          onError={failed}
        />
      </Suspense>
    </SceneBoundary>
  );
}

export default function PlanetStage({
  entries, activeId, presentation, motionPaused, onReady, onError,
}: Props) {
  const active = entries.some((entry) => entry.id === activeId);
  const animate = useSceneMotion(motionPaused, active);
  const previewOnly = presentation === "thumbnail";
  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 45 }}
      resize={{ offsetSize: true }}
      gl={{ alpha: true, antialias: true, powerPreference: "default" }}
      dpr={previewOnly ? [1, 2] : [1, 1.5]}
      frameloop={active ? animate ? "always" : "demand" : "never"}
      style={{ background: "transparent" }}
      fallback={null}
    >
      {entries.map((entry) => (
        <SceneEntry
          key={entry.id}
          entry={entry}
          activeId={activeId}
          animate={animate}
          previewOnly={previewOnly}
          onReady={onReady}
          onError={onError}
        />
      ))}
      {!previewOnly && (
        <OrbitControls
          enabled={active}
          autoRotate={animate}
          autoRotateSpeed={0.25}
          enableRotate={presentation === "lab" || presentation === "hero"}
          enablePan={false}
          enableZoom={false}
        />
      )}
    </Canvas>
  );
}
