'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const WELCOME: Message = {
  role: 'assistant',
  content:
    "Welcome to StreamLine — an intelligence dashboard built to help you understand complex issues, not just consume them. Before I set up your dashboard, I want to get a sense of what you're trying to stay on top of. What topics have been on your radar lately?",
};

export default function OnboardPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // If profile already exists, go to dashboard
    if (typeof window !== 'undefined' && localStorage.getItem('sl_profile')) {
      router.replace('/dashboard');
    }
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: 'user', content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          mode: 'onboard',
        }),
      });

      const data = await res.json();
      const assistantMsg: Message = { role: 'assistant', content: data.content };
      setMessages((prev) => [...prev, assistantMsg]);

      if (data.profileReady && data.profile) {
        // Small pause so user reads the closing message
        setTimeout(() => {
          localStorage.setItem('sl_profile', JSON.stringify(data.profile));
          if (data.profile.watchlist) {
            localStorage.setItem('sl_watchlist', JSON.stringify(data.profile.watchlist));
          }
          setTransitioning(true);
          setTimeout(() => router.push('/dashboard'), 1800);
        }, 1200);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white text-ink">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-3.5 border-b-2 border-ink shrink-0">
        <span className="font-display text-2xl tracking-wide text-ink">StreamLine</span>
        <span className="border-l border-rule-2 pl-4 font-sans uppercase text-[10.5px] tracking-widest font-semibold text-ink-4">
          AI Sensemaking Dashboard
        </span>
      </header>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto chat-scroll px-4 py-6 space-y-4 max-w-2xl mx-auto w-full">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 bg-ink text-white font-display text-base flex items-center justify-center shrink-0 mr-2 mt-1">
                S
              </div>
            )}
            {msg.role === 'user' ? (
              <div className="max-w-[80%] bg-ink text-white font-sans font-medium text-sm px-4 py-3 leading-relaxed">
                {msg.content}
              </div>
            ) : (
              <div className="border-l-2 border-ink pl-3.5 font-serif text-base text-ink-2 leading-relaxed max-w-[80%]">
                {msg.content}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 animate-in">
            <div className="w-8 h-8 bg-ink text-white font-display text-base flex items-center justify-center shrink-0">
              S
            </div>
            <div className="border-l-2 border-ink pl-3.5 py-1">
              <span className="inline-flex gap-1.5 items-center">
                <span className="w-1.5 h-1.5 bg-ink-4 rounded-full dot-1" />
                <span className="w-1.5 h-1.5 bg-ink-4 rounded-full dot-2" />
                <span className="w-1.5 h-1.5 bg-ink-4 rounded-full dot-3" />
              </span>
            </div>
          </div>
        )}

        {transitioning && (
          <div className="flex justify-center py-4 animate-in">
            <div className="text-ink-4 text-xs font-sans uppercase tracking-widest font-semibold flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-ink border-t-transparent rounded-full animate-spin" />
              Setting up your dashboard…
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-6 max-w-2xl mx-auto w-full">
        <div className="flex border border-ink">
          <input
            ref={inputRef}
            className="bg-white text-ink font-sans text-sm outline-none px-4 py-3 placeholder-ink-5 flex-1"
            placeholder="Type your answer…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
            disabled={loading || transitioning}
            autoFocus
          />
          <button
            onClick={send}
            disabled={loading || transitioning || !input.trim()}
            className="px-5 py-3 bg-ink text-white text-sm font-sans font-semibold disabled:opacity-30 hover:opacity-80 transition-opacity"
          >
            Send
          </button>
        </div>
        <p className="text-center text-ink-4 text-[10.5px] font-sans font-semibold uppercase tracking-widest mt-2.5">
          Press Enter to send
        </p>
      </div>
    </div>
  );
}
