import React, { useState } from 'react';
import { User, Lock, Mail, ArrowRight } from 'lucide-react';
import './Login.css';

const Login = ({ onLoginSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!username.trim() || !password.trim() || (isRegister && !email.trim())) return;
    
    setIsLoading(true);
    const result = await onLoginSuccess({ username, password, email, isRegister });
    setIsLoading(false);
    
    if (result && !result.success) {
      setErrorMsg(result.error);
    }
  };

  return (
    <div className="auth-container">
      {/* Decorative Background Elements */}
      <div className="glow-sphere sphere-1"></div>
      <div className="glow-sphere sphere-2"></div>
      
      <div className="auth-card glass-panel">
        <div className="auth-header">
          <h2>{isRegister ? 'Create Account' : 'Welcome Back'}</h2>
          <p>{isRegister ? 'Join the beautiful chat experience.' : 'Sign in to continue chat..'}</p>
        </div>

        {errorMsg && <div className="auth-error-message">{errorMsg}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <User size={20} className="input-icon" />
            <input 
              type="text" 
              placeholder="Username" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required 
            />
          </div>

          {isRegister && (
            <div className="input-group">
              <Mail size={20} className="input-icon" />
              <input 
                type="email" 
                placeholder="Email Address" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
              />
            </div>
          )}

          <div className="input-group">
            <Lock size={20} className="input-icon" />
            <input 
              type="password" 
              placeholder="Password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>

          <button type="submit" className="auth-btn" disabled={isLoading}>
            {isLoading ? 'Processing...' : (isRegister ? 'Register' : 'Login')}
            {!isLoading && <ArrowRight size={20} className="btn-icon" />}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {isRegister ? 'Already have an account?' : "Don't have an account?"}
            <span onClick={() => setIsRegister(!isRegister)} className="toggle-auth">
              {isRegister ? ' Login' : ' Sign up'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
