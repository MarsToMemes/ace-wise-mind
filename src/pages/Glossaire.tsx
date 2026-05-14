import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FooterDisclaimer } from "@/components/FooterDisclaimer";

interface Term {
  term: string;
  short: string;
  long?: string;
}

const TERMS: Term[] = [
  { term: "Alpha (α)", short: "Fréquence de fold minimale pour qu'un bluff soit non-rentable.", long: "α = s/(1+s) où s = bet/pot. Exemple : pour une mise pot, α = 50%." },
  { term: "Bankroll", short: "Capital total dédié au poker, indépendant des dépenses courantes." },
  { term: "Blockers", short: "Cartes en main qui bloquent les combos de la range adverse (ex : tenir l'As bloque AA).", long: "Améliorent l'EV des bluffs et réduisent la fréquence de mains fortes adverses possibles." },
  { term: "BTN (Button)", short: "Position du bouton — agit en dernier postflop, position la plus profitable." },
  { term: "BB (Big Blind)", short: "Grosse blinde — défense la plus large car bénéficie d'un prix réduit." },
  { term: "Chip EV", short: "Espérance en jetons, sans pondération ICM. Pertinent en cash, divergent en MTT." },
  { term: "CO (Cutoff)", short: "Position juste à droite du bouton, deuxième position d'attaque la plus large." },
  { term: "EV (Expected Value)", short: "Espérance de gain moyenne d'une action, exprimée en BB ou en $.", long: "EV(call) = EQ·(pot+bet) − (1−EQ)·bet" },
  { term: "Equity", short: "Probabilité brute (%) de gagner le pot à showdown contre une main ou range donnée." },
  { term: "Equity réalisée", short: "% d'équité brute effectivement convertie en gains, après ajustement pour position et playability." },
  { term: "Geometric sizing", short: "Sizings calculés pour mettre tout le stack à la river en gardant le même bet/pot ratio chaque street.", long: "R = (PF/PI)^(1/N) − 1" },
  { term: "GTO", short: "Game Theory Optimal — stratégie d'équilibre non-exploitable, dérivée par solver." },
  { term: "Half Kelly", short: "Risquer la moitié de la fraction Kelly théorique. Standard recommandé en poker à cause de la variance." },
  { term: "HJ (Hijack)", short: "Position juste à droite du CO, équivalent du MP en 6-max." },
  { term: "ICM", short: "Independent Chip Model — convertit les chips en équité monétaire selon la structure de paiements MTT/SNG." },
  { term: "Implied odds", short: "Gains supplémentaires espérés sur les streets futures si on touche notre tirage." },
  { term: "Jam (shove)", short: "Mise de la totalité du stack effectif. Stratégie dominante en MTT short-stack." },
  { term: "Kelly criterion", short: "Fraction de bankroll optimale pour maximiser la croissance long-terme : f* = (bp−q)/b." },
  { term: "MDF (Min Defense Frequency)", short: "Fréquence de défense minimale pour ne pas devenir exploitable par les bluffs : MDF = 1 − α." },
  { term: "MP (Middle Position)", short: "Position UTG+1 ou +2 selon table size. Range d'open medium-tight." },
  { term: "Multiway", short: "Pot avec 3 joueurs ou plus actifs. Les ranges se resserrent et la formule alpha à 2 joueurs ne tient plus." },
  { term: "Polarisation", short: "Range composée de mains très fortes (value) et de bluffs, sans mains medium." },
  { term: "Pot odds", short: "Ratio prix à payer / pot total après call. Détermine l'équité minimale requise pour caller." },
  { term: "Range advantage", short: "Avantage qu'une range a sur une autre sur un board donné, en équité agrégée et en nuts." },
  { term: "Reverse implied odds", short: "Pertes supplémentaires espérées quand on touche notre main mais qu'on perd quand même." },
  { term: "RFI (Raise First In)", short: "% de mains avec lesquelles on ouvre quand le pot n'a pas encore été ouvert." },
  { term: "SB (Small Blind)", short: "Petite blinde — OOP postflop, joue limp/raise mixed ou RFI." },
  { term: "SPR (Stack-to-Pot Ratio)", short: "Stack effectif divisé par le pot. Détermine l'agressivité optimale postflop." },
  { term: "Std dev (bb/100)", short: "Écart-type du winrate par 100 mains. Mesure la variance — typique 80-120 en cash NLHE." },
  { term: "UTG (Under The Gun)", short: "Première position à parler préflop, range d'open la plus tight." },
  { term: "Value bet", short: "Mise faite avec une main qui espère être payée par des mains plus faibles." },
  { term: "Variance", short: "Volatilité des résultats à court terme. Élevée au poker, justifie des bankrolls conservatives." },
  { term: "Winrate (bb/100)", short: "Gain moyen exprimé en grosses blindes par 100 mains jouées." },
  { term: "3bet", short: "Re-raise après un open. Polarisé en GTO : value premiums + bluffs avec blockers." },
  { term: "4bet", short: "Re-raise sur un 3bet. Concentre les ranges sur les premiums." },
];

const GlossairePage = () => {
  // Group by first letter
  const groups = TERMS.reduce<Record<string, Term[]>>((acc, t) => {
    const letter = t.term[0].toUpperCase().match(/[A-Z]/) ? t.term[0].toUpperCase() : "#";
    (acc[letter] ||= []).push(t);
    return acc;
  }, {});
  const letters = Object.keys(groups).sort((a, b) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)));

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/40 backdrop-blur-md bg-background/40 sticky top-0 z-20">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-primary" />
            <h1 className="display text-2xl gold-text">Glossaire</h1>
          </div>
          <Link to="/">
            <Button variant="outline" size="sm" className="gold-border">
              <ArrowLeft className="w-4 h-4 mr-2" /> Retour
            </Button>
          </Link>
        </div>
      </header>

      <main className="container py-8 flex-1">
        <p className="text-sm text-muted-foreground max-w-3xl mb-6">
          Définitions courtes des termes utilisés dans Ace Analyst. Les concepts les plus
          détaillés sont expliqués dans les panels « 📐 Comprendre ce calcul » de chaque module.
        </p>

        {/* Letter index */}
        <div className="flex flex-wrap gap-1 mb-6">
          {letters.map(l => (
            <a key={l} href={`#letter-${l}`}
              className="w-8 h-8 rounded border border-border bg-secondary/30 hover:bg-primary hover:text-primary-foreground flex items-center justify-center text-xs font-mono transition-colors">
              {l}
            </a>
          ))}
        </div>

        <div className="space-y-6">
          {letters.map(l => (
            <section key={l} id={`letter-${l}`}>
              <h2 className="display text-xl gold-text mb-3 border-b border-primary/20 pb-1">{l}</h2>
              <div className="grid md:grid-cols-2 gap-3">
                {groups[l].map(t => (
                  <Card key={t.term} className="glass-panel p-3">
                    <div className="font-semibold text-sm text-primary">{t.term}</div>
                    <div className="text-sm text-foreground/85 mt-1">{t.short}</div>
                    {t.long && <div className="text-xs text-muted-foreground mt-1.5 font-mono">{t.long}</div>}
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      <FooterDisclaimer />
    </div>
  );
};

export default GlossairePage;
