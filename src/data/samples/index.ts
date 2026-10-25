// Registry of the sample calendars (TECH_SPEC §9.5). The UI loads one with
// engine.importData(JSON.stringify(SAMPLES[id].build(startOfLocalWeek(now)))).

import type { ExportFile, Minute } from '@/shared/types';
import { buildBackToBack } from './backToBack';
import { buildFullyBooked } from './fullyBooked';
import { buildMidnight } from './midnight';
import { buildOverlapCluster } from './overlapCluster';
import { buildSparseWeek } from './sparseWeek';
import { buildStress } from './stress';

export type SampleId =
  'sparseWeek' | 'backToBack' | 'overlapCluster' | 'fullyBooked' | 'midnight' | 'stress';

export const SAMPLES: Record<
  SampleId,
  { label: string; build: (weekMonday: Minute) => ExportFile }
> = {
  sparseWeek: { label: 'Sparse week', build: buildSparseWeek },
  backToBack: { label: 'Back-to-back', build: buildBackToBack },
  overlapCluster: { label: 'Overlap cluster', build: buildOverlapCluster },
  fullyBooked: { label: 'Fully booked day', build: buildFullyBooked },
  midnight: { label: 'Midnight crossing', build: buildMidnight },
  stress: { label: 'Stress (5,000 events)', build: buildStress },
};
