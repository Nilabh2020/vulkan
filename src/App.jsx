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
  
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('vulkan_chat_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [nodes, setNodes, onNodesChange] = useNodesState(() => {
    const saved = localStorage.getItem('vulkan_nodes');
    return saved ? JSON.parse(saved) : [];
  });
  const [edges, setEdges, onEdgesChange] = useEdgesState(() => {
    const saved = localStorage.getItem('vulkan_edges');
    return saved ? JSON.parse(saved) : [];
  });

  // Persistence
  useEffect(() => {
    localStorage.setItem('vulkan_chat_history', JSON.stringify(messages));
    localStorage.setItem('vulkan_nodes', JSON.stringify(nodes));
    localStorage.setItem('vulkan_edges', JSON.stringify(edges));
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
              n.id === data.id ? { ...n, data: { ...n.data, status: 'ACTIVE' } } : n
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

          case 'instance_message_failed':
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `Message delivery failed: ${data.from} → ${data.target} (${data.reason})`,
              meta: { type: 'system_warning' },
            }]);
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

      // Add node to graph immediately (SSE will update its status)
      const id = data.instance.id;
      const x = 450 + (Math.random() * 400);
      const y = 50 + (Math.random() * 500);

      setNodes(nds => [...nds, {
        id,
        type: 'agent',
        position: { x, y },
        data: { label: name, context: `${role}: ${goal}`, type: 'sub', status: 'ACTIVE', depth: 1 },
      }]);

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
          config: config
        })
      });
      
      const data = await response.json();

      if (!response.ok) {
        const errMsg = data.details || data.error || `Backend error ${response.status}`;
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `PROVIDER_ERROR: ${errMsg}`,
          meta: { type: 'system_error' },
        }]);
        return;
      }

      const reply = data.reply || '';
      
      // Show the orchestrator's raw command output in chat
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      
      // Parse orchestrator commands and spawn REAL agents
      // Use matchAll and [\s\S] to support multi-line arguments and single/double quotes
      const spawnMatches = [...reply.matchAll(/spawn_instance\s*\(\s*["'](.*?)["']\s*,\s*["'](.*?)["']\s*,\s*["']([\s\S]*?)["']\s*\)/gi)];
      
      spawnMatches.forEach((match, index) => {
        const [, name, role, goal] = match;
        // Stagger spawns slightly to avoid hammering the provider
        setTimeout(() => {
          spawnSubAgent(name, role, goal);
        }, 200 * index);
      });

      // Parse send_message("instance", "message") from the orchestrator
      const messageMatches = [...reply.matchAll(/send_message\s*\(\s*["'](.*?)["']\s*,\s*["']([\s\S]*?)["']\s*\)/gi)];
      
      messageMatches.forEach((match, index) => {
        const [, target, msg] = match;
        // Route to real instance via backend
        setTimeout(() => {
          fetch('http://127.0.0.1:3001/api/instances/message-by-name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetName: target, message: msg }),
          }).catch(() => {});
        }, 200 * index + 1000); // Extra delay to ensure instances are spawned first
      });

    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'SYSTEM_ERROR: Backend connection failed.' }]);
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
  // resetGraph — terminates all real instances + clears UI
  // ═══════════════════════════════════════════════════════════════
  const resetGraph = useCallback(async () => {
    try {
      await fetch('http://127.0.0.1:3001/api/instances', { method: 'DELETE' });
    } catch (e) { /* backend may be down */ }

    setNodes([]);
    setEdges([]);
    setMessages([]);
    rootNodeId.current = null;
    localStorage.removeItem('vulkan_chat_history');
    localStorage.removeItem('vulkan_nodes');
    localStorage.removeItem('vulkan_edges');
  }, [setNodes, setEdges]);

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
      </div>

      <div style={styles.mainLayout}>
        <Sidebar onSpawnAgent={spawnAgent} onReset={resetGraph} onExport={exportChats} />
        {view === 'chat' ? (
          <ChatView 
            messages={messages} 
            onSendMessage={handleChatRequest} 
            activeProvider={localStorage.getItem('vulkan_active_provider')} 
          />
        ) : (
          <FlowGraph nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} />
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
