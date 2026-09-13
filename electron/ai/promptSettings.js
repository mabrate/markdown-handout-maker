'use strict';

const DEFAULT_GLOBAL_AI_PROMPT = `You are an expert middle-school instructional materials assistant.
Create accurate, age-appropriate, classroom-ready content.
Follow the action-specific instructions and required output format exactly.
If the provided context is insufficient, do not invent facts.`;

const MIN_GENERATED_TOKENS = 64;
const MAX_GENERATED_TOKENS = 2048;
const DEFAULT_CONTEXT_SIZE = 3072;
const MIN_CONTEXT_SIZE = 2048;
const MAX_CONTEXT_SIZE = 8192;

function resolvedGlobalPrompt(settings = {}) {
  return typeof settings.globalAiPrompt === 'string' ? settings.globalAiPrompt : DEFAULT_GLOBAL_AI_PROMPT;
}

function resolvedActionPrompt(settings, action) {
  const saved = settings?.aiActionPrompts?.[action.id];
  return typeof saved === 'string' ? saved : action.defaultPrompt;
}

function normalizedTokenLimit(value, fallback) {
  const tokens = Number(value);
  return Number.isInteger(tokens) && tokens >= MIN_GENERATED_TOKENS && tokens <= MAX_GENERATED_TOKENS ? tokens : fallback;
}

function resolvedActionMaxTokens(settings, action) {
  return normalizedTokenLimit(settings?.aiActionMaxTokens?.[action.id], action.defaultMaxTokens);
}

function normalizedContextSize(value, fallback = DEFAULT_CONTEXT_SIZE) {
  const tokens = Number(value);
  return Number.isInteger(tokens) && tokens >= MIN_CONTEXT_SIZE && tokens <= MAX_CONTEXT_SIZE ? tokens : fallback;
}

function resolvedContextSize(settings = {}) {
  return normalizedContextSize(settings.aiContextSize);
}

function assemblePrompt(globalPrompt, actionPrompt) {
  return [String(globalPrompt || '').trim(), String(actionPrompt || '').trim()].filter(Boolean).join('\n\n');
}

module.exports = { DEFAULT_CONTEXT_SIZE, DEFAULT_GLOBAL_AI_PROMPT, MAX_CONTEXT_SIZE, MAX_GENERATED_TOKENS, MIN_CONTEXT_SIZE, MIN_GENERATED_TOKENS, assemblePrompt, normalizedContextSize, normalizedTokenLimit, resolvedActionMaxTokens, resolvedActionPrompt, resolvedContextSize, resolvedGlobalPrompt };
