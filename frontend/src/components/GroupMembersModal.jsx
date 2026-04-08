import React, { useState } from 'react';
import { X, User, UserPlus, UserMinus, Search, Loader2, LogOut } from 'lucide-react';
import './GroupMembersModal.css';

const GroupMembersModal = ({ isOpen, onClose, members = [], groupName, chatId, currentUser, adminId, onMembersUpdated }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingUserId, setLoadingUserId] = useState(null);
  const [showAddSection, setShowAddSection] = useState(false);

  if (!isOpen) return null;

  const isAdmin = currentUser?._id && (String(currentUser._id) === String(adminId));
  const currentMemberIds = members.map(m => String(m._id));

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`http://localhost:5000/api/users/search?query=${encodeURIComponent(searchQuery)}&currentUsername=${encodeURIComponent(currentUser.username)}`);
      const data = await res.json();
      setSearchResults(Array.isArray(data) ? data.filter(u => !currentMemberIds.includes(String(u._id))) : []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddMember = async (userId) => {
    setLoadingUserId(userId);
    try {
      const res = await fetch('http://localhost:5000/api/groups/add-member', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, userId, adminId: currentUser._id })
      });
      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.error || 'Failed to add member');
        return;
      }
      const updatedChat = await res.json();
      if (onMembersUpdated) onMembersUpdated(updatedChat);
      setSearchResults(prev => prev.filter(u => u._id !== userId));
    } catch (err) {
      console.error('Failed to add member', err);
    } finally {
      setLoadingUserId(null);
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm('Remove this member from the group?')) return;
    setLoadingUserId(userId);
    try {
      const res = await fetch('http://localhost:5000/api/groups/remove-member', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, userId, adminId: currentUser._id })
      });
      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.error || 'Failed to remove member');
        return;
      }
      const updatedChat = await res.json();
      if (onMembersUpdated) onMembersUpdated(updatedChat);
    } catch (err) {
      console.error('Failed to remove member', err);
    } finally {
      setLoadingUserId(null);
    }
  };

  const handleLeaveGroup = async () => {
    if (!window.confirm('Are you sure you want to leave this group?')) return;
    setLoadingUserId(currentUser._id);
    try {
      const res = await fetch('http://localhost:5000/api/groups/remove-member', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, userId: currentUser._id, adminId: currentUser._id })
      });
      if (!res.ok) throw new Error('Failed to leave group');
      const updatedChat = await res.json();
      if (onMembersUpdated) onMembersUpdated(updatedChat);
      onClose();
    } catch (err) {
      console.error('Failed to leave group', err);
      alert('Error leaving group');
    } finally {
      setLoadingUserId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="members-modal glass-panel animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-left">
            <h3>{groupName}</h3>
            <span className="member-count">{members.length} members</span>
          </div>
          <div className="modal-header-actions">
            {isAdmin && (
              <button
                className={`add-member-toggle-btn ${showAddSection ? 'active' : ''}`}
                onClick={() => { setShowAddSection(!showAddSection); setSearchQuery(''); setSearchResults([]); }}
                title="Add Member"
              >
                <UserPlus size={18} />
                <span>Add</span>
              </button>
            )}
            <button className="close-btn" onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        {showAddSection && isAdmin && (
          <div className="add-member-section">
            <div className="member-search-bar">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search users to add..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                autoFocus
              />
              <button onClick={handleSearch} className="search-go-btn" disabled={isSearching}>
                {isSearching ? <Loader2 size={14} className="animate-spin" /> : 'Find'}
              </button>
            </div>

            <div className="add-member-results">
              {searchResults.length === 0 && searchQuery && !isSearching && (
                <p className="no-results-text">No users found outside this group.</p>
              )}
              {searchResults.map(user => (
                <div key={user._id} className="add-member-result-item">
                  <img src={user.profilePic || `https://i.pravatar.cc/150?u=${user.username}`} alt="" className="mini-avatar" />
                  <span>{user.username}</span>
                  <button
                    className="confirm-add-btn"
                    onClick={() => handleAddMember(user._id)}
                    disabled={loadingUserId === user._id}
                  >
                    {loadingUserId === user._id ? <Loader2 size={14} className="animate-spin" /> : <><UserPlus size={14} /> Add</>}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="members-list scroll-container">
          {members && members.map((member) => (
            <div key={member._id} className="member-item">
              <div className="avatar-container">
                <img 
                  src={member.profilePic || `https://i.pravatar.cc/150?u=${member.username}`} 
                  alt={member.username} 
                  className="avatar" 
                />
                {member.status === 'Online' && <div className="online-indicator"></div>}
              </div>
              <div className="member-info">
                <div className="name-row">
                  <h4>{member.username}</h4>
                  {String(member._id) === String(adminId) && <span className="admin-badge">Admin</span>}
                  {String(member._id) === String(currentUser?._id) && <span className="you-badge">You</span>}
                </div>
                <p className={`status-text ${member.status === 'Online' ? 'online' : ''}`}>
                  {member.status || 'Offline'}
                </p>
              </div>

              {isAdmin && String(member._id) !== String(currentUser?._id) && (
                <button
                  className="remove-member-btn"
                  onClick={() => handleRemoveMember(member._id)}
                  disabled={loadingUserId === member._id}
                  title={`Remove ${member.username}`}
                >
                  {loadingUserId === member._id ? <Loader2 size={15} className="animate-spin" /> : <UserMinus size={15} />}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="leave-group-btn" onClick={handleLeaveGroup} disabled={loadingUserId === currentUser?._id}>
            <LogOut size={16} />
            <span>Leave Group</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupMembersModal;
