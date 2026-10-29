"use client";

import dynamic from "next/dynamic";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import styles from "./planet-canvas.module.css";
import type { SceneRequest } from "../model/scene-cache";
import { useSceneCache } from "../model/useSceneCache";
import { useDeviceProfile } from "../model/useDeviceProfile";
import {
  getTextureBudget,
  type QualityPreference,
} from "../model/texture-quality";

const CanvasHost = dynamic(() => import("./SharedPlanetCanvas"), {
  ssr: false,
});
type CanvasContext = {
  paused: boolean;
  available: boolean;
  source: RefObject<HTMLDivElement | null>;
  register: (id: string, visible: boolean) => void;
  placeCanvas: (target: HTMLElement | null) => void;
  requestScene: (request: SceneRequest) => void;
  releaseScene: (owner: string) => void;
  preference: QualityPreference;
  maxTextureSize: number;
};
const Context = createContext<CanvasContext | null>(null);
export function usePlanetCanvas() {
  const value = useContext(Context);
  if (!value) throw new Error("PlanetViewport requires PlanetCanvasProvider");
  return value;
}
export function PlanetCanvasProvider({
  paused,
  children,
}: {
  paused: boolean;
  children: ReactNode;
}) {
  const source = useRef<HTMLDivElement>(null);
  const canvasLayer = useRef<HTMLDivElement | null>(null);
  const overlayTarget = useRef<HTMLElement | null>(null);
  // Move only the persistent host DOM node. Its React tree and WebGL context
  // stay mounted while a native dialog takes ownership of the browser top layer.
  const placeCanvas = useCallback((target: HTMLElement | null) => {
    overlayTarget.current = target;
    const layer = canvasLayer.current;
    const destination = target ?? source.current;
    if (layer && destination && layer.parentElement !== destination)
      destination.appendChild(layer);
  }, []);
  const registerLayer = useCallback((layer: HTMLDivElement | null) => {
    canvasLayer.current = layer;
    if (layer && overlayTarget.current)
      overlayTarget.current.appendChild(layer);
  }, []);
  const views = useRef(new Set<string>());
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const [available, setAvailable] = useState(true);
  const preference: QualityPreference = "auto";
  const [maxTextureSize, setMaxTextureSize] = useState(8192);
  const profile = useDeviceProfile();
  const textureBudget = getTextureBudget(profile.memory);
  const { scenes, requestScene, releaseScene, reportSceneBytes, clearScenes } =
    useSceneCache(textureBudget);
  const register = useCallback((id: string, visible: boolean) => {
    if (visible) {
      views.current.add(id);
      setStarted(true);
    } else views.current.delete(id);
    setCount(views.current.size);
  }, []);
  const value = useMemo(
    () => ({
      paused,
      available,
      source,
      register,
      placeCanvas,
      requestScene,
      releaseScene,
      preference,
      maxTextureSize,
    }),
    [
      paused,
      available,
      register,
      placeCanvas,
      requestScene,
      releaseScene,
      preference,
      maxTextureSize,
    ],
  );
  return (
    <Context.Provider value={value}>
      <div ref={source} className={styles.root}>
        {children}
        {started && (
          <CanvasHost
            source={source}
            paused={paused}
            active={count > 0}
            onAvailable={setAvailable}
            onLayer={registerLayer}
            scenes={scenes}
            onSceneBytes={reportSceneBytes}
            preference={preference}
            textureBudget={textureBudget}
            onTextureLimit={setMaxTextureSize}
            textureLimit={maxTextureSize}
            onContextReset={clearScenes}
          />
        )}
      </div>
    </Context.Provider>
  );
}
