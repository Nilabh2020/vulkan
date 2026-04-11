import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import chatRouter from './routes/chat.js';
import instanceRouter from './routes/instances.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
  console.log(`[Backend] ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'operational' }));

// Model Discovery
app.post('/api/models', async (req, res) => {
  const { provider, baseUrl, apiKey } = req.body;
  const normalizedProvider = provider.toLowerCase().replace(/\s/g, '');
  const cleanBaseUrl = baseUrl?.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  
  console.log(`[Backend] DISCOVERY: ${normalizedProvider} @ ${cleanBaseUrl}`);
  
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);
    
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: 'Provider Error', details: errorText });
    }

    const data = await response.json();
    let models = [];
    
    if (normalizedProvider === 'lmstudio' || normalizedProvider === 'openai') {
      models = data.data.map(m => m.id);
    } else if (normalizedProvider === 'ollama') {
      models = data.models.map(m => m.name);
    }
    
    res.json({ models });
  } catch (error) {
    console.error(`[Backend] Connection Failure:`, error.message);
    res.status(500).json({ error: 'Connection Failed', details: error.message });
  }
});

// Chat Route
app.use('/api/chat', chatRouter);

// Instance Management Routes (real agent spawning + SSE)
app.use('/api/instances', instanceRouter);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Vulkan Backend] Server running on http://0.0.0.0:${PORT}`);
});
