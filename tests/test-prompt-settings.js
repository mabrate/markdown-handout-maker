'use strict';

const assert = require('assert');
const { DEFAULT_CONTEXT_SIZE, DEFAULT_GLOBAL_AI_PROMPT, assemblePrompt, normalizedContextSize, normalizedTokenLimit, resolvedActionMaxTokens, resolvedActionPrompt, resolvedContextSize, resolvedGlobalPrompt } = require('../electron/ai/promptSettings');
const { maxTokensForAction } = require('../electron/ai/aiService');
const { renderPromptTemplate } = require('../electron/ai/prompts');

assert.strictEqual(resolvedGlobalPrompt({}), DEFAULT_GLOBAL_AI_PROMPT);
assert.strictEqual(resolvedGlobalPrompt({ globalAiPrompt: '' }), '');
assert.strictEqual(resolvedGlobalPrompt({ globalAiPrompt: 'My saved prompt' }), 'My saved prompt');
assert.strictEqual(assemblePrompt('Global instructions', 'Action and content'), 'Global instructions\n\nAction and content');
assert.strictEqual(assemblePrompt('', 'Action and content'), 'Action and content');
const action = { id: 'example', defaultPrompt: 'Default {{selectedText}}' };
assert.strictEqual(resolvedActionPrompt({}, action), action.defaultPrompt);
assert.strictEqual(resolvedActionPrompt({ aiActionPrompts: { example: 'Saved {{selectedText}}' } }, action), 'Saved {{selectedText}}');
const tokenAction = { id: 'example', defaultMaxTokens: 768 };
assert.strictEqual(resolvedActionMaxTokens({}, tokenAction), 768);
assert.strictEqual(resolvedActionMaxTokens({ aiActionMaxTokens: { example: 400 } }, tokenAction), 400);
assert.strictEqual(resolvedActionMaxTokens({ aiActionMaxTokens: { example: 12 } }, tokenAction), 768);
assert.strictEqual(normalizedTokenLimit('512', null), 512);
assert.strictEqual(normalizedTokenLimit(4096, null), null);
assert.strictEqual(maxTokensForAction('vocabulary', { maxTokens: 444 }), 444);
assert.strictEqual(resolvedContextSize({}), DEFAULT_CONTEXT_SIZE);
assert.strictEqual(resolvedContextSize({ aiContextSize: 4096 }), 4096);
assert.strictEqual(resolvedContextSize({ aiContextSize: 99999 }), DEFAULT_CONTEXT_SIZE);
assert.strictEqual(normalizedContextSize('6144', null), 6144);
assert.strictEqual(normalizedContextSize(1024, null), null);
assert.strictEqual(renderPromptTemplate('Make {{questionCount}} questions from {{selectedText}}. {{aiContext}}', 'plants', { questionCount: 3, aiContext: 'Grade 7' }), 'Make 3 questions from plants. Grade 7');
console.log('global AI prompt settings test: OK');
