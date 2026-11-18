import { describe, it, expect, beforeEach } from "vitest";
import {
  upsertPlayer, loadPlayers, addStats, addShownHand, deletePlayer, exportPlayers, importPlayers,
  getMyTable, setMyTable, getSeatPlayers, setSeatPlayers, clearTable, removeFromTable, addStats as add,
} from "@/lib/playersStore";

describe("playersStore", () => {
  beforeEach(() => localStorage.clear());

  it("creates once per pseudo (case-insensitive) and adds stats", () => {
    const a = upsertPlayer("Fishou");
    const b = upsertPlayer("fishou ");
    expect(b.id).toBe(a.id);
    addStats(a.id, { hands: 1, vpip: 1, vpipOpp: 1 });
    addStats(a.id, { hands: 1, vpipOpp: 1 });
    expect(loadPlayers()[a.id].counters).toMatchObject({ hands: 2, vpip: 1, vpipOpp: 2 });
  });

  it("keeps shown hands newest first, deletes and removes from my table", () => {
    const a = upsertPlayer("Bob");
    addShownHand(a.id, "AJo", "paie la relance turn");
    addShownHand(a.id, "72o", "bluff river");
    expect(loadPlayers()[a.id].shown[0].cards).toBe("72o");
    setMyTable([a.id]);
    deletePlayer(a.id);
    expect(loadPlayers()[a.id]).toBeUndefined();
    expect(getMyTable()).toEqual([]);
  });

  it("changing table clears seats and my table but keeps the files", () => {
    const a = upsertPlayer("Fishou"), b = upsertPlayer("Nitou");
    add(a.id, { hands: 5 });
    setMyTable([a.id, b.id]);
    setSeatPlayers({ 1: a.id, 3: b.id });
    removeFromTable(b.id);
    expect(getMyTable()).toEqual([a.id]);
    expect(getSeatPlayers()).toEqual({ 1: a.id });
    clearTable();
    expect(getMyTable()).toEqual([]);
    expect(getSeatPlayers()).toEqual({});
    expect(loadPlayers()[a.id].counters.hands).toBe(5);
  });

  it("export then import merges stats by pseudo", () => {
    const a = upsertPlayer("Nitou");
    addStats(a.id, { hands: 10, vpipOpp: 10, vpip: 1 });
    const json = exportPlayers();
    expect(importPlayers(json)).toBe(1);
    expect(loadPlayers()[a.id].counters.hands).toBe(20);
    localStorage.clear();
    expect(importPlayers(json)).toBe(1);
    expect(Object.values(loadPlayers())[0].counters.hands).toBe(10);
    expect(importPlayers("n'importe quoi")).toBe(0);
  });
});
