import { connectorsForWallets, getDefaultWallets } from '@rainbow-me/rainbowkit';
import { injectedWallet } from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http } from 'wagmi';
import { celo } from 'viem/chains';
import { chainConfig } from '@/lib/chain/config';
import { magicConnector } from '@/lib/magic-connector';

// A WalletConnect (Reown) project ID from https://cloud.reown.com unlocks QR codes and mobile wallet
// deep links. Without one, WalletConnect rejects every request, so only the browser's own wallet is
// offered (wallet in-app browsers and extensions like MetaMask).
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export const walletConnectEnabled = Boolean(projectId && projectId !== 'placeholder');

// Wallets RainbowKit lists in its picker.
const walletConnectors = connectorsForWallets(
  walletConnectEnabled ? getDefaultWallets().wallets : [{ groupName: 'Your wallet', wallets: [injectedWallet] }],
  { appName: 'Xurri', projectId: walletConnectEnabled ? projectId! : 'unused' },
);

export const wagmiConfig = createConfig({
  chains: [celo],
  transports: { [celo.id]: http(chainConfig.chain.id === celo.id ? chainConfig.rpcUrl : undefined) },
  // Email players' Magic wallet is a connector too, so their transactions go through Magic, never a
  // wallet app. RainbowKit doesn't show it; the email sign-in form connects it.
  connectors: [...walletConnectors, magicConnector()],
  // Celo makes a block about every second; viem's 4 s default made every confirmation feel slow.
  pollingInterval: 1_000,
  ssr: true,
});
