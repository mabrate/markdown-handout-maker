'use strict';

const promptBuilders = {
  vocabulary: selectedText => `Create a vocabulary table for middle-school students from the terms below. Return ONLY valid JSON matching this schema: {"rows":[{"term":"string","definition":"string"}]}. Each definition must be concise, student-friendly, and accurate. Do not return examples, Markdown, commentary, or code fences. Terms:\n${selectedText}`,
  vocabularyExamples: selectedText => `Create a vocabulary table with examples for middle-school students from the terms below. Return ONLY valid JSON matching this schema: {"rows":[{"term":"string","definition":"string","example":"string"}]}. Each definition must be concise, student-friendly, and accurate. Each example must be a concrete classroom-friendly sentence. Do not return Markdown, commentary, or code fences. Terms:\n${selectedText}`,
  distractors: selectedText => `Create multiple-choice distractors from the selected question and answer. Return ONLY valid JSON matching this schema: {"question":"string","correctAnswer":"string","distractors":["string","string","string"]}. Return exactly three plausible but incorrect distractors. Keep choices similar in grammar and approximate length. Do not use jokes, "all of the above", "none of the above", synonyms that could also be correct, or duplicate the correct answer. Aim for middle-school readability. Selected text:\n${selectedText}`
};

module.exports = { promptBuilders };
