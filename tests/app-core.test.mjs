import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTimelineSegments,
  getAwakeWindowState,
  calcAge,
  calcSleepDuration,
  coalesceHistoryEntries,
  getFabStateForTab,
  getFeedReminderState,
  getHistoryEmptyState,
  getMealClockState,
  getVisibleEntries,
  normalizeCollectionItem,
  summarizeHistoryDay,
} from "../app-core.mjs";

test("normalize daily entry converts local datetime to UTC metadata", () => {
  const record = normalizeCollectionItem("dailyEntries", {
    id: "entry-1",
    type: "meal",
    time: "2026-03-14T09:30",
    who: "dad",
    mlAmount: "120",
  }, { deviceId: "device-a" });

  assert.equal(record.id, "entry-1");
  assert.equal(record.type, "meal");
  assert.equal(record.who, "dad");
  assert.equal(record.mlAmount, 120);
  assert.match(record.time, /Z$/);
  assert.equal(record.sourceDeviceId, "device-a");
  assert.ok(record.dayKey);
});

test("soft-deleted records are filtered from visible selectors", () => {
  const visible = getVisibleEntries([
    { id: "1", type: "meal", time: "2026-03-14T09:30:00.000Z", deletedAt: null },
    { id: "2", type: "meal", time: "2026-03-14T10:30:00.000Z", deletedAt: "2026-03-14T10:45:00.000Z" },
  ]);

  assert.deepEqual(visible.map((item) => item.id), ["1"]);
});

test("timeline builder handles sleep crossing midnight and open sleep blocks", () => {
  const entries = [
    { id: "wake-1", type: "wake", time: "2026-03-14T04:00:00.000Z", deletedAt: null },
    { id: "sleep-1", type: "sleep", time: "2026-03-13T22:30:00.000Z", deletedAt: null },
    { id: "sleep-2", type: "sleep", time: "2026-03-14T08:15:00.000Z", deletedAt: null },
  ];

  const result = buildTimelineSegments(entries, "2026-03-14", {
    now: new Date("2026-03-14T10:00:00.000Z"),
    nowMs: Date.parse("2026-03-14T10:00:00.000Z"),
  });

  assert.equal(result.sleepBlocks.length, 2);
  assert.equal(result.sleepBlocks[0].start, Date.parse("2026-03-13T22:30:00.000Z"));
  assert.equal(result.sleepBlocks[0].end, Date.parse("2026-03-14T04:00:00.000Z"));
  assert.equal(result.sleepBlocks[1].ongoing, true);
});

test("sleep duration ignores malformed data and reports ongoing sleep", () => {
  const ongoing = calcSleepDuration([
    { id: "1", type: "sleep", time: "2026-03-14T10:00:00.000Z", deletedAt: null },
    { id: "2", type: "wake", time: "invalid", deletedAt: null },
  ]);

  assert.equal(ongoing, "עדיין ישן");
});

test("feed reminder triggers only after non-mom meal crosses threshold", () => {
  const reminder = getFeedReminderState([
    { id: "1", type: "meal", time: "2026-03-14T06:00:00.000Z", who: "dad", deletedAt: null },
  ], Date.parse("2026-03-14T09:00:00.000Z"));

  assert.equal(reminder.visible, true);
  assert.equal(reminder.entry.id, "1");
});

test("age calculation stays stable across month boundaries", () => {
  assert.equal(calcAge("2025-09-16", "2025-09-30"), "שבועיים");
  assert.equal(calcAge("2025-09-16", "2025-10-16"), "חודש");
  assert.equal(calcAge("2025-09-16", "2026-03-16"), "6 חודשים");
});

test("history day summary counts meals, sleep, diapers, and health", () => {
  const summary = summarizeHistoryDay([
    { id: "1", type: "meal", deletedAt: null },
    { id: "2", type: "sleep", deletedAt: null },
    { id: "3", type: "wake", deletedAt: null },
    { id: "4", type: "poop", deletedAt: null },
    { id: "5", type: "pee", deletedAt: null },
    { id: "6", type: "medication", deletedAt: null },
  ]);

  assert.deepEqual(summary, {
    mealCount: 1,
    sleepEventsCount: 2,
    diaperCount: 2,
    healthCount: 1,
  });
});

test("history entries coalesce poop and pee at the same time for the same caregiver", () => {
  const entries = coalesceHistoryEntries([
    { id: "poop-1", type: "poop", who: "dad", time: "2026-03-14T09:30:00.000Z", deletedAt: null },
    { id: "pee-1", type: "pee", who: "dad", time: "2026-03-14T09:30:00.000Z", deletedAt: null },
    { id: "meal-1", type: "meal", who: "dad", time: "2026-03-14T08:00:00.000Z", deletedAt: null },
  ]);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].type, "poop-pee");
  assert.deepEqual(entries[0].groupedEntryIds, ["poop-1", "pee-1"]);
});

test("history entries do not coalesce poop and pee when caregiver differs", () => {
  const entries = coalesceHistoryEntries([
    { id: "poop-1", type: "poop", who: "dad", time: "2026-03-14T09:30:00.000Z", deletedAt: null },
    { id: "pee-1", type: "pee", who: "mom", time: "2026-03-14T09:30:00.000Z", deletedAt: null },
  ]);

  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((entry) => entry.type), ["poop", "pee"]);
});

test("history empty state returns filter-specific copy", () => {
  assert.equal(getHistoryEmptyState("food", "היום"), "אין אירועי אוכל עבור היום.");
  assert.equal(getHistoryEmptyState("diaper", "אתמול"), "אין אירועי חיתולים עבור אתמול.");
});

test("FAB state is exposed per tab from a single source of truth", () => {
  assert.deepEqual(getFabStateForTab("home"), {
    visible: true,
    label: "הוסף אירוע",
    hint: "לחץ + להוספת אירוע מפורט",
    action: "entry",
    buttonText: "+",
  });

  assert.deepEqual(getFabStateForTab("milestones"), {
    visible: true,
    label: "הוסף אבן דרך",
    hint: "לחץ + להוספת אבן דרך חדשה",
    action: "milestone",
    buttonText: "+",
  });

  assert.deepEqual(getFabStateForTab("health"), {
    visible: true,
    label: "פתח תפריט בריאות",
    hint: "לחץ + להוספת אירוע בריאות",
    action: "health-menu",
    buttonText: "+",
  });

  assert.deepEqual(getFabStateForTab("timeline"), {
    visible: false,
    label: "",
    hint: "",
    action: "none",
    buttonText: "+",
  });
});

test("meal clock tracks progress toward three hours and flags approaching state", () => {
  const mealEntry = { id: "meal-1", time: "2026-03-31T08:00:00.000Z" };

  const fresh = getMealClockState(mealEntry, Date.parse("2026-03-31T09:30:00.000Z"));
  assert.equal(fresh.status, "fresh");
  assert.equal(fresh.remainingMs, 90 * 60 * 1000);

  const approaching = getMealClockState(mealEntry, Date.parse("2026-03-31T10:35:00.000Z"));
  assert.equal(approaching.status, "approaching");
  assert.equal(approaching.remainingMs, 25 * 60 * 1000);

  const due = getMealClockState(mealEntry, Date.parse("2026-03-31T11:15:00.000Z"));
  assert.equal(due.status, "due");
  assert.equal(due.progressRatio, 1);
});

test("awake window reports current awake time or the last awake stretch before sleep", () => {
  const awake = getAwakeWindowState([
    { id: "wake-1", type: "wake", time: "2026-03-31T08:00:00.000Z", deletedAt: null },
    { id: "sleep-1", type: "sleep", time: "2026-03-31T06:00:00.000Z", deletedAt: null },
  ], Date.parse("2026-03-31T09:30:00.000Z"));

  assert.equal(awake.status, "awake");
  assert.equal(awake.context, "מאז שהתעורר");
  assert.equal(awake.durationMs, 90 * 60 * 1000);

  const asleep = getAwakeWindowState([
    { id: "sleep-2", type: "sleep", time: "2026-03-31T10:15:00.000Z", deletedAt: null },
    { id: "wake-2", type: "wake", time: "2026-03-31T07:00:00.000Z", deletedAt: null },
  ], Date.parse("2026-03-31T11:00:00.000Z"));

  assert.equal(asleep.status, "asleep");
  assert.equal(asleep.context, "לפני שנרדם");
  assert.equal(asleep.durationMs, 195 * 60 * 1000);
});
