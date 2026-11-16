import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'GoodDollar face verification · Xurri',
  description: 'Learn how GoodDollar face verification works and why it is required to claim daily G$.',
};

export default function GoodDollarVerificationPage() {
  return (
    <LegalPage title="Why GoodDollar asks for face verification" updated="14 November 2026">
      <p>
        GoodDollar uses face verification to help make sure daily universal basic income (UBI) reaches real,
        unique people. It helps protect the system from duplicate claims while keeping access to G$ open to
        everyone who qualifies.
      </p>

      <h2>How to verify and claim G$</h2>
      <ol>
        <li>
          <strong>Complete a face scan.</strong> Sign in to Xurri, open the <Link href="/?tab=rewards">Rewards</Link> tab
          and tap <strong>Verify your face</strong>. Your wallet signs one message so GoodDollar knows which wallet to
          verify, then GoodDollar’s face scan opens (at goodid.gooddollar.org) and brings you back to Xurri when you’re
          done.
        </li>
        <li>
          <strong>Claim your G$ every day.</strong> Back in Rewards, tap <strong>Claim today’s G$</strong>. Claim on
          days in a row to build your streak.
        </li>
        <li>
          <strong>Verify again when asked.</strong> GoodDollar may ask you to repeat the scan every 14 days so it can
          confirm that the same person is still claiming.
        </li>
      </ol>

      <h2>What happens during the scan?</h2>
      <p>
        GoodDollar uses FaceTec ZoOm technology. FaceTec says its brief video scan creates a 3D FaceMap used to check
        that a person is present (liveness) and to help prevent duplicate identities. GoodDollar selected the system
        for its accuracy and continued development. Verification is handled by GoodDollar, not Xurri.
      </p>

      <h2>Your face data</h2>
      <p>
        Xurri does not receive or store your face scan. For details about how the scan and FaceMap are processed or
        retained, review the privacy information provided by{' '}
        <a href="https://www.gooddollar.org/" target="_blank" rel="noreferrer">
          GoodDollar
        </a>{' '}
        and{' '}
        <a href="https://www.facetec.com/" target="_blank" rel="noreferrer">
          FaceTec
        </a>
        .
      </p>

      <p>
        Ready? <Link href="/?tab=rewards">Go to Xurri Rewards</Link> and tap <strong>Verify your face</strong>.
      </p>
    </LegalPage>
  );
}
