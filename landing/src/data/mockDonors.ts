// Weekly top donors for the middle card on the dashboard.
// "Donor" here = airdrop recipient / contributor (matches virtuals.io framing).

export interface TopDonor {
  id: string;
  name: string;
  avatar: string; // emoji
  airdrop_usd: number;
  airdrop_pct: number; // percent of total airdrop
}

export const MOCK_DONORS: TopDonor[] = [
  { id: 'd1', name: 'flowwhale.eth',    avatar: '🐋', airdrop_usd: 82_400, airdrop_pct: 12.4 },
  { id: 'd2', name: '0xAgentRunner',    avatar: '🏃', airdrop_usd: 61_200, airdrop_pct:  9.2 },
  { id: 'd3', name: 'vault.flow',       avatar: '🏦', airdrop_usd: 48_700, airdrop_pct:  7.3 },
  { id: 'd4', name: 'Nadia K.',         avatar: '👩‍💼', airdrop_usd: 34_100, airdrop_pct:  5.1 },
  { id: 'd5', name: 'rocket42',         avatar: '🚀', airdrop_usd: 27_600, airdrop_pct:  4.1 },
  { id: 'd6', name: 'mirror.labs',      avatar: '🪞', airdrop_usd: 19_900, airdrop_pct:  3.0 },
];
