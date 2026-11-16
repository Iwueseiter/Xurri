'use client';

import { ConnectButton as RainbowConnectButton } from '@rainbow-me/rainbowkit';
import { useCallback, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import type { Address } from 'viem';
import { useWalletStore } from '@/lib/chain/wallet-store';
import { usePlayerStore } from '@/lib/player-store';
import { api } from '@/lib/api';
import { isSignedIn } from '@/lib/access';
import { toast } from '@/lib/toast-store';
import { describeError } from '@/lib/chain/wallet-store';
import { MAGIC_CONNECTOR_ID } from '@/lib/magic-connector';

/** Set when the player taps "Sign in with wallet", so a newly chosen wallet replaces the current account. */
let walletSignInRequested = false;

/**
 * Signs the player in with the wallet they just connected. Approving the connection in the wallet is the
 * whole sign-in: no message to sign, so no second trip to the wallet app. Proof of owning the wallet
 * comes later from the first score save (a wallet transaction) or, for profile changes, one signature.
 */
function useWalletSignIn() {
  const setPlayer = usePlayerStore((s) => s.setPlayer);
  const busy = useRef(false);

  return useCallback(
    async (address: Address) => {
      if (busy.current) return;
      busy.current = true;
      useWalletStore.setState({ status: 'connecting' });
      try {
        setPlayer(await api.connectWallet(address));
        useWalletStore.setState({ account: address, hasProvider: true });
        void useWalletStore.getState().refreshChain();
        toast.success('Signed in', 'You’re ready to play.');
      } catch (error) {
        toast.error('Sign-in failed', describeError(error));
      } finally {
        busy.current = false;
        useWalletStore.setState({ status: 'idle' });
      }
    },
    [setPlayer],
  );
}

/**
 * Keeps the app in step with the connected wallet: restores a signed-in player's wallet after a reload,
 * picks up email players' Magic wallet, and signs the player in as soon as a wallet connects (also when
 * the page reloaded on the way back from the wallet app).
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

    // Wait for the session to load, and never swap a signed-in account for another unless asked.
    if (!player || (isSignedIn(player) && !walletSignInRequested)) return;
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
          // Connected to a wallet that isn't the signed-in one (rare: the automatic sign-in failed).
          const pending = Boolean(connected?.address) && player?.address?.toLowerCase() !== connected?.address.toLowerCase();
          const busy = connectModalOpen || status !== 'idle';
          return (
            <button
              type="button"
              className={`btn btn-primary ${block ? 'btn-block' : 'btn-sm'}`}
              onClick={() => {
                if (pending) return void signIn(connected!.address as Address);
                walletSignInRequested = true;
                openConnectModal();
              }}
              disabled={busy}
            >
              {busy ? <span className="spinner" /> : null}
              {status === 'connecting' ? 'Signing in…' : pending ? 'Continue' : label}
            </button>
          );
        }}
      </RainbowConnectButton.Custom>
    </>
  );
}
