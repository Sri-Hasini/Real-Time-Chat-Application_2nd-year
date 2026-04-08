import React, { useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer';
import { socket } from '../socket';
import { Phone, PhoneOff, Video, Mic } from 'lucide-react';
import './CallModal.css';

const CallModal = ({ currentUser }) => {
  const [call, setCall] = useState({});
  const [isReceivingCall, setIsReceivingCall] = useState(false);
  const [callAccepted, setCallAccepted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [calling, setCalling] = useState(false);
  const [stream, setStream] = useState();
  const [callType, setCallType] = useState('audio');
  const [permissionError, setPermissionError] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef();
  const timerRef = useRef();

  useEffect(() => {
    if (callAccepted) {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callAccepted]);

  useEffect(() => {
    if (myVideo.current && stream) {
      myVideo.current.srcObject = stream;
    }
  }, [stream, myVideo.current]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const startOutgoingCall = async (e) => {
      const { userToCall, type, name, chatId, profilePic } = e.detail || {};
      if (!userToCall) return;
      setCallType(type || 'audio');
      setCall({ name, to: userToCall, chatId, profilePic });
      setCalling(true);

      try {
        const currentStream = await navigator.mediaDevices.getUserMedia({ 
          video: type === 'video', 
          audio: true 
        });
        setStream(currentStream);
        if (myVideo.current) myVideo.current.srcObject = currentStream;

        const PeerConstructor = (Peer.default || Peer);
        const peer = new PeerConstructor({ initiator: true, trickle: false, stream: currentStream });

        peer.on('signal', (data) => {
          socket.emit('callUser', {
            userToCall: userToCall?.toString(),
            signalData: data,
            from: currentUser._id?.toString(),
            name: currentUser.username,
            profilePic: currentUser.profilePic,
            isVideoCall: type === 'video',
            chatId,
            type
          });
        });

        peer.on('stream', (userStream) => {
          if (userVideo.current) userVideo.current.srcObject = userStream;
        });

        // Backup: Ensure the UI updates when the connection is established
        peer.on('connect', () => {
          setCallAccepted(true);
          setCalling(false);
          setIsReceivingCall(false);
        });

        connectionRef.current = peer;
      } catch (err) {
        console.error('Failed to get local stream:', err);
        let errorMsg = `Technical Error: Could not access hardware. [${err.name}: ${err.message}]`;
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorMsg = "Permission Denied: Please allow microphone and camera access in your browser settings.";
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          errorMsg = "Device in use: Your camera or microphone is already being used by another application. Please close other apps and try again.";
        }
        setPermissionError(errorMsg);
      }
    };

    socket.on('callUser', (incoming) => {
      const { from, name, signal, offer, signalData, type, isVideoCall, chatId, profilePic } = incoming || {};
      setIsReceivingCall(true);
      setCall({
        isReceivingCall: true,
        from,
        name,
        signal: signal || offer || signalData,
        type: type || (isVideoCall ? 'video' : 'audio'),
        chatId,
        profilePic
      });
      setCallType(type || (isVideoCall ? 'video' : 'audio'));
    });

    socket.on('callEnded', () => {
      resetCallState();
    });

    socket.on('callAccepted', (data) => {
      const signal = data?.answer || data?.signal || data;
      // Wait for connect event to update state
      if (connectionRef.current && signal) {
        connectionRef.current.signal(signal);
      }
    });

    window.addEventListener('initiate-call', startOutgoingCall);

    return () => {
      socket.off('callUser');
      socket.off('callEnded');
      socket.off('callAccepted');
      window.removeEventListener('initiate-call', startOutgoingCall);
    };
  }, [currentUser]);

  const answerCall = () => {
    navigator.mediaDevices.getUserMedia({ video: callType === 'video', audio: true })
      .then((currentStream) => {
        setStream(currentStream);
        if (myVideo.current) myVideo.current.srcObject = currentStream;

        const PeerConstructor = (Peer.default || Peer);
        const peer = new PeerConstructor({ initiator: false, trickle: false, stream: currentStream });

        peer.on('signal', (data) => {
          socket.emit('answerCall', { signal: data, to: call.from?.toString() });
        });

        peer.on('stream', (userStream) => {
          if (userVideo.current) userVideo.current.srcObject = userStream;
        });

        peer.on('connect', () => {
          setCallAccepted(true);
          setIsReceivingCall(false);
        });

        peer.signal(call.signal);
        connectionRef.current = peer;
      })
      .catch(err => {
        console.error('Failed to answer call:', err);
        let errorMsg = `Technical Error: Could not establish a connection. [${err.name}: ${err.message}]`;
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorMsg = "Permission Denied: Please allow microphone and camera access.";
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          errorMsg = "Device in use: Your hardware is being used by another app. Please close other apps and try again.";
        }
        setPermissionError(errorMsg);
      });
  };

  const toggleMute = () => {
    if (stream) {
      stream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const resetCallState = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    if (connectionRef.current) {
      connectionRef.current.destroy();
    }
    setCall({});
    setIsReceivingCall(false);
    setCallAccepted(false);
    setCallEnded(false);
    setCalling(false);
    setStream(null);
    setPermissionError(null);
    setCallDuration(0);
    setIsMuted(false);
    setIsVideoOff(false);
    connectionRef.current = null;
  };

  const leaveCall = () => {
    socket.emit('endCall', { to: call.to || call.from });
    resetCallState();
  };

  const rejectCall = () => {
    socket.emit('endCall', { to: call.from });
    resetCallState();
  };

  if (!isReceivingCall && !calling && !callAccepted && !permissionError) return null;

  const remoteProfilePic = call.profilePic || `https://i.pravatar.cc/150?u=${call.name || 'user'}`;

  return (
    <div className="call-overlay">
      <div className={`call-modal glass-panel ${callAccepted ? 'active-state' : ''}`}>
        
        {/* Active Call Header */}
        {callAccepted && (
          <header className="call-header">
            <div className="remote-user-info">
              <h3>{call.name || 'Unknown'}</h3>
              <p className="call-status">Connected • {formatTime(callDuration)}</p>
            </div>
          </header>
        )}

        <div className="video-container">
          {/* Main Background (Profile Pic when no video stream ready) */}
          {(callType === 'audio' || !callAccepted || !stream) && (
            <div className="call-background-placeholder" style={{ opacity: (callType === 'video' && stream) ? 0 : 1 }}>
              <img src={remoteProfilePic} alt="" className="bg-blur-avatar" />
              <div className="avatar-main-wrapper">
                <img src={remoteProfilePic} alt={call.name} title="Remote User" className="avatar-main" />
                {!callAccepted && <div className="avatar-pulse"></div>}
              </div>
            </div>
          )}

          {/* Video Streams */}
          {stream && callType === 'video' && (
            <video playsInline muted ref={myVideo} autoPlay className={`local-video ${(callAccepted || calling) ? 'pip' : 'fullscreen'}`} />
          )}
          {callAccepted && callType === 'video' && (
            <video playsInline ref={userVideo} autoPlay className="remote-video" />
          )}

          {permissionError && (
             <div className="permission-error-screen">
               <div className="error-icon">
                 <PhoneOff size={48} />
               </div>
               <h3>Access Denied</h3>
               <p>{permissionError}</p>
               <button className="error-close-btn" onClick={leaveCall}>Dismiss</button>
             </div>
          )}
        </div>

        {/* Incoming Call Overlay */}
        {isReceivingCall && !callAccepted && (
           <div className="incoming-call-view">
             <div className="call-content-wrapper">
               <div className="call-avatar-container">
                 <img src={remoteProfilePic} alt="" className="call-avatar" />
                 <div className="avatar-pulse"></div>
               </div>
               <h2 className="call-title">Incoming {callType === 'video' ? 'Video' : 'Audio'} Call</h2>
               <p className="call-subtitle">{call.name} is calling...</p>
               
               <div className="call-actions">
                  <button className="reject-btn circular-btn" onClick={rejectCall} title="Decline">
                    <PhoneOff size={28} />
                  </button>
                  <button className="accept-btn circular-btn" onClick={answerCall} title="Accept">
                    {callType === 'video' ? <Video size={28}/> : <Phone size={28} />}
                  </button>
               </div>
             </div>
           </div>
        )}

        {/* Outgoing Calling View */}
        {calling && !callAccepted && (
          <div className="calling-view-overlay">
            <div className="call-content-wrapper">
              <div className="call-avatar-container">
                <img src={remoteProfilePic} alt="" className="call-avatar" />
                <div className="avatar-pulse"></div>
              </div>
              <h2 className="call-title">Calling...</h2>
              <p className="call-subtitle">{call.name}</p>
              
              <div className="call-actions">
                <button className="end-btn circular-btn" onClick={leaveCall} title="Cancel">
                  <PhoneOff size={28} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Active Call Controls (Bottom Bar) */}
        {callAccepted && (
          <footer className="call-footer-controls">
            <div className="controls-row">
              <button 
                className={`control-btn ${isMuted ? 'muted' : ''}`} 
                onClick={toggleMute}
                title={isMuted ? "Unmute" : "Mute"}
              >
                <Mic size={24} className={isMuted ? "disabled" : ""} />
              </button>
              
              {callType === 'video' && (
                <button 
                  className={`control-btn ${isVideoOff ? 'off' : ''}`} 
                  onClick={toggleVideo}
                  title={isVideoOff ? "Turn Video On" : "Turn Video Off"}
                >
                  <Video size={24} className={isVideoOff ? "disabled" : ""} />
                </button>
              )}

              <button className="control-btn end-call-btn" onClick={leaveCall} title="End Call">
                <PhoneOff size={28} />
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
};

export default CallModal;
