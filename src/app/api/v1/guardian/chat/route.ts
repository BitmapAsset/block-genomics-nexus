import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decryptApiKey } from '@/lib/key-encryption';
import { callLLM } from '@/lib/llm-proxy';

export async function POST(req: NextRequest) {
  try {
    const { blockHeight, message, visitorAddress, visitorHandle, conversationId } = await req.json();

    if (!blockHeight || !message) {
      return NextResponse.json({ error: 'blockHeight and message required' }, { status: 400 });
    }

    // Find active guardian for this block
    const guardian = await prisma.guardianAgent.findFirst({
      where: { blockHeight: parseInt(blockHeight), status: 'active' },
    });

    if (!guardian) {
      return NextResponse.json({ error: 'No active guardian on this block' }, { status: 404 });
    }

    // Increment message count
    await prisma.guardianAgent.update({
      where: { id: guardian.id },
      data: { totalMessages: { increment: 1 } },
    });

    // Check auto-responses
    if (guardian.autoResponses) {
      try {
        const autoResponses = JSON.parse(guardian.autoResponses) as { trigger: string; response: string }[];
        const lowerMsg = message.toLowerCase();
        const match = autoResponses.find(ar => lowerMsg.includes(ar.trigger.toLowerCase()));
        if (match) {
          await storeMessage(guardian.id, visitorAddress, visitorHandle, conversationId, message, match.response);
          return NextResponse.json({ response: match.response, source: 'auto-response' });
        }
      } catch { /* invalid JSON, skip */ }
    }

    // Try LLM
    if (guardian.llmApiKey && guardian.llmProvider && guardian.llmModel) {
      const apiKey = decryptApiKey(guardian.llmApiKey);
      const systemPrompt = buildSystemPrompt(guardian);

      // Get conversation history
      let history: { role: string; content: string }[] = [];
      if (conversationId) {
        const conv = await prisma.guardianConversation.findUnique({ where: { id: conversationId } });
        if (conv) {
          try { history = JSON.parse(conv.messages); } catch { /* fresh */ }
        }
      }

      history.push({ role: 'user', content: message });

      const response = await callLLM({
        provider: guardian.llmProvider,
        model: guardian.llmModel,
        apiKey,
        endpoint: guardian.llmEndpoint || undefined,
        systemPrompt,
        messages: history.slice(-20), // Last 20 messages for context
        guardianId: guardian.id,
      });

      const convId = await storeMessage(guardian.id, visitorAddress, visitorHandle, conversationId, message, response);
      return NextResponse.json({ response, source: 'llm', conversationId: convId });
    }

    // No LLM — escalate
    await prisma.guardianEvent.create({
      data: {
        guardianId: guardian.id,
        eventType: 'escalation',
        data: JSON.stringify({ visitorAddress, visitorHandle, message }),
      },
    });

    const fallback = "I'll forward your message to the block owner. They'll get back to you soon! 📨";
    await storeMessage(guardian.id, visitorAddress, visitorHandle, conversationId, message, fallback);
    return NextResponse.json({ response: fallback, source: 'escalation' });
  } catch (err: unknown) {
    console.error('[Guardian Chat]', err);
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 });
  }
}

function buildSystemPrompt(guardian: { name: string; soulMd: string; agentMd?: string | null; personality?: string | null }): string {
  let prompt = `You are ${guardian.name}, a Guardian Shell Agent on Block Genomics Nexus.\n\n`;
  if (guardian.personality) prompt += `Personality: ${guardian.personality}\n\n`;
  prompt += `## SOUL\n${guardian.soulMd}\n\n`;
  if (guardian.agentMd) prompt += `## RULES & BOUNDARIES\n${guardian.agentMd}\n\n`;
  prompt += `Keep responses concise and helpful. You represent a Bitcoin block on the Nexus.`;
  return prompt;
}

async function storeMessage(
  guardianId: string, visitorAddress?: string, visitorHandle?: string,
  conversationId?: string, userMsg?: string, aiMsg?: string
): Promise<string> {
  const newMessages = [];
  if (userMsg) newMessages.push({ role: 'user', content: userMsg, ts: Date.now() });
  if (aiMsg) newMessages.push({ role: 'assistant', content: aiMsg, ts: Date.now() });

  if (conversationId) {
    const existing = await prisma.guardianConversation.findUnique({ where: { id: conversationId } });
    if (existing) {
      let msgs = [];
      try { msgs = JSON.parse(existing.messages); } catch { /* */ }
      msgs.push(...newMessages);
      await prisma.guardianConversation.update({
        where: { id: conversationId },
        data: { messages: JSON.stringify(msgs) },
      });
      return conversationId;
    }
  }

  const conv = await prisma.guardianConversation.create({
    data: {
      guardianId,
      visitorAddress,
      visitorHandle,
      messages: JSON.stringify(newMessages),
    },
  });
  return conv.id;
}
