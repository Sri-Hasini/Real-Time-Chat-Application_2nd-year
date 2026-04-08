import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import './ConfirmModal.css';

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", cancelText = "Cancel", type = "danger" }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="confirm-modal glass-panel animate-pop">
        <div className="confirm-icon-wrapper" style={{ color: type === 'danger' ? '#ef4444' : 'var(--accent-primary)' }}>
          <AlertCircle size={48} />
        </div>
        
        <div className="confirm-content">
          <h3>{title}</h3>
          <p>{message}</p>
        </div>

        <div className="confirm-actions">
          <button className="confirm-btn-secondary" onClick={onClose}>
            {cancelText}
          </button>
          <button 
            className={`confirm-btn-primary ${type}`} 
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </button>
        </div>

        <button className="confirm-close-x" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
    </div>
  );
};

export default ConfirmModal;
