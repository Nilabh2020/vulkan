import React, { useState } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  Panel,
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Bot, Cpu, ChevronDown, ChevronUp } from 'lucide-react';

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
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: 'var(--panel-bg)',
      color: 'var(--text-primary)',
      border: `1px solid ${data.status === 'THINKING' ? statusColor + '66' : 'var(--border-color)'}`,
      borderRadius: 'var(--radius-sm)',
      padding: '0',
      fontSize: '11px',
      width: 220,
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
              {data.context.length > 60 ? data.context.substring(0, 60) + '...' : data.context}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
          <span style={{ color: statusColor, fontSize: '8px', fontWeight: '600' }}>
            {data.status || 'ACTIVE'}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '8px' }}>L{data.depth || 0}</span>
        </div>
        
        {data.rounds !== undefined && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            marginTop: '4px',
            borderTop: '1px dashed var(--border-color)',
            paddingTop: '8px'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '7px', textTransform: 'uppercase' }}>Rounds</span>
              <span style={{ color: 'var(--text-primary)', fontSize: '9px', fontWeight: '600' }} className="text-mono">{data.rounds}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '7px', textTransform: 'uppercase' }}>Context Size</span>
              <span style={{ color: 'var(--text-primary)', fontSize: '9px', fontWeight: '600' }} className="text-mono">
                {data.contextLen > 1024 ? (data.contextLen / 1024).toFixed(1) + ' KB' : (data.contextLen || 0) + ' B'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Expandable Debug/Info Section */}
      <div style={{ borderTop: '1px solid var(--border-color)' }}>
        <div 
          onClick={() => setExpanded(!expanded)}
          style={{
            padding: '6px 12px',
            background: 'rgba(0,0,0,0.1)',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '9px',
            color: 'var(--text-muted)'
          }}
        >
          <span>DEBUG INFO</span>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </div>
        {expanded && (
          <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.2)', fontSize: '9px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '7px', textTransform: 'uppercase' }}>Last Action</span>
              <span style={{ color: 'var(--text-secondary)' }} className="text-mono">
                {data.lastAction || 'Waiting for instructions...'}
              </span>
            </div>
            {data.error && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                <span style={{ color: STATUS_COLORS.ERROR, fontSize: '7px', textTransform: 'uppercase' }}>Error Details</span>
                <span style={{ color: '#fca5a5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} className="text-mono">
                  {data.error}
                </span>
              </div>
            )}
          </div>
        )}
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
