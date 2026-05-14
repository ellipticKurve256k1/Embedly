import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { init, requestProvider } from '@getalby/bitcoin-connect-react';
import { Clipboard, ExternalLink, LoaderCircle, X, Zap } from 'lucide-react';
import {
  getAuthStatus,
  setSessionToken,
  setStoredAuthUserId,
  startLnurlAuth,
} from '../lib/auth.js';
import './LoginModal.css';

const AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;

export default function LoginModal({ onClose, onAuthenticated }) {
  const modalRef = useRef(null);
  const lnurlInputRef = useRef(null);
  const [challenge, setChallenge] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    let isMounted = true;

    setStatus('loading');
    startLnurlAuth()
      .then((payload) => {
        if (!isMounted) return;
        setChallenge(payload);
        setStatus('awaiting_scan');
      })
      .catch((authError) => {
        if (!isMounted) return;
        setError(authError instanceof Error ? authError.message : 'Unable to start login.');
        setStatus('error');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!challenge?.k1 || status !== 'awaiting_scan') {
      return undefined;
    }

    let isMounted = true;
    const startedAt = Date.now();

    const poll = async () => {
      if (Date.now() - startedAt > AUTH_TIMEOUT_MS) {
        if (isMounted) {
          setError('Authentication timed out. Try again.');
          setStatus('error');
        }
        return;
      }

      try {
        const payload = await getAuthStatus(challenge.k1);

        if (!isMounted) return;

        if (payload.authenticated && payload.token) {
          setSessionToken(payload.token);
          setStoredAuthUserId(payload.userId);
          setStatus('authenticated');
          onAuthenticated?.(payload);
          onClose();
        }
      } catch (pollError) {
        if (!isMounted) return;
        setError(pollError instanceof Error ? pollError.message : 'Unable to verify login.');
        setStatus('error');
      }
    };

    const intervalId = window.setInterval(poll, POLL_INTERVAL_MS);
    poll();

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [challenge, status, onAuthenticated, onClose]);

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

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const focusable = Array.from(focusableElements ?? [])
        .filter((element) => !element.disabled && element.offsetParent !== null);

      if (focusable.length === 0) {
        return;
      }

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

  const handleWebLnConnect = async () => {
    if (!challenge?.lnurl) {
      return;
    }

    setError('');
    setCopyStatus('');
    setStatus('connecting_wallet');

    try {
      init({ appName: 'Embeddly' });
      const provider = await requestProvider();

      if (typeof provider?.lnurl !== 'function') {
        throw new Error(
          'This connected wallet does not support LNURL-Auth. Copy the LNURL or scan the QR code.',
        );
      }

      const result = await provider.lnurl(challenge.lnurl);
      if (result?.status === 'ERROR') {
        throw new Error(result.reason || 'Wallet rejected the LNURL authentication request.');
      }

      setStatus('awaiting_scan');
    } catch (connectError) {
      setError(connectError instanceof Error
        ? connectError.message
        : 'No WebLN provider found. Copy the LNURL or scan the QR code.');
      setStatus('awaiting_scan');
    }
  };

  const handleCopyLnurl = async () => {
    if (!challenge?.lnurl) {
      return;
    }

    setError('');
    setCopyStatus('');

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable.');
      }

      await navigator.clipboard.writeText(challenge.lnurl);
      setCopyStatus('Copied.');
    } catch {
      lnurlInputRef.current?.focus();
      lnurlInputRef.current?.select();
      setCopyStatus('Select and copy manually.');
    }
  };

  const handleOpenWallet = () => {
    if (!challenge?.lnurl) {
      return;
    }

    setError('');
    setCopyStatus('');
    window.location.href = `lightning:${challenge.lnurl}`;
  };

  const statusText = status === 'authenticated'
    ? 'Authenticated.'
    : status === 'loading'
      ? 'Preparing login request...'
      : status === 'connecting_wallet'
        ? 'Waiting for browser wallet...'
        : error || copyStatus || 'Waiting for wallet scan...';
  const canUseChallenge = Boolean(challenge?.lnurl);
  const isConnectingWallet = status === 'connecting_wallet';

  return (
    <div className="login-modal-overlay" role="presentation">
      <div
        className="login-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
      >
        <button className="login-modal__close icon-button" type="button" onClick={onClose} aria-label="Close login">
          <X size={20} />
        </button>

        <div className="login-modal__header">
          <span className="login-modal__icon">
            <Zap size={20} />
          </span>
          <h2 id="login-modal-title">Connect with Lightning</h2>
        </div>

        <div className="login-modal__qr" aria-live="polite">
          {challenge?.lnurl ? (
            <QRCodeSVG value={challenge.lnurl} size={200} />
          ) : (
            <LoaderCircle className="login-modal__spinner" size={34} />
          )}
        </div>

        <p className={`login-modal__status${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>
          {statusText}
        </p>

        <div className="login-modal__actions">
          <button
            className="login-modal__secondary-action"
            type="button"
            onClick={handleOpenWallet}
            disabled={!canUseChallenge}
          >
            <ExternalLink size={17} />
            <span>Open Wallet</span>
          </button>
          <button
            className="login-modal__secondary-action"
            type="button"
            onClick={handleCopyLnurl}
            disabled={!canUseChallenge}
          >
            <Clipboard size={17} />
            <span>Copy LNURL</span>
          </button>
        </div>

        <label className="login-modal__lnurl">
          <span>LNURL auth request</span>
          <textarea
            ref={lnurlInputRef}
            readOnly
            rows={3}
            value={challenge?.lnurl ?? ''}
            placeholder="Preparing LNURL..."
            onFocus={(event) => event.target.select()}
          />
        </label>

        <button
          className="login-modal__webln"
          type="button"
          onClick={handleWebLnConnect}
          disabled={!canUseChallenge || status === 'loading' || isConnectingWallet}
        >
          {isConnectingWallet ? (
            <LoaderCircle className="login-modal__button-spinner" size={18} />
          ) : (
            <Zap size={18} />
          )}
          <span>{isConnectingWallet ? 'Connecting' : 'Use Browser Wallet'}</span>
        </button>
      </div>
    </div>
  );
}
