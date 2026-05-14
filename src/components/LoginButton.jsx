import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, UserRound, Zap } from 'lucide-react';
import {
  clearSessionToken,
  formatUserId,
  getAuthStatus,
  getSessionToken,
  getStoredAuthUserId,
  logout,
  setStoredAuthUserId,
} from '../lib/auth.js';
import LoginModal from './LoginModal.jsx';
import './LoginButton.css';

export default function LoginButton() {
  const menuRef = useRef(null);
  const [authState, setAuthState] = useState(() => ({
    authenticated: Boolean(getSessionToken()),
    userId: getStoredAuthUserId(),
  }));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const refreshAuthState = useCallback(async () => {
    if (!getSessionToken()) {
      setStoredAuthUserId(null);
      setAuthState({ authenticated: false, userId: null });
      return;
    }

    try {
      const payload = await getAuthStatus();

      if (payload.authenticated) {
        setStoredAuthUserId(payload.userId);
        setAuthState({ authenticated: true, userId: payload.userId });
      } else {
        clearSessionToken();
        setStoredAuthUserId(null);
        setAuthState({ authenticated: false, userId: null });
      }
    } catch {
      setAuthState({ authenticated: Boolean(getSessionToken()), userId: getStoredAuthUserId() });
    }
  }, []);

  useEffect(() => {
    refreshAuthState();

    const handleAuthChanged = () => {
      refreshAuthState();
    };

    const handleStorage = (event) => {
      if (event.key === 'embeddly_session_token') {
        refreshAuthState();
      }
    };

    window.addEventListener('embeddly:auth-changed', handleAuthChanged);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('embeddly:auth-changed', handleAuthChanged);
      window.removeEventListener('storage', handleStorage);
    };
  }, [refreshAuthState]);

  useEffect(() => {
    if (!isMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isMenuOpen]);

  const handleLogout = async () => {
    setIsMenuOpen(false);
    await logout();
    setAuthState({ authenticated: false, userId: null });
  };

  if (!authState.authenticated) {
    return (
      <>
        <button className="login-button" type="button" onClick={() => setIsModalOpen(true)}>
          <Zap size={18} />
          <span>Connect Wallet</span>
        </button>
        {isModalOpen && (
          <LoginModal
            onClose={() => setIsModalOpen(false)}
            onAuthenticated={refreshAuthState}
          />
        )}
      </>
    );
  }

  return (
    <div className="login-menu" ref={menuRef}>
      <button
        className="login-button is-authenticated"
        type="button"
        onClick={() => setIsMenuOpen((value) => !value)}
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
      >
        <UserRound size={18} />
        <span>{formatUserId(authState.userId)}</span>
      </button>

      {isMenuOpen && (
        <div className="login-menu__dropdown" role="menu">
          <button type="button" role="menuitem" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Disconnect</span>
          </button>
        </div>
      )}
    </div>
  );
}
