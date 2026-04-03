// src/lib/assistant.js
import {
  listIdeas, getIdea, saveIdeaContent, saveIdeaMeta, deleteIdea
} from '$lib/ideas.js';
import {
  listLinks, getLink, saveLink, deleteLink
} from '$lib/links.js';

function slugify(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

export const TOOLS = [
  {
    name: 'search_ideas',
    description: 'Search ideas by keyword, tag, or status. Returns matching idea titles, slugs, and briefs.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword to match against title, brief, or tags' },
        tag: { type: 'string', description: 'Filter by tag (partial match, case-insensitive)' },
        status: { type: 'string', description: 'Filter by status: new, in-progress, done' }
      },
      required: []
    }
  },
  {
    name: 'get_idea',
    description: 'Get full detail for a single idea by its slug.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The idea slug (e.g. "restaurant-gpt")' }
      },
      required: ['slug']
    }
  },
  {
    name: 'create_idea',
    description: 'Create a new idea. Slug is derived automatically from the title.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Idea title' },
        brief: { type: 'string', description: 'One or two sentence summary' },
        tags: { type: 'array', items: { type: 'string' }, description: 'List of tags' }
      },
      required: ['title']
    }
  },
  {
    name: 'update_idea',
    description: 'Update metadata on an existing idea (title, status, tags, or brief). Note: the slug (filename) is not changed when the title is updated.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The idea slug' },
        title: { type: 'string' },
        status: { type: 'string', description: 'new, in-progress, or done' },
        tags: { type: 'array', items: { type: 'string' } },
        brief: { type: 'string' }
      },
      required: ['slug']
    }
  },
  {
    name: 'delete_idea',
    description: 'Permanently delete an idea by slug.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The idea slug' }
      },
      required: ['slug']
    }
  },
  {
    name: 'search_links',
    description: 'Search short links by keyword or tag. Matches against slug, URL, and tags.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword to match against slug, url, or tags' },
        tag: { type: 'string', description: 'Filter by tag (partial match, case-insensitive)' }
      },
      required: []
    }
  },
  {
    name: 'get_link',
    description: 'Get a single short link by its slug.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The link slug' }
      },
      required: ['slug']
    }
  },
  {
    name: 'create_link',
    description: 'Create a new short link.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Short slug (lowercase, a-z, 0-9, hyphens)' },
        url: { type: 'string', description: 'Full destination URL (must start with http:// or https://)' },
        tags: { type: 'array', items: { type: 'string' } },
        description: { type: 'string', description: 'Optional human-readable description of the link' }
      },
      required: ['slug', 'url']
    }
  },
  {
    name: 'update_link',
    description: 'Update an existing short link (url, tags, or description).',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The existing link slug' },
        url: { type: 'string', description: 'New destination URL' },
        tags: { type: 'array', items: { type: 'string' } },
        description: { type: 'string' }
      },
      required: ['slug']
    }
  },
  {
    name: 'delete_link',
    description: 'Permanently delete a short link by slug.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The link slug' }
      },
      required: ['slug']
    }
  }
];

export function runTool(name, args) {
  switch (name) {
    case 'search_ideas': {
      let results = listIdeas();
      // No keyword filtering — return all ideas and let Claude pick the relevant ones semantically.
      if (args.tag) {
        const t = args.tag.toLowerCase();
        results = results.filter(i => (i.tags || []).some(tag => tag.toLowerCase().includes(t)));
      }
      if (args.status) {
        results = results.filter(i => i.status === args.status);
      }
      return results.map(i => ({
        slug: i.slug,
        title: i.title,
        status: i.status,
        tags: i.tags,
        brief: i.brief,
        url: `https://cc.tejitpabari.com/ideas/${i.slug}`
      }));
    }

    case 'get_idea': {
      const idea = getIdea(args.slug);
      if (!idea) return { error: 'Idea not found' };
      return { slug: idea.slug, title: idea.title, status: idea.status, tags: idea.tags, brief: idea.brief, content: idea.content };
    }

    case 'create_idea': {
      const slug = slugify(args.title);
      const existing = getIdea(slug);
      if (existing) return { error: `An idea with slug "${slug}" already exists` };
      const today = new Date().toISOString().split('T')[0];
      saveIdeaContent(slug, '', {
        title: args.title,
        status: 'new',
        tags: args.tags || [],
        link: '',
        brief: args.brief || '',
        date: today
      });
      return { slug, title: args.title, url: `https://cc.tejitpabari.com/ideas/${slug}` };
    }

    case 'update_idea': {
      try {
        saveIdeaMeta(args.slug, {
          title: args.title,
          status: args.status,
          tags: args.tags,
          brief: args.brief
        });
        return { ok: true };
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'delete_idea': {
      try {
        deleteIdea(args.slug);
        return { ok: true };
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'search_links': {
      let results = listLinks();
      if (args.query) {
        const q = args.query.toLowerCase();
        results = results.filter(l =>
          l.slug.toLowerCase().includes(q) ||
          l.url.toLowerCase().includes(q) ||
          (l.description || '').toLowerCase().includes(q) ||
          (l.tags || []).some(t => t.toLowerCase().includes(q))
        );
      }
      if (args.tag) {
        const t = args.tag.toLowerCase();
        results = results.filter(l => (l.tags || []).some(tag => tag.toLowerCase().includes(t)));
      }
      return results.map(l => ({ slug: l.slug, url: l.url, tags: l.tags || [], description: l.description || '' }));
    }

    case 'get_link': {
      const link = getLink(args.slug);
      if (!link) return { error: 'Link not found' };
      return { slug: link.slug, url: link.url, tags: link.tags || [], description: link.description || '' };
    }

    case 'create_link': {
      try {
        const savedSlug = saveLink({ slug: args.slug, url: args.url, tags: args.tags || [], description: args.description || '' });
        return { slug: savedSlug, url: args.url };
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'update_link': {
      try {
        const existing = getLink(args.slug);
        if (!existing) return { error: 'Link not found' };
        saveLink({
          slug: args.slug,
          url: args.url !== undefined ? args.url : existing.url,
          tags: args.tags !== undefined ? args.tags : existing.tags,
          description: args.description !== undefined ? args.description : existing.description,
          existingSlug: args.slug
        });
        return { ok: true };
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'delete_link': {
      try {
        deleteLink(args.slug);
        return { ok: true };
      } catch (e) {
        return { error: e.message };
      }
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
