import { redirect, fail } from '@sveltejs/kit';
import { readSettings, writeSettings, readCriteria, writeCriteria } from '$lib/settings.js';

export function load({ locals }) {
  if (locals.role !== 'admin') throw redirect(302, '/');
  const settings = readSettings();
  return {
    guestVisibility: settings.guestVisibility || {},
    criteria: readCriteria()
  };
}

export const actions = {
  save: async ({ request, locals }) => {
    if (locals.role !== 'admin') throw redirect(302, '/');

    const data = await request.formData();
    const settings = readSettings();

    // Pages we manage visibility for
    const pages = ['/', '/ideas', '/links', '/dashboard'];
    const guestVisibility = {};
    for (const page of pages) {
      guestVisibility[page] = data.get(`page_${page.replace('/', '_')}`) === 'on';
    }

    settings.guestVisibility = guestVisibility;
    writeSettings(settings);

    return { success: true };
  },

  saveCriteria: async ({ request, locals }) => {
    if (locals.role !== 'admin') return fail(403, { error: 'Forbidden' });
    const fd = await request.formData();
    let criteria;
    try {
      criteria = JSON.parse(fd.get('criteria'));
    } catch {
      return fail(400, { criteriaError: 'Invalid data' });
    }
    if (!Array.isArray(criteria) || criteria.length === 0) {
      return fail(400, { criteriaError: 'At least one criterion required' });
    }
    // Validate each criterion
    for (const c of criteria) {
      if (!c.id || !c.label) return fail(400, { criteriaError: 'Each criterion needs id and label' });
      const w = parseInt(c.weight, 10);
      if (isNaN(w) || w < 1) return fail(400, { criteriaError: `Weight must be ≥ 1 (got "${c.weight}" for "${c.label}")` });
      c.weight = w;
      c.invert = !!c.invert;
    }
    // Check for duplicate ids
    const ids = criteria.map(c => c.id);
    if (new Set(ids).size !== ids.length) return fail(400, { criteriaError: 'Duplicate criterion ids' });
    writeCriteria(criteria);
    return { criteriaSuccess: true };
  }
};
