'use client';

import { ConnectButton as RainbowConnectButton } from '@rainbow-me/rainbowkit';
import { useEffect, useRef, useState } from 'react';
import { useAccount, useSignMessage, useSwitchChain } from 'wagmi';
import { celo } from 'viem/chains';
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
// Bumped when the player taps the button while the wallet is already connected (RainbowKit won't open
// its picker then), so the sign-in effect runs again right away.
const signInRequests = new Set<() => void>();

/**
 * After RainbowKit connects a wallet, this signs the user into the Xurri
 * session (SIWE-style nonce sign). Runs once per newly-connected address.
 */
function WalletSyncEffect() {
  const { address, isConnected, connector } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const setPlayer = usePlayerStore((s) => s.setPlayer);
  // Guard against double-runs for the same address
  const signingRef = useRef<string | null>(null);
  const [requestTick, setRequestTick] = useState(0);
  useEffect(() => {
    const onRequest = () => setRequestTick((n) => n + 1);
    signInRequests.add(onRequest);
    return () => {
      signInRequests.delete(onRequest);
    };
  }, []);

  useEffect(() => {
    if (!isConnected || !address) return;
    // Email players' Magic wallet: their session comes from the email code, not a wallet signature.
    if (connector?.id === MAGIC_CONNECTOR_ID) {
      if (useWalletStore.getState().account?.toLowerCase() !== address.toLowerCase()) {
        useWalletStore.setState({ account: address });
        void useWalletStore.getState().refreshChain();
      }
      return;
    }

    const key = address.toLowerCase();
    // Already handled this address
    if (signingRef.current === key) return;
    // Already signed in with this address (e.g. after a reload): just make sure the wallet is in use.
    const player = usePlayerStore.getState().player;
    if (player?.address?.toLowerCase() === key) {
      if (useWalletStore.getState().account?.toLowerCase() !== key) {
        useWalletStore.setState({ account: address, hasProvider: true });
        void useWalletStore.getState().refreshChain();
      }
      return;
    }

    // Not asked for: a wallet that reconnected on its own must not pop up a signature request.
    if (!walletSignInRequested) return;
    walletSignInRequested = false;
    signingRef.current = key;

    const signIn = async () => {
      useWalletStore.setState({ status: 'signing' });
      try {
        // Switch to Celo before signing — MetaMask defaults to Ethereum
        await switchChainAsync({ chainId: celo.id }).catch(() => null);

        const { message } = await api.nonce(address);
        const signature = await signMessageAsync({ message });
        const signedPlayer = await api.verify(address, signature);

        setPlayer(signedPlayer);
        useWalletStore.setState({ account: address, hasProvider: true });
        void useWalletStore.getState().refreshChain();
        toast.success('Wallet connected', 'You\u2019re signed in and ready to play.');
      } catch (error) {
        signingRef.current = null; // allow retry on error
        useWalletStore.setState({ account: null, status: 'idle' });
        const msg = error instanceof Error ? error.message : '';
        if (!msg.toLowerCase().includes('cancel') && !msg.toLowerCase().includes('user rejected')) {
          toast.error('Sign-in failed', describeError(error));
        }
      } finally {
        useWalletStore.setState({ status: 'idle' });
      }
    };

    void signIn();
    // Only re-run when address, connection state or a sign-in tap changes — NOT on chainId
  }, [isConnected, address, requestTick]);  

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

  useEffect(() => {
    if (account && player?.address) onConnected?.();
  }, [account, player?.address, onConnected]);

  return (
    <>
      <WalletSyncEffect />
      <RainbowConnectButton.Custom>
        {({ openConnectModal, connectModalOpen, account: connectedAccount }) => (
          <button
            type="button"
            className={`btn btn-primary ${block ? 'btn-block' : 'btn-sm'}`}
            onClick={() => {
              walletSignInRequested = true;
              // Already connected (the wallet reconnected by itself): RainbowKit won't show its picker,
              // so ask for the sign-in signature straight away.
              if (connectedAccount) signInRequests.forEach((request) => request());
              else openConnectModal();
            }}
            disabled={connectModalOpen}
          >
            {connectModalOpen ? <span className="spinner" /> : null}
            {label}
          </button>
        )}
      </RainbowConnectButton.Custom>
    </>
  );
}
