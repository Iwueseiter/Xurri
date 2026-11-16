import { create } from 'zustand';
import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  getAddress,
  http,
  numberToHex,
  type Address,
  type EIP1193Provider,
  type Hash,
} from 'viem';
import { api } from '@/lib/api';
import {
  disconnect as disconnectWagmi,
  getAccount as getWagmiAccount,
  getWalletClient as getWagmiWalletClient,
  switchChain as switchWagmiChain,
} from 'wagmi/actions';
import { erc20Abi, giftAbi, identityAbi, playsAbi, shopAbi, tournamentsAbi, ubiAbi } from '@/lib/chain/abi';
import { chainConfig } from '@/lib/chain/config';
import { getMagic } from '@/lib/magic';
import { celo } from 'viem/chains';
import { wagmiConfig } from '@/lib/wagmi-config';
import { usePlayerStore } from '@/lib/player-store';
import { SHOP_ITEMS, itemIdFor } from '@/lib/shop-catalog';


export const publicClient = createPublicClient({ chain: chainConfig.chain, transport: http(chainConfig.rpcUrl) });

export type OnChainState = {
  gdBalance: number;
  /** Native CELO, used for network fees. */
  /** CELO for network fees; null until it has been read. */
  celoBalance: number | null;
  verified: boolean;
  canClaimDaily: boolean;
  dailyAmount: number;
  nextStreak: number;
  streak: number;
  /** Tournament prizes this wallet has already collected. */
  prizesClaimed: number;
  /** G$ in the tournament prize pot. */
  pot: number;
  owned: string[];
  playsLeft: number;
};

/** The player's GoodDollar daily claim (UBI), straight from GoodDollar's own contracts. */
export type UbiState = {
  amount: number;
  verified: boolean;
  claimedToday: boolean;
  nextClaimAt: number;
};

type WalletState = {
  account: Address | null;
  status: 'idle' | 'connecting' | 'signing';
  busy: string | null; // label of the pending transaction
  hasProvider: boolean;
  chainState: OnChainState | null;
  ubi: UbiState | null;
  /** True once a UBI read finished (successfully or not), so the UI can tell loading from unavailable. */
  ubiChecked: boolean;
  init: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshChain: () => Promise<void>;
  claimDaily: () => Promise<number | null>;
  claimPrizes: () => Promise<number | null>;
  buyItem: (slug: string) => Promise<boolean>;
  boostPot: (amount: number) => Promise<boolean>;
  refreshUbi: () => Promise<void>;
  claimUbi: () => Promise<number | null>;
  startGameTx: () => Promise<Hash>;
  proveWallet: () => Promise<void>;
};

const toG = (value: bigint) => Number(formatUnits(value, chainConfig.tokenDecimals));

/** Turns wallet / contract errors into something a player can act on. */
export function describeError(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return 'You cancelled the request in your wallet.';
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const messages: Record<string, string> = {
        NotVerified: 'Do the quick face check in the GoodDollar app first.',
        AlreadyClaimedToday: 'You already opened today’s gift. Come back tomorrow!',
        TicketExpired: 'That took too long. Please try again.',
        InvalidSignature: 'Something went wrong. Please try again.',
        NothingToClaim: 'Nothing new to collect yet.',
        PayoutLimitReached: 'Lots of winners collected today. Try again tomorrow!',
        InsufficientFunds: 'The prize pot is being refilled. Try again soon.',
        ItemUnavailable: 'That item is not for sale right now.',
        AlreadyOwned: 'You already own this item.',
        EnforcedPause: 'Xurri is taking a short break. Try again soon.',
        NoPlaysLeft: 'No tournament games left today. Practice is still on!',
        ZeroAmount: 'Pick an amount first.',
      };

      const name = revert.data?.errorName;
      if (name && messages[name]) return messages[name];
    }
    if (/insufficient funds/i.test(error.message)) return 'Your wallet needs a little CELO to pay the network fee.';
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function getProvider(): EIP1193Provider | null {
  return typeof window !== 'undefined' ? ((window as { ethereum?: EIP1193Provider }).ethereum ?? null) : null;
}

let accountsListenerBound = false;

async function ensureChain(provider: EIP1193Provider) {
  const target = chainConfig.chain;
  const current = await provider.request({ method: 'eth_chainId' });
  if (Number(current) === target.id) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: numberToHex(target.id) }] });
  } catch {
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: numberToHex(target.id),
          chainName: target.name,
          nativeCurrency: target.nativeCurrency,
          rpcUrls: [chainConfig.rpcUrl],
          blockExplorerUrls: [chainConfig.explorerUrl],
        },
      ],
    });
  }
}

type TxWallet = ReturnType<typeof createWalletClient>;

/**
 * The wallet that can sign for `account`, whichever way the player signed in:
 *  1. RainbowKit (MetaMask, WalletConnect on phones, ...) through wagmi;
 *  2. Magic, for players who signed in with email (their Magic wallet);
 *  3. the browser's own wallet (window.ethereum).
 */
async function txWalletFor(account: Address): Promise<TxWallet> {
  const same = (address?: string | null) => Boolean(address && address.toLowerCase() === account.toLowerCase());

  const connected = getWagmiAccount(wagmiConfig);
  if (same(connected.address)) {
    // The RainbowKit config only knows Celo mainnet.
    if (connected.chainId !== celo.id) await switchWagmiChain(wagmiConfig, { chainId: celo.id });
    return (await getWagmiWalletClient(wagmiConfig, { chainId: celo.id, account })) as TxWallet;
  }

  if (process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY) {
    const magic = getMagic();
    if (await magic.user.isLoggedIn().catch(() => false)) {
      const info = await magic.user.getInfo().catch(() => null);
      const magicAddress = info?.wallets?.ethereum?.publicAddress ?? (info as { publicAddress?: string } | null)?.publicAddress;
      if (same(magicAddress)) {
        return createWalletClient({ account, chain: chainConfig.chain, transport: custom(magic.rpcProvider as EIP1193Provider) });
      }
    }
  }

  const provider = getProvider();
  const injectedAccounts = provider ? ((await provider.request({ method: 'eth_accounts' }).catch(() => [])) as string[]) : [];
  if (!provider || !injectedAccounts.some(same)) {
    // Never open a wallet app for an account it doesn't hold (e.g. an email player's Magic wallet).
    throw new Error('Your sign-in has expired. Sign in again to keep playing.');
  }
  await ensureChain(provider);
  return createWalletClient({ account, chain: chainConfig.chain, transport: custom(provider) });
}

async function sendTx(account: Address, request: (wallet: TxWallet) => Promise<Hash>) {
  const wallet = await txWalletFor(account);
  const hash = await request(wallet);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('That didn’t go through. Please try again.');
  return receipt;
}

const toUnits = (amount: number) => BigInt(Math.round(amount * 1000)) * 10n ** BigInt(chainConfig.tokenDecimals - 3);

/** Approves `spender` to take `amount` G$ when the current allowance is too low. */
async function approveIfNeeded(account: Address, spender: Address, amount: bigint, onBusy: (label: string) => void) {
  const allowance = await publicClient.readContract({
    address: chainConfig.tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account, spender],
  });
  if (allowance >= amount) return;
  onBusy('Allowing Xurri to use your G$');
  await sendTx(account, (wallet) =>
    wallet.writeContract({
      account,
      chain: chainConfig.chain,
      address: chainConfig.tokenAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender, amount],
    }),
  );
}

export const useWalletStore = create<WalletState>()((set, get) => ({
  account: null,
  status: 'idle',
  busy: null,
  hasProvider: false,
  chainState: null,
  ubi: null,
  ubiChecked: false,

  init: async () => {
    const provider = getProvider();
    set({ hasProvider: Boolean(provider) });

    // A signed-in player plays with the wallet on their account, however they signed in (browser
    // wallet, WalletConnect or their email's Magic wallet). Restore it after a reload; the right
    // signer is found when a transaction is sent.
    const player = usePlayerStore.getState().player;
    if (player?.address && !get().account) {
      set({ account: getAddress(player.address) });
      void get().refreshChain();
    }
    if (!provider) return;

    const accounts = (await provider.request({ method: 'eth_accounts' }).catch(() => [])) as string[];
    const current = accounts[0] ? getAddress(accounts[0]) : null;

    if (current && player?.address && player.address.toLowerCase() === current.toLowerCase()) {
      set({ account: current });
      void get().refreshChain();
    }

    if (!accountsListenerBound) {
      accountsListenerBound = true;
      provider.on?.('accountsChanged', (next: string[]) => {
        const nextAccount = next[0] ? getAddress(next[0]) : null;
        if (nextAccount === get().account) return;
        // The next successful wallet signature establishes the matching Xurri session.
        set({ account: null, chainState: null, ubi: null });
      });
    }
  },

  // One free signature, asked only when the player changes their profile on a wallet that was just connected.
  proveWallet: async () => {
    const { account } = get();
    if (!account) throw new Error('Sign in with your wallet first.');
    set({ status: 'signing' });
    try {
      const { message } = await api.nonce(account);
      const wallet = await txWalletFor(account);
      const signature = await wallet.signMessage({ account, message });
      usePlayerStore.getState().setPlayer(await api.verify(account, signature));
    } finally {
      set({ status: 'idle' });
    }
  },

  disconnect: async () => {
    await disconnectWagmi(wagmiConfig).catch(() => undefined);
    const player = await api.logout();
    usePlayerStore.getState().setPlayer(player);
    set({ account: null, chainState: null });
  },

  refreshChain: async () => {
    void get().refreshUbi();
    const { account } = get();
    if (!account) return;
    const { giftAddress, tournamentsAddress, shopAddress, tokenAddress } = chainConfig;

    const read = <T,>(promise: Promise<T>) => promise.catch(() => null);
    const [balance, celo, preview, streak, verified, playsLeft, claimed, pot, owns] = await Promise.all([
      read(publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'balanceOf', args: [account] })),
      read(publicClient.getBalance({ address: account })),
      giftAddress ? read(publicClient.readContract({ address: giftAddress, abi: giftAbi, functionName: 'preview', args: [account] })) : null,
      giftAddress ? read(publicClient.readContract({ address: giftAddress, abi: giftAbi, functionName: 'streakOf', args: [account] })) : null,
      giftAddress ? read(publicClient.readContract({ address: giftAddress, abi: giftAbi, functionName: 'isVerified', args: [account] })) : null,
      tournamentsAddress
        ? read(publicClient.readContract({ address: tournamentsAddress, abi: tournamentsAbi, functionName: 'playsLeft', args: [account] }))
        : null,
      tournamentsAddress
        ? read(publicClient.readContract({ address: tournamentsAddress, abi: tournamentsAbi, functionName: 'prizesClaimed', args: [account] }))
        : null,
      tournamentsAddress ? read(publicClient.readContract({ address: tournamentsAddress, abi: tournamentsAbi, functionName: 'potBalance' })) : null,
      shopAddress
        ? read(
            publicClient.multicall({
              allowFailure: true,
              contracts: SHOP_ITEMS.map((item) => ({
                address: shopAddress,
                abi: shopAbi,
                functionName: 'owns' as const,
                args: [account, itemIdFor(item.slug)] as const,
              })),
            }),
          )
        : null,
    ]);

    set({
      chainState: {
        gdBalance: balance === null ? 0 : toG(balance),
        celoBalance: celo === null ? null : Number(formatUnits(celo, 18)),
        verified: Boolean(verified),
        canClaimDaily: preview?.[0] ?? false,
        dailyAmount: preview ? toG(preview[1]) : 0,
        nextStreak: preview?.[2] ?? 1,
        streak: streak ?? 0,
        prizesClaimed: claimed === null ? 0 : toG(claimed),
        pot: pot === null ? 0 : toG(pot),
        playsLeft: playsLeft ?? 0,
        owned: SHOP_ITEMS.filter((_, index) => owns?.[index]?.status === 'success' && owns[index].result === true).map(
          (item) => item.slug,
        ),
      },
    });
  },

  claimDaily: async () => {
    const { account, chainState } = get();
    const gift = chainConfig.giftAddress;
    if (!account || !gift) return null;
    if (!chainState?.verified) throw new Error('Do the quick face check in the GoodDollar app first.');
    set({ busy: 'Opening your daily gift' });
    try {
      await sendTx(account, async (wallet) => {
        const { request } = await publicClient.simulateContract({ account, address: gift, abi: giftAbi, functionName: 'claim' });
        return wallet.writeContract(request);
      });
      await get().refreshChain();
      return chainState?.dailyAmount ?? 0;
    } finally {
      set({ busy: null });
    }
  },

  claimPrizes: async () => {
    const { account } = get();
    const tournaments = chainConfig.tournamentsAddress;
    if (!account || !tournaments) return null;
    set({ busy: 'Collecting your prizes' });
    try {
      const ticket = await api.voucher();
      const before = get().chainState?.prizesClaimed ?? 0;
      await sendTx(account, async (wallet) => {
        const { request } = await publicClient.simulateContract({
          account,
          address: tournaments,
          abi: tournamentsAbi,
          functionName: 'claimPrizes',
          args: [BigInt(ticket.cumulativeAmount), BigInt(ticket.deadline), ticket.signature],
        });
        return wallet.writeContract(request);
      });
      await get().refreshChain();
      return (get().chainState?.prizesClaimed ?? before) - before;
    } finally {
      set({ busy: null });
    }
  },

  buyItem: async (slug) => {
    const { account } = get();
    const shop = chainConfig.shopAddress;
    const item = SHOP_ITEMS.find((entry) => entry.slug === slug);
    if (!account || !shop || !item) return false;
    try {
      await approveIfNeeded(account, shop, toUnits(item.price), (busy) => set({ busy }));
      set({ busy: `Buying ${item.name}` });
      await sendTx(account, async (wallet) => {
        const { request } = await publicClient.simulateContract({
          account,
          address: shop,
          abi: shopAbi,
          functionName: 'buy',
          args: [itemIdFor(slug)],
        });
        return wallet.writeContract(request);
      });
      await get().refreshChain();
      return true;
    } finally {
      set({ busy: null });
    }
  },

  boostPot: async (amount) => {
    const { account } = get();
    const tournaments = chainConfig.tournamentsAddress;
    if (!account || !tournaments) return false;
    const value = toUnits(amount);
    try {
      await approveIfNeeded(account, tournaments, value, (busy) => set({ busy }));
      set({ busy: `Adding ${amount} G$ to the pot` });
      await sendTx(account, async (wallet) => {
        const { request } = await publicClient.simulateContract({
          account,
          address: tournaments,
          abi: tournamentsAbi,
          functionName: 'boost',
          args: [value],
        });
        return wallet.writeContract(request);
      });
      await get().refreshChain();
      return true;
    } finally {
      set({ busy: null });
    }
  },

  refreshUbi: async () => {
    const { account } = get();
    const { ubiAddress, identityAddress } = chainConfig;
    if (!account || !ubiAddress || !identityAddress) return set({ ubi: null, ubiChecked: true });
    try {
      const [amount, root, day, periodStart] = await Promise.all([
        publicClient.readContract({ address: ubiAddress, abi: ubiAbi, functionName: 'checkEntitlement', args: [account] }),
        publicClient.readContract({ address: identityAddress, abi: identityAbi, functionName: 'getWhitelistedRoot', args: [account] }),
        publicClient.readContract({ address: ubiAddress, abi: ubiAbi, functionName: 'currentDay' }),
        publicClient.readContract({ address: ubiAddress, abi: ubiAbi, functionName: 'periodStart' }),
      ]);
      set({
        ubi: {
          amount: toG(amount),
          verified: !/^0x0{40}$/i.test(root),
          // checkEntitlement returns 0 once today's claim has been taken
          claimedToday: amount === 0n,
          nextClaimAt: (Number(periodStart) + (Number(day) + 1) * 86400) * 1000,
        },
        ubiChecked: true,
      });
    } catch {
      set({ ubi: null, ubiChecked: true });
    }
  },

  claimUbi: async () => {
    const { account, ubi } = get();
    const ubiAddress = chainConfig.ubiAddress;
    if (!account || !ubiAddress) return null;
    if (!ubi?.verified) throw new Error('Do the quick face check in the GoodDollar app first.');
    set({ busy: 'Claiming your free G$' });
    try {
      await sendTx(account, async (wallet) => {
        const { request } = await publicClient.simulateContract({ account, address: ubiAddress, abi: ubiAbi, functionName: 'claim' });
        return wallet.writeContract(request);
      });
      await get().refreshChain();
      return ubi?.amount ?? 0;
    } finally {
      set({ busy: null });
    }
  },

  // Starts a tournament game on-chain. The player only pays the network fee.
  // Every scored game starts with this transaction. The player pays the network fee; the server only
  // saves the score once it finds the transaction on Celo.
  startGameTx: async () => {
    const { account } = get();
    const plays = chainConfig.playsAddress;
    if (!account) throw new Error('Sign in to play.');
    if (!plays) throw new Error('Games can’t be saved right now. Please try again later.');
    set({ busy: 'Saving your score' });
    try {
      const receipt = await sendTx(account, async (wallet) => {
        const { request } = await publicClient.simulateContract({ account, address: plays, abi: playsAbi, functionName: 'startGame' });
        return wallet.writeContract(request);
      });
      void get().refreshChain();
      return receipt.transactionHash;
    } finally {
      set({ busy: null });
    }
  },
}));
