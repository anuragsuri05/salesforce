// Cached AI status for the current user (enabled? configured? allowed?).
import { GET } from '../api.js';

let pending = null;
export function aiStatus({ refresh = false } = {}) {
  if (!pending || refresh) pending = GET('/api/ai/status').catch(() => ({ enabled: false, canUse: false, features: {} }));
  return pending;
}
export const canGenerate = (s, feature) => !!(s && s.enabled && s.canUse && (!feature || s.features?.[feature] !== false));
window.addEventListener('slavy:ai-changed', () => { aiStatus({ refresh: true }); });
