'use client';

import { useState } from 'react';
import { ScanFace } from 'lucide-react';
import { describeError, useWalletStore } from '@/lib/chain/wallet-store';
import { toast } from '@/lib/toast-store';

/**
 * Opens GoodDollar's face verification for the signed-in wallet. The wallet first signs GoodDollar's
 * message (that is how GoodDollar knows which wallet to verify), then GoodDollar brings the player back.
 */
export function FaceVerifyButton({ className = 'btn btn-primary btn-block' }: { className?: string }) {
  const faceVerificationUrl = useWalletStore((s) => s.faceVerificationUrl);
  const [opening, setOpening] = useState(false);

  const verify = async () => {
    setOpening(true);
    try {
      window.location.href = await faceVerificationUrl();
    } catch (error) {
      toast.error('Couldn’t open face verification', describeError(error));
      setOpening(false);
    }
  };

  return (
    <button type="button" className={className} onClick={verify} disabled={opening}>
      {opening ? <span className="spinner" /> : <ScanFace size={18} />}
      {opening ? 'Confirm in your wallet…' : 'Verify your face'}
    </button>
  );
}
