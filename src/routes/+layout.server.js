import { readSettings } from '$lib/settings.js';

export function load({ locals }) {
  const settings = readSettings();
  return { role: locals.role, guestVisibility: settings.guestVisibility || {} };
}
