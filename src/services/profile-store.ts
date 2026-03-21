import type { Database } from "bun:sqlite";
import type {
  UserProfile,
  ProfilePreference,
  ProfilePattern,
  ProfileWorkflow,
  ProfileChangelog,
} from "../types.js";

export interface ProfileStore {
  getProfile(): UserProfile | null;
  saveProfile(profile: UserProfile): void;
  mergeProfile(extracted: {
    preferences: ProfilePreference[];
    patterns: ProfilePattern[];
    workflows: ProfileWorkflow[];
  }): UserProfile;
  deletePreference(key: string): boolean;
  deletePattern(key: string): boolean;
  deleteWorkflow(name: string): boolean;
  resetProfile(): void;
  addChangelog(entry: ProfileChangelog): void;
  getChangelog(limit?: number): ProfileChangelog[];
}

const PROFILE_ID = "singleton";

export function createProfileStore(db: Database): ProfileStore {
  function getProfile(): UserProfile | null {
    const row = db
      .query<{ profile_data: string }, [string]>(
        "SELECT profile_data FROM user_profiles WHERE id = ? LIMIT 1"
      )
      .get(PROFILE_ID);
    if (!row) return null;
    return JSON.parse(row.profile_data) as UserProfile;
  }

  function saveProfile(profile: UserProfile): void {
    const now = Date.now();
    db.query(
      "INSERT OR REPLACE INTO user_profiles (id, profile_data, version, last_analyzed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      PROFILE_ID,
      JSON.stringify(profile),
      profile.version,
      profile.lastAnalyzedAt,
      profile.createdAt,
      now
    );
  }

  function mergeProfile(extracted: {
    preferences: ProfilePreference[];
    patterns: ProfilePattern[];
    workflows: ProfileWorkflow[];
  }): UserProfile {
    const existing = getProfile();
    const now = Date.now();

    if (!existing) {
      const newProfile: UserProfile = {
        id: PROFILE_ID,
        preferences: extracted.preferences,
        patterns: extracted.patterns,
        workflows: extracted.workflows,
        version: 1,
        lastAnalyzedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      saveProfile(newProfile);
      return newProfile;
    }

    const prefMap = new Map<string, ProfilePreference>();
    for (const p of existing.preferences) prefMap.set(p.key, p);
    for (const p of extracted.preferences) {
      const cur = prefMap.get(p.key);
      if (!cur || p.confidence > cur.confidence) prefMap.set(p.key, p);
    }

    const patMap = new Map<string, ProfilePattern>();
    for (const p of existing.patterns) patMap.set(p.key, p);
    for (const p of extracted.patterns) {
      const cur = patMap.get(p.key);
      if (cur) {
        patMap.set(p.key, {
          ...cur,
          frequency: cur.frequency + p.frequency,
          lastSeen: Math.max(cur.lastSeen, p.lastSeen),
        });
      } else {
        patMap.set(p.key, p);
      }
    }

    const wfMap = new Map<string, ProfileWorkflow>();
    for (const w of existing.workflows) wfMap.set(w.name, w);
    for (const w of extracted.workflows) {
      const cur = wfMap.get(w.name);
      if (cur) {
        wfMap.set(w.name, {
          ...cur,
          frequency: cur.frequency + w.frequency,
          lastSeen: Math.max(cur.lastSeen, w.lastSeen),
        });
      } else {
        wfMap.set(w.name, w);
      }
    }

    const merged: UserProfile = {
      ...existing,
      preferences: Array.from(prefMap.values()),
      patterns: Array.from(patMap.values()),
      workflows: Array.from(wfMap.values()),
      version: existing.version + 1,
      lastAnalyzedAt: now,
      updatedAt: now,
    };
    saveProfile(merged);
    return merged;
  }

  function deletePreference(key: string): boolean {
    const profile = getProfile();
    if (!profile) return false;
    const idx = profile.preferences.findIndex((p) => p.key === key);
    if (idx === -1) return false;
    profile.preferences.splice(idx, 1);
    profile.updatedAt = Date.now();
    saveProfile(profile);
    return true;
  }

  function deletePattern(key: string): boolean {
    const profile = getProfile();
    if (!profile) return false;
    const idx = profile.patterns.findIndex((p) => p.key === key);
    if (idx === -1) return false;
    profile.patterns.splice(idx, 1);
    profile.updatedAt = Date.now();
    saveProfile(profile);
    return true;
  }

  function deleteWorkflow(name: string): boolean {
    const profile = getProfile();
    if (!profile) return false;
    const idx = profile.workflows.findIndex((w) => w.name === name);
    if (idx === -1) return false;
    profile.workflows.splice(idx, 1);
    profile.updatedAt = Date.now();
    saveProfile(profile);
    return true;
  }

  function resetProfile(): void {
    db.query("DELETE FROM user_profiles WHERE id = ?").run(PROFILE_ID);
    db.query("DELETE FROM user_profile_changelog WHERE profile_id = ?").run(
      PROFILE_ID
    );
  }

  function addChangelog(entry: ProfileChangelog): void {
    db.query(
      "INSERT INTO user_profile_changelog (id, profile_id, change_type, field, old_value, new_value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      entry.id,
      entry.profileId,
      entry.changeType,
      entry.field,
      entry.oldValue,
      entry.newValue,
      entry.timestamp
    );
  }

  function getChangelog(limit?: number): ProfileChangelog[] {
    const sql = limit
      ? "SELECT * FROM user_profile_changelog WHERE profile_id = ? ORDER BY created_at ASC LIMIT ?"
      : "SELECT * FROM user_profile_changelog WHERE profile_id = ? ORDER BY created_at ASC";

    const rows = limit
      ? db
          .query<
            {
              id: string;
              profile_id: string;
              change_type: string;
              field: string;
              old_value: string | null;
              new_value: string | null;
              created_at: number;
            },
            [string, number]
          >(sql)
          .all(PROFILE_ID, limit)
      : db
          .query<
            {
              id: string;
              profile_id: string;
              change_type: string;
              field: string;
              old_value: string | null;
              new_value: string | null;
              created_at: number;
            },
            [string]
          >(sql)
          .all(PROFILE_ID);

    return rows.map((r) => ({
      id: r.id,
      profileId: r.profile_id,
      changeType: r.change_type,
      field: r.field,
      oldValue: r.old_value,
      newValue: r.new_value,
      timestamp: r.created_at,
    }));
  }

  return {
    getProfile,
    saveProfile,
    mergeProfile,
    deletePreference,
    deletePattern,
    deleteWorkflow,
    resetProfile,
    addChangelog,
    getChangelog,
  };
}
