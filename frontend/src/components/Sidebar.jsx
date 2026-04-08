import React, { useState, useEffect, useRef } from 'react';
import { Search, MoreVertical, LogOut, Settings, Users, Plus, Trash2, Mic } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import SettingsModal from './SettingsModal';
import GroupModal from './GroupModal';
import ConfirmModal from './ConfirmModal';
import './Sidebar.css';

const Sidebar = ({ currentUser, onLogout }) => {
  const { 
    recentChats, 
    activeChatPartner, 
    setActiveChatPartner, 
    typingUsers, 
    recordingUsers,
    fetchRecentChats, 
    deleteChat 
  } = useChat();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, chatId: null });
  const menuRef = useRef(null);

  // Debounced Search API call
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.trim().length > 0) {
        setIsSearching(true);
        try {
          const res = await fetch(`http://localhost:5000/api/users/search?query=${searchQuery}&currentUsername=${currentUser.username}`);
          const data = await res.json();
          setSearchResults(data);
        } catch (err) {
          console.error("Search failed", err);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, currentUser.username]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsHeaderMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <aside className="sidebar glass-panel">
      {/* Header Profile Area */}
      <div className="sidebar-header">
        <div className="my-profile">
          <img src={currentUser.profilePic || `https://i.pravatar.cc/150?u=${currentUser.username}`} alt="My Profile" className="avatar" />
          <div className="my-info">
            <h3>{currentUser.username}</h3>
            <span className="my-status">Online</span>
          </div>
        </div>
        <div className="header-actions" ref={menuRef}>
          <button className="icon-btn" title="Create Group" onClick={() => setIsGroupModalOpen(true)}><Plus size={20} /></button>
          <button 
            className={`icon-btn ${isHeaderMenuOpen ? 'active' : ''}`} 
            onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
            title="Menu"
          >
            <MoreVertical size={18} />
          </button>

          {isHeaderMenuOpen && (
            <div className="sidebar-dropdown glass-panel">
              <button className="dropdown-item" onClick={() => { setIsHeaderMenuOpen(false); setIsSettingsOpen(true); }}>
                <Settings size={16} />
                <span>Settings</span>
              </button>
              <div className="dropdown-divider"></div>
              <button className="dropdown-item logout-item" onClick={() => { setIsHeaderMenuOpen(false); onLogout(); }}>
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        currentUser={currentUser} 
      />

      <GroupModal 
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        currentUser={currentUser}
        onGroupCreated={(newGroup) => {
          setActiveChatPartner(newGroup);
          // Optional: refresh chats list
        }}
      />

      <ConfirmModal 
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, chatId: null })}
        onConfirm={() => deleteChat(deleteModal.chatId)}
        title="Delete Chat"
        message="Are you sure you want to delete this entire conversation? This action cannot be undone."
        confirmText="Delete Chat"
      />

      {/* Search Bar */}
      <div className="sidebar-search">
        <div className="search-box glass-panel">
          <Search size={16} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search users..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Chat List / Search Results */}
      <div className="chat-list">
        {searchQuery.length > 0 && searchResults.length === 0 && !isSearching && (
          <div className="no-users-found">No users found.</div>
        )}
        
        {isSearching && (
          <div className="searching-text">Searching...</div>
        )}

        {searchQuery.length === 0 && recentChats.length === 0 && !activeChatPartner && (
           <div className="empty-chat-list">Search above to find friends!</div>
        )}

        {/* Display Recent Chats when not searching */}
        {!searchQuery && recentChats.map((chat) => {
          const isGroup = chat.isGroupChat;
          const otherUser = isGroup ? null : (chat.users.find(u => u._id !== currentUser._id));
          if (!isGroup && !otherUser) return null; // Skip if it's a chat with yourself
          const displayName = isGroup ? chat.groupName : otherUser.username;
          const displayAvatar = isGroup ? chat.groupAvatar : otherUser.profilePic;
          
          const isActive = activeChatPartner?._id === chat._id || activeChatPartner?.username === otherUser?.username;
          const chatIdStr = String(chat._id);
          const isTyping = typingUsers[chatIdStr];
          const isRecording = recordingUsers[chatIdStr];
          
          return (
            <div 
              key={chat._id}
              className={`chat-item ${isActive ? 'active' : ''} ${chat.unreadCount > 0 ? 'unread' : ''}`}
              onClick={() => setActiveChatPartner(isGroup ? chat : otherUser)}
            >
              <div className="avatar-container">
                <img src={displayAvatar || `https://i.pravatar.cc/150?u=${displayName}`} alt={displayName} className="avatar" />
                {!isGroup && otherUser.status === 'Online' && <div className="online-indicator"></div>}
              </div>
              <div className="chat-item-info">
                  <h4>{displayName}</h4>
                  <button 
                    className="delete-chat-btn" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteModal({ isOpen: true, chatId: chat._id });
                    }}
                    title="Delete Chat"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="chat-item-footer">
                  <p className="status-text">
                    {isRecording ? (
                      <span className="recording-label">Recording audio...</span>
                    ) : isTyping ? (
                      <span className="typing-label">typing...</span>
                    ) : chat.lastMessageType === 'audio' ? (
                      <span className="audio-preview-text">
                        <Mic size={14} className="mic-icon-preview" />
                        {chat.lastMessageDuration || 'Voice Message'}
                      </span>
                    ) : (
                      chat.lastMessageText || otherUser?.status || 'Offline'
                    )}
                  </p>
                  
                  {chat.unreadCount > 0 && !isActive && (
                    <div className="unread-badge">{chat.unreadCount}</div>
                  )}
                </div>
              </div>
          );
        })}

        {/* Live Search Results */}
        {searchQuery.length > 0 && searchResults
          .filter(user => user._id !== currentUser._id)
          .map((user) => (
          <div 
            key={user._id} 
            className={`chat-item ${activeChatPartner?._id === user._id ? 'active' : ''}`}
            onClick={() => {
              setActiveChatPartner(user);
              setSearchQuery('');
            }}
          >
            <div className="avatar-container">
              <img src={user.profilePic || `https://i.pravatar.cc/150?u=${user.username}`} alt={user.username} className="avatar" />
              <div className="online-indicator"></div>
            </div>
            <div className="chat-item-info">
              <div className="chat-row">
                <h4>{user.username}</h4>
              </div>
              <p className="status-text">{user.status || 'Offline'}</p>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};

export default Sidebar;
