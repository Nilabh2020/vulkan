import React from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  Panel
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes } from './AgentNode';

const FlowGraph = ({ nodes, edges, onNodesChange, onEdgesChange, onConnect }) => {
  return (
    <div style={{ flex: 1, position: 'relative', height: '100%', margin: '0 12px 12px 12px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
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
