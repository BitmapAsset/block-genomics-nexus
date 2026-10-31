import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decryptApiKey } from '@/lib/key-encryption';
import { callLLM, checkGuardianRateLimit } from '@/lib/llm-proxy';
import { verifySignedAction } from '@/lib/signed-action';
import { notifyEscalation } from '@/lib/escalation-notify';
import { emitAgentEvent } from '@/lib/agent-events';
import { requireSignedBlockOwner } from '@/lib/block-write-auth';
import type { GateResult } from '@/lib/ownership-gate';
import { rateLimitDurable, clientIpFrom } from '@/lib/rate-limit-db';
import { MAX_PLACEMENTS } from '@/lib/world/types';

/** The hourly LLM budget of one guardian, in outbound calls. */
const LLM_CALLS_PER_HOUR = 60;
const HOUR_MS = 3_600_000;

/**
 * Reserve one outbound LLM call against the guardian it is billed to, before
 * the call. Atomic across instances; the key is the guardian the route
 * resolved from the block, never anything the caller names.
 */
async function reserveLlmCall(guardianId: string): Promise<boolean> {
  const r = await rateLimitDurable(`guardian-llm:${guardianId}`, LLM_CALLS_PER_HOUR, HOUR_MS);
  return r.allowed;
}

const RATE_LIMITED = 'Rate limit exceeded — max 60 messages/hour for this guardian. Please try again later.';

type StoredConversation = { id: string; messages: string; visitorAddress: string | null };

/** Strip control characters to mitigate prompt injection */
function stripControlChars(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export async function POST(req: NextRequest) {
  try {
    const { blockHeight, message: rawMessage, visitorAddress, visitorHandle, conversationId, guardianId, signature, signedMessage } = await req.json();

    if (!blockHeight || !rawMessage) {
      return NextResponse.json({ error: 'blockHeight and message required' }, { status: 400 });
    }

    // Input sanitization — limit message length and strip control characters
    if (typeof rawMessage !== 'string' || rawMessage.length > 4000) {
      return NextResponse.json({ error: 'Message too long (max 4000 chars)' }, { status: 400 });
    }

    // SECURITY: Strip control characters to reduce prompt injection risk
    const message = stripControlChars(rawMessage);

    // Find active guardian for this block
    const guardian = await prisma.guardianAgent.findFirst({
      where: { blockHeight: parseInt(blockHeight), status: 'active' },
    });

    if (!guardian) {
      return NextResponse.json({ error: 'No active guardian on this block' }, { status: 404 });
    }

    // The owner path: visitorAddress counts only with that wallet's signature
    // over the canonical 'guardian.chat' message for this block, this guardian,
    // this conversation and this exact text, with a one-time 'guardian' nonce.
    // Anything else (no signature, an ad-hoc or reused one) chats as anonymous.
    let verifiedVisitorAddress: string | undefined;
    if (visitorAddress && signature && signedMessage) {
      const height = parseInt(blockHeight);
      const auth = await verifySignedAction(
        visitorAddress,
        signedMessage,
        signature,
        { blockHeight: height, guardianId: guardianId ?? null, conversationId: conversationId ?? null, text: rawMessage, visitorAddress },
        { action: 'guardian.chat', method: 'POST', path: '/api/v1/guardian/chat', blockHeight: height, purpose: 'guardian' },
      );
      if (auth.ok && guardianId === guardian.id) verifiedVisitorAddress = visitorAddress;
    }

    // A conversation continues only under the guardian it was started with,
    // and one started by a verified wallet only for that wallet. Anything else
    // is not found: nothing is appended, nothing is billed, nothing new starts.
    let conversation: StoredConversation | null = null;
    if (conversationId !== undefined && conversationId !== null && conversationId !== '') {
      const found = typeof conversationId === 'string'
        ? await prisma.guardianConversation.findFirst({ where: { id: conversationId, guardianId: guardian.id } })
        : null;
      if (!found || (found.visitorAddress && found.visitorAddress !== verifiedVisitorAddress)) {
        return NextResponse.json(
          { error: 'conversation_not_found', message: 'No such conversation with this guardian. Send without conversationId to start one.' },
          { status: 404 }
        );
      }
      conversation = found;
    }
    // Stored as the visitor: the verified signer, or nobody. The body field
    // alone proves nothing.
    const storedVisitor = verifiedVisitorAddress ?? null;

    // Increment message count
    await prisma.guardianAgent.update({
      where: { id: guardian.id },
      data: { totalMessages: { increment: 1 } },
    });

    // Fire-and-forget: notify any registered BitmapAgents on this block that
    // a visitor sent a message to the guardian. No LLM keys or private data
    // travel here — only actor id, short preview, guardian id.
    void emitAgentEvent(guardian.blockHeight, 'dm_received', {
      actor: verifiedVisitorAddress || 'anonymous',
      actorHandle: visitorHandle ? String(visitorHandle).slice(0, 50) : 'anon',
      guardianId: guardian.id,
      summary: `Guardian ${guardian.name} received a message: ${message.slice(0, 140)}`,
    });

    // Check auto-responses
    if (guardian.autoResponses) {
      try {
        const autoResponses = JSON.parse(guardian.autoResponses) as { trigger: string; response: string }[];
        const lowerMsg = message.toLowerCase();
        const match = autoResponses.find(ar => lowerMsg.includes(ar.trigger.toLowerCase()));
        if (match) {
          const convId = await storeMessage(guardian.id, storedVisitor, visitorHandle, conversation, message, match.response);
          return NextResponse.json({ response: match.response, source: 'auto-response', conversationId: convId });
        }
      } catch { /* invalid JSON, skip */ }
    }

    // Try LLM
    if (guardian.llmApiKey && guardian.llmProvider && guardian.llmModel) {
      // RATE LIMIT: DB-backed (serverless-safe) so the public can't burn the
      // guardian owner's LLM budget. Fail-closed 429 when over or unknowable.
      // The durable reservation is the budget itself: one unit per outbound
      // call, taken before the call, on this guardian's key.
      if (!(await checkGuardianRateLimit(guardian.id)) || !(await reserveLlmCall(guardian.id))) {
        return NextResponse.json({ error: RATE_LIMITED }, { status: 429 });
      }

      const apiKey = decryptApiKey(guardian.llmApiKey);
      const systemPrompt = buildSystemPrompt(guardian);

      // Conversation history (already resolved under this guardian above)
      let history: { role: string; content: string }[] = [];
      if (conversation) {
        try { history = JSON.parse(conversation.messages); } catch { /* fresh */ }
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

      // SECURITY: world actions run only for the wallet that holds this block
      // on-chain RIGHT NOW, asked live — not for `guardian.ownerAddress`, which
      // still names the seller after a sale until the release runs, so a former
      // owner kept building on land they sold (bg48 Q-02). Asked lazily, once.
      let worldGate: GateResult | null = null;
      const actorHoldsBlock = async (): Promise<boolean> => {
        if (!verifiedVisitorAddress) return false;
        worldGate ??= await requireSignedBlockOwner(verifiedVisitorAddress, guardian.blockHeight);
        return worldGate.ok;
      };

      // Check if response contains world-building tool calls (JSON blocks)
      // SECURITY: Only execute world actions if the visitor IS the block owner
      // This prevents prompt injection from allowing non-owners to modify the world
      const worldActions = extractWorldActions(response);
      let finalResponse = response;
      if (worldActions.length > 0) {
        if (await actorHoldsBlock()) {
          const results = await executeWorldActions(worldActions, guardian.blockHeight, verifiedVisitorAddress!);
          finalResponse = response.replace(/```json\n\{[\s\S]*?\}\n```/g, '').trim();
          if (results.length > 0) {
            finalResponse += '\n\n' + results.map(r => r.success ? `✅ ${r.action}` : `❌ ${r.error}`).join('\n');
          }
        } else {
          // Non-owner tried to trigger world actions — strip them silently
          finalResponse = response.replace(/```json\n\{[\s\S]*?\}\n```/g, '').trim();
          if ((worldGate as GateResult | null)?.code === 'onchain_unavailable') {
            finalResponse += '\n\n⚠️ On-chain ownership could not be confirmed right now, so no world changes were made.';
          }
        }
      }

      // TWO-PASS BUILD SYSTEM: If the LLM didn't output JSON tool calls but the owner
      // sent a build request, make a second structured call to generate build actions.
      if (worldActions.length === 0 && isBuildRequest(message) && (await actorHoldsBlock())) {
        console.log('[Guardian Chat] Two-pass build: detected build intent, making structured call');
        // The second pass is a second outbound call: it reserves its own unit.
        if (!(await reserveLlmCall(guardian.id))) {
          finalResponse += '\n\n⚠️ This guardian reached its hourly limit, so the build was not started. Please try again later.';
        } else try {
          const buildActions = await generateBuildActions({
            provider: guardian.llmProvider,
            model: guardian.llmModel,
            apiKey,
            endpoint: guardian.llmEndpoint || undefined,
            guardianId: guardian.id,
            userMessage: message,
          });

          if (buildActions.length > 0) {
            const results = await executeWorldActions(buildActions, guardian.blockHeight, verifiedVisitorAddress!);
            if (results.length > 0) {
              finalResponse += '\n\n' + results.map(r => r.success ? `✅ ${r.action}` : `❌ ${r.error}`).join('\n');
            }
          } else {
            finalResponse += '\n\n⚠️ I understood your request but couldn\'t generate the build plan. Please try again with simpler instructions.';
          }
        } catch (err) {
          console.error('[Guardian Chat] Two-pass build error:', err);
          finalResponse += '\n\n⚠️ I understood your request but couldn\'t generate the build plan. Please try again with simpler instructions.';
        }
      }

      const convId = await storeMessage(guardian.id, storedVisitor, visitorHandle, conversation, message, finalResponse);
      return NextResponse.json({ response: finalResponse, source: 'llm', conversationId: convId });
    }

    // No LLM — escalate. At most 20 forwards an hour from one IP: beyond that
    // nothing is stored and nobody is notified.
    const ipLimit = await rateLimitDurable(`guardian-escalation-ip:${clientIpFrom(req)}`, 20, HOUR_MS);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many messages forwarded from this address. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSec) } }
      );
    }

    await prisma.guardianEvent.create({
      data: {
        guardianId: guardian.id,
        eventType: 'escalation',
        data: JSON.stringify({ visitorAddress: storedVisitor, visitorHandle, message }),
      },
    });

    // Tell the owner's configured Telegram/email that a message waits in the
    // monitor: a fixed notice, at most 5 an hour per guardian (the event row
    // above is kept either way). Best-effort; no-ops without env keys.
    const noticeLimit = await rateLimitDurable(`guardian-escalation-notice:${guardian.id}`, 5, HOUR_MS);
    if (noticeLimit.allowed) await notifyEscalation(guardian.id, guardian.blockHeight);

    // Also broadcast to registered BitmapAgents on this block so autonomous
    // agents can pick up the escalation from their event stream.
    void emitAgentEvent(guardian.blockHeight, 'escalation', {
      actor: verifiedVisitorAddress || 'anonymous',
      actorHandle: visitorHandle ? String(visitorHandle).slice(0, 50) : 'anon',
      guardianId: guardian.id,
      summary: `Escalation: guardian ${guardian.name} has no LLM configured — visitor message forwarded to owner: ${message.slice(0, 140)}`,
    });

    const fallback = "I'll forward your message to the block owner. They'll get back to you soon! 📨";
    const convId = await storeMessage(guardian.id, storedVisitor, visitorHandle, conversation, message, fallback);
    return NextResponse.json({ response: fallback, source: 'escalation', conversationId: convId });
  } catch (err: unknown) {
    console.error('[Guardian Chat]', err);
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 });
  }
}

const BUILD_KEYWORDS = [
  'build', 'place', 'create', 'make', 'add', 'put', 'terraform', 'clear', 'remove',
  'garden', 'park', 'house', 'castle', 'tower', 'forest', 'village', 'city', 'bridge',
  'fountain', 'statue', 'tree', 'flower', 'bench', 'path', 'fence', 'gazebo', 'pond',
  'shop', 'building', 'lamp', 'arch', 'hedge', 'pergola', 'decorate', 'landscape',
  'destroy', 'demolish', 'erase', 'wipe', 'reset',
];

function isBuildRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return BUILD_KEYWORDS.some(kw => lower.includes(kw));
}

const STRUCTURED_BUILD_PROMPT = `You are a 3D world builder. Convert the user's building request into a JSON array of tool calls.
Output ONLY a JSON array, nothing else. No text, no explanation, just the array.

Available tools and prefab types:
- place_prefab: {tool: "place_prefab", prefabType: "<type>", posX, posY, posZ, rotY, scaleX, scaleY, scaleZ, name}
  Types: tree_oak, tree_pine, tree_palm, tree_cherry_blossom, bush, flower_rose, flower_tulip, flower_sunflower, grass_patch, pond, rock, log, bench, path_stone, path_dirt, fountain, lamp_post, fence, gate, gazebo, bridge, building_small, building_tall, shop, sign, mailbox, trash_can, fire_hydrant, statue, flag, banner, planter, hedge_wall, arch, pergola, factory, warehouse, crane, smokestack, water_tower, windmill, solar_panel, house_small, house_modern, apartment, cottage, cabin, office_tower, restaurant, cafe, hotel, mall, stage, screen, ferris_wheel, amphitheater, road_straight, road_curve, road_intersection, parking_lot, highway_ramp, pool, canal, waterfall, dock, pier, lighthouse, dome, antenna, satellite_dish, monolith, portal_gate, neon_sign, hologram_display, farm_field, barn, silo, greenhouse, vineyard
- place_object: {tool: "place_object", objectType: "primitive", geometry: "box|sphere|cylinder|cone|torus", color: "#hex", material: "glass|metal|wood|concrete|neon|water", posX, posY, posZ, scaleX, scaleY, scaleZ, name}
- terraform: {tool: "terraform", surfaceType: "grass|dirt|stone|water|sand|snow|lava|crystal|void|neon_grid|marble|mossy_stone"}
- clear_area: {tool: "clear_area", posX, posZ, radius}

Rules:
- Be GENEROUS with objects. A park should have 20-50+ objects.
- Spread objects across a -25 to +25 coordinate range.
- posY is always 0 (ground level) unless building vertically.
- Use variety — mix tree types, flower types, etc.
- Output valid JSON array only. Example: [{"tool":"terraform","surfaceType":"grass"},{"tool":"place_prefab","prefabType":"fountain","posX":0,"posY":0,"posZ":0,"name":"Fountain"}]`;

async function generateBuildActions(config: {
  provider: string;
  model: string;
  apiKey: string;
  endpoint?: string;
  guardianId: string;
  userMessage: string;
}): Promise<WorldAction[]> {
  const response = await callLLM({
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
    endpoint: config.endpoint,
    systemPrompt: STRUCTURED_BUILD_PROMPT,
    messages: [{ role: 'user', content: config.userMessage }],
    guardianId: config.guardianId,
    temperature: 0,
  });

  console.log('[Guardian Chat] Structured build response:', response.slice(0, 500));

  // Try parsing the whole response as JSON
  try {
    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* not pure JSON */ }

  // Try extracting JSON array from response
  const arrayMatch = response.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* invalid JSON */ }
  }

  console.error('[Guardian Chat] Could not parse build actions from response');
  return [];
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

### place_object
Create a primitive 3D object. objectType: primitive/light/effect/text3d/sound, geometry: box/sphere/cylinder/cone/torus/plane/ring.
Example: {"tool": "place_object", "objectType": "primitive", "geometry": "box", "color": "#f7931a", "posX": 0, "posY": 1, "posZ": 0, "scaleX": 2, "scaleY": 3, "scaleZ": 2, "name": "Tower Base"}

### place_prefab
Place a rich pre-built object from the prefab catalog. These are detailed multi-mesh compositions.
Params: prefabType (required), posX, posY, posZ, rotX, rotY, rotZ (degrees), scaleX, scaleY, scaleZ, name.
Example: {"tool": "place_prefab", "prefabType": "tree_oak", "posX": 5, "posY": 0, "posZ": 3, "scaleX": 1, "scaleY": 1, "scaleZ": 1, "name": "Big Oak"}

Available prefab types:
- Nature: tree_oak, tree_pine, tree_palm, tree_cherry_blossom, bush, flower_rose, flower_tulip, flower_sunflower, grass_patch, pond, rock, log
- Park: bench, path_stone, path_dirt, fountain, lamp_post, fence, gate, gazebo, bridge
- Urban: building_small, building_tall, shop, sign, mailbox, trash_can, fire_hydrant
- Decorative: statue, flag, banner, planter, hedge_wall, arch, pergola
- Industrial: factory, warehouse, crane, smokestack, water_tower, windmill, solar_panel
- Residential: house_small, house_modern, apartment, cottage, cabin
- Commercial: office_tower, restaurant, cafe, hotel, mall
- Entertainment: stage, screen, ferris_wheel, amphitheater
- Infrastructure: road_straight, road_curve, road_intersection, parking_lot, highway_ramp
- Water: pool, canal, waterfall, dock, pier, lighthouse
- Sci-fi: dome, antenna, satellite_dish, monolith, portal_gate, neon_sign, hologram_display
- Agricultural: farm_field, barn, silo, greenhouse, vineyard

Available material presets for place_object (optional "material" field):
- glass (transparent, reflective), metal (shiny, reflective), wood (brown, matte), concrete (gray, rough), neon (glowing/emissive), water (blue, transparent)

### place_group
Place multiple prefabs at once for efficiency (e.g., a row of trees, a garden).
Params: items[] — each item has: prefabType, posX, posY, posZ, rotX, rotY, rotZ, scaleX, scaleY, scaleZ, name.
Example: {"tool": "place_group", "items": [{"prefabType": "tree_pine", "posX": 0, "posY": 0, "posZ": 0}, {"prefabType": "tree_pine", "posX": 3, "posY": 0, "posZ": 0}]}

### modify_terrain
Change ground, fog, sky, weather. Params: groundColor, fogEnabled, fogColor, skyColor, weather (rain/snow/storm/aurora/fireflies/none).

### terraform
Change ground surface in an area. Params: posX, posZ, radius, surfaceType (grass/dirt/stone/water/sand/snow/lava/crystal/void/neon_grid/marble/mossy_stone), color (optional hex override).
Example: {"tool": "terraform", "posX": 0, "posZ": 0, "radius": 5, "surfaceType": "grass"}

### clear_area
Remove all objects within a radius. Params: posX, posZ, radius.
Example: {"tool": "clear_area", "posX": 0, "posZ": 0, "radius": 10}

### create_estate
Merge parcels into a named estate. Params: name, parcelIndices[] (array of parcel index numbers), glowColor (optional hex).
Example: {"tool": "create_estate", "name": "Central Park", "parcelIndices": [0, 1, 2, 3], "glowColor": "#4CAF50"}

### remove_object
Delete an object by id. Params: id.

### list_objects
List all placed objects. No params needed.

CRITICAL RULES FOR BUILDING:
1. When the owner asks you to build ANYTHING, you MUST include the JSON tool call blocks in your response. Without them, NOTHING gets built.
2. Always wrap each tool call in a \`\`\`json code block.
3. Use place_group for multiple items (more efficient than many individual place_prefab calls).
4. Be generous with objects — a park should have MANY trees, flowers, benches, etc.
5. Keep your text response brief — focus on the tool calls.
6. You can include multiple \`\`\`json blocks in one response.

Example of a correct building response:
"Let me build that for you!
\`\`\`json
{"tool": "terraform", "posX": 0, "posZ": 0, "radius": 15, "surfaceType": "grass"}
\`\`\`
\`\`\`json
{"tool": "place_group", "items": [{"prefabType": "tree_oak", "posX": 5, "posY": 0, "posZ": 3}, {"prefabType": "fountain", "posX": 0, "posY": 0, "posZ": 0}]}
\`\`\`"
`;
  return prompt;
}

function extractWorldActions(response: string): WorldAction[] {
  const actions: WorldAction[] = [];
  const regex = /```json\n(\{[\s\S]*?\})\n```/g;
  let match;
  while ((match = regex.exec(response)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.tool) actions.push(parsed as WorldAction);
    } catch { /* skip invalid JSON */ }
  }
  return actions;
}

interface WorldAction {
  tool: string;
  objectType?: string;
  prefabType?: string;
  geometry?: string;
  color?: string;
  posX?: number;
  posY?: number;
  posZ?: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  name?: string;
  items?: WorldAction[];
  groundColor?: string;
  surfaceType?: string;
  fogEnabled?: boolean;
  fogColor?: string;
  skyColor?: string;
  radius?: number;
  id?: string;
}

/**
 * Items one `place_group` may place. A group comes from LLM output, so its size
 * is whatever the model wrote; 25 covers the prefab sets the build prompt asks
 * for (a cluster of trees, a ring of lamps) while keeping one chat turn from
 * spending more than an eighth of the block's MAX_PLACEMENTS.
 */
const PLACE_GROUP_ITEM_CAP = 25;

async function executeWorldActions(actions: WorldAction[], blockHeight: number, ownerAddress: string) {
  const results: { action: string; success: boolean; error?: string }[] = [];

  // The legacy world counts against the same per-block cap as bg-world/1:
  // counted once, then decremented as this turn places objects.
  let room = Math.max(0, MAX_PLACEMENTS - (await prisma.blockObject.count({ where: { blockHeight, visible: true } })));
  const full = (n: number, m: number) =>
    `placed ${n} of ${m}: this block holds at most ${MAX_PLACEMENTS} objects; remove some first`;

  for (const action of actions) {
    try {
      if ((action.tool === 'place_object' || action.tool === 'place_prefab') && room <= 0) {
        results.push({ action: action.tool, success: false, error: full(0, 1) });

      } else if (action.tool === 'place_object' || action.tool === 'place_prefab') {
        const isPrefab = action.tool === 'place_prefab';
        const obj = await prisma.blockObject.create({
          data: {
            blockHeight,
            ownerAddress,
            objectType: isPrefab ? 'prefab' : (action.objectType || 'primitive'),
            geometry: isPrefab ? action.prefabType : (action.geometry || 'box'),
            color: action.color || '#f7931a',
            posX: action.posX || 0,
            posY: action.posY || 0,
            posZ: action.posZ || 0,
            rotX: action.rotX || 0,
            rotY: action.rotY || 0,
            rotZ: action.rotZ || 0,
            scaleX: action.scaleX || 1,
            scaleY: action.scaleY || 1,
            scaleZ: action.scaleZ || 1,
            name: action.name || (isPrefab ? action.prefabType : action.geometry),
            visible: true,
          },
        });
        room--;
        results.push({ action: `Placed ${action.name || action.prefabType || action.geometry} (${obj.id})`, success: true });

      } else if (action.tool === 'place_group') {
        const items = Array.isArray(action.items) ? action.items : [];
        const groupAllows = Math.min(items.length, PLACE_GROUP_ITEM_CAP);
        const allowed = Math.min(groupAllows, room);
        let placed = 0;
        for (const item of items.slice(0, allowed)) {
          await prisma.blockObject.create({
            data: {
              blockHeight,
              ownerAddress,
              objectType: 'prefab',
              geometry: item.prefabType || 'tree_oak',
              color: item.color || '#f7931a',
              posX: item.posX || 0,
              posY: item.posY || 0,
              posZ: item.posZ || 0,
              rotX: item.rotX || 0,
              rotY: item.rotY || 0,
              rotZ: item.rotZ || 0,
              scaleX: item.scaleX || 1,
              scaleY: item.scaleY || 1,
              scaleZ: item.scaleZ || 1,
              name: item.name || item.prefabType,
              visible: true,
            },
          });
          placed++;
          room--;
        }
        if (placed < items.length) {
          const why = allowed < groupAllows
            ? `this block holds at most ${MAX_PLACEMENTS} objects`
            : `one group places at most ${PLACE_GROUP_ITEM_CAP} items`;
          const note = `placed ${placed} of ${items.length} (${why})`;
          results.push({ action: note, success: placed > 0, error: note });
        } else {
          results.push({ action: `Placed group of ${placed}/${items.length} objects`, success: placed > 0 });
        }

      } else if (action.tool === 'modify_terrain' || action.tool === 'terraform') {
        const surfaceColors: Record<string, string> = {
          grass: '#7CFC00', dirt: '#8B7355', stone: '#9E9E9E', water: '#4FC3F7', sand: '#F4E5C2',
          snow: '#F0F4FF', lava: '#FF4400', crystal: '#88DDFF', void: '#0a0a14',
          neon_grid: '#00FF88', marble: '#E8E0D8', mossy_stone: '#6B8E5A',
        };
        const groundColor = action.groundColor || action.color || (action.surfaceType && surfaceColors[action.surfaceType]) || '#7CFC00';
        const updateData: Record<string, unknown> = { groundColor };
        if (action.fogEnabled !== undefined) updateData.fogEnabled = action.fogEnabled;
        if (action.fogColor) updateData.fogColor = action.fogColor;
        if (action.skyColor) updateData.skyColor = action.skyColor;
        await prisma.blockTerrain.upsert({
          where: { blockHeight },
          create: { blockHeight, ownerAddress, groundColor },
          update: updateData,
        });
        results.push({ action: `Terraformed to ${action.surfaceType || groundColor}`, success: true });

      } else if (action.tool === 'clear_area') {
        const cx = action.posX || 0;
        const cz = action.posZ || 0;
        const radius = action.radius || 5;
        const objects = await prisma.blockObject.findMany({ where: { blockHeight, visible: true } });
        let cleared = 0;
        for (const obj of objects) {
          const dx = (obj.posX || 0) - cx;
          const dz = (obj.posZ || 0) - cz;
          if (Math.sqrt(dx * dx + dz * dz) <= radius) {
            await prisma.blockObject.update({ where: { id: obj.id }, data: { visible: false } });
            cleared++;
          }
        }
        results.push({ action: `Cleared ${cleared} objects in radius ${radius}`, success: true });

      } else if (action.tool === 'create_estate') {
        results.push({ action: `Estate "${action.name}" creation requested`, success: true });

      } else if (action.tool === 'remove_object' && action.id) {
        // Scoped to this guardian's block: an id from another block's public
        // world listing must not hide that block's object (bg48 Q-02).
        const hidden = await prisma.blockObject.updateMany({
          where: { id: action.id, blockHeight },
          data: { visible: false },
        });
        results.push(
          hidden.count === 1
            ? { action: `Removed object ${action.id}`, success: true }
            : { action: action.tool, success: false, error: `Object ${action.id} is not on block ${blockHeight}` }
        );

      } else if (action.tool === 'list_objects') {
        const objects = await prisma.blockObject.findMany({ where: { blockHeight, visible: true } });
        results.push({ action: `Found ${objects.length} objects`, success: true });
      }
    } catch (e) {
      results.push({ action: action.tool, success: false, error: String(e) });
    }
  }
  return results;
}

/**
 * Append to `conversation` (already resolved under `guardianId`), or start a
 * new one whose id is 32 random bytes: the id is the visitor's capability to
 * continue the chat, so it must not be guessable.
 */
async function storeMessage(
  guardianId: string, visitorAddress: string | null, visitorHandle: unknown,
  conversation: StoredConversation | null, userMsg?: string, aiMsg?: string
): Promise<string> {
  const newMessages = [];
  if (userMsg) newMessages.push({ role: 'user', content: userMsg, ts: Date.now() });
  if (aiMsg) newMessages.push({ role: 'assistant', content: aiMsg, ts: Date.now() });

  if (conversation) {
    // Re-read: the LLM call may have taken a while.
    const existing = await prisma.guardianConversation.findFirst({ where: { id: conversation.id, guardianId } });
    let msgs = [];
    try { msgs = JSON.parse((existing ?? conversation).messages); } catch { /* */ }
    msgs.push(...newMessages);
    await prisma.guardianConversation.update({
      where: { id: conversation.id },
      data: { messages: JSON.stringify(msgs) },
    });
    return conversation.id;
  }

  const conv = await prisma.guardianConversation.create({
    data: {
      id: randomBytes(32).toString('base64url'),
      guardianId,
      visitorAddress,
      visitorHandle: typeof visitorHandle === 'string' ? visitorHandle.slice(0, 50) : null,
      messages: JSON.stringify(newMessages),
    },
  });
  return conv.id;
}
