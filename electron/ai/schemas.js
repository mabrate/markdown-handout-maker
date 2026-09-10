'use strict';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateVocabulary(value, includeExamples = false) {
  if (!value || !Array.isArray(value.rows) || value.rows.length < 1) return 'The model did not return any vocabulary rows.';
  if (value.rows.length > 30) return 'The model returned too many vocabulary rows.';
  for (const row of value.rows) {
    if (!row || !isNonEmptyString(row.term) || !isNonEmptyString(row.definition) || (includeExamples && !isNonEmptyString(row.example))) {
      return includeExamples ? 'Each vocabulary row needs a term, definition, and example.' : 'Each vocabulary row needs a term and definition.';
    }
  }
  return null;
}

function validateDistractors(value) {
  if (!value || !isNonEmptyString(value.question) || !isNonEmptyString(value.correctAnswer) || !Array.isArray(value.distractors) || value.distractors.length !== 3) {
    return 'The model must return a question, correct answer, and exactly three distractors.';
  }
  const answers = [value.correctAnswer, ...value.distractors].map(item => String(item).trim().toLowerCase());
  if (answers.some(item => !item) || new Set(answers).size !== answers.length) return 'The model returned duplicate or empty answer choices.';
  if (answers.some(item => item.includes('all of the above') || item.includes('none of the above'))) return 'The model returned a disallowed answer choice.';
  return null;
}

const schemas = {
  vocabulary: {
    type: 'object', additionalProperties: false, required: ['rows'],
    properties: { rows: { type: 'array', minItems: 1, maxItems: 30, items: { type: 'object', additionalProperties: false, required: ['term', 'definition'], properties: { term: { type: 'string' }, definition: { type: 'string' } } } } }
  },
  vocabularyExamples: {
    type: 'object', additionalProperties: false, required: ['rows'],
    properties: { rows: { type: 'array', minItems: 1, maxItems: 30, items: { type: 'object', additionalProperties: false, required: ['term', 'definition', 'example'], properties: { term: { type: 'string' }, definition: { type: 'string' }, example: { type: 'string' } } } } }
  },
  distractors: {
    type: 'object', additionalProperties: false, required: ['question', 'correctAnswer', 'distractors'],
    properties: { question: { type: 'string' }, correctAnswer: { type: 'string' }, distractors: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string' } } }
  }
};

module.exports = { schemas, validators: { vocabulary: value => validateVocabulary(value, false), vocabularyExamples: value => validateVocabulary(value, true), distractors: validateDistractors } };
