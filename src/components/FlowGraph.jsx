import React from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  Panel,
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Bot, Cpu } from 'lucide-react';

const STATUS_COLORS = {
  ACTIVE: '#4ade80',
  THINKING: '#60a5fa',
  COMPLETED: '#a78bfa',
  ERROR: '#f87171',
  TERMINATED: '#71717a',
};

const AgentNode = ({ data }) => {
  const isRoot = data.type === 'root';
  const Icon = isRoot ? Bot : Cpu;
  const statusColor = STATUS_COLORS[data.status] || '#71717a';

  return (
    <div style={{
      background: 'var(--panel-bg)',
      color: 'var(--text-primary)',
      border: `1px solid ${data.status === 'THINKING' ? statusColor + '66' : 'var(--border-color)'}`,
      borderRadius: 'var(--radius-sm)',
      padding: '0',
      fontSize: '11px',
      width: 190,
      overflow: 'hidden',
    }}>
      {/* Status indicator bar at top */}
      <div style={{
        height: '2px',
        background: statusColor,
        opacity: 0.9,
        animation: data.status === 'THINKING' ? 'agentPulse 1.5s ease-in-out infinite' : 'none',
      }} />
      <Handle type="target" position={Position.Top} style={{ background: '#333' }} />
      <div style={{
        background: 'var(--surface-hover)',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderBottom: '1px solid var(--border-color)'
      }}>
        <Icon size={12} color={isRoot ? '#fff' : '#a1a1aa'} />
        <span style={{ fontWeight: '600', letterSpacing: '0.5px', flex: 1 }}>{data.label}</span>
        {/* Status dot */}
        <div style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: statusColor,
          boxShadow: `0 0 6px ${statusColor}`,
          animation: data.status === 'THINKING' ? 'agentPulse 1.5s ease-in-out infinite' : 'none',
        }} />
      </div>
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {data.context && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Context</span>
            <div className="text-mono" style={{ color: 'var(--text-secondary)', fontSize: '9px', lineHeight: '1.4' }}>
              {data.context}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
          <span style={{ color: statusColor, fontSize: '8px', fontWeight: '600' }}>
            {data.status || 'ACTIVE'}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '8px' }}>L{data.depth || 0}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#333' }} />
    </div>
  );
};

const nodeTypes = {
  agent: AgentNode,
};

const FlowGraph = ({ nodes, edges, onNodesChange, onEdgesChange }) => {
  return (
    <div style={{ flex: 1, position: 'relative', height: '100%', margin: '0 12px 12px 12px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background color="transparent" size={0} />
        <Controls showInteractive={false} />
        <Panel position="top-right" className="panel" style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: '500' }}>
          NODES_ACTIVE: {nodes.length}
        </Panel>
      </ReactFlow>
      
      <style>{`
        .react-flow__node {
          cursor: grab;
          box-shadow: 0 0 15px rgba(255, 255, 255, 0.03);
        }
        .react-flow__handle {
          width: 4px;
          height: 4px;
          background: #444;
          border: none;
        }
        .react-flow__controls-button {
          background: var(--panel-bg);
          fill: var(--text-primary);
          border-bottom: 1px solid var(--border-color);
        }
        .react-flow__edge-path {
          stroke: #ffffff !important;
          stroke-width: 1;
          stroke-dasharray: 4 8;
          opacity: 0.3;
          filter: drop-shadow(0 0 2px rgba(255,255,255,0.2));
        }
        .react-flow__edge.animated path {
          stroke-dasharray: 4 8;
          animation: dashdraw 2s linear infinite;
        }
        @keyframes dashdraw {
          from { stroke-dashoffset: 24; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes agentPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default FlowGraph;
