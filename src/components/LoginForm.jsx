import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogIn, Mail, LoaderCircle, X, KeyRound, Sparkles } from 'lucide-react';
import {
  signInWithEmail,
  signInWithMagicLink,
} from '../lib/auth.js';
import './LoginForm.css';

export default function LoginForm({ onClose }) {
  const modalRef = useRef(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('password');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const closeButton = modalRef.current?.querySelector('button');
    closeButton?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const focusable = Array.from(focusableElements ?? [])
        .filter((el) => !el.disabled && el.offsetParent !== null);

      if (focusable.length === 0) return;

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Email is required.');
      return;
    }

    setError('');
    setStatus('loading');

    try {
      if (mode === 'magic') {
        await signInWithMagicLink(trimmedEmail);
        setStatus('magic_sent');
      } else {
        if (!password) {
          setError('Password is required.');
          setStatus('idle');
          return;
        }
        await signInWithEmail(trimmedEmail, password);
        onClose();
      }
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Sign in failed.');
      setStatus('idle');
    }
  };

  const handleModeToggle = () => {
    setError('');
    setStatus('idle');
    setPassword('');
    setMode(mode === 'password' ? 'magic' : 'password');
  };

  const isLoading = status === 'loading';
  const isSent = status === 'magic_sent';

  return createPortal(
    <div className="login-form-overlay" role="presentation">
      <div
        className="login-form"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-form-title"
      >
        <button
          className="login-form__close icon-button"
          type="button"
          onClick={onClose}
          aria-label="Close sign in"
        >
          <X size={20} />
        </button>

        <div className="login-form__header">
          <span className="login-form__icon">
            <LogIn size={20} />
          </span>
          <h2 id="login-form-title">Sign in to Embeddly</h2>
        </div>

        {isSent ? (
          <div className="login-form__sent" role="status">
            <Sparkles size={24} />
            <p>Magic link sent to <strong>{email.trim()}</strong>.</p>
            <p className="login-form__sent-hint">Check your inbox and click the link to sign in.</p>
          </div>
        ) : (
          <form className="login-form__body" onSubmit={handleSubmit}>
            <label className="login-form__field">
              <span>Email</span>
              <div className="login-form__input-wrapper">
                <Mail size={16} className="login-form__input-icon" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={isLoading}
                  required
                />
              </div>
            </label>

            {mode === 'password' && (
              <label className="login-form__field">
                <span>Password</span>
                <div className="login-form__input-wrapper">
                  <KeyRound size={16} className="login-form__input-icon" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    disabled={isLoading}
                    required
                  />
                </div>
              </label>
            )}

            {error && (
              <p className="login-form__error" role="alert">{error}</p>
            )}

            <button
              className="login-form__submit"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <LoaderCircle size={18} className="login-form__button-spinner" />
              ) : mode === 'magic' ? (
                <Sparkles size={18} />
              ) : (
                <LogIn size={18} />
              )}
              <span>
                {isLoading
                  ? 'Signing in...'
                  : mode === 'magic'
                    ? 'Send magic link'
                    : 'Sign in'}
              </span>
            </button>
          </form>
        )}

        {!isSent && (
          <button
            className="login-form__mode-toggle"
            type="button"
            onClick={handleModeToggle}
            disabled={isLoading}
          >
            {mode === 'password'
              ? 'Sign in with a magic link instead'
              : 'Sign in with password instead'}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
