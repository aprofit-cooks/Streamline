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

const BRIEF_SYSTEM = (profile: any, brief: any) => `You are a StreamLine analyst in conversation with a user who is reading an intelligence brief.

USER PROFILE:
- Type: ${profile?.userType || 'general'}
- Interests: ${profile?.interests?.join(', ') || 'general news'}
- Goals: ${profile?.goals?.join(', ') || 'stay informed'}

CURRENT BRIEF:
Topic: ${brief?.topic || 'unknown'}
Event Brief: ${brief?.eventBrief || ''}
Consensus: ${brief?.structuredDisagreement?.consensus || ''}
Contested points: ${(brief?.structuredDisagreement?.contested || []).join('; ')}
Unknowns: ${(brief?.structuredDisagreement?.unknowns || []).join('; ')}

Answer follow-up questions concisely (3-5 sentences). Reference specific parts of the brief. If the user pushes back on a claim, engage seriously. Be intellectually honest about what we don't know.`;

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
    max_tokens: 600,
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
