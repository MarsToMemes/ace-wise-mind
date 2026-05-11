// Range Polarization Assessor — derives hero/villain range shape + advantage
// from position, board texture, hand strength, draws, and bet sizing.
// Pure functions, no side effects.

export type RangeShape = "POLARIZED" | "CONDENSED" | "MERGED" | "CAPPED" | "LINEAR";
export type NutAdvantage = "HERO" | "VILLAIN" | "NEUTRAL";
export type Texture = "Dry" | "Wet" | "Dynamic" | "Paired" | string;
export type HandCategory = "Strong" | "Medium" | "Weak" | "Draw" | string;
export type Street = "Preflop" | "Flop" | "Turn" | "River";

export interface PolarizationInput {
  position: string;              // UTG, MP, HJ, CO, BTN, SB, BB
  street: Street;
  texture: Texture;
  handCategory: HandCategory;    // from classifyHandStrength
  equityPct: number;             // hero equity vs opp range
  heroRA: number;                // 0-100 — hero range advantage (positional)
  villainRA: number;             // 0-100 — villain range advantage
  opponents: number;
  heroIsAggressor: boolean;      // last raiser preflop
  facingBet: boolean;
  betSizePctOfPot?: number;      // sizing villain just used (or hero is considering)
}

export interface SizingRecommendation {
  action: "BET" | "CHECK";
  fractionOfPot: number;         // 0.25 / 0.33 / 0.5 / 0.66 / 0.75 / 1.0 / 1.5
  label: string;
  rationale: string;
  theory: string;
}

export interface PolarizationResult {
  heroShape: RangeShape;
  villainShape: RangeShape;
  nutAdvantage: NutAdvantage;
  heroRangeAdvantage: number;    // 0-100, refined
  villainRangeAdvantage: number; // 0-100, refined
  sizing: SizingRecommendation;
  balanceNote: string;
  informationHiding: string;
  reasoning: string[];
}

const IP_POS = new Set(["BTN", "CO", "HJ"]);

export function assessPolarization(inp: PolarizationInput): PolarizationResult {
  const ip = IP_POS.has(inp.position.toUpperCase());
  const reasoning: string[] = [];

  // ---------- Hero range shape ----------
  let heroShape: RangeShape = "MERGED";
  if (inp.street === "Preflop") {
    heroShape = inp.heroIsAggressor ? "LINEAR" : "CAPPED";
  } else if (inp.handCategory === "Strong") {
    heroShape = "POLARIZED"; // strong + bluffs in betting range
  } else if (inp.handCategory === "Medium") {
    heroShape = "MERGED";
  } else if (inp.handCategory === "Weak") {
    heroShape = inp.heroIsAggressor ? "CAPPED" : "CONDENSED";
  } else if (inp.handCategory === "Draw") {
    heroShape = "POLARIZED"; // semi-bluff candidate
  }

  reasoning.push(`Hero range: ${heroShape} (${inp.handCategory} on ${inp.street}${inp.heroIsAggressor ? ", aggressor" : ""}).`);

  // ---------- Villain range shape ----------
  let villainShape: RangeShape = "MERGED";
  if (inp.facingBet) {
    const s = inp.betSizePctOfPot ?? 66;
    if (s >= 90) villainShape = "POLARIZED";       // big bet = nuts or bluff
    else if (s >= 50) villainShape = "MERGED";
    else villainShape = "CONDENSED";               // small bet = medium strength
  } else {
    villainShape = inp.heroIsAggressor ? "CAPPED" : "MERGED";
  }
  reasoning.push(`Villain range: ${villainShape}${inp.facingBet ? ` (bet ${(inp.betSizePctOfPot ?? 66).toFixed(0)}% pot)` : " (no bet)"}.`);

  // ---------- Range advantage refinement ----------
  // Start from positional priors (heroRA / villainRA from engine), then adjust
  // by texture + position + aggressor.
  let heroAdv = clamp(inp.heroRA, 0, 100);
  let vilAdv = clamp(inp.villainRA, 0, 100);

  // Texture modifier — dry favors preflop aggressor, wet flattens advantage,
  // paired favors aggressor (nut advantage).
  const tex = String(inp.texture).toLowerCase();
  if (tex.includes("dry") || tex.includes("paired")) {
    if (inp.heroIsAggressor) { heroAdv += 8; vilAdv -= 5; }
    else { vilAdv += 6; heroAdv -= 4; }
    reasoning.push("Dry/paired texture amplifies aggressor's range advantage.");
  } else if (tex.includes("wet") || tex.includes("dynamic")) {
    heroAdv -= 4; vilAdv += 4;
    reasoning.push("Wet/dynamic board narrows aggressor's edge — caller hits more two-pairs/sets.");
  }

  // Position bonus — IP gets +3 implicit equity realization
  if (ip) { heroAdv += 3; } else { heroAdv -= 3; }

  // Multiway — squeezes hero's range advantage
  if (inp.opponents >= 3) {
    heroAdv -= 5; vilAdv += 3;
    reasoning.push("Multiway pot compresses hero's range advantage.");
  }

  // Normalize so the two scores roughly sum to ~100 (range advantage is relative)
  heroAdv = clamp(heroAdv, 0, 100);
  vilAdv = clamp(vilAdv, 0, 100);
  const sum = heroAdv + vilAdv;
  if (sum > 0) {
    heroAdv = (heroAdv / sum) * 100;
    vilAdv = (vilAdv / sum) * 100;
  } else {
    heroAdv = 50; vilAdv = 50;
  }

  // ---------- Nut advantage ----------
  let nutAdvantage: NutAdvantage = "NEUTRAL";
  const diff = heroAdv - vilAdv;
  if (diff > 10) nutAdvantage = "HERO";
  else if (diff < -10) nutAdvantage = "VILLAIN";

  // ---------- Sizing recommendation ----------
  const sizing = recommendSizing(heroShape, villainShape, nutAdvantage, ip, inp);
  reasoning.push(sizing.rationale);

  // ---------- Balance / info hiding ----------
  const s = sizing.fractionOfPot;
  const alpha = s / (1 + s);
  const bluffsPct = Math.round(alpha * 100);
  const balanceNote = sizing.action === "BET"
    ? `At ${(s * 100).toFixed(0)}% pot, include ~${bluffsPct}% bluffs in this betting range (α = ${(alpha * 100).toFixed(0)}%) to remain unexploitable.`
    : "No bet — no balancing required this street.";

  const informationHiding = sizing.action === "BET"
    ? heroShape === "POLARIZED"
      ? "Mix at least some trash hands into the large-bet range, or villain can fold-exploit you when you size up."
      : "Keep this sizing consistent across both strong and weak hands in the bucket — otherwise sizing tells leak info."
    : "Checking back protects your capped range from being raised off equity.";

  return {
    heroShape,
    villainShape,
    nutAdvantage,
    heroRangeAdvantage: Math.round(heroAdv),
    villainRangeAdvantage: Math.round(vilAdv),
    sizing,
    balanceNote,
    informationHiding,
    reasoning,
  };
}

function recommendSizing(
  heroShape: RangeShape,
  villainShape: RangeShape,
  nut: NutAdvantage,
  ip: boolean,
  inp: PolarizationInput,
): SizingRecommendation {
  // POLARIZED + nut advantage → large bet
  if (heroShape === "POLARIZED" && nut === "HERO") {
    const frac = ip ? 0.75 : 1.0;
    return {
      action: "BET",
      fractionOfPot: frac,
      label: ip ? "Bet 75% pot" : "Bet pot",
      rationale: "Polarized range with nut advantage → large sizing extracts max from villain's bluff-catchers.",
      theory: "Villain's condensed range cannot raise without committing to a range you beat heavily. Indifference threshold requires this sizing.",
    };
  }

  // CONDENSED hero vs POLARIZED villain → check
  if (heroShape === "CONDENSED" && villainShape === "POLARIZED") {
    return {
      action: "CHECK",
      fractionOfPot: 0,
      label: "Check",
      rationale: "Condensed hero range vs polarized villain → checking dominates betting.",
      theory: "Betting large with medium-strength hands is dominated by villain's check-raise with his polarized range.",
    };
  }

  // CAPPED hero → small or check
  if (heroShape === "CAPPED") {
    if (ip) {
      return {
        action: "BET",
        fractionOfPot: 0.33,
        label: "Bet 33% pot",
        rationale: "Capped range → small sizing only. Realize equity, deny villain free cards.",
        theory: "Large bets with a capped range are exploitable by check-raise — villain can blow you off equity.",
      };
    }
    return {
      action: "CHECK",
      fractionOfPot: 0,
      label: "Check",
      rationale: "Capped range OOP → check to control pot, avoid bloating with no nut potential.",
      theory: "OOP + capped + betting = giving villain an easy raise-or-call decision in his favor.",
    };
  }

  // MERGED → small bet IP, check OOP
  if (heroShape === "MERGED") {
    if (ip) {
      return {
        action: "BET",
        fractionOfPot: 0.33,
        label: "Bet 33% pot",
        rationale: "Merged range → small sizing realizes equity without committing the pot.",
        theory: "Large bets with merged ranges fold worse hands and get raised by better — small sizing avoids both leaks.",
      };
    }
    return {
      action: "CHECK",
      fractionOfPot: 0,
      label: "Check",
      rationale: "Merged range OOP → check and let villain define the pot.",
      theory: "Donk-leading with medium hands OOP is dominated long-term.",
    };
  }

  // LINEAR (value-skewed) → standard sizing
  if (heroShape === "LINEAR") {
    return {
      action: "BET",
      fractionOfPot: 0.66,
      label: "Bet 2/3 pot",
      rationale: "Linear range (value-skewed) → standard sizing for value with thin bluff frequency.",
      theory: "Linear ranges include few pure bluffs — large overbets lose calls from villain's middling holdings.",
    };
  }

  // POLARIZED no nut advantage
  if (heroShape === "POLARIZED") {
    return {
      action: "BET",
      fractionOfPot: 0.5,
      label: "Bet 50% pot",
      rationale: "Polarized range but no nut advantage → moderate sizing, balance heavy bluff frequency.",
      theory: "Without nut advantage, large bets get called too thin and raised by villain's better polarized range.",
    };
  }

  return {
    action: "CHECK",
    fractionOfPot: 0,
    label: "Check",
    rationale: "Default: check and gather information.",
    theory: "When no shape-advantage applies, controlling the pot dominates committing chips.",
  };
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}
