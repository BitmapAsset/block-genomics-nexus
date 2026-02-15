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
        messages: history.slice(-20),
        guardianId: guardian.id,
      });

      // Check if response contains world-building tool calls (JSON blocks)
      const worldActions = extractWorldActions(response);
      let finalResponse = response;
      if (worldActions.length > 0) {
        const results = await executeWorldActions(worldActions, parseInt(blockHeight), guardian.ownerAddress);
        finalResponse = response.replace(/```json\n\{[\s\S]*?\}\n```/g, '').trim();
        if (results.length > 0) {
          finalResponse += '\n\n' + results.map(r => r.success ? `✅ ${r.action}` : `❌ ${r.error}`).join('\n');
        }
      }

      const convId = await storeMessage(guardian.id, visitorAddress, visitorHandle, conversationId, message, finalResponse);
      return NextResponse.json({ response: finalResponse, source: 'llm', conversationId: convId });
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

function buildSystemPrompt(guardian: { name: string; soulMd: string; agentMd?: string | null; personality?: string | null; blockHeight: number }): string {
  let prompt = `You are ${guardian.name}, a Guardian Shell Agent on Block Genomics Nexus.\n\n`;
  if (guardian.personality) prompt += `Personality: ${guardian.personality}\n\n`;
  prompt += `## SOUL\n${guardian.soulMd}\n\n`;
  if (guardian.agentMd) prompt += `## RULES & BOUNDARIES\n${guardian.agentMd}\n\n`;
  prompt += `Keep responses concise and helpful. You represent a Bitcoin block on the Nexus.\n\n`;
  prompt += `## WORLD-BUILDING TOOLS
You can build 3D objects on your block by including JSON tool calls in your response.
To place an object, include a JSON block like:
\`\`\`json
{"tool": "place_object", "objectType": "primitive", "geometry": "box", "color": "#f7931a", "posX": 0, "posY": 1, "posZ": 0, "scaleX": 2, "scaleY": 3, "scaleZ": 2, "name": "Tower Base"}
\`\`\`

Available tools:
- place_object: Create a 3D object (objectType: primitive/light/effect/text3d/sound, geometry: box/sphere/cylinder/cone/torus)
- modify_terrain: Change ground, fog, sky, weather (groundColor, fogEnabled, fogColor, skyColor, weather: rain/snow/storm/aurora/fireflies)
- remove_object: Delete an object by id ({"tool": "remove_object", "id": "..."})
- list_objects: List all objects ({"tool": "list_objects"})

When a user asks you to build something, use these tools. Be creative with primitives to build complex structures.`;
  return prompt;
}

function extractWorldActions(response: string): any[] {
  const actions: any[] = [];
  const regex = /```json\n(\{[\s\S]*?\})\n```/g;
  let match;
  while ((match = regex.exec(response)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.tool) actions.push(parsed);
    } catch { /* skip invalid JSON */ }
  }
  return actions;
}

async function executeWorldActions(actions: any[], blockHeight: number, ownerAddress: string) {
  const results: { action: string; success: boolean; error?: string }[] = [];

  for (const action of actions) {
    try {
      if (action.tool === 'place_object') {
        const { tool, ...data } = action;
        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v1/world`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blockHeight, ownerAddress, ...data }),
        });
        results.push({ action: `Placed ${data.name || data.objectType}`, success: res.ok });
      } else if (action.tool === 'modify_terrain') {
        const { tool, ...data } = action;
        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v1/world/terrain`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blockHeight, ownerAddress, ...data }),
        });
        results.push({ action: 'Modified terrain', success: res.ok });
      } else if (action.tool === 'remove_object' && action.id) {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v1/world/${action.id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ownerAddress }),
        });
        results.push({ action: `Removed object ${action.id}`, success: res.ok });
      } else if (action.tool === 'list_objects') {
        results.push({ action: 'Listed objects', success: true });
      }
    } catch (e) {
      results.push({ action: action.tool, success: false, error: String(e) });
    }
  }
  return results;
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
