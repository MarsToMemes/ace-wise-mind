import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpen } from "lucide-react";

export interface TeachContent {
  /** A. Le concept en une phrase */
  concept: string;
  /** B. Formule expliquée — JSX libre (peut contenir <code>, listes…) */
  formula: React.ReactNode;
  /** C. Quand l'utiliser */
  whenToUse: string[];
  /** D. Quand l'éviter ou nuancer */
  whenToAvoid: string[];
}

interface Props {
  title?: string;
  content: TeachContent;
  /** id unique pour permettre "Tout déplier" via querySelector */
  id?: string;
}

/**
 * "📐 Comprendre ce calcul" — accordion pédagogique standardisé
 * Format A/B/C/D commun à tous les modules.
 */
export function TeachAccordion({ title = "Comprendre ce calcul", content, id }: Props) {
  return (
    <Accordion type="single" collapsible className="w-full" data-teach-accordion id={id}>
      <AccordionItem value="teach" className="border border-primary/20 rounded-lg bg-secondary/10 px-4">
        <AccordionTrigger className="hover:no-underline py-3">
          <div className="flex items-center gap-2 text-sm">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="display gold-text">📐 {title}</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="space-y-4 text-sm pt-2 pb-4">
          <Section title="Le concept en une phrase">
            <p className="text-foreground/90">{content.concept}</p>
          </Section>

          <Section title="La formule expliquée">
            <div className="rounded-md border border-primary/20 bg-background/60 p-3 font-mono text-xs text-foreground/95 leading-relaxed">
              {content.formula}
            </div>
          </Section>

          <Section title="Quand l'utiliser">
            <ul className="space-y-1">
              {content.whenToUse.map((it, i) => (
                <li key={i} className="flex gap-2 text-foreground/85">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Quand l'éviter ou nuancer">
            <ul className="space-y-1">
              {content.whenToAvoid.map((it, i) => (
                <li key={i} className="flex gap-2 text-foreground/85">
                  <span className="text-amber-400 mt-0.5">⚠</span>
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </Section>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <div className="text-[10px] uppercase tracking-widest text-primary font-semibold">{title}</div>
    {children}
  </div>
);
