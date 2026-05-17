import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { init, requestProvider } from '@getalby/bitcoin-connect-react';
import { bech32 } from 'bech32';
import { Clipboard, LoaderCircle, X, Zap } from 'lucide-react';
import {
  getAuthStatus,
  setSessionToken,
  setStoredAuthUserId,
  startLnurlAuth,
} from '../lib/auth.js';
import './LoginModal.css';

const AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;
const LNURL_BECH32_LIMIT = 2000;

function decodeLnurl(lnurl) {
  const { words } = bech32.decode(lnurl, LNURL_BECH32_LIMIT);
  return new TextDecoder().decode(Uint8Array.from(bech32.fromWords(words)));
}

function normalizeSignature(signResult) {
  if (typeof signResult === 'string') {
    return signResult.trim();
  }

  return String(signResult?.signature ?? '').trim();
}

async function resolveProviderPublicKey(provider) {
  const directPublicKey = String(provider?.publicKey ?? '').trim();
  if (directPublicKey) {
    return directPublicKey;
  }

  if (typeof provider?.getInfo !== 'function') {
    return '';
  }

  const info = await provider.getInfo();
  return String(info?.node?.pubkey ?? '').trim();
}

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
      const callback = new URL(decodeLnurl(challenge.lnurl));
      const k1 = callback.searchParams.get('k1');

      if (!k1) {
        throw new Error('Invalid LNURL: missing k1 parameter.');
      }

      if (typeof provider?.signMessage !== 'function') {
        throw new Error('Your wallet does not support LNURL-Auth. Please scan the QR code.');
      }

      const signature = normalizeSignature(await provider.signMessage(k1));
      if (!signature) {
        throw new Error('Wallet did not return a signature. Please scan the QR code.');
      }

      const publicKey = await resolveProviderPublicKey(provider);
      if (!publicKey) {
        throw new Error('Unable to retrieve wallet public key. Please scan the QR code.');
      }

      callback.searchParams.set('k1', k1);
      callback.searchParams.set('sig', signature);
      callback.searchParams.set('key', publicKey);

      const callbackResponse = await fetch(callback.toString());
      const callbackPayload = await callbackResponse.json().catch(() => ({}));

      if (!callbackResponse.ok || callbackPayload.status === 'ERROR') {
        throw new Error(
          callbackPayload.reason || 'Wallet authentication callback failed.',
        );
      }

      setStatus('awaiting_scan');
    } catch (connectError) {
      setError(connectError instanceof Error
        ? connectError.message
        : 'Browser wallet authentication failed. Scan the QR code with your mobile wallet.');
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

  const statusText = status === 'authenticated'
    ? 'Authenticated.'
    : status === 'loading'
      ? 'Preparing login request...'
      : status === 'connecting_wallet'
        ? 'Opening wallet and signing challenge...'
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
      </div>
    </div>
  );
}
