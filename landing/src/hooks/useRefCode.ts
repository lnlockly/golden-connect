import { useEffect, useState } from 'react';

/**
 * Referral-code hook.
 *
 * Semantics:
 *   - `myCode` is THIS visitor's own referral code. Generated once on first
 *     visit, persisted in localStorage under `goldenConnect_ref_code`.
 *     When this visitor shares their link, their own code travels forward.
 *   - `invitedBy` is the code of whoever invited the current visitor,
 *     taken from the URL query string `?ref=XXXX` on first arrival.
 *     Also persisted (once) in localStorage under `goldenConnect_invited_by`
 *     so subsequent visits keep attribution.
 */
export function useRefCode(): { myCode: string; invitedBy: string | null } {
  const [state, setState] = useState<{ myCode: string; invitedBy: string | null }>(() => ({
    myCode: '',
    invitedBy: null,
  }));

  useEffect(() => {
    // Guard for SSR / non-browser.
    if (typeof window === 'undefined') return;

    // --- my own code ---
    let myCode = '';
    try {
      myCode = localStorage.getItem('goldenConnect_ref_code') || '';
    } catch {
      /* ignore */
    }
    if (!myCode) {
      myCode = generateCode();
      try {
        localStorage.setItem('goldenConnect_ref_code', myCode);
      } catch {
        /* ignore */
      }
    }

    // --- inviter ---
    let invitedBy: string | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      const urlRef = params.get('ref');
      if (urlRef && /^[A-Za-z0-9_-]{1,32}$/.test(urlRef)) {
        invitedBy = urlRef;
        localStorage.setItem('goldenConnect_invited_by', urlRef);
      } else {
        invitedBy = localStorage.getItem('goldenConnect_invited_by');
      }
    } catch {
      /* ignore */
    }

    setState({ myCode, invitedBy });
  }, []);

  return state;
}

function generateCode(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    }
  } catch {
    /* ignore */
  }
  // Fallback: timestamp + random, 8 chars.
  return (
    Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6)
  ).slice(0, 8);
}
