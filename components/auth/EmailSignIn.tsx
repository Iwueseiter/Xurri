'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Mail, MailCheck } from 'lucide-react';
import { getAddress, isAddress } from 'viem';
import { connect } from 'wagmi/actions';
import { getMagic } from '@/lib/magic';
import { MAGIC_CONNECTOR_ID } from '@/lib/magic-connector';
import { wagmiConfig } from '@/lib/wagmi-config';
import { api } from '@/lib/api';
import { usePlayerStore } from '@/lib/player-store';
import { useWalletStore } from '@/lib/chain/wallet-store';
import { toast } from '@/lib/toast-store';

type OtpFlow = ReturnType<ReturnType<typeof getMagic>['auth']['loginWithEmailOTP']>;

// If Magic hasn't confirmed sending the code by then, something upstream is wrong (blocked origin, outage).
const SEND_TIMEOUT_MS = 20_000;

/** Magic's own errors ("Magic RPC Error: [-32603] …") mean nothing to players; keep them for the console. */
function friendly(error: unknown, fallback: string) {
  console.error('[email sign-in]', error);
  const message = error instanceof Error ? error.message : '';
  return message && !/magic|rpc|-32\d{3}/i.test(message) ? message : fallback;
}

const UNAVAILABLE = 'Email sign-in isn’t working right now. Try again in a few minutes, or sign in with a wallet.';

/**
 * Two-step email sign-in via Magic, with our own code screen (Magic's `showUI: false` mode) so every
 * failure reaches the player as a clear message instead of a stuck popup.
 * Magic creates a non-custodial wallet for the player; its address is saved to the player.
 */
export function EmailSignIn({ compact = false }: { compact?: boolean }) {
  const setPlayer = usePlayerStore((s) => s.setPlayer);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'sending' | 'code' | 'verifying'>('email');
  const flow = useRef<OtpFlow | null>(null);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reset = (message?: [string, string]) => {
    clearTimeout(sendTimer.current);
    flow.current?.emit('cancel');
    flow.current = null;
    setCode('');
    setStep('email');
    if (message) toast.error(...message);
  };

  // Leaving the screen mid-way closes Magic's flow.
  useEffect(
    () => () => {
      flow.current?.emit('cancel');
    },
    [],
  );

  const finish = async (didToken: string | null) => {
    clearTimeout(sendTimer.current);
    if (!didToken) return reset();
    setStep('verifying');
    try {
      // Exchange the DID token for an Xurri session; the server saves the Magic wallet address.
      const player = await api.verifyOtp(didToken);
      setPlayer(player);
      // Make the email's own Magic wallet the connected wallet: every game transaction is then signed
      // inside Magic, never in a wallet app.
      const magicConnector = wagmiConfig.connectors.find((connector) => connector.id === MAGIC_CONNECTOR_ID);
      if (magicConnector) await connect(wagmiConfig, { connector: magicConnector }).catch((error) => console.warn('[email sign-in] wallet connect', error));
      if (player.address && isAddress(player.address)) {
        useWalletStore.setState({ account: getAddress(player.address), hasProvider: false });
        void useWalletStore.getState().refreshChain();
      }
      toast.success('Signed in', 'Welcome to Xurri!');
    } catch (error) {
      reset(['Sign-in failed', error instanceof Error ? error.message : 'Please try again.']);
    } finally {
      flow.current = null;
    }
  };

  const sendCode = (event: FormEvent) => {
    event.preventDefault();
    setStep('sending');
    try {
      const otp = getMagic().auth.loginWithEmailOTP({ email: email.trim(), showUI: false });
      flow.current = otp;
      sendTimer.current = setTimeout(
        () => reset(['Email sign-in isn’t responding', 'Please try again in a moment, or sign in with a wallet.']),
        SEND_TIMEOUT_MS,
      );
      otp
        .on('email-otp-sent', () => {
          clearTimeout(sendTimer.current);
          setStep('code');
        })
        .on('invalid-email-otp', () => {
          setCode('');
          setStep('code');
          toast.error('That code isn’t right', 'Check the latest email from Magic and try again.');
        })
        .on('expired-email-otp', () => reset(['That code has expired', 'Ask for a new one.']))
        .on('login-throttled', () => reset(['Too many tries', 'Wait a few minutes, then try again.']))
        .on('max-attempts-reached', () => reset(['Too many wrong codes', 'Ask for a new code.']))
        .on('error', (error: unknown) => reset(['Couldn’t send your code', friendly(error, UNAVAILABLE)]));
      otp.then(finish).catch((error: unknown) => {
        // The promise also rejects after an 'error' event; only report it if nothing has yet.
        if (flow.current === otp) reset(['Couldn’t sign you in', friendly(error, UNAVAILABLE)]);
      });
    } catch (error) {
      reset(['Email sign-in isn’t available', friendly(error, UNAVAILABLE)]);
    }
  };

  const verifyCode = (event: FormEvent) => {
    event.preventDefault();
    if (!flow.current) return reset();
    setStep('verifying');
    flow.current.emit('verify-email-otp', code.trim());
  };

  if (step === 'code' || step === 'verifying') {
    return (
      <form className="email-signin" onSubmit={verifyCode}>
        <p className="email-code-note">
          <MailCheck size={18} /> We sent a 6-digit code to <strong>{email.trim()}</strong>
        </p>
        <input
          className="input email-code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="123456"
          aria-label="Code from the email"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          autoFocus
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={step === 'verifying' || code.length !== 6}>
          {step === 'verifying' ? <span className="spinner" /> : 'Sign in'}
        </button>
        <button type="button" className="link-btn" onClick={() => reset()} disabled={step === 'verifying'}>
          Use another email
        </button>
      </form>
    );
  }

  return (
    <form className="email-signin" onSubmit={sendCode}>
      {!compact && (
        <label htmlFor="signin-email" className="email-signin-label">
          Email
        </label>
      )}
      <input
        id="signin-email"
        className="input"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <button type="submit" className="btn btn-primary btn-block" disabled={step === 'sending' || !email.includes('@')}>
        {step === 'sending' ? <span className="spinner" /> : <Mail size={18} />}
        {step === 'sending' ? 'Sending your code…' : 'Email me a code'}
      </button>
    </form>
  );
}
