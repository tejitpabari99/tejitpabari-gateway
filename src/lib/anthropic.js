import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

export function createAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export function anthropicConfigError() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return 'ANTHROPIC_API_KEY is not set on the server';
  }
  return null;
}

export function formatAnthropicError(error) {
  if (error?.error?.message) return error.error.message;
  if (error?.message) return error.message;
  return 'Anthropic request failed';
}
