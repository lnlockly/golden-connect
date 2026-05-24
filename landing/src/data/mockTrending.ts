// Trending agents list for the left card on the dashboard.

export interface TrendingAgent {
  id: string;
  name: string;
  ticker: string;
  avatar: string; // emoji
  mcap: number; // in USD
  change_24h: number; // percent
}

export const MOCK_TRENDING: TrendingAgent[] = [
  { id: 't1', name: 'Helios Wealth',  ticker: 'HLS',  avatar: '☀️', mcap: 41_300_000, change_24h: 142.9 },
  { id: 't2', name: 'Astra Recruiter',ticker: 'ASTR', avatar: '🧑‍🚀', mcap: 27_800_000, change_24h: 108.5 },
  { id: 't3', name: 'Orbital Trader', ticker: 'ORBT', avatar: '🛰️', mcap: 14_820_000, change_24h:  82.4 },
  { id: 't4', name: 'Forge DevRel',   ticker: 'FRG',  avatar: '🔨', mcap: 18_720_000, change_24h:  61.8 },
  { id: 't5', name: 'Kestrel Ops',    ticker: 'KST',  avatar: '🦅', mcap: 11_050_000, change_24h:  38.2 },
  { id: 't6', name: 'Cinder Studio',  ticker: 'CNDR', avatar: '🔥', mcap: 22_600_000, change_24h:  14.7 },
];
