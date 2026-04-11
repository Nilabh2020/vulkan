import React, { useState, useEffect, useCallback } from 'react';
import { X, Check, Activity, AlertCircle, Loader2, RefreshCcw } from 'lucide-react';

const ProviderModal = ({ isOpen, onClose, providerName }) => {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState('idle');
  const [errorDetail, setErrorDetail] = useState('');

  const normalizedProvider = providerName?.toLowerCase().replace(/\s/g, '') || '';
  const isLocalProvider = normalizedProvider === 'lmstudio' || normalizedProvider === 'ollama';

  // Load saved config
  useEffect(() => {
    if (isOpen && providerName) {
      const saved = JSON.parse(localStorage.getItem(`vulkan_provider_${providerName}`) || '{}');
      setApiKey(saved.apiKey || '');
      
      const defaultUrl = normalizedProvider === 'lmstudio' ? 'http://127.0.0.1:1234' : 'http://127.0.0.1:11434';
      setBaseUrl(saved.baseUrl || defaultUrl);
      
      setModel(saved.model || '');
      setModels([]);
      setStatus('idle');
      setErrorDetail('');
    }
  }, [providerName, isOpen, normalizedProvider]);

  const validateAndFetch = useCallback(async () => {
    if (!baseUrl || !baseUrl.startsWith('http')) return;
    
    setStatus('loading');
    setErrorDetail('');
    
    // Hardcode to 127.0.0.1 to avoid resolution issues
    const backendUrl = `http://127.0.0.1:3001/api/models`;
    
    try {
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          provider: normalizedProvider, 
          baseUrl: baseUrl,
          apiKey: apiKey
        })
      });
      
      const data = await response.json();

      if (response.ok && data.models) {
        setModels(data.models);
        setStatus('success');
        if (data.models.length > 0 && !model) {
          setModel(data.models[0]);
        }
      } else {
        throw new Error(data.details || data.error || 'Failed to fetch models');
      }
    } catch (err) {
      setStatus('error');
      setErrorDetail(err.message);
      setModels([]);
    }
  }, [baseUrl, apiKey, normalizedProvider, model]);

  // Auto-fetch models when URL changes
  useEffect(() => {
    const timer = setTimeout(() => {
      validateAndFetch();
    }, 1000);
    return () => clearTimeout(timer);
  }, [baseUrl, apiKey, validateAndFetch]);

  const handleSave = () => {
    localStorage.setItem(`vulkan_provider_${providerName}`, JSON.stringify({ apiKey, baseUrl, model }));
    localStorage.setItem('vulkan_active_provider', providerName);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal} className="panel">
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity size={16} className="text-glow" />
            <h3 style={{ fontSize: '0.875rem', fontWeight: '600' }}>{providerName.toUpperCase()} GATEWAY</h3>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        
        <div style={styles.body}>
          <div style={styles.field}>
            <label style={styles.label}>{isLocalProvider ? 'Server Endpoint' : 'Provider URL'}</label>
            <div style={{ position: 'relative' }}>
              <input 
                type="text" 
                value={baseUrl} 
                className="text-mono"
                style={{ width: '100%', paddingRight: '35px' }}
                onChange={(e) => setBaseUrl(e.target.value)} 
                placeholder="http://127.0.0.1:1234"
              />
              <div style={styles.statusIndicator}>
                {status === 'loading' && <Loader2 size={14} className="spinning" />}
                {status === 'success' && <Check size={14} style={{ color: '#4ade80' }} />}
                {status === 'error' && <AlertCircle size={14} style={{ color: '#f87171' }} />}
              </div>
            </div>
          </div>

          {!isLocalProvider && (
            <div style={styles.field}>
              <label style={styles.label}>Access Key</label>
              <input 
                type="password" 
                value={apiKey} 
                className="text-mono"
                onChange={(e) => setApiKey(e.target.value)} 
                placeholder="••••••••••••••••"
              />
            </div>
          )}

          <div style={styles.field}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={styles.label}>Available Models {models.length > 0 && `(${models.length})`}</label>
              {status === 'error' && (
                <button onClick={validateAndFetch} style={styles.retryBtn}>
                  <RefreshCcw size={10} /> RETRY
                </button>
              )}
            </div>
            
            <div style={styles.modelList}>
              {status === 'loading' && <div style={styles.emptyMsg}>Interrogating endpoint...</div>}
              {status === 'error' && (
                <div style={{...styles.emptyMsg, color: '#f87171'}}>
                  Connection failed. <br />
                  <span style={{ fontSize: '10px', opacity: 0.8 }}>{errorDetail}</span>
                </div>
              )}
              {status === 'success' && models.length === 0 && <div style={styles.emptyMsg}>No models found on server.</div>}
              {status === 'idle' && !baseUrl && <div style={styles.emptyMsg}>Enter endpoint to discover models.</div>}
              
              {models.map(m => (
                <button 
                  key={m} 
                  onClick={() => setModel(m)}
                  style={{
                    ...styles.modelItem,
                    borderColor: model === m ? 'var(--text-primary)' : 'var(--border-color)',
                    background: model === m ? 'var(--surface-active)' : 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <span className="text-mono" style={{ fontSize: '0.75rem' }}>{m}</span>
                    {model === m && <Check size={12} />}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button 
            style={{...styles.saveBtn, opacity: model ? 1 : 0.5}} 
            onClick={handleSave}
            disabled={!model}
          >
            CONFIRM & INITIALIZE
          </button>
        </div>
      </div>
      <style>{`
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, width: '100vw', height: '100vh',
    background: 'rgba(0,0,0,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 101, backdropFilter: 'blur(4px)',
  },
  modal: {
    width: '440px', padding: '24px',
    position: 'relative', animation: 'modalFadeIn 0.15s ease-out',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  body: { display: 'flex', flexDirection: 'column', gap: '20px' },
  field: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '0.65rem', fontWeight: '700', color: 'var(--text-muted)', letterSpacing: '1px' },
  statusIndicator: { position: 'absolute', right: '12px', top: '10px', display: 'flex', alignItems: 'center' },
  modelList: {
    maxHeight: '180px', overflowY: 'auto',
    border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
    background: 'rgba(0,0,0,0.2)', padding: '4px',
  },
  modelItem: {
    width: '100%', padding: '10px 12px', textAlign: 'left',
    marginBottom: '4px', border: '1px solid transparent',
    borderRadius: '4px', color: 'var(--text-secondary)',
    transition: 'all 0.1s ease',
  },
  emptyMsg: { padding: '20px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' },
  saveBtn: {
    padding: '14px', background: 'var(--text-primary)', color: 'var(--bg-color)',
    fontWeight: '700', fontSize: '0.75rem', marginTop: '8px', letterSpacing: '1px',
  },
  retryBtn: {
    background: 'var(--surface-hover)',
    border: '1px solid var(--border-color)',
    padding: '2px 8px',
    fontSize: '0.6rem',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    borderRadius: '2px',
  }
};

export default ProviderModal;
