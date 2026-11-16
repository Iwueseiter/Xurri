import { NextResponse } from 'next/server';
import { getAddress, isAddress } from 'viem';
import { prisma } from '@/lib/prisma';
import { toSnapshot } from '@/lib/server/player';
import { findSessionPlayer, setSessionPlayer } from '@/lib/server/session';

/**
 * Wallet sign-in in one step: the player approves the connection in their wallet and is in, with no
 * signature. Such a session can play and see the leaderboard. Anything that needs proof of owning the
 * wallet (saving a score, changing the profile, collecting prizes) gets it from a wallet transaction
 * or a one-off signature at that moment.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { address?: string };
  if (!body.address || !isAddress(body.address)) return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  const address = getAddress(body.address).toLowerCase();

  let player = await prisma.player.findUnique({ where: { address } });
  if (!player) {
    // A fresh guest's progress moves to the wallet; never attach the wallet to an email or wallet account.
    const current = await findSessionPlayer();
    player =
      current && !current.address && !current.loginEmail
        ? await prisma.player.update({ where: { id: current.id }, data: { address } })
        : await prisma.player.create({ data: { address } });
  }

  await setSessionPlayer(player.id);
  return NextResponse.json(toSnapshot(player, { proven: false }));
}
