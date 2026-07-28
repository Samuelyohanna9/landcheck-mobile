import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { type SponsorAchievements, type SponsorPointsInfo, fetchSponsorAchievements, fetchSponsorOrders, fetchSponsorPoints, fetchSponsorTrees } from "../api/sponsor";
import { getSponsorFirstName } from "../sponsor/presentation";
import type { MobileSession, SponsorOrderSummary, SponsorTreeSummary } from "../types/domain";
import { requestGreenNotificationPermission, SPONSOR_CHANNEL_ID, supportsNativeNotifications } from "./greenNotifications";

const SPONSOR_REMINDER_IDS_STORAGE_KEY = "sponsor:engagement-notification-ids";
const SPONSOR_REMINDER_SNAPSHOT_STORAGE_KEY = "sponsor:engagement-notification-snapshot";
const SPONSOR_REMINDER_DAYS = 10;
const SPONSOR_REMINDER_MIN_LEAD_MS = 45 * 60 * 1000;
const SPONSOR_REMINDER_REFRESH_WINDOW_MS = 10 * 60 * 1000;

type SponsorReminderSnapshot = {
  sponsorId: number;
  firstName: string;
  liveTrees: number;
  reservedTrees: number;
  pendingOrders: number;
  confirmedOrders: number;
  projectCount: number;
  greenPoints: number;
  level: string | null;
  nextLevel: string | null;
  treesToNextLevel: number | null;
  featuredProjectName: string | null;
  updatedAt: string;
};

type SponsorReminderMessage = {
  title: string;
  body: string;
  route: "SponsorProjects" | "SponsorTrees";
};

type StoredSponsorReminderState = {
  sponsorId: number;
  notificationIds: string[];
};

let lastScheduledSponsorId = 0;
let lastScheduledAt = 0;
let schedulingPromise: Promise<void> | null = null;

const pluralize = (count: number, singular: string, plural = `${singular}s`) => (count === 1 ? singular : plural);

const normalizeStage = (value?: string | null) => String(value || "").trim().toLowerCase();

const isPendingOrder = (order?: SponsorOrderSummary | null) => {
  const orderStatus = normalizeStage(order?.order_status);
  const paymentStatus = normalizeStage(order?.payment_status);
  return (
    ["pending_payment", "payment_review", "proof_submitted", "pending"].includes(orderStatus) ||
    ["pending_payment", "payment_review", "proof_submitted", "pending"].includes(paymentStatus) ||
    Number(order?.awaiting_payment_units || 0) > 0
  );
};

const isConfirmedOrder = (order?: SponsorOrderSummary | null) => {
  const orderStatus = normalizeStage(order?.order_status);
  const paymentStatus = normalizeStage(order?.payment_status);
  return (
    ["paid", "allocated", "completed"].includes(orderStatus) ||
    ["paid", "verified"].includes(paymentStatus) ||
    Number(order?.linked_units || 0) > 0 ||
    Number(order?.awaiting_tree_units || 0) > 0
  );
};

const getReservedTreeCount = (orders: SponsorOrderSummary[], trees: SponsorTreeSummary[]) => {
  if (trees.length > 0) return trees.length;
  return orders.reduce((sum, order) => {
    const next = Math.max(
      Number(order.total_units || 0),
      Number(order.quantity || 0),
      Number(order.linked_units || 0) + Number(order.awaiting_tree_units || 0) + Number(order.awaiting_payment_units || 0),
    );
    return sum + Math.max(next, 0);
  }, 0);
};

const resolveFeaturedProjectName = (orders: SponsorOrderSummary[], trees: SponsorTreeSummary[]) => {
  const counts = new Map<string, number>();
  [...orders, ...trees].forEach((row) => {
    const name = String(row?.project_name || "").trim();
    if (!name) return;
    counts.set(name, (counts.get(name) || 0) + 1);
  });

  let topName: string | null = null;
  let topCount = 0;
  counts.forEach((count, name) => {
    if (count > topCount) {
      topCount = count;
      topName = name;
    }
  });
  return topName;
};

const readStoredReminderState = async (): Promise<StoredSponsorReminderState | null> => {
  try {
    const raw = await AsyncStorage.getItem(SPONSOR_REMINDER_IDS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSponsorReminderState;
    if (!parsed || typeof parsed.sponsorId !== "number" || !Array.isArray(parsed.notificationIds)) return null;
    return {
      sponsorId: parsed.sponsorId,
      notificationIds: parsed.notificationIds.filter((value) => typeof value === "string" && value.trim()),
    };
  } catch {
    return null;
  }
};

const writeStoredReminderState = async (value: StoredSponsorReminderState | null) => {
  if (!value) {
    await AsyncStorage.removeItem(SPONSOR_REMINDER_IDS_STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(SPONSOR_REMINDER_IDS_STORAGE_KEY, JSON.stringify(value));
};

const readStoredSnapshot = async (sponsorId: number): Promise<SponsorReminderSnapshot | null> => {
  try {
    const raw = await AsyncStorage.getItem(SPONSOR_REMINDER_SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SponsorReminderSnapshot;
    if (!parsed || parsed.sponsorId !== sponsorId) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeStoredSnapshot = async (value: SponsorReminderSnapshot | null) => {
  if (!value) {
    await AsyncStorage.removeItem(SPONSOR_REMINDER_SNAPSHOT_STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(SPONSOR_REMINDER_SNAPSHOT_STORAGE_KEY, JSON.stringify(value));
};

const buildFallbackSnapshot = (session: MobileSession): SponsorReminderSnapshot => ({
  sponsorId: session.user.id,
  firstName: getSponsorFirstName(session.user.full_name),
  liveTrees: 0,
  reservedTrees: 0,
  pendingOrders: 0,
  confirmedOrders: 0,
  projectCount: 0,
  greenPoints: 0,
  level: null,
  nextLevel: null,
  treesToNextLevel: null,
  featuredProjectName: null,
  updatedAt: new Date().toISOString(),
});

const buildSnapshotFromData = (
  session: MobileSession,
  orders: SponsorOrderSummary[],
  trees: SponsorTreeSummary[],
  achievements: SponsorAchievements | null,
  points: SponsorPointsInfo | null,
): SponsorReminderSnapshot => {
  const liveTrees = trees.filter((item) => Number(item.tree_id || 0) > 0).length;
  const reservedTrees = getReservedTreeCount(orders, trees);
  const pendingOrders = orders.filter((item) => isPendingOrder(item)).length;
  const confirmedOrders = orders.filter((item) => isConfirmedOrder(item)).length;
  const projectIds = new Set<number>();
  orders.forEach((item) => {
    if (Number(item.project_id || 0) > 0) projectIds.add(Number(item.project_id));
  });
  trees.forEach((item) => {
    if (Number(item.project_id || 0) > 0) projectIds.add(Number(item.project_id));
  });
  const levelTreeCount = Math.max(
    Number(achievements?.total_trees || 0),
    reservedTrees,
    liveTrees,
  );
  const nextThreshold = achievements?.next_level_threshold ?? null;
  const treesToNextLevel =
    nextThreshold && nextThreshold > levelTreeCount ? Math.max(nextThreshold - levelTreeCount, 0) : null;

  return {
    sponsorId: session.user.id,
    firstName: getSponsorFirstName(session.user.full_name),
    liveTrees,
    reservedTrees,
    pendingOrders,
    confirmedOrders,
    projectCount: projectIds.size,
    greenPoints: Number(points?.green_points || 0),
    level: achievements?.level ? String(achievements.level) : null,
    nextLevel: achievements?.next_level ? String(achievements.next_level) : null,
    treesToNextLevel,
    featuredProjectName: resolveFeaturedProjectName(orders, trees),
    updatedAt: new Date().toISOString(),
  };
};

const loadSponsorReminderSnapshot = async (session: MobileSession): Promise<SponsorReminderSnapshot> => {
  const [ordersResult, treesResult, achievementsResult, pointsResult] = await Promise.allSettled([
    fetchSponsorOrders(session),
    fetchSponsorTrees(session),
    fetchSponsorAchievements(session),
    fetchSponsorPoints(session),
  ]);

  const orders = ordersResult.status === "fulfilled" ? ordersResult.value : [];
  const trees = treesResult.status === "fulfilled" ? treesResult.value : [];
  const achievements = achievementsResult.status === "fulfilled" ? achievementsResult.value : null;
  const points = pointsResult.status === "fulfilled" ? pointsResult.value : null;

  const hadLiveData =
    ordersResult.status === "fulfilled" ||
    treesResult.status === "fulfilled" ||
    achievementsResult.status === "fulfilled" ||
    pointsResult.status === "fulfilled";

  if (!hadLiveData) {
    const cached = await readStoredSnapshot(session.user.id);
    return cached || buildFallbackSnapshot(session);
  }

  const snapshot = buildSnapshotFromData(session, orders, trees, achievements, points);
  await writeStoredSnapshot(snapshot);
  return snapshot;
};

const buildFirstTreeMessages = (snapshot: SponsorReminderSnapshot): SponsorReminderMessage[] => [
  {
    title: `${snapshot.firstName}, your first tree can start today`,
    body: "Open LandCheck Green, choose a live public project, and sponsor one tree to unlock verified map proof, photos, and care updates.",
    route: "SponsorProjects",
  },
  {
    title: "A greener tomorrow starts with one tree",
    body: snapshot.featuredProjectName
      ? `${snapshot.featuredProjectName} is open for sponsorship. Reserve your first tree and begin your verified climate story.`
      : "Public sponsor projects are open now. Reserve your first tree and begin your verified climate story.",
    route: "SponsorProjects",
  },
  {
    title: "Your climate impact is waiting",
    body: "It only takes a minute to sponsor a tree today. Open the app and turn support into a real planted record.",
    route: "SponsorProjects",
  },
  {
    title: "Sponsor a tree and watch it grow",
    body: "Get live planting evidence, tree maps, maintenance updates, and a premium certificate when you sponsor your first tree.",
    route: "SponsorProjects",
  },
  {
    title: "Open the app and create a living legacy",
    body: "Choose a project, sponsor a tree, and let LandCheck Green show you the map, photos, and long-term impact of that tree.",
    route: "SponsorProjects",
  },
];

const buildPendingMessages = (snapshot: SponsorReminderSnapshot): SponsorReminderMessage[] => [
  {
    title: "Your sponsorship is almost live",
    body: `You have ${snapshot.pendingOrders} ${pluralize(snapshot.pendingOrders, "order")} still moving through payment or planting review. Open the app and track the latest status.`,
    route: "SponsorTrees",
  },
  {
    title: "Come back and follow your reserved trees",
    body: "Your reserved units are waiting for the next verified step. Open LandCheck Green to see payment progress and tree-link updates.",
    route: "SponsorTrees",
  },
  {
    title: "Your climate action is in motion",
    body: snapshot.featuredProjectName
      ? `${snapshot.featuredProjectName} is still progressing. Reopen the app to see when your reserved trees become fully live.`
      : "Reopen the app to see when your reserved trees become fully live with maps, photos, and maintenance history.",
    route: "SponsorTrees",
  },
  {
    title: "Stay close to your tree journey",
    body: "The next update could be a payment confirmation, planting evidence, or a newly linked tree. Open the app and check in.",
    route: "SponsorTrees",
  },
  {
    title: "One check-in keeps your impact story moving",
    body: "Open LandCheck Green to follow your pending sponsor units and be ready to sponsor more once they go live.",
    route: "SponsorTrees",
  },
];

const buildActiveSponsorMessages = (snapshot: SponsorReminderSnapshot): SponsorReminderMessage[] => {
  const levelHint =
    snapshot.nextLevel && snapshot.treesToNextLevel
      ? `Only ${snapshot.treesToNextLevel} more ${pluralize(snapshot.treesToNextLevel, "tree")} to reach ${snapshot.nextLevel}.`
      : snapshot.level
        ? `You are currently at ${snapshot.level}.`
        : null;

  return [
    {
      title: `${snapshot.firstName}, your ${snapshot.liveTrees} live ${pluralize(snapshot.liveTrees, "tree")} need a check-in`,
      body: "Open LandCheck Green to see verified photos, map proof, and the latest maintenance updates, then sponsor another tree today.",
      route: "SponsorTrees",
    },
    {
      title: "Your climate story grows when you return",
      body: snapshot.featuredProjectName
        ? `${snapshot.featuredProjectName} still has impact waiting for you. Check your live trees and sponsor more while slots remain open.`
        : "Check your live trees, review their latest evidence, and sponsor more while public projects remain open.",
      route: "SponsorTrees",
    },
    {
      title: "You already planted real impact. Grow it.",
      body: levelHint
        ? `${levelHint} Open the app to follow your current trees and add another one to your climate journey.`
        : "Open the app to follow your current trees and add another one to your climate journey.",
      route: "SponsorProjects",
    },
    {
      title: `${snapshot.greenPoints} GP are already part of your journey`,
      body: "Reopen the app, view your live tree story, and keep building verified climate impact with another sponsorship.",
      route: "SponsorProjects",
    },
    {
      title: "Your trees are solving climate change in real places",
      body: "Open LandCheck Green to see where they are, how they are growing, and which project should receive your next sponsored tree.",
      route: "SponsorTrees",
    },
  ];
};

const buildReminderMessages = (snapshot: SponsorReminderSnapshot): SponsorReminderMessage[] => {
  if (snapshot.liveTrees > 0 || snapshot.confirmedOrders > 0) {
    return buildActiveSponsorMessages(snapshot);
  }
  if (snapshot.pendingOrders > 0 || snapshot.reservedTrees > 0) {
    return buildPendingMessages(snapshot);
  }
  return buildFirstTreeMessages(snapshot);
};

const buildReminderDates = (now: Date) => {
  const dates: Date[] = [];
  const leadThreshold = now.getTime() + SPONSOR_REMINDER_MIN_LEAD_MS;
  let dayOffset = 0;

  while (dates.length < SPONSOR_REMINDER_DAYS) {
    const hour = dayOffset % 2 === 0 ? 12 : 19;
    const minute = dayOffset % 2 === 0 ? 45 : 15;
    const scheduled = new Date(now);
    scheduled.setDate(now.getDate() + dayOffset);
    scheduled.setHours(hour, minute, 0, 0);
    if (scheduled.getTime() >= leadThreshold) {
      dates.push(scheduled);
    }
    dayOffset += 1;
  }

  return dates;
};

const cancelStoredNotifications = async () => {
  const stored = await readStoredReminderState();
  if (!stored?.notificationIds?.length) {
    await writeStoredReminderState(null);
    return;
  }
  await Promise.all(
    stored.notificationIds.map(async (id) => {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch {
        // Ignore individual cleanup failures.
      }
    }),
  );
  await writeStoredReminderState(null);
};

const buildNotificationContent = (message: SponsorReminderMessage, snapshot: SponsorReminderSnapshot) => ({
  title: message.title,
  body: message.body,
  sound: "default" as const,
  channelId: Platform.OS === "android" ? SPONSOR_CHANNEL_ID : undefined,
  data: {
    audience: "sponsor",
    route: message.route,
    sponsor_id: snapshot.sponsorId,
    engagement: true,
  },
});

export const scheduleSponsorEngagementNotifications = async (
  session: MobileSession | null,
  options?: { force?: boolean },
) => {
  if (!session || session.user.id <= 0) return;
  if (Platform.OS !== "android" && Platform.OS !== "ios") return;
  if (!supportsNativeNotifications()) return;

  const force = Boolean(options?.force);
  const sameSponsor = lastScheduledSponsorId === session.user.id;
  if (!force && sameSponsor && Date.now() - lastScheduledAt < SPONSOR_REMINDER_REFRESH_WINDOW_MS) {
    return;
  }
  if (schedulingPromise) {
    return schedulingPromise;
  }

  schedulingPromise = (async () => {
    const allowed = await requestGreenNotificationPermission();
    if (!allowed) return;

    const snapshot = await loadSponsorReminderSnapshot(session);
    const messages = buildReminderMessages(snapshot);
    const dates = buildReminderDates(new Date());

    await cancelStoredNotifications();

    const notificationIds: string[] = [];
    for (let index = 0; index < dates.length; index += 1) {
      const message = messages[index % messages.length];
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: buildNotificationContent(message, snapshot),
          trigger: dates[index] as unknown as Notifications.NotificationTriggerInput,
        });
        if (id) {
          notificationIds.push(id);
        }
      } catch {
        // Keep scheduling the remaining reminders.
      }
    }

    await writeStoredReminderState({
      sponsorId: session.user.id,
      notificationIds,
    });
    lastScheduledSponsorId = session.user.id;
    lastScheduledAt = Date.now();
  })().finally(() => {
    schedulingPromise = null;
  });

  return schedulingPromise;
};

export const clearSponsorEngagementNotifications = async () => {
  if (!supportsNativeNotifications()) {
    await writeStoredReminderState(null);
    await writeStoredSnapshot(null);
    lastScheduledSponsorId = 0;
    lastScheduledAt = 0;
    return;
  }

  await cancelStoredNotifications();
  await writeStoredSnapshot(null);
  lastScheduledSponsorId = 0;
  lastScheduledAt = 0;
};
