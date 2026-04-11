import React, { useState, useEffect } from 'react';
import { X, Trash2, Plus, Terminal } from 'lucide-react';

const SSHModal = ({ isOpen, onClose }) => {
  const [profiles, setProfiles] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newProfile, setNewProfile] = useState({
    name: '',
    host: '',
    port: '22',
    username: '',
    authType: 'password',
    credential: ''
  });

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('vulkan_ssh_profiles') || '[]');
    setProfiles(saved);
  }, [isOpen]);

  const handleSave = () => {
    const updated = [...profiles, { ...newProfile, id: Date.now() }];
    localStorage.setItem('vulkan_ssh_profiles', JSON.stringify(updated));
    setProfiles(updated);
    setShowAdd(false);
    setNewProfile({ name: '', host: '', port: '22', username: '', authType: 'password', credential: '' });
  };

  const deleteProfile = (id) => {
    const updated = profiles.filter(p => p.id !== id);
    localStorage.setItem('vulkan_ssh_profiles', JSON.stringify(updated));
    setProfiles(updated);
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal} className="panel">
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Terminal size={16} />
            <h3 style={{ fontSize: '0.875rem', fontWeight: '600' }}>SSH PROFILE MANAGER</h3>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        
        <div style={styles.content}>
          {!showAdd ? (
            <div style={styles.listView}>
              <div style={styles.listHeader}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: '600' }}>ACTIVE NODES ({profiles.length})</span>
                <button style={styles.addBtnSmall} onClick={() => setShowAdd(true)}>
                  <Plus size={12} /> NEW PROFILE
                </button>
              </div>
              
              <div style={styles.profileList}>
                {profiles.length === 0 ? (
                  <div style={styles.emptyState}>No SSH profiles found.</div>
                ) : (
                  profiles.map(p => (
                    <div key={p.id} style={styles.profileCard}>
                      <div style={styles.cardInfo}>
                        <div style={{ fontWeight: '600', fontSize: '0.8rem' }}>{p.name || p.host}</div>
                        <div className="text-mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.username}@{p.host}</div>
                      </div>
                      <button onClick={() => deleteProfile(p.id)} style={styles.deleteBtn}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div style={styles.form}>
              <div style={styles.field}>
                <label style={styles.label}>Label</label>
                <input 
                  style={styles.input}
                  value={newProfile.name} 
                  onChange={(e) => setNewProfile({...newProfile, name: e.target.value})} 
                  placeholder="Primary Node"
                />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{...styles.field, flex: 3}}>
                  <label style={styles.label}>Host</label>
                  <input 
                    style={styles.input}
                    className="text-mono"
                    value={newProfile.host} 
                    onChange={(e) => setNewProfile({...newProfile, host: e.target.value})} 
                    placeholder="0.0.0.0"
                  />
                </div>
                <div style={{...styles.field, flex: 1}}>
                  <label style={styles.label}>Port</label>
                  <input 
                    style={styles.input}
                    className="text-mono"
                    value={newProfile.port} 
                    onChange={(e) => setNewProfile({...newProfile, port: e.target.value})} 
                  />
                </div>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>User</label>
                <input 
                  style={styles.input}
                  className="text-mono"
                  value={newProfile.username} 
                  onChange={(e) => setNewProfile({...newProfile, username: e.target.value})} 
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Credentials</label>
                <textarea 
                  style={styles.textarea}
                  className="text-mono"
                  value={newProfile.credential}
                  onChange={(e) => setNewProfile({...newProfile, credential: e.target.value})}
                  placeholder="Password or RSA Private Key..."
                />
              </div>
              <div style={styles.formActions}>
                <button style={styles.cancelBtn} onClick={() => setShowAdd(false)}>CANCEL</button>
                <button style={styles.saveBtn} onClick={handleSave}>CREATE PROFILE</button>
              </div>
            </div>
          )}
        </div>
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
    zIndex: 101,
    backdropFilter: 'blur(2px)',
  },
  modal: {
    width: '460px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--border-color)',
  },
  content: {
    padding: '24px',
    overflowY: 'auto',
  },
  listView: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  listHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addBtnSmall: {
    background: 'var(--bg-color)',
    border: '1px solid var(--border-color)',
    padding: '6px 12px',
    fontSize: '0.7rem',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  profileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  profileCard: {
    background: 'var(--bg-color)',
    border: '1px solid var(--border-color)',
    padding: '12px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  deleteBtn: {
    color: 'var(--text-muted)',
    padding: '8px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '32px',
    color: 'var(--text-muted)',
    fontSize: '0.8rem',
    border: '1px dashed var(--border-color)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '0.65rem',
    fontWeight: '700',
    color: 'var(--text-muted)',
    letterSpacing: '0.5px',
  },
  input: {
    width: '100%',
  },
  textarea: {
    minHeight: '80px',
    fontSize: '0.75rem',
  },
  formActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
  },
  cancelBtn: {
    flex: 1,
    padding: '12px',
    border: '1px solid var(--border-color)',
    fontSize: '0.75rem',
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    padding: '12px',
    background: 'var(--text-primary)',
    color: 'var(--bg-color)',
    fontWeight: '700',
    fontSize: '0.75rem',
  }
};

export default SSHModal;
