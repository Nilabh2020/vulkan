import React, { useState, useEffect, useCallback, useRef } from 'react';
import GridBackground from './components/GridBackground';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import FlowGraph from './components/FlowGraph';
import ChatView from './components/ChatView';
import OnboardingModal from './components/modals/OnboardingModal';
import ProviderModal from './components/modals/ProviderModal';
import SSHModal from './components/modals/SSHModal';
import { useNodesState, useEdgesState } from '@xyflow/react';

function App() {
  const [view, setView] = useState('chat'); // 'chat' or 'graph'
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [providerModal, setProviderModal] = useState({ isOpen: false, name: '' });
  const [sshModalOpen, setSshModalOpen] = useState(false);
  
  const [messages, setMessages] = useState([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [extendedToolNames, setExtendedToolNames] = useState([]);
  const [artifacts, setArtifacts] = useState({});

  // Load from backend on mount
  useEffect(() => {
    fetch('http://127.0.0.1:3001/api/session/load')
      .then(r => r.json())
      .then(data => {
        if (data.messages?.length || data.nodes?.length) {
          setMessages(data.messages || []);
          setNodes(data.nodes || []);
          setEdges(data.edges || []);
        }
      })
      .catch(err => console.error('[Vulkan] Initial load failed:', err));

    fetch('http://127.0.0.1:3001/api/tools')
      .then(r => r.json())
      .then(data => {
        if (data.names) setExtendedToolNames(data.names);
      })
      .catch(err => console.error('[Vulkan] Tool load failed:', err));
  }, [setNodes, setEdges]);

  // Persistence (save to backend)
  useEffect(() => {
    if (!messages.length && !nodes.length) return;
    
    // Debounce save slightly to avoid flooding the backend
    const timeout = setTimeout(() => {
      fetch('http://127.0.0.1:3001/api/session/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, nodes, edges }),
      }).catch(e => console.error('[Vulkan] Auto-save failed'));
    }, 1000);

    return () => clearTimeout(timeout);
  }, [messages, nodes, edges]);

  useEffect(() => {
    const hasVisited = localStorage.getItem('vulkan_visited');
    if (!hasVisited) {
      setShowOnboarding(true);
      localStorage.setItem('vulkan_visited', 'true');
    }
  }, []);

  const rootNodeId = useRef(null);
  const spawnAgentRef = useRef(null);

  // ═══════════════════════════════════════════════════════════════
  // SSE — Real-time instance events from backend
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    let es;

    const connect = () => {
      es = new EventSource('http://127.0.0.1:3001/api/instances/stream');

      es.onmessage = (event) => {
        const { type, data } = JSON.parse(event.data);

        switch (type) {
          case 'initial_state':
            // Could sync on reconnect — currently a no-op
            break;

          case 'instance_spawned':
            setNodes(nds => nds.map(n =>
              n.id === data.id ? { ...n, data: { ...n.data, status: data.status } } : n
            ));
            break;

          case 'instance_status':
            setNodes(nds => nds.map(n =>
              n.id === data.id ? { ...n, data: { ...n.data, status: data.status } } : n
            ));
            break;

          case 'instance_response':
            setNodes(nds => nds.map(n =>
              n.id === `node-${data.id}` || n.id === data.id ? { ...n, data: { ...n.data, status: 'ACTIVE', rounds: data.round, contextLen: data.contextLen } } : n
            ));
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: data.response,
              meta: { type: 'agent_response', agentName: data.name, agentId: data.id, round: data.round },
            }]);
            break;

          case 'instance_message':
            // Add a communication edge between agents
            setEdges(eds => {
              const edgeId = `e-comm-${data.from.id}-${data.to.id}`;
              if (eds.find(e => e.id === edgeId)) return eds;
              return [...eds, {
                id: edgeId,
                source: data.from.id,
                target: data.to.id,
                animated: true,
                style: { stroke: '#4fc3ff', strokeWidth: 1.5, opacity: 0.5 },
              }];
            });
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: data.message,
              meta: { type: 'agent_message', from: data.from.name, to: data.to.name },
            }]);
            break;

          case 'instance_completed':
            setNodes(nds => nds.map(n =>
              n.id === data.id ? { ...n, data: { ...n.data, status: 'COMPLETED' } } : n
            ));
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: data.summary,
              meta: { type: 'agent_completed', agentName: data.name, agentId: data.id },
            }]);
            break;

          case 'instance_error':
            setNodes(nds => nds.map(n =>
              n.id === data.id ? { ...n, data: { ...n.data, status: 'ERROR' } } : n
            ));
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: data.error,
              meta: { type: 'agent_error', agentName: data.name, agentId: data.id },
            }]);
            break;

          case 'instance_terminated':
            setNodes(nds => nds.map(n =>
              n.id === data.id ? { ...n, data: { ...n.data, status: 'TERMINATED' } } : n
            ));
            break;

          case 'all_terminated':
            // Graph reset already handled in resetGraph()
            break;

          case 'sys_error':
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `Message delivery failed: ${data.from} → ${data.target} (${data.reason})`,
              meta: { type: 'system_warning' },
            }]);
            break;

          case 'artifact_updated':
            setArtifacts(prev => ({
              ...prev,
              [data.filename]: { content: data.content, author: data.author, timestamp: Date.now() }
            }));
            break;

          default:
            break;
        }
      };

      es.onerror = () => {
        // EventSource auto-reconnects; no action needed
      };
    };

    connect();

    return () => {
      if (es) es.close();
    };
  }, [setNodes, setEdges]);

  // ═══════════════════════════════════════════════════════════════
  // spawnSubAgent — calls the REAL backend to start a parallel inference
  // ═══════════════════════════════════════════════════════════════
  const spawnSubAgent = useCallback(async (name, role, goal) => {
    const savedProvider = localStorage.getItem('vulkan_active_provider') || 'ollama';
    const config = JSON.parse(localStorage.getItem(`vulkan_provider_${savedProvider}`) || '{}');

    try {
      const response = await fetch('http://127.0.0.1:3001/api/instances/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          role,
          goal,
          provider: savedProvider,
          model: config.model || '',
          config,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.details || 'Spawn failed');
      }

      // Add node to graph in an organized grid layout
      const id = data.instance.id;

      setNodes(nds => {
        const cols = 8;
        const spacingX = 400;
        const spacingY = 280;
        // Start counting after the root node
        const index = Math.max(0, nds.length - 1);
        const row = Math.floor(index / cols);
        const col = index % cols;
        const x = 500 + (col * spacingX) + (Math.random() * 20);
        const y = 50 + (row * spacingY) + (Math.random() * 20);

        return [...nds, {
          id,
          type: 'agent',
          position: { x, y },
          data: { label: name, context: `${role}: ${goal}`, type: 'sub', status: 'ACTIVE', depth: 1 },
        }];
      });

      if (rootNodeId.current) {
        setEdges(eds => [...eds, {
          id: `e-${rootNodeId.current}-${id}`,
          source: rootNodeId.current,
          target: id,
          animated: true,
          style: { stroke: '#ffffff', strokeWidth: 1, opacity: 0.3, strokeDasharray: '5 5' },
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `SPAWN_ERROR: Failed to create "${name}": ${err.message}`,
        meta: { type: 'system_error' },
      }]);
    }
  }, [setNodes, setEdges]);

  // ═══════════════════════════════════════════════════════════════
  // handleChatRequest — sends to orchestrator, parses commands, spawns real agents
  // ═══════════════════════════════════════════════════════════════
  const handleChatRequest = useCallback(async (content) => {
    const userMsg = { role: 'user', content };
    setMessages(prev => [...prev, userMsg]);

    try {
      const savedProvider = localStorage.getItem('vulkan_active_provider') || 'ollama';
      const config = JSON.parse(localStorage.getItem(`vulkan_provider_${savedProvider}`) || '{}');
      
      const response = await fetch('http://127.0.0.1:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: savedProvider,
          model: config.model || '',
          messages: [...messages, userMsg],
          config: config,
          stream: true
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const errMsg = data.details || data.error || `Backend error ${response.status}`;
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `PROVIDER_ERROR: ${errMsg}`,
          meta: { type: 'system_error' },
        }]);
        return;
      }

      // ── Handle Streaming ──
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let replyText = '';
      
      // Add initial empty assistant message
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                replyText += data.text;
                // Update the last message
                setMessages(prev => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1] = { 
                    ...newMsgs[newMsgs.length - 1], 
                    content: replyText 
                  };
                  return newMsgs;
                });
              }
            } catch (e) {}
          }
        }
      }
      
      // ── Parse Commands after stream completes ──
      const reply = replyText;
      
      // Improved Regex: Handle single/double quotes, optional spaces, and multi-line arguments, strict start of line
      const spawnRegex = /^\s*spawn_instance\s*\(\s*(['"])(.*?)\1\s*,\s*(['"])(.*?)\3\s*,\s*(['"])([\s\S]*?)\5\s*\)/gim;
      const messageRegex = /^\s*send_message\s*\(\s*(['"])(.*?)\1\s*,\s*(['"])([\s\S]*?)\3\s*\)/gim;
      const searchRegex = /^\s*search_web\s*\(\s*(['"])(.*?)\1\s*\)/gim;

      const spawnMatches = [...reply.matchAll(spawnRegex)];
      spawnMatches.forEach((match, index) => {
        const name = match[2];
        const role = match[4];
        const goal = match[6];
        setTimeout(() => spawnSubAgent(name, role, goal), 200 * index);
      });

      const messageMatches = [...reply.matchAll(messageRegex)];
      messageMatches.forEach((match, index) => {
        const target = match[2];
        const msg = match[4];
        setTimeout(() => {
          fetch('http://127.0.0.1:3001/api/instances/message-by-name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetName: target, message: msg }),
          }).catch(() => {});
        }, 200 * index + 1000);
      });

      const searchMatches = [...reply.matchAll(searchRegex)];
      searchMatches.forEach((match, index) => {
        const query = match[2];
        console.log(`[Vulkan] Orchestrator requested search: ${query}`);
      });

      const availRegex = /^\s*available_agents\s*\(\s*\)/gim;
      if (availRegex.test(reply)) {
        setTimeout(() => {
          fetch('http://127.0.0.1:3001/api/instances')
            .then(res => res.json())
            .then(data => {
              const active = data.instances?.filter(i => i.status !== 'TERMINATED');
              if (!active || active.length === 0) {
                setMessages(prev => [...prev, {
                  role: 'assistant',
                  content: `[SYSTEM ALERT: AVAILABLE AGENTS]\n\nNo other agents available.`,
                  meta: { type: 'system_warning' }
                }]);
              } else {
                const list = active.map(i => `- ${i.name} (${i.role}): ${i.goal} [STATUS: ${i.status}]`).join('\n');
                setMessages(prev => [...prev, {
                  role: 'assistant',
                  content: `[SYSTEM ALERT: AVAILABLE AGENTS]\n\n${list}`,
                  meta: { type: 'system_warning' }
                }]);
              }
            }).catch(console.error);
        }, 1000);
      }

      // Parse generic tools
      if (extendedToolNames.length > 0) {
        const toolNamesRegexStr = extendedToolNames.join('|');
        const startRegex = new RegExp(`^\\s*(${toolNamesRegexStr})\\s*\\(`, 'gim');
        
        let match;
        while ((match = startRegex.exec(reply)) !== null) {
          const toolName = match[1];
          let depth = 1;
          let argsRaw = '';
          let inQuotes = false;
          let quoteChar = '';
          let isTriple = false;
          const startIndex = match.index + match[0].length;
          let endIndex = -1;
          
          for (let i = startIndex; i < reply.length; i++) {
            const char = reply[i];
            const pChar = reply[i-1];
            const substr3 = reply.substring(i, i+3);
            
            if (!inQuotes && (substr3 === '"""' || substr3 === "'''")) {
              inQuotes = true; quoteChar = reply[i]; isTriple = true;
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
          
          // Execute after delay
          const index = 0;
          setTimeout(() => {
            fetch('http://127.0.0.1:3001/api/tools/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ toolName, args }),
            })
            .then(res => res.json())
            .then(result => {
              setMessages(prev => [...prev, {
                role: 'assistant',
                content: `> **Tool Execution: \`${toolName}\`**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
                meta: { type: 'system_warning' }
              }]);
            })
            .catch(err => console.error('[Vulkan] Tool execution failed', err));
          }, 300 * index + 1500);
        }
      }

    } catch (err) {
      console.error('[Vulkan] Chat request failed:', err);
      const errorDetail = err.message || 'Unknown error';
      setMessages(prev => [...prev, { role: 'assistant', content: `SYSTEM_ERROR: ${errorDetail}` }]);
    }
  }, [messages, spawnSubAgent]);

  // ═══════════════════════════════════════════════════════════════
  // spawnAgent — unified handler for root vs sub agents
  // ═══════════════════════════════════════════════════════════════
  const spawnAgent = useCallback(async (name, context, type = 'sub') => {
    if (type === 'sub') {
      setView('graph');
      // Parse "role: goal" format; fallback to generic
      const colonIdx = context.indexOf(': ');
      const role = colonIdx > 0 ? context.slice(0, colonIdx) : 'worker';
      const goal = colonIdx > 0 ? context.slice(colonIdx + 2) : context;
      spawnSubAgent(name, role, goal);
      return;
    }

    // Root agent — add to graph + trigger orchestrator
    const id = `node-root-${Date.now()}`;
    rootNodeId.current = id;

    setNodes(nds => [...nds, {
      id,
      type: 'agent',
      position: { x: 100, y: 300 },
      data: { label: name, context, type: 'root', status: 'ACTIVE', depth: 0 },
    }]);

    setView('chat');
    handleChatRequest(context);
  }, [setNodes, handleChatRequest, spawnSubAgent]);

  // Keep ref in sync so setTimeout callbacks always have the latest version
  useEffect(() => {
    spawnAgentRef.current = spawnAgent;
  }, [spawnAgent]);

  // ═══════════════════════════════════════════════════════════════
  const terminateSwarm = useCallback(async () => {
    try {
      await fetch('http://127.0.0.1:3001/api/instances', { method: 'DELETE' });
    } catch (e) { /* backend may be down */ }
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // resetGraph — terminates all real instances + clears UI
  // ═══════════════════════════════════════════════════════════════
  const resetGraph = useCallback(async () => {
    await terminateSwarm();
    try {
      await fetch('http://127.0.0.1:3001/api/session/save', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [], nodes: [], edges: [] }) 
      });
    } catch (e) { /* backend may be down */ }

    setNodes([]);
    setEdges([]);
    setMessages([]);
    rootNodeId.current = null;
  }, [setNodes, setEdges, terminateSwarm]);

  // ═══════════════════════════════════════════════════════════════
  // exportChats — downloads the current conversation history as a JSON file
  // ═══════════════════════════════════════════════════════════════
  const exportChats = useCallback(() => {
    const dataStr = JSON.stringify(messages, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `vulkan_swarm_export_${new Date().getTime()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }, [messages]);

  return (
    <div style={styles.appContainer}>
      <GridBackground />
      <TopBar onOpenProvider={(name) => setProviderModal({ isOpen: true, name })} onOpenSSH={() => setSshModalOpen(true)} />
      
      <div style={styles.viewToggle}>
        <button 
          onClick={() => setView('chat')} 
          style={{...styles.toggleBtn, borderBottom: view === 'chat' ? '2px solid #fff' : '2px solid transparent'}}
        >CHAT</button>
        <button 
          onClick={() => setView('graph')} 
          style={{...styles.toggleBtn, borderBottom: view === 'graph' ? '2px solid #fff' : '2px solid transparent'}}
        >SWARM_GRAPH</button>
        <button 
          onClick={() => setView('artifacts')} 
          style={{...styles.toggleBtn, borderBottom: view === 'artifacts' ? '2px solid #fff' : '2px solid transparent'}}
        >ARTIFACTS {Object.keys(artifacts).length > 0 && `(${Object.keys(artifacts).length})`}</button>
      </div>

      <div style={styles.mainLayout}>
        <Sidebar onSpawnAgent={spawnAgent} onReset={resetGraph} onExport={exportChats} onTerminate={terminateSwarm} />
        {view === 'chat' && (
          <ChatView 
            messages={messages} 
            onSendMessage={handleChatRequest} 
            activeProvider={localStorage.getItem('vulkan_active_provider')} 
          />
        )}
        {view === 'graph' && (
          <FlowGraph nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} />
        )}
        {view === 'artifacts' && (
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', gap: '20px', flexWrap: 'wrap', alignContent: 'flex-start' }}>
            {Object.entries(artifacts).length === 0 ? (
               <div style={{ color: '#666', marginTop: '40px', width: '100%', textAlign: 'center' }}>No live artifacts generated yet. When agents use write_file(), files will appear here.</div>
            ) : (
              Object.entries(artifacts).map(([filename, data]) => (
                <div key={filename} style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', minWidth: '400px', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <strong style={{ color: '#4fc3ff' }}>{filename}</strong>
                    <span style={{ fontSize: '0.7rem', color: '#666' }}>Author: {data.author}</span>
                  </div>
                  <pre style={{ background: '#09090b', padding: '12px', borderRadius: '4px', fontSize: '0.8rem', overflowX: 'auto', color: '#e5e5e5' }}>
                    {data.content}
                  </pre>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <OnboardingModal isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
      <ProviderModal isOpen={providerModal.isOpen} onClose={() => setProviderModal({ isOpen: false, name: '' })} providerName={providerModal.name} />
      <SSHModal isOpen={sshModalOpen} onClose={() => setSshModalOpen(false)} />

      <style>{`
        @keyframes modalFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

const styles = {
  appContainer: { display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', color: 'var(--text-primary)', position: 'relative', overflow: 'hidden' },
  mainLayout: { display: 'flex', flex: 1, overflow: 'hidden' },
  viewToggle: { display: 'flex', gap: '20px', padding: '0 40px', marginBottom: '10px', borderBottom: '1px solid var(--border-color)', background: 'var(--panel-bg)' },
  toggleBtn: { padding: '10px 0', fontSize: '0.65rem', fontWeight: '800', letterSpacing: '1px', color: 'var(--text-secondary)' }
};

export default App;
