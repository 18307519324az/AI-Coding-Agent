import { describe, expect, it } from "vitest";
import { calculateTotal } from "./calculate-total";

describe("calculateTotal", () => {
  it("multiplies price by quantity", () => {
    expect(calculateTotal([{ price: 5, quantity: 3 }])).toBe(15);
  });
});
