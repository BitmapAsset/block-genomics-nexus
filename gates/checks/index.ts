// The built checks, in report order. A check becomes live by adding its file here and its tests.
import type { Check } from '../lib/types.ts';
import { gDistrict } from './g-district.ts';
import { gMap } from './g-map.ts';
import { gOpen } from './g-open.ts';
import { gOwnerOnly } from './g-owner-only.ts';
import { gSecCi } from './g-sec-ci.ts';
import { gLiveFrame } from './g-live-frame.ts';

export const checks: readonly Check[] = [gMap, gDistrict, gOwnerOnly, gOpen, gLiveFrame, gSecCi];
