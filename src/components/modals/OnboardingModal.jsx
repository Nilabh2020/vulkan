import React from 'react';
import { X, Sparkles } from 'lucide-react';

const OnboardingModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal} className="panel">
        <button style={styles.close} onClick={onClose}><X size={18} /></button>
        <div style={styles.header}>
          <Sparkles size={32} style={{ color: 'var(--text-primary)', marginBottom: '16px' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', letterSpacing: '0.5px' }}>SYSTEM INITIALIZED</h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', lineHeight: '1.6', fontSize: '0.875rem' }}>
          Welcome to the Vulkan Command Center. <br />
          Configure your AI providers to begin autonomous operations.
        </p>
        <button 
          style={styles.btn} 
          onClick={onClose}
        >
          ENTER TERMINAL
        </button>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    backdropFilter: 'blur(2px)',
  },
  modal: {
    width: '400px',
    padding: '40px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
    animation: 'modalFadeIn 0.2s ease-out',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '8px',
  },
  close: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    color: 'var(--text-muted)',
  },
  btn: {
    marginTop: '32px',
    padding: '12px 24px',
    background: 'var(--text-primary)',
    color: 'var(--bg-color)',
    fontWeight: '700',
    fontSize: '0.75rem',
    letterSpacing: '1px',
    width: '100%',
  }
};

export default OnboardingModal;
