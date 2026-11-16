import { compressToEncodedURIComponent } from 'lz-string';
import { getAddress, type Address, type Hex } from 'viem';
import { chainConfig } from '@/lib/chain/config';

/** GoodDollar's face verification app (the same link GoodDollar's own SDK builds). */
export const GOODID_URL = 'https://goodid.gooddollar.org';

/** The exact message GoodDollar asks the wallet to sign before face verification. */
export function faceVerificationMessage(account: Address) {
  return `Sign this message to request verifying your account ${getAddress(account)} and to create your own secret unique identifier for your anonymized record.
You can use this identifier in the future to delete this anonymized record.
WARNING: do not sign this message unless you trust the website/application requesting this signature.`;
}

/** The face verification link for `account`; GoodDollar sends the player back to `returnUrl` when done. */
export function faceVerificationLink(account: Address, signature: Hex, returnUrl: string) {
  const url = new URL(GOODID_URL);
  const params = {
    account: getAddress(account),
    nonce: Math.floor(Date.now() / 1000).toString(),
    fvsig: signature,
    chain: chainConfig.chain.id,
    rdu: returnUrl,
  };
  url.searchParams.append('lz', compressToEncodedURIComponent(JSON.stringify(params)));
  return url.toString();
}
