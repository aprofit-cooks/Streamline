'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  userType: string;
  name: string | null;
  interests: string[];
  watchlist: WatchlistItem[];
  goals: string[];
  expertise: Record<string, string>;
}

interface WatchlistItem {
  topic: string;
  importance: 'high' | 'medium' | 'low';
}

interface Market {
  id: string;
  question: string;
  probability: number | null;
  volume?: number;
  url: string;
  platform: 'Polymarket' | 'Manifold' | 'Kalshi';
  isRealMoney: boolean;
}

interface Brief {
  topic: string;
  eventBrief: string;
  structuredDisagreement: {
    consensus: string;
    contested: string[];
    dissenting: string[];
    unknowns: string[];
  };
  confidence: 'high' | 'medium' | 'low';
  confidenceReason: string;
  predictions: Array<{ outcome: string; probability: string; reasoning: string }>;
  watchlistSignals: string[];
  keyTakeaway: string;
  markets: Market[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const CONFIDENCE_CONFIG = {
  high:   { label: 'High Confidence',   description: 'Multiple credible sources agree.',                      icon: '●' },
  medium: { label: 'Medium Confidence', description: 'Evidence exists, but interpretation differs.',          icon: '◐' },
  low:    { label: 'Low Confidence',    description: 'Early reports, limited evidence, or partisan framing.', icon: '○' },
} as const;

function ConfidenceCard({ level, reason }: { level: 'high' | 'medium' | 'low'; reason?: string }) {
  const cfg = CONFIDENCE_CONFIG[level];
  return (
    <div className="border-t-2 border-ink border-b border-rule bg-paper-warm px-4 py-3.5">
      <div className="flex items-baseline gap-2.5">
        <span className="text-base">{cfg.icon}</span>
        <span className="uppercase text-xs font-bold tracking-widest font-sans text-ink">{cfg.label}</span>
      </div>
      <p className="font-serif text-sm text-ink-3 mt-1.5 leading-snug">{cfg.description}</p>
      {reason && <p className="font-serif italic text-sm text-ink-3 mt-1.5 leading-snug">{reason}</p>}
    </div>
  );
}

function ConfidenceBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  const cfg = CONFIDENCE_CONFIG[level];
  return (
    <span className="inline-flex items-center gap-1.5 border border-ink px-2 py-1 uppercase text-[10.5px] font-bold tracking-widest font-sans text-ink">
      {cfg.icon} {level} confidence
    </span>
  );
}

function ProbabilityBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2.5 mt-1.5">
      <div className="flex-1 h-1 bg-rule overflow-hidden">
        <div className="h-full bg-ink transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-sans font-bold tabular-nums text-sm text-ink w-10 text-right shrink-0">{pct}%</span>
    </div>
  );
}

function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-3 h-3', md: 'w-5 h-5', lg: 'w-8 h-8' };
  return <span className={`inline-block border-2 border-ink border-t-transparent rounded-full animate-spin ${s[size]}`} />;
}

const importanceConfig = {
  high:   { glyph: '●', label: 'Top Story' },
  medium: { glyph: '◐', label: 'Also Watching' },
  low:    { glyph: '○', label: 'In Brief' },
};

// ─── Topic Cards (home state) ─────────────────────────────────────────────────

function TopicCard({
  item,
  onLoad,
  rank,
}: {
  item: WatchlistItem;
  onLoad: (topic: string) => void;
  rank?: number;
}) {
  return (
    <button
      onClick={() => onLoad(item.topic)}
      className="group block w-full text-left border-t border-rule py-4 px-2 hover:bg-paper-gray transition-colors"
    >
      <div className="flex gap-3.5">
        {rank != null && (
          <span className="font-display text-[30px] leading-none text-ink-5 min-w-[28px] shrink-0">{rank}</span>
        )}
        <div className="flex-1">
          <p className="font-serif font-bold text-[18px] text-ink leading-tight group-hover:underline underline-offset-2">
            {item.topic.replace(/\b\w/g, (c) => c.toUpperCase())}
          </p>
          <div className="mt-1.5 text-[10.5px] font-sans font-semibold text-ink-4 uppercase tracking-widest">
            Read the brief →
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [currentTopic, setCurrentTopic] = useState<string | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [topicSearch, setTopicSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'consensus' | 'contested' | 'dissenting' | 'unknowns'>('consensus');
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Load profile from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('sl_profile');
    if (!stored) { router.replace('/'); return; }
    try {
      const p: UserProfile = JSON.parse(stored);
      setProfile(p);
      const wl: WatchlistItem[] = p.watchlist?.length
        ? p.watchlist
        : JSON.parse(localStorage.getItem('sl_watchlist') || '[]');
      setWatchlist(wl);
    } catch {
      router.replace('/');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  const loadBrief = async (topic: string) => {
    setCurrentTopic(topic);
    setBrief(null);
    setBriefError(null);
    setChatMessages([]);

    // Check localStorage cache first
    const cacheKey = `sl_brief_${topic.toLowerCase().replace(/\s+/g, '_')}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { brief: cachedBrief, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL) {
          setBrief(cachedBrief);
          setActiveTab('consensus');
          return;
        }
      }
    } catch {}

    setBriefLoading(true);
    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, profile }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      setBrief(data.brief);
      setActiveTab('consensus');
      // Save to cache
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ brief: data.brief, timestamp: Date.now() }));
      } catch {}
    } catch (e: unknown) {
      setBriefError(e instanceof Error ? e.message : 'Failed to load brief.');
    } finally {
      setBriefLoading(false);
    }
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const next = [...chatMessages, userMsg];
    // Add empty assistant message to stream into
    setChatMessages([...next, { role: 'assistant', content: '' }]);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, mode: 'brief', profile, brief }),
      });

      if (!res.ok || !res.body) throw new Error('Request failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        // Update the last message in place as text streams in
        setChatMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: accumulated };
          return updated;
        });
      }
    } catch {
      setChatMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: 'Something went wrong. Try again.' };
        return updated;
      });
    } finally {
      setChatLoading(false);
      chatInputRef.current?.focus();
    }
  };

  const handleTopicSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (topicSearch.trim()) {
      loadBrief(topicSearch.trim());
      setTopicSearch('');
    }
  };

  const resetOnboarding = () => {
    localStorage.removeItem('sl_profile');
    localStorage.removeItem('sl_watchlist');
    router.push('/');
  };

  if (!profile) {
    return (
      <div className="flex h-full items-center justify-center bg-paper">
        <Spinner size="lg" />
      </div>
    );
  }

  const disagreement = brief?.structuredDisagreement;
  const tabContent: Record<string, string[]> = {
    consensus: disagreement?.consensus ? [disagreement.consensus] : [],
    contested: disagreement?.contested || [],
    dissenting: disagreement?.dissenting || [],
    unknowns: disagreement?.unknowns || [],
  };
  const showHome = !currentTopic && !briefLoading;

  return (
    <div className="flex flex-col h-full bg-paper">

      {/* ── Masthead Nav ── */}
      <header className="bg-white border-b-2 border-ink px-6 py-2.5 flex items-center gap-4 shrink-0">
        <button
          onClick={() => { setCurrentTopic(null); setBrief(null); setBriefError(null); }}
          className="font-display text-2xl tracking-wide text-ink shrink-0"
        >
          StreamLine
        </button>

        <span className="border-l border-rule-2 pl-4 text-ink-4 uppercase text-[10px] font-sans font-semibold tracking-widest hidden sm:block">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </span>

        <form onSubmit={handleTopicSearch} className="ml-auto flex-none w-80 lg:w-96">
          <div className="flex border border-ink">
            <input
              className="flex-1 bg-white font-sans text-sm text-ink placeholder-ink-5 outline-none px-3 py-2"
              placeholder="Investigate any topic…"
              value={topicSearch}
              onChange={(e) => setTopicSearch(e.target.value)}
            />
            <button
              type="submit"
              className="px-4 py-2 bg-ink text-white font-sans text-sm font-semibold hover:opacity-80 transition-opacity"
            >
              Brief it
            </button>
          </div>
        </form>

        <div className="flex items-center gap-3 shrink-0">
          <span className="uppercase text-[10px] font-sans font-semibold tracking-widest text-ink-4">
            {profile.userType} edition
          </span>
          <button
            onClick={resetOnboarding}
            className="uppercase text-[10px] font-sans font-semibold tracking-widest text-ink-5 hover:text-ink transition-colors"
            title="Re-run onboarding"
          >
            Reset
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Center ── */}
        <main className="flex-1 overflow-y-auto chat-scroll">

          {/* ── Front Page (Home) ── */}
          {showHome && (
            <div className="p-8 max-w-4xl mx-auto animate-in">
              {/* Masthead */}
              <div className="text-center border-b border-ink pb-3 mb-5">
                <div className="uppercase text-[10px] tracking-widest font-sans font-semibold text-ink-4">
                  {profile.name ? `Your edition, ${profile.name}` : 'Your edition'} · {watchlist.length} topics on watch
                </div>
                <h1 className="font-display text-5xl mt-2">The Brief</h1>
              </div>

              {/* High Priority — Top Stories */}
              {watchlist.filter((w) => w.importance === 'high').length > 0 && (
                <div className="mb-8">
                  <div className="uppercase text-xs font-bold tracking-widest font-sans pb-2 border-b-2 border-ink mb-0">Top Stories</div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10">
                    {watchlist
                      .filter((w) => w.importance === 'high')
                      .map((item, i) => (
                        <TopicCard key={item.topic} item={item} onLoad={loadBrief} rank={i + 1} />
                      ))}
                  </div>
                </div>
              )}

              {/* Medium / Low — Also Watching */}
              {watchlist.filter((w) => w.importance !== 'high').length > 0 && (
                <div>
                  <div className="uppercase text-xs font-bold tracking-widest font-sans pb-2 border-b-2 border-ink mb-0">Also On Your Watch</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10">
                    {watchlist
                      .filter((w) => w.importance !== 'high')
                      .map((item) => (
                        <TopicCard key={item.topic} item={item} onLoad={loadBrief} />
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Loading ── */}
          {briefLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-4 animate-in">
              <div className="text-center">
                <div className="uppercase text-[10px] font-sans font-semibold tracking-widest text-ink-4 mb-3">Fetching Brief</div>
                <p className="font-serif font-bold text-2xl text-ink">{currentTopic}</p>
                <p className="font-serif italic text-sm text-ink-4 mt-1">Searching news · Checking markets · Structuring brief</p>
              </div>
              <Spinner size="md" />
            </div>
          )}

          {/* ── Error ── */}
          {briefError && !briefLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 animate-in">
              <div className="border-t-2 border-ink border border-rule bg-paper-warm p-6 max-w-md text-center">
                <p className="font-sans font-bold uppercase tracking-wider text-sm text-ink mb-1">Failed to load brief</p>
                <p className="font-mono text-xs text-ink-3 mt-1">{briefError}</p>
                <button
                  onClick={() => currentTopic && loadBrief(currentTopic)}
                  className="mt-4 px-5 py-2 bg-ink text-white font-sans text-sm font-semibold hover:opacity-80 transition-opacity"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* ── Article / Brief ── */}
          {brief && !briefLoading && (
            <article className="p-6 pb-16 max-w-2xl mx-auto animate-in">

              {/* Back */}
              <button
                onClick={() => { setCurrentTopic(null); setBrief(null); setBriefError(null); }}
                className="uppercase text-[10.5px] font-bold tracking-widest font-sans text-ink-4 hover:text-ink transition-colors mb-5 block"
              >
                ← Front page
              </button>

              {/* Article header */}
              <div className="border-b border-ink pb-5 mb-6">
                <ConfidenceBadge level={brief.confidence} />
                <h1 className="font-serif font-bold text-[38px] leading-tight text-ink mt-3">{brief.topic}</h1>
                {brief.keyTakeaway && (
                  <p className="mt-3 font-serif italic text-xl text-ink leading-snug" style={{ fontFamily: "'Libre Caslon Text', Georgia, serif" }}>
                    &#8220;{brief.keyTakeaway}&#8221;
                  </p>
                )}
                <div className="mt-3 uppercase text-[10.5px] font-sans font-semibold tracking-widest text-ink-4">
                  StreamLine Analysis Desk · Updated {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>

              <div className="space-y-6">

                {/* Event Brief with drop cap */}
                <p className="font-serif text-[17px] leading-relaxed text-ink-2">
                  <span
                    className="float-left font-display text-[4.5rem] leading-[0.75] pr-2 pt-1 text-ink"
                    aria-hidden="true"
                  >
                    {brief.eventBrief?.[0]}
                  </span>
                  {brief.eventBrief?.slice(1)}
                </p>

                {/* Confidence fact-box */}
                <ConfidenceCard level={brief.confidence} reason={brief.confidenceReason} />

                {/* Structured Disagreement */}
                {disagreement && (
                  <section>
                    <div className="uppercase text-xs font-bold tracking-widest font-sans pb-2 border-b-2 border-ink mb-4">Structured Disagreement</div>
                    <div className="flex gap-5 mb-4 flex-wrap border-b border-rule pb-3">
                      {(['consensus', 'contested', 'dissenting', 'unknowns'] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={`uppercase text-[11px] font-bold tracking-widest font-sans pb-1.5 border-b-2 transition-colors ${
                            activeTab === tab
                              ? 'border-ink text-ink'
                              : 'border-transparent text-ink-4 hover:text-ink-2'
                          }`}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>
                    <ul className="space-y-3">
                      {tabContent[activeTab].map((item, i) => (
                        <li key={i} className="flex gap-3 font-serif text-[16px] text-ink-2 leading-relaxed">
                          <span className="text-ink shrink-0 mt-0.5 font-sans font-bold">▪</span>
                          {item}
                        </li>
                      ))}
                      {tabContent[activeTab].length === 0 && (
                        <p className="font-serif italic text-sm text-ink-4">Nothing notable here.</p>
                      )}
                    </ul>
                  </section>
                )}

                {/* Prediction Markets */}
                {brief.markets?.length > 0 && (
                  <section>
                    <div className="uppercase text-xs font-bold tracking-widest font-sans pb-2 border-b-2 border-ink mb-4">Prediction Markets</div>
                    <div className="space-y-4">
                      {brief.markets.map((m) => (
                        <div key={m.id}>
                          <div className="flex items-baseline justify-between gap-3 mb-0.5">
                            <a
                              href={m.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-serif text-[15px] text-ink-2 hover:text-ink hover:underline underline-offset-2 leading-snug"
                            >
                              {m.question}
                            </a>
                            <span className="uppercase text-[10px] font-sans font-semibold tracking-widest text-ink-4 whitespace-nowrap shrink-0">
                              {m.platform}
                            </span>
                          </div>
                          {m.probability !== null && <ProbabilityBar value={m.probability} />}
                        </div>
                      ))}
                    </div>
                    <p className="font-serif italic text-xs text-ink-4 mt-4 pt-3 border-t border-rule">
                      Manifold uses play-money forecasting. Polymarket uses real-money contracts.
                    </p>
                  </section>
                )}

                {/* Possible Outcomes */}
                {brief.predictions?.length > 0 && (
                  <section>
                    <div className="uppercase text-xs font-bold tracking-widest font-sans pb-2 border-b-2 border-ink mb-0">Possible Outcomes</div>
                    <div>
                      {brief.predictions.map((p, i) => (
                        <div key={i} className={`flex gap-5 items-baseline py-3 ${i > 0 ? 'border-t border-rule' : ''}`}>
                          <span className="font-sans font-bold text-[18px] text-ink tabular-nums shrink-0 w-14">{p.probability}</span>
                          <div>
                            <p className="font-serif font-bold text-[16px] text-ink">{p.outcome}</p>
                            {p.reasoning && <p className="font-serif text-sm text-ink-3 mt-0.5 leading-snug">{p.reasoning}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Watch For */}
                {brief.watchlistSignals?.length > 0 && (
                  <section className="border-t-2 border-b-2 border-ink py-4">
                    <div className="uppercase text-xs font-bold tracking-widest font-sans mb-3">Watch For</div>
                    <ul className="space-y-2.5">
                      {brief.watchlistSignals.map((sig, i) => (
                        <li key={i} className="flex gap-3 font-serif text-[16px] text-ink-2 leading-relaxed">
                          <span className="font-sans font-bold text-ink shrink-0">→</span>
                          {sig}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

              </div>
            </article>
          )}
        </main>

        {/* ── Chat Panel ── */}
        <aside className="w-72 shrink-0 border-l border-ink bg-paper-warm flex flex-col">
          <div className="px-4 py-3.5 border-b-2 border-ink shrink-0">
            <div className="uppercase text-xs font-bold tracking-widest font-sans text-ink">Ask &amp; Push Back</div>
            <p className="text-[11px] font-sans text-ink-4 mt-1 truncate">
              {brief ? `Re: ${brief.topic}` : 'Open a brief to begin'}
            </p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto chat-scroll p-3 space-y-3">
            {chatMessages.length === 0 && (
              <div className="pt-2 space-y-0">
                <p className="font-serif text-sm text-ink-3 leading-relaxed mb-2">
                  {brief
                    ? 'Challenge any claim, ask for deeper context, or explore what this means for you.'
                    : 'Load a topic brief to start a conversation.'}
                </p>
                {brief && (
                  ['What am I missing here?', 'Which sources are most reliable?', 'How does this affect me?'].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => { setChatInput(prompt); chatInputRef.current?.focus(); }}
                      className="block w-full text-left font-serif text-sm text-ink-2 hover:text-ink bg-transparent border-0 border-t border-rule py-2.5 hover:underline underline-offset-2 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))
                )}
              </div>
            )}

            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in`}>
                {msg.role === 'user' ? (
                  <div className="max-w-[90%] bg-ink text-white font-sans font-medium text-xs px-3 py-2 leading-relaxed">
                    {msg.content}
                  </div>
                ) : (
                  <div className="max-w-[92%] border-l-2 border-ink pl-3 font-serif text-sm text-ink-2 leading-relaxed">
                    {msg.content}
                  </div>
                )}
              </div>
            ))}

            {chatLoading && (
              <div className="flex animate-in">
                <div className="border-l-2 border-ink pl-3 py-1">
                  <span className="inline-flex gap-1.5 items-center">
                    <span className="w-1.5 h-1.5 bg-ink-4 rounded-full dot-1" />
                    <span className="w-1.5 h-1.5 bg-ink-4 rounded-full dot-2" />
                    <span className="w-1.5 h-1.5 bg-ink-4 rounded-full dot-3" />
                  </span>
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-ink shrink-0">
            <div className="flex border border-ink">
              <input
                ref={chatInputRef}
                className="flex-1 bg-paper-warm font-sans text-xs text-ink placeholder-ink-5 outline-none px-3 py-2 min-w-0 disabled:opacity-50"
                placeholder={brief ? 'Ask a follow-up…' : 'Load a brief first'}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                disabled={!brief || chatLoading}
              />
              <button
                onClick={sendChat}
                disabled={!brief || chatLoading || !chatInput.trim()}
                className="p-2 bg-ink text-white disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-80 transition-opacity shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}
