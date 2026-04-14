import React, { useCallback } from 'react';
import { ReactFlow, Background, Controls, Panel } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Search, Play, MessageSquare, ShieldCheck } from 'lucide-react';
import { nodeTypes } from './AgentNode';

const NODES = [
  { name: 'Chat Input', desc: 'Manual prompt entry point', role: 'User Proxy', goal: 'Provide starting context', type: 'chat' },
  { name: 'Supervisor', desc: 'Verify and audit swarm output', role: 'Quality Controller', goal: 'Verify accuracy and logic', type: 'supervisor' },
  { name: 'Research Agent', desc: 'Performs web research', role: 'Researcher', goal: 'Find deep technical info', type: 'agent' },
  { name: 'QA Agent', desc: 'Validates code and output', role: 'QA Engineer', goal: 'Find bugs and edge cases', type: 'agent' },
  { name: 'Writer Agent', desc: 'Generates documentation', role: 'Technical Writer', goal: 'Explain complex concepts', type: 'agent' },
  { name: 'Coder Agent', desc: 'Writes production code', role: 'Lead Developer', goal: 'Implement features in React/Node', type: 'agent' },
  { name: 'Summarizer', desc: 'Condenses information', role: 'Editor', goal: 'Summarize the provided text', type: 'agent' },
  { name: 'Analyst', desc: 'Data analysis', role: 'Data Analyst', goal: 'Extract insights from data', type: 'agent' },
  { name: 'Translator', desc: 'Language translation', role: 'Linguist', goal: 'Translate to multiple languages', type: 'agent' },
  { name: 'Security Auditor', desc: 'Scans for vulnerabilities', role: 'SecOps', goal: 'Audit the code for security', type: 'agent' },
  { name: 'UI/UX Designer', desc: 'Drafts interfaces', role: 'Designer', goal: 'Create modern UI components', type: 'agent' },
  { name: 'DevOps Engineer', desc: 'Manages deployments', role: 'DevOps', goal: 'Configure CI/CD pipelines', type: 'agent' },
  ...Array.from({ length: 90 }, (_, i) => ({ 
    name: `Utility ${i+11}`, 
    desc: 'Generic task worker',
    role: 'Assistant',
    goal: 'Complete assigned tasks',
    type: 'agent'
  }))
];

const WorkflowBuilder = ({ nodes, edges, onNodesChange, onEdgesChange, onConnect, setNodes, onRun, onChange }) => {
  const onDragStart = (event, nodeType, nodeData) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify({ nodeType, ...nodeData }));
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const reactFlowWrapper = event.target.closest('.react-flow');
      if (!reactFlowWrapper) return;

      const data = JSON.parse(event.dataTransfer.getData('application/reactflow'));
      const reactFlowBounds = reactFlowWrapper.getBoundingClientRect();
      const position = { 
        x: event.clientX - reactFlowBounds.left, 
        y: event.clientY - reactFlowBounds.top 
      };
      
      const newNode = {
        id: `${data.name}-${Date.now()}`,
        type: 'agent',
        position,
        data: { 
          label: data.name, 
          status: 'DRAFT', 
          isDraft: true,
          role: data.role || '',
          goal: data.goal || '',
          type: data.type || 'agent',
          onChange: onChange // Use the handler passed from App.jsx
        },
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes, onChange]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }} onDrop={onDrop} onDragOver={onDragOver}>
      <div style={{ flex: 1, position: 'relative' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          proOptions={{ hideAttribution: true }}
          fitView
        >
          <Background color="transparent" size={0} />
          <Controls style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)' }} />
          <Panel position="bottom-center">
             <button 
               onClick={onRun}
               style={{
                 background: 'var(--text-primary)',
                 color: 'var(--bg-color)',
                 padding: '12px 24px',
                 borderRadius: 'var(--radius-md)',
                 fontWeight: '800',
                 fontSize: '0.8rem',
                 display: 'flex',
                 alignItems: 'center',
                 gap: '10px',
                 boxShadow: '0 0 20px rgba(255,255,255,0.1)',
                 cursor: 'pointer'
               }}
             >
               <Play size={16} fill="currentColor" /> RUN_WORKFLOW_SEQUENCE
             </button>
          </Panel>
        </ReactFlow>
      </div>

      <div style={{ width: '300px', borderLeft: '1px solid var(--border-color)', background: 'var(--panel-bg)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
          <input placeholder="Search 100+ nodes..." style={{ width: '100%', paddingLeft: '35px', background: 'var(--bg-color)' }} />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1 }}>
          {NODES.map((n, i) => (
            <div 
              key={i} 
              className="panel" 
              draggable 
              onDragStart={(event) => onDragStart(event, 'agent', n)}
              style={{ padding: '12px', cursor: 'grab', background: 'var(--surface-active)', border: '1px solid var(--border-color)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {n.type === 'chat' && <MessageSquare size={12} color="#4fc3ff" />}
                {n.type === 'supervisor' && <ShieldCheck size={12} color="#a78bfa" />}
                <strong style={{ fontSize: '0.8rem' }}>{n.name}</strong>
              </div>
              <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{n.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WorkflowBuilder;
