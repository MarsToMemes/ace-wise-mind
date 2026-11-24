// Mémoire des spots qui survit au rechargement de la page (D28) : IndexedDB, disponible dans la page et dans les Web
// Workers. Les 20 derniers spots utilisés sont gardés (≈ 6 Mo chacun à 3 joueurs : état du calcul + meilleure stratégie).
// Toute erreur (navigation privée, quota, IndexedDB absent) rend la mémoire inopérante sans casser le calcul.
import type { SpotEntry } from "@/engines/multiway/spotCache";
import type { AsyncSpotStore } from "@/engines/multiway/liveSolve";

const DB = "ace-multiway", SPOTS = "spots", USED = "used";

export class IdbStore implements AsyncSpotStore {
  private db?: Promise<IDBDatabase | null>;
  constructor(readonly max = 20) {}

  private open(): Promise<IDBDatabase | null> {
    return (this.db ??= new Promise(res => {
      try {
        const rq = indexedDB.open(DB, 1);
        rq.onupgradeneeded = () => { rq.result.createObjectStore(SPOTS); rq.result.createObjectStore(USED); };
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => res(null);
      } catch { res(null); }
    }));
  }
  private tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore, u: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
    return this.open().then(db => new Promise<T | undefined>(res => {
      if (!db) return res(undefined);
      try {
        const t = db.transaction([SPOTS, USED], mode), rq = f(t.objectStore(SPOTS), t.objectStore(USED));
        t.oncomplete = () => res(rq ? rq.result : undefined);
        t.onerror = t.onabort = () => res(undefined);
      } catch { res(undefined); }
    }));
  }

  async get(key: string): Promise<SpotEntry | undefined> {
    const e = await this.tx<SpotEntry>("readonly", s => s.get(key));
    if (e) await this.tx("readwrite", (_, u) => { u.put(Date.now(), key); });
    return e;
  }

  async set(key: string, e: SpotEntry): Promise<void> {
    await this.tx("readwrite", (s, u) => { s.put(e, key); u.put(Date.now(), key); });
    // les plus anciens partent au-delà de `max`
    const keys = (await this.tx<IDBValidKey[]>("readonly", (_, u) => u.getAllKeys())) ?? [];
    if (keys.length <= this.max) return;
    const used = (await this.tx<number[]>("readonly", (_, u) => u.getAll())) ?? [];
    const old = keys.map((k, i) => ({ k, t: used[i] })).sort((a, b) => a.t - b.t).slice(0, keys.length - this.max);
    await this.tx("readwrite", (s, u) => { old.forEach(({ k }) => { s.delete(k); u.delete(k); }); });
  }
}
