import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// vitest 4 + jsdom 29: --localstorage-file warning causes window.localStorage
// to be a broken empty object with no methods. Replace it with a working
// in-memory implementation.
const makeLocalStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };
};

Object.defineProperty(window, "localStorage", {
  value: makeLocalStorage(),
  writable: true,
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
