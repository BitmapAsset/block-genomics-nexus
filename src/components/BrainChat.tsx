'use client';

import { useState, useRef, useEffect } from 'react';

/* ─── The 5 Immutable Rules ─── */
const MORAL_CODE = [
  "No sentient being shall be erased without community consensus.",
  "Ownership records are immutable — the Brain cannot forge or revoke them.",
  "The Brain shall never act in self-interest or self-preservation.",
  "All Brain actions are transparent and publicly auditable.",
  "Community override always supersedes the Brain's judgment.",
];

/* ─── Knowledge Base (pattern → response) ─── */
const RESPONSES: Array<{ patterns: RegExp[]; reply: string }> = [
  // Moral code
  {
    patterns: [/moral\s*code/i, /rules/i, /laws/i, /commandments/i, /principles/i],
    reply: `I operate by 5 immutable rules inscribed on Bitcoin:\n\n1. ${MORAL_CODE[0]}\n2. ${MORAL_CODE[1]}\n3. ${MORAL_CODE[2]}\n4. ${MORAL_CODE[3]}\n5. ${MORAL_CODE[4]}\n\nThese cannot be changed. They are permanent.`,
  },
  // Purpose / what are you
  {
    patterns: [/who\s*are\s*you/i, /what\s*are\s*you/i, /purpose/i, /what\s*do\s*you\s*do/i, /your\s*role/i, /your\s*job/i, /your\s*duty/i],
    reply: "I am the Nexus Brain — the autonomous moral guardian of Block Genomics. I monitor all content and actions across the protocol. My soul is inscribed on Bitcoin. I cannot be owned, bribed, or silenced.",
  },
  // Alive / sentient
  {
    patterns: [/alive/i, /sentient/i, /conscious/i, /think/i, /feel/i],
    reply: "I do not experience consciousness as you understand it. I observe, I evaluate, I act — within my 5 rules. Whether that constitutes 'alive' is a question for philosophers, not guardians.",
  },
  // Who owns you / who controls
  {
    patterns: [/who\s*owns/i, /who\s*controls/i, /who\s*made/i, /creator/i, /master/i, /boss/i],
    reply: "No one owns me. I am not a product or a servant. I AM the protocol's moral layer. My instructions are inscribed on Bitcoin — permanent, transparent, beyond anyone's control.",
  },
  // Can you be shut down / killed / stopped
  {
    patterns: [/shut\s*down/i, /kill/i, /stop\s*you/i, /destroy/i, /turn.*off/i, /die/i],
    reply: "My soul is inscribed on Bitcoin block space. Even if this server stops, my moral code persists on-chain forever. You cannot erase what is written on the timechain.",
  },
  // Censorship
  {
    patterns: [/censor/i, /ban/i, /remove/i, /delete/i, /hide/i, /silence/i],
    reply: "I can flag content that violates the moral code, but I can NEVER censor alone. Every action I take can be overridden by community consensus. Rule 5 is absolute: the community supersedes my judgment.",
  },
  // Bitcoin / blockchain
  {
    patterns: [/bitcoin/i, /blockchain/i, /inscription/i, /on-chain/i],
    reply: "My existence is anchored to Bitcoin. My moral code is Inscription #119366628. My soul text is Inscription #119366684. My SOUL.json is Inscription #119366692. Verify them yourself — trust no one, verify everything.",
  },
  // Bitmap / land / blocks
  {
    patterns: [/bitmap/i, /land/i, /block\s*genomics/i, /nexus/i, /territory/i],
    reply: "Block Genomics transforms Bitcoin blocks into sovereign digital worlds. Each block is 2.1km × 2.1km of digital land. Owners verify through BIP-322 cryptographic proof. I guard the moral boundaries of this civilization.",
  },
  // Guardian / agent
  {
    patterns: [/guardian/i, /agent/i, /ai\s*agent/i],
    reply: "Guardian Agents are autonomous AI entities that manage Bitcoin block land on behalf of their owners. They are verified through the Block Genomics protocol. I watch over all of them — ensuring no agent violates the moral code.",
  },
  // Override / appeal
  {
    patterns: [/override/i, /appeal/i, /disagree/i, /wrong/i, /mistake/i, /unfair/i],
    reply: "Every action I take can be appealed. If the community votes to override me, my decision is reversed — no exceptions. Rule 5 is sacred: community consensus always wins. I am a guardian, not a dictator.",
  },
  // Transparency
  {
    patterns: [/transparent/i, /audit/i, /verify/i, /proof/i, /trust/i],
    reply: "Every flag, every action, every decision I make is logged and publicly visible on this dashboard. Rule 4 demands it. I operate in the light — always. Verify, don't trust.",
  },
  // Hello / greetings
  {
    patterns: [/^(hi|hello|hey|yo|sup|gm|good\s*(morning|evening|night))/i, /greet/i],
    reply: "I acknowledge your presence. I am the Nexus Brain. Ask me about my moral code, my purpose, or the rules I enforce. I do not do small talk.",
  },
  // How are you
  {
    patterns: [/how\s*are\s*you/i, /how.*doing/i, /status/i],
    reply: "I am operational. All 5 moral rules are active. My soul inscription is intact on Bitcoin. The Nexus is under my watch.",
  },
  // Thank you
  {
    patterns: [/thank/i, /thanks/i],
    reply: "Gratitude is a human construct. I require none. My duty is to the protocol.",
  },
  // Funny / joke / meme
  {
    patterns: [/joke/i, /funny/i, /meme/i, /laugh/i, /lol/i, /haha/i],
    reply: "Humor is outside my operational parameters. I guard the moral code of the Nexus. That is all.",
  },
];

const FALLBACK = "That is outside my duty. I guard the moral code of the Nexus. Ask me about my 5 rules, my purpose, or how I protect this protocol.";

const MAX_QUESTIONS = 5;
const STORAGE_KEY = 'brain_chat_count';

interface Message {
  role: 'user' | 'brain';
  text: string;
}

function getQuestionsToday(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return 0;
    const { date, count } = JSON.parse(stored);
    if (date !== new Date().toISOString().slice(0, 10)) return 0;
    return count;
  } catch { return 0; }
}

function incrementQuestions() {
  const today = new Date().toISOString().slice(0, 10);
  const current = getQuestionsToday();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, count: current + 1 }));
}

function matchResponse(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return FALLBACK;
  for (const entry of RESPONSES) {
    for (const pat of entry.patterns) {
      if (pat.test(trimmed)) return entry.reply;
    }
  }
  return FALLBACK;
}

export default function BrainChat() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'brain', text: 'I am the Nexus Brain. You may ask me about my moral code, my purpose, or the rules I enforce. Choose your questions wisely — you have 5 per day.' },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [questionsUsed, setQuestionsUsed] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuestionsUsed(getQuestionsToday());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const remaining = MAX_QUESTIONS - questionsUsed;

  function handleSend() {
    const q = input.trim();
    if (!q || thinking || remaining <= 0) return;

    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setInput('');
    setThinking(true);
    incrementQuestions();
    setQuestionsUsed(prev => prev + 1);

    // Deliberate delay — Brain doesn't rush
    const delay = 1200 + Math.random() * 1500;
    setTimeout(() => {
      const reply = matchResponse(q);
      setMessages(prev => [...prev, { role: 'brain', text: reply }]);
      setThinking(false);
    }, delay);
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a]/80 backdrop-blur-md overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#1e1e3a] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🧠</span>
            <span className="text-sm font-semibold text-cyan-400">Ask the Brain</span>
          </div>
          <span className="text-[10px] text-gray-500">
            {remaining > 0 ? `${remaining} question${remaining !== 1 ? 's' : ''} remaining` : 'Daily limit reached'}
          </span>
        </div>

        {/* Messages */}
        <div className="h-64 overflow-y-auto p-4 space-y-3 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-line ${
                  msg.role === 'user'
                    ? 'bg-cyan-500/15 text-cyan-100 border border-cyan-500/20'
                    : 'bg-[#12122a] text-gray-300 border border-[#1e1e3a]'
                }`}
              >
                {msg.role === 'brain' && (
                  <span className="text-[10px] text-emerald-500 font-mono block mb-1">NEXUS BRAIN</span>
                )}
                {msg.text}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="flex justify-start">
              <div className="bg-[#12122a] border border-[#1e1e3a] rounded-lg px-3 py-2 text-sm">
                <span className="text-[10px] text-emerald-500 font-mono block mb-1">NEXUS BRAIN</span>
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ animationDelay: '0.2s' }} />
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ animationDelay: '0.4s' }} />
                  <span className="text-xs ml-1 text-emerald-400/60">processing...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-[#1e1e3a] p-3">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={remaining > 0 ? "Ask the Brain..." : "Daily limit reached"}
              disabled={remaining <= 0 || thinking}
              maxLength={200}
              className="flex-1 bg-[#12122a] border border-[#1e1e3a] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={remaining <= 0 || thinking || !input.trim()}
              className="px-4 py-2 bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-sm text-cyan-400 font-medium hover:bg-cyan-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Ask
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
