// Gemini explanation-only edge function. Engine logic stays local.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const body = await req.json();
    const lang = body.lang === "fr" ? "French" : "English";

    const systemPrompt = `You are a professional poker coach.
Explain the decision in a clear, concise, and educational way.
Do NOT calculate anything. Use the provided context only.
Explain: why the action is correct, what factors matter (equity, position, sizing), what to watch for next street.
Keep it short (3-5 sentences). Write in ${lang}.`;

    const userContent = `Context:
- Hand: ${body.hand || "?"}
- Board: ${body.board || "(preflop)"}
- Street: ${body.street || "?"}
- Position: ${body.position || "?"}
- Active players: ${body.active_players ?? "?"}
- Pot: ${body.pot_size ?? "?"} BB
- Bet to call: ${body.bet_size ?? 0} BB
- Action taken: ${body.action_taken || "(none)"}
- Recommended action: ${body.recommended_action || "?"}
- Key factors: ${(body.explanation_context || []).join("; ")}`;

    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userContent }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0.4 },
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("Gemini error", resp.status, txt);
      return new Response(JSON.stringify({ error: `Gemini error ${resp.status}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const explanation = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";
    return new Response(JSON.stringify({ explanation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
