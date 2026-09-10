'use strict';

const { schemas, validators } = require('./schemas');
const { promptBuilders } = require('./prompts');

const actions = {
  vocabulary: { id: 'vocabulary', label: 'Create Vocabulary Table', description: 'Generate student-friendly terms and definitions.', requiresSelection: true, schema: schemas.vocabulary, validate: validators.vocabulary, buildPrompt: promptBuilders.vocabulary },
  vocabularyExamples: { id: 'vocabularyExamples', label: 'Create Vocabulary Table with Examples', description: 'Generate definitions and classroom-friendly examples.', requiresSelection: true, schema: schemas.vocabularyExamples, validate: validators.vocabularyExamples, buildPrompt: promptBuilders.vocabularyExamples },
  distractors: { id: 'distractors', label: 'Generate Multiple-Choice Distractors', description: 'Generate three plausible incorrect answers.', requiresSelection: true, schema: schemas.distractors, validate: validators.distractors, buildPrompt: promptBuilders.distractors }
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
