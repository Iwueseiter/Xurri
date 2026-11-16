import { createConnector } from 'wagmi';
import { getAddress, type Address } from 'viem';
import { getMagic } from '@/lib/magic';

export const MAGIC_CONNECTOR_ID = 'magic';

async function accountsOf(): Promise<readonly Address[]> {
  const accounts = await getMagic().rpcProvider.request<string[]>({ method: 'eth_accounts', params: [] });
  return accounts.map((account) => getAddress(account));
}

/** Resolves to `fallback` if Magic doesn't answer in time (offline, blocked iframe) instead of hanging. */
function withTimeout<T>(promise: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    void Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/**
 * Magic's embedded wallet as a wagmi connector. Every email gets its own wallet from Magic; once the
 * player has entered their email code, connecting just reads that wallet, and every transaction is
 * signed inside Magic's window, so no wallet app is ever opened. RainbowKit doesn't list it: email
 * players come in through the email sign-in form. Magic is only touched in the browser, lazily.
 */
export function magicConnector() {
  return createConnector((config) => ({
    id: MAGIC_CONNECTOR_ID,
    name: 'Email',
    type: 'magic',
    async connect({ withCapabilities } = {}) {
      if (!(await getMagic().user.isLoggedIn())) throw new Error('Sign in with your email first.');
      const accounts = await accountsOf();
      const chainId = config.chains[0].id;
      // The return type depends on `withCapabilities`; wagmi's own connectors narrow it the same way.
      return { accounts: (withCapabilities ? accounts.map((address) => ({ address, capabilities: {} })) : accounts) as never, chainId };
    },
    async disconnect() {
      await getMagic().user.logout();
    },
    getAccounts: () => accountsOf(),
    getChainId: async () => config.chains[0].id,
    getProvider: async () => getMagic().rpcProvider,
    async isAuthorized() {
      if (typeof window === 'undefined' || !process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY) return false;
      try {
        return await withTimeout(getMagic().user.isLoggedIn(), 8000, false);
      } catch {
        return false;
      }
    },
    onAccountsChanged(accounts) {
      if (accounts.length === 0) config.emitter.emit('disconnect');
      else config.emitter.emit('change', { accounts: accounts.map((account) => getAddress(account)) });
    },
    onChainChanged() {
      // Single network.
    },
    onDisconnect() {
      config.emitter.emit('disconnect');
    },
  }));
}
