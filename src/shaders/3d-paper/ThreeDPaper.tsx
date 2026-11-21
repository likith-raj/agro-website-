import { useEffect, useRef, useState, type CSSProperties } from "react";

export type ThreeDPaperVariant = "original" | "site-of-the-year" | "japanese" | "certificate";

export type ThreeDPaperProps = {
  className?: string;
  style?: CSSProperties;
  variant?: ThreeDPaperVariant;
  paused?: boolean;
};

const sourceLoaders: Record<ThreeDPaperVariant, () => Promise<string>> = {
  original: () => Promise.all([
    import("./sources/3d-paper.html?raw"),
    import("../../threeuiContent"),
  ]).then(([source, { preparePaperSource }]) => preparePaperSource(source.default)),
  "site-of-the-year": () => import("./sources/3d-paper-site-of-the-year.html?raw").then(source => source.default),
  japanese: () => import("./sources/3d-paper-japanese.html?raw").then(source => source.default),
  certificate: () => import("./sources/3d-paper-certificate.html?raw").then(source => source.default),
};
const sourcePromises: Partial<Record<ThreeDPaperVariant, Promise<string>>> = {};

function loadPaperSource(variant: ThreeDPaperVariant) {
  return sourcePromises[variant] ??= sourceLoaders[variant]().catch(error => {
    delete sourcePromises[variant];
    throw error;
  });
}

const titles: Record<ThreeDPaperVariant, string> = {
  original: "Agro Drone Tech — Sales & Compliance",
  "site-of-the-year": "3D Paper — Site of the Year",
  japanese: "3D Paper — 認定証",
  certificate: "3D Paper — Certificate",
};

export function ThreeDPaper({ className = "", style, variant = "original", paused = false }: ThreeDPaperProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [documentVisible, setDocumentVisible] = useState(() => (
    typeof document === "undefined" || !document.hidden
  ));
  const [hostVisible, setHostVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [documentSource, setDocumentSource] = useState<{ variant: ThreeDPaperVariant; html: string }>();
  const [readyVariant, setReadyVariant] = useState<ThreeDPaperVariant>();
  const source = documentSource?.variant === variant ? documentSource.html : undefined;
  const ready = readyVariant === variant && source !== undefined;
  const scenePaused = paused || !hostVisible || !documentVisible;

  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage({ type: 'agro-scene-motion', paused: scenePaused }, '*');
  }, [scenePaused, ready]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      const visible = entry?.isIntersecting ?? true;
      setHostVisible(visible);
      if (visible) setMounted(true);
    }, { rootMargin: "80px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const update = () => setDocumentVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    setReadyVariant(undefined);
    if (!mounted) return undefined;
    let cancelled = false;
    loadPaperSource(variant).then(html => {
      if (!cancelled) setDocumentSource({ variant, html });
    }).catch(error => {
      if (!cancelled) console.error('Unable to load paper scene.', error);
    });
    return () => { cancelled = true; };
  }, [mounted, variant]);

  return (
    <div
      ref={hostRef}
      className={`threeui-background three-d-paper${className ? ` ${className}` : ""}`}
      role="group"
      aria-label="Interactive sales and compliance process guide"
      data-state={!mounted || (ready && scenePaused) ? "paused" : ready ? "ready" : "loading"}
      style={{
        position: "relative",
        overflow: "hidden",
        background: "#08080a",
        pointerEvents: "auto",
        ...style,
      }}
    >
      {mounted && source ? (
        <iframe
          key={variant}
          ref={frameRef}
          title={titles[variant]}
          srcDoc={source}
          sandbox="allow-scripts"
          loading="eager"
          onLoad={() => {
            setReadyVariant(variant);
            frameRef.current?.contentWindow?.postMessage({ type: 'agro-scene-motion', paused: scenePaused }, '*');
          }}
          style={{
            position: "absolute",
            inset: 0,
            display: "block",
            width: "100%",
            height: "100%",
            border: 0,
            background: "#08080a",
            opacity: ready ? 1 : 0,
            pointerEvents: ready ? "auto" : "none",
            transition: "opacity 240ms ease-out",
          }}
        />
      ) : null}
    </div>
  );
}
