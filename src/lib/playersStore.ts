// Fiches joueurs, gardées dans le navigateur (localStorage), jamais dans le code.
import { Counters, emptyCounters, addCounters } from "@/engines/playerStats";

export interface ShownHand { cards: string; line: string; date: string }

export interface PlayerFile {
  id: string;
  name: string;
  room: string;
  note: string;
  counters: Counters;
  shown: ShownHand[];
  createdAt: string;
  updatedAt: string;
}

const KEY = "ace:players:v1";
const TABLE_KEY = "ace:myTable:v1";
const SEATS_KEY = "ace:seatPlayers:v1";
export const PLAYERS_EVENT = "ace:players";

function read<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
    window.dispatchEvent(new Event(PLAYERS_EVENT));
  } catch {
    /* stockage indisponible */
  }
}

export function loadPlayers(): Record<string, PlayerFile> {
  const v = read<Record<string, PlayerFile>>(KEY, {});
  // compléter les fiches anciennes ou importées
  for (const p of Object.values(v)) p.counters = { ...emptyCounters(), ...p.counters };
  return v;
}

const savePlayers = (all: Record<string, PlayerFile>) => write(KEY, all);

const newId = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();

/** Retrouve un joueur par pseudo (insensible à la casse) ou le crée. */
export function upsertPlayer(name: string, room = "Betclic"): PlayerFile {
  const all = loadPlayers();
  const clean = name.trim().slice(0, 40);
  const found = Object.values(all).find(p => p.name.toLowerCase() === clean.toLowerCase());
  if (found) return found;
  const p: PlayerFile = { id: newId(), name: clean, room, note: "", counters: emptyCounters(), shown: [], createdAt: now(), updatedAt: now() };
  all[p.id] = p;
  savePlayers(all);
  return p;
}

export function updatePlayer(id: string, patch: Partial<Pick<PlayerFile, "name" | "room" | "note">>) {
  const all = loadPlayers();
  if (!all[id]) return;
  all[id] = { ...all[id], ...patch, updatedAt: now() };
  savePlayers(all);
}

export function addStats(id: string, delta: Partial<Counters>) {
  const all = loadPlayers();
  if (!all[id]) return;
  all[id] = { ...all[id], counters: addCounters(all[id].counters, delta), updatedAt: now() };
  savePlayers(all);
}

/** Ajoute en une fois les stats de plusieurs joueurs (une main analysée). */
export function addStatsMany(deltas: Record<string, Partial<Counters>>) {
  const all = loadPlayers();
  for (const [id, d] of Object.entries(deltas)) {
    if (all[id]) all[id] = { ...all[id], counters: addCounters(all[id].counters, d), updatedAt: now() };
  }
  savePlayers(all);
}

export function addShownHand(id: string, cards: string, line: string) {
  const all = loadPlayers();
  if (!all[id]) return;
  const shown = [{ cards: cards.trim().slice(0, 20), line: line.trim().slice(0, 200), date: now() }, ...all[id].shown].slice(0, 50);
  all[id] = { ...all[id], shown, updatedAt: now() };
  savePlayers(all);
}

export function deletePlayer(id: string) {
  const all = loadPlayers();
  delete all[id];
  savePlayers(all);
  setMyTable(getMyTable().filter(x => x !== id));
}

// --- « Ma table » : joueurs suivis en ce moment
export const getMyTable = (): string[] => read<string[]>(TABLE_KEY, []);
export const setMyTable = (ids: string[]) => write(TABLE_KEY, ids.slice(0, 9));

// --- sièges de l'analyseur associés à un joueur
export const getSeatPlayers = (): Record<number, string> => read<Record<number, string>>(SEATS_KEY, {});
export const setSeatPlayers = (m: Record<number, string>) => write(SEATS_KEY, m);

/** Retire un joueur de « Ma table » et de son siège (sa fiche reste). */
export function removeFromTable(id: string) {
  setMyTable(getMyTable().filter(x => x !== id));
  const seats = getSeatPlayers();
  for (const k of Object.keys(seats)) if (seats[+k] === id) delete seats[+k];
  setSeatPlayers(seats);
}

/** Nouvelle table : vide « Ma table » et efface les pseudos des sièges. Les fiches et leurs stats restent. */
export function clearTable() {
  setMyTable([]);
  setSeatPlayers({});
}

// --- export / import
export function exportPlayers(): string {
  return JSON.stringify({ format: "ace-players", version: 1, players: loadPlayers() }, null, 2);
}

/** Fusionne un export : les joueurs déjà connus (même pseudo) voient leurs stats additionnées. */
export function importPlayers(json: string): number {
  try {
    const data = JSON.parse(json);
    const incoming = data?.players;
    if (!incoming || typeof incoming !== "object") return 0;
    const all = loadPlayers();
    let n = 0;
    for (const p of Object.values(incoming) as PlayerFile[]) {
      if (!p || typeof p.name !== "string" || !p.name.trim()) continue;
      const counters = { ...emptyCounters(), ...(p.counters || {}) };
      for (const k of Object.keys(counters) as (keyof Counters)[]) counters[k] = Math.max(0, Number(counters[k]) || 0);
      const existing = Object.values(all).find(x => x.name.toLowerCase() === p.name.trim().toLowerCase());
      if (existing) {
        all[existing.id] = { ...existing, counters: addCounters(existing.counters, counters), shown: [...(p.shown || []), ...existing.shown].slice(0, 50), updatedAt: now() };
      } else {
        const id = newId();
        all[id] = {
          id, name: p.name.trim().slice(0, 40), room: String(p.room || "Betclic").slice(0, 30), note: String(p.note || "").slice(0, 2000),
          counters, shown: Array.isArray(p.shown) ? p.shown.slice(0, 50) : [], createdAt: now(), updatedAt: now(),
        };
      }
      n++;
    }
    savePlayers(all);
    return n;
  } catch {
    return 0;
  }
}
