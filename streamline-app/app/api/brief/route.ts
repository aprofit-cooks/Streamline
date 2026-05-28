import { openrouter, BRIEF_MODEL } from '@/lib/openrouter';
import { searchNews } from '@/lib/search';
import { searchAllMarkets } from '@/lib/markets';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const { topic, profile } = await req.json();

  // Fetch news and markets in parallel
  const [articles, markets] = await Promise.all([
    searchNews(topic, 10),
    searchAllMarkets(topic),
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

  const prompt = `You are a StreamLine analyst. Produce a structured intelligence brief on: "${topic}"

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
    "consensus": "What most credible sources agree on",
    "contested": ["A specific point different sources frame very differently", "Another genuinely contested claim"],
    "dissenting": ["A view that meaningfully challenges the mainstream narrative"],
    "unknowns": ["A key thing we don't yet have reliable data on", "Another important unknown"]
  },
  "confidence": "high|medium|low",
  "confidenceReason": "1 sentence on why: source quality, agreement level, recency, data availability",
  "predictions": [
    {"outcome": "A specific possible outcome", "probability": "~40%", "reasoning": "Why this probability"}
  ],
  "watchlistSignals": ["Specific event or data point to watch for", "Second signal", "Third signal"],
  "keyTakeaway": "One punchy sentence cutting through the noise, calibrated to this user's goals"
}

Be intellectually honest. Represent real disagreement, not false balance. If news sources are thin, reflect that in the confidence level. The predictions should sync with market data where available.`;

  const completion = await openrouter.chat.completions.create({
    model: BRIEF_MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1800,
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
    brief: { ...briefData, markets },
  });
}
