/**
 * Shared LLM inference engine for all providers.
 * Used by both the orchestrator (chat route) and the instance manager (sub-agents).
 */

export async function runInference({ provider, model, messages, config }) {
  const normalizedProvider = provider.toLowerCase().replace(/\s/g, '');
  const baseUrl = config?.baseUrl?.replace(/\/$/, '') ||
    (normalizedProvider === 'lmstudio' ? 'http://localhost:1234' : 'http://localhost:11434');

  const headers = { 'Content-Type': 'application/json' };

  // Filter out any messages with empty content or invalid roles to prevent 400 errors
  const cleanMessages = messages.filter(m => m.content && m.content.trim() !== '' && (m.role === 'user' || m.role === 'assistant' || m.role === 'system'));

  const options = {
    temperature: Number(config?.temperature) || 0.7,
    top_p: Number(config?.top_p) || 0.9,
    max_tokens: Number(config?.max_tokens) || 4096,
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

    // Ensure system message is at the start (OpenAI requirement)
    const finalMessages = [];
    const sysMsg = cleanMessages.find(m => m.role === 'system');
    if (sysMsg) finalMessages.push(sysMsg);
    finalMessages.push(...cleanMessages.filter(m => m.role !== 'system'));

    const body = JSON.stringify({ 
      model: model || (normalizedProvider === 'openai' ? 'gpt-4o' : 'unknown'), 
      messages: finalMessages, 
      ...options 
    });
    
    const response = await fetch(url, { method: 'POST', headers, body });
    const data = await response.json();

    if (!response.ok) {
      console.error(`[Inference] ${provider} Error:`, data);
      throw new Error(data.error?.message || `Provider error ${response.status}: ${JSON.stringify(data)}`);
    }

    const msg = data.choices?.[0]?.message;
    return msg?.content || msg?.reasoning_content || '';
  }

  // ── Ollama ───────────────────────────────────────────────────────
  if (normalizedProvider === 'ollama') {
    const url = `${baseUrl}/api/chat`;
    const body = JSON.stringify({ 
      model: model || 'llama3', 
      messages: cleanMessages, 
      stream: false, 
      options: {
        temperature: options.temperature,
        top_p: options.top_p,
        num_predict: options.max_tokens
      }
    });
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

    const systemMsg = cleanMessages.find(m => m.role === 'system');
    const nonSystemMsgs = cleanMessages.filter(m => m.role !== 'system');

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

    const contents = [];
    const geminiMsgs = cleanMessages.filter(m => m.role !== 'system');
    for (const m of geminiMsgs) {
      const role = m.role === 'user' ? 'user' : 'model';
      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts[0].text += '\n\n' + m.content;
      } else {
        contents.push({ role, parts: [{ text: m.content }] });
      }
    }

    const body = {
      contents,
      generationConfig: {
        temperature: options.temperature,
        topP: options.top_p,
        maxOutputTokens: options.max_tokens,
      }
    };

    // Add system instruction if present
    const sysMsg = cleanMessages.find(m => m.role === 'system');
    if (sysMsg) {
      body.system_instruction = { parts: [{ text: sysMsg.content }] };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Gemini error: ${response.status}`);
    }
    const data = await response.json();

    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

