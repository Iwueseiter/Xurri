import { createPublicClient, http, parseEventLogs, type Hash } from 'viem';
import { playsAbi } from '@/lib/chain/abi';
import { chainConfig } from '@/lib/chain/config';

const publicClient = createPublicClient({ chain: chainConfig.chain, transport: http(chainConfig.rpcUrl) });

/** True when transaction `hash` is a successful XurriPlays `startGame()` sent by `player` itself. */
export async function isPaidPlay(hash: Hash, player: string) {
  if (!chainConfig.playsAddress) return false;
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 }).catch(() => null);
  if (!receipt || receipt.status !== 'success') return false;
  return parseEventLogs({ abi: playsAbi, eventName: 'GamePlayed', logs: receipt.logs }).some(
    (event) =>
      event.address.toLowerCase() === chainConfig.playsAddress!.toLowerCase() && event.args.player.toLowerCase() === player.toLowerCase(),
  );
}
