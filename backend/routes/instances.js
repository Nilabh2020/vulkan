/**
 * Instance Routes — REST + SSE endpoints for managing agent instances.
 *
 * GET  /api/instances/stream   — SSE stream for real-time instance events
 * POST /api/instances/spawn    — Spawn a new agent instance
 * POST /api/instances/message-by-name — Send message to a named instance
 * POST /api/instances/:id/message — Send message to instance by ID
 * GET  /api/instances          — List all instances
 * GET  /api/instances/:id      — Get instance detail
 * DELETE /api/instances/:id    — Terminate instance
 * DELETE /api/instances        — Terminate all instances
 */

import express from 'express';
import instanceManager from '../instanceManager.js';

const router = express.Router();

// ── SSE Stream ────────────────────────────────────────────────────
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send current state snapshot on connect
  const instances = instanceManager.getAllInstances();
  res.write(`data: ${JSON.stringify({ type: 'initial_state', data: { instances } })}\n\n`);

  // Forward all instance events to this SSE client
  const handler = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  instanceManager.on('event', handler);

  // Heartbeat every 15s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 15000);

  // Cleanup on client disconnect
  req.on('close', () => {
    instanceManager.removeListener('event', handler);
    clearInterval(heartbeat);
    console.log('[Vulkan] SSE client disconnected');
  });

  console.log('[Vulkan] SSE client connected');
});

// ── Spawn Instance ────────────────────────────────────────────────
router.post('/spawn', async (req, res) => {
  const { name, role, goal, provider, model, config } = req.body;
  const id = `inst-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  try {
    const instance = await instanceManager.spawn(id, name, role, goal, {
      provider: provider || 'ollama',
      model: model || '',
      config: config || {},
    });

    res.json({
      success: true,
      instance: {
        id: instance.id,
        name: instance.name,
        role: instance.role,
        goal: instance.goal,
        status: instance.status,
      },
    });
  } catch (err) {
    console.error('[Vulkan] Spawn failed:', err.message);
    res.status(500).json({ error: 'Spawn failed', details: err.message });
  }
});

// ── Send Message by Name ──────────────────────────────────────────
router.post('/message-by-name', (req, res) => {
  const { targetName, message } = req.body;
  const success = instanceManager.sendMessageByName(targetName, message);

  if (!success) {
    return res.json({ success: false, reason: 'Instance not found' });
  }

  res.json({ success: true });
});

// ── Send Message by ID ────────────────────────────────────────────
router.post('/:id/message', (req, res) => {
  const { message } = req.body;
  const instance = instanceManager.instances.get(req.params.id);

  if (!instance) {
    return res.status(404).json({ error: 'Instance not found' });
  }

  instance.messages.push({ role: 'user', content: message });
  instanceManager.runInstanceInference(req.params.id);

  res.json({ success: true });
});

// ── List All Instances ────────────────────────────────────────────
router.get('/', (req, res) => {
  res.json({ instances: instanceManager.getAllInstances() });
});

// ── Get Instance Detail ───────────────────────────────────────────
router.get('/:id', (req, res) => {
  const instance = instanceManager.instances.get(req.params.id);
  if (!instance) {
    return res.status(404).json({ error: 'Instance not found' });
  }

  res.json({
    id: instance.id,
    name: instance.name,
    role: instance.role,
    goal: instance.goal,
    status: instance.status,
    roundsCompleted: instance.roundsCompleted,
    responses: instance.responses,
    createdAt: instance.createdAt,
  });
});

// ── Terminate by ID ───────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  instanceManager.terminate(req.params.id);
  res.json({ success: true });
});

// ── Terminate All ─────────────────────────────────────────────────
router.delete('/', (req, res) => {
  instanceManager.terminateAll();
  res.json({ success: true });
});

export default router;
