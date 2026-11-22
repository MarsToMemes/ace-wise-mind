import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

/** Hauteur du panneau de décision, gardée d'une visite à l'autre. */
export const DOCK_KEY = "ace.decisionH";
const STEP = 24;

/** Bornes en pixels : 96 px au minimum, 85 % de l'écran au maximum, 36 % par défaut. */
export function dockLimits() {
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const min = 96;
  const max = Math.max(min, Math.round(vh * 0.85));
  const def = Math.min(max, Math.max(min, Math.round(vh * 0.36)));
  return { min, max, def };
}

/** Échelle du contenu : il suit la hauteur du panneau, entre 70 % (en dessous, le panneau défile) et 125 %. */
export const ZOOM_MIN = 0.7;
export const ZOOM_MAX = 1.25;

/**
 * Plus grande échelle à laquelle le contenu tient dans `avail` pixels de haut.
 * `measure(z)` rend la hauteur affichée du contenu à l'échelle z (le texte peut se réorganiser).
 */
export function fitZoom(measure: (z: number) => number, avail: number, max = ZOOM_MAX): number {
  if (!(avail > 0)) return 1;
  if (measure(max) <= avail) return max;
  if (measure(ZOOM_MIN) > avail) return ZOOM_MIN;
  let lo = ZOOM_MIN, hi = max;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (measure(mid) <= avail) lo = mid; else hi = mid;
  }
  const z = Math.round(lo * 1000) / 1000;
  return measure(z) <= avail ? z : Math.max(ZOOM_MIN, z - 0.001);
}

/**
 * Panneau trop petit pour tout montrer, même à 70 % : on masque d'abord les détails (niveau 1),
 * puis tout sauf l'action (niveau 2). Rend le premier niveau qui tient, et son échelle.
 */
export function chooseFit(measure: (level: number, z: number) => number, avail: number, maxLevel: number): { level: number; zoom: number } {
  for (let level = 0; level <= maxLevel; level++) {
    // version réduite : jamais plus grande que 100 %, sinon le texte grossirait en rétrécissant le panneau
    const zoom = fitZoom(z => measure(level, z), avail, level === 0 ? ZOOM_MAX : 1);
    if (level === maxLevel || measure(level, zoom) <= avail) return { level, zoom };
  }
  return { level: maxLevel, zoom: ZOOM_MIN };
}

const clamp = (h: number) => {
  const { min, max } = dockLimits();
  return Math.min(max, Math.max(min, Math.round(h)));
};

/** Hauteur choisie par le joueur, ou null s'il n'a jamais réglé le panneau. */
function readSaved(): number | null {
  try {
    const raw = localStorage.getItem(DOCK_KEY);
    const v = Number(raw);
    if (raw !== null && Number.isFinite(v) && v > 0) return v;
  } catch { /* stockage indisponible */ }
  return null;
}

function save(h: number | null) {
  try {
    if (h === null) localStorage.removeItem(DOCK_KEY);
    else localStorage.setItem(DOCK_KEY, String(h));
  } catch { /* stockage indisponible */ }
}

/**
 * Contenu du panneau de décision, avec une poignée sur le bord du haut :
 * on la tire vers le haut pour agrandir, vers le bas pour réduire (souris, doigt ou flèches du clavier).
 * Double-clic sur la poignée : retour à la hauteur par défaut.
 */
export function ResizableDock({ children, onHeight }: { children: ReactNode; onHeight?: (h: number) => void }) {
  // custom : le joueur a réglé la hauteur ; sinon elle suit la taille par défaut de l'écran
  const custom = useRef(readSaved() !== null);
  const [height, setHeight] = useState(() => { const v = readSaved(); return v === null ? dockLimits().def : clamp(v); });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const live = useRef(height);
  live.current = height;

  useEffect(() => { onHeight?.(height); }, [height, onHeight]);

  // le contenu se met à l'échelle de la hauteur du panneau (sans attendre un rendu React : style posé directement)
  const fitRef = useRef<HTMLDivElement>(null);
  const refit = useCallback(() => {
    const el = fitRef.current;
    if (!el) return;
    const at = (level: number, z: number) => {
      if (level > 0) el.dataset.compact = String(level); else delete el.dataset.compact;
      el.style.setProperty("zoom", String(z));
      return el.getBoundingClientRect().height;
    };
    // sans blocs marqués « data-dock-extra », pas de niveau compact à essayer
    const maxLevel = el.querySelector("[data-dock-extra]") ? 2 : 0;
    const { level, zoom } = chooseFit(at, live.current, maxLevel);
    at(level, zoom);
  }, []);
  useLayoutEffect(refit, [height, children, refit]);
  useEffect(() => {
    const el = fitRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // le contenu change (nouvelle décision, fenêtre plus étroite) : on recalcule.
    // Pas de boucle : à taille égale, l'échelle trouvée est la même et la taille finale ne change pas.
    const ro = new ResizeObserver(() => refit());
    ro.observe(el);
    const parent = el.parentElement;
    if (parent) ro.observe(parent);
    return () => ro.disconnect();
  }, [refit]);

  // l'écran change de taille (rotation, fenêtre) : la hauteur reste dans les bornes
  useEffect(() => {
    const fit = () => setHeight(h => (custom.current ? clamp(h) : dockLimits().def));
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const set = (h: number, keep = true) => {
    const v = clamp(h);
    setHeight(v);
    if (keep) { custom.current = true; save(v); }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    drag.current = { y: e.clientY, h: live.current };
    setDragging(true);
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* navigateur sans capture */ }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setHeight(clamp(drag.current.h + (drag.current.y - e.clientY)));
  };
  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    custom.current = true;
    save(live.current);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const { min, max } = dockLimits();
    const next = { ArrowUp: height + STEP, ArrowDown: height - STEP, PageUp: height + STEP * 4, PageDown: height - STEP * 4, Home: min, End: max }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    set(next);
  };
  const { min, max } = dockLimits();

  return (
    <>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Hauteur du panneau de décision"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={height}
        tabIndex={0}
        title="Tire pour agrandir ou réduire · double-clic : taille normale"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onKeyDown}
        onDoubleClick={() => { custom.current = false; setHeight(dockLimits().def); save(null); }}
        className="group absolute inset-x-0 -top-2 z-[5] flex h-5 cursor-ns-resize touch-none select-none items-start justify-center rounded-t-2xl outline-none"
      >
        <span
          aria-hidden
          className={`mt-1 h-1.5 w-14 rounded-full transition-[background-color,width] duration-150 ease-out group-hover:w-20 group-hover:bg-primary/80 group-focus-visible:w-20 group-focus-visible:bg-primary ${dragging ? "w-20 bg-primary" : "bg-primary/45"}`}
        />
      </div>
      <div data-testid="dock-body" style={{ height }} className="flex flex-col overflow-y-auto overflow-x-hidden rounded-2xl">
        {/* my-auto : un contenu plus court que le panneau reste centré en hauteur */}
        <div ref={fitRef} data-testid="dock-fit" className="dock-fit my-auto">{children}</div>
      </div>
    </>
  );
}
