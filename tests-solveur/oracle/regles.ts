// A1 — Arbitre indépendant des règles du no-limit hold'em. Il ne réutilise AUCUN code du site (rien de src/) : il sert
// de référence au banc de test. Montants en centièmes de bb (entiers) pour éviter toute erreur d'arrondi.
//
// Règles retenues (écrites ici pour être relues) :
// - blindes et ante postées avant la première action ; l'ante est de l'argent mort (elle ne compte pas dans la mise de
//   la street) mais elle compte pour les pots annexes ; un joueur trop court poste ce qu'il a et est à tapis ;
// - montant à suivre au préflop : la grosse blinde ENTIÈRE, même si la BB est à tapis pour moins (règle TDA) ;
// - ordre de parole : préflop après la BB (en tête-à-tête, le bouton = SB parle en premier), après le flop le premier
//   joueur actif à gauche du bouton (en tête-à-tête, la BB) ;
// - relance minimale : la mise en cours + la plus grande relance complète de la street (au départ : 1 bb) ;
//   mise minimale après le flop : 1 bb ; un tapis plus petit est toujours permis ;
// - un tapis qui relance de moins qu'une relance complète ne rouvre pas les enchères : ceux qui avaient déjà parlé
//   depuis la dernière relance complète peuvent seulement payer ou se coucher ;
// - pas de relance quand tous les autres joueurs encore dans le coup sont à tapis (il n'y a personne pour payer) ;
// - se coucher est toujours permis ; check seulement sans rien à payer ; call = min(à payer, tapis restant) ;
// - la street se termine quand chaque joueur encore actif (ni couché ni à tapis) a parlé depuis la dernière relance et
//   a égalisé la mise ; la main se termine quand il ne reste qu'un joueur, ou après la river, ou quand au plus un
//   joueur peut encore miser (cartes tirées jusqu'à la river) ;
// - pots : par niveaux de contribution totale ; un joueur couché laisse son argent mais ne peut rien gagner ; la part
//   d'une mise que personne n'a pu payer revient à son auteur ;
// - abattage : chaque pot va à la meilleure main parmi ses ayants droit, partage exact en cas d'égalité.

export type Kind = "fold" | "check" | "call" | "bet" | "raise";
export interface Act { seat: number; kind: Kind; /** bet/raise : montant « à » sur la street, en centièmes */ to?: number }
export interface Legal {
  fold: boolean; check: boolean; call: number;
  bet: { min: number; max: number } | null;
  raise: { minTo: number; maxTo: number } | null;
}
export interface Seat { start: number; stack: number; street: number; total: number; folded: boolean; allIn: boolean }
export interface PotO { amount: number; eligible: number[]; refund: boolean }
export interface Config { n: number; dealer: number; stacks: number[]; sb?: number; bb?: number; ante?: number }

export const STREETS = ["Preflop", "Flop", "Turn", "River"] as const;
export type StreetName = typeof STREETS[number];
export const c = (bb: number) => Math.round(bb * 100);
export const bbOf = (cents: number) => cents / 100;

export class Table {
  readonly n: number; readonly dealer: number; readonly sbSeat: number; readonly bbSeat: number;
  readonly sb: number; readonly bb: number; readonly ante: number;
  seats: Seat[];
  street = 0;
  currentBet = 0;
  lastRaise: number;
  toAct = -1;
  history: Act[] = [];
  /** Joueurs qui ont parlé depuis la dernière relance complète, et la mise qu'ils avaient alors devant eux. */
  private actedAt = new Map<number, number>();
  /** Joueurs qui ont parlé depuis la dernière relance (complète ou non). */
  private actedSinceBet = new Set<number>();

  constructor(cfg: Config) {
    this.n = cfg.n; this.dealer = cfg.dealer;
    this.sb = c(cfg.sb ?? 0.5); this.bb = c(cfg.bb ?? 1); this.ante = c(cfg.ante ?? 0);
    this.sbSeat = this.n === 2 ? this.dealer : (this.dealer + 1) % this.n;
    this.bbSeat = this.n === 2 ? (this.dealer + 1) % this.n : (this.dealer + 2) % this.n;
    this.seats = cfg.stacks.map(s => ({ start: c(s), stack: c(s), street: 0, total: 0, folded: false, allIn: false }));
    this.lastRaise = this.bb;
    if (this.ante > 0) this.seats.forEach((_, i) => this.post(i, this.ante, false));
    this.post(this.sbSeat, this.sb, true);
    this.post(this.bbSeat, this.bb, true);
    this.currentBet = this.bb;             // règle TDA : on suit la grosse blinde entière
    this.toAct = this.findNext(this.n === 2 ? this.dealer : (this.bbSeat + 1) % this.n);
  }

  private post(i: number, amount: number, street: boolean) {
    const s = this.seats[i], a = Math.min(amount, s.stack);
    s.stack -= a; s.total += a; if (street) s.street += a;
    if (s.stack === 0) s.allIn = true;
  }

  get pot() { return this.seats.reduce((t, s) => t + s.total, 0); }
  live() { return this.seats.map((s, i) => i).filter(i => !this.seats[i].folded); }
  canBet() { return this.live().filter(i => !this.seats[i].allIn); }
  toCallOf(i: number) { return Math.max(0, this.currentBet - this.seats[i].street); }

  /** Le joueur i doit-il encore parler sur cette street ? */
  private needs(i: number) {
    const s = this.seats[i];
    if (s.folded || s.allIn) return false;
    return !this.actedSinceBet.has(i) || s.street < this.currentBet;
  }

  private findNext(from: number): number {
    if (this.live().length <= 1) return -1;
    const can = this.canBet();
    if (can.length === 0) return -1;
    // un seul joueur peut encore miser : il ne parle que s'il doit égaliser
    if (can.length === 1 && this.seats[can[0]].street >= this.currentBet) return -1;
    for (let k = 0; k < this.n; k++) {
      const i = (from + k) % this.n;
      if (this.needs(i)) return i;
    }
    return -1;
  }

  legal(i = this.toAct): Legal | null {
    if (i < 0 || i !== this.toAct) return null;
    const s = this.seats[i];
    const toCall = this.toCallOf(i);
    const maxTo = s.street + s.stack;
    const othersCanPay = this.canBet().some(j => j !== i);
    // rouvert : pas encore parlé depuis la dernière relance complète, ou une relance complète depuis sa dernière action
    const reopened = !this.actedAt.has(i) || this.currentBet - (this.actedAt.get(i) ?? 0) >= this.lastRaise;
    const L: Legal = { fold: true, check: toCall === 0, call: toCall > 0 ? Math.min(toCall, s.stack) : 0, bet: null, raise: null };
    if (othersCanPay && s.stack > toCall) {
      if (this.currentBet === 0) L.bet = { min: Math.min(this.bb, s.stack), max: s.stack };
      else if (reopened) L.raise = { minTo: Math.min(this.currentBet + this.lastRaise, maxTo), maxTo };
    }
    return L;
  }

  /** Applique une action ; renvoie la raison du refus si elle est illégale (l'état ne change pas). */
  apply(a: Act): string | null {
    if (a.seat !== this.toAct) return `ce n'est pas au siège ${a.seat} de parler (siège ${this.toAct})`;
    const L = this.legal()!;
    const s = this.seats[a.seat];
    if (a.kind === "fold") { s.folded = true; }
    else if (a.kind === "check") { if (!L.check) return "check face à une mise"; }
    else if (a.kind === "call") {
      if (L.call <= 0) return "call sans rien à payer";
      this.post(a.seat, L.call, true);
    } else {
      const to = a.to ?? -1;
      if (a.kind === "bet") {
        if (!L.bet) return this.currentBet > 0 ? "mise alors qu'il faut relancer" : "mise impossible";
        if (to > L.bet.max) return "mise au-delà du tapis";
        if (to < L.bet.min) return `mise sous le minimum (${bbOf(L.bet.min)} bb)`;
      } else {
        if (!L.raise) return this.currentBet === 0 ? "relance sans mise" : "relance non permise (enchères non rouvertes ou personne pour payer)";
        if (to > L.raise.maxTo) return "relance au-delà du tapis";
        if (to < L.raise.minTo) return `relance sous le minimum (${bbOf(L.raise.minTo)} bb)`;
      }
      const prevBet = this.currentBet;
      this.post(a.seat, to - s.street, true);
      const size = s.street - prevBet;
      const full = prevBet === 0 ? size >= this.bb : size >= this.lastRaise;
      if (full) {
        // mise ou relance complète : nouvelle taille de relance, enchères rouvertes pour tous
        this.lastRaise = size;
        this.actedAt = new Map();
      }
      this.currentBet = Math.max(prevBet, s.street);
      this.actedSinceBet = new Set();
    }
    this.history.push({ ...a });
    this.actedSinceBet.add(a.seat);
    if (a.kind !== "fold") this.actedAt.set(a.seat, this.currentBet);
    this.toAct = this.findNext((a.seat + 1) % this.n);
    return null;
  }

  streetClosed() { return this.toAct < 0; }
  handOver() {
    if (this.live().length <= 1) return true;
    if (!this.streetClosed()) return false;
    return this.street === 3 || this.canBet().length <= 1;
  }

  /** Passe à la street suivante (à appeler quand la street est terminée et la main pas finie). */
  nextStreet() {
    this.street++;
    this.seats.forEach(s => { s.street = 0; });
    this.currentBet = 0; this.lastRaise = this.bb;
    this.actedAt = new Map(); this.actedSinceBet = new Set();
    this.toAct = this.findNext(this.n === 2 ? this.bbSeat : (this.dealer + 1) % this.n);
  }

  /** Pots par niveaux de contribution ; `refund` : part d'une mise que personne n'a payée. */
  pots(): PotO[] {
    const levels = [...new Set(this.seats.map(s => s.total).filter(x => x > 0))].sort((x, y) => x - y);
    const out: PotO[] = [];
    let prev = 0;
    for (const L of levels) {
      const amount = this.seats.reduce((t, s) => t + Math.min(s.total, L) - Math.min(s.total, prev), 0);
      const payers = this.seats.map((s, i) => i).filter(i => this.seats[i].total >= L);
      const eligible = payers.filter(i => !this.seats[i].folded);
      prev = L;
      if (amount === 0) continue;
      const refund = payers.length === 1;
      if (!eligible.length) { out[out.length - 1].amount += amount; continue; }   // argent mort : au pot d'avant
      const last = out[out.length - 1];
      if (last && !last.refund && !refund && last.eligible.join() === eligible.join()) last.amount += amount;
      else out.push({ amount, eligible, refund });
    }
    return out;
  }

  /** Répartition finale (centièmes, fractions exactes possibles en cas de partage). `strength` : plus grand = meilleur. */
  payouts(strength: (seat: number) => number): number[] {
    const pay = Array(this.n).fill(0);
    for (const p of this.pots()) {
      if (p.refund || p.eligible.length === 1) { pay[p.eligible[0]] += p.amount; continue; }
      const best = Math.max(...p.eligible.map(strength));
      const w = p.eligible.filter(i => strength(i) === best);
      w.forEach(i => { pay[i] += p.amount / w.length; });
    }
    return pay;
  }

  /** Ce que le joueur i peut encore perdre ou gagner contre l'adversaire le plus profond encore dans le coup. */
  effective(i: number) {
    const me = this.seats[i];
    const opps = this.live().filter(j => j !== i);
    if (!opps.length) return me.stack;
    return Math.min(me.stack, Math.max(0, ...opps.map(j => this.seats[j].stack + this.seats[j].total - me.total)));
  }

  /** Pot que le joueur i peut gagner (la part d'un adversaire qu'il ne peut pas couvrir est exclue). */
  winnable(i: number) {
    const cap = this.seats[i].total + this.seats[i].stack;
    return this.seats.reduce((t, s) => t + Math.min(s.total, cap), 0);
  }
}
