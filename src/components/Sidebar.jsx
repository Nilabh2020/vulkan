import React, { useState } from 'react';
import { Play, Plus, StopCircle, RefreshCw } from 'lucide-react';

const Sidebar = ({ onSpawnAgent, onReset }) => {
  const [prompt, setPrompt] = useState('');

  return (
    <div style={styles.container} className="panel">
      <div style={styles.section}>
        <h3 style={styles.title} className="text-glow">ROOT_TERMINAL</h3>
        <textarea 
          placeholder="Execute system command... (e.g. deploy 5 instances)"
          style={styles.textarea}
          className="text-mono"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>

      <div style={styles.buttonGroup}>
        <button 
          style={styles.primaryBtn}
          onClick={() => {
            onSpawnAgent('VULKAN_ROOT', prompt, 'root');
            setPrompt('');
          }}
        >
          <Play size={14} /> EXEC_BATCH
        </button>
        <button 
          style={styles.secondaryBtn}
          onClick={() => onSpawnAgent('Sub Agent ' + Math.floor(Math.random() * 100), 'Processing recursive child task...', 'sub')}
        >
          <Plus size={14} /> SPAWN SUB-AGENT
        </button>
      </div>

      <div style={styles.section}>
        <div style={styles.toggles}>
          <div style={styles.toggleItem}>
            <span>Adaptive context</span>
            <input type="checkbox" defaultChecked />
          </div>
          <div style={styles.toggleItem}>
            <span>Recursive depth control</span>
            <input type="checkbox" />
          </div>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sliderHeader}>
          <span>Abstraction Layer</span>
          <span>L3</span>
        </div>
        <input type="range" min="1" max="5" defaultValue="3" style={styles.slider} />
      </div>

      <div style={{marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px'}}>
        <button style={styles.controlBtn}>
          <StopCircle size={14} /> TERMINATE ALL
        </button>
        <button style={styles.controlBtn} onClick={onReset}>
          <RefreshCw size={14} /> PURGE GRAPH
        </button>
      </div>
    </div>
  );
};

const styles = {
  container: {
    width: '300px',
    height: 'calc(100vh - 104px)',
    margin: '0 0 12px 12px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    zIndex: 10,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  title: {
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
    letterSpacing: '1px',
    fontWeight: '600',
  },
  textarea: {
    height: '140px',
    width: '100%',
    resize: 'none',
    fontSize: '0.8rem',
    background: 'var(--bg-color)',
    padding: '12px',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm)',
    lineHeight: '1.5',
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  primaryBtn: {
    padding: '12px',
    background: 'var(--text-primary)',
    color: 'var(--bg-color)',
    fontSize: '0.75rem',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    letterSpacing: '0.5px',
  },
  secondaryBtn: {
    padding: '12px',
    background: 'var(--panel-bg)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontSize: '0.75rem',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
  },
  toggles: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  toggleItem: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
  },
  sliderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
    marginBottom: '4px',
    color: 'var(--text-secondary)',
  },
  slider: {
    width: '100%',
    accentColor: 'var(--text-primary)',
  },
  controlBtn: {
    width: '100%',
    padding: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '0.7rem',
    fontWeight: '600',
    color: 'var(--text-muted)',
    border: '1px solid var(--border-color)',
  }
};

export default Sidebar;
