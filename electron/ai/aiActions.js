'use strict';

const { schemas, validators } = require('./schemas');
const { promptBuilders, promptTemplates } = require('./prompts');

const actions = {
  vocabulary: { id: 'vocabulary', label: 'Create Vocabulary Table', description: 'Generate student-friendly terms and definitions.', requiresSelection: true, defaultMaxTokens: 768, schema: schemas.vocabulary, validate: validators.vocabulary, defaultPrompt: promptTemplates.vocabulary, buildPrompt: promptBuilders.vocabulary },
  vocabularyExamples: { id: 'vocabularyExamples', label: 'Create Vocabulary Table with Examples', description: 'Generate definitions and classroom-friendly examples.', requiresSelection: true, defaultMaxTokens: 1024, schema: schemas.vocabularyExamples, validate: validators.vocabularyExamples, defaultPrompt: promptTemplates.vocabularyExamples, buildPrompt: promptBuilders.vocabularyExamples },
  distractors: { id: 'distractors', label: 'Generate Multiple-Choice Distractors', description: 'Generate three plausible incorrect answers.', requiresSelection: true, defaultMaxTokens: 320, schema: schemas.distractors, validate: validators.distractors, defaultPrompt: promptTemplates.distractors, buildPrompt: promptBuilders.distractors },
  quiz: { id: 'quiz', label: 'Generate Quiz Questions', description: 'Create multiple-choice questions in the style of this handout.', requiresSelection: false, defaultMaxTokens: 1200, schema: schemas.quiz, validate: validators.quiz, defaultPrompt: promptTemplates.quiz, buildPrompt: promptBuilders.quiz }
};

function listActions() {
  return Object.values(actions).map(({ id, label, description, requiresSelection }) => ({ id, label, description, requiresSelection }));
}

function getAction(id) {
  const action = actions[id];
  if (!action) throw new Error('Unknown AI action.');
  return action;
}

module.exports = { actions, getAction, listActions };
