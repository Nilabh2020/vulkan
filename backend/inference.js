/**
 * Shared LLM inference engine for all providers.
 * Used by both the orchestrator (chat route) and the instance manager (sub-agents).
 */

export async function runInference({ provider, model, messages, config }) {
  const normalizedProvider = provider.toLowerCase().replace(/\s/g, '');
  const baseUrl = config?.baseUrl?.replace(/\/$/, '') ||
    (normalizedProvider === 'lmstudio' ? 'http://localhost:1234' : 'http://localhost:11434');

  const headers = { 'Content-Type': 'application/json' };

  const options = {
    temperature: config?.temperature ?? 0.7,
    top_p: config?.top_p ?? 0.9,
    max_tokens: config?.max_tokens ?? 4096,
  };

  // ── OpenAI-compatible providers ──────────────────────────────────
  if (['lmstudio', 'openai', 'chatgpt', 'openrouter', 'nvidia'].includes(normalizedProvider)) {
    const url =
      normalizedProvider === 'lmstudio' ? `${baseUrl}/v1/chat/completions` :
      ['openai', 'chatgpt'].includes(normalizedProvider) ? 'https://api.openai.com/v1/chat/completions' :
      normalizedProvider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' :
      'https://integrate.api.nvidia.com/v1/chat/completions';

    if (normalizedProvider !== 'lmstudio') {
      headers['Authorization'] = `Bearer ${config?.apiKey || ''}`;
    }

    const body = JSON.stringify({ model, messages, ...options });
    const response = await fetch(url, { method: 'POST', headers, body });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || `Provider error: ${response.status}`);
    }

    const msg = data.choices?.[0]?.message;
    // Reasoning models (Qwen, DeepSeek) put output in reasoning_content, not content
    return msg?.content || msg?.reasoning_content || '';
  }

  // ── Ollama ───────────────────────────────────────────────────────
  if (normalizedProvider === 'ollama') {
    const url = `${baseUrl}/api/chat`;
    const body = JSON.stringify({ model, messages, stream: false, options });
    const response = await fetch(url, { method: 'POST', headers, body });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Ollama error: ${response.status}`);
    }

    return data.message?.content || '';
  }

  // ── Claude / Anthropic ───────────────────────────────────────────
  if (normalizedProvider === 'claude') {
    const url = 'https://api.anthropic.com/v1/messages';
    headers['x-api-key'] = config?.apiKey || '';
    headers['anthropic-version'] = '2023-06-01';

    const systemMsg = messages.find(m => m.role === 'system');
    const nonSystemMsgs = messages.filter(m => m.role !== 'system');

    const body = JSON.stringify({
      model: model || 'claude-3-5-sonnet-20240620',
      max_tokens: options.max_tokens,
      messages: nonSystemMsgs,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      temperature: options.temperature,
      top_p: options.top_p,
    });

    const response = await fetch(url, { method: 'POST', headers, body });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || `Claude error: ${response.status}`);
    }

    return data.content?.[0]?.text || '';
  }

  // ── Gemini ───────────────────────────────────────────────────────
  if (normalizedProvider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash'}:generateContent?key=${config?.apiKey || ''}`;

    const contents = messages.map(m => ({
      role: m.role === 'user' ? 'user' : (m.role === 'system' ? 'user' : 'model'),
      parts: [{ text: m.content }],
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: options.temperature,
          topP: options.top_p,
          maxOutputTokens: options.max_tokens,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || `Gemini error: ${response.status}`);
    }

    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  throw new Error(`Unsupported provider: ${provider}`);
}
