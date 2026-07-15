/**
 * Brain moral-judge hook for experience manifests.
 *
 * Reuses the EXISTING Brain runtime (boot → analyze against the soul's moral
 * code) to screen the human-readable manifest text (name + description) before
 * an experience is accepted. This is a publication gate: unlike the chat path
 * (where a Brain flag counts as one community flag), a clear violation here
 * blocks registration outright and records a ContentFlag.
 *
 * The violation detector is deterministic regex (engine.ts), independent of the
 * soul's source, so the gate still functions in DEGRADED mode; the soul only
 * supplies the human-readable rule text for the reasoning. We surface the Brain
 * status so callers can log whether the soul was inscription-verified.
 */

import { bootBrain, getBrainState, analyzeContent } from './brain';
import type { BrainStatus } from './brain';

export interface ManifestJudgement {
  violated: boolean;
  ruleIndex: number | null;
  reasoning: string;
  brainStatus: BrainStatus;
}

export async function judgeExperienceManifest(input: {
  name: string;
  description?: string | null;
  walletAddress: string;
  blockHeight: number;
}): Promise<ManifestJudgement> {
  const state = getBrainState() ?? (await bootBrain());
  const text = [input.name, input.description].filter(Boolean).join('\n');

  const result = analyzeContent(
    {
      contentType: 'experience',
      contentId: 'pending',
      text,
      authorAddress: input.walletAddress,
      blockHeight: input.blockHeight,
      createdAt: new Date(),
    },
    state.soul!,
  );

  return {
    violated: result.violated,
    ruleIndex: result.ruleIndex,
    reasoning: result.reasoning,
    brainStatus: state.status,
  };
}
