import { useEffect, useRef, useState, type CSSProperties } from "react";

let productShelfSource: Promise<string> | undefined;

function loadShelfSource() {
  return productShelfSource ??= Promise.all([
    import("./sources/ashen-press.html?raw"),
    import("../../threeuiContent"),
  ]).then(([source, { prepareShelfSource }]) => prepareShelfSource(source.default)).catch(error => {
    productShelfSource = undefined;
    throw error;
  });
}

export type AshenPressProps = {
  className?: string;
  style?: CSSProperties;
  paused?: boolean;
  onProductDetails?: (id: string) => void;
};

export function AshenPress({ className = "", style, paused = false, onProductDetails }: AshenPressProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.type !== 'agro-product-detail') return;
      if (['t50', 't25', 'mavic'].includes(event.data.id)) onProductDetails?.(event.data.id);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onProductDetails]);
  const [documentVisible, setDocumentVisible] = useState(() => (
    typeof document === "undefined" || !document.hidden
  ));
  const [hostVisible, setHostVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [source, setSource] = useState<string>();
  const [ready, setReady] = useState(false);
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
    if (!mounted) return undefined;
    let cancelled = false;
    loadShelfSource().then(html => {
      if (!cancelled) setSource(html);
    }).catch(error => {
      if (!cancelled) console.error('Unable to load shelf scene.', error);
    });
    return () => { cancelled = true; };
  }, [mounted]);

  return (
    <div
      ref={hostRef}
      className={`threeui-background ashen-press${className ? ` ${className}` : ""}`}
      role="group"
      aria-label="Interactive agricultural drone product guide shelf"
      data-state={!mounted || (ready && scenePaused) ? "paused" : ready ? "ready" : "loading"}
      style={{
        position: "relative",
        overflow: "hidden",
        background: "#c6ae8e",
        pointerEvents: "auto",
        ...style,
      }}
    >
      {mounted && source ? (
        <iframe
          ref={frameRef}
          title="Agro Drone Tech — Product Shelf"
          srcDoc={source}
          sandbox="allow-scripts"
          loading="eager"
          onLoad={() => {
            setReady(true);
            frameRef.current?.contentWindow?.postMessage({ type: 'agro-scene-motion', paused: scenePaused }, '*');
          }}
          style={{
            position: "absolute",
            inset: 0,
            display: "block",
            width: "100%",
            height: "100%",
            border: 0,
            background: "#c6ae8e",
            opacity: ready ? 1 : 0,
            pointerEvents: ready ? "auto" : "none",
            transition: "opacity 240ms ease-out",
          }}
        />
      ) : null}
    </div>
  );
}
