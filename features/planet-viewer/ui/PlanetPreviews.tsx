"use client";

import {
  Suspense,
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Canvas, useFrame } from "@react-three/fiber";
import { PerspectiveCamera, View } from "@react-three/drei";
import type { Group } from "three";
import { ErrorBoundary } from "@/shared/ui/ErrorBoundary";
import { useTranslations } from "next-intl";
import type { PlanetId } from "@/entities/planet/types";
import { PlanetModel, PlanetModelFallback } from "./PlanetModel";
import { NotifyRendered, PrepareScene } from "./PreparedModel";
import styles from "./planet-previews.module.css";
import { RendererTelemetry } from "./RendererTelemetry";
import type { RendererTelemetrySink } from "@/shared/lib/renderer-telemetry";

const PreviewFailureContext = createContext(false);

type ProviderProps = {
  children: ReactNode;
  animate: boolean;
  preparing: boolean;
  onError: () => void;
  telemetry?: RendererTelemetrySink;
};

/** View uses window coordinates: keep its Canvas in the viewport, outside the transformed HUD. */
export function PlanetPreviewProvider({
  children,
  animate,
  preparing,
  onError,
  telemetry,
}: ProviderProps) {
  const source = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [failed, setFailed] = useState(false);
  const t = useTranslations("ui");
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setHost(document.body));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const fail = useCallback(() => {
    setFailed(true);
    onError();
  }, [onError]);

  return (
    <PreviewFailureContext.Provider value={failed}>
      <div ref={source} className={styles.root}>
        {children}
        {host &&
          createPortal(
            <div ref={layer} className={styles.canvas} aria-hidden="true">
              {failed ? (
                <span role="status" className={styles.error}>
                  {t("modelError")}
                </span>
              ) : (
                <ErrorBoundary onError={fail}>
                  <Canvas
                    frameloop={preparing || animate ? "always" : "demand"}
                    eventSource={source}
                    eventPrefix="client"
                    dpr={[1, 1.5]}
                    gl={{
                      alpha: true,
                      antialias: true,
                      powerPreference: "default",
                    }}
                    onCreated={({ gl }) => {
                      gl.domElement.dataset.previewCanvas = "true";
                      gl.info.autoReset = false;
                      gl.domElement.addEventListener(
                        "webglcontextlost",
                        (event) => {
                          event.preventDefault();
                          if (gl.domElement.isConnected) fail();
                        },
                      );
                    }}
                  >
                    <PreviewFrame source={source} layer={layer} />
                    <RendererTelemetry name="previews" sink={telemetry} />
                    <View.Port />
                  </Canvas>
                </ErrorBoundary>
              )}
            </div>,
            host,
          )}
      </div>
    </PreviewFailureContext.Provider>
  );
}

function PreviewFrame({
  source,
  layer,
}: {
  source: RefObject<HTMLDivElement | null>;
  layer: RefObject<HTMLDivElement | null>;
}) {
  useFrame(({ gl, size }) => {
    const bounds = source.current?.getBoundingClientRect();
    if (bounds && layer.current) {
      // Preserve full-window coordinates while clipping previews to the scrollable panel.
      const clip = `inset(${Math.max(0, bounds.top)}px ${Math.max(0, size.width - bounds.right)}px ${Math.max(0, size.height - bounds.bottom)}px ${Math.max(0, bounds.left)}px round 12px)`;
      if (layer.current.style.clipPath !== clip)
        layer.current.style.setProperty("clip-path", clip);
    }
    gl.setScissorTest(false);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true, true);
  }, 0.5);
  return null;
}

export function PlanetPreview({
  planetId,
  animate,
  children,
  onReady,
  textureSources,
}: {
  planetId?: PlanetId;
  animate: boolean;
  children?: ReactNode;
  onReady: () => void;
  textureSources?: Readonly<Record<string, string>>;
}) {
  const unavailable = useContext(PreviewFailureContext);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">(
    "loading",
  );
  const ready = useCallback(() => {
    setStatus((current) => (current === "fallback" ? current : "ready"));
    onReady();
  }, [onReady]);
  return (
    <span
      className={styles.view}
      data-preview-state={unavailable ? "fallback" : status}
    >
      {(unavailable || status !== "ready") && (
        <span className={styles.placeholder} />
      )}
      {!unavailable && (
        <View as="span" className={styles.view} index={10}>
          <PerspectiveCamera makeDefault position={[0, 0, 4.8]} fov={40} />
          <ambientLight intensity={0.8} />
          <directionalLight position={[3, 2, 6]} intensity={2.2} />
          <directionalLight position={[-4, -1, 3]} intensity={0.6} />
          <ErrorBoundary
            onError={() => setStatus("fallback")}
            fallback={<PlanetModelFallback radius={0.8} onReady={ready} />}
          >
            <Suspense fallback={null}>
              {planetId ? (
                <PlanetModel
                  planetId={planetId}
                  radius={planetId === "saturn" ? 0.6 : 1}
                  animate={animate}
                  quality="2k"
                  detail="lite"
                  textureSources={textureSources}
                  preview
                  onReady={ready}
                />
              ) : (
                <PreparedPreview onReady={ready}>{children}</PreparedPreview>
              )}
            </Suspense>
          </ErrorBoundary>
        </View>
      )}
    </span>
  );
}

/** Procedural objects, such as the Sun, use the same upload/compile/frame gate as planets. */
function PreparedPreview({
  children,
  onReady,
}: {
  children: ReactNode;
  onReady: () => void;
}) {
  const root = useRef<Group>(null);
  const [prepared, setPrepared] = useState(false);
  const prepare = useCallback(() => setPrepared(true), []);
  const callback = useRef(onReady);
  const notified = useRef(false);
  useEffect(() => {
    callback.current = onReady;
  }, [onReady]);
  const ready = useCallback(() => {
    if (notified.current) return;
    notified.current = true;
    callback.current();
  }, []);
  return (
    <group ref={root}>
      {children}
      <PrepareScene
        root={root}
        active
        onPrepared={prepare}
        resourceId="preview:sun"
      />
      <NotifyRendered active ready={prepared} onReady={ready} />
    </group>
  );
}
