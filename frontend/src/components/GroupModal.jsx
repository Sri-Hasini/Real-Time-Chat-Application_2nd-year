import React, { useState, useEffect } from 'react';
import { X, Search, UserPlus, Users, Loader2 } from 'lucide-react';
import './GroupModal.css';

const GroupModal = ({ isOpen, onClose, currentUser, onGroupCreated }) => {
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setGroupName('');
      setSearchQuery('');
      setSelectedUsers([]);
      setSearchResults([]);
    }
  }, [isOpen]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const res = await fetch(`http://localhost:5000/api/users/search?query=${searchQuery}&currentUsername=${currentUser.username}`);
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleUser = (user) => {
    if (selectedUsers.some(u => u._id === user._id)) {
      setSelectedUsers(selectedUsers.filter(u => u._id !== user._id));
    } else {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) return;
    setIsCreating(true);
    
    try {
      const userIds = [...selectedUsers.map(u => u._id), currentUser._id];
      const res = await fetch('http://localhost:5000/api/groups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName,
          users: userIds,
          adminId: currentUser._id
        })
      });
      const newGroup = await res.json();
      onGroupCreated(newGroup);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content group-modal glass-panel">
        <header className="modal-header">
          <div className="title-area">
            <Users size={24} className="accent-icon" />
            <h2>Create New Group</h2>
          </div>
          <button className="close-btn" onClick={onClose}><X size={24} /></button>
        </header>

        <div className="modal-body">
          <div className="group-name-input">
            <label>Group Name</label>
            <input 
              type="text" 
              placeholder="Enter group name..." 
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>

          <div className="user-search-section">
            <label>Add Participants</label>
            <div className="search-box">
              <Search size={18} className="search-icon" />
              <input 
                type="text" 
                placeholder="Search users..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' ? handleSearch() : null}
              />
              <button onClick={handleSearch} className="search-go">Find</button>
            </div>

            <div className="search-results-list">
              {searchResults.map(user => {
                const isSelected = selectedUsers.some(u => u._id === user._id);
                return (
                  <div key={user._id} className={`user-result-item ${isSelected ? 'selected' : ''}`} onClick={() => toggleUser(user)}>
                    <img src={user.profilePic || `https://i.pravatar.cc/150?u=${user.username}`} alt="" className="mini-avatar" />
                    <span>{user.username}</span>
                    {isSelected ? <X size={16} /> : <UserPlus size={16} />}
                  </div>
                );
              })}
            </div>
          </div>

          {selectedUsers.length > 0 && (
            <div className="selected-users-tags">
              <label>Selected: ({selectedUsers.length})</label>
              <div className="tag-cloud">
                {selectedUsers.map(user => (
                  <div key={user._id} className="user-tag">
                    <span>{user.username}</span>
                    <X size={14} onClick={() => toggleUser(user)} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button 
            className="create-btn" 
            disabled={!groupName.trim() || selectedUsers.length === 0 || isCreating}
            onClick={handleCreateGroup}
          >
            {isCreating ? <Loader2 size={20} className="animate-spin" /> : 'Create Group'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default GroupModal;
