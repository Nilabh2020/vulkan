import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Bot, Cpu, MessageSquare, ShieldCheck } from 'lucide-react';

const STATUS_COLORS = {
  ACTIVE: '#4ade80',
  THINKING: '#60a5fa',
  COMPLETED: '#a78bfa',
  ERROR: '#f87171',
  TERMINATED: '#71717a',
};

export const AgentNode = ({ data, id, isConnectable }) => {
  const isRoot = data.type === 'root';
  const isChat = data.type === 'chat';
  const isSupervisor = data.type === 'supervisor';
  
  const getIcon = () => {
    if (isChat) return <MessageSquare size={12} color="#4fc3ff" />;
    if (isSupervisor) return <ShieldCheck size={12} color="#a78bfa" />;
    if (isRoot) return <Bot size={12} color="#fff" />;
    return <Cpu size={12} color="#a1a1aa" />;
  };

  const statusColor = STATUS_COLORS[data.status] || '#71717a';
  
  const getBorder = () => {
    if (data.status === 'COMPLETED') return `2px solid ${STATUS_COLORS.COMPLETED}`;
    if (data.status === 'THINKING') return `2px solid ${STATUS_COLORS.THINKING}`;
    if (data.status === 'ERROR') return `2px solid ${STATUS_COLORS.ERROR}`;
    if (isSupervisor) return `1px solid #a78bfa66`;
    return '1px solid var(--border-color)';
  };

  return (
    <div style={{
      background: 'var(--panel-bg)',
      color: 'var(--text-primary)',
      border: getBorder(),
      borderRadius: 'var(--radius-sm)',
      padding: '0',
      fontSize: '11px',
      width: 220,
      overflow: 'hidden',
      boxShadow: isSupervisor ? '0 0 15px rgba(167, 139, 250, 0.1)' : 'none'
    }}>
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} style={{ background: '#333' }} />
      <div style={{ padding: '8px 12px', background: 'var(--surface-hover)', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-color)' }}>
        {getIcon()}
        {data.isDraft ? (
           <input 
             defaultValue={data.label} 
             placeholder="Node Name"
             onChange={(e) => data.onChange?.(id, 'label', e.target.value)} 
             style={{background:'transparent', border:'none', color:'white', width:'100%', fontSize: '11px'}} 
           />
        ) : (
           <span style={{ fontWeight: '600', flex: 1 }}>{data.label}</span>
        )}
      </div>
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
         {data.isDraft ? (
           <>
            <input 
              placeholder="Role (e.g. Supervisor)" 
              defaultValue={data.role} 
              onChange={(e) => data.onChange?.(id, 'role', e.target.value)} 
              style={{background:'black', border:'1px solid #333', color:'white', padding: '6px', fontSize: '10px'}}
            />
            <textarea 
              placeholder={isChat ? "Enter starting prompt..." : (isSupervisor ? "Validation Criteria..." : "Goal / Objective")} 
              defaultValue={data.goal} 
              onChange={(e) => data.onChange?.(id, 'goal', e.target.value)} 
              style={{background:'black', border:'1px solid #333', color:'white', padding: '6px', fontSize: '10px', minHeight: '60px', resize: 'vertical'}}
            />
           </>
         ) : (
           <div className="text-mono" style={{ color: 'var(--text-secondary)', fontSize: '9px', whiteSpace: 'pre-wrap' }}>
             {data.output || data.goal}
           </div>
         )}
         <div style={{ marginTop: '4px', fontSize: '8px', fontWeight: '800', color: statusColor, display: 'flex', justifyContent: 'space-between' }}>
           <span>{data.status || 'DRAFT'}</span>
           {data.outputCount !== undefined && <span>LOGS: {data.outputCount}</span>}
         </div>
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} style={{ background: '#333' }} />
    </div>
  );
};

export const nodeTypes = {
  agent: AgentNode,
};
