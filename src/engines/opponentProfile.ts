// Opponent profiles and strategic adjustments.

export type OpponentProfile = "station" | "nit" | "lag" | "tag" | "unknown";

export interface ProfileGuide {
  label: string;
  bluffOK: boolean;
  valueSize: "thin" | "standard" | "overbet";
  threeBetFreq: "low" | "standard" | "high";
  stealFreq: "low" | "standard" | "high";
  showdownRequired: "rarely" | "sometimes" | "often";
  fearEquityWorks: boolean;
  exploit: string;
}

export const PROFILES: Record<OpponentProfile, ProfileGuide> = {
  station: {
    label: "Calling Station",
    bluffOK: false,
    valueSize: "overbet",
    threeBetFreq: "low",
    stealFreq: "low",
    showdownRequired: "often",
    fearEquityWorks: false,
    exploit: "Value bet thin, no bluffs, overbet strong hands, three streets of value with TPGK.",
  },
  nit: {
    label: "Tight-Passive (Nit)",
    bluffOK: true,
    valueSize: "standard",
    threeBetFreq: "high",
    stealFreq: "high",
    showdownRequired: "rarely",
    fearEquityWorks: true,
    exploit: "Steal blinds relentlessly, c-bet dry boards, 3-bet steal. Their raises = strong.",
  },
  lag: {
    label: "Loose-Aggressive (LAG)",
    bluffOK: false,
    valueSize: "standard",
    threeBetFreq: "low",
    stealFreq: "standard",
    showdownRequired: "often",
    fearEquityWorks: false,
    exploit: "Trap with strong hands, call down with medium strength, avoid OOP marginal spots.",
  },
  tag: {
    label: "Aggressive Regular (TAG)",
    bluffOK: true,
    valueSize: "standard",
    threeBetFreq: "standard",
    stealFreq: "standard",
    showdownRequired: "sometimes",
    fearEquityWorks: true,
    exploit: "3-bet/fold or 3-bet/call, fight for pots in position, well-timed bluffs only.",
  },
  unknown: {
    label: "Unknown / Default",
    bluffOK: true,
    valueSize: "standard",
    threeBetFreq: "standard",
    stealFreq: "standard",
    showdownRequired: "sometimes",
    fearEquityWorks: true,
    exploit: "Use position-standard ranges. Update profile after 10+ hands.",
  },
};
