import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Mic } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const ChatView = ({ messages, onSendMessage, activeProvider }) => {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input);
    setInput('');
  };

  const handleListen = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in your browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => prev + (prev ? ' ' : '') + transcript);
      setIsListening(false);
    };
    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);

    recognition.start();
  };

  // ── Derive role tag from message metadata ──
  const getRoleTag = (m) => {
    if (m.role === 'user') return 'COMMAND';
    if (m.meta?.type === 'agent_response') return `AGENT: ${m.meta.agentName}`;
    if (m.meta?.type === 'agent_message') return `${m.meta.from} → ${m.meta.to}`;
    if (m.meta?.type === 'agent_completed') return `✓ ${m.meta.agentName}`;
    if (m.meta?.type === 'agent_error') return `✗ ${m.meta.agentName}`;
    if (m.meta?.type === 'system_warning') return 'SYSTEM';
    if (m.meta?.type === 'system_error') return 'ERROR';
    if (m.content?.includes('(')) return 'SYSTEM_CORE';
    return 'ROOT_AGENT';
  };

  // ── Accent color for the left bar ──
  const getAccentColor = (m) => {
    if (m.role === 'user') return 'var(--text-primary)';
    if (m.meta?.type === 'agent_response') return '#60a5fa';
    if (m.meta?.type === 'agent_message') return '#fbbf24';
    if (m.meta?.type === 'agent_completed') return '#4ade80';
    if (m.meta?.type === 'agent_error') return '#f87171';
    if (m.meta?.type === 'system_warning') return '#f87171';
    if (m.meta?.type === 'system_error') return '#f87171';
    return 'var(--border-color)';
  };

  // ── Round badge for agent msgs ──
  const getRoundBadge = (m) => {
    if (m.meta?.round) return `R${m.meta.round}`;
    return null;
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Bot size={16} className="text-glow" />
          <span style={styles.headerText}>ACTIVE SESSION: {activeProvider?.toUpperCase()}</span>
        </div>
      </div>

      <div style={styles.messageList} ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} style={{
            ...styles.messageWrapper,
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start'
          }}>
            <div style={{
              ...styles.message,
              background: m.role === 'user' ? 'var(--surface-active)' : 'var(--panel-bg)',
              border: m.role === 'user' ? '1px solid var(--text-muted)' : '1px solid var(--border-color)',
            }}>
              {/* Left accent bar */}
              <div style={{
                position: 'absolute',
                left: 0, top: 0, bottom: 0,
                width: '3px',
                borderRadius: '4px 0 0 4px',
                background: getAccentColor(m),
                opacity: 0.8,
              }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={styles.roleTag}>{getRoleTag(m)}</div>
                {getRoundBadge(m) && (
                  <span style={styles.roundBadge}>{getRoundBadge(m)}</span>
                )}
              </div>
              <div className="text-mono markdown-body" style={styles.content}>
                {window.marked ? (
                  <div dangerouslySetInnerHTML={{ __html: window.marked.parse(m.content) }} />
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.inputArea}>
        <div style={styles.inputWrapper}>
          <button 
            style={{...styles.micBtn, color: isListening ? '#f87171' : 'var(--text-secondary)'}} 
            onClick={handleListen}
            title="Speech to Text"
          >
            <Mic size={14} className={isListening ? 'pulse' : ''} />
          </button>
          <input 
            style={styles.input}
            className="text-mono"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Transmit command to swarm..."
          />
          <button style={styles.sendBtn} onClick={handleSend}>
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'rgba(0,0,0,0.2)',
    margin: '0 12px 12px 0',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm)',
    overflow: 'hidden',
  },
  header: {
    padding: '12px 20px',
    borderBottom: '1px solid var(--border-color)',
    background: 'var(--panel-bg)',
  },
  headerText: {
    fontSize: '0.7rem',
    fontWeight: '700',
    letterSpacing: '1px',
    color: 'var(--text-secondary)',
  },
  messageList: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  messageWrapper: {
    display: 'flex',
    width: '100%',
  },
  message: {
    maxWidth: '85%',
    padding: '12px 16px 12px 20px',
    borderRadius: 'var(--radius-sm)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    position: 'relative',
    overflow: 'hidden',
  },
  roleTag: {
    fontSize: '0.6rem',
    fontWeight: '800',
    color: 'var(--text-muted)',
    letterSpacing: '0.5px',
  },
  roundBadge: {
    fontSize: '0.55rem',
    fontWeight: '700',
    color: 'var(--text-muted)',
    background: 'var(--surface-hover)',
    padding: '1px 6px',
    borderRadius: '2px',
    letterSpacing: '0.5px',
  },
  content: {
    fontSize: '0.85rem',
    color: 'var(--text-primary)',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
  },
  inputArea: {
    padding: '20px',
    background: 'var(--panel-bg)',
    borderTop: '1px solid var(--border-color)',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  micBtn: {
    position: 'absolute',
    left: '12px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    transition: 'color 0.2s',
  },
  input: {
    width: '100%',
    padding: '12px 45px 12px 40px',
    background: 'var(--bg-color)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    borderRadius: 'var(--radius-sm)',
  },
  sendBtn: {
    position: 'absolute',
    right: '12px',
    color: 'var(--text-primary)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  }
};

export default ChatView;
