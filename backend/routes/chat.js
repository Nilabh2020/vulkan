import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { generatePromptExtension } from '../toolRegistry.js';

const router = express.Router();

// Load System Prompt
let SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, '..', '..', 'prompts', 'orchestrator_system.txt'), 'utf8');
SYSTEM_PROMPT += generatePromptExtension();

function validateOutput(text) {
  const cleanText = text.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  return { valid: true, cleanText };
}

function extractReply(data, provider) {
  let reply = '';
  try {
    if (['lmstudio', 'openai', 'chatgpt', 'openrouter', 'nvidia'].includes(provider)) {
      const msg = data?.choices?.[0]?.message;
      reply = msg?.content || msg?.reasoning_content || data?.choices?.[0]?.text || data?.choices?.[0]?.delta?.content || '';
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
  return reply;
}

function sanitizeMessages(msgs) {
  return msgs
    .filter(m => m.role && m.content)
    .map(({ role, content }) => ({ role, content }));
}

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
      buffer = lines.pop();

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
            let content = json.choices?.[0]?.delta?.content || json.choices?.[0]?.text;
            if (!content && json.type === 'content_block_delta') {
              content = json.delta?.text;
            }
            if (content) {
              res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
            }
          } catch (e) {}
        } else if (normalizedProvider === 'gemini') {
           // Basic gemini streaming handle (if needed in future)
           res.write(`data: ${JSON.stringify({ text: trimmedLine })}\n\n`);
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

  const finalMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...sanitizeMessages(messages.filter(m => m.role !== 'system'))
  ];

  const isStreaming = req.body.stream === true;
  const maxRetries = (normalizedProvider === 'lmstudio' || normalizedProvider === 'ollama') ? 1 : 2;

  const fetchWithRetry = async (retryCount = 0) => {
    let url;
    let body;
    let headers = { 'Content-Type': 'application/json' };
    const options = { temperature: 0.6, top_p: 0.9, max_tokens: 4096 };

    if (['lmstudio', 'openai', 'chatgpt', 'openrouter', 'nvidia'].includes(normalizedProvider)) {
      url = normalizedProvider === 'lmstudio' ? `${baseUrl}/v1/chat/completions` :
            ['openai', 'chatgpt'].includes(normalizedProvider) ? 'https://api.openai.com/v1/chat/completions' :
            normalizedProvider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' :
            'https://integrate.api.nvidia.com/v1/chat/completions';
      if (normalizedProvider !== 'lmstudio') headers['Authorization'] = `Bearer ${config?.apiKey || ''}`;
      body = JSON.stringify({ model, messages: finalMessages, stream: isStreaming, ...options });
      const response = await fetch(url, { method: 'POST', headers, body });
      if (isStreaming) return handleStreamingResponse(response, normalizedProvider, res);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || `Provider error ${response.status}`);
      return validateOutput(extractReply(data, normalizedProvider)).cleanText;

    } else if (normalizedProvider === 'ollama') {
      url = `${baseUrl}/api/chat`;
      body = JSON.stringify({ model, messages: finalMessages, stream: isStreaming, options });
      const response = await fetch(url, { method: 'POST', headers, body });
      if (isStreaming) return handleStreamingResponse(response, normalizedProvider, res);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `Ollama returned ${response.status}`);
      return validateOutput(extractReply(data, normalizedProvider)).cleanText;

    } else if (normalizedProvider === 'claude') {
      url = 'https://api.anthropic.com/v1/messages';
      headers['x-api-key'] = config?.apiKey || '';
      headers['anthropic-version'] = '2023-06-01';
      body = JSON.stringify({ model: model || 'claude-3-5-sonnet-20240620', max_tokens: 1024, messages: finalMessages.filter(m => m.role !== 'system'), system: SYSTEM_PROMPT, stream: isStreaming, ...options });
      const response = await fetch(url, { method: 'POST', headers, body });
      if (isStreaming) return handleStreamingResponse(response, normalizedProvider, res);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || `Claude error ${response.status}`);
      return validateOutput(extractReply(data, normalizedProvider)).cleanText;

    } else if (normalizedProvider === 'gemini') {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash'}:generateContent?key=${config?.apiKey || ''}`;
      const contents = [];
      const geminiMsgs = finalMessages.filter(m => m.role !== 'system');
      for (const m of geminiMsgs) {
        const role = m.role === 'user' ? 'user' : 'model';
        if (contents.length > 0 && contents[contents.length - 1].role === role) {
          contents[contents.length - 1].parts[0].text += '\n\n' + m.content;
        } else {
          contents.push({ role, parts: [{ text: m.content }] });
        }
      }
      const bodyPayload = { contents, generationConfig: { temperature: 0, topP: 0.1 } };
      if (SYSTEM_PROMPT) bodyPayload.system_instruction = { parts: [{ text: SYSTEM_PROMPT }] };
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(bodyPayload) });
      // Gemini streaming is currently non-standard SSE; handling as non-stream for now to prevent errors
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || `Gemini error ${response.status}`);
      return validateOutput(extractReply(data, normalizedProvider)).cleanText;
    } else {
      throw new Error(`Unsupported provider: "${provider}"`);
    }
  };

  try {
    const reply = await fetchWithRetry();
    if (!isStreaming) res.json({ reply: reply || '(No response)' });
  } catch (error) {
    console.error(`[Vulkan] Chat Error:`, error.message);
    res.status(500).json({ error: 'Chat failed', details: error.message });
  }
});

export default router;
