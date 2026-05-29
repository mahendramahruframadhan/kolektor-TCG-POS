/**
 * Simple performance tracker for login and transaction times.
 * Stores last 5 measurements in localStorage.
 */

const LOGIN_KEY = "kolekta-perf-login";
const TX_KEY = "kolekta-perf-transaction";
const LAST_QUERY_KEY = "kolekta-perf-last-query";
const LAST_API_KEY = "kolekta-perf-last-api";
const MAX_ENTRIES = 5;

function pushMeasurement(key: string, ms: number) {
  try {
    const raw = localStorage.getItem(key);
    const arr: number[] = raw ? JSON.parse(raw) : [];
    arr.push(ms);
    while (arr.length > MAX_ENTRIES) arr.shift();
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    // Ignore
  }
}

export function trackLoginTime(ms: number) {
  pushMeasurement(LOGIN_KEY, ms);
}

export function trackTransactionTime(ms: number) {
  pushMeasurement(TX_KEY, ms);
}

export function trackQueryTime(ms: number) {
  localStorage.setItem(LAST_QUERY_KEY, String(ms));
}

export function trackApiTime(ms: number) {
  localStorage.setItem(LAST_API_KEY, String(ms));
}
