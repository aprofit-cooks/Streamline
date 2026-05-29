import { openrouter, BRIEF_MODEL } from '@/lib/openrouter';
import { searchNews } from '@/lib/search';
import { searchAllMarkets } from '@/lib/markets';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const { topic, profile } = await req.json();

  // Derive a domain context from the user's top interest to bias search
  // toward relevant coverage (e.g. fashion user gets fashion news, not world news)
  const primaryInterest = profile?.interests?.[0] as string | undefined;

  // Fetch news and markets in parallel, with a 3s timeout on each so a slow
  // third-party API never delays the LLM call by more than 3 seconds.
  const withTimeout = <T>(promise: Promise<T>, fallback: T, ms = 3000): Promise<T> => {
    const timer = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms));
    return Promise.race([promise, timer]);
  };

  const [articles, markets] = await Promise.all([
    withTimeout(searchNews(topic, 8, primaryInterest), []),
    withTimeout(searchAllMarkets(topic), []),
  ]);

  const newsContext =
    articles.length > 0
      ? articles
          .map(
            (a, i) =>
              `[${i + 1}] "${a.title}" — ${a.source || 'Unknown source'} (${a.pubDate})\n${a.description}`
          )
          .join('\n\n')
      : 'No recent news found via RSS. Use your training knowledge and note that sources may be limited.';

  const marketContext =
    markets.length > 0
      ? markets
          .map(
            (m) =>
              `- "${m.question}" → ${m.platform}: ${m.probability !== null ? Math.round(m.probability * 100) + '% YES probability' : 'unknown'}`
          )
          .join('\n')
      : 'No relevant prediction markets found for this topic.';

  const userContext = profile
    ? `User type: ${profile.userType}. Interests: ${profile.interests?.join(', ')}. Expertise: ${JSON.stringify(profile.expertise || {})}.`
    : 'General user, no profile.';

  const isGoodNews = /good news|positive development|breakthrough/i.test(topic);

  const prompt = `You are a StreamLine analyst. Produce a structured intelligence brief on: "${topic}"
${isGoodNews ? 'NOTE: This is a "good news" brief. Focus on genuine positive developments, breakthroughs, and progress stories. The structured disagreement section can cover debates about impact or scale of these positive developments rather than controversy.' : ''}

USER CONTEXT: ${userContext}

RECENT NEWS (from RSS feeds):
${newsContext}

PREDICTION MARKETS:
${marketContext}

Produce a JSON response — raw JSON only, no markdown code blocks, no preamble. Use this exact structure:
{
  "topic": "Clean, specific topic name",
  "eventBrief": "2-3 sentences on what happened and why it matters specifically to this user type",
  "structuredDisagreement": {
    "consensus": "1-2 sentences stating what virtually ALL credible observers agree on — the undisputed factual baseline. Be specific, not vague.",
    "contested": [
      "Name the specific sides: 'Camp A argues X because Y; Camp B argues X because Z.' Give 2-4 genuinely contested points where credible sources, experts, or stakeholders reach different conclusions from the same evidence. Each item must name who disagrees and why.",
      "Another contested point with named parties or perspectives"
    ],
    "dissenting": [
      "A serious, credible minority view that challenges the mainstream consensus — not fringe, but a position held by legitimate experts or stakeholders that is underrepresented in coverage. Explain WHY this view is credible even if you disagree.",
      "Optional second dissenting view if one exists"
    ],
    "unknowns": [
      "A concrete data gap: something we would need to know to resolve the debate, but don't have yet. Be specific — name the missing data, the unverified claim, or the future event that would settle the question.",
      "Another specific unknown that materially changes the picture depending on how it resolves"
    ]
  },
  "confidence": "high|medium|low",
  "confidenceReason": "1 sentence on why: name the source quality issues, agreement level, recency, or data gaps driving this rating",
  "predictions": [
    {"outcome": "A specific, falsifiable outcome — not vague", "probability": "~40%", "reasoning": "1 sentence connecting to evidence or market data"}
  ],
  "watchlistSignals": ["A specific event, data release, or statement that would move the needle — name the trigger", "Second concrete signal", "Third signal"],
  "keyTakeaway": "One punchy sentence cutting through the noise — what a smart, busy person actually needs to know"
}

RULES:
- Represent REAL disagreement, not false balance. If experts actually agree, say so in consensus and leave contested thin.
- Each contested item must name who holds which view — "some say" is not acceptable.
- The dissenting view must be credible and steelman'd, not strawmanned.
- Unknowns must be concrete — "we don't know X" not "the situation is uncertain."
- Sync predictions with market data where available. If markets exist, cite the probability.
- If news is thin, reflect it in confidence and say so explicitly in confidenceReason.`;

  const completion = await openrouter.chat.completions.create({
    model: BRIEF_MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1400,
  });

  const rawContent = completion.choices[0]?.message?.content || '{}';

  const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
  let briefData: any = {};

  try {
    briefData = JSON.parse(jsonMatch?.[0] || '{}');
  } catch {
    briefData = {
      topic,
      eventBrief: rawContent,
      error: true,
    };
  }

  return Response.json({
    brief: { ...briefData, markets, articles },
  });
}
