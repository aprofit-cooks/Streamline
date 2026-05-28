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
    <div className="flex flex-col h-full bg-slate-950 text-white">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-4 border-b border-slate-800">
        <div className="flex items-center">
          <span className="text-indigo-400 font-bold text-xl tracking-tight">Stream</span>
          <span className="text-white font-bold text-xl tracking-tight">Line</span>
        </div>
        <span className="text-slate-500 text-sm">AI Sensemaking Dashboard</span>
      </header>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto chat-scroll px-4 py-6 space-y-4 max-w-2xl mx-auto w-full">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in`}
          >
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold mr-2 mt-1 shrink-0">
                S
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-sm'
                  : 'bg-slate-800 text-slate-100 rounded-tl-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 animate-in">
            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">
              S
            </div>
            <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5">
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full dot-1" />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full dot-2" />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full dot-3" />
            </div>
          </div>
        )}

        {transitioning && (
          <div className="flex justify-center py-4 animate-in">
            <div className="text-slate-400 text-sm flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              Setting up your dashboard…
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-6 max-w-2xl mx-auto w-full">
        <div className="flex gap-2 bg-slate-800 rounded-2xl px-4 py-2 border border-slate-700 focus-within:border-indigo-500 transition-colors">
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-white placeholder-slate-500 text-sm outline-none py-2"
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
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors"
          >
            Send
          </button>
        </div>
        <p className="text-center text-slate-600 text-xs mt-2">
          Press Enter to send
        </p>
      </div>
    </div>
  );
}
