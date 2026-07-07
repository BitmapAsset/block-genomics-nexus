import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decryptApiKey } from '@/lib/key-encryption';
import { callLLM, checkGuardianRateLimit } from '@/lib/llm-proxy';
import { verifyWalletSignature } from '@/lib/api-helpers';
import { notifyEscalation } from '@/lib/escalation-notify';

/** Strip control characters to mitigate prompt injection */
function stripControlChars(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export async function POST(req: NextRequest) {
  try {
    const { blockHeight, message: rawMessage, visitorAddress, visitorHandle, conversationId, signature, signedMessage } = await req.json();

    if (!blockHeight || !rawMessage) {
      return NextResponse.json({ error: 'blockHeight and message required' }, { status: 400 });
    }

    // Input sanitization — limit message length and strip control characters
    if (typeof rawMessage !== 'string' || rawMessage.length > 4000) {
      return NextResponse.json({ error: 'Message too long (max 4000 chars)' }, { status: 400 });
    }

    // SECURITY: Strip control characters to reduce prompt injection risk
    const message = stripControlChars(rawMessage);

    // SECURITY: Verify visitorAddress via wallet signature if provided
    // This prevents spoofing the visitor identity for owner-only actions
    let verifiedVisitorAddress = visitorAddress;
    if (visitorAddress && signature && signedMessage) {
      if (!verifyWalletSignature(visitorAddress, signedMessage, signature)) {
        verifiedVisitorAddress = undefined; // Treat as anonymous if sig fails
      }
    } else {
      // Without signature verification, do not trust visitorAddress for owner checks
      verifiedVisitorAddress = undefined;
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
      // RATE LIMIT: DB-backed (serverless-safe) so the public can't burn the
      // guardian owner's LLM budget. Fail-closed 429 when over or unknowable.
      if (!(await checkGuardianRateLimit(guardian.id))) {
        return NextResponse.json(
          { error: 'Rate limit exceeded — max 60 messages/hour for this guardian. Please try again later.' },
          { status: 429 }
        );
      }

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
      // SECURITY: Only execute world actions if the visitor IS the block owner
      // This prevents prompt injection from allowing non-owners to modify the world
      const worldActions = extractWorldActions(response);
      let finalResponse = response;
      if (worldActions.length > 0) {
        if (verifiedVisitorAddress === guardian.ownerAddress) {
          const results = await executeWorldActions(worldActions, parseInt(blockHeight), guardian.ownerAddress);
          finalResponse = response.replace(/```json\n\{[\s\S]*?\}\n```/g, '').trim();
          if (results.length > 0) {
            finalResponse += '\n\n' + results.map(r => r.success ? `✅ ${r.action}` : `❌ ${r.error}`).join('\n');
          }
        } else {
          // Non-owner tried to trigger world actions — strip them silently
          finalResponse = response.replace(/```json\n\{[\s\S]*?\}\n```/g, '').trim();
        }
      }

      // TWO-PASS BUILD SYSTEM: If the LLM didn't output JSON tool calls but the owner
      // sent a build request, make a second structured call to generate build actions.
      if (worldActions.length === 0 && verifiedVisitorAddress === guardian.ownerAddress && isBuildRequest(message)) {
        console.log('[Guardian Chat] Two-pass build: detected build intent, making structured call');
        try {
          const buildActions = await generateBuildActions({
            provider: guardian.llmProvider,
            model: guardian.llmModel,
            apiKey,
            endpoint: guardian.llmEndpoint || undefined,
            guardianId: guardian.id,
            userMessage: message,
          });

          if (buildActions.length > 0) {
            const results = await executeWorldActions(buildActions, parseInt(blockHeight), guardian.ownerAddress);
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

    // Deliver to the owner's configured Telegram/email (best-effort, no-ops if
    // env keys or escalation channels aren't configured)
    await notifyEscalation(guardian.id, guardian.blockHeight, message, visitorHandle || visitorAddress);

    const fallback = "I'll forward your message to the block owner. They'll get back to you soon! 📨";
    await storeMessage(guardian.id, visitorAddress, visitorHandle, conversationId, message, fallback);
    return NextResponse.json({ response: fallback, source: 'escalation' });
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

async function executeWorldActions(actions: WorldAction[], blockHeight: number, ownerAddress: string) {
  const results: { action: string; success: boolean; error?: string }[] = [];

  for (const action of actions) {
    try {
      if (action.tool === 'place_object' || action.tool === 'place_prefab') {
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
        results.push({ action: `Placed ${action.name || action.prefabType || action.geometry} (${obj.id})`, success: true });

      } else if (action.tool === 'place_group') {
        const items = action.items || [];
        let placed = 0;
        for (const item of items) {
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
        }
        results.push({ action: `Placed group of ${placed}/${items.length} objects`, success: placed > 0 });

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
        await prisma.blockObject.update({ where: { id: action.id }, data: { visible: false } });
        results.push({ action: `Removed object ${action.id}`, success: true });

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
