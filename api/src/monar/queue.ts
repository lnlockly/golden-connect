// Single global queue ("единая командная цепочка Monar") of business places.
// Pure state-machine functions. Persistence is done in routes.ts / repos.

import { LOT_SPECS, LotUsd, PLACE_COST_CENTS } from './rules.js';

export type PlaceKind = 'business' | 'technical';

export interface QueuePlace {
  id: number;
  ownerUserId: number | null;   // null = technical place (system-owned)
  kind: PlaceKind;
  lotId: number;                // parent lot
  cycle: number;                // increments each time the place re-enters tail
  entriesReceived: 0 | 1 | 2;   // 0..2; 2 means closed, will spawn new place
  position: number;             // FIFO position; lower = closer to head
  joinedAt: number;             // unix ms
}

export interface QueueState {
  places: QueuePlace[];
  nextPlaceId: number;
}

// Build initial queue places when a user activates a new lot.
// Returns the new places to push at the tail of the global queue.
export function placesForNewLot(
  lotId: number,
  ownerUserId: number,
  lotUsd: LotUsd,
  startingPosition: number,
  startingPlaceId: number,
  now: number,
): QueuePlace[] {
  const spec = LOT_SPECS[lotUsd];
  const out: QueuePlace[] = [];
  let id = startingPlaceId;
  let pos = startingPosition;

  for (let i = 0; i < spec.businessPlaces; i++) {
    out.push({
      id: id++,
      ownerUserId,
      kind: 'business',
      lotId,
      cycle: 0,
      entriesReceived: 0,
      position: pos++,
      joinedAt: now,
    });
  }
  for (let i = 0; i < spec.technicalLots; i++) {
    out.push({
      id: id++,
      ownerUserId: null,
      kind: 'technical',
      lotId,
      cycle: 0,
      entriesReceived: 0,
      position: pos++,
      joinedAt: now,
    });
  }
  return out;
}

// Apply a single $10 entry to the head place. Returns the head (now modified)
// and whether the place is "closed" (entriesReceived === 2 → respawn at tail).
export interface AdvanceResult {
  consumedPlaceId: number;
  closed: boolean;       // place closed → spawn new place at tail
  entryIndex: 1 | 2;
}

export function advanceHead(state: QueueState): AdvanceResult | null {
  const head = state.places[0];
  if (!head) return null;
  if (head.entriesReceived >= 2) {
    // Place already closed; caller should have spawned + shifted. Treat as no-op.
    return null;
  }
  head.entriesReceived = (head.entriesReceived + 1) as 0 | 1 | 2;
  const entryIndex = head.entriesReceived as 1 | 2;
  const closed = head.entriesReceived === 2;
  return {
    consumedPlaceId: head.id,
    closed,
    entryIndex,
  };
}

// Move the head place to the tail (called when entriesReceived === 2).
// Increments cycle, resets entriesReceived, assigns new position.
export function respawnHeadAtTail(state: QueueState, now: number): QueuePlace | null {
  const head = state.places.shift();
  if (!head) return null;
  const tailPos = (state.places[state.places.length - 1]?.position ?? -1) + 1;
  const respawned: QueuePlace = {
    ...head,
    cycle: head.cycle + 1,
    entriesReceived: 0,
    position: tailPos,
    joinedAt: now,
  };
  state.places.push(respawned);
  return respawned;
}

export function depth(state: QueueState): number {
  return state.places.length;
}

export function headOf(state: QueueState): QueuePlace | undefined {
  return state.places[0];
}

// Did the user's lot close? Lot closes when all the user's business places
// from this lot have completed `cyclesToClose` cycles.
export function isLotClosed(
  state: QueueState,
  lotId: number,
  ownerUserId: number,
  lotUsd: LotUsd,
): boolean {
  const spec = LOT_SPECS[lotUsd];
  const myPlaces = state.places.filter(
    p => p.lotId === lotId && p.ownerUserId === ownerUserId && p.kind === 'business',
  );
  if (myPlaces.length < spec.businessPlaces) return false;
  return myPlaces.every(p => p.cycle >= spec.cyclesToClose);
}

// Convenience: dollar value of expected income for the current cycle on a lot.
// (PARTICIPANT_PCT_PER_PLACE_ENTRY of $10 × number of business places per cycle.)
export function expectedIncomePerCycleCents(lotUsd: LotUsd): number {
  const spec = LOT_SPECS[lotUsd];
  return spec.businessPlaces * Math.trunc((PLACE_COST_CENTS * 60) / 100);
}
