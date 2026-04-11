import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Load System Prompt
const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, '..', '..', 'prompts', 'orchestrator_system.txt'), 'utf8');

const VALID_COMMANDS = ['spawn_instance', 'send_message', 'list_instances', 'terminate_instance'];

function validateOutput(text) {
  // Strip markdown backticks if the model wraps output in code blocks
  const cleanText = text.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  
  // Since we now allow conversational responses, all output is technically valid.
  // The frontend regex parser will safely pick out any commands embedded inside normal text.
  return { valid: true, cleanText };
}

/**
 * Safely extract reply text from provider-specific API response shapes.
 * Returns the text or throws a descriptive error.
 */
function extractReply(data, provider) {
  let reply = '';

  try {
    if (['lmstudio', 'openai', 'chatgpt', 'openrouter', 'nvidia'].includes(provider)) {
      const msg = data?.choices?.[0]?.message;
      // Primary: chat completion format
      reply = msg?.content || '';
      // Fallback: reasoning models (Qwen, DeepSeek, etc.) put output in reasoning_content
      if (!reply) reply = msg?.reasoning_content || '';
      // Fallback: text completion format
      if (!reply) reply = data?.choices?.[0]?.text || '';
      // Fallback: delta for streaming-style responses
      if (!reply) reply = data?.choices?.[0]?.delta?.content || '';
    } else if (provider === 'ollama') {
      reply = data?.message?.content || data?.response || '';
    } else if (provider === 'claude') {
      reply = data?.content?.[0]?.text || '';
    } else if (provider === 'gemini') {
      reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
  } catch (e) {
    console.error(`[Vulkan] extractReply parse error for ${provider}:`, e.message);
  }

  // If reply is still empty, log the FULL response for debugging
  if (!reply) {
    console.error(`[Vulkan] EMPTY REPLY from ${provider}. Full API response:`);
    console.error(JSON.stringify(data, null, 2));
  }

  return reply;
}

/**
 * Sanitize messages before sending to the LLM:
 * - Strip our internal `meta` field (agent response metadata)
 * - Ensure only role + content are passed
 */
function sanitizeMessages(msgs) {
  return msgs
    .filter(m => m.role && m.content)
    .map(({ role, content }) => ({ role, content }));
}

/**
 * Normalizes streaming output for various providers into a consistent SSE stream.
 */
async function handleStreamingResponse(response, normalizedProvider, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      buffer += chunk;
      
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep the last incomplete line in buffer

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        if (normalizedProvider === 'ollama') {
          try {
            const json = JSON.parse(trimmedLine);
            if (json.message?.content) {
              res.write(`data: ${JSON.stringify({ text: json.message.content })}\n\n`);
            }
          } catch (e) {}
        } else if (trimmedLine.startsWith('data: ')) {
          const dataStr = trimmedLine.slice(6).trim();
          if (dataStr === '[DONE]') continue;
          try {
            const json = JSON.parse(dataStr);
            // OpenAI style
            let content = json.choices?.[0]?.delta?.content || json.choices?.[0]?.text;
            // Claude style
            if (!content && json.type === 'content_block_delta') {
              content = json.delta?.text;
            }
            if (content) {
              res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
            }
          } catch (e) {}
        }
      }
    }
  } catch (err) {
    console.error('[Vulkan] Stream reading error:', err);
  } finally {
    res.end();
  }
}

router.post('/', async (req, res) => {
  const { provider, model, messages, config } = req.body;
  const normalizedProvider = provider.toLowerCase().replace(/\s/g, '');
  const baseUrl = config?.baseUrl?.replace(/\/$/, '') || (normalizedProvider === 'lmstudio' ? 'http://localhost:1234' : 'http://localhost:11434');

  // Build final messages: system prompt + sanitized user/assistant history
  const finalMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...sanitizeMessages(messages.filter(m => m.role !== 'system'))
  ];

  const isStreaming = req.body.stream === true;

  // Local providers (LM Studio, Ollama) get fewer retries — they rarely improve with scolding
  const isLocal = normalizedProvider === 'lmstudio' || normalizedProvider === 'ollama';
  const maxRetries = isLocal ? 1 : 2;

  const fetchWithRetry = async (retryCount = 0) => {
    let url;
    let body;
    let headers = { 'Content-Type': 'application/json' };

    const options = {
      temperature: 0.6,
      top_p: 0.9,
      max_tokens: 4096
    };

    // ── OpenAI-compatible (LM Studio, OpenAI, OpenRouter, Nvidia, ChatGPT) ──
    if (['lmstudio', 'openai', 'chatgpt', 'openrouter', 'nvidia'].includes(normalizedProvider)) {
      url = normalizedProvider === 'lmstudio' ? `${baseUrl}/v1/chat/completions` :
            ['openai', 'chatgpt'].includes(normalizedProvider) ? 'https://api.openai.com/v1/chat/completions' :
            normalizedProvider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' :
            'https://integrate.api.nvidia.com/v1/chat/completions';

      if (normalizedProvider !== 'lmstudio') {
        headers['Authorization'] = `Bearer ${config?.apiKey || ''}`;
      }

      body = JSON.stringify({ model, messages: finalMessages, stream: isStreaming, ...options });
      console.log(`[Vulkan] Requesting ${provider}: model="${model}", url=${url}, stream=${isStreaming}`);

      const response = await fetch(url, { method: 'POST', headers, body });
      
      if (isStreaming) {
        return handleStreamingResponse(response, normalizedProvider, res);
      }
      
      const data = await response.json();

      if (!response.ok) {
        console.error(`[Vulkan] ${provider} HTTP ${response.status}:`, JSON.stringify(data).slice(0, 300));
        throw new Error(data?.error?.message || `Provider returned ${response.status}: ${JSON.stringify(data).slice(0, 200)}`);
      }

      const rawReply = extractReply(data, normalizedProvider);
      console.log(`[Vulkan] ${provider} response (${rawReply.length} chars): "${rawReply.slice(0, 150)}..."`);

      const { valid, cleanText } = validateOutput(rawReply);

      if (!valid && retryCount < maxRetries) {
        console.log(`[Vulkan] No commands found in ${provider} output (attempt ${retryCount + 1}/${maxRetries + 1}). Retrying...`);
        finalMessages.push({ role: 'assistant', content: rawReply });
        finalMessages.push({ role: 'user', content: 'STRICT ERROR: You output prose or invalid syntax. RETURN ONLY COMMANDS. No backticks. No intro. No outro.' });
        return fetchWithRetry(retryCount + 1);
      }

      return cleanText;

    // ── Ollama ──
    } else if (normalizedProvider === 'ollama') {
      url = `${baseUrl}/api/chat`;
      body = JSON.stringify({ model, messages: finalMessages, stream: isStreaming, options });
      const response = await fetch(url, { method: 'POST', headers, body });

      if (isStreaming) {
        return handleStreamingResponse(response, normalizedProvider, res);
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || `Ollama returned ${response.status}`);
      }

      const rawReply = extractReply(data, normalizedProvider);
      console.log(`[Vulkan] Ollama raw response (${rawReply.length} chars): "${rawReply.slice(0, 120)}..."`);

      const { valid, cleanText } = validateOutput(rawReply);

      if (!valid && retryCount < maxRetries) {
        console.log(`[Vulkan] No commands found in Ollama output (attempt ${retryCount + 1}/${maxRetries + 1}). Retrying...`);
        finalMessages.push({ role: 'assistant', content: rawReply });
        finalMessages.push({ role: 'user', content: 'INVALID OUTPUT. RETURN ONLY COMMANDS.' });
        return fetchWithRetry(retryCount + 1);
      }

      return cleanText;

    // ── Claude / Anthropic ──
    } else if (normalizedProvider === 'claude') {
      url = 'https://api.anthropic.com/v1/messages';
      headers['x-api-key'] = config?.apiKey || '';
      headers['anthropic-version'] = '2023-06-01';
      body = JSON.stringify({
        model: model || 'claude-3-5-sonnet-20240620',
        max_tokens: 1024,
        messages: finalMessages.filter(m => m.role !== 'system'),
        system: SYSTEM_PROMPT,
        stream: isStreaming,
        ...options,
      });
      const response = await fetch(url, { method: 'POST', headers, body });
      
      if (isStreaming) {
        return handleStreamingResponse(response, normalizedProvider, res);
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || `Claude returned ${response.status}`);
      }

      const rawReply = extractReply(data, normalizedProvider);
      const { valid, cleanText } = validateOutput(rawReply);

      if (!valid && retryCount < maxRetries) {
        finalMessages.push({ role: 'assistant', content: rawReply });
        finalMessages.push({ role: 'user', content: 'INVALID OUTPUT. RETURN ONLY COMMANDS.' });
        return fetchWithRetry(retryCount + 1);
      }

      return cleanText;

    // ── Gemini ──
    } else if (normalizedProvider === 'gemini') {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash'}:generateContent?key=${config?.apiKey || ''}`;
      const contents = finalMessages.map(m => ({
        role: m.role === 'user' ? 'user' : (m.role === 'system' ? 'user' : 'model'),
        parts: [{ text: m.content }]
      }));
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ contents, generationConfig: { temperature: 0, topP: 0.1 } }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || `Gemini returned ${response.status}`);
      }

      const rawReply = extractReply(data, normalizedProvider);
      const { valid, cleanText } = validateOutput(rawReply);

      if (!valid && retryCount < maxRetries) {
        finalMessages.push({ role: 'model', parts: [{ text: rawReply }] });
        finalMessages.push({ role: 'user', parts: [{ text: 'INVALID OUTPUT. RETURN ONLY COMMANDS.' }] });
        return fetchWithRetry(retryCount + 1);
      }

      return cleanText;

    } else {
      throw new Error(`Unsupported provider: "${provider}"`);
    }
  };

  try {
    if (isStreaming) {
      await fetchWithRetry(); 
    } else {
      const reply = await fetchWithRetry();
      res.json({ reply: reply || '(No response from model)' });
    }
  } catch (error) {
    console.error(`[Vulkan] Error with ${provider}:`, error.message);
    res.status(500).json({ error: 'Provider failed', details: error.message });
  }
});

export default router;
