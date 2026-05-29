import { useCallback, useEffect, useRef, useState } from 'react';
import { LogIn, LogOut, UserRound } from 'lucide-react';
import {
  getAuthStatus,
  getStoredSessionToken,
  initAuthListener,
  signOut,
} from '../lib/auth.js';
import LoginForm from './LoginForm.jsx';
import './LoginButton.css';

export default function LoginButton() {
  const menuRef = useRef(null);
  const [authState, setAuthState] = useState(() => ({
    authenticated: Boolean(getStoredSessionToken()),
    userId: null,
    email: null,
  }));
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const refreshAuthState = useCallback(async () => {
    try {
      const payload = await getAuthStatus();

      if (payload.authenticated) {
        setAuthState({
          authenticated: true,
          userId: payload.userId,
          email: payload.email,
        });
      } else {
        setAuthState({ authenticated: false, userId: null, email: null });
      }
    } catch {
      setAuthState({ authenticated: false, userId: null, email: null });
    }
  }, []);

  useEffect(() => {
    refreshAuthState();

    const unsubscribe = initAuthListener(() => {
      refreshAuthState();
    });

    return () => unsubscribe();
  }, [refreshAuthState]);

  useEffect(() => {
    if (!isMenuOpen) return undefined;

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
    await signOut();
    setAuthState({ authenticated: false, userId: null, email: null });
  };

  if (!authState.authenticated) {
    return (
      <>
        <button className="login-button" type="button" onClick={() => setIsFormOpen(true)}>
          <LogIn size={18} />
          <span>Sign In</span>
        </button>
        {isFormOpen && (
          <LoginForm onClose={() => setIsFormOpen(false)} />
        )}
      </>
    );
  }

  const displayLabel = authState.email || (authState.userId
    ? `${authState.userId.slice(0, 6)}...${authState.userId.slice(-4)}`
    : 'Account');

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
        <span>{displayLabel}</span>
      </button>

      {isMenuOpen && (
        <div className="login-menu__dropdown" role="menu">
          <button type="button" role="menuitem" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
