import { describe, expect, test } from "bun:test";

import { withdrawalCoinsFor } from "./withdrawal-rules";

describe("Smart Coin withdrawal conversion", () => {
  test("reserves 100 coins per rupee", () => {
    expect(withdrawalCoinsFor(10)).toBe(1000);
    expect(withdrawalCoinsFor(125.5)).toBe(12550);
  });

  test("rejects amounts with fractions smaller than one paisa", () => {
    expect(() => withdrawalCoinsFor(10.001)).toThrow();
  });
});