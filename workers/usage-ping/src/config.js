// Normalized org names excluded from every /stats query. Owner edits this list.
export const ORGS_EXCLUDE = ['tejit_test'];

// Origins counted in /stats tables (everything except `other`, where scanner junk lands).
export const KNOWN_ORIGINS = ['claude', 'google_script', 'gpt', 'gemini', 'grok', 'perplexity'];
