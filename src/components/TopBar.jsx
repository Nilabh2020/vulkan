import React from 'react';
import { 
  Terminal, Server, Globe, Cpu, Zap, MessageSquare, 
  Settings, Box
} from 'lucide-react';

const TopBar = ({ onOpenProvider, onOpenSSH }) => {
  const providers = [
    { name: 'Ollama', icon: <Box size={14} /> },
    { name: 'LM Studio', icon: <Cpu size={14} /> },
    { name: 'OpenRouter', icon: <Globe size={14} /> },
    { name: 'Claude', icon: <Zap size={14} /> },
    { name: 'Gemini', icon: <Zap size={14} /> },
    { name: 'ChatGPT', icon: <MessageSquare size={14} /> },
    { name: 'Nvidia', icon: <Zap size={14} /> },
  ];

  return (
    <div style={styles.container} className="panel">
      <div style={styles.logoGroup}>
        <Terminal size={18} className="text-glow" />
        <h1 style={styles.logoText} className="logoText">VULKAN</h1>
      </div>
      
      <div style={styles.providers}>
        {providers.map((p) => (
          <button 
            key={p.name} 
            style={styles.navItem}
            onClick={() => onOpenProvider(p.name)}
          >
            {p.icon}
            <span>{p.name}</span>
          </button>
        ))}
        <div style={styles.divider} />
        <button style={styles.navItem} onClick={onOpenSSH}>
          <Server size={14} />
          <span>SSH</span>
        </button>
        <button style={styles.navItem}>
          <Settings size={14} />
          <span>SETTINGS</span>
        </button>
      </div>
    </div>
  );
};

const styles = {
  container: {
    height: '52px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    margin: '12px',
    zIndex: 10,
    background: 'var(--panel-bg)',
  },
  logoGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logoText: {
    fontSize: '0.9rem',
    fontWeight: '600',
    letterSpacing: '2px',
    color: 'var(--text-primary)',
  },
  providers: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.75rem',
    fontWeight: '500',
    padding: '6px 10px',
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius-sm)',
  },
  divider: {
    width: '1px',
    height: '20px',
    background: 'var(--border-color)',
    margin: '0 8px',
  }
};

export default TopBar;
