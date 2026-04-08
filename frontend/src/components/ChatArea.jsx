import React, { useState, useEffect, useRef } from 'react';
import { Phone, Video, Info, Paperclip, Send, Smile, Image as ImageIcon, CheckCheck, LogOut, Settings, MoreVertical, X, Loader2, Mic, Search, Trash2, Pencil, Check } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import VoiceRecorder from './VoiceRecorder';
import AudioPlayer from './AudioPlayer';
import { socket } from '../socket';
import { useChat } from '../context/ChatContext';
import SettingsModal from './SettingsModal';
import ConfirmModal from './ConfirmModal';
import GroupMembersModal from './GroupMembersModal';
import './ChatArea.css';

const ChatArea = ({ currentUser, onLogout }) => {
  const { activeChatPartner, typingUsers, fetchRecentChats } = useChat();
  const [msgText, setMsgText] = useState('');
  const [messages, setMessages] = useState([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const menuRef = useRef(null);
  const searchInputRef = useRef(null);
  const emojiRef = useRef(null);

  const [activeChatId, setActiveChatId] = useState(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Close menu/emoji when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsHeaderMenuOpen(false);
      }
      if (emojiRef.current && !emojiRef.current.contains(event.target)) {
        setIsEmojiOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchMessages = async (chatId) => {
    try {
      const msgRes = await fetch(`http://localhost:5000/api/messages/${chatId}`);
      const historyData = await msgRes.json();
      setMessages(historyData);
      setPendingFile(null);
      setPreviewUrl(null);
    } catch (err) {
      console.error("Failed to fetch history", err);
    }
  };

  // 1. Establish Private Chat Room when activeChatPartner changes
  useEffect(() => {
    if (!currentUser?._id || !activeChatPartner?._id) return;

    const setupChatRoom = async () => {
      try {
        let chatId = null;

        if (activeChatPartner.isGroupChat) {
          // It's a group, we already have the chat object
          chatId = activeChatPartner._id;
        } else {
          // It's a private chat, we need to find or create it
          const res = await fetch('http://localhost:5000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              currentUserId: currentUser._id, 
              targetUserId: activeChatPartner._id 
            })
          });
          const chatData = await res.json();
          chatId = chatData._id;
        }
        
        setActiveChatId(chatId);

        // Mark Seen
        await fetch('http://localhost:5000/api/messages/mark-seen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, userId: currentUser._id }) 
        });
        
        // Notify the sender instantly that we've seen their messages by opening the chat
        socket.emit('mark_messages_seen', { chatId, userId: currentUser._id });
        
        fetchRecentChats();

        // Fetch History via standalone function
        await fetchMessages(chatId);

        socket.emit('join_chat', chatId);
      } catch (err) {
        console.error("Failed to setup chat room", err);
      }
    };

    setupChatRoom();
  }, [currentUser?._id, activeChatPartner, fetchRecentChats]);

  // 2. Real-time Listening
  useEffect(() => {
    if (!activeChatId) return;

    socket.on('receive_message', (newMsg) => {
      if (newMsg.chatId === activeChatId) {
        setMessages((prev) => [...prev, newMsg]);
        
        // Instant Read Receipt: If we receive a message in an open chat, immediately mark as seen
        if (newMsg.senderId !== currentUser._id) {
          socket.emit('mark_messages_seen', { chatId: activeChatId, userId: currentUser._id });
        }
      }
    });

    socket.on('messages_seen_by_user', ({ chatId, userId }) => {
      if (chatId === activeChatId) {
        // Update all our sent unread messages to 'seen' status in the UI
        setMessages(prev => prev.map(m => (m.senderId === currentUser._id && !m.seen) ? { ...m, seen: true, status: 'seen' } : m));
      }
    });

    socket.on('message_status_update', ({ chatId: updatedChatId, userId }) => {
      if (updatedChatId === activeChatId) {
        fetchMessages(activeChatId);
      }
    });

    // Special instant sync: when we change chat, ensure we mark seen
    if (activeChatId) {
      socket.emit('mark_messages_seen', { chatId: activeChatId, userId: currentUser._id });
    }

    socket.on('message_edited', ({ messageId, newText }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, text: newText, isEdited: true } : m));
    });

    socket.on('message_deleted', ({ messageId }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, text: "This message was deleted", isDeleted: true } : m));
    });

    return () => {
      socket.off('receive_message');
      socket.off('message_status_update');
      socket.off('message_edited');
      socket.off('message_deleted');
    };
  }, [activeChatId]);

  const handleSend = async () => {
    if ((!msgText.trim() && !pendingFile) || !activeChatPartner?._id) return;

    let fileUrl = null;
    let messageType = 'text';

    if (pendingFile) {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', pendingFile);

      try {
        const res = await fetch('http://localhost:5000/api/messages/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        fileUrl = data.fileUrl;
        messageType = pendingFile.type.startsWith('image/') ? 'image' : 'file';
      } catch (err) {
        console.error("Upload failed", err);
        setIsUploading(false);
        return;
      }
    }

    const msgData = {
      chatId: activeChatId?.toString(),
      senderId: currentUser._id?.toString(),
      receiverId: activeChatPartner._id?.toString(),
      text: msgText,
      messageType,
      fileUrl,
      originalName: (messageType === 'file' || messageType === 'image') ? pendingFile.name : null
    };

    socket.emit('send_message', msgData);
    setMsgText('');
    setPendingFile(null);
    setPreviewUrl(null);
    setIsUploading(false);
    handleStopTyping();
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPendingFile(file);
      if (file.type.startsWith('image/')) {
        setPreviewUrl(URL.createObjectURL(file));
      } else {
        setPreviewUrl(null); // No preview for docs
      }
    }
    // Reset input so the same file can be selected twice if needed
    e.target.value = '';
  };

  const handleStopTyping = () => {
    if (!activeChatId || !activeChatPartner) return;
    socket.emit('stopTyping', { 
      chatId: activeChatId?.toString(), 
      senderId: currentUser._id?.toString(), 
      receiverId: activeChatPartner._id?.toString() 
    });
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  };

  const handleTyping = (e) => {
    setMsgText(e.target.value);
    if (!activeChatId || !activeChatPartner) return;
    
    // Emit 'typing' on every keystroke as per debounced start/stop logic
    socket.emit('typing', { 
      chatId: activeChatId?.toString(), 
      senderId: currentUser._id?.toString(), 
      receiverId: activeChatPartner._id?.toString() 
    });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      handleStopTyping();
    }, 2000); // 2 second timeout as requested
  };

  const handleVoiceSend = (audioUrl, duration) => {
    if (!activeChatId) return;
    socket.emit('send_message', {
      chatId: activeChatId.toString(),
      senderId: currentUser._id.toString(),
      receiverId: activeChatPartner._id.toString(),
      messageType: 'audio',
      audioUrl: audioUrl,
      duration: duration
    });
    setIsVoiceOpen(false);
  };

  const handleSearch = async (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`http://localhost:5000/api/messages/search?chatId=${activeChatId}&query=${q}`);
      const data = await res.json();
      setSearchResults(data.map(m => m._id)); // store IDs of matches
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearChat = async () => {
    setIsClearModalOpen(true);
  };

  const initiateCall = (type) => {
    if (!activeChatPartner || activeChatPartner.isGroupChat) {
      alert("Calls are currently only supported for 1-on-1 chats.");
      return;
    }
    const event = new CustomEvent('initiate-call', {
      detail: {
        userToCall: activeChatPartner._id,
        type: type,
        name: activeChatPartner.username,
        profilePic: activeChatPartner.profilePic,
        chatId: activeChatId?.toString()
      }
    });
    window.dispatchEvent(event);
  };

  const handleEditStart = (msg) => {
    setEditingMessageId(msg.id);
    setEditValue(msg.text);
  };

  const handleEditSave = () => {
    if (!editValue.trim() || !activeChatId) return;
    socket.emit('edit_message', { messageId: editingMessageId, newText: editValue, chatId: activeChatId });
    setEditingMessageId(null);
    setEditValue('');
  };

  const handleRecordingStart = () => {
    if (!activeChatId) return;
    socket.emit('recordingStart', {
      chatId: activeChatId.toString(),
      senderId: currentUser._id.toString(),
      receiverId: activeChatPartner?.isGroupChat ? null : activeChatPartner?._id?.toString()
    });
  };

  const handleRecordingStop = () => {
    if (!activeChatId) return;
    socket.emit('recordingStop', {
      chatId: activeChatId.toString(),
      senderId: currentUser._id.toString(),
      receiverId: activeChatPartner?.isGroupChat ? null : activeChatPartner?._id?.toString()
    });
  };

  const handleDelete = (messageId) => {
    if (!activeChatId) return;
    if (window.confirm("Are you sure you want to delete this message?")) {
      socket.emit('delete_message', { messageId, chatId: activeChatId });
    }
  };

  const confirmClearChat = async () => {
    try {
      await fetch(`http://localhost:5000/api/messages/clear/${activeChatId}`, { method: 'DELETE' });
      setMessages([]);
      setIsHeaderMenuOpen(false);
    } catch (err) {
      console.error("Failed to clear chat", err);
    }
  };

  if (!activeChatPartner) {
    return (
      <main className="chat-area empty">
        {/* Animated background orbs */}
        <div className="empty-orb empty-orb-1"></div>
        <div className="empty-orb empty-orb-2"></div>
        <div className="empty-orb empty-orb-3"></div>

        <div className="empty-state-content">
          {/* Avatar with pulse ring */}
          <div className="empty-avatar-wrapper">
            <div className="empty-avatar-ring"></div>
            <img
              src={currentUser.profilePic || `https://i.pravatar.cc/150?u=${currentUser.username}`}
              alt={currentUser.username}
              className="empty-avatar"
            />
            <div className="empty-avatar-status"></div>
          </div>

          {/* Greeting */}
          <h1 className="empty-greeting">Hey, <span>{currentUser.username}</span> 👋</h1>
          <p className="empty-subtitle">
            Your conversations are waiting. Pick someone from the sidebar to get started.
          </p>

          {/* Feature highlight cards */}
          <div className="empty-feature-cards">
            <div className="feature-card">
              <span className="feature-icon">💬</span>
              <h4>Real-Time Chat</h4>
              <p>Instant messages with typing indicators</p>
            </div>
            <div className="feature-card">
              <span className="feature-icon">🎙️</span>
              <h4>Voice Messages</h4>
              <p>Record and send audio clips</p>
            </div>
            <div className="feature-card">
              <span className="feature-icon">👥</span>
              <h4>Group Chats</h4>
              <p>Create groups with the + button</p>
            </div>
            <div className="feature-card">
              <span className="feature-icon">😊</span>
              <h4>Emoji Reactions</h4>
              <p>Express yourself with the emoji picker</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const isOtherUserTyping = typingUsers[activeChatId];

  return (
    <main className="chat-area glass-panel">
      {/* Top Bar Navigation */}
      <header className="chat-header">
        <div className="chat-partner-info">
          <div className="avatar-container">
             <img src={activeChatPartner.profilePic || activeChatPartner.groupAvatar || `https://i.pravatar.cc/150?u=${activeChatPartner.username || activeChatPartner.groupName}`} alt="" className="avatar" />
            {activeChatPartner.status === 'Online' && <div className="online-indicator"></div>}
          </div>
          <div>
            <h2>{activeChatPartner.groupName || activeChatPartner.username}</h2>
            <span 
              className={`status-indicator ${activeChatPartner.isGroupChat ? 'clickable' : ''}`}
              onClick={() => activeChatPartner.isGroupChat && setIsMembersModalOpen(true)}
            >
              {activeChatPartner.isGroupChat ? `${activeChatPartner.users.length} members` : activeChatPartner.status || 'Online'}
            </span>
          </div>
        </div>

        {isSearchOpen && (
          <div className="header-search-bar animate-search">
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Search in chat..." 
              autoFocus
              ref={searchInputRef}
              value={searchQuery}
              onChange={handleSearch}
            />
            <button onClick={() => { setIsSearchOpen(false); setSearchQuery(''); setSearchResults([]); }}><X size={18} /></button>
          </div>
        )}

        <div className="chat-header-actions">
           {!isSearchOpen && <button className="action-btn" onClick={() => setIsSearchOpen(true)} title="Search Messages"><Search size={20} /></button>}
          <button className="action-btn" title="Voice Call" onClick={() => initiateCall('audio')}><Phone size={20} /></button>
          <button className="action-btn" title="Video Call" onClick={() => initiateCall('video')}><Video size={20} /></button>
          <div className="divider"></div>
          
          <div className="menu-container" ref={menuRef}>
            <button 
              className={`action-btn ${isHeaderMenuOpen ? 'active' : ''}`} 
              onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
              title="More Options"
            >
              <MoreVertical size={20} />
            </button>

            {isHeaderMenuOpen && (
              <div className="header-dropdown glass-panel">
                <button className="dropdown-item" onClick={() => { setIsHeaderMenuOpen(false); alert('ℹ️ User Info Coming Soon!'); }}>
                  <Info size={18} />
                  <span>Info</span>
                </button>
                <button className="dropdown-item" onClick={() => { setIsHeaderMenuOpen(false); setIsSettingsOpen(true); }}>
                  <Settings size={18} />
                  <span>Settings</span>
                </button>
                <button className="dropdown-item" onClick={handleClearChat}>
                  <Trash2 size={18} />
                  <span>Clear Chat</span>
                </button>
                <div className="dropdown-divider"></div>
                <button className="dropdown-item logout-item" onClick={() => { setIsHeaderMenuOpen(false); onLogout(); }}>
                  <LogOut size={18} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <ConfirmModal 
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        onConfirm={confirmClearChat}
        title="Clear Messages"
        message="Are you sure you want to clear all messages in this chat? This will empty the chat window but keep the conversation in your sidebar."
        confirmText="Clear Now"
      />

      <GroupMembersModal 
        isOpen={isMembersModalOpen}
        onClose={() => setIsMembersModalOpen(false)}
        members={activeChatPartner.isGroupChat ? activeChatPartner.users : []}
        groupName={activeChatPartner.groupName}
        chatId={activeChatId}
        currentUser={currentUser}
        adminId={activeChatPartner.groupAdmin?._id || activeChatPartner.groupAdmin}
        onMembersUpdated={(updatedChat) => setActiveChatPartner(updatedChat)}
      />

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        currentUser={currentUser} 
      />

      {/* Messages Canvas */}
      <div className="messages-container">
        {messages.map((msg) => {
          const isMe = msg.sender === currentUser.username;
          const isMatched = searchResults.includes(msg.id);
          
          return (
            <div key={msg.id} className={`message-wrapper ${isMe ? 'me' : 'them'} ${isMatched ? 'search-match' : ''}`}>
              <div className={`message-bubble ${isMe ? 'me' : 'them'}`}>
              <div className="message-content">
                {msg.messageType === 'audio' && (
                  <div className="message-audio">
                    <AudioPlayer src={msg.audioUrl} isMe={isMe} />
                  </div>
                )}
                {msg.messageType === 'image' && (
                  <div className="message-image">
                    <img src={msg.fileUrl} alt="sent" />
                  </div>
                )}
                {msg.messageType === 'file' && (
                  <div className="message-file">
                    <Paperclip size={20} />
                    <a href={msg.fileUrl} target="_blank" rel="noreferrer">
                      {msg.originalName || msg.fileUrl.split('/').pop()}
                    </a>
                  </div>
                )}
                {msg.text && (
                  editingMessageId === msg.id ? (
                    <div className="edit-mode">
                      <input 
                        type="text" 
                        value={editValue} 
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' ? handleEditSave() : null}
                        autoFocus
                      />
                      <div className="edit-actions">
                        <button onClick={handleEditSave}><Check size={16} /></button>
                        <button onClick={() => setEditingMessageId(null)}><X size={16} /></button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {activeChatPartner.isGroupChat && !isMe && (
                        <span className="sender-name">{msg.sender}</span>
                      )}
                      <p className={`text ${msg.isDeleted ? 'deleted' : ''}`}>
                        {msg.text}
                        {msg.isEdited && !msg.isDeleted && <span className="edited-label">(edited)</span>}
                      </p>
                    </>
                  )
                )}
                <div className="msg-meta">
                  <span className="time">{msg.time}</span>
                  {isMe && (
                    (msg.seenBy?.length > 1 || msg.seen || msg.status === 'seen') ? (
                      <CheckCheck size={14} className={`status-icon seen-icon`} />
                    ) : (
                      <Check size={14} className={`status-icon delivered-icon`} />
                    )
                  )}
                </div>
                
                {isMe && !msg.isDeleted && editingMessageId !== msg.id && (
                  <div className="message-actions">
                    <button onClick={() => handleEditStart(msg)} title="Edit"><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(msg.id)} title="Delete"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
              </div>
            </div>
          );
        })}

        {isOtherUserTyping && (
          <div className="message-wrapper them typing">
              <div className="message-bubble them typing-indicator">
                <span></span><span></span><span></span>
              </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <footer className="chat-input-area">
        {/* Media Preview Bar */}
        {pendingFile && (
          <div className="media-preview-bar glass-panel">
            <div className="preview-info">
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" className="thumb" />
              ) : (
                <div className="file-icon"><Paperclip size={24} /></div>
              )}
              <div className="details">
                <span className="filename">{pendingFile.name}</span>
                <span className="filesize">{(pendingFile.size / 1024).toFixed(1)} KB</span>
              </div>
            </div>
            <button className="remove-preview" onClick={() => { setPendingFile(null); setPreviewUrl(null); }}>
              <X size={18} />
            </button>
          </div>
        )}

        {/* Hidden File Picker Inputs */}
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileSelect} 
        />
        <input 
          type="file" 
          accept="image/*"
          ref={imageInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileSelect} 
        />

        <button className="attachment-btn" onClick={() => fileInputRef.current.click()} title="Upload Files" disabled={isUploading}>
          <Paperclip size={22} />
        </button>
        <button className="image-btn" onClick={() => imageInputRef.current.click()} title="Gallery" disabled={isUploading}>
          <ImageIcon size={22} />
        </button>
        <button className={`voice-btn ${isVoiceOpen ? 'active' : ''}`} onClick={() => {
          if (isVoiceOpen) handleRecordingStop(); // safeguard
          setIsVoiceOpen(!isVoiceOpen);
        }} title="Voice Record">
          <Mic size={22} />
        </button>
        
        {isVoiceOpen && (
          <VoiceRecorder 
            onSend={handleVoiceSend} 
            onCancel={() => {
              handleRecordingStop();
              setIsVoiceOpen(false);
            }}
            onStart={handleRecordingStart}
            onStop={handleRecordingStop}
          />
        )}
        
        <div className="input-field-wrapper">
          <input 
            type="text" 
            placeholder={isUploading ? "Uploading..." : `Message ${activeChatPartner.groupName || activeChatPartner.username}...`}
            value={msgText}
            onChange={handleTyping}
            onKeyPress={(e) => e.key === 'Enter' ? handleSend() : null}
            disabled={isUploading}
          />
          <div className="emoji-picker-wrapper" ref={emojiRef}>
            <button 
              className={`emoji-btn ${isEmojiOpen ? 'active' : ''}`} 
              onClick={() => setIsEmojiOpen(!isEmojiOpen)} 
              title="Emojis"
            >
              <Smile size={22} />
            </button>
            {isEmojiOpen && (
              <div className="emoji-picker-popup">
                <EmojiPicker
                  onEmojiClick={(emojiData) => {
                    setMsgText(prev => prev + emojiData.emoji);
                  }}
                  theme="dark"
                  searchPlaceholder="Search emoji..."
                  width={340}
                  height={420}
                  previewConfig={{ showPreview: false }}
                />
              </div>
            )}
          </div>
        </div>

        <button className={`send-btn ${isUploading ? 'loading' : ''}`} onClick={handleSend} title="Send" disabled={isUploading}>
          {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="send-icon" />}
        </button>
      </footer>
    </main>
  );
};

export default ChatArea;
