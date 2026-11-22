import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

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
      <div data-testid="dock-body" style={{ height }} className="overflow-y-auto rounded-2xl">
        {children}
      </div>
    </>
  );
}
