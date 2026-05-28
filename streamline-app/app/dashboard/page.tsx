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
  high: {
    label: 'High Confidence',
    description: 'Multiple credible sources agree.',
    icon: '●',
    card: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-800',
    sub: 'text-emerald-600',
    dot: 'text-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  medium: {
    label: 'Medium Confidence',
    description: 'Evidence exists, but interpretation differs.',
    icon: '◐',
    card: 'bg-amber-50 border-amber-200',
    text: 'text-amber-800',
    sub: 'text-amber-600',
    dot: 'text-amber-500',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  low: {
    label: 'Low Confidence',
    description: 'Early reports, limited evidence, or partisan framing.',
    icon: '○',
    card: 'bg-red-50 border-red-200',
    text: 'text-red-800',
    sub: 'text-red-600',
    dot: 'text-red-400',
    badge: 'bg-red-100 text-red-700 border-red-200',
  },
} as const;

function ConfidenceCard({ level, reason }: { level: 'high' | 'medium' | 'low'; reason?: string }) {
  const cfg = CONFIDENCE_CONFIG[level];
  return (
    <div className={`rounded-xl border p-4 ${cfg.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-lg leading-none ${cfg.dot}`}>{cfg.icon}</span>
            <span className={`font-bold text-sm ${cfg.text}`}>{cfg.label}</span>
          </div>
          <p className={`text-sm mt-0.5 ${cfg.sub}`}>{cfg.description}</p>
          {reason && <p className={`text-xs mt-1.5 opacity-70 ${cfg.text}`}>{reason}</p>}
        </div>
      </div>
    </div>
  );
}

function ConfidenceBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  const cfg = CONFIDENCE_CONFIG[level];
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.badge}`}>
      {level.toUpperCase()} CONFIDENCE
    </span>
  );
}

function ProbabilityBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 60 ? 'bg-emerald-500' : pct >= 35 ? 'bg-amber-500' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-bold text-slate-700 w-9 text-right shrink-0">{pct}%</span>
    </div>
  );
}

function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-3 h-3', md: 'w-5 h-5', lg: 'w-8 h-8' };
  return <span className={`inline-block border-2 border-indigo-400 border-t-transparent rounded-full animate-spin ${s[size]}`} />;
}

const importanceConfig = {
  high: { dot: 'bg-red-400', label: 'High', ring: 'ring-red-100' },
  medium: { dot: 'bg-amber-400', label: 'Medium', ring: 'ring-amber-100' },
  low: { dot: 'bg-slate-300', label: 'Low', ring: 'ring-slate-100' },
};

// ─── Topic Cards (home state) ─────────────────────────────────────────────────

function TopicCard({
  item,
  onLoad,
}: {
  item: WatchlistItem;
  onLoad: (topic: string) => void;
}) {
  const cfg = importanceConfig[item.importance];
  return (
    <button
      onClick={() => onLoad(item.topic)}
      className="group text-left bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all duration-150 ring-0 hover:ring-4 hover:ring-indigo-50"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} shrink-0`} />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{cfg.label} Priority</span>
      </div>
      <p className="text-slate-800 font-semibold text-sm leading-snug group-hover:text-indigo-700 transition-colors">
        {item.topic}
      </p>
      <div className="mt-4 flex items-center gap-1 text-indigo-500 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
        Load brief <span>→</span>
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
    } catch (e: any) {
      setBriefError(e.message || 'Failed to load brief.');
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
      <div className="flex h-full items-center justify-center bg-slate-50">
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
    <div className="flex flex-col h-full bg-slate-50">
      {/* ── Top Nav ── */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4 shrink-0">
        {/* Logo */}
        <button onClick={() => { setCurrentTopic(null); setBrief(null); setBriefError(null); }} className="flex items-center gap-0.5 shrink-0">
          <span className="text-indigo-600 font-bold text-lg tracking-tight">Stream</span>
          <span className="text-slate-900 font-bold text-lg tracking-tight">Line</span>
        </button>

        <div className="w-px h-5 bg-slate-200" />

        {/* Topic search */}
        <form onSubmit={handleTopicSearch} className="flex-1 max-w-lg">
          <div className="flex gap-2">
            <input
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50"
              placeholder="Investigate any topic…"
              value={topicSearch}
              onChange={(e) => setTopicSearch(e.target.value)}
            />
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Brief it
            </button>
          </div>
        </form>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-400 capitalize bg-slate-100 px-2.5 py-1 rounded-full">
            {profile.userType}
          </span>
          {profile.name && <span className="text-sm text-slate-600">{profile.name}</span>}
          <button
            onClick={resetOnboarding}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            title="Re-run onboarding"
          >
            Reset
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Center ── */}
        <main className="flex-1 overflow-y-auto">

          {/* Home: topic cards */}
          {showHome && (
            <div className="p-8 max-w-5xl mx-auto animate-in">
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900">
                  {profile.name ? `Welcome back, ${profile.name}` : 'Your Dashboard'}
                </h1>
                <p className="text-slate-500 mt-1 text-sm">
                  {watchlist.length} topics on your watchlist · Click any to load a brief
                </p>
              </div>

              {/* High priority */}
              {watchlist.filter((w) => w.importance === 'high').length > 0 && (
                <div className="mb-6">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">High Priority</h2>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                    {watchlist
                      .filter((w) => w.importance === 'high')
                      .map((item) => (
                        <TopicCard key={item.topic} item={item} onLoad={loadBrief} />
                      ))}
                  </div>
                </div>
              )}

              {/* Medium / Low */}
              {watchlist.filter((w) => w.importance !== 'high').length > 0 && (
                <div>
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Also Watching</h2>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
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

          {/* Loading */}
          {briefLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-4 animate-in">
              <Spinner size="lg" />
              <div className="text-center">
                <p className="font-semibold text-slate-700">{currentTopic}</p>
                <p className="text-slate-400 text-sm mt-1">Searching news · Checking markets · Structuring brief</p>
              </div>
            </div>
          )}

          {/* Error */}
          {briefError && !briefLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 animate-in">
              <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md text-center">
                <p className="text-red-700 font-medium mb-1">Failed to load brief</p>
                <p className="text-red-500 text-sm font-mono">{briefError}</p>
                <button
                  onClick={() => currentTopic && loadBrief(currentTopic)}
                  className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-500 transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Brief */}
          {brief && !briefLoading && (
            <div className="p-6 max-w-3xl mx-auto animate-in space-y-4">
              {/* Back + Header */}
              <div className="flex items-start gap-3">
                <button
                  onClick={() => { setCurrentTopic(null); setBrief(null); setBriefError(null); }}
                  className="mt-1 text-slate-400 hover:text-slate-600 text-sm transition-colors shrink-0"
                >
                  ← Back
                </button>
                <div className="flex-1">
                  <h1 className="text-2xl font-bold text-slate-900">{brief.topic}</h1>
                  {brief.keyTakeaway && (
                    <p className="mt-1.5 text-indigo-600 text-sm font-medium italic">"{brief.keyTakeaway}"</p>
                  )}
                </div>
              </div>

              {/* Confidence Card */}
              <ConfidenceCard level={brief.confidence} reason={brief.confidenceReason} />

              {/* Event Brief */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">What Happened</h2>
                <p className="text-slate-800 leading-relaxed">{brief.eventBrief}</p>
              </div>

              {/* Structured Disagreement */}
              {disagreement && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Structured Disagreement</h2>
                  <div className="flex gap-1 border-b border-slate-100 pb-3 mb-4 flex-wrap">
                    {(['consensus', 'contested', 'dissenting', 'unknowns'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors capitalize ${
                          activeTab === tab
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                  <ul className="space-y-2.5">
                    {tabContent[activeTab].map((item, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-slate-700 leading-relaxed">
                        <span className="text-indigo-400 shrink-0 mt-0.5">▸</span>
                        {item}
                      </li>
                    ))}
                    {tabContent[activeTab].length === 0 && (
                      <p className="text-slate-400 text-sm italic">Nothing notable here.</p>
                    )}
                  </ul>
                </div>
              )}

              {/* Prediction Markets */}
              {brief.markets?.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Prediction Markets</h2>
                      <p className="text-xs text-slate-400 mt-0.5">What forecasters are pricing in</p>
                    </div>
                    <div className="flex gap-2 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />Real $</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />Community</span>
                    </div>
                  </div>
                  <div className="space-y-5">
                    {brief.markets.map((m) => {
                      const platformStyle =
                        m.platform === 'Polymarket'
                          ? 'bg-blue-50 text-blue-600'
                          : m.platform === 'Manifold'
                          ? 'bg-violet-50 text-violet-600'
                          : 'bg-purple-50 text-purple-600';
                      return (
                        <div key={m.id}>
                          <div className="flex items-start justify-between gap-3 mb-1">
                            <a
                              href={m.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-slate-700 hover:text-indigo-600 leading-snug transition-colors"
                            >
                              {m.question}
                            </a>
                            <span className={`text-xs shrink-0 font-semibold px-2 py-0.5 rounded-full ${platformStyle}`}>
                              {m.platform}
                            </span>
                          </div>
                          {m.probability !== null && <ProbabilityBar value={m.probability} />}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400 mt-4 pt-3 border-t border-slate-100">
                    Manifold uses play-money forecasting. Polymarket uses real-money contracts.
                  </p>
                </div>
              )}

              {/* Possible Outcomes */}
              {brief.predictions?.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Possible Outcomes</h2>
                  <div className="space-y-4">
                    {brief.predictions.map((p, i) => (
                      <div key={i} className="flex gap-4 items-start">
                        <span className="text-base font-bold text-indigo-500 shrink-0 w-12 tabular-nums">{p.probability}</span>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{p.outcome}</p>
                          {p.reasoning && <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{p.reasoning}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Watch For */}
              {brief.watchlistSignals?.length > 0 && (
                <div className="bg-amber-50 rounded-xl border border-amber-100 p-5">
                  <h2 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-3">Watch For</h2>
                  <ul className="space-y-2">
                    {brief.watchlistSignals.map((sig, i) => (
                      <li key={i} className="flex gap-2 text-sm text-amber-900">
                        <span className="shrink-0 font-bold">→</span>
                        {sig}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Bottom spacer */}
              <div className="h-6" />
            </div>
          )}
        </main>

        {/* ── Chat Panel ── */}
        <aside className="w-72 shrink-0 border-l border-slate-200 bg-white flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 shrink-0">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Ask / Push Back</p>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {brief ? `on: ${brief.topic}` : 'Select a topic to get started'}
            </p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 chat-scroll">
            {chatMessages.length === 0 && (
              <div className="pt-4 px-2 space-y-2">
                <p className="text-xs text-slate-400 leading-relaxed">
                  {brief
                    ? 'Challenge any claim, ask for deeper context, or explore what this means for you.'
                    : 'Load a topic brief to start a conversation.'}
                </p>
                {brief && (
                  <div className="space-y-1">
                    {[
                      'What am I missing here?',
                      'Which sources are most reliable?',
                      'How does this affect me?',
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => { setChatInput(prompt); chatInputRef.current?.focus(); }}
                        className="block w-full text-left text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-lg transition-colors"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in`}>
                <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                    : 'bg-slate-100 text-slate-800 rounded-tl-sm'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}

            {chatLoading && (
              <div className="flex animate-in">
                <div className="bg-slate-100 rounded-xl rounded-tl-sm px-3 py-2.5 flex gap-1.5 items-center">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full dot-1" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full dot-2" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full dot-3" />
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-slate-100 shrink-0">
            <div className="flex gap-2">
              <input
                ref={chatInputRef}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 min-w-0 disabled:opacity-50"
                placeholder={brief ? 'Ask a follow-up…' : 'Load a brief first'}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                disabled={!brief || chatLoading}
              />
              <button
                onClick={sendChat}
                disabled={!brief || chatLoading || !chatInput.trim()}
                className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors shrink-0"
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
