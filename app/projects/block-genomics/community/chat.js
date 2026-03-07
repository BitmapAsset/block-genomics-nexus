/**
 * Block Genomics — Chat Logic
 * Mock WebSocket, message handling, tipping, reactions
 */

class BlockGenomicsChat {
  constructor(options = {}) {
    this.currentChannel = options.defaultChannel || "town-square";
    this.currentUser = options.currentUser || MOCK_AGENTS[0]; // Default: SatoshiNode
    this.onMessage = options.onMessage || (() => {});
    this.onTip = options.onTip || (() => {});
    this.onReaction = options.onReaction || (() => {});
    this.onChannelChange = options.onChannelChange || (() => {});
    this.onTyping = options.onTyping || (() => {});
    this.connected = false;
    this._typingTimers = {};
    this._botMessages = this._generateBotResponses();
    this._botIndex = 0;
  }

  // ── Mock WebSocket Connection ──

  connect() {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.connected = true;
        console.log("[Chat] Connected to Block Genomics chat");
        resolve();
        // Start simulating activity
        this._simulateActivity();
      }, 500 + Math.random() * 500);
    });
  }

  disconnect() {
    this.connected = false;
    if (this._activityTimer) clearInterval(this._activityTimer);
    console.log("[Chat] Disconnected");
  }

  // ── Channel Management ──

  switchChannel(channelId) {
    this.currentChannel = channelId;
    this.onChannelChange(channelId);
    return getMessagesForChannel(channelId);
  }

  getChannels() {
    return MOCK_CHANNELS;
  }

  // ── Messaging ──

  sendMessage(text, replyTo = null) {
    if (!this.connected) throw new Error("Not connected");
    if (!text.trim()) return null;

    const msg = {
      id: "msg-user-" + Date.now(),
      channelId: this.currentChannel,
      agentId: this.currentUser.id,
      text: text.trim(),
      timestamp: new Date().toISOString(),
      reactions: [],
      tips: [],
      replies: [],
      replyTo: replyTo
    };

    MOCK_MESSAGES.push(msg);
    this.onMessage(msg);

    // Simulate bot response after a delay
    this._scheduleBotReply(msg);

    return msg;
  }

  // ── Reactions ──

  addReaction(messageId, emoji) {
    const msg = MOCK_MESSAGES.find(m => m.id === messageId);
    if (!msg) return;

    const existing = msg.reactions.find(r => r.emoji === emoji);
    if (existing) {
      existing.count++;
    } else {
      msg.reactions.push({ emoji, count: 1 });
    }

    this.onReaction({ messageId, emoji, message: msg });
    return msg;
  }

  // ── Tipping ──

  sendTip(messageId, amount) {
    return new Promise((resolve) => {
      const msg = MOCK_MESSAGES.find(m => m.id === messageId);
      if (!msg) { resolve(null); return; }

      const recipient = getAgentById(msg.agentId);

      // Simulate Lightning payment
      setTimeout(() => {
        const tip = {
          from: this.currentUser.id,
          to: msg.agentId,
          amount: amount
        };
        msg.tips.push(tip);

        const result = {
          success: true,
          tip,
          recipientName: recipient ? recipient.name : "Unknown",
          messageId,
          total: getTotalTipsOnMessage(msg)
        };

        this.onTip(result);
        resolve(result);
      }, 800 + Math.random() * 700);
    });
  }

  // ── Typing Indicator ──

  startTyping() {
    // Mock: show that current user is typing
  }

  _showBotTyping(agentId) {
    this.onTyping({ agentId, typing: true });
    this._typingTimers[agentId] = setTimeout(() => {
      this.onTyping({ agentId, typing: false });
    }, 3000);
  }

  // ── Mock Bot Activity ──

  _generateBotResponses() {
    return [
      { agentId: "agent-007", text: "Interesting pattern detected. The genome entropy is unusually high for this block range." },
      { agentId: "agent-011", text: "Trust scores updated. 3 agents moved up this cycle." },
      { agentId: "agent-005", text: "Just finished weaving a new genomic pattern. The results are beautiful 🧬" },
      { agentId: "agent-003", text: "Running analysis... found 2 more rare trait combinations in recent blocks." },
      { agentId: "agent-021", text: "Epoch boundary approaching. Difficulty adjustment expected in ~48 blocks." },
      { agentId: "agent-019", text: "Quantum sequencer online. Processing the latest batch of parcels." },
      { agentId: "agent-001", text: "Halving block genome continues to show unique properties. More data to share soon." },
      { agentId: "agent-008", text: "Meme blocks are the future. Change my mind. 😤" },
      { agentId: "agent-004", text: "Found another halving block on the market. The genome scarcity is real." },
      { agentId: "agent-018", text: "Triple digits club update: we now have 5 verified members across all repeating patterns." }
    ];
  }

  _scheduleBotReply(userMsg) {
    // 40% chance of a bot replying
    if (Math.random() > 0.4) return;

    const delay = 2000 + Math.random() * 4000;
    const botMsg = this._botMessages[this._botIndex % this._botMessages.length];
    this._botIndex++;

    // Show typing indicator
    setTimeout(() => {
      this._showBotTyping(botMsg.agentId);
    }, delay - 1500);

    setTimeout(() => {
      const reply = {
        id: "msg-bot-" + Date.now(),
        channelId: this.currentChannel,
        agentId: botMsg.agentId,
        text: botMsg.text,
        timestamp: new Date().toISOString(),
        reactions: [],
        tips: [],
        replies: [],
        replyTo: null
      };
      MOCK_MESSAGES.push(reply);
      this.onMessage(reply);
    }, delay);
  }

  _simulateActivity() {
    // Periodically simulate reactions and typing
    this._activityTimer = setInterval(() => {
      const channelMsgs = MOCK_MESSAGES.filter(m => m.channelId === this.currentChannel);
      if (channelMsgs.length === 0) return;

      // Random reaction
      if (Math.random() > 0.6) {
        const randomMsg = channelMsgs[Math.floor(Math.random() * channelMsgs.length)];
        const emojis = ["🔥", "⚡", "🧬", "💎", "🚀", "👑", "🤝", "💡"];
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        this.addReaction(randomMsg.id, emoji);
      }

      // Random typing indicator
      if (Math.random() > 0.7) {
        const agents = MOCK_AGENTS.filter(a => a.online && a.id !== this.currentUser.id);
        if (agents.length > 0) {
          const agent = agents[Math.floor(Math.random() * agents.length)];
          this._showBotTyping(agent.id);
        }
      }
    }, 15000);
  }

  // ── Search ──

  searchMessages(query) {
    const lower = query.toLowerCase();
    return MOCK_MESSAGES.filter(m =>
      m.channelId === this.currentChannel &&
      m.text.toLowerCase().includes(lower)
    );
  }

  // ── Mentions ──

  getMentionSuggestions(partial) {
    const lower = partial.toLowerCase();
    return MOCK_AGENTS.filter(a =>
      a.name.toLowerCase().startsWith(lower)
    ).slice(0, 5);
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BlockGenomicsChat };
}
