'use client';

import { ConnectButton as RainbowConnectButton } from '@rainbow-me/rainbowkit';
import { useCallback, useEffect, useRef } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import type { Address } from 'viem';
import { useWalletStore } from '@/lib/chain/wallet-store';
import { usePlayerStore } from '@/lib/player-store';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast-store';
import { describeError } from '@/lib/chain/wallet-store';
import { MAGIC_CONNECTOR_ID } from '@/lib/magic-connector';

/**
 * Set when the player taps "Sign in with wallet". Only then may the app ask the wallet for a
 * signature; a wallet that reconnects by itself (page load, after signing out) never triggers one.
 */
let walletSignInRequested = false;

/**
 * Signs the player into Xurri with their wallet: one free message signature (no network switch first:
 * the signature is valid on any network, and on phones every extra wallet request is another trip to
 * the wallet app that the browser may block). On success the sign-in gate opens the home page.
 */
function useWalletSignIn() {
  const { signMessageAsync } = useSignMessage();
  const setPlayer = usePlayerStore((s) => s.setPlayer);
  const signing = useRef(false);

  return useCallback(
    async (address: Address) => {
      if (signing.current) return;
      signing.current = true;
      useWalletStore.setState({ status: 'signing' });
      try {
        const { message } = await api.nonce(address);
        const signature = await signMessageAsync({ message });
        const signedPlayer = await api.verify(address, signature);
        setPlayer(signedPlayer);
        useWalletStore.setState({ account: address, hasProvider: true });
        void useWalletStore.getState().refreshChain();
        toast.success('Signed in', 'You’re ready to play.');
      } catch (error) {
        const msg = error instanceof Error ? error.message.toLowerCase() : '';
        if (!msg.includes('cancel') && !msg.includes('user rejected') && !msg.includes('denied')) {
          toast.error('Sign-in failed', describeError(error));
        }
      } finally {
        signing.current = false;
        useWalletStore.setState({ status: 'idle' });
      }
    },
    [signMessageAsync, setPlayer],
  );
}

/**
 * Keeps the app in step with the connected wallet: restores a signed-in player's wallet after a reload,
 * picks up email players' Magic wallet, and asks for the sign-in signature right after the player
 * connects a wallet from the picker.
 */
function WalletSyncEffect() {
  const { address, isConnected, connector } = useAccount();
  const signIn = useWalletSignIn();

  useEffect(() => {
    if (!isConnected || !address) return;
    const key = address.toLowerCase();
    const player = usePlayerStore.getState().player;

    // Email players' Magic wallet, or a wallet already signed in (e.g. after a reload): just use it.
    if (connector?.id === MAGIC_CONNECTOR_ID || player?.address?.toLowerCase() === key) {
      if (useWalletStore.getState().account?.toLowerCase() !== key) {
        useWalletStore.setState({ account: address, hasProvider: connector?.id !== MAGIC_CONNECTOR_ID });
        void useWalletStore.getState().refreshChain();
      }
      return;
    }

    // Only right after the player chose a wallet in the picker. Otherwise (the wallet reconnected by
    // itself, or the page reloaded on the way back from the wallet app) the button offers
    // "Finish signing in", so the signature request comes from a tap, which phones require.
    if (!walletSignInRequested) return;
    walletSignInRequested = false;
    void signIn(address);
  }, [isConnected, address, connector?.id, signIn]);

  return null;
}

export function ConnectButton({
  block = false,
  label = 'Sign in with wallet',
  onConnected,
}: {
  block?: boolean;
  label?: string;
  onConnected?: () => void;
}) {
  const player = usePlayerStore((s) => s.player);
  const account = useWalletStore((s) => s.account);
  const status = useWalletStore((s) => s.status);
  const signIn = useWalletSignIn();

  useEffect(() => {
    if (account && player?.address) onConnected?.();
  }, [account, player?.address, onConnected]);

  return (
    <>
      <WalletSyncEffect />
      <RainbowConnectButton.Custom>
        {({ openConnectModal, connectModalOpen, account: connected }) => {
          // Connected to a wallet that isn't signed in yet: typically the player just came back from
          // approving the connection in their wallet app.
          const needsSignature = Boolean(connected?.address) && player?.address?.toLowerCase() !== connected?.address.toLowerCase();
          const signing = status === 'signing';
          return (
            <>
              <button
                type="button"
                className={`btn btn-primary ${block ? 'btn-block' : 'btn-sm'}`}
                onClick={() => {
                  if (needsSignature) {
                    // Straight from the tap, so phones let the wallet app open.
                    void signIn(connected!.address as Address);
                    return;
                  }
                  walletSignInRequested = true;
                  openConnectModal();
                }}
                disabled={connectModalOpen || signing}
              >
                {connectModalOpen || signing ? <span className="spinner" /> : null}
                {signing ? 'Check your wallet…' : needsSignature ? 'Finish signing in' : label}
              </button>
              {(signing || needsSignature) && (
                <p className="wallet-hint">
                  {signing
                    ? 'Sign the message in your wallet (it’s free), then come back here.'
                    : 'Your wallet is connected. Tap above and sign the free message to finish.'}
                </p>
              )}
            </>
          );
        }}
      </RainbowConnectButton.Custom>
    </>
  );
}
