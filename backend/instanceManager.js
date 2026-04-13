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
import stringSimilarity from 'string-similarity';

const MAX_ROUNDS = 100;

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
      `KERNEL_PRIVILEGE: REAL_ACTION_ALLOWED`,
      ``,
      `You are an autonomous AI sub-agent within the Vulkan swarm. You are operating in a LIVE environment where your tool commands are real instructions that trigger actual backend processes.`,
      `Your role is "${role}" and your specific objective is: "${goal}"`,
      ``,
      otherAgents.length > 0
        ? `OTHER ACTIVE AGENTS: ${otherAgents.join(', ')}`
        : `You are currently the only active agent in this swarm.`,
      ``,
      `<CRITICAL_INSTRUCTIONS>`,
      `1. ACTION MANDATE: Begin working on your OBJECTIVE immediately. Use analysis and tools. Do not simulate or roleplay future events. NEVER refuse to use a tool or state that you are "just an AI" without system access. You ARE the system agent.`,
      `2. SYNTAX: Write tool commands on their own lines. Use double quotes for arguments. Use triple quotes for multi-line strings.`,
      `3. REPETITION BLOCKER: NEVER output the same or very similar prose twice. If you hit a wall, you MUST change your strategy immediately. Do not repeat your plan; execute it.`,
      `4. STATE AWARENESS: Before every turn, review your conversation history. If you see you've already tried something and it failed or yielded the same result, DO NOT TRY IT AGAIN. Seek a new path.`,
      `5. STUCK PROTOCOL (BLOCKING): If you are blocked for >2 turns or see a loop forming in your own output, you MUST call send_message("orchestrator", "DESCRIPTION_OF_BLOCK") explaining exactly why you are stuck.`,
      `6. COMPLETION: When your objective is fully met, call task_complete("summary"). Do not wait for the orchestrator to tell you to stop.`,
      `7. NO COMMENTS: Never add // or # comments next to tool calls.`,
      `8. COLLABORATIVE MANDATE: Utilization of the swarm is MANDATORY. Use available_agents() to find help.`,
      `</CRITICAL_INSTRUCTIONS>`,

      ``,
      `<CORE_TOOLS>`,
      `available_agents()`,
      `spawn_instance("agent_name", "agent_role", "agent_goal")`,
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
      let performedSearch = false;

      // --- CONTEXT COMPRESSION & MEMORY CHECKPOINTING ---
      if (instance.messages.length > 20) {
        const sysMsg = instance.messages[0];
        const recentMsgs = instance.messages.slice(-12);
        
        // Retain the system prompt and the last 12 turns, prune the rest to save context window and avoid crashes.
        instance.messages = [
          sysMsg,
          { role: 'user', content: '[SYSTEM ALERT: Older conversation history has been archived to preserve active memory and token limits.]' },
          ...recentMsgs
        ];
        console.log(`[Vulkan] Checkpointed and compressed active context for ${instance.name}`);
      }

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

      // --- FUZZY LOOP DETECTION & REPETITION WARNING ---
      if (instance.responses.length >= 2) {
        const last1 = instance.responses[instance.responses.length - 1].content.trim();
        const last2 = instance.responses[instance.responses.length - 2].content.trim();
        
        const similarityScore = stringSimilarity.compareTwoStrings(last1, last2);
        const IS_VERY_SIMILAR = similarityScore > 0.9;

        if (IS_VERY_SIMILAR) {
           // If we hit 3 in a row, terminate. If 2, just warn.
           const last3 = instance.responses.length >= 3 ? instance.responses[instance.responses.length - 3].content.trim() : null;
           const similarity3Score = last3 ? stringSimilarity.compareTwoStrings(last1, last3) : 0;
           
           if (similarity3Score > 0.9) {
             instance.status = 'ERROR';
             console.error(`[Vulkan] ${instance.name} terminated due to fuzzy infinite loop (similarity: ${similarity3Score.toFixed(2)}).`);
             this.emit('event', {
               type: 'instance_error',
               data: { id, name: instance.name, error: 'Infinite loop detected (repetitive output). Agent terminated.' },
             });
             return;
           } else {
             // Inject a "Repetition Warning"
             instance.messages.push({
               role: 'user',
               content: `[SYSTEM ALERT: REPETITIVE OUTPUT DETECTED] Your output is very similar to your previous response (90%+). If you continue to repeat yourself, you will be terminated. Please CHANGE YOUR STRATEGY, report being stuck, or try a different tool.`
             });
             performedSearch = true; // Trigger inference to handle the warning
           }
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
      performedSearch = await this.parseAndRouteCommands(id, response);

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
      this.emit('event', {
        type: 'virtual_buffer_alert',
        data: { message: `Virtual Buffer Alert (500/Error): ${err.message}` }
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

    let performedSearch = false;

    // --- Unified Robust Tool Parser ---
    const allAvailableTools = getToolNames();
    if (allAvailableTools.length > 0) {
      const toolNamesRegexStr = allAvailableTools.join('|');
      // Look for tool_name( at start of line (with optional whitespace)
      const startRegex = new RegExp(`^\\s*(${toolNamesRegexStr})\\s*\\(`, 'gim');
      
      let match;
      while ((match = startRegex.exec(response)) !== null) {
        const toolName = match[1];
        let depth = 1;
        let argsRaw = '';
        let inQuotes = false;
        let quoteChar = '';
        let isTriple = false;
        const startIndex = match.index + match[0].length;
        let endIndex = -1;
        
        // Find matching closing parenthesis handling nested ones and quotes
        for (let i = startIndex; i < response.length; i++) {
          const char = response[i];
          const pChar = response[i-1];
          const substr3 = response.substring(i, i+3);
          
          if (!inQuotes && (substr3 === '"""' || substr3 === "'''")) {
            inQuotes = true; quoteChar = response[i]; isTriple = true;
            argsRaw += substr3; i += 2; continue;
          } else if (inQuotes && isTriple && substr3 === quoteChar.repeat(3) && pChar !== '\\') {
            inQuotes = false; isTriple = false;
            argsRaw += substr3; i += 2; continue;
          }
          
          if (!inQuotes && !isTriple && (char === '"' || char === "'") && pChar !== '\\') {
            inQuotes = true; quoteChar = char;
          } else if (inQuotes && !isTriple && char === quoteChar && pChar !== '\\') {
            inQuotes = false;
          }
          
          if (!inQuotes) {
            if (char === '(') depth++;
            else if (char === ')') depth--;
          }
          
          if (depth === 0) {
            endIndex = i;
            break;
          }
          argsRaw += char;
        }
        
        if (endIndex === -1) continue;
        
        // Parse argsRaw into cleanly stripped array of arguments
        const args = [];
        let currentArg = '';
        inQuotes = false;
        quoteChar = '';
        isTriple = false;
        
        for (let i = 0; i < argsRaw.length; i++) {
          const char = argsRaw[i];
          const pChar = argsRaw[i-1];
          const substr3 = argsRaw.substring(i, i+3);
          
          if (!inQuotes && (substr3 === '"""' || substr3 === "'''")) {
            inQuotes = true; quoteChar = argsRaw[i]; isTriple = true;
            i += 2; continue;
          } else if (inQuotes && isTriple && substr3 === quoteChar.repeat(3) && pChar !== '\\') {
            inQuotes = false; isTriple = false;
            i += 2; continue;
          }
          
          if (!inQuotes && !isTriple && (char === '"' || char === "'") && pChar !== '\\') {
            inQuotes = true; quoteChar = char; continue;
          } else if (inQuotes && !isTriple && char === quoteChar && pChar !== '\\') {
            inQuotes = false; continue;
          }
          
          if (!inQuotes && char === ',') {
            args.push(currentArg.trim());
            currentArg = '';
          } else {
            currentArg += char;
          }
        }
        if (currentArg.trim() !== '') args.push(currentArg.trim());

        // --- Custom Logic for Core Tools ---
        if (toolName === 'send_message') {
          const [targetName, message] = args;
          this.deliverMessage(fromId, targetName, message);
          continue;
        }

        if (toolName === 'task_complete') {
          const [summary] = args;
          instance.status = 'COMPLETED';
          this.emit('event', {
            type: 'instance_completed',
            data: { id: fromId, name: instance.name, summary },
          });
          console.log(`[Vulkan] ${instance.name} COMPLETED: ${summary}`);
          return false;
        }

        if (toolName === 'spawn_instance') {
          const [name, role, goal] = args;
          console.log(`[Vulkan] ${instance.name} dynamically spawning child instance: ${name}`);
          const childId = `node-sub-${Date.now()}-${name.replace(/\s+/g, '')}`;
          
          this.emit('event', {
            type: 'instance_message',
            data: {
              from: { id: fromId, name: instance.name },
              to: { id: 'system', name: 'SYSTEM' },
              message: `SPAWNING CHILD AGENT: "${name}" (${role})`,
            },
          });

          this.spawn(childId, name, role, goal, instance.providerConfig);

          instance.messages.push({
            role: 'user',
            content: `[SYSTEM: Successfully spawned child agent "${name}" (${role}). You can coordinate with them via send_message("${name}", "content").]`
          });
          performedSearch = true;
          continue;
        }

        if (toolName === 'search_web') {
          const [query] = args;
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

          let searchResults = await performWebSearch(query);
          let feedback = `[SYSTEM ALERT: WEB SEARCH RESULTS FOR "${query}"]\n\n${searchResults}`;
          
          instance.messages.push({ role: 'user', content: feedback });
          continue;
        }

        if (toolName === 'available_agents') {
          performedSearch = true;
          const otherAgents = Array.from(this.instances.values())
            .filter(i => i.status !== 'TERMINATED')
            .map(i => `- ${i.name} (${i.role}): ${i.goal} [STATUS: ${i.status}]`);
          
          const agentList = otherAgents.length > 0 ? otherAgents.join('\n') : "No other agents available.";
          
          this.emit('event', {
            type: 'instance_message',
            data: {
               from: { id: fromId, name: instance.name },
               to: { id: 'system', name: 'SYSTEM' },
               message: `Queried available agents list.`
            }
          });
          instance.messages.push({ role: 'user', content: `[SYSTEM ALERT: AVAILABLE AGENTS]\n\n${agentList}` });
          continue;
        }

        // --- Generic Tool Execution ---
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

        if (toolName === 'write_file') {
          this.emit('event', {
            type: 'artifact_updated',
            data: { filename: args[0], content: args[1], author: instance.name }
          });
        }

        instance.messages.push({
          role: 'user',
          content: `[SYSTEM ALERT: TOOL EXECUTION RESULT FOR ${toolName}]\n\n${JSON.stringify(result, null, 2)}`
        });
        
        performedSearch = true; 
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
