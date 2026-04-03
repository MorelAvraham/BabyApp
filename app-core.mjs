export const SCHEMA_VERSION = 2;
export const DEFAULT_BABY_NAME = "איתן אור";
export const RECENT_ENTRY_WINDOW_DAYS = 45;

export const COLLECTION_CONFIG = {
  dailyEntries: {
    field: "time",
    sort: (a, b) => safeDateMs(b.time) - safeDateMs(a.time),
  },
  tastingEntries: {
    field: "createdAt",
    sort: (a, b) => safeDateMs(b.createdAt) - safeDateMs(a.createdAt),
  },
  milestones: {
    field: "date",
    sort: (a, b) => safeDateMs(a.date) - safeDateMs(b.date),
  },
  growthEntries: {
    field: "date",
    sort: (a, b) => safeDateMs(b.date) - safeDateMs(a.date),
  },
  medicalEntries: {
    field: "date",
    sort: (a, b) => safeDateMs(b.date) - safeDateMs(a.date),
  },
  pumpingEntries: {
    field: "time",
    sort: (a, b) => safeDateMs(b.time) - safeDateMs(a.time),
  },
};

const TAB_FAB_CONFIG = Object.freeze({
  home: Object.freeze({
    visible: true,
    label: "הוסף אירוע",
    hint: "לחץ + להוספת אירוע מפורט",
    action: "entry",
    buttonText: "+",
  }),
  milestones: Object.freeze({
    visible: true,
    label: "הוסף אבן דרך",
    hint: "לחץ + להוספת אבן דרך חדשה",
    action: "milestone",
    buttonText: "+",
  }),
  tastings: Object.freeze({
    visible: true,
    label: "הוסף טעימה",
    hint: "לחץ + להוספת טעימה חדשה",
    action: "entry",
    buttonText: "+",
  }),
  health: Object.freeze({
    visible: true,
    label: "פתח תפריט בריאות",
    hint: "לחץ + להוספת אירוע בריאות",
    action: "health-menu",
    buttonText: "+",
  }),
});

export function createEmptyState() {
  return {
    babyName: DEFAULT_BABY_NAME,
    dailyEntries: [],
    tastingEntries: [],
    milestones: [],
    growthEntries: [],
    medicalEntries: [],
    pumpingEntries: [],
    updatedAt: null,
    schemaVersion: SCHEMA_VERSION,
  };
}

export function getFabStateForTab(tabId) {
  const config = TAB_FAB_CONFIG[tabId];
  if (!config) {
    return {
      visible: false,
      label: "",
      hint: "",
      action: "none",
      buttonText: "+",
    };
  }

  return { ...config };
}

export function safeDateMs(value, fallback = 0) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : fallback;
}

export function isValidDateValue(value) {
  return Number.isFinite(safeDateMs(value, Number.NaN));
}

export function sanitizeMeta(input) {
  return {
    babyName: typeof input?.babyName === "string" && input.babyName.trim()
      ? input.babyName.trim()
      : DEFAULT_BABY_NAME,
    updatedAt: isValidDateValue(input?.updatedAt) ? new Date(input.updatedAt).toISOString() : null,
    schemaVersion: Number.isInteger(input?.schemaVersion) ? input.schemaVersion : 1,
  };
}

export function toUtcIsoString(value, fallback = new Date()) {
  if (value instanceof Date) {
    return new Date(value.getTime()).toISOString();
  }

  if (typeof value === "string" && value) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }

  return new Date(fallback).toISOString();
}

export function toLocalDateTime(date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function toDateInputValue(date) {
  return toLocalDateTime(date).slice(0, 10);
}

export function getDayKey(value) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizeNumber(value, { min = null, max = null, integer = false } = {}) {
  if (value === "" || value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (min != null && num < min) return null;
  if (max != null && num > max) return null;
  return integer ? Math.trunc(num) : num;
}

function normalizeString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeWho(value) {
  return normalizeString(value, "") || "mom";
}

function normalizeDeletedAt(input) {
  if (input?.deletedAt && isValidDateValue(input.deletedAt)) {
    return new Date(input.deletedAt).toISOString();
  }

  if (input?.isDeleted) {
    return input?.updatedAt && isValidDateValue(input.updatedAt)
      ? new Date(input.updatedAt).toISOString()
      : new Date().toISOString();
  }

  return null;
}

function normalizeRecordCommon(input, nowIso, deviceId) {
  return {
    id: typeof input?.id === "string" && input.id.trim() ? input.id.trim() : crypto.randomUUID(),
    createdAt: isValidDateValue(input?.createdAt)
      ? new Date(input.createdAt).toISOString()
      : nowIso,
    updatedAt: isValidDateValue(input?.updatedAt)
      ? new Date(input.updatedAt).toISOString()
      : nowIso,
    deletedAt: normalizeDeletedAt(input),
    sourceDeviceId: normalizeString(input?.sourceDeviceId, "") || deviceId,
  };
}

export function normalizeDailyEntry(input, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const nowIso = now.toISOString();
  const timeIso = toUtcIsoString(input?.time || input?.createdAt || now, now);
  const rating = normalizeNumber(input?.rating, { min: 1, max: 5, integer: true });

  return {
    ...normalizeRecordCommon(input, nowIso, options.deviceId || "unknown-device"),
    type: normalizeString(input?.type, "note") || "note",
    time: timeIso,
    timeMs: safeDateMs(timeIso),
    dayKey: getDayKey(timeIso),
    details: normalizeString(input?.details),
    who: normalizeWho(input?.who),
    mlAmount: normalizeNumber(input?.mlAmount, { min: 0, max: 1000 }),
    rating,
  };
}

export function normalizeMilestone(input, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const nowIso = now.toISOString();
  const date = normalizeDateOnly(input?.date, now);

  return {
    ...normalizeRecordCommon(input, nowIso, options.deviceId || "unknown-device"),
    type: normalizeString(input?.type, "roll") || "roll",
    date,
    dateMs: safeDateMs(`${date}T12:00:00Z`),
    notes: normalizeString(input?.notes),
    who: normalizeWho(input?.who),
  };
}

export function normalizeTastingEntry(input, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const nowIso = now.toISOString();
  const createdAtIso = toUtcIsoString(input?.createdAt || input?.updatedAt || now, now);
  const rating = normalizeNumber(input?.rating, { min: 1, max: 5, integer: true });

  return {
    ...normalizeRecordCommon(input, nowIso, options.deviceId || "unknown-device"),
    createdAt: createdAtIso,
    updatedAt: isValidDateValue(input?.updatedAt) ? new Date(input.updatedAt).toISOString() : nowIso,
    dayKey: normalizeDateOnly(input?.dayKey, new Date(createdAtIso)),
    details: normalizeString(input?.details),
    who: normalizeWho(input?.who),
    rating,
  };
}

export function normalizeGrowthEntry(input, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const nowIso = now.toISOString();
  const date = normalizeDateOnly(input?.date, now);

  return {
    ...normalizeRecordCommon(input, nowIso, options.deviceId || "unknown-device"),
    date,
    dateMs: safeDateMs(`${date}T12:00:00Z`),
    weight: normalizeNumber(input?.weight, { min: 0, max: 30 }),
    height: normalizeNumber(input?.height, { min: 0, max: 120 }),
    head: normalizeNumber(input?.head, { min: 0, max: 60 }),
    who: normalizeWho(input?.who),
  };
}

export function normalizeMedicalEntry(input, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const nowIso = now.toISOString();
  const date = normalizeDateOnly(input?.date, now);

  return {
    ...normalizeRecordCommon(input, nowIso, options.deviceId || "unknown-device"),
    date,
    dateMs: safeDateMs(`${date}T12:00:00Z`),
    type: normalizeString(input?.type, "note") || "note",
    temp: normalizeNumber(input?.temp, { min: 30, max: 45 }),
    details: normalizeString(input?.details),
    who: normalizeWho(input?.who),
  };
}

export function normalizePumpingEntry(input, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const nowIso = now.toISOString();
  const timeIso = toUtcIsoString(input?.time || input?.createdAt || now, now);

  return {
    ...normalizeRecordCommon(input, nowIso, options.deviceId || "unknown-device"),
    time: timeIso,
    timeMs: safeDateMs(timeIso),
    dayKey: getDayKey(timeIso),
    amount: normalizeNumber(input?.amount, { min: 0, max: 5000 }) ?? 0,
    location: normalizeString(input?.location),
    who: normalizeWho(input?.who),
  };
}

export function normalizeDateOnly(value, fallbackDate = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return toDateInputValue(fallbackDate);
}

export function normalizeCollectionItem(collectionName, input, options = {}) {
  if (collectionName === "dailyEntries") return normalizeDailyEntry(input, options);
  if (collectionName === "tastingEntries") return normalizeTastingEntry(input, options);
  if (collectionName === "milestones") return normalizeMilestone(input, options);
  if (collectionName === "growthEntries") return normalizeGrowthEntry(input, options);
  if (collectionName === "medicalEntries") return normalizeMedicalEntry(input, options);
  if (collectionName === "pumpingEntries") return normalizePumpingEntry(input, options);
  return input;
}

export function normalizeCollectionState(collectionName, items, options = {}) {
  const config = COLLECTION_CONFIG[collectionName];
  if (!config) return [];
  return (Array.isArray(items) ? items : [])
    .map((item) => normalizeCollectionItem(collectionName, item, options))
    .filter(Boolean)
    .sort(config.sort);
}

export function prepareMetaPatch(input) {
  return {
    babyName: typeof input?.babyName === "string" && input.babyName.trim()
      ? input.babyName.trim()
      : DEFAULT_BABY_NAME,
    updatedAt: toUtcIsoString(input?.updatedAt || new Date()),
    schemaVersion: SCHEMA_VERSION,
  };
}

export function getVisibleEntries(items) {
  return (Array.isArray(items) ? items : []).filter((item) => !item.deletedAt);
}

export function getRecentEntries(items, now = new Date(), days = RECENT_ENTRY_WINDOW_DAYS) {
  const cutoff = now.getTime() - days * 86_400_000;
  return getVisibleEntries(items).filter((item) => {
    const value = item.time || item.date;
    return safeDateMs(value) >= cutoff;
  });
}

export function buildTimelineSegments(entries, dateKey, options = {}) {
  const dayKey = dateKey || getDayKey(options.now || new Date());
  const dayStart = safeDateMs(`${dayKey}T00:00:00`);
  if (!Number.isFinite(dayStart)) {
    return { sleepBlocks: [], awakeBlocks: [], segments: [], isToday: false, trackEndTime: Date.now() };
  }

  const dayEndTime = dayStart + 24 * 60 * 60 * 1000 - 1;
  const nowMs = options.nowMs ?? Date.now();
  const isToday = dayKey === getDayKey(options.now || new Date(nowMs));
  const trackEndTime = isToday ? Math.min(nowMs, dayEndTime) : dayEndTime;

  const normalizedEntries = getVisibleEntries(entries)
    .filter((entry) => entry.type === "sleep" || entry.type === "wake")
    .slice()
    .sort((a, b) => safeDateMs(a.time) - safeDateMs(b.time));

  const sleepBlocks = [];
  let activeSleepStart = null;

  for (const entry of normalizedEntries) {
    const entryMs = safeDateMs(entry.time, Number.NaN);
    if (!Number.isFinite(entryMs)) continue;

    if (entry.type === "sleep") {
      activeSleepStart = entryMs;
      continue;
    }

    if (entry.type === "wake" && activeSleepStart != null && entryMs > activeSleepStart) {
      sleepBlocks.push({
        start: Math.max(activeSleepStart, dayStart),
        end: Math.min(entryMs, trackEndTime),
        ongoing: false,
      });
      activeSleepStart = null;
    }
  }

  if (activeSleepStart != null && activeSleepStart <= trackEndTime) {
    sleepBlocks.push({
      start: Math.max(activeSleepStart, dayStart),
      end: trackEndTime,
      ongoing: isToday,
    });
  }

  const filteredSleepBlocks = sleepBlocks
    .filter((block) => Number.isFinite(block.start) && Number.isFinite(block.end) && block.end > block.start)
    .sort((a, b) => a.start - b.start);

  const awakeBlocks = [];
  let cursor = dayStart;
  for (const block of filteredSleepBlocks) {
    if (block.start > cursor) {
      awakeBlocks.push({ start: cursor, end: block.start, ongoing: false });
    }
    cursor = Math.max(cursor, block.end);
  }

  if (cursor < trackEndTime) {
    awakeBlocks.push({ start: cursor, end: trackEndTime, ongoing: isToday });
  }

  const segments = [
    ...awakeBlocks.map((block) => ({ ...block, kind: "awake" })),
    ...filteredSleepBlocks.map((block) => ({ ...block, kind: "sleep" })),
  ].sort((a, b) => a.start - b.start);

  return { sleepBlocks: filteredSleepBlocks, awakeBlocks, segments, isToday, trackEndTime };
}

export function calcAge(birthStr, toStr) {
  const birth = new Date(`${birthStr}T00:00:00`);
  const to = new Date(`${toStr}T00:00:00`);
  if (!Number.isFinite(birth.getTime()) || !Number.isFinite(to.getTime()) || to < birth) return "";

  let years = to.getFullYear() - birth.getFullYear();
  let months = to.getMonth() - birth.getMonth();
  let days = to.getDate() - birth.getDate();

  if (days < 0) {
    months--;
    days += new Date(to.getFullYear(), to.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  const totalDays = Math.floor((to - birth) / 86_400_000);
  const weeks = Math.floor(days / 7);
  const heYears = (n) => n === 1 ? "שנה" : n === 2 ? "שנתיים" : `${n} שנים`;
  const heMonths = (n) => n === 1 ? "חודש" : n === 2 ? "חודשיים" : `${n} חודשים`;
  const heWeeks = (n) => n === 1 ? "שבוע" : n === 2 ? "שבועיים" : `${n} שבועות`;
  const heDays = (n) => n === 1 ? "יום" : n === 2 ? "יומיים" : `${n} ימים`;
  const and = (a, b) => b ? `${a} ו${/^\d/.test(b) ? "-" : ""}${b}` : a;

  if (totalDays < 14) return heDays(Math.max(1, totalDays));
  if (totalDays < 30) {
    const w = Math.floor(totalDays / 7);
    const d = totalDays % 7;
    return d > 0 ? and(heWeeks(w), heDays(d)) : heWeeks(w);
  }
  if (years === 0) {
    return weeks > 0 ? and(heMonths(months), heWeeks(weeks)) : heMonths(months);
  }
  return months > 0 ? and(heYears(years), heMonths(months)) : heYears(years);
}

export function formatDateHeader(dayKey, now = new Date()) {
  const todayKey = getDayKey(now);
  const yesterdayKey = getDayKey(new Date(now.getTime() - 86_400_000));

  if (dayKey === todayKey) return "היום";
  if (dayKey === yesterdayKey) return "אתמול";

  const d = new Date(`${dayKey}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return dayKey;

  return new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}

export function formatDuration(ms) {
  const totalMinutes = Math.max(1, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) return `${hours} שע׳ ו-${minutes} דק׳`;
  if (hours > 0) return `${hours} שע׳`;
  return `${minutes} דק׳`;
}

export function getMealClockState(entry, now = Date.now(), targetMs = 3 * 60 * 60 * 1000) {
  if (!entry?.time) {
    return {
      hasMeal: false,
      elapsedMs: 0,
      remainingMs: targetMs,
      progressRatio: 0,
      status: "empty",
      targetMs,
    };
  }

  const elapsedMs = Math.max(0, now - safeDateMs(entry.time, now));
  const remainingMs = Math.max(0, targetMs - elapsedMs);
  const progressRatio = Math.min(1, elapsedMs / targetMs);

  let status = "fresh";
  if (elapsedMs >= targetMs) {
    status = "due";
  } else if (remainingMs <= 30 * 60 * 1000) {
    status = "approaching";
  }

  return {
    hasMeal: true,
    elapsedMs,
    remainingMs,
    progressRatio,
    status,
    targetMs,
  };
}

export function getAwakeWindowState(entries, now = Date.now()) {
  const visibleEntries = getVisibleEntries(entries);
  const lastWake = visibleEntries.find((entry) => entry.type === "wake");
  const lastSleep = visibleEntries.find((entry) => entry.type === "sleep");

  if (!lastWake) {
    return {
      hasAwakeWindow: false,
      durationMs: 0,
      status: "unknown",
      context: "",
    };
  }

  const wakeMs = safeDateMs(lastWake.time, Number.NaN);
  if (!Number.isFinite(wakeMs)) {
    return {
      hasAwakeWindow: false,
      durationMs: 0,
      status: "unknown",
      context: "",
    };
  }

  const sleepMs = lastSleep ? safeDateMs(lastSleep.time, Number.NaN) : Number.NaN;

  if (!Number.isFinite(sleepMs) || wakeMs > sleepMs) {
    return {
      hasAwakeWindow: true,
      durationMs: Math.max(0, now - wakeMs),
      status: "awake",
      context: "מאז שהתעורר",
    };
  }

  return {
    hasAwakeWindow: true,
    durationMs: Math.max(0, sleepMs - wakeMs),
    status: "asleep",
    context: "לפני שנרדם",
  };
}

export function getRestClockState(entries, now = Date.now()) {
  const visibleEntries = getVisibleEntries(entries);
  const lastWake = visibleEntries.find((entry) => entry.type === "wake");
  const lastSleep = visibleEntries.find((entry) => entry.type === "sleep");

  if (!lastWake && !lastSleep) {
    return {
      hasState: false,
      status: "unknown",
      title: "☀️ זמן ערות",
      durationMs: 0,
      context: "",
    };
  }

  const wakeMs = lastWake ? safeDateMs(lastWake.time, Number.NaN) : Number.NaN;
  const sleepMs = lastSleep ? safeDateMs(lastSleep.time, Number.NaN) : Number.NaN;

  if (!Number.isFinite(sleepMs) || (Number.isFinite(wakeMs) && wakeMs > sleepMs)) {
    return {
      hasState: Number.isFinite(wakeMs),
      status: "awake",
      title: "☀️ זמן ערות",
      durationMs: Number.isFinite(wakeMs) ? Math.max(0, now - wakeMs) : 0,
      context: "מאז שהתעורר",
    };
  }

  return {
    hasState: Number.isFinite(sleepMs),
    status: "asleep",
    title: "🌙 זמן שינה",
    durationMs: Number.isFinite(sleepMs) ? Math.max(0, now - sleepMs) : 0,
    context: "מאז שנרדם",
  };
}

export function calcSleepDuration(entries) {
  const visibleEntries = getVisibleEntries(entries);
  const lastSleep = visibleEntries.find((entry) => entry.type === "sleep");
  if (!lastSleep) return "לא ידוע";

  const sleepTime = safeDateMs(lastSleep.time, Number.NaN);
  if (!Number.isFinite(sleepTime)) return "לא ידוע";

  const firstWakeAfterSleep = visibleEntries
    .slice()
    .reverse()
    .find((entry) => entry.type === "wake" && safeDateMs(entry.time) > sleepTime);

  if (!firstWakeAfterSleep) return "עדיין ישן";
  return formatDuration(safeDateMs(firstWakeAfterSleep.time) - sleepTime);
}

export function getFeedReminderState(entries, now = Date.now()) {
  const lastMealEntry = getVisibleEntries(entries).find((entry) => entry.type === "meal");
  if (!lastMealEntry) return { visible: false, elapsedMs: 0, entry: null };
  if (lastMealEntry.who === "mom") return { visible: false, elapsedMs: 0, entry: lastMealEntry };

  const elapsedMs = now - safeDateMs(lastMealEntry.time, now);
  const thresholdMs = (2 * 60 + 45) * 60 * 1000;
  return {
    visible: elapsedMs >= thresholdMs,
    elapsedMs,
    entry: lastMealEntry,
    thresholdMs,
  };
}

export function summarizeHistoryDay(entries) {
  const visibleEntries = getVisibleEntries(entries);
  const mealCount = visibleEntries.filter((entry) => entry.type === "meal").length;
  const sleepEventsCount = visibleEntries.filter((entry) => entry.type === "sleep" || entry.type === "wake").length;
  const diaperCount = visibleEntries.filter((entry) => entry.type === "poop" || entry.type === "pee").length;
  const healthCount = visibleEntries.filter((entry) => entry.type === "medication").length;

  return {
    mealCount,
    sleepEventsCount,
    diaperCount,
    healthCount,
  };
}

export function coalesceHistoryEntries(entries) {
  const visibleEntries = getVisibleEntries(entries).slice();
  const result = [];
  const usedIds = new Set();

  for (const entry of visibleEntries) {
    if (usedIds.has(entry.id)) continue;

    if (entry.type === "poop") {
      const peer = visibleEntries.find((candidate) =>
        !usedIds.has(candidate.id)
        && candidate.id !== entry.id
        && candidate.type === "pee"
        && candidate.who === entry.who
        && candidate.time === entry.time
      );

      if (peer) {
        usedIds.add(entry.id);
        usedIds.add(peer.id);
        result.push({
          ...entry,
          id: `${entry.id}__${peer.id}`,
          type: "poop-pee",
          groupedEntryIds: [entry.id, peer.id],
          groupedEntries: [entry, peer],
        });
        continue;
      }
    }

    if (entry.type === "pee") {
      const peer = visibleEntries.find((candidate) =>
        !usedIds.has(candidate.id)
        && candidate.id !== entry.id
        && candidate.type === "poop"
        && candidate.who === entry.who
        && candidate.time === entry.time
      );

      if (peer) continue;
    }

    usedIds.add(entry.id);
    result.push(entry);
  }

  return result.sort((a, b) => safeDateMs(b.time) - safeDateMs(a.time));
}

export function getHistoryEmptyState(filterKey, dateLabel) {
  const labels = {
    all: `אין אירועים להצגה עבור ${dateLabel}.`,
    sleep: `אין אירועי שינה עבור ${dateLabel}.`,
    food: `אין אירועי אוכל עבור ${dateLabel}.`,
    diaper: `אין אירועי חיתולים עבור ${dateLabel}.`,
    health: `אין אירועי בריאות עבור ${dateLabel}.`,
  };

  return labels[filterKey] || labels.all;
}

export function createDiagnosticsEntry(type, message, details = {}) {
  return {
    type,
    message,
    details,
    at: new Date().toISOString(),
  };
}
