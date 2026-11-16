import { createPublicClient, http, parseEventLogs, type Hash } from 'viem';
import { ubiAbi } from '@/lib/chain/abi';
import { chainConfig } from '@/lib/chain/config';

const publicClient = createPublicClient({ chain: chainConfig.chain, transport: http(chainConfig.rpcUrl) });

/**
 * GoodDollar's day number (UBIScheme `currentDay`) of transaction `hash`, when it is a successful daily
 * G$ claim by `player` itself; otherwise null.
 */
export async function ubiClaimDay(hash: Hash, player: string): Promise<number | null> {
  const ubi = chainConfig.ubiAddress;
  if (!ubi) return null;
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 }).catch(() => null);
  if (!receipt || receipt.status !== 'success') return null;
  const claimed = parseEventLogs({ abi: ubiAbi, eventName: 'UBIClaimed', logs: receipt.logs }).some(
    (event) => event.address.toLowerCase() === ubi.toLowerCase() && event.args.claimer.toLowerCase() === player.toLowerCase(),
  );
  if (!claimed) return null;
  const day = await publicClient
    .readContract({ address: ubi, abi: ubiAbi, functionName: 'currentDay', blockNumber: receipt.blockNumber })
    .catch(() => null);
  return day === null ? null : Number(day);
}
