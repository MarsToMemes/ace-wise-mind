import { ShieldAlert } from "lucide-react";

export function FooterDisclaimer() {
  return (
    <footer className="border-t border-border/40 mt-12 bg-background/40">
      <div className="container py-6 space-y-3">
        <div className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed max-w-4xl">
          <ShieldAlert className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
          <p>
            <span className="text-foreground font-semibold">Ace Analyst est un outil d'apprentissage.</span>{" "}
            Les calculs sont basés sur des principes GTO et exploitatifs généraux. Pour des analyses de
            spots complexes ou des décisions critiques, utilisez un solver dédié{" "}
            <span className="text-foreground">(PioSOLVER, GTO Wizard)</span> ou un calculateur ICM{" "}
            <span className="text-foreground">(HoldemResources Calculator, ICMIZER)</span>.
          </p>
        </div>
        <div className="flex gap-4 text-[11px] text-muted-foreground">
          <a href="/glossaire" className="hover:text-primary transition-colors">Glossaire</a>
          <span>·</span>
          <span>© {new Date().getFullYear()} Ace Analyst</span>
        </div>
      </div>
    </footer>
  );
}
