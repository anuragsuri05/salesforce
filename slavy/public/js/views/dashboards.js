// Dashboards home: same navigation/list experience as Reports.
import { analyticsHome } from './reports.js';

export default async function (root, ctx) {
  return analyticsHome(root, { ...ctx, kind: 'dashboard' });
}
