import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { socket } from '../socket';

const ChatContext = createContext();

export const useChat = () => useContext(ChatContext);

export const ChatProvider = ({ children, currentUser }) => {
  const [typingUsers, setTypingUsers] = useState({}); // { chatId: boolean }
  const [recordingUsers, setRecordingUsers] = useState({}); // { chatId: boolean }
  const [recentChats, setRecentChats] = useState([]);
  const [activeChatPartner, setActiveChatPartner] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const fetchRecentChats = useCallback(async () => {
    if (!currentUser?._id) return;
    try {
      const res = await fetch(`http://localhost:5000/api/chats/${currentUser._id}`);
      const data = await res.json();
      setRecentChats(data);
    } catch (err) {
      console.error("Failed to fetch recent chats", err);
    }
  }, [currentUser?._id]);

  useEffect(() => {
    if (!currentUser?._id) return;

    socket.connect();
    
    // Auto-register on connect (vital for when socket reconnects in background)
    const handleConnect = () => socket.emit('register', currentUser._id);
    handleConnect(); // initial emit
    socket.on('connect', handleConnect);

    // Global Listeners
    socket.on('typing', (data) => {
      setTypingUsers(prev => ({ ...prev, [String(data.chatId)]: true }));
    });

    socket.on('stopTyping', (data) => {
      setTypingUsers(prev => ({ ...prev, [String(data.chatId)]: false }));
    });

    socket.on('recordingStart', (data) => {
      setRecordingUsers(prev => ({ ...prev, [String(data.chatId)]: true }));
    });

    socket.on('recordingStop', (data) => {
      setRecordingUsers(prev => ({ ...prev, [String(data.chatId)]: false }));
    });

    socket.on('newMessage', (message) => {
      // Cross-tab deduplication lock
      const lockKey = `notified_${message.id}`;
      if (localStorage.getItem(lockKey)) {
        fetchRecentChats();
        return;
      }
      localStorage.setItem(lockKey, 'true');
      setTimeout(() => localStorage.removeItem(lockKey), 5000);

      // Play Sound
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
      audio.play().catch(e => console.log("Sound play failed", e));

      // Browser Notification if tab is hidden OR not in active chat
      const isWindowHidden = document.visibilityState === 'hidden';
      const isOtherChatOpen = activeChatPartner?._id !== message.chatId && activeChatPartner?.username !== message.sender;

      if ((isWindowHidden || isOtherChatOpen) && Notification.permission === "granted") {
        new Notification(`New message from ${message.sender}`, {
          body: message.text,
          icon: message.senderProfilePic || '/logo.png'
        });
      }
      fetchRecentChats();
    });

    socket.on('message_status_update', (data) => {
      fetchRecentChats();
    });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('typing');
      socket.off('stopTyping');
      socket.off('recordingStart');
      socket.off('recordingStop');
      socket.off('newMessage');
      socket.off('message_status_update');
    };
  }, [currentUser?._id, fetchRecentChats, activeChatPartner]);

  useEffect(() => {
    fetchRecentChats();
  }, [fetchRecentChats, activeChatPartner]);

  const updateCurrentUser = (updatedUser) => {
    // Save to localStorage to persist through refreshes
    localStorage.setItem('onchat_user', JSON.stringify(updatedUser));
    // Trigger global state refresh if the app components use it directly via context
    window.location.reload(); // Quickest way to force full refresh of all images
  };

  const deleteChat = async (chatId) => {
    try {
      await fetch(`http://localhost:5000/api/chats/${chatId}`, { method: 'DELETE' });
      fetchRecentChats();
      if (activeChatPartner?._id === chatId) {
        setActiveChatPartner(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const value = {
    typingUsers,
    recordingUsers,
    recentChats,
    activeChatPartner,
    setActiveChatPartner,
    notifications,
    setNotifications,
    fetchRecentChats,
    updateCurrentUser,
    deleteChat
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
