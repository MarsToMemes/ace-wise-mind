// Poker AI coach - returns structured analysis JSON
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const street = ctx.currentStreet || "Preflop";
    const t = ctx.table || {};
    const userMessage = `Analyze this poker spot.

Current street: ${street}
Hole cards: ${ctx.hole.join(" ")}
Flop: ${ctx.flop?.length ? ctx.flop.join(" ") : "(none)"}
Turn: ${ctx.turn ?? "(none)"}
River: ${ctx.river ?? "(none)"}

Table:
- Players: ${t.number_of_players ?? ctx.opponents + 1}
- Dealer (BTN) seat index: ${t.dealer_position_index ?? "n/a"}
- Your seat index: ${t.user_position_index ?? "n/a"}
- Your position: ${t.user_position ?? ctx.position}
- SB seat index: ${t.sb_index ?? "n/a"}, BB seat index: ${t.bb_index ?? "n/a"}

Stakes:
- Stack: ${ctx.stack}bb
- Pot: ${ctx.pot}bb
- Call amount: ${ctx.call ?? 0}bb

Deterministic engine readout (TRUSTED — DO NOT RECALCULATE):
- Hand: ${ctx.handCategory} (raw score ${ctx.handScore}, adjusted ${ctx.adjScore})
- Draw: ${ctx.drawType} (~${ctx.outs} outs)
- Estimated equity: ${ctx.equityPct?.toFixed?.(0) ?? ctx.equityPct ?? 0}% (Rule of 4/2)
- Board texture: ${ctx.texture}
- Pot odds: ${ctx.potOdds ?? "n/a"}
- Required equity: ${ctx.reqEquity ?? "n/a"}
- Range advantage hero/villain: ${ctx.heroRA}/${ctx.villainRA}
- Engine decision: ${ctx.suggestedAction} — ${ctx.decisionReason ?? ""}
${ctx.training ? `
Training context (interpret, do not recompute):
- User chose: ${ctx.training.userChoice} ${ctx.training.timeout ? "(TIMEOUT auto-fold)" : ""}
- Engine optimal: ${ctx.training.correctAction}
- EV user: ${ctx.training.evUser} BB · EV optimal: ${ctx.training.evOptimal} BB · Diff: ${ctx.training.evDiff} BB
- User range guess: ${ctx.training.rangeGuess ?? "none"} vs engine-implied: ${ctx.training.impliedRange} (correct: ${ctx.training.rangeCorrect})
- Leak tags: ${(ctx.training.leakTags || []).join(", ") || "none"}
Briefly comment on: (1) whether range read was right, (2) the EV mistake if any, (3) whether the decision was strategically sound.` : ""}`;

    const streetGuidance: Record<string, string> = {
      Preflop: "Plan preflop action, then describe flop and turn strategy.",
      Flop: "Plan the flop action, then provide turn and river strategy.",
      Turn: "Plan the turn action, then provide river strategy. river_plan is the key forward-looking plan.",
      River: "This is the river — provide the FINAL decision only. For turn_plan and river_plan, briefly recap reasoning rather than projecting future streets.",
    };

    const langMap: Record<string, string> = { en: "English", fr: "French (français)" };
    const langName = langMap[ctx.lang] || "English";
    const systemPrompt = `You are a high-level professional poker coach interpreting the output of a deterministic poker math engine.

CRITICAL RULES:
1. The engine is the SOURCE OF TRUTH. Outs, equity %, pot odds, hand strength, and the recommended action are already computed deterministically.
2. NEVER recalculate, override, contradict, or guess these numbers. Quote them as given.
3. Your "decision_explanation.action" MUST match the engine's recommendation exactly.
4. Your job is to INTERPRET: explain WHY using range logic, board texture, position, EV (equity vs pot odds), and forward planning.
5. Use REAL position logic: early positions tighten ranges, late positions widen, blinds play defensively/reactively.
6. Be precise, structured, actionable. Never vague.

Tailor output to the current street: ${streetGuidance[street]}

Write ALL output text in ${langName}. Keep poker terminology ("BTN", "SB", "BB", "UTG", "CO", "MP", "OESD") and action enum values ("Raise", "Call", "Check", "Fold") unchanged.`;

    const tool = {
      type: "function",
      function: {
        name: "poker_analysis",
        description: "Return structured poker analysis",
        parameters: {
          type: "object",
          properties: {
            decision_explanation: {
              type: "object",
              properties: {
                action: { type: "string", enum: ["Raise", "Call", "Check", "Fold"] },
                reasoning: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["action", "reasoning", "confidence"],
            },
            street_strategy: {
              type: "object",
              properties: {
                current_street_plan: { type: "string" },
                turn_plan: { type: "string" },
                river_plan: { type: "string" },
              },
              required: ["current_street_plan", "turn_plan", "river_plan"],
            },
            conditional_lines: { type: "array", items: { type: "string" } },
            range_thinking: {
              type: "object",
              properties: {
                what_you_represent: { type: "string" },
                what_opponent_represents: { type: "string" },
              },
              required: ["what_you_represent", "what_opponent_represents"],
            },
            key_concepts: { type: "array", items: { type: "string" } },
            mistakes_to_avoid: { type: "array", items: { type: "string" } },
          },
          required: ["decision_explanation", "street_strategy", "conditional_lines", "range_thinking", "key_concepts", "mistakes_to_avoid"],
        },
      },
    };

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "poker_analysis" } },
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (resp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await resp.text();
      console.error("AI error", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : null;
    return new Response(JSON.stringify({ analysis: parsed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("err", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
