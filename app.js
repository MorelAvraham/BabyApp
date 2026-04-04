import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  collection,
  getDoc,
  getDocs,
  initializeFirestore,
  limit,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  query,
  setDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  buildTimelineSegments,
  COLLECTION_CONFIG,
  SCHEMA_VERSION,
  calcAge,
  calcSleepDuration,
  coalesceHistoryEntries,
  createDiagnosticsEntry,
  createEmptyState,
  formatDateHeader,
  formatDuration,
  getDayKey,
  getFabStateForTab,
  getHistoryEmptyState,
  getMealClockState,
  getRestClockState,
  getFeedReminderState,
  getRecentEntries,
  getVisibleEntries,
  normalizeCollectionItem,
  normalizeCollectionState,
  prepareMetaPatch,
  sanitizeMeta,
  safeDateMs,
  summarizeHistoryDay,
  toDateInputValue,
  toLocalDateTime,
} from "./app-core.mjs";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDXqnnTUxllzZeTiTq5Hf-y6Sb6UlxDkC4",
  authDomain: "babyapp-66a5a.firebaseapp.com",
  projectId: "babyapp-66a5a",
  storageBucket: "babyapp-66a5a.firebasestorage.app",
  messagingSenderId: "27280225940",
  appId: "1:27280225940:web:21c9a952f039675c30a681"
};

const WHO_KEY              = "eitan-or-who";
const THEME_KEY            = "eitan-or-theme";
const DEVICE_ID_KEY        = "eitan-or-device-id";
const BIRTH_DATE           = "2025-09-16"; // Eitan Or's birthdate (YYYY-MM-DD)
const SYNC_LOG_KEY         = "eitan-or-sync-log";
const MAX_DIAGNOSTICS      = 25;

// ============================================================
// PIN LOCK SYSTEM
// ============================================================
const APP_PIN = "2909";
const pinScreen = document.getElementById("pinScreen");
const pinForm = document.getElementById("pinForm");
const pinInput = document.getElementById("pinInput");
const pinError = document.getElementById("pinError");

if (localStorage.getItem("appUnlocked") === "true") {
  if (pinScreen) pinScreen.classList.add("hidden");
} else {
  if (pinScreen) pinScreen.classList.remove("hidden");
}

if (pinForm) {
  pinForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (pinInput.value === APP_PIN) {
      localStorage.setItem("appUnlocked", "true");
      pinScreen.classList.add("hidden");
    } else {
      pinError.style.display = "block";
      pinInput.value = "";
      pinInput.focus();
    }
  });
}

// ---- Labels & Emojis ----
const EMOJI = {
  wake: "☀️", sleep: "🌙", meal: "🍼",
  poop: "💩", pee: "💦", medication: "💊", tasting: "🥦",
  roll: "🔄", crawl: "🐛", sit: "🧘", stand: "🧍", walk: "👣",
};

const LABELS = {
  wake: "התעורר",  sleep: "נרדם", meal: "אכל",
  poop: "קקי", pee: "פיפי",  medication: "תרופה/ויטמין", tasting: "טעימה",
  roll: "התהפך",   crawl: "זחל",      sit: "ישב לבד", stand: "עמד", walk: "הלך",
};

const WHO_LABELS = { 
  mom: "אמא", 
  dad: "אבא", 
  sabaHaim: "סבא חיים",
  savtaBruria: "סבתא ברוריה",
  savtaNaama: "סבתא נעמה",
  lulit: "לולית"
};

const TASTING_RATING_EMOJIS = {
  1: "🤮",
  2: "😒",
  3: "😐",
  4: "🙂",
  5: "😍",
};

const TASTING_CHECKLIST_GROUPS = Object.freeze([
  {
    id: "vegetables",
    title: "ירקות",
    kicker: "מומלץ להתחיל כאן",
    items: [
      "עגבניה", "קישוא", "מלפפון", "דלעת", "חסה", "גזר", "פטרוזיליה", "בטטה",
      "כוסברה", "תפוח אדמה", "בצל ירוק", "דלורית", "שום", "בצל", "מנגולד", "סלק",
      "תרד", "חציל", "קולורבי", "פלפל", "אפונה ירוקה", "כרובית", "ברוקולי", "כרוב",
      "שעועית ירוקה", "פטריות", "תירס",
    ],
  },
  {
    id: "fruits",
    title: "פירות",
    kicker: "מאודים וטריים",
    items: [
      "תפוז", "תפוח", "קלמנטינה", "אגס", "אשכולית צהובה", "בננה", "אשכולית אדומה", "אבוקדו",
      "פומלה", "מלון", "ענבים", "אבטיח", "שסק", "משמש", "רימון", "תאנה", "תמר",
      "אפרסמון", "גויבה", "פפאיה", "לימון",
    ],
  },
  {
    id: "grains",
    title: "דגנים",
    kicker: "להרחבת התפריט",
    items: [
      "אורז", "בורגול", "סולת", "קמח תירס", "קינואה",
      "שיבולת שועל",
      "כוסמין", "דוחן",
    ],
  },
  {
    id: "protein",
    title: "חלבון",
    kicker: "אחרי שמתקדמים עם הטעימות",
    items: [
      "עוף", "הודו", "בקר",
      { label: "דגים", aliases: ["דג"], isAllergen: true },
      { label: "ביצים", aliases: ["ביצה", "חלמון ביצה"], isAllergen: true },
      "טופו", "עדשים", "חומוס",
      "שעועית", "אפונה", "פול", "מאש", "לוביה",
    ],
  },
  {
    id: "dairy",
    title: "מוצרי חלב",
    kicker: "בכמות קטנה",
    items: [
      "גבינה לבנה", "יוגורט", "קוטג׳", "לאבנה", "גבינת שמנת", "גבינה צהובה",
      "ריקוטה", { label: "פטה / בולגרית", aliases: ["פטה", "בולגרית"] },
    ],
  },
  {
    id: "generalAllergens",
    title: "אלרגנים כלליים",
    kicker: "מעקב 3 ימים ברצף",
    items: [
      { label: "חיטה", isAllergen: true },
      { label: "שומשום", aliases: ["טחינה"], isAllergen: true },
      { label: "סויה", isAllergen: true },
      { label: "כוסמת", isAllergen: true },
    ],
  },
  {
    id: "specialAllergens",
    title: "פירות מיוחדים ורגישים",
    kicker: "לתת בזהירות ובהדרגה",
    items: [
      { label: "קיווי", isAllergen: true },
      { label: "אננס", isAllergen: true },
      { label: "תות", isAllergen: true },
      { label: "מנגו", isAllergen: true },
      { label: "אפרסק", isAllergen: true },
      { label: "נקטרינה", isAllergen: true },
      { label: "פירות יער", aliases: ["ברי יער"], isAllergen: true },
      { label: "דובדבן", isAllergen: true },
      { label: "שזיף", isAllergen: true },
    ],
  },
  {
    id: "nuts",
    title: "אגוזים",
    kicker: "אלרגנים מסומנים",
    items: [
      { label: "בוטנים", aliases: ["חמאת בוטנים"], isAllergen: true },
      { label: "אגוזי מלך", isAllergen: true },
      { label: "שקדים", isAllergen: true },
      { label: "פיסטוק", isAllergen: true },
      { label: "מקדמיה", isAllergen: true },
      { label: "ברזיל", aliases: ["אגוז ברזיל"], isAllergen: true },
      { label: "קשיו", isAllergen: true },
      { label: "לוז", isAllergen: true },
      { label: "פקאן", isAllergen: true },
      { label: "צנובר", isAllergen: true },
    ],
  },
]);

const TASTING_CHECKLIST_INDEX = TASTING_CHECKLIST_GROUPS.map((group) => ({
  ...group,
  items: group.items.map((item) => {
    const config = typeof item === "string" ? { label: item } : item;
    const aliases = [config.label, ...(config.aliases || [])];
    return {
      ...config,
      aliases,
      normalizedAliases: aliases.map((alias) => normalizeTastingText(alias)),
    };
  }),
}));

// ---- App State ----
const state = createEmptyState();

let currentWho     = localStorage.getItem(WHO_KEY) || "mom";
let currentTab     = "home";   // "home" | "timeline" | "milestones" | "tastings" | "health"
let healthMenuOpen = false;    // tracks health FAB speed-dial state
let activeSheet    = null;     // id of the currently open bottom sheet, or null
let editingEntryId = null;     // non-null when editing an existing entry
let editingEntryGroupIds = null;
let entrySubmitTargetTab = "timeline";
let _pendingPoopBtn = null;
let timelineBarSelection = null;
let currentTimelineFilter = "all";
let currentTastingFilter = "all";
let currentTastingSearch = "";
let db             = null;
let metaDoc        = null;
let legacyStateDoc = null;
let isFirebaseReady = false;
let diagnostics = [];
const deviceId = getOrCreateDeviceId();
const firestoreUnsubscribes = [];

// ---- Firebase Init ----
const isFirebaseConfigured = Object.values(FIREBASE_CONFIG).every((v) => v && v.trim());

if (isFirebaseConfigured) {
  try {
    const app = initializeApp(FIREBASE_CONFIG);

    // Enable multi-tab offline persistence backed by IndexedDB.
    // Firestore will queue writes locally when offline and sync
    // automatically once connectivity is restored — no custom
    // localStorage fallback needed for Firebase data.
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });

    metaDoc         = doc(db, "tracker", "meta");
    legacyStateDoc  = doc(db, "tracker", "main");
    isFirebaseReady = true;
  } catch (err) {
    // Persistence may fail in private-browsing or storage-restricted envs.
    // Log the error and the app continues with localStorage-only mode.
    console.warn("Firebase init failed:", err);
    reportIssue("firebase-init", "Firebase init failed", { error: String(err) });
  }
}

// ---- DOM Elements ----
const el = {
  // Topbar
  babyNameHeading:   document.querySelector("#babyNameHeading"),
  ageLabel:          document.querySelector("#ageLabel"),
  syncBadge:         document.querySelector("#syncBadge"),
  lastUpdatedLabel:  document.querySelector("#lastUpdatedLabel"),
  whoToggle:         document.querySelector("#whoToggle"),
  themeToggle:       document.querySelector("#themeToggle"),

  // Summary
  wakeSummary:       document.querySelector("#wakeSummary"),
  wakeSince:         document.querySelector("#wakeSince"),
  sleepSummary:      document.querySelector("#sleepSummary"),
  sleepSince:        document.querySelector("#sleepSince"),
  mealCount:         document.querySelector("#mealCount"),
  poopCount:         document.querySelector("#poopCount"),
  peeCount:          document.querySelector("#peeCount"),
  medCount:          document.querySelector("#medCount"),
  sleepDuration:     document.querySelector("#sleepDuration"),
  awakeDurationCard: document.querySelector("#awakeDurationCard"),
  awakeDurationLabel: document.querySelector("#awakeDurationLabel"),
  awakeDurationSummary: document.querySelector("#awakeDurationSummary"),
  awakeDurationSince: document.querySelector("#awakeDurationSince"),
  awakeDurationProgressFill: document.querySelector("#awakeDurationProgressFill"),
  lastMealSummary:   document.querySelector("#lastMealSummary"),
  lastMealSince:     document.querySelector("#lastMealSince"),
  lastMealCard:      document.querySelector("#lastMealCard"),
  lastMealCountdown: document.querySelector("#lastMealCountdown"),
  lastMealProgressFill: document.querySelector("#lastMealProgressFill"),
  latestEntrySummary:document.querySelector("#latestEntrySummary"),
  resetToday:        document.querySelector("#resetToday"),

  // Entry form
  dailyForm:         document.querySelector("#dailyForm"),
  entryType:         document.querySelector("#entryType"),
  entryTypePoopPee:  document.querySelector("#entryTypePoopPee"),
  entryTimeLabel:    document.querySelector("#entryTimeLabel"),
  entryTime:         document.querySelector("#entryTime"),
  entryDetails:      document.querySelector("#entryDetails"),
  entryWhoSelect:    document.querySelector("#entryWhoSelect"),
  entryWhoCustomLabel: document.querySelector("#entryWhoCustomLabel"),
  entryWhoCustom:    document.querySelector("#entryWhoCustom"),
  mlAmountLabel:     document.querySelector("#mlAmountLabel"),
  entryMlAmount:     document.querySelector("#entryMlAmount"),

  // Timeline list
  timeline:          document.querySelector("#timeline"),
  timelineFilters:   Array.from(document.querySelectorAll("[data-timeline-filter]")),
  timelineResultsMeta: document.querySelector("#timelineResultsMeta"),
  timelineDaySummary: document.querySelector("#timelineDaySummary"),

  // Tasting checklist tab
  tastingCompletionText: document.querySelector("#tastingCompletionText"),
  tastingCompletionBar: document.querySelector("#tastingCompletionBar"),
  tastingOverview: document.querySelector("#tastingOverview"),
  tastingChecklistGroups: document.querySelector("#tastingChecklistGroups"),
  openGenericTastingEntry: document.querySelector("#openGenericTastingEntry"),
  tastingSearchInput: document.querySelector("#tastingSearchInput"),
  tastingFilterChips: Array.from(document.querySelectorAll("[data-tasting-filter]")),

  // Milestone form
  milestoneForm:     document.querySelector("#milestoneForm"),
  milestoneDate:     document.querySelector("#milestoneDate"),
  milestonesList:    document.querySelector("#milestonesList"),
  openMilestoneSheet:document.querySelector("#openMilestoneSheet"),

  // Quick action buttons
  quickActions:      Array.from(document.querySelectorAll("[data-quick-type]")),

  // Bottom navigation
  navItems:          Array.from(document.querySelectorAll("[data-nav-tab]")),
  tabViews:          Array.from(document.querySelectorAll(".tab-view")),

  // FAB
  fabAdd:            document.querySelector("#fabAdd"),
  fabHints:          Array.from(document.querySelectorAll("[data-fab-hint-for]")),

  // Bottom sheets
  sheetOverlay:        document.querySelector("#sheetOverlay"),
  sheetEntry:          document.querySelector("#sheetEntry"),
  sheetMilestone:      document.querySelector("#sheetMilestone"),
  sheetCaregiver:      document.querySelector("#sheetCaregiver"),
  closeSheetEntry:     document.querySelector("#closeSheetEntry"),
  closeSheetMilestone: document.querySelector("#closeSheetMilestone"),
  closeSheetCaregiver: document.querySelector("#closeSheetCaregiver"),

  // Caregiver sheet
  customCaregiverInput: document.querySelector("#customCaregiverInput"),
  applyCaregiverBtn:    document.querySelector("#applyCaregiverBtn"),
  caregiverBtns:        Array.from(document.querySelectorAll(".caregiver-btn")),

  // Medication pills
  medPillsSection: document.querySelector("#medPillsSection"),
  medPills:        Array.from(document.querySelectorAll(".med-pill")),

  // Timeline bar & controls
  timelineBar:       document.querySelector("#timelineBar"),
  timelineBarDetails:document.querySelector("#timelineBarDetails"),
  timelineDatePicker:document.querySelector("#timelineDatePicker"),
  prevDayBtn:        document.querySelector("#prevDayBtn"),
  nextDayBtn:        document.querySelector("#nextDayBtn"),

  // Entry submit button & sheet title
  entrySubmitBtn:   document.querySelector("#entrySubmitBtn"),
  sheetEntryTitle:  document.querySelector("#sheetEntry .sheet-header h3"),

  // Feed reminder banner
  feedReminderBanner: document.querySelector("#feedReminderBanner"),
  feedReminderText:   document.querySelector("#feedReminderText"),

  // ── Health Tab ──
  growthList:          document.querySelector("#growthList"),
  medicalList:         document.querySelector("#medicalList"),
  pumpingList:         document.querySelector("#pumpingList"),
  pumpingTotalMl:      document.querySelector("#pumpingTotalMl"),
  openGrowthSheet:     document.querySelector("#openGrowthSheet"),
  openMedicalSheet:    document.querySelector("#openMedicalSheet"),
  openPumpingSheet:    document.querySelector("#openPumpingSheet"),

  sheetGrowth:         document.querySelector("#sheetGrowth"),
  sheetMedical:        document.querySelector("#sheetMedical"),
  sheetPumping:        document.querySelector("#sheetPumping"),
  sheetPoop:           document.querySelector("#sheetPoop"),
  closeSheetGrowth:    document.querySelector("#closeSheetGrowth"),
  closeSheetMedical:   document.querySelector("#closeSheetMedical"),
  closeSheetPumping:   document.querySelector("#closeSheetPumping"),
  closeSheetPoop:      document.querySelector("#closeSheetPoop"),

  growthForm:          document.querySelector("#growthForm"),
  growthDate:          document.querySelector("#growthDate"),
  growthWeight:        document.querySelector("#growthWeight"),
  growthHeight:        document.querySelector("#growthHeight"),
  growthHead:          document.querySelector("#growthHead"),

  medicalForm:         document.querySelector("#medicalForm"),
  medicalType:         document.querySelector("#medicalType"),
  medicalDate:         document.querySelector("#medicalDate"),
  medicalTempLabel:    document.querySelector("#medicalTempLabel"),
  medicalTemp:         document.querySelector("#medicalTemp"),
  medicalDetails:      document.querySelector("#medicalDetails"),

  pumpingForm:         document.querySelector("#pumpingForm"),
  pumpingTime:         document.querySelector("#pumpingTime"),
  pumpingAmount:       document.querySelector("#pumpingAmount"),
  pumpingLocation:     document.querySelector("#pumpingLocation"),

  fabHealthMenu:       document.querySelector("#fabHealthMenu"),
  fabHealthGrowth:     document.querySelector("#fabHealthGrowth"),
  fabHealthMedical:    document.querySelector("#fabHealthMedical"),
  fabHealthPumping:    document.querySelector("#fabHealthPumping"),
  poopChoiceBoth:      document.querySelector("#poopChoiceBoth"),
  poopChoicePoop:      document.querySelector("#poopChoicePoop"),
  poopChoiceCancel:    document.querySelector("#poopChoiceCancel"),
};

// ============================================================
// ENTRY POINT
// ============================================================
async function initialize() {
  applyTheme();
  setDefaultFormValues();
  setDefaultHealthFormValues();
  registerEvents();
  registerServiceWorker();
  registerDiagnostics();
  switchTab(currentTab);
  render();

  if (isFirebaseReady) {
    setSyncStatus("syncing");
    await initializeFirestoreState();
  } else {
    setSyncStatus("local-only");
  }

  // Re-render every minute so "time since" labels stay current
  setInterval(() => render(), 60_000);
}

// ============================================================
// FIRESTORE DATA MODEL
// ============================================================
async function initializeFirestoreState() {
  try {
    await ensureFirestoreSchema();
    listenToFirestoreCollections();
  } catch (err) {
    console.warn("Firestore bootstrap failed:", err);
    reportIssue("firestore-bootstrap", "Firestore bootstrap failed", { error: String(err) });
    setSyncStatus("error");
  }
}

function getCollectionRef(collectionName) {
  return collection(db, "tracker", "meta", collectionName);
}

function listenToFirestoreCollections() {
  clearFirestoreListeners();

  firestoreUnsubscribes.push(
    onSnapshot(
      metaDoc,
      (snapshot) => {
        const meta = snapshot.exists() ? sanitizeMeta(snapshot.data()) : prepareMetaPatch({});
        state.babyName = meta.babyName;
        state.updatedAt = meta.updatedAt;
        state.schemaVersion = meta.schemaVersion;
        setSyncStatus("online");
        render();
      },
      (err) => handleFirestoreListenerError("meta-listener", err),
    ),
  );

  for (const collectionName of Object.keys(COLLECTION_CONFIG)) {
    firestoreUnsubscribes.push(
      onSnapshot(
        getCollectionRef(collectionName),
        (snapshot) => {
          state[collectionName] = normalizeCollectionState(
            collectionName,
            snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() })),
            { deviceId },
          );
          render();
        },
        (err) => handleFirestoreListenerError(`${collectionName}-listener`, err),
      ),
    );
  }
}

function clearFirestoreListeners() {
  while (firestoreUnsubscribes.length) {
    const unsubscribe = firestoreUnsubscribes.pop();
    unsubscribe?.();
  }
}

function handleFirestoreListenerError(scope, err) {
  console.warn("Firestore listener error:", scope, err);
  reportIssue(scope, "Firestore listener error", { error: String(err) });
  setSyncStatus("error");
}

async function ensureFirestoreSchema() {
  const metaSnapshot = await getDoc(metaDoc);
  const meta = metaSnapshot.exists() ? sanitizeMeta(metaSnapshot.data()) : null;
  const collectionsEmpty = await areFirestoreCollectionsEmpty();

  if (meta?.schemaVersion >= SCHEMA_VERSION) {
    state.babyName = meta.babyName;
    state.updatedAt = meta.updatedAt;
    state.schemaVersion = meta.schemaVersion;
    return;
  }

  const legacySnapshot = await getDoc(legacyStateDoc);
  if (legacySnapshot.exists() && collectionsEmpty) {
    await migrateLegacyStateToCollections(legacySnapshot.data(), meta);
    return;
  }

  await saveMeta({
    babyName: meta?.babyName || state.babyName,
    updatedAt: meta?.updatedAt || new Date().toISOString(),
  });
}

async function areFirestoreCollectionsEmpty() {
  const snapshots = await Promise.all(
    Object.keys(COLLECTION_CONFIG).map((collectionName) => getDocs(query(getCollectionRef(collectionName), limit(1)))),
  );
  return snapshots.every((snapshot) => snapshot.empty);
}

async function migrateLegacyStateToCollections(rawLegacyState, existingMeta) {
  const legacyState = sanitizeLegacyState(rawLegacyState);
  const operations = [];

  for (const collectionName of Object.keys(COLLECTION_CONFIG)) {
    for (const item of legacyState[collectionName]) {
      const normalized = normalizeCollectionItem(collectionName, item, { deviceId });
      operations.push({
        collectionName,
        id: normalized.id,
        data: toFirestoreRecord(normalized),
      });
    }
  }

  await commitFirestoreOperations(operations);
  await saveMeta({
    babyName: existingMeta?.babyName || legacyState.babyName || state.babyName,
    updatedAt: legacyState.updatedAt || new Date().toISOString(),
  });
}

async function commitFirestoreOperations(operations) {
  if (!operations.length) return;

  let batch = writeBatch(db);
  let count = 0;

  for (const operation of operations) {
    const recordRef = doc(getCollectionRef(operation.collectionName), operation.id);
    batch.set(recordRef, operation.data, { merge: true });
    count++;

    if (count >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }
}

function toFirestoreRecord(record) {
  const payload = { ...record };
  delete payload.id;
  delete payload.isDeleted;
  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });
  return payload;
}

async function saveMeta(partialMeta = {}) {
  const payload = prepareMetaPatch({
    babyName: partialMeta.babyName || state.babyName,
    updatedAt: partialMeta.updatedAt || new Date().toISOString(),
  });
  state.babyName = payload.babyName;
  state.updatedAt = payload.updatedAt;
  state.schemaVersion = payload.schemaVersion;

  if (!isFirebaseReady) return;

  await setDoc(metaDoc, payload, { merge: true });
}

async function persistRecord(collectionName, record) {
  state.updatedAt = new Date().toISOString();
  setSyncStatus("syncing");

  if (!isFirebaseReady) {
    setSyncStatus("local-only");
    return;
  }

  try {
    await setDoc(
      doc(getCollectionRef(collectionName), record.id),
      toFirestoreRecord(record),
      { merge: true },
    );
    await saveMeta({ updatedAt: state.updatedAt });
    setSyncStatus("online");
  } catch (err) {
    console.warn("Persist record failed:", err);
    reportIssue(`${collectionName}-persist`, "Persist record failed", { error: String(err), id: record.id });
    setSyncStatus("error");
  }
}

async function softDeleteRecord(collectionName, record) {
  if (!record) return;
  record.deletedAt = new Date().toISOString();
  record.updatedAt = record.deletedAt;
  await persistRecord(collectionName, record);
}

function replaceRecordInState(collectionName, record) {
  const current = Array.isArray(state[collectionName]) ? state[collectionName] : [];
  const next = current.filter((item) => item.id !== record.id);
  next.push(record);
  state[collectionName] = normalizeCollectionState(collectionName, next, { deviceId });
}

function sanitizeLegacyState(input) {
  const fallback = createEmptyState();
  return {
    babyName: typeof input?.babyName === "string" && input.babyName.trim() ? input.babyName.trim() : fallback.babyName,
    dailyEntries: Array.isArray(input?.dailyEntries) ? input.dailyEntries : [],
    tastingEntries: Array.isArray(input?.tastingEntries) ? input.tastingEntries : [],
    milestones: Array.isArray(input?.milestones) ? input.milestones : [],
    growthEntries: Array.isArray(input?.growthEntries) ? input.growthEntries : [],
    medicalEntries: Array.isArray(input?.medicalEntries) ? input.medicalEntries : [],
    pumpingEntries: Array.isArray(input?.pumpingEntries) ? input.pumpingEntries : [],
    updatedAt: typeof input?.updatedAt === "string" ? input.updatedAt : null,
  };
}

function getOrCreateDeviceId() {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}

function reportIssue(type, message, details = {}) {
  const entry = createDiagnosticsEntry(type, message, details);
  diagnostics = [entry, ...diagnostics].slice(0, MAX_DIAGNOSTICS);

  try {
    localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(diagnostics));
  } catch {
    // Best-effort diagnostics only.
  }
}

function registerDiagnostics() {
  try {
    diagnostics = JSON.parse(localStorage.getItem(SYNC_LOG_KEY) || "[]");
    if (!Array.isArray(diagnostics)) diagnostics = [];
  } catch {
    diagnostics = [];
  }

  window.addEventListener("error", (event) => {
    reportIssue("runtime-error", event.message || "Runtime error", {
      filename: event.filename || "",
      line: event.lineno || 0,
      column: event.colno || 0,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportIssue("promise-rejection", "Unhandled promise rejection", {
      reason: String(event.reason || ""),
    });
  });
}

// ============================================================
// EVENT REGISTRATION
// ============================================================
function registerEvents() {
  if (el.timelineDatePicker) {
    el.timelineDatePicker.value = getDayKey(new Date());
    el.timelineDatePicker.addEventListener("change", () => {
      timelineBarSelection = null;
      render();
    });
  }

  // ── Timeline Day Navigation ──
  if (el.prevDayBtn && el.nextDayBtn && el.timelineDatePicker) {
    el.prevDayBtn.addEventListener("click", () => shiftDate(-1));
    el.nextDayBtn.addEventListener("click", () => shiftDate(1));
  }

  el.timelineBar?.addEventListener("click", (event) => {
    const segment = event.target.closest("[data-timeline-segment]");
    if (!segment) return;

    timelineBarSelection = {
      kind: segment.dataset.segmentKind,
      start: segment.dataset.segmentStart,
      end: segment.dataset.segmentEnd,
      ongoing: segment.dataset.segmentOngoing === "true",
      dateKey: segment.dataset.segmentDate,
    };
    render();
  });

  for (const filterBtn of el.timelineFilters) {
    filterBtn.addEventListener("click", () => {
      currentTimelineFilter = filterBtn.dataset.timelineFilter || "all";
      render();
    });
  }

  function shiftDate(days) {
    const currentVal = el.timelineDatePicker.value;
    if (!currentVal) return;
    const d = new Date(currentVal + "T12:00:00");
    d.setDate(d.getDate() + days);
    el.timelineDatePicker.value = getDayKey(d);
    render();
  }
  // ── Bottom Navigation ──
  for (const item of el.navItems) {
    item.addEventListener("click", () => switchTab(item.dataset.navTab));
  }

  // ── FAB: open the correct sheet based on current tab ──
  el.fabAdd.addEventListener("click", () => {
    const fabState = getFabStateForTab(currentTab);
    if (fabState.action === "milestone") {
      openSheet("sheetMilestone");
    } else if (fabState.action === "health-menu") {
      toggleHealthMenu();
    } else if (fabState.action === "entry") {
      if (currentTab === "tastings") {
        openEntrySheetForNew("tasting", { submitTargetTab: "tastings" });
      } else {
        openEntrySheetForNew();
      }
    }
  });

  el.openMilestoneSheet?.addEventListener("click", () => openSheet("sheetMilestone"));
  el.openGenericTastingEntry?.addEventListener("click", () => {
    openEntrySheetForNew("tasting", { submitTargetTab: "tastings" });
  });

  el.tastingSearchInput?.addEventListener("input", () => {
    currentTastingSearch = el.tastingSearchInput.value.trim();
    renderTastingChecklist();
  });

  for (const chip of el.tastingFilterChips) {
    chip.addEventListener("click", () => {
      currentTastingFilter = chip.dataset.tastingFilter || "all";
      renderTastingChecklist();
    });
  }

  // ── Sheet: close via overlay click ──
  el.sheetOverlay.addEventListener("click", () => closeAllSheets());

  // ── Sheet: close via × button ──
  el.closeSheetEntry.addEventListener("click",    () => closeAllSheets());
  el.closeSheetMilestone.addEventListener("click",() => closeAllSheets());

  // ── Sheet: close caregiver via × button ──
  el.closeSheetCaregiver.addEventListener("click", () => closeAllSheets());

  // ── Sheet: drag-to-dismiss (touch) ──
  for (const sheet of [el.sheetEntry, el.sheetMilestone, el.sheetCaregiver, el.sheetGrowth, el.sheetMedical, el.sheetPumping, el.sheetPoop]) {
    if (sheet) registerSheetDragDismiss(sheet);
  }

  // ── Entry form submit (handles both add and edit) ──
  el.dailyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = el.entrySubmitBtn;
    btn.disabled = true;

    const isMeal = el.entryType.value === "meal";
    const isTasting = el.entryType.value === "tasting";
    const isDiaperCombo = el.entryType.value === "poop-pee";
    const whoValue = getEntryWhoValue();

    if (!whoValue) {
      btn.disabled = false;
      return;
    }
    
    // Find selected rating
    let selectedRating = null;
    if (isTasting) {
      const activeRatingBtn = document.querySelector("#tastingRatingSection .rating-btn.selected");
      if (activeRatingBtn) {
        selectedRating = parseInt(activeRatingBtn.dataset.rating, 10);
      }
    }

    const payload = {
      type:     el.entryType.value,
      time:     el.entryTime.value,
      details:  el.entryDetails.value.trim(),
      who:      whoValue,
      mlAmount: isMeal && el.entryMlAmount.value ? Number(el.entryMlAmount.value) : null,
      rating:   selectedRating,
    };

    if (editingEntryGroupIds?.length) {
      await saveDiaperComboRecords(payload, editingEntryGroupIds);
      editingEntryGroupIds = null;
      editingEntryId = null;
    } else if (editingEntryId) {
      // Update existing entry in place
      const idx = state.dailyEntries.findIndex((e) => e.id === editingEntryId);
      if (idx !== -1) {
        const nextRecord = normalizeCollectionItem("dailyEntries", {
          ...state.dailyEntries[idx],
          ...payload,
          updatedAt: new Date().toISOString(),
        }, { deviceId });
        replaceRecordInState("dailyEntries", nextRecord);
        await persistRecord("dailyEntries", nextRecord);
      }
      editingEntryId = null;
    } else if (isDiaperCombo) {
      await saveDiaperComboRecords(payload);
    } else if (isTasting) {
      const now = new Date();
      const nextRecord = normalizeCollectionItem("tastingEntries", {
        id: crypto.randomUUID(),
        createdAt: now.toISOString(),
        dayKey: getDayKey(now),
        details: payload.details,
        who: payload.who,
        rating: payload.rating,
      }, { deviceId });
      replaceRecordInState("tastingEntries", nextRecord);
      await persistRecord("tastingEntries", nextRecord);
    } else {
      // Add new entry
      const nextRecord = normalizeCollectionItem("dailyEntries", {
        id: crypto.randomUUID(),
        ...payload,
      }, { deviceId });
      replaceRecordInState("dailyEntries", nextRecord);
      await persistRecord("dailyEntries", nextRecord);
    }

    el.dailyForm.reset();
    setDefaultFormValues();
    render();
    btn.disabled = false;
    closeAllSheets();
    switchTab(entrySubmitTargetTab || "timeline");
    entrySubmitTargetTab = "timeline";
  });

  // ── Milestone form submit ──
  el.milestoneForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = el.milestoneForm.querySelector("button[type=submit]");
    btn.disabled = true;

    const formData = new FormData(el.milestoneForm);
    const type     = String(formData.get("milestone"));

    // One entry per milestone type (replace if exists)
    const existingMilestone = state.milestones.find((m) => m.type === type && !m.deletedAt);
    if (existingMilestone) {
      existingMilestone.deletedAt = new Date().toISOString();
      existingMilestone.updatedAt = existingMilestone.deletedAt;
      await persistRecord("milestones", existingMilestone);
    }

    const nextRecord = normalizeCollectionItem("milestones", {
      id:    crypto.randomUUID(),
      type,
      date:  String(formData.get("date")),
      notes: String(formData.get("notes") || "").trim(),
      who:   currentWho,
    }, { deviceId });

    replaceRecordInState("milestones", nextRecord);
    await persistRecord("milestones", nextRecord);
    el.milestoneForm.reset();
    el.milestoneDate.value = toDateInputValue(new Date());
    render();
    btn.disabled = false;
    closeAllSheets();
    showCelebration();
  });

  // ── Reset today ──
  el.resetToday.addEventListener("click", async () => {
    if (!confirm("למחוק את כל האירועים של היום?")) return;
    const todayKey = getDayKey(new Date());
    const itemsToDelete = state.dailyEntries.filter((entry) => !entry.deletedAt && getDayKey(entry.time) === todayKey);
    await Promise.all(itemsToDelete.map((entry) => softDeleteRecord("dailyEntries", entry)));
    render();
  });

  // ── Quick action buttons ──
  for (const button of el.quickActions) {
    button.addEventListener("click", async () => {
      const type = button.dataset.quickType;

      // Medication or Tasting: open the entry sheet pre-filled so user can specify details
      if (type === "medication" || type === "tasting") {
        openEntrySheetForNew(type, { submitTargetTab: type === "tasting" ? "tastings" : "timeline" });
        return;
      }

      // Poop: ask whether to also log pee
      if (type === "poop") {
        _pendingPoopBtn = button;
        openSheet("sheetPoop");
        return;
      }

      // All other types: instant log
      button.classList.add("quick-action--loading");
      const nextRecord = normalizeCollectionItem("dailyEntries", {
        id:      crypto.randomUUID(),
        type,
        time:    toLocalDateTime(new Date()),
        details: "",
        who:     currentWho,
      }, { deviceId });
      replaceRecordInState("dailyEntries", nextRecord);
      await persistRecord("dailyEntries", nextRecord);
      render();
      button.classList.remove("quick-action--loading");
      button.classList.add("quick-action--done");
      setTimeout(() => button.classList.remove("quick-action--done"), 1200);
    });
  }

  // ── Show/hide ml amount field and medication pills ──
  el.entryType.addEventListener("change", () => {
    const isMeal = el.entryType.value === "meal";
    const isMed  = el.entryType.value === "medication";
    const isTasting = el.entryType.value === "tasting";
    
    el.mlAmountLabel.classList.toggle("hidden", !isMeal);
    el.medPillsSection.classList.toggle("hidden", !isMed);
    el.entryTimeLabel?.classList.toggle("hidden", isTasting);
    if (el.entryTime) {
      el.entryTime.required = !isTasting;
    }
    const tastingRatingSection = document.querySelector("#tastingRatingSection");
    if (tastingRatingSection) {
      tastingRatingSection.classList.toggle("hidden", !isTasting);
    }
    
    if (!isMeal) el.entryMlAmount.value = "";
    if (!isMed) {
      for (const p of el.medPills) p.classList.remove("selected");
    }
    if (!isTasting && tastingRatingSection) {
      const tBtns = tastingRatingSection.querySelectorAll(".rating-btn");
      for (const b of tBtns) b.classList.remove("selected");
    }
  });

  el.entryWhoSelect?.addEventListener("change", () => {
    toggleEntryWhoCustom();
  });

  // ── Medication quick-select pills → populate details field ──
  for (const pill of el.medPills) {
    pill.addEventListener("click", () => {
      for (const p of el.medPills) p.classList.remove("selected");
      pill.classList.add("selected");
      el.entryDetails.value = pill.dataset.med;
    });
  }

  // ── Tasting rating buttons selection ──
  const tastingRatingSection = document.querySelector("#tastingRatingSection");
  if (tastingRatingSection) {
    const ratingBtns = tastingRatingSection.querySelectorAll(".rating-btn");
    for (const btn of ratingBtns) {
      btn.addEventListener("click", () => {
        for (const b of ratingBtns) b.classList.remove("selected");
        btn.classList.add("selected");
      });
    }
  }

  // ── Who toggle: opens caregiver selection sheet ──
  el.whoToggle.addEventListener("click", () => {
    // Highlight the currently-active preset (if any)
    for (const btn of el.caregiverBtns) {
      btn.classList.toggle("active", btn.dataset.who === currentWho);
    }
    el.customCaregiverInput.value = "";
    openSheet("sheetCaregiver");
  });

  // ── Caregiver preset buttons ──
  for (const btn of el.caregiverBtns) {
    btn.addEventListener("click", () => {
      currentWho = btn.dataset.who;
      localStorage.setItem(WHO_KEY, currentWho);
      updateWhoToggle();
      closeAllSheets();
    });
  }

  // ── Custom caregiver apply ──
  el.applyCaregiverBtn.addEventListener("click", () => {
    const name = el.customCaregiverInput.value.trim();
    if (!name) { el.customCaregiverInput.focus(); return; }
    currentWho = name;
    localStorage.setItem(WHO_KEY, currentWho);
    updateWhoToggle();
    closeAllSheets();
  });

  // Allow Enter key in the custom input
  el.customCaregiverInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") el.applyCaregiverBtn.click();
  });

  // ── Theme toggle ──
  el.themeToggle.addEventListener("click", () => {
    const isDark   = document.documentElement.dataset.theme === "dark";
    const newTheme = isDark ? "light" : "dark";
    document.documentElement.dataset.theme = newTheme;
    localStorage.setItem(THEME_KEY, newTheme);
    updateThemeToggle();
  });

  // ── Delete / Edit entry via buttons (event delegation) ──
  el.timeline.addEventListener("click", async (event) => {
    // Edit
    const editBtn = event.target.closest("[data-edit-id], [data-edit-ids]");
    if (editBtn) {
      if (editBtn.dataset.editIds) {
        const groupIds = editBtn.dataset.editIds.split(",").filter(Boolean);
        const groupEntries = groupIds
          .map((id) => state.dailyEntries.find((entry) => entry.id === id))
          .filter(Boolean);
        if (groupEntries.length) openEntrySheetForEdit(groupEntries[0], { groupedEntryIds: groupIds });
      } else {
        const entry = state.dailyEntries.find((e) => e.id === editBtn.dataset.editId);
        if (entry) openEntrySheetForEdit(entry);
      }
      return;
    }
    // Delete
    const deleteBtn = event.target.closest("[data-delete-id], [data-delete-ids]");
    if (!deleteBtn) return;
    animateDeleteItem(deleteBtn.closest(".item-card-wrapper"), async () => {
      const entries = getTimelineEntriesForDelete(deleteBtn);
      await Promise.all(entries.map((entry) => softDeleteRecord("dailyEntries", entry)));
      render();
    });
  });

  // ── Delete milestone via delete button (event delegation) ──
  el.milestonesList.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-delete-milestone]");
    if (!btn) return;
    animateDeleteItem(btn.closest(".item-card-wrapper"), async () => {
      const m = state.milestones.find((m) => m.id === btn.dataset.deleteMilestone);
      await softDeleteRecord("milestones", m);
      render();
    });
  });

  // ── Health Sheet: close via × buttons ──
  el.closeSheetGrowth?.addEventListener("click",   () => closeAllSheets());
  el.closeSheetMedical?.addEventListener("click",  () => closeAllSheets());
  el.closeSheetPumping?.addEventListener("click",  () => closeAllSheets());
  el.closeSheetPoop?.addEventListener("click",     () => closeAllSheets());

  // ── Health Tab in-panel + buttons ──
  el.openGrowthSheet?.addEventListener("click",  () => { setDefaultHealthFormValues(); openSheet("sheetGrowth");  });
  el.openMedicalSheet?.addEventListener("click", () => { setDefaultHealthFormValues(); openSheet("sheetMedical"); });
  el.openPumpingSheet?.addEventListener("click", () => { setDefaultHealthFormValues(); openSheet("sheetPumping"); });

  // ── FAB speed-dial option buttons ──
  el.fabHealthGrowth?.addEventListener("click",  () => { setDefaultHealthFormValues(); openSheet("sheetGrowth");  });
  el.fabHealthMedical?.addEventListener("click", () => { setDefaultHealthFormValues(); openSheet("sheetMedical"); });
  el.fabHealthPumping?.addEventListener("click", () => { setDefaultHealthFormValues(); openSheet("sheetPumping"); });

  el.poopChoiceBoth?.addEventListener("click",   async () => { await logPoopChoice(true); });
  el.poopChoicePoop?.addEventListener("click",   async () => { await logPoopChoice(false); });
  el.poopChoiceCancel?.addEventListener("click", () => closeAllSheets());

  // ── Medical type → show/hide temperature field ──
  el.medicalType?.addEventListener("change", () => {
    const isFever = el.medicalType.value === "fever";
    el.medicalTempLabel?.classList.toggle("hidden", !isFever);
    if (!isFever && el.medicalTemp) el.medicalTemp.value = "";
  });

  // ── Growth form submit ──
  el.growthForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = el.growthForm.querySelector("button[type=submit]");
    btn.disabled = true;

    const nextRecord = normalizeCollectionItem("growthEntries", {
      id:     crypto.randomUUID(),
      date:   el.growthDate.value,
      weight: el.growthWeight.value ? Number(el.growthWeight.value) : null,
      height: el.growthHeight.value ? Number(el.growthHeight.value) : null,
      head:   el.growthHead.value   ? Number(el.growthHead.value)   : null,
      who:    currentWho,
    }, { deviceId });

    replaceRecordInState("growthEntries", nextRecord);
    await persistRecord("growthEntries", nextRecord);
    el.growthForm.reset();
    setDefaultHealthFormValues();
    render();
    btn.disabled = false;
    closeAllSheets();
  });

  // ── Medical form submit ──
  el.medicalForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = el.medicalForm.querySelector("button[type=submit]");
    btn.disabled = true;

    const nextRecord = normalizeCollectionItem("medicalEntries", {
      id:      crypto.randomUUID(),
      date:    el.medicalDate.value,
      type:    el.medicalType.value,
      temp:    el.medicalType.value === "fever" && el.medicalTemp.value ? Number(el.medicalTemp.value) : null,
      details: el.medicalDetails.value.trim(),
      who:     currentWho,
    }, { deviceId });

    replaceRecordInState("medicalEntries", nextRecord);
    await persistRecord("medicalEntries", nextRecord);
    el.medicalForm.reset();
    setDefaultHealthFormValues();
    render();
    btn.disabled = false;
    closeAllSheets();
  });

  // ── Pumping form submit ──
  el.pumpingForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = el.pumpingForm.querySelector("button[type=submit]");
    btn.disabled = true;

    const nextRecord = normalizeCollectionItem("pumpingEntries", {
      id:       crypto.randomUUID(),
      time:     el.pumpingTime.value,
      amount:   Number(el.pumpingAmount.value),
      location: el.pumpingLocation.value,
      who:      currentWho,
    }, { deviceId });

    replaceRecordInState("pumpingEntries", nextRecord);
    await persistRecord("pumpingEntries", nextRecord);
    el.pumpingForm.reset();
    setDefaultHealthFormValues();
    render();
    btn.disabled = false;
    closeAllSheets();
  });

  // ── Delete health entries (event delegation) ──
  el.growthList?.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-delete-growth]");
    if (!btn) return;
    animateDeleteItem(btn.closest(".item-card-wrapper"), async () => {
      const g = state.growthEntries.find((g) => g.id === btn.dataset.deleteGrowth);
      await softDeleteRecord("growthEntries", g);
      render();
    });
  });

  el.medicalList?.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-delete-medical]");
    if (!btn) return;
    animateDeleteItem(btn.closest(".item-card-wrapper"), async () => {
      const med = state.medicalEntries.find((m) => m.id === btn.dataset.deleteMedical);
      await softDeleteRecord("medicalEntries", med);
      render();
    });
  });

  el.pumpingList?.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-delete-pumping]");
    if (!btn) return;
    animateDeleteItem(btn.closest(".item-card-wrapper"), async () => {
      const pump = state.pumpingEntries.find((p) => p.id === btn.dataset.deletePumping);
      await softDeleteRecord("pumpingEntries", pump);
      render();
    });
  });

  el.tastingChecklistGroups?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-tasting-item]");
    if (!button) return;
    openEntrySheetForNew("tasting", {
      prefilledDetails: button.dataset.openTastingItem || "",
      submitTargetTab: "tastings",
    });
  });

  // ── Keyboard: Escape closes sheets ──
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && (activeSheet || healthMenuOpen)) closeAllSheets();
  });
}

// ============================================================
// ENTRY SHEET HELPERS (new / edit)
// ============================================================
function openEntrySheetForNew(preselectedType = null, options = {}) {
  const {
    prefilledDetails = "",
    submitTargetTab = "timeline",
  } = options;

  editingEntryId = null;
  editingEntryGroupIds = null;
  entrySubmitTargetTab = submitTargetTab;
  el.sheetEntryTitle.textContent = "הוספת אירוע";
  el.entrySubmitBtn.textContent  = "שמור אירוע ✓";
  el.dailyForm.reset();
  setDefaultFormValues();
  setEntryWhoValue(currentWho);
  if (preselectedType) {
    el.entryType.value = preselectedType;
    el.entryType.dispatchEvent(new Event("change")); // trigger show/hide logic
    if (preselectedType === "medication") {
      setTimeout(() => el.entryDetails.focus(), 380);
    }
  }
  if (prefilledDetails) {
    el.entryDetails.value = prefilledDetails;
  }
  openSheet("sheetEntry");
}

function openEntrySheetForEdit(entry, options = {}) {
  const groupedEntryIds = Array.isArray(options.groupedEntryIds) ? options.groupedEntryIds : null;
  editingEntryId = entry.id;
  editingEntryGroupIds = groupedEntryIds;
  entrySubmitTargetTab = currentTab === "tastings" ? "tastings" : "timeline";
  setPoopPeeOptionEnabled(Boolean(groupedEntryIds?.length));
  el.sheetEntryTitle.textContent = groupedEntryIds?.length ? "עריכת קקי ופיפי ✏️" : "עריכת אירוע ✏️";
  el.entrySubmitBtn.textContent  = "עדכן אירוע ✓";

  el.entryType.value    = groupedEntryIds?.length ? "poop-pee" : entry.type;
  el.entryTime.value    = toLocalDateTime(new Date(entry.time));
  el.entryDetails.value = entry.details || "";
  setEntryWhoValue(entry.who || currentWho);

  // Trigger conditional field visibility
  el.entryType.dispatchEvent(new Event("change"));

  if (entry.type === "meal" && entry.mlAmount) {
    el.entryMlAmount.value = String(entry.mlAmount);
  }

  // Pre-select a medication or tasting pill if the detail text matches one
  if (entry.type === "medication") {
    for (const pill of el.medPills) {
      if (pill.dataset.med === entry.details) pill.classList.add("selected");
    }
  } else if (entry.type === "tasting" && entry.rating) {
    const ratingBtns = document.querySelectorAll("#tastingRatingSection .rating-btn");
    for (const btn of ratingBtns) {
      if (parseInt(btn.dataset.rating, 10) === entry.rating) {
        btn.classList.add("selected");
      }
    }
  }

  openSheet("sheetEntry");
}

function setEntryWhoValue(value) {
  if (!el.entryWhoSelect) return;

  if (value && WHO_LABELS[value]) {
    el.entryWhoSelect.value = value;
    if (el.entryWhoCustom) el.entryWhoCustom.value = "";
  } else if (value) {
    el.entryWhoSelect.value = "__custom__";
    if (el.entryWhoCustom) el.entryWhoCustom.value = value;
  } else {
    el.entryWhoSelect.value = currentWho;
    if (el.entryWhoCustom) el.entryWhoCustom.value = "";
  }

  toggleEntryWhoCustom();
}

function toggleEntryWhoCustom() {
  const isCustom = el.entryWhoSelect?.value === "__custom__";
  el.entryWhoCustomLabel?.classList.toggle("hidden", !isCustom);
  if (!isCustom && el.entryWhoCustom) {
    el.entryWhoCustom.value = "";
  }
}

function getEntryWhoValue() {
  if (!el.entryWhoSelect) return currentWho;

  if (el.entryWhoSelect.value !== "__custom__") {
    return el.entryWhoSelect.value || currentWho;
  }

  const customName = el.entryWhoCustom?.value.trim() || "";
  if (!customName) {
    el.entryWhoCustom?.focus();
    return "";
  }
  return customName;
}

// ============================================================
// TAB SWITCHING
// ============================================================
function switchTab(tabId) {
  if (activeSheet || healthMenuOpen) {
    closeAllSheets();
  }

  currentTab = tabId;

  // Update tab views
  for (const view of el.tabViews) {
    view.classList.toggle("active", view.id === `tab${capitalize(tabId)}`);
  }

  // Update nav items
  for (const item of el.navItems) {
    item.classList.toggle("active", item.dataset.navTab === tabId);
  }

  applyFabState();
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function setFabHintMarkup(hintEl, hintText) {
  if (!hintEl) return;
  if (!hintText) {
    hintEl.textContent = "";
    return;
  }

  const plusIndex = hintText.indexOf("+");
  if (plusIndex === -1) {
    hintEl.textContent = hintText;
    return;
  }

  const before = hintText.slice(0, plusIndex);
  const after = hintText.slice(plusIndex + 1);
  hintEl.innerHTML = `${before}<strong>+</strong>${after}`;
}

function syncFabHints() {
  for (const hintEl of el.fabHints) {
    const tabId = hintEl.dataset.fabHintFor || "";
    const fabState = getFabStateForTab(tabId);
    setFabHintMarkup(hintEl, fabState.hint);
  }
}

function applyFabState() {
  const fabState = getFabStateForTab(currentTab);
  if (!el.fabAdd) return fabState;

  el.fabAdd.classList.toggle("hidden", !fabState.visible);
  el.fabAdd.dataset.fabAction = fabState.action;

  if (healthMenuOpen && fabState.action === "health-menu") {
    el.fabAdd.classList.add("fab--menu-open");
    el.fabAdd.textContent = "✕";
    el.fabAdd.setAttribute("aria-label", "סגור תפריט בריאות");
  } else {
    el.fabAdd.classList.remove("fab--menu-open");
    el.fabAdd.textContent = fabState.buttonText;
    el.fabAdd.setAttribute("aria-label", fabState.label || "הוסף");
  }

  syncFabHints();
  return fabState;
}

// ============================================================
// BOTTOM SHEET HELPERS
// ============================================================
function openSheet(sheetId) {
  // Close health menu if open
  if (healthMenuOpen) {
    el.fabHealthMenu?.classList.add("hidden");
    healthMenuOpen = false;
  }
  // Close any sheet that's already open
  if (activeSheet && activeSheet !== sheetId) {
    document.querySelector(`#${activeSheet}`)?.classList.remove("open");
  }

  activeSheet = sheetId;
  const sheet = document.querySelector(`#${sheetId}`);
  sheet?.classList.add("open");
  el.sheetOverlay.classList.add("visible");
  document.body.style.overflow = "hidden"; // prevent body scroll behind sheet
  applyFabState();
}

function closeAllSheets() {
  if (!activeSheet && !healthMenuOpen) return;
  if (activeSheet) {
    document.querySelector(`#${activeSheet}`)?.classList.remove("open");
    activeSheet = null;
  }
  if (healthMenuOpen) {
    el.fabHealthMenu?.classList.add("hidden");
    healthMenuOpen = false;
  }
  el.sheetOverlay.classList.remove("visible");
  document.body.style.overflow = "";
  _pendingPoopBtn = null;
  applyFabState();
}

// ============================================================
// HEALTH FAB SPEED-DIAL
// ============================================================
function toggleHealthMenu() {
  healthMenuOpen = !healthMenuOpen;
  if (healthMenuOpen) {
    el.fabHealthMenu?.classList.remove("hidden");
    el.sheetOverlay.classList.add("visible");
  } else {
    el.fabHealthMenu?.classList.add("hidden");
    if (!activeSheet) el.sheetOverlay.classList.remove("visible");
  }
  applyFabState();
}

async function logPoopChoice(includePee) {
  const button = _pendingPoopBtn;
  closeAllSheets();
  if (!button) return;

  button.classList.add("quick-action--loading");

  try {
    const now = new Date();
    const records = [normalizeCollectionItem("dailyEntries", {
      id:      crypto.randomUUID(),
      type:    "poop",
      time:    toLocalDateTime(now),
      details: "",
      who:     currentWho,
    }, { deviceId })];

    if (includePee) {
      records.push(normalizeCollectionItem("dailyEntries", {
        id:      crypto.randomUUID(),
        type:    "pee",
        time:    toLocalDateTime(now),
        details: "",
        who:     currentWho,
      }, { deviceId }));
    }

    for (const record of records) {
      replaceRecordInState("dailyEntries", record);
      await persistRecord("dailyEntries", record);
    }
    render();
    button.classList.add("quick-action--done");
    setTimeout(() => button.classList.remove("quick-action--done"), 1200);
  } finally {
    button.classList.remove("quick-action--loading");
    _pendingPoopBtn = null;
  }
}

// Drag-down to dismiss a bottom sheet
function registerSheetDragDismiss(sheet) {
  const handle = sheet.querySelector(".sheet-handle");
  if (!handle) return;

  let startY = 0, isDragging = false;

  handle.addEventListener("touchstart", (e) => {
    startY = e.touches[0].clientY;
    isDragging = true;
    sheet.style.transition = "none";
  }, { passive: true });

  handle.addEventListener("touchmove", (e) => {
    if (!isDragging) return;
    const dy = Math.max(0, e.touches[0].clientY - startY); // only drag down
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });

  handle.addEventListener("touchend", (e) => {
    if (!isDragging) return;
    isDragging = false;
    sheet.style.transition = "";
    const dy = e.changedTouches[0].clientY - startY;
    if (dy > 80) {
      closeAllSheets();
    } else {
      sheet.style.transform = ""; // snap back
    }
  });
}

// ============================================================
// RENDER
// ============================================================
function render() {
  el.babyNameHeading.textContent = state.babyName;
  el.lastUpdatedLabel.textContent = state.updatedAt
    ? `עודכן ${formatDateTime(state.updatedAt)}`
    : "עדיין לא סונכרן";

  const topbarAge = document.querySelector("#topbarAge");
  if (topbarAge) {
    const age = calcAge(BIRTH_DATE, toDateInputValue(new Date()));
    topbarAge.textContent = age ? `גיל: ${age}` : "";
  }

  const heroAgeDisplay = document.querySelector("#heroAgeDisplay");
  if (heroAgeDisplay) {
    const age = calcAge(BIRTH_DATE, toDateInputValue(new Date()));
    heroAgeDisplay.textContent = age || "";
  }

  // Current age in the topbar
  if (el.ageLabel) {
    const age = calcAge(BIRTH_DATE, toDateInputValue(new Date()));
    el.ageLabel.textContent = age ? `גיל: ${age}` : "";
  }

  const recentDailyEntries = getRecentEntries(state.dailyEntries);
  const todayKey     = getDayKey(new Date());
  const todayEntries = recentDailyEntries.filter((entry) => getDayKey(entry.time) === todayKey);

  // Find key events
  const latestWake  = recentDailyEntries.find((e) => e.type === "wake");
  const latestSleep = recentDailyEntries.find((e) => e.type === "sleep");
  const latestMeal  = recentDailyEntries.find((e) => e.type === "meal");
  const latestEntry = recentDailyEntries[0];
  const restClock = getRestClockState(recentDailyEntries);

  // Awake/sleep duration card
  updateAwakeDurationCard(restClock);

  // Wake time
  el.wakeSummary.textContent = latestWake ? formatTime(latestWake.time) : "עדיין לא";
  el.wakeSince.textContent   = latestWake ? timeSince(latestWake.time)  : "";

  // Sleep
  el.sleepSummary.textContent = latestSleep ? formatTime(latestSleep.time) : "עדיין לא";
  el.sleepSince.textContent   = latestSleep ? timeSince(latestSleep.time)  : "";

  // Counts
  el.mealCount.textContent = String(todayEntries.filter((e) => e.type === "meal").length);
  el.poopCount.textContent = String(todayEntries.filter((e) => e.type === "poop").length);
  el.peeCount.textContent  = String(todayEntries.filter((e) => e.type === "pee").length);
  if (el.medCount) {
    el.medCount.textContent = String(todayEntries.filter((e) => e.type === "medication").length);
  }

  // Sleep duration — time between the last sleep event and the most recent wake event
  el.sleepDuration.textContent = calcSleepDuration(recentDailyEntries);

  // Last meal
  updateLastMealCard(latestMeal);

  // Latest entry
  el.latestEntrySummary.textContent = latestEntry
    ? `${EMOJI[latestEntry.type]} ${LABELS[latestEntry.type]} · ${formatTime(latestEntry.time)}`
    : "עדיין לא עודכן";

  updateWhoToggle();
  
  const selectedDateKey = el.timelineDatePicker && el.timelineDatePicker.value 
    ? el.timelineDatePicker.value 
    : getDayKey(new Date());
  const selectedDateEntries = getVisibleEntries(state.dailyEntries)
    .filter((entry) => entry.type !== "tasting")
    .filter((entry) => getDayKey(entry.time) === selectedDateKey);
  const filteredTimelineEntries = filterTimelineEntries(selectedDateEntries, currentTimelineFilter);
  const groupedTimelineEntries = coalesceHistoryEntries(filteredTimelineEntries);

  renderTimelineBar(selectedDateEntries, selectedDateKey); // Gantt bar = selected date only
  renderTimelineFilters(selectedDateEntries, groupedTimelineEntries, selectedDateKey);
  renderTimelineDaySummary(selectedDateEntries);
  renderTimeline(groupedTimelineEntries, selectedDateKey); // History list = selected date only
  renderTastingChecklist();
  renderMilestones();
  renderGrowth();
  renderMedical();
  renderPumping();
  updateFeedReminder();
}

// ---- 24-Hour Gantt Bar ----
function renderTimelineBar(entries, dateKey) {
  if (!el.timelineBar) return;

  const DAY_MS = 24 * 60 * 60 * 1000;
  const activeDayKey = dateKey || getDayKey(new Date());
  const dayStart = safeDateMs(`${activeDayKey}T00:00:00`, Number.NaN);
  if (!Number.isFinite(dayStart)) return;

  const { sleepBlocks, awakeBlocks, segments, isToday, trackEndTime } = buildTimelineSegments(entries, activeDayKey);

  let htmlElements = segments.map(({ start, end, ongoing, kind }) => {
    const startPct = Math.max(0, Math.min(100, ((start - dayStart) / DAY_MS) * 100));
    const endPct   = Math.max(0, Math.min(100, ((end - dayStart) / DAY_MS) * 100));
    const rightEdge = startPct;
    const widthPct  = Math.max(0.6, endPct - startPct);
    const isActive = timelineBarSelection
      && timelineBarSelection.kind === kind
      && timelineBarSelection.start === String(start)
      && timelineBarSelection.end === String(end)
      && timelineBarSelection.dateKey === activeDayKey;

    return `<button
              class="timeline-bar__segment timeline-bar__segment--${kind}${ongoing ? " timeline-bar__segment--current" : ""}${isActive ? " timeline-bar__segment--active" : ""}"
              style="right:${rightEdge.toFixed(2)}%;width:${widthPct.toFixed(2)}%"
              type="button"
              data-timeline-segment="true"
              data-segment-kind="${kind}"
              data-segment-start="${start}"
              data-segment-end="${end}"
              data-segment-ongoing="${ongoing ? "true" : "false"}"
              data-segment-date="${activeDayKey}"
              aria-label="${kind === "sleep" ? "מקטע שינה" : "מקטע ערות"}"
            ></button>`;
  });

  // Render only the most relevant daily events above the track
  const quickTypes = ["meal", "poop"];
  const eventEntries = entries
    .filter((entry) => quickTypes.includes(entry.type))
    .slice()
    .reverse();

  const eventClusters = [];
  for (const entry of eventEntries) {
    const entryTimeMs = new Date(entry.time).getTime();
    if (entryTimeMs < dayStart || entryTimeMs > trackEndTime) continue;

    const timePct = ((entryTimeMs - dayStart) / DAY_MS) * 100;
    const lastCluster = eventClusters[eventClusters.length - 1];
    if (lastCluster && Math.abs(lastCluster.timePct - timePct) < 6.5) {
      lastCluster.entries.push(entry);
      lastCluster.timePct = (lastCluster.timePct + timePct) / 2;
    } else {
      eventClusters.push({ timePct, entries: [entry] });
    }
  }

  for (const [index, cluster] of eventClusters.entries()) {
    const lane = (index % 2) + 1;
    const typeClass = cluster.entries.some((entry) => entry.type === "poop") ? "poop" : "meal";
    const bubbleContent = cluster.entries
      .map((entry) => EMOJI[entry.type])
      .join(" | ");

    htmlElements.push(
      `<div class="timeline-bar__event timeline-bar__event--${typeClass} timeline-bar__event--lane-${lane}" style="right:${cluster.timePct.toFixed(2)}%;">
        <span class="timeline-bar__event-bubble${cluster.entries.length > 1 ? " timeline-bar__event-bubble--multi" : ""}">${bubbleContent}</span>
        <div class="timeline-bar__event-line"></div>
      </div>`
    );
  }

  // Subtle grid lines at 6h (25%), 12h (50%), 18h (75%)
  [25, 50, 75].forEach(pct => {
    htmlElements.push(`<div class="timeline-bar__grid-line" style="right:${pct}%"></div>`);
  });

  // Current time indicator (today only)
  if (isToday) {
    const nowPct = Math.min(100, ((Date.now() - dayStart) / DAY_MS) * 100);
    htmlElements.push(`<div class="timeline-bar__now" style="right:${nowPct.toFixed(2)}%"></div>`);
  }

  const track = el.timelineBar.querySelector(".timeline-bar__track");
  if (track) track.innerHTML = htmlElements.join("") || "";

  renderTimelineBarDetails(activeDayKey, sleepBlocks, awakeBlocks, isToday);
}

function renderTimelineBarDetails(dateKey, sleepBlocks, awakeBlocks, isToday) {
  if (!el.timelineBarDetails) return;

  const hasSelection = timelineBarSelection
    && timelineBarSelection.dateKey === dateKey;

  if (!hasSelection) {
    el.timelineBarDetails.innerHTML = `
      <strong>מבט מהיר על היום</strong>
      <span>מוצגים כאן רק שינה, האכלות וקקי. לחצו על מקטע ירוק או אפור כדי לראות שעות.</span>
    `;
    return;
  }

  const start = Number(timelineBarSelection.start);
  const end = Number(timelineBarSelection.end);
  const ongoing = timelineBarSelection.ongoing;
  const kind = timelineBarSelection.kind;
  const title = kind === "sleep" ? "ישן" : "ער";
  const fromText = formatTime(start);
  const toText = ongoing && isToday ? "עכשיו" : formatTime(end);
  const durationText = formatDuration(end - start);

  el.timelineBarDetails.innerHTML = `
    <strong>${title} מ-${fromText} עד ${toText}</strong>
    <span>משך המקטע: ${durationText}</span>
  `;
}

// ---- Timeline Render (historical, grouped by date) ----
function renderTimeline(allEntries, selectedDateKey) {
  if (!allEntries.length) {
    el.timeline.innerHTML =
      `<div class="empty-state">${escapeHtml(getHistoryEmptyState(currentTimelineFilter, formatDateHeader(selectedDateKey)))}<br>נסה להחליף סינון או לבחור יום אחר.</div>`;
    return;
  }

  // Group entries by date key — allEntries is already sorted newest-first,
  // so Map insertion order gives us newest-date groups first.
  const groups = new Map();
  for (const entry of allEntries) {
    const key = getDayKey(entry.time);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  const parts = [];
  for (const [dayKey, entries] of groups) {
    // Date group header
    parts.push(`
      <div class="timeline-date-header">
        <span class="timeline-date-header__label">${escapeHtml(formatDateHeader(dayKey))}</span>
        <span class="timeline-date-header__line"></span>
      </div>`);

    // Entry cards for this day
    for (const entry of entries) {
      const whoText     = entry.who ? (WHO_LABELS[entry.who] || entry.who) : "";
      const detailsHtml = entry.details
        ? `<span class="item-meta item-meta--primary">${escapeHtml(entry.details)}</span>`
        : "";
      const mlHtml = entry.mlAmount && entry.type === "meal"
        ? `<span class="item-meta">כמות ${entry.mlAmount} מ״ל</span>`
        : "";
      const groupedDiaperHtml = entry.type === "poop-pee"
        ? `<span class="item-meta item-meta--grouped">קקי ופיפי יחד</span>`
        : "";

      const ratingEmojis = { 1: "🤮", 2: "😒", 3: "😐", 4: "🙂", 5: "😍" };
      let ratingHtml = "";
      if (entry.type === "tasting" && entry.rating) {
        ratingHtml = `<span class="item-meta item-meta--rating" title="דירוג ${entry.rating} מתוך 5">${ratingEmojis[entry.rating] || ""}</span>`;
      }

      const badgeType = entry.type === "poop-pee" ? "diaper-combo" : entry.type;
      const badgeLabel = entry.type === "poop-pee"
        ? `${EMOJI.poop}${EMOJI.pee} קקי + פיפי`
        : `${EMOJI[entry.type] ?? "?"} ${LABELS[entry.type] ?? entry.type}`;
      const editButtonHtml = entry.groupedEntryIds
        ? `<button class="edit-btn" data-edit-ids="${escapeHtml(entry.groupedEntryIds.join(","))}"
                          type="button" aria-label="ערוך">✏️</button>`
        : `<button class="edit-btn" data-edit-id="${escapeHtml(entry.id)}"
                          type="button" aria-label="ערוך">✏️</button>`;
      const deleteButtonAttr = entry.groupedEntryIds
        ? `data-delete-ids="${escapeHtml(entry.groupedEntryIds.join(","))}"`
        : `data-delete-id="${escapeHtml(entry.id)}"`;

      parts.push(`
        <div class="item-card-wrapper">
          <div class="item-card-delete-bg">
            <span class="delete-bg__icon">🗑</span>
            <span>מחק</span>
          </div>
          <article class="item-card item-card--timeline">
            <span class="timeline-card__accent timeline-card__accent--${badgeType}" aria-hidden="true"></span>
            <div class="item-card__row">
              <div class="item-card__left">
                <span class="badge badge--${badgeType}">
                  ${badgeLabel}
                </span>
                ${whoText ? `<span class="badge badge--who">${escapeHtml(whoText)}</span>` : ""}
              </div>
              <div class="item-card__right item-card__right--timeline">
                <span class="item-time">${formatTime(entry.time)}</span>
                <div class="item-card__actions">
                  ${editButtonHtml}
                  <button class="delete-btn" ${deleteButtonAttr}
                          type="button" aria-label="מחק">🗑</button>
                </div>
              </div>
            </div>
            <div class="item-card__meta-line">
              ${ratingHtml}
              ${groupedDiaperHtml}
              ${detailsHtml}
              ${mlHtml}
            </div>
          </article>
        </div>`);
    }
  }

  el.timeline.innerHTML = parts.join("");
}

function renderTimelineFilters(allEntries, filteredEntries, selectedDateKey) {
  for (const btn of el.timelineFilters) {
    btn.classList.toggle("active", btn.dataset.timelineFilter === currentTimelineFilter);
  }

  if (!el.timelineResultsMeta) return;

  const label = formatDateHeader(selectedDateKey);
  const total = allEntries.length;
  const shown = filteredEntries.length;
  const filterLabel = getTimelineFilterLabel(currentTimelineFilter);

  if (!total) {
    el.timelineResultsMeta.textContent = `לא נרשמו אירועים עבור ${label}.`;
    return;
  }

  if (currentTimelineFilter === "all") {
    el.timelineResultsMeta.textContent = `${label}: ${shown} רישומים מוצגים בצורה נקייה וברורה.`;
    return;
  }

  el.timelineResultsMeta.textContent = `${label}: ${shown} רישומים מוצגים בסינון ${filterLabel}.`;
}

function renderTimelineDaySummary(entries) {
  if (!el.timelineDaySummary) return;

  const summary = summarizeHistoryDay(entries);
  const chips = [
    { emoji: "🍼", value: summary.mealCount, label: "ארוחות" },
    { emoji: "🌙", value: summary.sleepEventsCount, label: "שינה" },
    { emoji: "🧷", value: summary.diaperCount, label: "חיתולים" },
    { emoji: "💊", value: summary.healthCount, label: "בריאות" },
  ];

  el.timelineDaySummary.innerHTML = chips
    .map((chip) => `
      <span class="timeline-summary-chip">
        <span class="timeline-summary-chip__emoji">${chip.emoji}</span>
        <strong>${chip.value}</strong>
        <span>${chip.label}</span>
      </span>
    `)
    .join("");
}

function renderTastingChecklist() {
  if (!el.tastingChecklistGroups) return;

  const summary = getTastingChecklistSummary();

  if (el.tastingCompletionText) {
    el.tastingCompletionText.textContent = `${summary.tastedCount} / ${summary.totalCount}`;
  }

  if (el.tastingCompletionBar) {
    el.tastingCompletionBar.style.width = `${Math.max(0, Math.round(summary.progress * 100))}%`;
  }

  if (el.tastingOverview) {
    const overviewChips = [
      { label: "נטעמו", value: `${summary.tastedCount}` },
      { label: "אלרגנים הושלמו", value: `${summary.allergenCompletedCount}` },
      { label: "בתהליך 3 טעימות", value: `${summary.allergenInProgressCount}` },
    ];

    el.tastingOverview.innerHTML = overviewChips.map((chip) => `
      <article class="tasting-overview__card">
        <span class="tasting-overview__label">${escapeHtml(chip.label)}</span>
        <strong>${escapeHtml(chip.value)}</strong>
      </article>
    `).join("");
  }

  for (const chip of el.tastingFilterChips) {
    chip.classList.toggle("active", chip.dataset.tastingFilter === currentTastingFilter);
  }

  if (el.tastingSearchInput && el.tastingSearchInput.value !== currentTastingSearch) {
    el.tastingSearchInput.value = currentTastingSearch;
  }

  if (!summary.visibleGroups.length) {
    el.tastingChecklistGroups.innerHTML = `
      <div class="empty-state">לא נמצאו פריטים שמתאימים לחיפוש או לסינון שבחרת.</div>
    `;
    return;
  }

  el.tastingChecklistGroups.innerHTML = summary.visibleGroups.map((group) => `
    <section class="tasting-group">
      <div class="tasting-group__header">
        <div>
          <p class="panel-kicker">${escapeHtml(group.kicker)}</p>
          <h3>${escapeHtml(group.title)}</h3>
        </div>
        <span class="tasting-group__counter">${group.tastedCount}/${group.totalCount}</span>
      </div>
      <div class="tasting-list">
        ${group.visibleItems.map((item) => {
          const statusClass = item.matchedEntries.length ? "is-tasted" : "is-pending";
          const actionLabel = item.matchedEntries.length ? "עוד טעימה" : "סמן טעימה";
          const latestRating = item.latestEntry?.rating ? (TASTING_RATING_EMOJIS[item.latestEntry.rating] || "") : "";
          const metaParts = [];
          const allergenLabel = getAllergenProgressLabel(item);

          if (item.isAllergen) {
            metaParts.push(allergenLabel.meta);
          } else if (item.matchedEntries.length) {
            metaParts.push("סומן בצ'קליסט");
          }

          if (latestRating) metaParts.push(`תגובה ${latestRating}`);

          return `
            <button class="tasting-item ${statusClass}" type="button" data-open-tasting-item="${escapeHtml(item.label)}">
              <span class="tasting-item__status" aria-hidden="true">${item.matchedEntries.length ? "✓" : "+"}</span>
              <span class="tasting-item__body">
                <span class="tasting-item__title-row">
                  <strong>${escapeHtml(item.label)}</strong>
                  ${item.isAllergen ? `<span class="tasting-item__pill tasting-item__pill--allergen">${escapeHtml(allergenLabel.pill)}</span>` : ""}
                </span>
                <span class="tasting-item__meta">${escapeHtml(metaParts.join(" · ") || "עדיין לא תועד")}</span>
              </span>
              <span class="tasting-item__cta">${escapeHtml(actionLabel)}</span>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `).join("");
}

function filterTimelineEntries(entries, filterKey) {
  const groups = {
    all: () => true,
    sleep: (entry) => entry.type === "sleep" || entry.type === "wake",
    food: (entry) => entry.type === "meal",
    diaper: (entry) => entry.type === "poop" || entry.type === "pee",
    health: (entry) => entry.type === "medication",
  };

  const predicate = groups[filterKey] || groups.all;
  return entries.filter(predicate);
}

function getTimelineFilterLabel(filterKey) {
  const labels = {
    all: "הכל",
    sleep: "שינה",
    food: "אוכל",
    diaper: "חיתולים",
    health: "בריאות",
  };
  return labels[filterKey] || labels.all;
}

function getTastingChecklistSummary() {
  const legacyTastingEntries = getVisibleEntries(state.dailyEntries)
    .filter((entry) => entry.type === "tasting" && entry.details)
    .map((entry) => normalizeCollectionItem("tastingEntries", {
      id: entry.id,
      createdAt: entry.time || entry.createdAt,
      updatedAt: entry.updatedAt,
      deletedAt: entry.deletedAt,
      dayKey: entry.dayKey || getDayKey(entry.time),
      details: entry.details,
      who: entry.who,
      rating: entry.rating,
      sourceDeviceId: entry.sourceDeviceId,
    }, { deviceId }));
  const tastingEntries = [
    ...getVisibleEntries(state.tastingEntries),
    ...legacyTastingEntries,
  ];

  const groups = TASTING_CHECKLIST_INDEX.map((group) => {
    const items = group.items.map((item) => {
      const matchedEntries = tastingEntries.filter((entry) => {
        const normalizedDetails = normalizeTastingText(entry.details);
        return item.normalizedAliases.some((alias) => alias && normalizedDetails.includes(alias));
      });
      const sortedEntries = matchedEntries
        .slice()
        .sort((a, b) => safeDateMs(b.createdAt || b.time, 0) - safeDateMs(a.createdAt || a.time, 0));
      const allergenProgressCount = item.isAllergen ? Math.min(3, sortedEntries.length) : 0;

      return {
        ...item,
        matchedEntries: sortedEntries,
        latestEntry: sortedEntries[0] || null,
        allergenProgressCount,
      };
    });

    return {
      ...group,
      items,
      totalCount: items.length,
      tastedCount: items.filter((item) => item.matchedEntries.length).length,
    };
  });

  const flatItems = groups.flatMap((group) => group.items);
  const tastedItems = flatItems.filter((item) => item.matchedEntries.length);
  const allergenItems = flatItems.filter((item) => item.isAllergen);
  const allergenCompletedCount = allergenItems.filter((item) => item.allergenProgressCount >= 3).length;
  const allergenInProgressCount = allergenItems.filter((item) => item.allergenProgressCount > 0 && item.allergenProgressCount < 3).length;
  const visibleGroups = groups
    .map((group) => {
      const visibleItems = group.items.filter((item) => matchesTastingFilter(item) && matchesTastingSearch(item));
      return {
        ...group,
        visibleItems,
        visibleCount: visibleItems.length,
      };
    })
    .filter((group) => group.visibleItems.length);

  return {
    groups,
    visibleGroups,
    totalCount: flatItems.length,
    tastedCount: tastedItems.length,
    allergenTastedCount: tastedItems.filter((item) => item.isAllergen).length,
    allergenCompletedCount,
    allergenInProgressCount,
    progress: flatItems.length ? tastedItems.length / flatItems.length : 0,
  };
}

function matchesTastingFilter(item) {
  if (currentTastingFilter === "pending") return !item.matchedEntries.length;
  if (currentTastingFilter === "allergens") return item.isAllergen;
  if (currentTastingFilter === "done") {
    if (item.isAllergen) return item.allergenProgressCount >= 3;
    return item.matchedEntries.length > 0;
  }
  return true;
}

function matchesTastingSearch(item) {
  if (!currentTastingSearch) return true;
  const normalizedSearch = normalizeTastingText(currentTastingSearch);
  if (!normalizedSearch) return true;
  return item.normalizedAliases.some((alias) => alias.includes(normalizedSearch));
}

function getAllergenProgressLabel(item) {
  const progress = Math.min(3, item.allergenProgressCount || 0);
  if (progress >= 3) {
    return {
      pill: "אלרגן 3/3",
      meta: "הושלמו 3 טעימות",
    };
  }

  if (progress > 0) {
    return {
      pill: `אלרגן ${progress}/3`,
      meta: `נספרו ${progress}/3 טעימות`,
    };
  }

  return {
    pill: "אלרגן 0/3",
    meta: "צריך 3 טעימות",
  };
}

function getTimelineEntriesForDelete(button) {
  if (button.dataset.deleteIds) {
    return button.dataset.deleteIds
      .split(",")
      .map((id) => state.dailyEntries.find((entry) => entry.id === id))
      .filter(Boolean);
  }

  if (button.dataset.deleteId) {
    const entry = state.dailyEntries.find((candidate) => candidate.id === button.dataset.deleteId);
    return entry ? [entry] : [];
  }

  return [];
}

// ---- Milestones Render ----
function renderMilestones() {
  const visibleMilestones = getVisibleEntries(state.milestones);
  if (!visibleMilestones.length) {
    el.milestonesList.innerHTML =
      `<div class="empty-state">כאן יופיעו הרגעים הגדולים של ${escapeHtml(state.babyName)} — התהפכות, זחילה והליכה.</div>`;
    return;
  }

  el.milestonesList.innerHTML = visibleMilestones
    .map((m) => {
      const whoText    = m.who ? (WHO_LABELS[m.who] || m.who) : "";
      const ageAtEvent = calcAge(BIRTH_DATE, m.date);
      const notesHtml  = m.notes
        ? `<span class="item-meta">${escapeHtml(m.notes)}</span>`
        : "";

      return `
        <div class="item-card-wrapper">
          <div class="item-card-delete-bg">
            <span class="delete-bg__icon">🗑</span>
            <span>מחק</span>
          </div>
          <article class="item-card">
            <div class="item-card__row">
              <div class="item-card__left">
                <span class="badge badge--milestone">${EMOJI[m.type]} ${LABELS[m.type]}</span>
                ${whoText ? `<span class="badge badge--who">${escapeHtml(whoText)}</span>` : ""}
              </div>
              <div class="item-card__right">
                <strong>${formatDate(m.date)}</strong>
                <button class="delete-btn" data-delete-milestone="${escapeHtml(m.id)}"
                        type="button" aria-label="מחק">🗑</button>
              </div>
            </div>
            ${ageAtEvent ? `<span class="item-meta">בגיל ${escapeHtml(ageAtEvent)}</span>` : ""}
            ${notesHtml}
          </article>
        </div>
      `;
    })
    .join("");

  setupSwipeToDelete(el.milestonesList, "milestone");
}

// ---- Growth Render ----
function renderGrowth() {
  if (!el.growthList) return;

  const visibleGrowth = getVisibleEntries(state.growthEntries);
  if (!visibleGrowth.length) {
    el.growthList.innerHTML =
      `<div class="empty-state">אין מדידות עדיין.<br>לחץ על + מדידה להוספת מדידה חדשה.</div>`;
    return;
  }

  el.growthList.innerHTML = visibleGrowth
    .map((g) => {
      const whoText = g.who ? (WHO_LABELS[g.who] || g.who) : "";
      const parts = [];
      if (g.weight != null) parts.push(`<span class="item-meta">⚖️ ${g.weight} ק״ג</span>`);
      if (g.height != null) parts.push(`<span class="item-meta">📐 ${g.height} ס״מ</span>`);
      if (g.head   != null) parts.push(`<span class="item-meta">🧠 ${g.head} ס״מ</span>`);
      const ageAtMeasure = calcAge(BIRTH_DATE, g.date);

      return `
        <div class="item-card-wrapper">
          <div class="item-card-delete-bg">
            <span class="delete-bg__icon">🗑</span>
            <span>מחק</span>
          </div>
          <article class="item-card">
            <div class="item-card__row">
              <div class="item-card__left">
                <span class="badge badge--growth">📏 מדידה</span>
                ${whoText ? `<span class="badge badge--who">${escapeHtml(whoText)}</span>` : ""}
              </div>
              <div class="item-card__right">
                <strong>${formatDate(g.date)}</strong>
                <button class="delete-btn" data-delete-growth="${escapeHtml(g.id)}"
                        type="button" aria-label="מחק">🗑</button>
              </div>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
              ${parts.join("")}
              ${ageAtMeasure ? `<span class="item-meta">· גיל: ${escapeHtml(ageAtMeasure)}</span>` : ""}
            </div>
          </article>
        </div>`;
    })
    .join("");

  setupSwipeToDelete(el.growthList, "growth");
}

// ---- Medical Render ----
const MEDICAL_LABELS = { vaccine: "💉 חיסון", doctor: "🩺 רופא", fever: "🌡️ חום", note: "📝 הערה" };

function renderMedical() {
  if (!el.medicalList) return;

  const visibleMedical = getVisibleEntries(state.medicalEntries);
  if (!visibleMedical.length) {
    el.medicalList.innerHTML =
      `<div class="empty-state">אין אירועים רפואיים עדיין.<br>לחץ על + אירוע להוספה.</div>`;
    return;
  }

  el.medicalList.innerHTML = visibleMedical
    .map((m) => {
      const whoText = m.who ? (WHO_LABELS[m.who] || m.who) : "";
      const typeLabel = MEDICAL_LABELS[m.type] || m.type;
      const tempHtml = m.temp != null
        ? `<span class="item-meta">🌡️ ${m.temp}°C</span>`
        : "";
      const detailsHtml = m.details
        ? `<span class="item-meta">${escapeHtml(m.details)}</span>`
        : "";

      return `
        <div class="item-card-wrapper">
          <div class="item-card-delete-bg">
            <span class="delete-bg__icon">🗑</span>
            <span>מחק</span>
          </div>
          <article class="item-card">
            <div class="item-card__row">
              <div class="item-card__left">
                <span class="badge badge--${escapeHtml(m.type)}">${typeLabel}</span>
                ${whoText ? `<span class="badge badge--who">${escapeHtml(whoText)}</span>` : ""}
              </div>
              <div class="item-card__right">
                <strong>${formatDate(m.date)}</strong>
                <button class="delete-btn" data-delete-medical="${escapeHtml(m.id)}"
                        type="button" aria-label="מחק">🗑</button>
              </div>
            </div>
            ${(tempHtml || detailsHtml) ? `<div style="display: flex; gap: 8px; flex-wrap: wrap;">${tempHtml}${detailsHtml}</div>` : ""}
          </article>
        </div>`;
    })
    .join("");

  setupSwipeToDelete(el.medicalList, "medical");
}

// ---- Pumping Render ----
const PUMPING_LOCATION_LABELS = { fridge: "❄️ מקרר", freezer: "🧊 מקפיא" };

function renderPumping() {
  if (!el.pumpingList || !el.pumpingTotalMl) return;

  const visiblePumping = getVisibleEntries(state.pumpingEntries);

  // Total stash (only non-deleted)
  const totalMl = visiblePumping.reduce((sum, p) => sum + (p.amount || 0), 0);
  el.pumpingTotalMl.textContent = `${totalMl} מ״ל`;

  if (!visiblePumping.length) {
    el.pumpingList.innerHTML =
      `<div class="empty-state">אין שאיבות עדיין.<br>לחץ על + שאיבה להוספת שאיבה חדשה.</div>`;
    return;
  }

  el.pumpingList.innerHTML = visiblePumping
    .map((p) => {
      const whoText  = p.who ? (WHO_LABELS[p.who] || p.who) : "";
      const locLabel = PUMPING_LOCATION_LABELS[p.location] || p.location || "";

      return `
        <div class="item-card-wrapper">
          <div class="item-card-delete-bg">
            <span class="delete-bg__icon">🗑</span>
            <span>מחק</span>
          </div>
          <article class="item-card">
            <div class="item-card__row">
              <div class="item-card__left">
                <span class="badge badge--pumping">🍶 שאיבה</span>
                <span class="item-meta">${p.amount} מ״ל</span>
                ${whoText ? `<span class="badge badge--who">${escapeHtml(whoText)}</span>` : ""}
              </div>
              <div class="item-card__right">
                <strong>${formatTime(p.time)}</strong>
                <button class="delete-btn" data-delete-pumping="${escapeHtml(p.id)}"
                        type="button" aria-label="מחק">🗑</button>
              </div>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              ${locLabel ? `<span class="item-meta">${locLabel}</span>` : ""}
              <span class="item-meta">${formatDate(p.time)}</span>
            </div>
          </article>
        </div>`;
    })
    .join("");

  setupSwipeToDelete(el.pumpingList, "pumping");
}

// ============================================================
// SWIPE-TO-DELETE
// ============================================================
function setupSwipeToDelete(container, type) {
  const wrappers = container.querySelectorAll(".item-card-wrapper");

  for (const wrapper of wrappers) {
    const card = wrapper.querySelector(".item-card");
    if (!card) continue;

    let startX = 0, currentX = 0, isDragging = false;
    const THRESHOLD = -75; // px to the left needed to trigger delete

    card.addEventListener("touchstart", (e) => {
      startX = e.touches[0].clientX;
      isDragging = true;
      card.style.transition = "none";
    }, { passive: true });

    card.addEventListener("touchmove", (e) => {
      if (!isDragging) return;
      const dx = e.touches[0].clientX - startX;
      currentX = Math.min(0, dx); // only allow left swipe (negative X)
      card.style.transform = `translateX(${currentX}px)`;
    }, { passive: true });

    card.addEventListener("touchend", () => {
      if (!isDragging) return;
      isDragging = false;
      card.style.transition = ""; // restore CSS transition

      if (currentX < THRESHOLD) {
        // Confirmed delete — animate off-screen then remove
        card.style.transform = "translateX(-110%)";
        setTimeout(async () => {
          await triggerSwipeDelete(wrapper, type);
        }, 220);
      } else {
        // Snap back
        card.style.transform = "translateX(0)";
      }
      currentX = 0;
    });
  }
}

async function triggerSwipeDelete(wrapper, type) {
  // Identify what to delete from the child delete button's data attribute
  const deleteBtn    = wrapper.querySelector("[data-delete-id]");
  const deleteBtns   = wrapper.querySelector("[data-delete-ids]");
  const milestoneBtn = wrapper.querySelector("[data-delete-milestone]");
  const growthBtn    = wrapper.querySelector("[data-delete-growth]");
  const medicalBtn   = wrapper.querySelector("[data-delete-medical]");
  const pumpingBtn   = wrapper.querySelector("[data-delete-pumping]");

  if (type === "entry" && (deleteBtn || deleteBtns)) {
    const items = getTimelineEntriesForDelete(deleteBtns || deleteBtn);
    await Promise.all(items.map((entry) => softDeleteRecord("dailyEntries", entry)));
  } else if (type === "milestone" && milestoneBtn) {
    const m = state.milestones.find((m) => m.id === milestoneBtn.dataset.deleteMilestone);
    await softDeleteRecord("milestones", m);
  } else if (type === "growth" && growthBtn) {
    const g = state.growthEntries.find((g) => g.id === growthBtn.dataset.deleteGrowth);
    await softDeleteRecord("growthEntries", g);
  } else if (type === "medical" && medicalBtn) {
    const med = state.medicalEntries.find((m) => m.id === medicalBtn.dataset.deleteMedical);
    await softDeleteRecord("medicalEntries", med);
  } else if (type === "pumping" && pumpingBtn) {
    const pump = state.pumpingEntries.find((p) => p.id === pumpingBtn.dataset.deletePumping);
    await softDeleteRecord("pumpingEntries", pump);
  }
  render();
}

// Animate collapse + callback for button-triggered delete
function animateDeleteItem(wrapper, callback) {
  if (!wrapper) { callback(); return; }
  const card = wrapper.querySelector(".item-card");
  if (card) {
    card.style.transition = "transform 200ms ease";
    card.style.transform = "translateX(-110%)";
  }
  setTimeout(callback, 220);
}

// ============================================================
// SYNC STATUS
// ============================================================
function setSyncStatus(status) {
  const badge    = el.syncBadge;
  const textSpan = badge.querySelector(".sync-badge__text");
  badge.className = "sync-badge";

  if (status === "online") {
    textSpan.textContent = "מסונכרן";
  } else if (status === "syncing") {
    textSpan.textContent = "מסתנכרן...";
  } else if (status === "local-only") {
    textSpan.textContent = "מקומי בלבד";
    badge.classList.add("sync-badge--offline");
  } else if (status === "error") {
    textSpan.textContent = "שגיאת סנכרון";
    badge.classList.add("sync-badge--warning");
  } else if (status === "not-configured") {
    textSpan.textContent = "הגדר Firebase";
    badge.classList.add("sync-badge--warning");
  }
}

// ============================================================
// WHO TOGGLE
// ============================================================
function updateWhoToggle() {
  if (!el.whoToggle) return;
  const presets = { 
    mom: "👩 אמא", 
    dad: "👨 אבא", 
    sabaHaim: "👴 סבא חיים",
    savtaBruria: "👵 סבתא ברוריה",
    savtaNaama: "👵 סבתא נעמה",
    lulit: "🦸‍♀️ לולית"
  };
  el.whoToggle.textContent = presets[currentWho] ?? `🧑 ${currentWho}`;
  el.whoToggle.dataset.who = currentWho;
}

// ============================================================
// THEME
// ============================================================
function applyTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "light";
  document.documentElement.dataset.theme = saved;
  updateThemeToggle();
}

function updateThemeToggle() {
  if (!el.themeToggle) return;
  const isDark = document.documentElement.dataset.theme === "dark";
  el.themeToggle.textContent = isDark ? "☀️" : "🌙";
  el.themeToggle.title       = isDark ? "מעבר למצב בהיר" : "מעבר למצב כהה";
}

// ============================================================
// DATE / TIME UTILITIES
// ============================================================
function setDefaultFormValues() {
  editingEntryId = null;
  editingEntryGroupIds = null;
  el.entryTime.value = toLocalDateTime(new Date());
  setEntryWhoValue(currentWho);
  if (el.milestoneDate)   el.milestoneDate.value = toDateInputValue(new Date());
  if (el.mlAmountLabel)   el.mlAmountLabel.classList.add("hidden");
  if (el.medPillsSection) el.medPillsSection.classList.add("hidden");
  if (el.entryTimeLabel)  el.entryTimeLabel.classList.remove("hidden");
  if (el.entryTime)       el.entryTime.required = true;
  
  const tastingRatingSection = document.querySelector("#tastingRatingSection");
  if (tastingRatingSection) {
    tastingRatingSection.classList.add("hidden");
    const tBtns = tastingRatingSection.querySelectorAll(".rating-btn");
    for (const b of tBtns) b.classList.remove("selected");
  }

  for (const p of el.medPills) p.classList.remove("selected");
  setPoopPeeOptionEnabled(false);
  if (el.sheetEntryTitle) el.sheetEntryTitle.textContent = "הוספת אירוע";
  if (el.entrySubmitBtn)  el.entrySubmitBtn.textContent  = "שמור אירוע ✓";
}

function setDefaultHealthFormValues() {
  if (el.growthDate)     el.growthDate.value   = toDateInputValue(new Date());
  if (el.medicalDate)    el.medicalDate.value   = toDateInputValue(new Date());
  if (el.pumpingTime)    el.pumpingTime.value   = toLocalDateTime(new Date());
  if (el.medicalTempLabel) el.medicalTempLabel.classList.add("hidden");
  if (el.medicalTemp)    el.medicalTemp.value   = "";
}

function formatTime(value) {
  return new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit" })
    .format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit", month: "long", year: "numeric",
  }).format(new Date(value));
}

function timeSince(value) {
  const diffMs  = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1)  return "עכשיו";
  if (minutes < 60) return `לפני ${minutes} דק׳`;
  const hours = Math.floor(minutes / 60);
  const mins  = minutes % 60;
  if (mins === 0) return `לפני ${hours} שע׳`;
  return `לפני ${hours}:${String(mins).padStart(2, "0")} שע׳`;
}

function setPoopPeeOptionEnabled(enabled) {
  if (!el.entryTypePoopPee) return;
  el.entryTypePoopPee.hidden = !enabled;
  el.entryTypePoopPee.disabled = !enabled;
}

function getDiaperTypesForEntryType(type) {
  return type === "poop-pee" ? ["poop", "pee"] : [type];
}

async function persistDiaperRecords(records) {
  for (const record of records) {
    replaceRecordInState("dailyEntries", record);
    await persistRecord("dailyEntries", record);
  }
}

async function saveDiaperComboRecords(payload, existingIds = []) {
  const desiredTypes = getDiaperTypesForEntryType(payload.type);
  const existingRecords = existingIds
    .map((id) => state.dailyEntries.find((entry) => entry.id === id))
    .filter(Boolean);

  const recordsByType = new Map(existingRecords.map((record) => [record.type, record]));
  const recordsToPersist = [];

  for (const type of desiredTypes) {
    const baseRecord = recordsByType.get(type) || existingRecords.find((record) => !desiredTypes.includes(record.type));
    const nextRecord = normalizeCollectionItem("dailyEntries", {
      ...(baseRecord || {}),
      id: baseRecord?.id || crypto.randomUUID(),
      type,
      time: payload.time,
      details: payload.details,
      who: payload.who,
      mlAmount: null,
      rating: null,
      updatedAt: new Date().toISOString(),
    }, { deviceId });
    recordsToPersist.push(nextRecord);
  }

  const desiredIds = new Set(recordsToPersist.map((record) => record.id));
  const recordsToDelete = existingRecords.filter((record) => !desiredIds.has(record.id) && !record.deletedAt);

  if (recordsToDelete.length) {
    await Promise.all(recordsToDelete.map((record) => softDeleteRecord("dailyEntries", record)));
  }

  await persistDiaperRecords(recordsToPersist);
}

function updateLastMealCard(latestMeal) {
  if (!el.lastMealSummary || !el.lastMealSince) return;

  const mealClock = getMealClockState(latestMeal);

  if (!mealClock.hasMeal || !latestMeal) {
    el.lastMealSummary.textContent = "עדיין לא";
    el.lastMealSince.textContent = "";
    if (el.lastMealCountdown) el.lastMealCountdown.textContent = "אין ארוחה מתועדת עדיין";
    if (el.lastMealProgressFill) el.lastMealProgressFill.style.width = "0%";
    if (el.lastMealCard) el.lastMealCard.dataset.mealStatus = "empty";
    return;
  }

  el.lastMealSummary.textContent = formatTime(latestMeal.time);
  el.lastMealSince.textContent = `עברו ${formatDuration(mealClock.elapsedMs)}`;

  if (el.lastMealCountdown) {
    if (mealClock.status === "due") {
      const overdueMs = Math.max(0, mealClock.elapsedMs - mealClock.targetMs);
      el.lastMealCountdown.textContent = overdueMs > 0
        ? `עברנו את היעד ב־${formatDuration(overdueMs)}`
        : "הגענו ל־3 שעות";
    } else {
      el.lastMealCountdown.textContent = `עוד ${formatDuration(mealClock.remainingMs)} ל־3 שעות`;
    }
  }

  if (el.lastMealProgressFill) {
    el.lastMealProgressFill.style.width = `${Math.round(mealClock.progressRatio * 100)}%`;
  }

  if (el.lastMealCard) {
    el.lastMealCard.dataset.mealStatus = mealClock.status;
  }
}

function updateAwakeDurationCard(restClock) {
  if (!el.awakeDurationSummary || !el.awakeDurationSince) return;

  if (!restClock?.hasState) {
    if (el.awakeDurationLabel) el.awakeDurationLabel.textContent = "☀️ זמן ערות";
    el.awakeDurationSummary.textContent = "לא ידוע";
    el.awakeDurationSince.textContent = "";
    if (el.awakeDurationProgressFill) el.awakeDurationProgressFill.style.width = "0%";
    if (el.awakeDurationCard) el.awakeDurationCard.dataset.awakeStatus = "unknown";
    return;
  }

  const timelineCapMs = 4 * 60 * 60 * 1000;
  const progressRatio = Math.min(1, restClock.durationMs / timelineCapMs);

  if (el.awakeDurationLabel) el.awakeDurationLabel.textContent = restClock.title;
  el.awakeDurationSummary.textContent = formatDuration(restClock.durationMs);
  el.awakeDurationSince.textContent = restClock.context || "";

  if (el.awakeDurationProgressFill) {
    el.awakeDurationProgressFill.style.width = `${Math.round(progressRatio * 100)}%`;
  }

  if (el.awakeDurationCard) {
    el.awakeDurationCard.dataset.awakeStatus = restClock.status || "unknown";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&",  "&amp;")
    .replaceAll("<",  "&lt;")
    .replaceAll(">",  "&gt;")
    .replaceAll('"',  "&quot;")
    .replaceAll("'",  "&#39;");
}

function normalizeTastingText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[׳״"'`]/g, "")
    .replace(/[^a-z0-9\u0590-\u05ff]+/gi, "");
}

// ============================================================
// CELEBRATION ANIMATION
// ============================================================
function showCelebration() {
  const el = document.createElement("div");
  el.className   = "celebration";
  el.textContent = "🎉";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2300);
}

// ============================================================
// SERVICE WORKER (PWA offline support)
// ============================================================
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    let hasReloadedForSw = false;

    navigator.serviceWorker
      .register("./service-worker.js", { updateViaCache: "none" })
      .then((registration) => {
        registration.update().catch(() => undefined);

        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (hasReloadedForSw) return;
          hasReloadedForSw = true;
          window.location.reload();
        });
      })
      .catch(() => undefined);
  }
}

// ============================================================
// FEED REMINDER BANNER
// ============================================================
/**
 * Shows a reminder banner on the Home tab when:
 * 1. The most recent meal event was logged by someone OTHER than "mom"
 * 2. At least 2 hours and 45 minutes have passed since that meal
 *
 * If "mom" logged the last meal, the banner stays hidden.
 * The banner disappears once a new meal is logged.
 */
function updateFeedReminder() {
  if (!el.feedReminderBanner || !el.feedReminderText) return;

  const reminder = getFeedReminderState(state.dailyEntries);
  if (!reminder.visible || !reminder.entry) {
    el.feedReminderBanner.classList.add("hidden");
    return;
  }

  const whoName = WHO_LABELS[reminder.entry.who] || reminder.entry.who || "מישהו";
  const mealTimeFormatted = formatTime(reminder.entry.time);
  const elapsedText = formatDuration(reminder.elapsedMs);

  el.feedReminderText.textContent =
    `${whoName} האכיל/ה בשעה ${mealTimeFormatted} (לפני ${elapsedText}). הגיע הזמן להאכיל שוב! 🍼`;
  el.feedReminderBanner.classList.remove("hidden");
}

initialize();
