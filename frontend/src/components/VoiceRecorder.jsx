import React, { useState, useRef } from 'react';
import { Mic, Square, Trash2, Send, Loader2 } from 'lucide-react';
import './VoiceRecorder.css';

const VoiceRecorder = ({ onSend, onCancel, onStart, onStop }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const mediaRecorderRef = useRef(null);
  const timerRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.ref = mediaRecorder;
      const chunks = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };

      mediaRecorder.start();
      setIsRecording(true);
      if (onStart) onStart();
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access denied", err);
      alert("Microphone access denied!");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.ref) {
      mediaRecorderRef.ref.stop();
      setIsRecording(false);
      if (onStop) onStop();
      clearInterval(timerRef.current);
    }
  };

  const handleSend = async () => {
    if (!audioBlob) return;
    setIsUploading(true);
    
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    try {
      const res = await fetch('http://localhost:5000/api/messages/voice', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      onSend(data.audioUrl, formatTime(recordingTime));
      reset();
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setIsUploading(false);
    }
  };

  const reset = () => {
    setAudioUrl(null);
    setAudioBlob(null);
    setRecordingTime(0);
    setIsRecording(false);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="voice-recorder-overlay glass-panel">
      {!audioUrl ? (
        <div className="recording-state">
          <div className={`mic-status ${isRecording ? 'pulse' : ''}`}>
             {isRecording ? <Square size={20} fill="#ef4444" onClick={stopRecording} /> : <Mic size={24} onClick={startRecording} />}
          </div>
          <span className="timer">{formatTime(recordingTime)}</span>
          {isRecording ? (
             <button className="cancel-voice" onClick={() => { stopRecording(); onCancel(); }}><Trash2 size={18} /></button>
          ) : (
             <button className="cancel-voice" onClick={onCancel}><Trash2 size={18} /></button>
          )}
        </div>
      ) : (
        <div className="preview-state">
          <audio src={audioUrl} controls className="audio-preview" />
          <div className="preview-actions">
            <button className="retry-voice" onClick={reset} disabled={isUploading}><Trash2 size={18} /></button>
            <button className="send-voice" onClick={handleSend} disabled={isUploading}>
              {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceRecorder;
