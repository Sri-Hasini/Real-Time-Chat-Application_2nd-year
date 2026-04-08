import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import CallModal from './components/CallModal';
import AudioPlayer from './components/AudioPlayer';
import Login from './components/Login';
import { socket } from './socket';
import { ChatProvider, useChat } from './context/ChatContext';
import './index.css';

function AppContent({ currentUser, handleLogout }) {
  const { activeChatPartner, setActiveChatPartner, setTriggerSidebarRefresh } = useChat();

  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  }, []);

  return (
    <div className="app-container">
      <Sidebar 
        currentUser={currentUser} 
        onLogout={handleLogout}
      />
      <ChatArea 
        currentUser={currentUser} 
        onLogout={handleLogout}
      />
      <CallModal currentUser={currentUser} />
    </div>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  // Persistence: Check for saved session on startup
  useEffect(() => {
    const savedUser = localStorage.getItem('onchat_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      
      // Verify user exists in the current database
      fetch('http://localhost:5000/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: parsed._id })
      })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Session invalid');
      })
      .then(userData => {
        setCurrentUser(userData);
        setIsAuthenticated(true);
        
        // Ensure socket is connected and registered
        if (!socket.connected) socket.connect();
        socket.emit('register', userData._id);
      })
      .catch(() => {
        // Clear stale session
        localStorage.removeItem('onchat_user');
        setIsAuthenticated(false);
        setCurrentUser(null);
      });
    }

    const onConnect = () => {
      if (currentUser) {
        console.log("Socket connected! Registering user:", currentUser._id);
        socket.emit('register', currentUser._id);
      }
    };

    socket.on('connect', onConnect);
    return () => {
      socket.off('connect', onConnect);
    };
  }, []);

  const handleLoginSuccess = async (payload) => {
    try {
      const endpoint = payload.isRegister ? '/api/register' : '/api/login';
      const res = await fetch(`http://localhost:5000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const userData = await res.json();
      
      if (!res.ok) {
        throw new Error(userData.error || 'Authentication failed');
      }
      
      // Save to localStorage
      localStorage.setItem('onchat_user', JSON.stringify(userData));
      
      // Socket Connection
      socket.connect();
      socket.emit('register', userData._id);
      
      setCurrentUser(userData);
      setIsAuthenticated(true);
      return { success: true };
    } catch (e) {
      console.error("Auth request failed", e);
      return { success: false, error: e.message };
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('onchat_user');
    setIsAuthenticated(false);
    setCurrentUser(null);
    socket.disconnect();
  };

  if (!isAuthenticated || !currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <ChatProvider currentUser={currentUser}>
      <AppContent currentUser={currentUser} handleLogout={handleLogout} />
    </ChatProvider>
  );
}

export default App;
