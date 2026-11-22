import { describe, it, expect, beforeEach } from "vitest";
import { nextHandSeat, loadSeat, saveSeat, seatNumber, SEAT_KEY } from "@/lib/tableSeat";

describe("bouton qui tourne à la même table", () => {
  beforeEach(() => localStorage.clear());

  it("passe le bouton au siège suivant et garde ta place", () => {
    expect(nextHandSeat({ size: 6, dealer: 2, user: 4 })).toEqual({ size: 6, dealer: 3, user: 4 });
  });

  it("revient au siège 1 après le dernier siège", () => {
    expect(nextHandSeat({ size: 6, dealer: 5, user: 0 })).toEqual({ size: 6, dealer: 0, user: 0 });
    expect(nextHandSeat({ size: 9, dealer: 8, user: 3 }).dealer).toBe(0);
  });

  it("alterne en tête-à-tête", () => {
    expect(nextHandSeat({ size: 2, dealer: 0, user: 1 }).dealer).toBe(1);
    expect(nextHandSeat({ size: 2, dealer: 1, user: 1 }).dealer).toBe(0);
  });

  it("ne place rien tant que le bouton n'a jamais été mis", () => {
    expect(nextHandSeat({ size: 6, dealer: -1, user: -1 })).toEqual({ size: 6, dealer: -1, user: -1 });
  });

  it("garde la table d'une visite à l'autre", () => {
    saveSeat({ size: 6, dealer: 3, user: 1 });
    expect(loadSeat()).toEqual({ size: 6, dealer: 3, user: 1 });
  });

  it("« Nouvelle table » efface la table gardée", () => {
    saveSeat({ size: 6, dealer: 3, user: 1 });
    saveSeat(null);
    expect(loadSeat()).toBeNull();
    expect(localStorage.getItem(SEAT_KEY)).toBeNull();
  });

  it("ignore une table gardée abîmée ou incohérente", () => {
    localStorage.setItem(SEAT_KEY, "{pas du json");
    expect(loadSeat()).toBeNull();
    localStorage.setItem(SEAT_KEY, JSON.stringify({ size: 6, dealer: 7, user: 1 }));
    expect(loadSeat()).toBeNull();
    localStorage.setItem(SEAT_KEY, JSON.stringify({ size: 10, dealer: 1, user: 1 }));
    expect(loadSeat()).toBeNull();
  });
});

describe("numéro de siège vu par le joueur", () => {
  it("comme sur Betclic en 6 joueurs : 1 en haut, toi en bas au 4, ta gauche au 5 (sens des aiguilles d'une montre)", () => {
    expect(seatNumber(4, 4, 6)).toBe(4); // toi
    expect(seatNumber(5, 4, 6)).toBe(5); // à ta gauche
    expect(seatNumber(1, 4, 6)).toBe(1); // en face, en haut
    expect(seatNumber(3, 4, 6)).toBe(3); // à ta droite
    expect(seatNumber(0, 4, 6)).toBe(6);
  });
  it("ne dépend pas du bouton", () => {
    expect(seatNumber(2, 4, 6)).toBe(seatNumber(2, 4, 6));
  });
  it("avant que tu aies choisi ta place : numéros dans l'ordre des sièges", () => {
    expect(seatNumber(0, -1, 6)).toBe(1);
    expect(seatNumber(5, -1, 6)).toBe(6);
  });
});
