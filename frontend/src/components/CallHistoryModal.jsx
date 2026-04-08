import React, { useState, useEffect } from 'react';
import { X, Phone, Video, Calendar, Clock } from 'lucide-react';
import { socket } from '../socket';
import './CallHistoryModal.css';

const CallHistoryModal = ({ isOpen, onClose, chatId, currentUser }) => {
  const [callHistory, setCallHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = async () => {
    if (!chatId) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:5000/api/calls/${chatId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setCallHistory(data);
      }
    } catch (err) {
      console.error("Failed to fetch call history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, chatId]);

  useEffect(() => {
    const handleNewCall = (newCall) => {
      if (newCall.chatId === chatId) {
        setCallHistory(prev => [newCall, ...prev]);
      }
    };

    socket.on("callHistoryAdded", handleNewCall);
    return () => socket.off("callHistoryAdded", handleNewCall);
  }, [chatId]);

  if (!isOpen) return null;

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="call-history-overlay" onClick={onClose}>
      <div className="call-history-modal glass-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Call History</h3>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="history-list">
          {loading ? (
            <div className="loading-state">Loading history...</div>
          ) : callHistory.length === 0 ? (
            <div className="empty-state">No call records found</div>
          ) : (
            callHistory.map((call) => {
              const isOutgoing = call.callerId._id === currentUser._id;
              const partner = isOutgoing ? call.receiverId : call.callerId;
              
              return (
                <div key={call._id} className="history-item">
                  <div className="history-icon-wrapper">
                    {call.type === 'video' ? <Video size={18} /> : <Phone size={18} />}
                  </div>
                  <div className="history-details">
                    <div className="history-row">
                      <span className="partner-name">{partner.username}</span>
                      <span className={`call-status ${call.status}`}>
                        {call.status.charAt(0).toUpperCase() + call.status.slice(1)}
                      </span>
                    </div>
                    <div className="history-meta">
                      <span><Calendar size={12} /> {formatDate(call.createdAt)}</span>
                      <span><Clock size={12} /> {formatTime(call.createdAt)}</span>
                      {isOutgoing ? <span className="direction">Outgoing</span> : <span className="direction">Incoming</span>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default CallHistoryModal;
