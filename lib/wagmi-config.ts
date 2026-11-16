import { connectorsForWallets, getDefaultConfig } from '@rainbow-me/rainbowkit';
import { injectedWallet } from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http } from 'wagmi';
import { celo } from 'viem/chains';

// A WalletConnect (Reown) project ID from https://cloud.reown.com unlocks QR codes and mobile wallet
// deep links. Without one, WalletConnect rejects every request, so only the browser's own wallet is
// offered (wallet in-app browsers and extensions like MetaMask).
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export const walletConnectEnabled = Boolean(projectId && projectId !== 'placeholder');

export const wagmiConfig = walletConnectEnabled
  ? getDefaultConfig({ appName: 'Xurri', projectId: projectId!, chains: [celo], ssr: true })
  : createConfig({
      chains: [celo],
      transports: { [celo.id]: http() },
      ssr: true,
      connectors: connectorsForWallets([{ groupName: 'Your wallet', wallets: [injectedWallet] }], {
        appName: 'Xurri',
        projectId: 'unused',
      }),
    });
