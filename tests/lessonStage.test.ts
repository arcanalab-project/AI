import { beforeEach, describe, expect, it } from "vitest";
import { evolveOfflineLesson, listOfflineTables, resetOfflineLesson, revertOfflineLesson } from "@/lib/lessonOffline";
import { giuliaBusiness, projectLesson, visibleTableNames } from "@/lib/lessonStage";

describe("progressive lesson", () => {
  beforeEach(() => {
    resetOfflineLesson();
  });

  it("scene 1 is one profile table and the same document fields", () => {
    const stage = projectLesson(1);
    expect(visibleTableNames(stage)).toEqual(["users"]);
    expect(stage.countsLabel).toBe("1 table · 1 row · 1 document");
    expect(stage.documents[0].value).not.toHaveProperty("photos");
    expect(stage.documents[0].value).not.toHaveProperty("settings");
    expect(stage.documents[0].value).not.toHaveProperty("subscription");
    expect(stage.countsLabel).not.toMatch(/nine/i);
    const both = giuliaBusiness(stage);
    expect(both.fromDocument).toEqual(both.fromTables);
  });

  it("scene 2 adds photo and interest rows, not preferences", () => {
    const stage = projectLesson(2);
    expect(visibleTableNames(stage)).toEqual(["users", "user_photos", "user_interests"]);
    expect(stage.documents[0].value).toHaveProperty("photos");
    expect(stage.documents[0].value).not.toHaveProperty("settings");
    const both = giuliaBusiness(stage);
    expect(both.fromDocument).toEqual(both.fromTables);
  });

  it("scene 3 adds preferences and scene 4 adds only the current plan", () => {
    const prefs = projectLesson(3);
    expect(visibleTableNames(prefs)).toContain("user_settings");
    expect(visibleTableNames(prefs)).not.toContain("subscriptions");
    const plan = projectLesson(4);
    expect(visibleTableNames(plan)).toContain("subscriptions");
    expect(visibleTableNames(plan)).not.toContain("subscription_history");
    expect(plan.documents[0].value).not.toHaveProperty("subscriptionHistory");
    expect(JSON.stringify(plan.tables)).not.toMatch(/subscription_history/);
    expect(JSON.stringify(plan.documents)).not.toMatch(/subscription_history/);
    expect(giuliaBusiness(plan).fromDocument).toEqual(giuliaBusiness(plan).fromTables);
  });

  it("keeps business facts equal on every scene before extensions", () => {
    for (const scene of [1, 2, 3, 4, 5, 8]) {
      const stage = projectLesson(scene);
      const both = giuliaBusiness(stage);
      expect(both.fromDocument, `scene ${scene}`).toEqual(both.fromTables);
    }
  });

  it("pronouns are optional, repeatable, and absent on Francesca", () => {
    const before = projectLesson(6, { revealExtension: false });
    expect(before.documents[0].value).not.toHaveProperty("pronouns");
    expect(before.documents[1].who).toMatch(/Francesca/);
    evolveOfflineLesson("pronouns");
    evolveOfflineLesson("pronouns");
    const after = projectLesson(6, { revealExtension: true });
    expect(after.documents[0].value.pronouns).toBe("she/her");
    expect(after.documents[1].value).not.toHaveProperty("pronouns");
    const francescaRow = after.tables[0].rows.find((r) => String(r.display_name).includes("Francesca"));
    expect(francescaRow?.pronouns).toBeNull();
    expect(giuliaBusiness(after).fromDocument).toEqual(giuliaBusiness(after).fromTables);
    revertOfflineLesson("pronouns");
    expect(projectLesson(6).documents[0].value).not.toHaveProperty("pronouns");
  });

  it("hobbies are a new structure and do not duplicate", () => {
    evolveOfflineLesson("hobbies");
    evolveOfflineLesson("hobbies");
    const stage = projectLesson(7, { revealExtension: true });
    expect(visibleTableNames(stage)).toContain("user_hobbies");
    expect(listOfflineTables(1).user_hobbies).toHaveLength(2);
    expect(stage.documents[0].value.hobbies).toEqual(["climbing", "jazz"]);
    expect(stage.documents[1].value).not.toHaveProperty("hobbies");
    expect(stage.documents[0].value.interests).not.toEqual(stage.documents[0].value.hobbies);
    expect(giuliaBusiness(stage).fromDocument).toEqual(giuliaBusiness(stage).fromTables);
  });

  it("scene 8 keeps history out of the profile document", () => {
    const stage = projectLesson(8);
    expect(stage.documents[0].value).not.toHaveProperty("subscriptionHistory");
    expect(stage.history?.rows.length).toBeGreaterThan(0);
    expect(stage.eventCompare?.onlyOnEvent).toEqual(["city", "description"]);
    expect(stage.countsLabel).not.toMatch(/9 tables/);
  });
});
