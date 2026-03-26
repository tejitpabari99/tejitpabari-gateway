import { readFileSync, writeFileSync } from 'fs';

const LINKS_FILE = '/root/projects/cc-gateway/content/links.json';

function readLinks() {
  try {
    return JSON.parse(readFileSync(LINKS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeLinks(links) {
  writeFileSync(LINKS_FILE, JSON.stringify(links, null, 2));
}

function titleCaseTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map(tag =>
    String(tag).replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1))
  );
}

export function listLinks() {
  return readLinks();
}

export function getLink(slug) {
  const links = readLinks();
  return links.find(l => l.slug.toLowerCase() === slug.toLowerCase()) || null;
}

export function saveLink({ slug, url, tags, expiresAt, redirectType, existingSlug }) {
  const links = readLinks();
  const normalizedSlug = slug.toLowerCase();
  const normalizedTags = titleCaseTags(tags);
  const today = new Date().toISOString().split('T')[0];

  // Check uniqueness (excluding self on edit)
  const conflict = links.find(
    l => l.slug.toLowerCase() === normalizedSlug && l.slug !== existingSlug
  );
  if (conflict) throw new Error(`Slug "${normalizedSlug}" already exists`);

  if (existingSlug) {
    // Update existing
    const idx = links.findIndex(l => l.slug === existingSlug);
    if (idx === -1) throw new Error('Link not found');
    links[idx] = {
      ...links[idx],
      slug: normalizedSlug,
      url,
      tags: normalizedTags,
      expiresAt: expiresAt || null,
      redirectType: redirectType || '302',
    };
  } else {
    // Create new
    links.push({
      slug: normalizedSlug,
      url,
      tags: normalizedTags,
      created: today,
      clicks: 0,
      lastClicked: null,
      expiresAt: expiresAt || null,
      redirectType: redirectType || '302',
    });
  }

  writeLinks(links);
  return normalizedSlug;
}

export function deleteLink(slug) {
  const links = readLinks();
  const idx = links.findIndex(l => l.slug === slug);
  if (idx === -1) throw new Error('Link not found');
  links.splice(idx, 1);
  writeLinks(links);
}

export function recordClick(slug) {
  const links = readLinks();
  const link = links.find(l => l.slug.toLowerCase() === slug.toLowerCase());
  if (!link) return;
  link.clicks = (link.clicks || 0) + 1;
  link.lastClicked = new Date().toISOString();
  writeLinks(links);
}
