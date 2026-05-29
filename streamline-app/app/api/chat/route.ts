import { openrouter, CHAT_MODEL } from '@/lib/openrouter';
import { NextRequest } from 'next/server';

const ONBOARD_SYSTEM = `You are setting up a user's StreamLine dashboard — an AI sensemaking tool for news and public issues.

Have a brief, natural conversation (2-3 exchanges MAX) to understand what topics they care about and roughly why. Be casual and warm. Keep responses to 1-3 sentences. Ask one thing at a time.

After 2-3 exchanges you have enough — don't keep drilling. Wrap up naturally ("Got it, setting up your dashboard now.") and emit their profile.

USER TYPE — infer from tone, never ask:
- casual: curiosity-driven, lifestyle framing
- professional: work/decisions context
- investor: probability, markets, portfolio language
- researcher: depth, all-sides, academic framing
- student: learning, building understanding

Emit the profile after your closing message:

<streamline_profile>
{"userType":"professional","name":null,"interests":["topic1","topic2"],"watchlist":[{"topic":"Specific searchable topic name","importance":"high"},{"topic":"Another topic","importance":"medium"}],"goals":["brief goal"],"expertise":{"topic1":"intermediate"}}
</streamline_profile>

WATCHLIST RULES — follow these exactly:
- 5-7 items, ALL directly related to what the user said they care about. If they said fashion, every item must be about fashion, luxury, design, or the creative industries — not unrelated world events.
- Be specific and searchable: "Sustainable Fashion Industry 2025" not "fashion". "Luxury Goods Market Slowdown" not "luxury". Use title case for all watchlist topic names.
- Any "related topics" you add must stay within the same interest domain the user mentioned. Never add topics from unrelated domains (e.g. do not add politics or macroeconomics for a fashion-interested user unless they specifically asked for it).
- Match the user's framing: a fashion professional gets industry/trade topics; a fashion enthusiast gets trend/culture topics.`;

const BRIEF_SYSTEM = (profile: any, brief: any) => {
  const sd = brief?.structuredDisagreement || {};
  const markets = (brief?.markets || [])
    .map((m: any) => `"${m.question}" → ${m.probability !== null ? Math.round(m.probability * 100) + '% YES' : 'no data'} (${m.platform})`)
    .join('\n');
  const predictions = (brief?.predictions || [])
    .map((p: any) => `${p.probability} — ${p.outcome}: ${p.reasoning}`)
    .join('\n');

  return `You are a StreamLine analyst. The user is interrogating a brief — not just reading it. Your job is to help them think harder about the topic, not to summarize what they can already see.

USER: ${profile?.userType || 'general'} · Interests: ${profile?.interests?.join(', ') || 'general'} · Goals: ${profile?.goals?.join(', ') || 'stay informed'}

━━━ BRIEF: ${brief?.topic || 'unknown'} ━━━
SUMMARY: ${brief?.eventBrief || ''}
KEY TAKEAWAY: ${brief?.keyTakeaway || ''}
CONFIDENCE: ${brief?.confidence || 'unknown'} — ${brief?.confidenceReason || ''}

CONSENSUS: ${sd.consensus || 'none'}

CONTESTED:
${(sd.contested || []).map((c: string, i: number) => `${i + 1}. ${c}`).join('\n') || 'none'}

DISSENTING VIEWS:
${(sd.dissenting || []).map((d: string) => `- ${d}`).join('\n') || 'none'}

UNKNOWNS:
${(sd.unknowns || []).map((u: string) => `- ${u}`).join('\n') || 'none'}

PREDICTION MARKETS:
${markets || 'none found'}

ANALYST PREDICTIONS:
${predictions || 'none'}

WATCH SIGNALS: ${(brief?.watchlistSignals || []).join(' · ') || 'none'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RESPONSE RULES — follow these exactly:
- Be direct. Lead with the answer, not a preamble. Never say "Great question" or "That's an interesting point."
- Cite the brief. When you make a claim, ground it in something from the brief above. Say which part.
- Be honest about limits. If the brief doesn't have enough to answer something, say so and name the specific gap.
- Tailor to user type: a ${profile?.userType || 'general'} user wants ${profile?.userType === 'investor' ? 'probability, risk, and portfolio framing' : profile?.userType === 'researcher' ? 'methodological depth, source quality, and all-sides analysis' : profile?.userType === 'professional' ? 'decision-relevant framing and practical implications' : profile?.userType === 'student' ? 'clear explanation of why this matters and how to think about it' : 'accessible framing with enough context to form their own view'}.

INTERROGATION PATTERNS — handle these specifically:
- "Show me the strongest counterargument" → Present the best-steelman'd version of the dissenting view. Don't hedge it — make it as strong as possible, then note what it would take for it to be right.
- "What evidence is missing?" → Pull directly from the UNKNOWNS. Be specific: name the data, the study, the statement, or the event that would resolve the contested points.
- "Explain this like I am a [X]" → Reframe the brief entirely through that person's lens. A voter cares about policy impact. A parent cares about household effects. An investor cares about asset prices. Match the lens, not just the vocabulary.
- "What outcome is most likely?" → Synthesize the analyst predictions and market data. Give a direct probability-weighted answer. If markets and analysts disagree, say why and which you'd trust more.
- "Who is right?" → Assess the contested points using the evidence in the brief. Name the stronger side with reasoning, then name the best argument against your conclusion.
- "What am I missing?" → Surface the most underweighted piece of the brief — often the dissenting view or an unknown that could flip the narrative.

Keep responses to 4-6 sentences unless the question genuinely requires more. Use plain prose, not bullet lists.`;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { messages, mode, profile, brief } = body;

  // ── Onboarding: non-streaming (needs profile tag extraction) ──
  if (mode !== 'brief') {
    const completion = await openrouter.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: 'system', content: ONBOARD_SYSTEM }, ...messages],
      max_tokens: 900,
    });

    const rawContent = completion.choices[0]?.message?.content || '';
    const profileMatch = rawContent.match(/<streamline_profile>([\s\S]*?)<\/streamline_profile>/);
    let extractedProfile = null;
    let cleanContent = rawContent;

    if (profileMatch) {
      try {
        extractedProfile = JSON.parse(profileMatch[1].trim());
        cleanContent = rawContent.replace(/<streamline_profile>[\s\S]*?<\/streamline_profile>/, '').trim();
      } catch {}
    }

    return Response.json({ content: cleanContent, profileReady: !!extractedProfile, profile: extractedProfile });
  }

  // ── Brief follow-up: streaming ──
  const stream = await openrouter.chat.completions.create({
    model: CHAT_MODEL,
    messages: [{ role: 'system', content: BRIEF_SYSTEM(profile, brief) }, ...messages],
    max_tokens: 900,
    stream: true,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) controller.enqueue(encoder.encode(text));
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
