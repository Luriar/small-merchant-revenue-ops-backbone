import { SCENARIO, DEFAULT_STATUSES } from './revenueCockpitCopy';
import type { Scenario, ActionStatuses } from './revenueCockpitTypes';

export const USE_API =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('data') === 'api';

export function getMockData(): { scenario: Scenario; defaultStatuses: ActionStatuses } {
  return { scenario: SCENARIO, defaultStatuses: DEFAULT_STATUSES };
}
