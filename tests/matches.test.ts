import { describe, expect, it } from "vitest";
import { pairKey, recordInteraction, type InteractionDoc, type MatchDoc } from "@/lib/matches";

class MemoryColl<T extends object> {
  docs: T[] = [];
  constructor(private keyFn: (d: T) => string) {}
  async findOne(filter: Record<string, unknown>): Promise<T | null> {
    return this.lookup(filter);
  }
  lookup(filter: Record<string, unknown>): T | null {
    return (
      this.docs.find((d) => Object.entries(filter).every(([k, v]) => (d as Record<string, unknown>)[k] === v)) ??
      null
    );
  }
  async updateOne(filter: Record<string, unknown>, update: { $setOnInsert?: T }) {
    const existing = this.lookup(filter);
    if (existing) return { matchedCount: 1, upsertedCount: 0 };
    if (update.$setOnInsert) {
      const key = this.keyFn(update.$setOnInsert);
      if (this.docs.some((d) => this.keyFn(d) === key)) {
        return { matchedCount: 1, upsertedCount: 0 };
      }
      this.docs.push(update.$setOnInsert);
      return { matchedCount: 0, upsertedCount: 1 };
    }
    return { matchedCount: 0, upsertedCount: 0 };
  }
}

describe("matches", () => {
  it("pairKey is order-independent", () => {
    expect(pairKey("giulia", "luca")).toBe(pairKey("luca", "giulia"));
    expect(pairKey("giulia", "luca")).toBe("giulia|luca");
  });

  it("repeated likes do not duplicate", async () => {
    const interactions = new MemoryColl<InteractionDoc>((d) => `${d.datasetId}:${d.fromProfileId}:${d.toProfileId}`);
    const matches = new MemoryColl<MatchDoc>((d) => `${d.datasetId}:${d.pairKey}`);
    await recordInteraction(interactions, matches, {
      datasetId: "mvp",
      fromProfileId: "giulia",
      toProfileId: "luca",
      type: "like",
    });
    const second = await recordInteraction(interactions, matches, {
      datasetId: "mvp",
      fromProfileId: "giulia",
      toProfileId: "luca",
      type: "like",
    });
    expect(interactions.docs.length).toBe(1);
    expect(second.created).toBe(false);
  });

  it("concurrent reciprocal likes create exactly one match", async () => {
    const interactions = new MemoryColl<InteractionDoc>((d) => `${d.datasetId}:${d.fromProfileId}:${d.toProfileId}`);
    const matches = new MemoryColl<MatchDoc>((d) => `${d.datasetId}:${d.pairKey}`);
    const a = recordInteraction(interactions, matches, {
      datasetId: "mvp",
      fromProfileId: "giulia",
      toProfileId: "luca",
      type: "like",
    });
    const b = recordInteraction(interactions, matches, {
      datasetId: "mvp",
      fromProfileId: "luca",
      toProfileId: "giulia",
      type: "like",
    });
    const [ra, rb] = await Promise.all([a, b]);
    expect(matches.docs.length).toBe(1);
    expect(matches.docs[0].pairKey).toBe("giulia|luca");
    expect(Boolean(ra.match) || Boolean(rb.match)).toBe(true);
  });
});
