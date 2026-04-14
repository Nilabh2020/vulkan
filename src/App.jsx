import React, { useState, useEffect, useCallback, useRef } from 'react';
import GridBackground from './components/GridBackground';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import FlowGraph from './components/FlowGraph';
import ChatView from './components/ChatView';
import WorkflowBuilder from './components/WorkflowBuilder';
import OnboardingModal from './components/modals/OnboardingModal';
import ProviderModal from './components/modals/ProviderModal';
import SSHModal from './components/modals/SSHModal';
import { useNodesState, useEdgesState, addEdge } from '@xyflow/react';

function App() {
  const [view, setView] = useState('chat');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [providerModal, setProviderModal] = useState({ isOpen: false, name: '' });
  const [sshModalOpen, setSshModalOpen] = useState(false);
  
  const [messages, setMessages] = useState([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [extendedToolNames, setExtendedToolNames] = useState([]);
  const [artifacts, setArtifacts] = useState({});

  // ── Node Property Updater ──
  const handleNodeChange = useCallback((id, field, value) => {
    setNodes((nds) => 
      nds.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, [field]: value } };
        }
        return node;
      })
    );
  }, [setNodes]);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#4fc3ff' } }, eds)),
    [setEdges],
  );

  // ── Load Session ──
  useEffect(() => {
    fetch('http://127.0.0.1:3001/api/session/load')
      .then(r => r.json())
      .then(data => {
        if (data.messages) setMessages(data.messages);
        if (data.edges) setEdges(data.edges);
        if (data.nodes) {
          // CRITICAL: Re-attach the functional onChange handler to the static data from JSON
          const hydratedNodes = data.nodes.map(n => ({
            ...n,
            data: { ...n.data, onChange: handleNodeChange }
          }));
          setNodes(hydratedNodes);
        }
      })
      .catch(err => console.error('[Vulkan] Initial load failed:', err));

    fetch('http://127.0.0.1:3001/api/tools')
      .then(r => r.json())
      .then(data => {
        if (data.names) setExtendedToolNames(data.names);
      })
      .catch(err => console.error('[Vulkan] Tool load failed:', err));
  }, [setNodes, setEdges, handleNodeChange]);

  // ── Auto-Save Session ──
  useEffect(() => {
    const timeout = setTimeout(() => {
      fetch('http://127.0.0.1:3001/api/session/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages, 
          // Don't save functions in the nodes data
          nodes: nodes.map(n => {
            const { onChange, ...serializableData } = n.data;
            return { ...n, data: serializableData };
          }), 
          edges 
        }),
      }).catch(e => console.error('[Vulkan] Auto-save failed'));
    }, 1000);
    return () => clearTimeout(timeout);
  }, [messages, nodes, edges]);

  const spawnAgent = useCallback(async (name, context, type = 'sub') => {
    setView('graph');
  }, []);

  const spawnBlueprint = useCallback(async (blueprint) => {
    spawnAgent(blueprint.name, blueprint.goal || 'General purpose agent', 'sub');
  }, [spawnAgent]);

  const handleChatRequest = useCallback(async (content) => {
    const userMsg = { role: 'user', content };
    setMessages(prev => [...prev, userMsg]);
  }, []);

  const runWorkflow = useCallback(async () => {
    console.log('[Vulkan] Starting workflow execution sequence (Propagating Data)...');
    setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, status: 'DRAFT', outputCount: 0, output: null } })));
    await new Promise(r => setTimeout(r, 500));

    const getChildren = (nodeId) => edges.filter(e => e.source === nodeId).map(e => e.target);
    const getParents = (nodeId) => edges.filter(e => e.target === nodeId).map(e => e.source);
    
    const allParentsCompleted = (nodeId, currentNodes) => {
      const parents = getParents(nodeId);
      if (parents.length === 0) return true;
      return parents.every(pId => {
        const parent = currentNodes.find(n => n.id === pId);
        return parent && parent.data.status === 'COMPLETED';
      });
    };

    let queue = nodes.filter(n => getParents(n.id).length === 0).map(n => n.id);
    let completed = new Set();
    let processing = new Set();

    while (queue.length > 0 || processing.size > 0) {
      const toStart = queue.filter(id => allParentsCompleted(id, nodes));
      
      for (const nodeId of toStart) {
        queue = queue.filter(id => id !== nodeId);
        processing.add(nodeId);

        setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, status: 'THINKING' } } : n));
        
        (async () => {
          const node = nodes.find(n => n.id === nodeId);
          const parents = getParents(nodeId);
          const parentOutputs = parents.map(pId => {
            const p = nodes.find(n => n.id === pId);
            return `### Output from ${p?.data.label}:\n${p?.data.output || 'No output data'}`;
          }).join('\n\n');

          await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
          
          let simulatedOutput = '';
          if (node.data.type === 'supervisor') {
            simulatedOutput = `SUPERVISOR AUDIT REPORT: Verified the findings from previous nodes. Logic check passed. Data integrity verified. Output meets specified criteria.`;
          } else if (node.data.type === 'chat') {
            simulatedOutput = `Starting workflow from user input: "${node.data.goal}"`;
          } else {
            simulatedOutput = `Completed specialized task: ${node.data.label}. Generated comprehensive results based on input sequence.`;
          }
          
          setNodes(nds => nds.map(n => n.id === nodeId ? { 
            ...n, 
            data: { ...n.data, status: 'COMPLETED', output: simulatedOutput, outputCount: 1 } 
          } : n));
          
          processing.delete(nodeId);
          completed.add(nodeId);
          const children = getChildren(nodeId);
          queue.push(...children.filter(id => !queue.includes(id) && !completed.has(id) && !processing.has(id)));
        })();
      }
      await new Promise(r => setTimeout(r, 500));
      if (queue.length === 0 && processing.size === 0) break;
    }
  }, [nodes, edges, setNodes]);

  const resetGraph = useCallback(() => {
    setNodes([]); setEdges([]); setMessages([]);
  }, [setNodes, setEdges]);

  const exportChats = useCallback(() => {
    const dataStr = JSON.stringify(messages, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'vulkan_export.json');
    linkElement.click();
  }, [messages]);

  return (
    <div style={styles.appContainer}>
      <GridBackground />
      <TopBar onOpenProvider={(name) => setProviderModal({ isOpen: true, name })} onOpenSSH={() => setSshModalOpen(true)} />
      
      <div style={styles.viewToggle}>
        <button onClick={() => setView('chat')} style={{...styles.toggleBtn, borderBottom: view === 'chat' ? '2px solid #fff' : 'none'}}>CHAT</button>
        <button onClick={() => setView('graph')} style={{...styles.toggleBtn, borderBottom: view === 'graph' ? '2px solid #fff' : 'none'}}>SWARM_GRAPH</button>
        <button onClick={() => setView('workflow')} style={{...styles.toggleBtn, borderBottom: view === 'workflow' ? '2px solid #fff' : 'none'}}>WORKFLOW_BUILDER</button>
        <button onClick={() => setView('artifacts')} style={{...styles.toggleBtn, borderBottom: view === 'artifacts' ? '2px solid #fff' : 'none'}}>ARTIFACTS</button>
      </div>

      <div style={styles.mainLayout}>
        <Sidebar onSpawnAgent={spawnAgent} onSpawnBlueprint={spawnBlueprint} onReset={resetGraph} onExport={exportChats} onTerminate={() => {}} />
        {view === 'chat' && <ChatView messages={messages} onSendMessage={handleChatRequest} />}
        {view === 'graph' && <FlowGraph nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} />}
        {view === 'workflow' && <WorkflowBuilder nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} setNodes={setNodes} onRun={runWorkflow} onChange={handleNodeChange} />}
        {view === 'artifacts' && <div style={{flex:1, padding: '20px', color: '#666'}}>No artifacts yet.</div>}
      </div>

      <OnboardingModal isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
      <ProviderModal isOpen={providerModal.isOpen} onClose={() => setProviderModal({ isOpen: false, name: '' })} providerName={providerModal.name} />
      <SSHModal isOpen={sshModalOpen} onClose={() => setSshModalOpen(false)} />
    </div>
  );
}

const styles = {
  appContainer: { display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', color: 'var(--text-primary)', background: 'var(--bg-color)', position: 'relative', overflow: 'hidden' },
  mainLayout: { display: 'flex', flex: 1, overflow: 'hidden' },
  viewToggle: { display: 'flex', gap: '20px', padding: '0 40px', background: 'var(--panel-bg)', borderBottom: '1px solid var(--border-color)' },
  toggleBtn: { padding: '12px 0', fontSize: '0.65rem', fontWeight: '800', cursor: 'pointer', border: 'none', background: 'transparent', color: 'var(--text-secondary)', letterSpacing: '1px' }
};

export default App;
