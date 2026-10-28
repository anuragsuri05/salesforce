// Profiles: list and detail (shared permission editor).
import { renderPermList, renderPermDetail } from './perm-editor.js';

export default async function render(container, { segments, app, query }) {
  if (segments[0]) return renderPermDetail(container, { type: 'profile', id: segments[0], app, query });
  return renderPermList(container, { type: 'profile', app });
}
