import { readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import matter from 'gray-matter';
import { marked } from 'marked';

function titleCaseTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map(tag =>
    String(tag).replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1))
  );
}

const IDEAS_DIR = '/root/projects/cc-gateway/content/ideas';

export function listIdeas() {
  const files = readdirSync(IDEAS_DIR).filter(f => f.endsWith('.md'));
  return files.map(file => {
    const slug = file.replace('.md', '');
    const raw = readFileSync(`${IDEAS_DIR}/${file}`, 'utf8');
    const { data, content } = matter(raw);
    const excerpt = content.replace(/^#+\s.*/gm, '').replace(/\n+/g, ' ').trim().slice(0, 150);
    return {
      slug,
      title: data.title || slug,
      status: data.status || 'new',
      tags: titleCaseTags(data.tags),
      link: data.link || '',
      github: data.github || '',
      excerpt,
      brief: data.brief || '',
      ranked: data.ranked ?? false,
      scores: (typeof data.scores === 'object' && data.scores !== null) ? data.scores : {},
      date: data.date ? (data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date).slice(0, 10)) : '',
    };
  }).sort((a, b) => {
    if (!a.date && !b.date) return a.title.localeCompare(b.title);
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });
}

export function getIdea(slug) {
  const filePath = `${IDEAS_DIR}/${slug}.md`;
  try {
    const raw = readFileSync(filePath, 'utf8');
    const { data, content } = matter(raw);
    return {
      slug,
      title: data.title || slug,
      status: data.status || 'new',
      tags: titleCaseTags(data.tags),
      link: data.link || '',
      github: data.github || '',
      html: marked(content),
      content,
      brief: data.brief || '',
      ranked: data.ranked ?? false,
      scores: (typeof data.scores === 'object' && data.scores !== null) ? data.scores : {},
      date: data.date ? (data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date).slice(0, 10)) : '',
    };
  } catch {
    return null;
  }
}

export function saveIdeaMeta(slug, { status, tags, link, title, github, brief, ranked, scores }) {
  const filePath = `${IDEAS_DIR}/${slug}.md`;
  const raw = readFileSync(filePath, 'utf8');
  const { data, content } = matter(raw);
  if (status !== undefined) data.status = status;
  if (tags !== undefined) data.tags = titleCaseTags(tags);
  if (link !== undefined) data.link = link;
  if (title !== undefined) data.title = title;
  if (github !== undefined) data.github = github;
  if (brief !== undefined) data.brief = brief;
  if (ranked !== undefined) data.ranked = ranked;
  if (scores !== undefined) data.scores = scores;
  const updated = matter.stringify(content, data);
  writeFileSync(filePath, updated);
}

export function deleteIdea(slug) {
  unlinkSync(`${IDEAS_DIR}/${slug}.md`);
}

export function saveIdeaContent(slug, newContent, meta) {
  const filePath = `${IDEAS_DIR}/${slug}.md`;
  let existingData = {};
  try {
    const raw = readFileSync(filePath, 'utf8');
    const { data } = matter(raw);
    existingData = data;
  } catch {
    // New file — no existing data
  }
  const mergedData = { ...existingData, ...meta };
  const updated = matter.stringify(newContent, mergedData);
  writeFileSync(filePath, updated);
}
