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

function maxTokensForAction(actionId, options = {}) {
  if (actionId === 'distractors') return 320;
  if (actionId === 'vocabulary') return 768;
  if (actionId === 'vocabularyExamples') return 1024;
  if (actionId === 'quiz') return Math.min(1600, Math.max(400, (Number(options.questionCount) || 5) * 80));
  return 768;
}

class LocalAIService {
  constructor({ getModelPath, setModelPath }) {
    this.getModelPath = getModelPath;
    this.setModelPath = setModelPath;
    this.llama = null;
    this.LlamaChatSession = null;
    this.chatWrapper = null;
    this.model = null;
    this.inferenceBackend = '';
    this.loading = null;
    this.statusMessage = '';
    this.activeRequests = new Map();
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

  async ensureLoaded(onProgress = () => {}) {
    if (this.model) {
      onProgress({ stage: 'model-ready', message: 'The local model is already loaded.' });
      return this.model;
    }
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const modelPath = await this.getModelPath();
      if (!modelPath) throw new Error('Local AI model not installed. Choose a GGUF model in AI Settings.');
      const selected = await this.status();
      if (selected.state !== 'installed') throw new Error(selected.message || 'The selected local AI model is unavailable.');
      try {
        onProgress({ stage: 'loading-runtime', message: 'Starting the local AI runtime…' });
        const module = await import('node-llama-cpp');
        this.llama = await module.getLlama();
        this.LlamaChatSession = module.LlamaChatSession;
        if (/qwen/i.test(modelPath)) {
          this.chatWrapper = new module.QwenChatWrapper({
            variation: /qwen3[._-]?5/i.test(modelPath) ? '3.5' : '3',
            thoughts: 'modelInitiated'
          });
        }
        // The Vulkan path on older integrated Linux GPUs can load successfully yet
        // produce unreliable output for newer Qwen GGUF architectures. Use the
        // deterministic CPU backend on Linux; retain the supported native backend
        // (for example Metal) on other platforms.
        const useCpuBackend = process.platform === 'linux';
        this.inferenceBackend = useCpuBackend ? 'CPU (Linux Vulkan disabled)' : `${this.llama.gpu || 'CPU'} (automatic)`;
        onProgress({ stage: 'loading-model', message: `Loading ${selected.modelName} with ${this.inferenceBackend}…`, modelName: selected.modelName, modelPath, inferenceBackend: this.inferenceBackend });
        this.model = await this.llama.loadModel({ modelPath, gpuLayers: useCpuBackend ? 0 : 'auto' });
        onProgress({ stage: 'model-ready', message: 'Local model loaded.' });
        return this.model;
      } catch (error) {
        this.model = null;
        throw new Error(`Local AI model failed to load: ${error.message}`);
      }
    })();
    try { return await this.loading; } finally { this.loading = null; }
  }

  async generate(action, selectedText = '', options = {}, onProgress = () => {}) {
    if (action.requiresSelection && (typeof selectedText !== 'string' || !selectedText.trim())) throw new Error('Select text in the Markdown editor first.');
    const requestId = typeof options.requestId === 'string' ? options.requestId : '';
    const abortController = new AbortController();
    if (requestId) this.activeRequests.set(requestId, abortController);
    onProgress({ stage: 'preparing', message: 'Preparing the local AI request…' });
    const model = await this.ensureLoaded(onProgress);
    let context;
    let session;
    try {
      // These actions only need short prompts and structured responses. A bounded
      // context avoids allocating the model's full training context on small GPUs.
      onProgress({ stage: 'creating-context', message: 'Creating the model context…' });
      context = await model.createContext({ contextSize: { min: 2048, max: 3072 }, batchSize: 128 });
      const sequence = context.getSequence();
      const sessionOptions = { contextSequence: sequence };
      if (this.chatWrapper) sessionOptions.chatWrapper = this.chatWrapper;
      session = new this.LlamaChatSession(sessionOptions);
      const grammar = await this.llama.createGrammarForJsonSchema(action.schema);
      const prompt = String(options.prompt || `${action.buildPrompt(String(selectedText).slice(0, 12000), options)}\n/no_think\nUse English only in every JSON string value. The response must be complete JSON. Do not stop before the final closing brace.`).trim();
      const maxTokens = maxTokensForAction(action.id, options);
      onProgress({ stage: 'context-ready', message: 'Model context is ready.', prompt, selectedCharacters: String(selectedText).slice(0, 12000).length, contextSize: context.contextSize, maxTokens, inferenceBackend: this.inferenceBackend });
      let responseMeta;
      let generatedCharacters = 0;
      let generatedText = '';
      let lastProgressAt = 0;
      const reportTextProgress = text => {
        const chunk = String(text || '');
        generatedText += chunk;
        generatedCharacters += chunk.length;
        const now = Date.now();
        if (now - lastProgressAt >= 500) {
          lastProgressAt = now;
          onProgress({ stage: 'generating', message: `Generating locally… received ${generatedCharacters} characters.`, generatedCharacters, generatedText });
        }
      };
      onProgress({ stage: 'generating', message: 'Generating locally… waiting for the first response token.', generatedCharacters });
      responseMeta = await session.promptWithMeta(prompt, { grammar, temperature: 0, maxTokens, trimWhitespaceSuffix: true, onTextChunk: reportTextProgress, signal: abortController.signal, stopOnAbortSignal: true });
      if (abortController.signal.aborted || responseMeta.stopReason === 'abort') throw new Error('AI generation stopped.');
      let response = responseMeta.responseText;
      onProgress({ stage: 'response-complete', message: `Received ${response.length} characters; checking the response…`, generatedCharacters, generatedText: response });
      if (!response) throw new Error(`The local model produced no JSON response (stop reason: ${responseMeta.stopReason}).`);
      let parsed;
      try {
        parsed = parseJsonResponse(response);
      } catch (firstError) {
        console.warn(`[local-ai] ${action.id} returned incomplete JSON (${firstError.responseLength || 0} chars); retrying`);
        onProgress({ stage: 'retrying', message: 'The first response was incomplete; retrying once.' });
        generatedCharacters = 0;
        generatedText = '';
        responseMeta = await session.promptWithMeta('/no_think\nReturn the complete JSON object again. Use English only in every JSON string value. Output JSON only, including the final closing brace.', { grammar, temperature: 0, maxTokens, trimWhitespaceSuffix: true, onTextChunk: reportTextProgress, signal: abortController.signal, stopOnAbortSignal: true });
        if (abortController.signal.aborted || responseMeta.stopReason === 'abort') throw new Error('AI generation stopped.');
        response = responseMeta.responseText;
        onProgress({ stage: 'response-complete', message: `Received ${response.length} characters from the retry; checking the response…`, generatedCharacters, generatedText: response });
        if (!response) throw new Error(`The local model produced no JSON response (stop reason: ${responseMeta.stopReason}).`);
        parsed = parseJsonResponse(response);
      }
      const validationError = action.validate(parsed, options);
      if (validationError) throw new Error(validationError);
      onProgress({ stage: 'complete', message: 'Generation complete.', generatedCharacters, generatedText: response });
      return parsed;
    } catch (error) {
      console.error(`[local-ai] ${action.id} failed`, error);
      throw new Error(error.message || 'AI generation failed.');
    } finally {
      if (requestId) this.activeRequests.delete(requestId);
      session?.dispose?.({ disposeSequence: true });
      context?.dispose?.();
    }
  }

  stop(requestId) {
    const controller = this.activeRequests.get(requestId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  async dispose() {
    this.model?.dispose?.();
    this.model = null;
    this.inferenceBackend = '';
    this.llama = null;
    this.LlamaChatSession = null;
    this.chatWrapper = null;
  }
}

module.exports = { LocalAIService };
