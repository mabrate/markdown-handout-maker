'use strict';

const promptTemplates = {
  vocabulary: `Create a vocabulary table for middle-school students from the terms below. Return ONLY valid JSON matching this schema: {"rows":[{"term":"string","definition":"string"}]}. Each definition must be concise, student-friendly, and accurate. Do not return examples, Markdown, commentary, or code fences.
Handout context:
{{aiContext}}
Terms:
{{selectedText}}`,
  vocabularyExamples: `Create a vocabulary table with examples for middle-school students from the terms below. Return ONLY valid JSON matching this schema: {"rows":[{"term":"string","definition":"string","example":"string"}]}. Each definition must be concise, student-friendly, and accurate. Each example must be a concrete classroom-friendly sentence. Do not return Markdown, commentary, or code fences.
Handout context:
{{aiContext}}
Terms:
{{selectedText}}`,
  distractors: `Create multiple-choice distractors from the selected question and answer. Return ONLY valid JSON matching this schema: {"question":"string","correctAnswer":"string","distractors":["string","string","string"]}. Return exactly three plausible but incorrect distractors. Keep choices similar in grammar and approximate length. Do not use jokes, "all of the above", "none of the above", synonyms that could also be correct, or duplicate the correct answer. Aim for middle-school readability.
Handout context:
{{aiContext}}
Selected text:
{{selectedText}}`,
  quiz: `Create exactly {{questionCount}} multiple-choice quiz questions for the handout below. Return ONLY valid JSON matching this schema: {"questions":[{"question":"string","correctAnswer":"string","distractors":["string","string","string"]}]}. Each question must have exactly three plausible but incorrect distractors. Use middle-school language, match the style and subject of the handout, avoid duplicate questions, jokes, "all of the above", and "none of the above".
Handout context:
{{aiContext}}
Additional teacher direction:
{{additionalContext}}
Handout:
{{handoutText}}
Do not return Markdown or commentary.`
};

function promptValues(selectedText, options = {}) {
  return {
    selectedText: selectedText || 'No selected text was provided.',
    handoutText: selectedText || 'No handout text was provided.',
    aiContext: options.aiContext || 'No additional handout context was provided.',
    additionalContext: options.additionalContext || 'No additional direction was provided.',
    questionCount: String(Math.max(1, Math.min(20, Number(options.questionCount) || 5)))
  };
}

function renderPromptTemplate(template, selectedText, options = {}) {
  const values = promptValues(selectedText, options);
  return String(template).replace(/\{\{(selectedText|handoutText|aiContext|additionalContext|questionCount)\}\}/g, (_match, key) => values[key]);
}

const promptBuilders = Object.fromEntries(Object.entries(promptTemplates).map(([id, template]) => [id, (selectedText, options, customTemplate = template) => renderPromptTemplate(customTemplate, selectedText, options)]));

module.exports = { promptBuilders, promptTemplates, renderPromptTemplate };
