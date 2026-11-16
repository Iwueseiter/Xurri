import { Magic } from 'magic-sdk';
import { chainConfig } from '@/lib/chain/config';

let _magic: Magic | null = null;

/**
 * Returns a singleton Magic client instance, set up for Celo so email players' Magic wallets send
 * their game transactions (and pay gas) on the same network as everyone else.
 * Must only be called in browser context ('use client' components).
 */
export function getMagic(): Magic {
  if (!_magic) {
    const key = process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY;
    if (!key) throw new Error('NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY is not set.');
    _magic = new Magic(key, { network: { rpcUrl: chainConfig.rpcUrl, chainId: chainConfig.chain.id } });
  }
  return _magic;
}
