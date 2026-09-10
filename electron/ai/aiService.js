'use strict';

const fs = require('fs/promises');

function parseJsonResponse(response) {
  const text = String(response || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(text); } catch (firstError) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch {}
    }
    const error = new Error('The local model returned incomplete JSON. Try Generate again or choose a smaller instruction model.');
    error.cause = firstError;
    error.responseLength = text.length;
    throw error;
  }
}

class LocalAIService {
  constructor({ getModelPath, setModelPath }) {
    this.getModelPath = getModelPath;
    this.setModelPath = setModelPath;
    this.llama = null;
    this.LlamaChatSession = null;
    this.chatWrapper = null;
    this.model = null;
    this.loading = null;
    this.statusMessage = '';
  }

  async status() {
    const modelPath = await this.getModelPath();
    if (!modelPath) return { state: 'not-installed', modelPath: '', modelName: '' };
    try {
      const stat = await fs.stat(modelPath);
      if (!stat.isFile() || !modelPath.toLowerCase().endsWith('.gguf')) throw new Error('The selected file is not a GGUF model.');
      return { state: 'installed', modelPath, modelName: modelPath.split(/[\\/]/).pop() };
    } catch (error) {
      return { state: 'error', modelPath, modelName: modelPath.split(/[\\/]/).pop(), message: error.message };
    }
  }

  async selectModel(modelPath) {
    if (typeof modelPath !== 'string' || !modelPath.toLowerCase().endsWith('.gguf')) throw new Error('Choose a .gguf model file.');
    const stat = await fs.stat(modelPath);
    if (!stat.isFile()) throw new Error('The selected model is not a file.');
    await this.setModelPath(modelPath);
    await this.dispose();
    return this.status();
  }

  async ensureLoaded() {
    if (this.model) return this.model;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const modelPath = await this.getModelPath();
      if (!modelPath) throw new Error('Local AI model not installed. Choose a GGUF model in AI Settings.');
      const selected = await this.status();
      if (selected.state !== 'installed') throw new Error(selected.message || 'The selected local AI model is unavailable.');
      try {
        const module = await import('node-llama-cpp');
        this.llama = await module.getLlama();
        this.LlamaChatSession = module.LlamaChatSession;
        if (/qwen/i.test(modelPath)) {
          this.chatWrapper = new module.QwenChatWrapper({
            variation: /qwen3[._-]?5/i.test(modelPath) ? '3.5' : '3',
            thoughts: 'discourage'
          });
        }
        this.model = await this.llama.loadModel({ modelPath });
        return this.model;
      } catch (error) {
        this.model = null;
        throw new Error(`Local AI model failed to load: ${error.message}`);
      }
    })();
    try { return await this.loading; } finally { this.loading = null; }
  }

  async generate(action, selectedText) {
    if (typeof selectedText !== 'string' || !selectedText.trim()) throw new Error('Select text in the Markdown editor first.');
    const model = await this.ensureLoaded();
    let context;
    let session;
    try {
      // These actions only need short prompts and structured responses. A bounded
      // context avoids allocating the model's full training context on small GPUs.
      context = await model.createContext({ contextSize: { min: 2048, max: 4096 }, batchSize: 256 });
      const sequence = context.getSequence();
      const sessionOptions = { contextSequence: sequence };
      if (this.chatWrapper) sessionOptions.chatWrapper = this.chatWrapper;
      session = new this.LlamaChatSession(sessionOptions);
      const grammar = await this.llama.createGrammarForJsonSchema(action.schema);
      const prompt = `${action.buildPrompt(selectedText.slice(0, 12000))}\n/no_think\nThe response must be complete JSON. Do not stop before the final closing brace.`;
      let responseMeta = await session.promptWithMeta(prompt, { grammar, temperature: 0, maxTokens: 4096, trimWhitespaceSuffix: true });
      let response = responseMeta.responseText;
      if (!response) throw new Error(`The local model produced no JSON response (stop reason: ${responseMeta.stopReason}).`);
      let parsed;
      try {
        parsed = parseJsonResponse(response);
      } catch (firstError) {
        console.warn(`[local-ai] ${action.id} returned incomplete JSON (${firstError.responseLength || 0} chars); retrying`);
        responseMeta = await session.promptWithMeta('/no_think\nReturn the complete JSON object again. Output JSON only, including the final closing brace.', { grammar, temperature: 0, maxTokens: 4096, trimWhitespaceSuffix: true });
        response = responseMeta.responseText;
        if (!response) throw new Error(`The local model produced no JSON response (stop reason: ${responseMeta.stopReason}).`);
        parsed = parseJsonResponse(response);
      }
      const validationError = action.validate(parsed);
      if (validationError) throw new Error(validationError);
      return parsed;
    } catch (error) {
      console.error(`[local-ai] ${action.id} failed`, error);
      throw new Error(error.message || 'AI generation failed.');
    } finally {
      session?.dispose?.({ disposeSequence: true });
      context?.dispose?.();
    }
  }

  async dispose() {
    this.model?.dispose?.();
    this.model = null;
    this.llama = null;
    this.LlamaChatSession = null;
    this.chatWrapper = null;
  }
}

module.exports = { LocalAIService };
