import OpenAI from 'openai';

export const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://streamline-app-three.vercel.app',
    'X-Title': 'StreamLine',
  },
});

export const CHAT_MODEL = 'anthropic/claude-haiku-4.5';
export const BRIEF_MODEL = 'anthropic/claude-haiku-4.5';
