import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createPublicClient, http, isHash, parseEventLogs, type Hash } from 'viem';
import { playsAbi, tournamentsAbi } from '@/lib/chain/abi';
import { chainConfig } from '@/lib/chain/config';
import { getTodayKey } from '@/lib/game-rules';
import { prisma } from '@/lib/prisma';
import { roundsUsedToday, toSnapshot } from '@/lib/server/player';
import { getSessionPlayer } from '@/lib/server/session';

const publicClient = createPublicClient({ chain: chainConfig.chain, transport: http(chainConfig.rpcUrl) });

/**
 * Checks that transaction `hash` is a successful game start made by `player` itself: a `GamePlayed`
 * event from XurriPlays, or a `GameStarted` from XurriTournaments. Returns the GoodDollar identity the
 * tournament counted the game for (if any), or false when the transaction doesn't qualify.
 */
async function paidGameStart(hash: Hash, player: string): Promise<{ human: string | null } | false> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 }).catch(() => null);
  if (!receipt || receipt.status !== 'success') return false;
  const from = (address: string, expected: string | null) => Boolean(expected && address.toLowerCase() === expected.toLowerCase());

  const played = parseEventLogs({ abi: playsAbi, eventName: 'GamePlayed', logs: receipt.logs }).find(
    (event) => from(event.address, chainConfig.playsAddress) && event.args.player.toLowerCase() === player,
  );
  if (played) return { human: null };

  const started = parseEventLogs({ abi: tournamentsAbi, eventName: 'GameStarted', logs: receipt.logs }).find(
    (event) => from(event.address, chainConfig.tournamentsAddress) && event.args.player.toLowerCase() === player,
  );
  return started ? { human: started.args.human.toLowerCase() } : false;
}

/**
 * Starts a round. Signed-in players can always play; a round is saved to the leaderboard only when it
 * was started with the player's own startGame transaction (they pay the network fee).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { txHash?: string };
  const player = await getSessionPlayer();
  if (!player.address) {
    return NextResponse.json({ error: 'Sign in with a wallet or email to play' }, { status: 401 });
  }

  let txHash: string | null = null;
  let root: string | null = player.identityRoot;

  // Until XurriPlays is configured, games are saved without a transaction, as before.
  if (chainConfig.playsAddress) {
    if (!body.txHash || !isHash(body.txHash)) {
      return NextResponse.json({ error: 'Start the game from your wallet to save your score.' }, { status: 400 });
    }
    if (await prisma.gameRound.findUnique({ where: { txHash: body.txHash.toLowerCase() } })) {
      return NextResponse.json({ error: 'That game was already started' }, { status: 409 });
    }
    const paid = await paidGameStart(body.txHash as Hash, player.address.toLowerCase());
    if (!paid) return NextResponse.json({ error: 'We couldn’t find your game on Celo. Please try again.' }, { status: 400 });
    txHash = body.txHash.toLowerCase();
    if (paid.human) root = paid.human;
  }
  const [round, updated] = await prisma.$transaction([
    prisma.gameRound.create({ data: { playerId: player.id, seed: randomInt(1, 2 ** 31 - 1), ranked: true, txHash } }),
    prisma.player.update({
      where: { id: player.id },
      data: { roundsDay: getTodayKey(), roundsUsed: roundsUsedToday(player) + 1, identityRoot: root },
    }),
  ]);

  return NextResponse.json({ roundId: round.id, seed: round.seed, ranked: true, player: toSnapshot(updated) });
}
