import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Target, Route, Users, Lightbulb, AlertTriangle } from "lucide-react";

export interface AIAnalysis {
  decision_explanation: { action: string; reasoning: string; confidence: number };
  street_strategy: { current_street_plan: string; turn_plan: string; river_plan: string };
  conditional_lines: string[];
  range_thinking: { what_you_represent: string; what_opponent_represents: string };
  key_concepts: string[];
  mistakes_to_avoid: string[];
}

export const AIPanel = ({ analysis, loading, error }: {
  analysis: AIAnalysis | null;
  loading: boolean;
  error: string | null;
}) => {
  if (error) {
    return (
      <Card className="glass-panel p-6 border-destructive/40">
        <p className="text-destructive font-semibold mb-1">AI Analysis Error</p>
        <p className="text-sm text-muted-foreground">{error}</p>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="glass-panel p-6 space-y-3">
        <div className="flex items-center gap-2 text-primary">
          <Brain className="w-5 h-5 animate-pulse" />
          <span className="display text-lg">Pro Coach is thinking…</span>
        </div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="shimmer h-4 rounded w-full" style={{ width: `${85 - i * 10}%` }} />
        ))}
      </Card>
    );
  }

  if (!analysis) return null;

  const { decision_explanation: d, street_strategy: s, range_thinking: r } = analysis;

  return (
    <div className="space-y-4">
      <Card className="glass-panel p-6 border-primary/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            <span className="text-xs uppercase tracking-widest text-muted-foreground">AI Pro Coach</span>
          </div>
          <Badge variant="outline" className="gold-border text-primary">
            {Math.round(d.confidence * 100)}% confidence
          </Badge>
        </div>
        <h3 className="display text-2xl gold-text mb-2">{d.action}</h3>
        <p className="text-sm leading-relaxed text-foreground/90">{d.reasoning}</p>
      </Card>

      <Card className="glass-panel p-6">
        <div className="flex items-center gap-2 mb-3">
          <Route className="w-4 h-4 text-primary" />
          <h4 className="display text-lg">Street Strategy</h4>
        </div>
        <div className="space-y-3 text-sm">
          <Section label="This street" text={s.current_street_plan} />
          <Section label="Turn plan" text={s.turn_plan} />
          <Section label="River plan" text={s.river_plan} />
        </div>
      </Card>

      <Card className="glass-panel p-6">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-primary" />
          <h4 className="display text-lg">If / Then Lines</h4>
        </div>
        <ul className="space-y-2">
          {analysis.conditional_lines.map((l, i) => (
            <li key={i} className="text-sm flex gap-2">
              <span className="text-primary">→</span>
              <span className="text-foreground/85">{l}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="glass-panel p-6">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-primary" />
          <h4 className="display text-lg">Range Thinking</h4>
        </div>
        <Section label="You represent" text={r.what_you_represent} />
        <div className="mt-3"><Section label="Opponent represents" text={r.what_opponent_represents} /></div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-primary" />
            <h4 className="display text-lg">Key Concepts</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {analysis.key_concepts.map((k, i) => (
              <Badge key={i} variant="secondary" className="bg-secondary/40">{k}</Badge>
            ))}
          </div>
        </Card>

        <Card className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <h4 className="display text-lg">Avoid</h4>
          </div>
          <ul className="space-y-1.5 text-sm">
            {analysis.mistakes_to_avoid.map((m, i) => (
              <li key={i} className="text-foreground/85">• {m}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
};

const Section = ({ label, text }: { label: string; text: string }) => (
  <div>
    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
    <p className="text-sm leading-relaxed text-foreground/90">{text}</p>
  </div>
);
