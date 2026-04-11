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
import { performWebSearch } from './search.js';
import { generatePromptExtension, executeGenericTool, getToolNames } from './toolRegistry.js';

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

    const basePrompt = [
      `[VULKAN_SUB_AGENT_INITIALIZATION]`,
      `IDENTITY: ${name}`,
      `ROLE: ${role}`,
      `OBJECTIVE: ${goal}`,
      ``,
      `You are an autonomous AI sub-agent within the Vulkan swarm.`,
      `Your role is "${role}" and your specific objective is: "${goal}"`,
      ``,
      otherAgents.length > 0
        ? `OTHER ACTIVE AGENTS: ${otherAgents.join(', ')}`
        : `You are currently the only active agent in this swarm.`,
      ``,
      `<CRITICAL_INSTRUCTIONS>`,
      `1. You MUST begin working on your OBJECTIVE immediately.`,
      `2. You are a real worker, not a simulator. Do not say "I will do this". ACTUALLY DO IT by doing analysis or calling tools.`,
      `3. To use a tool, write the tool command on its own line in plain text. DO NOT wrap commands in markdown code blocks like \`\`\`.`,
      `4. You MUST use EXACTLY the right syntax: tool_name("arg1", "arg2") with double quotes.`,
      `5. Once you have fully completed your objective, you MUST call task_complete("summary of result"). If you do not call task_complete() you will loop infinitely!`,
      `6. DO NOT hallucinate tools. Use ONLY the tools explicitly listed below.`,
      `</CRITICAL_INSTRUCTIONS>`,
      ``,
      `<CORE_TOOLS>`,
      `send_message("target_agent", "message")`,
      `search_web("search query")`,
      `task_complete("detailed summary of what you accomplished")`,
      `</CORE_TOOLS>`,
    ].join('\n');
    
    return basePrompt + generatePromptExtension();
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

      // --- LOOP DETECTION ---
      if (instance.responses.length >= 3) {
        const last1 = instance.responses[instance.responses.length - 1].content.trim();
        const last2 = instance.responses[instance.responses.length - 2].content.trim();
        const last3 = instance.responses[instance.responses.length - 3].content.trim();
        
        if (last1 === last2 && last2 === last3) {
          instance.status = 'ERROR';
          console.error(`[Vulkan] ${instance.name} terminated due to repeating infinite loop.`);
          this.emit('event', {
            type: 'instance_error',
            data: { id, name: instance.name, error: 'Infinite loop detected (repetitive output). Agent terminated.' },
          });
          return;
        }
      }

      const contextLen = instance.messages.reduce((acc, msg) => acc + (msg.content?.length || 0), 0);

      this.emit('event', {
        type: 'instance_response',
        data: {
          id,
          name: instance.name,
          response,
          round: instance.roundsCompleted,
          contextLen,
        },
      });

      console.log(`[Vulkan] ${instance.name} ← response (${response.length} chars, round ${instance.roundsCompleted})`);

      // Parse and route any commands embedded in the response
      const performedSearch = await this.parseAndRouteCommands(id, response);

      // If messages arrived while we were thinking OR if we just performed a web search, run another round
      if (performedSearch || instance._pendingRound) {
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
   * Scan an agent's response for send_message, task_complete, and search_web commands
   * and route them accordingly.
   */
  async parseAndRouteCommands(fromId, response) {
    const instance = this.instances.get(fromId);
    if (!instance) return false;

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
      return false; // Stop further processing if task is complete
    }

    // Match search_web commands
    const searchRegex = /search_web\s*\(\s*["'](.*?)["']\s*\)/gi;
    let performedSearch = false;
    while ((match = searchRegex.exec(response)) !== null) {
      const [, query] = match;
      performedSearch = true;
      console.log(`[Vulkan] ${instance.name} searching web for: "${query}"`);
      
      this.emit('event', {
        type: 'instance_message',
        data: {
          from: { id: fromId, name: instance.name },
          to: { id: 'system', name: 'WEB_SEARCH_ENGINE' },
          message: `Executing web search for: "${query}"...`,
        },
      });

      const searchResults = await performWebSearch(query);

      // Inject the search results back into this instance's context
      instance.messages.push({
        role: 'user', // Present it as new input from the system
        content: `[SYSTEM ALERT: WEB SEARCH RESULTS FOR "${query}"]\n\n${searchResults}`
      });
    }

    // --- Extended Tools Regex ---
    const extendedTools = getToolNames();
    if (extendedTools.length > 0) {
      const toolNamesRegexStr = extendedTools.join('|');
      const extendedToolRegex = new RegExp(`\\b(${toolNamesRegexStr})\\s*\\((.*?)\\)`, 'gi');
      
      while ((toolMatch = extendedToolRegex.exec(response)) !== null) {
        const [, toolName, argsRaw] = toolMatch;
        const args = [];
        let currentArg = '';
        let inQuotes = false;
        let quoteType = '';
        for (let i = 0; i < argsRaw.length; i++) {
          const char = argsRaw[i];
          if ((char === '"' || char === "'") && (i === 0 || argsRaw[i-1] !== '\\')) {
            if (!inQuotes) { inQuotes = true; quoteType = char; }
            else if (quoteType === char) { inQuotes = false; }
            else { currentArg += char; }
          } else if (char === ',' && !inQuotes) {
            args.push(currentArg.trim());
            currentArg = '';
          } else {
            currentArg += char;
          }
        }
        if (currentArg.trim() !== '') args.push(currentArg.trim());
        
        console.log(`[Vulkan] ${instance.name} called extended tool: ${toolName}`);
        
        this.emit('event', {
          type: 'instance_message',
          data: {
            from: { id: fromId, name: instance.name },
            to: { id: 'system', name: `TOOL_REGISTRY` },
            message: `Executing generic tool: ${toolName}(...)`,
          },
        });

        const result = await executeGenericTool(toolName, args);

        instance.messages.push({
          role: 'user',
          content: `[SYSTEM ALERT: TOOL EXECUTION RESULT FOR ${toolName}]\n\n${JSON.stringify(result, null, 2)}`
        });
        
        performedSearch = true; // Trigger another inference round to process the tool result
      }
    }

    // --- Hallucination Detection ---
    if (!performedSearch && instance.status !== 'COMPLETED') {
      const recognizedTools = new Set(['send_message', 'task_complete', 'search_web', ...getToolNames()]);
      const lineToolRegex = /^\s*([a-zA-Z_]+)\s*\(['"]/gm;
      let htMatch;
      let hallucinationError = null;

      while ((htMatch = lineToolRegex.exec(response)) !== null) {
        const funcName = htMatch[1];
        if (!recognizedTools.has(funcName)) {
          hallucinationError = funcName;
          break;
        }
      }

      if (hallucinationError) {
        console.warn(`[Vulkan] ${instance.name} hallucinated tool: ${hallucinationError}`);
        this.emit('event', {
          type: 'instance_message',
          data: {
            from: { id: 'system', name: 'SYSTEM' },
            to: { id: fromId, name: instance.name },
            message: `[HALLUCINATION DETECTED]: Tool '${hallucinationError}' does not exist.`
          }
        });
        instance.messages.push({
          role: 'user',
          content: `[SYSTEM ALERT: ERROR] You attempted to use a tool called '${hallucinationError}'. This tool DOES NOT EXIST. Please use only the explicitly provided tools, or task_complete() if you are done.`
        });
        performedSearch = true; // Trigger inference again to self-correct
      }
    }

    return performedSearch;
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
