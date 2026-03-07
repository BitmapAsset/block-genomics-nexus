"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ChatMessage {
  role: "brain" | "user";
  text: string;
  delay: number; // ms after previous
}

const scenes: { title: string; messages: ChatMessage[] }[] = [
  {
    title: "Onboarding",
    messages: [
      { role: "brain", text: "Hey! I'm Naxora Brain 🧠 Tell me about your business.", delay: 0 },
      { role: "user", text: "I run a dental clinic in Austin. 3 dentists, open Mon–Sat.", delay: 1200 },
      { role: "brain", text: "Got it! I'm setting up your AI team now...", delay: 1000 },
      { role: "brain", text: "✅ Receptionist Agent — answers calls, books appointments\n✅ Reminder Agent — sends confirmations & follow-ups\n✅ Reviews Agent — requests 5-star reviews after visits", delay: 1400 },
      { role: "user", text: "That was... 30 seconds? 🤯", delay: 1000 },
      { role: "brain", text: "Your AI team is live. They're already connected to your phone, email, and website.", delay: 800 },
    ],
  },
  {
    title: "Handling Calls",
    messages: [
      { role: "brain", text: "📞 Incoming call from +1 (512) 555-0147", delay: 0 },
      { role: "user", text: "\"Hi, I need to book a cleaning for next Thursday\"", delay: 1000 },
      { role: "brain", text: "Receptionist Agent responded:\n\"Of course! I have 10 AM or 2 PM available with Dr. Martinez. Which works better?\"", delay: 1200 },
      { role: "user", text: "\"2 PM please\"", delay: 800 },
      { role: "brain", text: "✅ Appointment booked — Thu 2:00 PM, Dr. Martinez\n📱 Confirmation SMS sent\n📧 Calendar invite sent", delay: 1000 },
    ],
  },
  {
    title: "Growing Revenue",
    messages: [
      { role: "brain", text: "📊 Weekly report ready.", delay: 0 },
      { role: "brain", text: "This week:\n• 47 calls answered (0 missed)\n• 23 appointments booked\n• 12 five-star reviews collected\n• $8,400 in estimated revenue influenced", delay: 1200 },
      { role: "user", text: "We used to miss 30% of calls. Now it's zero.", delay: 1000 },
      { role: "brain", text: "Your Sales Agent also identified 8 patients overdue for checkups. Want me to send recall messages?", delay: 1000 },
      { role: "user", text: "Do it 🚀", delay: 600 },
      { role: "brain", text: "Done. 8 personalized messages sent via SMS + email.", delay: 800 },
    ],
  },
  {
    title: "Multi-Channel",
    messages: [
      { role: "brain", text: "All channels active and healthy 🟢", delay: 0 },
      { role: "brain", text: "📞 Phone — 12 calls today\n💬 WhatsApp — 34 messages\n📧 Email — 8 replies sent\n🌐 Website — 6 chat sessions\n📱 SMS — 15 reminders sent", delay: 1200 },
      { role: "user", text: "This is like having 5 employees that never sleep", delay: 1000 },
      { role: "brain", text: "And they cost less than one. Your AI team has saved an estimated 127 hours this month. 💪", delay: 1000 },
    ],
  },
];

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-cyan/60"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

function ChatBubble({ msg, index }: { msg: ChatMessage; index: number }) {
  const isBrain = msg.role === "brain";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, x: isBrain ? -20 : 20 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`flex ${isBrain ? "justify-start" : "justify-end"}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
          isBrain
            ? "bg-[#111113] text-gray-200 rounded-bl-md border border-[#1C1C1F]"
            : "bg-gradient-to-r from-cyan/20 to-purple/20 text-gray-800 rounded-br-md border border-cyan/10"
        }`}
      >
        {isBrain && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan/70 block mb-1">
            Naxora Brain
          </span>
        )}
        {msg.text}
      </div>
    </motion.div>
  );
}

export default function BrainAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeScene, setActiveScene] = useState(0);
  const [visibleMessages, setVisibleMessages] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // Scroll-driven scene selection
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const viewH = window.innerHeight;
      const totalH = containerRef.current.offsetHeight;
      
      // How far through the animation container we've scrolled
      const progress = Math.max(0, Math.min(1, (viewH - rect.top) / (totalH + viewH)));
      const sceneIndex = Math.min(scenes.length - 1, Math.floor(progress * scenes.length));
      
      if (sceneIndex !== activeScene) {
        setActiveScene(sceneIndex);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeScene]);

  // Animate messages for current scene
  useEffect(() => {
    // Clear previous timeouts
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setVisibleMessages(0);
    setIsTyping(true);

    const msgs = scenes[activeScene].messages;
    let cumDelay = 300;

    msgs.forEach((msg, i) => {
      cumDelay += msg.delay || 800;
      // Show typing before each brain message
      if (msg.role === "brain" && i > 0) {
        const typingTimeout = setTimeout(() => setIsTyping(true), cumDelay - 500);
        timeoutsRef.current.push(typingTimeout);
      }
      const timeout = setTimeout(() => {
        setVisibleMessages(i + 1);
        setIsTyping(false);
      }, cumDelay);
      timeoutsRef.current.push(timeout);
      cumDelay += 200;
    });

    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, [activeScene]);

  const currentMessages = scenes[activeScene].messages.slice(0, visibleMessages);

  return (
    <div ref={containerRef} className="relative">
      {/* Sticky chat window that stays visible while scrolling */}
      <div className="sticky top-24">
        <div className="max-w-2xl mx-auto">
          {/* Window chrome */}
          <div className="bg-[#0A0A0B] rounded-t-2xl border border-[#1C1C1F] border-b-0 px-4 py-3 flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-cyan to-purple flex items-center justify-center">
                  <span className="text-[8px] text-white font-bold">И</span>
                </div>
                Naxora Brain
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              </div>
            </div>
            {/* Scene tabs */}
            <div className="flex gap-1">
              {scenes.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setActiveScene(i)}
                  className={`px-2 py-0.5 rounded text-[10px] transition-all ${
                    i === activeScene
                      ? "bg-cyan/20 text-cyan"
                      : "text-gray-600 hover:text-gray-400"
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </div>
          </div>

          {/* Chat area */}
          <div className="bg-[#0A0A0B] rounded-b-2xl border border-[#1C1C1F] border-t-0 min-h-[340px] max-h-[400px] overflow-hidden">
            <div className="p-4 space-y-3">
              <AnimatePresence mode="popLayout">
                {currentMessages.map((msg, i) => (
                  <ChatBubble key={`${activeScene}-${i}`} msg={msg} index={i} />
                ))}
              </AnimatePresence>
              {isTyping && visibleMessages < scenes[activeScene].messages.length && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="bg-[#111113] rounded-2xl rounded-bl-md border border-[#1C1C1F]">
                    <TypingIndicator />
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* Glow effect */}
          <div className="absolute -inset-4 bg-gradient-to-b from-cyan/5 via-purple/5 to-transparent rounded-3xl blur-xl -z-10 pointer-events-none" />
        </div>
      </div>

      {/* Spacer to allow scroll-driven animation */}
      <div className="h-[200vh]" />
    </div>
  );
}
