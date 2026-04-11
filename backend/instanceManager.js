/**
 * Vulkan Instance Manager
 *
 * Manages real autonomous AI agent instances, each with:
 * - Their own system prompt, conversation history, and provider config
 * - Independent LLM inference calls (truly parallel)
 * - Inter-agent message routing
 * - Event emission via SSE to the frontend
 */

import EventEmitter from 'events';
import { runInference } from './inference.js';

const MAX_ROUNDS = 5;

class InstanceManager extends EventEmitter {
  constructor() {
    super();
    this.instances = new Map();
    this.setMaxListeners(50); // Support many SSE clients
  }

  /**
   * Build a unique system prompt for each sub-agent,
   * making it aware of its role, goal, and sibling agents.
   */
  buildSystemPrompt(name, role, goal) {
    const otherAgents = Array.from(this.instances.values())
      .filter(i => i.name !== name && i.status !== 'TERMINATED')
      .map(i => `${i.name} (${i.role})`);

    return [
      `[VULKAN_SUB_AGENT]`,
      `IDENTITY: ${name}`,
      `ROLE: ${role}`,
      `OBJECTIVE: ${goal}`,
      ``,
      `You are an autonomous AI sub-agent inside the Vulkan swarm.`,
      `Your role is "${role}" and your objective is: "${goal}"`,
      ``,
      otherAgents.length > 0
        ? `OTHER ACTIVE AGENTS IN SWARM: ${otherAgents.join(', ')}`
        : `You are currently the first agent in this swarm.`,
      ``,
      `You may embed commands anywhere in your response:`,
      `  send_message("agent_name", "your message to that agent")`,
      `  task_complete("short summary of what you accomplished")`,
      ``,
      `RULES:`,
      `1. Begin working on your objective immediately.`,
      `2. Provide substantive analysis — you are a real worker, not a simulator.`,
      `3. Use send_message() to share findings with peer agents.`,
      `4. Call task_complete() when your objective is fulfilled.`,
      `5. Be thorough but concise.`,
    ].join('\n');
  }

  /**
   * Spawn a new instance: create it, store it, and fire off its first inference.
   * Returns immediately — inference runs asynchronously.
   */
  async spawn(id, name, role, goal, providerConfig) {
    const systemPrompt = this.buildSystemPrompt(name, role, goal);

    const instance = {
      id,
      name,
      role,
      goal,
      status: 'ACTIVE',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Execute your objective now: ${goal}` },
      ],
      providerConfig,
      createdAt: Date.now(),
      responses: [],
      roundsCompleted: 0,
      _pendingRound: false,
    };

    this.instances.set(id, instance);

    this.emit('event', {
      type: 'instance_spawned',
      data: { id, name, role, goal, status: 'ACTIVE' },
    });

    console.log(`[Vulkan] Spawned instance "${name}" (${id}) — role: ${role}, goal: ${goal}`);

    // Fire-and-forget: initial inference runs in the background
    this.runInstanceInference(id);

    return instance;
  }

  /**
   * Run one round of LLM inference for an instance.
   * Handles the thinking → response → command-routing cycle.
   */
  async runInstanceInference(id) {
    const instance = this.instances.get(id);
    if (!instance) return;
    if (instance.status === 'TERMINATED' || instance.status === 'COMPLETED') return;

    if (instance.roundsCompleted >= MAX_ROUNDS) {
      instance.status = 'COMPLETED';
      this.emit('event', {
        type: 'instance_completed',
        data: { id, name: instance.name, summary: `Reached max communication rounds (${MAX_ROUNDS})` },
      });
      return;
    }

    // If already mid-inference, mark that another round is needed
    if (instance.status === 'THINKING') {
      instance._pendingRound = true;
      return;
    }

    instance.status = 'THINKING';
    this.emit('event', {
      type: 'instance_status',
      data: { id, name: instance.name, status: 'THINKING' },
    });

    try {
      const { provider, model, config } = instance.providerConfig;

      console.log(`[Vulkan] ${instance.name} → inference (round ${instance.roundsCompleted + 1})`);

      const response = await runInference({
        provider,
        model,
        messages: instance.messages,
        config,
      });

      instance.messages.push({ role: 'assistant', content: response });
      instance.responses.push({ content: response, timestamp: Date.now() });
      instance.roundsCompleted++;
      instance.status = 'ACTIVE';

      this.emit('event', {
        type: 'instance_response',
        data: {
          id,
          name: instance.name,
          response,
          round: instance.roundsCompleted,
        },
      });

      console.log(`[Vulkan] ${instance.name} ← response (${response.length} chars, round ${instance.roundsCompleted})`);

      // Parse and route any commands embedded in the response
      this.parseAndRouteCommands(id, response);

      // If messages arrived while we were thinking, run another round
      if (instance._pendingRound) {
        instance._pendingRound = false;
        setTimeout(() => this.runInstanceInference(id), 800);
      }
    } catch (err) {
      instance.status = 'ERROR';
      console.error(`[Vulkan] ${instance.name} ERROR:`, err.message);
      this.emit('event', {
        type: 'instance_error',
        data: { id, name: instance.name, error: err.message },
      });
    }
  }

  /**
   * Scan an agent's response for send_message() and task_complete() commands
   * and route them accordingly.
   */
  parseAndRouteCommands(fromId, response) {
    const instance = this.instances.get(fromId);
    if (!instance) return;

    // Match send_message commands (can span multiple lines, supports double/single quotes)
    const msgRegex = /send_message\s*\(\s*["'](.*?)["']\s*,\s*["']([\s\S]*?)["']\s*\)/gi;
    let match;
    while ((match = msgRegex.exec(response)) !== null) {
      const [, targetName, message] = match;
      this.deliverMessage(fromId, targetName, message);
    }

    // Match task_complete commands (can span multiple lines)
    const completeRegex = /task_complete\s*\(\s*["']([\s\S]*?)["']\s*\)/gi;
    while ((match = completeRegex.exec(response)) !== null) {
      const [, summary] = match;
      instance.status = 'COMPLETED';
      this.emit('event', {
        type: 'instance_completed',
        data: { id: fromId, name: instance.name, summary },
      });
      console.log(`[Vulkan] ${instance.name} COMPLETED: ${summary}`);
    }
  }

  /**
   * Deliver a message from one agent to another.
   * The message is injected into the target's conversation and triggers inference.
   */
  deliverMessage(fromId, targetName, message) {
    const fromInstance = this.instances.get(fromId);
    
    // Intercept messages to the user/coordinator
    const targetLower = targetName.toLowerCase();
    if (targetLower === 'orchestrator' || targetLower === 'coordinator' || targetLower === 'swarm_coordinator' || targetLower === 'user') {
      this.emit('event', {
        type: 'instance_message',
        data: {
          from: { id: fromId, name: fromInstance?.name || 'unknown' },
          to: { id: 'orchestrator', name: 'ORCHESTRATOR' },
          message,
        },
      });
      console.log(`[Vulkan] ${fromInstance?.name} → ORCHESTRATOR: "${message.slice(0, 80)}..."`);
      return;
    }

    const targetInstance = this.getInstanceByName(targetName);

    if (!targetInstance) {
      console.warn(`[Vulkan] Message routing failed: "${targetName}" not found`);
      this.emit('event', {
        type: 'instance_message_failed',
        data: {
          from: fromInstance?.name || 'unknown',
          target: targetName,
          reason: 'Target agent not found',
        },
      });
      return;
    }

    if (targetInstance.status === 'TERMINATED' || targetInstance.status === 'COMPLETED') {
      console.warn(`[Vulkan] Message dropped: "${targetName}" is ${targetInstance.status}`);
      return;
    }

    // Inject message into target's conversation
    targetInstance.messages.push({
      role: 'user',
      content: `[MESSAGE FROM ${fromInstance.name}]: ${message}`,
    });

    this.emit('event', {
      type: 'instance_message',
      data: {
        from: { id: fromId, name: fromInstance.name },
        to: { id: targetInstance.id, name: targetInstance.name },
        message,
      },
    });

    console.log(`[Vulkan] ${fromInstance.name} → ${targetInstance.name}: "${message.slice(0, 80)}..."`);

    // Trigger target's next inference round with a small delay
    setTimeout(() => this.runInstanceInference(targetInstance.id), 600);
  }

  /**
   * Send a message from the orchestrator (or user) to a named instance.
   */
  sendMessageByName(targetName, message) {
    const targetInstance = this.getInstanceByName(targetName);
    if (!targetInstance) return false;

    targetInstance.messages.push({
      role: 'user',
      content: `[ORCHESTRATOR]: ${message}`,
    });

    this.emit('event', {
      type: 'instance_message',
      data: {
        from: { id: 'orchestrator', name: 'ORCHESTRATOR' },
        to: { id: targetInstance.id, name: targetInstance.name },
        message,
      },
    });

    setTimeout(() => this.runInstanceInference(targetInstance.id), 300);
    return true;
  }

  getInstanceByName(name) {
    return Array.from(this.instances.values()).find(
      i => i.name.toLowerCase() === name.toLowerCase()
    );
  }

  getAllInstances() {
    return Array.from(this.instances.values()).map(i => ({
      id: i.id,
      name: i.name,
      role: i.role,
      goal: i.goal,
      status: i.status,
      roundsCompleted: i.roundsCompleted,
      responseCount: i.responses.length,
      createdAt: i.createdAt,
    }));
  }

  terminate(id) {
    const instance = this.instances.get(id);
    if (instance) {
      instance.status = 'TERMINATED';
      console.log(`[Vulkan] Terminated instance "${instance.name}"`);
      this.emit('event', {
        type: 'instance_terminated',
        data: { id, name: instance.name },
      });
    }
  }

  terminateAll() {
    const count = this.instances.size;
    for (const instance of this.instances.values()) {
      instance.status = 'TERMINATED';
    }
    this.instances.clear();
    console.log(`[Vulkan] Terminated all instances (${count})`);
    this.emit('event', { type: 'all_terminated' });
  }
}

export default new InstanceManager();
