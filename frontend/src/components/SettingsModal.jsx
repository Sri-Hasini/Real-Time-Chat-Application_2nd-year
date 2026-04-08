import React, { useState, useRef } from 'react';
import { Camera, X, Check, Loader2 } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import './SettingsModal.css';

const SettingsModal = ({ isOpen, onClose, currentUser }) => {
  const { updateCurrentUser } = useChat();
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(currentUser.profilePic);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleSave = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('profilePic', selectedFile);
    formData.append('userId', currentUser._id);

    try {
      const res = await fetch('http://localhost:5000/api/users/update-profile-pic', {
        method: 'PUT',
        body: formData,
      });

      if (res.ok) {
        const updatedUser = await res.json();
        updateCurrentUser(updatedUser);
        onClose();
      } else {
        alert("Failed to update profile picture.");
      }
    } catch (err) {
      console.error("Upload error", err);
      alert("Error uploading image.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="settings-modal glass-panel">
        <div className="modal-header">
          <h2>Profile Settings</h2>
          <button className="close-btn" onClick={onClose}><X size={24} /></button>
        </div>

        <div className="modal-content">
          <div className="profile-preview-container">
            <div className="profile-image-wrapper">
              <img src={previewUrl || `https://i.pravatar.cc/150?u=${currentUser.username}`} alt="Profile Preview" />
              <button className="camera-btn" onClick={() => fileInputRef.current.click()}>
                <Camera size={20} />
              </button>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept="image/*"
              onChange={handleFileChange}
            />
          </div>

          <div className="user-details">
            <p className="username-label">Username</p>
            <h3>{currentUser.username}</h3>
          </div>

          <div className="modal-actions">
            <button className="cancel-btn" onClick={onClose}>Cancel</button>
            <button 
              className="save-btn" 
              onClick={handleSave} 
              disabled={!selectedFile || isUploading}
            >
              {isUploading ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
              {isUploading ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
