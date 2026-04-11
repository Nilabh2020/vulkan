import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import chatRouter from './routes/chat.js';
import instanceRouter from './routes/instances.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const VULKAN_CWD = process.argv[2] || process.cwd();
const MEMORY_FILE = path.join(VULKAN_CWD, 'vulkan_memory.json');

app.use(cors());
app.use(express.json({ limit: '100mb' }));

console.log(`[Vulkan] Initialized in: ${VULKAN_CWD}`);

// ── Persistence Routes ────────────────────────────────────────────

app.get('/api/session/load', (req, res) => {
  if (fs.existsSync(MEMORY_FILE)) {
    try {
      const data = fs.readFileSync(MEMORY_FILE, 'utf8');
      const parsed = JSON.parse(data);
      console.log(`[Backend] Memory loaded from ${MEMORY_FILE}`);
      res.json(parsed);
    } catch (e) {
      res.status(500).json({ error: 'Failed to parse memory file' });
    }
  } else {
    // If no file exists, return completely empty state for a fresh start
    console.log(`[Backend] No memory file found in ${VULKAN_CWD}. Starting fresh.`);
    res.json({ messages: [], nodes: [], edges: [], isNewFolder: true });
  }
});

app.post('/api/session/save', (req, res) => {
  const { messages, nodes, edges } = req.body;
  
  try {
    // To keep the JSON light, we only save the last 10 messages 
    // and a "summary" marker if it gets too long.
    let persistentMessages = messages;
    if (messages.length > 15) {
      const lastMessages = messages.slice(-10);
      persistentMessages = [
        { role: 'assistant', content: `[SYSTEM: Older history truncated for performance. Active session follows.]` },
        ...lastMessages
      ];
    }

    const payload = {
      messages: persistentMessages,
      nodes,
      edges,
      updatedAt: new Date().toISOString(),
      workDir: VULKAN_CWD
    };

    fs.writeFileSync(MEMORY_FILE, JSON.stringify(payload, null, 2));
    res.json({ success: true });
  } catch (e) {
    console.error(`[Backend] Save failed:`, e.message);
    res.status(500).json({ error: 'Failed to write memory file' });
  }
});

// ── Standard Routes ───────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ status: 'operational', workDir: VULKAN_CWD }));

app.post('/api/models', async (req, res) => {
  const { provider, baseUrl, apiKey } = req.body;
  const normalizedProvider = provider.toLowerCase().replace(/\s/g, '');
  const cleanBaseUrl = baseUrl?.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  
  try {
    let url;
    let headers = { 'Content-Type': 'application/json' };

    if (normalizedProvider === 'lmstudio' || normalizedProvider === 'openai') {
      url = `${cleanBaseUrl}/v1/models`;
      if (normalizedProvider === 'openai') headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (normalizedProvider === 'ollama') {
      url = `${cleanBaseUrl}/api/tags`;
    } else {
      return res.json({ models: [] });
    }

    const response = await fetch(url, { headers });
    const data = await response.json();
    let models = [];
    
    if (normalizedProvider === 'lmstudio' || normalizedProvider === 'openai') {
      models = data.data.map(m => m.id);
    } else if (normalizedProvider === 'ollama') {
      models = data.models.map(m => m.name);
    }
    
    res.json({ models });
  } catch (error) {
    res.status(500).json({ error: 'Connection Failed', details: error.message });
  }
});

app.use('/api/chat', chatRouter);
app.use('/api/instances', instanceRouter);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Vulkan Backend] Server running on http://0.0.0.0:${PORT}`);
});
