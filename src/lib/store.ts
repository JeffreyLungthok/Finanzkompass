/**
 * Kleiner globaler Zustand: der aktive Plan, gespeichert im Browser (localStorage).
 * Es werden keine Daten an einen Server geschickt.
 */
import { useSyncExternalStore } from 'react';
import { createDefaultPlan, type Plan } from '../engine/plan';
import type { JourneyState } from '../engine/journey';
import { normalizePlan } from './planIO';

const KEY = 'finanzkompass.plan.v1';
const JOURNEY_KEY = 'finanzkompass.journey.v1';

export interface AppState {
  plan: Plan;
  journey: JourneyState | null;
  /** Hat der Nutzer schon Daten erfasst? */
  started: boolean;
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    const jr = localStorage.getItem(JOURNEY_KEY);
    if (raw) {
      return { plan: normalizePlan(JSON.parse(raw)), journey: jr ? JSON.parse(jr) : null, started: true };
    }
  } catch {
    /* Speicher nicht verfügbar */
  }
  return { plan: createDefaultPlan(), journey: null, started: false };
}

let state: AppState = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      if (state.started) localStorage.setItem(KEY, JSON.stringify(state.plan));
      if (state.journey) localStorage.setItem(JOURNEY_KEY, JSON.stringify(state.journey));
      else localStorage.removeItem(JOURNEY_KEY);
    } catch {
      /* ignorieren */
    }
  }, 300);
}

function emit() {
  for (const l of listeners) l();
  persist();
}

export function getState() {
  return state;
}

export function updatePlan(updater: (p: Plan) => Plan) {
  const next = updater(state.plan);
  state = { ...state, plan: { ...next, updatedAt: new Date().toISOString() }, started: true };
  emit();
}

export function replacePlan(plan: Plan, journey: JourneyState | null = null) {
  state = { plan: normalizePlan(plan), journey, started: true };
  emit();
}

export function setJourney(journey: JourneyState | null) {
  state = { ...state, journey };
  emit();
}

export function resetAll() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(JOURNEY_KEY);
  } catch {
    /* ignorieren */
  }
  state = { plan: createDefaultPlan(), journey: null, started: false };
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function usePlan(): Plan {
  return useAppState().plan;
}
