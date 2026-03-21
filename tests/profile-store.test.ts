import { describe, test, expect, beforeEach } from "bun:test";
import { createDatabase } from "../src/services/database";
import { createProfileStore } from "../src/services/profile-store";
import type { UserProfile, ProfilePreference } from "../src/types";

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "profile-1",
    preferences: [],
    patterns: [],
    workflows: [],
    version: 1,
    lastAnalyzedAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("ProfileStore", () => {
  let db: ReturnType<typeof createDatabase>;
  let store: ReturnType<typeof createProfileStore>;

  beforeEach(() => {
    db = createDatabase(":memory:", 0);
    store = createProfileStore(db);
  });

  describe("getProfile", () => {
    test("returns null when no profile exists", () => {
      expect(store.getProfile()).toBeNull();
    });

    test("returns saved profile", () => {
      const profile = makeProfile({ id: "p1" });
      store.saveProfile(profile);
      const result = store.getProfile();
      expect(result).not.toBeNull();
      expect(result!.id).toBe("p1");
    });
  });

  describe("saveProfile", () => {
    test("creates a new profile", () => {
      const profile = makeProfile();
      store.saveProfile(profile);
      expect(store.getProfile()).not.toBeNull();
    });

    test("round-trips profile data correctly", () => {
      const pref: ProfilePreference = {
        key: "language",
        value: "TypeScript",
        confidence: 0.9,
        evidence: ["I prefer TypeScript"],
        updatedAt: 1000,
      };
      const profile = makeProfile({ preferences: [pref] });
      store.saveProfile(profile);
      const result = store.getProfile();
      expect(result!.preferences).toHaveLength(1);
      expect(result!.preferences[0].key).toBe("language");
      expect(result!.preferences[0].confidence).toBe(0.9);
    });

    test("overwrites existing profile on re-save", () => {
      store.saveProfile(makeProfile({ id: "p1", version: 1 }));
      store.saveProfile(makeProfile({ id: "p1", version: 2 }));
      expect(store.getProfile()!.version).toBe(2);
    });
  });

  describe("mergeProfile", () => {
    test("creates profile when none exists", () => {
      const extracted = {
        preferences: [{ key: "lang", value: "TS", confidence: 0.8, evidence: [], updatedAt: Date.now() }],
        patterns: [],
        workflows: [],
      };
      const result = store.mergeProfile(extracted);
      expect(result.preferences).toHaveLength(1);
    });

    test("high confidence wins over low confidence", () => {
      const existing = makeProfile({
        preferences: [{ key: "lang", value: "JS", confidence: 0.5, evidence: [], updatedAt: 1000 }],
      });
      store.saveProfile(existing);
      const extracted = {
        preferences: [{ key: "lang", value: "TS", confidence: 0.9, evidence: [], updatedAt: Date.now() }],
        patterns: [],
        workflows: [],
      };
      const result = store.mergeProfile(extracted);
      const pref = result.preferences.find(p => p.key === "lang");
      expect(pref!.value).toBe("TS");
      expect(pref!.confidence).toBe(0.9);
    });

    test("low confidence does NOT override high confidence", () => {
      const existing = makeProfile({
        preferences: [{ key: "lang", value: "TS", confidence: 0.9, evidence: [], updatedAt: 1000 }],
      });
      store.saveProfile(existing);
      const extracted = {
        preferences: [{ key: "lang", value: "JS", confidence: 0.3, evidence: [], updatedAt: Date.now() }],
        patterns: [],
        workflows: [],
      };
      const result = store.mergeProfile(extracted);
      const pref = result.preferences.find(p => p.key === "lang");
      expect(pref!.value).toBe("TS"); // original wins
    });

    test("adds new preferences that don't exist", () => {
      const existing = makeProfile({
        preferences: [{ key: "lang", value: "TS", confidence: 0.9, evidence: [], updatedAt: 1000 }],
      });
      store.saveProfile(existing);
      const extracted = {
        preferences: [{ key: "style", value: "functional", confidence: 0.7, evidence: [], updatedAt: Date.now() }],
        patterns: [],
        workflows: [],
      };
      const result = store.mergeProfile(extracted);
      expect(result.preferences).toHaveLength(2);
    });
  });

  describe("deletePreference", () => {
    test("returns true when preference exists and is deleted", () => {
      const profile = makeProfile({
        preferences: [{ key: "lang", value: "TS", confidence: 0.9, evidence: [], updatedAt: 1000 }],
      });
      store.saveProfile(profile);
      expect(store.deletePreference("lang")).toBe(true);
      expect(store.getProfile()!.preferences).toHaveLength(0);
    });

    test("returns false when preference does not exist", () => {
      store.saveProfile(makeProfile());
      expect(store.deletePreference("nonexistent")).toBe(false);
    });

    test("returns false when no profile exists", () => {
      expect(store.deletePreference("lang")).toBe(false);
    });
  });

  describe("deletePattern", () => {
    test("returns true when pattern exists and is deleted", () => {
      const profile = makeProfile({
        patterns: [{ key: "tdd", description: "Test-first", frequency: 5, lastSeen: 1000 }],
      });
      store.saveProfile(profile);
      expect(store.deletePattern("tdd")).toBe(true);
      expect(store.getProfile()!.patterns).toHaveLength(0);
    });

    test("returns false when pattern does not exist", () => {
      store.saveProfile(makeProfile());
      expect(store.deletePattern("nonexistent")).toBe(false);
    });
  });

  describe("deleteWorkflow", () => {
    test("returns true when workflow exists and is deleted", () => {
      const profile = makeProfile({
        workflows: [{ name: "deploy", steps: ["build", "test", "push"], frequency: 3, lastSeen: 1000 }],
      });
      store.saveProfile(profile);
      expect(store.deleteWorkflow("deploy")).toBe(true);
      expect(store.getProfile()!.workflows).toHaveLength(0);
    });

    test("returns false when workflow does not exist", () => {
      store.saveProfile(makeProfile());
      expect(store.deleteWorkflow("nonexistent")).toBe(false);
    });
  });

  describe("resetProfile", () => {
    test("clears all profile data", () => {
      store.saveProfile(makeProfile({ preferences: [{ key: "lang", value: "TS", confidence: 0.9, evidence: [], updatedAt: 1000 }] }));
      store.resetProfile();
      expect(store.getProfile()).toBeNull();
    });

    test("clears changelog data", () => {
      store.saveProfile(makeProfile());
      store.addChangelog({ id: "cl1", profileId: "singleton", changeType: "add", field: "lang", oldValue: null, newValue: "TS", timestamp: Date.now() });
      store.resetProfile();
      expect(store.getChangelog()).toHaveLength(0);
    });
  });

  describe("changelog", () => {
    test("addChangelog records an entry", () => {
      store.addChangelog({
        id: "cl1",
        profileId: "singleton",
        changeType: "add",
        field: "lang",
        oldValue: null,
        newValue: "TS",
        timestamp: Date.now(),
      });
      expect(store.getChangelog()).toHaveLength(1);
    });

    test("getChangelog returns entries in insertion order", () => {
      store.addChangelog({ id: "cl1", profileId: "singleton", changeType: "add", field: "a", oldValue: null, newValue: "1", timestamp: 1000 });
      store.addChangelog({ id: "cl2", profileId: "singleton", changeType: "add", field: "b", oldValue: null, newValue: "2", timestamp: 2000 });
      const log = store.getChangelog();
      expect(log).toHaveLength(2);
    });

    test("getChangelog respects limit", () => {
      for (let i = 0; i < 5; i++) {
        store.addChangelog({ id: `cl${i}`, profileId: "singleton", changeType: "add", field: `f${i}`, oldValue: null, newValue: `${i}`, timestamp: i * 1000 });
      }
      expect(store.getChangelog(2)).toHaveLength(2);
    });
  });
});
