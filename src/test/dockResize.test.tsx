import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ResizableDock, DOCK_KEY, dockLimits } from "@/components/ResizableDock";

// jsdom n'a pas PointerEvent : sans lui, clientY se perd. Équivalent minimal fondé sur MouseEvent.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventStub extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventStub;
}

// jsdom : fenêtre de 768 px de haut → bornes 96 px … 85 % (653 px), 36 % par défaut (276 px)
const body = () => screen.getByTestId("dock-body");
const handle = () => screen.getByRole("separator", { name: /hauteur du panneau/i });
const px = () => parseInt(body().style.height, 10);

describe("panneau de décision étirable", () => {
  beforeEach(() => localStorage.clear());

  it("démarre à la hauteur par défaut", () => {
    render(<ResizableDock>contenu</ResizableDock>);
    expect(px()).toBe(dockLimits().def);
    expect(handle()).toHaveAttribute("aria-valuenow", String(dockLimits().def));
  });

  it("s'agrandit quand on tire la poignée vers le haut, et garde la hauteur", () => {
    render(<ResizableDock>contenu</ResizableDock>);
    const start = px();
    fireEvent.pointerDown(handle(), { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientY: 400, pointerId: 1 });
    fireEvent.pointerUp(handle(), { clientY: 400, pointerId: 1 });
    expect(px()).toBe(start + 100);
    expect(localStorage.getItem(DOCK_KEY)).toBe(String(start + 100));
  });

  it("rétrécit vers le bas sans descendre sous le minimum", () => {
    render(<ResizableDock>contenu</ResizableDock>);
    fireEvent.pointerDown(handle(), { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientY: 760, pointerId: 1 });
    fireEvent.pointerUp(handle(), { clientY: 760, pointerId: 1 });
    expect(px()).toBe(dockLimits().min);
  });

  it("ne dépasse pas 85 % de l'écran", () => {
    render(<ResizableDock>contenu</ResizableDock>);
    fireEvent.pointerDown(handle(), { clientY: 700, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(handle(), { clientY: 0, pointerId: 1 });
    expect(px()).toBe(dockLimits().max);
  });

  it("se règle au clavier avec les flèches", () => {
    render(<ResizableDock>contenu</ResizableDock>);
    const start = px();
    fireEvent.keyDown(handle(), { key: "ArrowUp" });
    expect(px()).toBe(start + 24);
    fireEvent.keyDown(handle(), { key: "ArrowDown" });
    fireEvent.keyDown(handle(), { key: "ArrowDown" });
    expect(px()).toBe(start - 24);
  });

  it("reprend la hauteur enregistrée, et revient au défaut au double-clic", () => {
    localStorage.setItem(DOCK_KEY, "420");
    render(<ResizableDock>contenu</ResizableDock>);
    expect(px()).toBe(420);
    fireEvent.doubleClick(handle());
    expect(px()).toBe(dockLimits().def);
    expect(localStorage.getItem(DOCK_KEY)).toBeNull();
  });

  it("suit la taille par défaut de l'écran tant qu'on ne l'a pas réglée soi-même", () => {
    const vh = window.innerHeight;
    try {
      window.innerHeight = 200; // page chargée dans une fenêtre minuscule
      render(<ResizableDock>contenu</ResizableDock>);
      expect(px()).toBe(dockLimits().min);
      window.innerHeight = vh;
      act(() => { window.dispatchEvent(new Event("resize")); });
      expect(px()).toBe(dockLimits().def);
    } finally { window.innerHeight = vh; }
  });

  it("garde la taille choisie quand l'écran change, dans les bornes", () => {
    localStorage.setItem(DOCK_KEY, "500");
    const vh = window.innerHeight;
    try {
      render(<ResizableDock>contenu</ResizableDock>);
      window.innerHeight = 400;
      act(() => { window.dispatchEvent(new Event("resize")); });
      expect(px()).toBe(340); // 85 % de 400
    } finally { window.innerHeight = vh; }
  });

  it("prévient le parent de la hauteur (pour la marge en bas de page)", () => {
    let seen = 0;
    render(<ResizableDock onHeight={h => { seen = h; }}>contenu</ResizableDock>);
    fireEvent.keyDown(handle(), { key: "ArrowUp" });
    expect(seen).toBe(dockLimits().def + 24);
  });
});
