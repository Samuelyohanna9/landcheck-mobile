import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { api } from "../api/client";
import { bootstrapLocalDatabase } from "../storage/database";
import { clearSession, loadSession, saveSession } from "../storage/session";
import { hasStoredConsent, hasSeenIntro, markIntroSeen, saveStoredConsent } from "../storage/privacy";
import { claimGuestSponsorMobile, loginMobile, loginSponsorMobile, signUpSponsorMobile } from "../api/auth";
import { fetchPrivacyPolicy, recordMobileConsent } from "../api/privacy";
import { ensureGreenBackgroundTasksRegistered, unregisterGreenBackgroundTasks } from "../background/greenBackgroundTasks";
import { clearGreenPushRegistration, syncGreenPushRegistration } from "../notifications/greenPushRegistration";
import { clearSponsorEngagementNotifications, scheduleSponsorEngagementNotifications } from "../notifications/sponsorEngagementNotifications";
import { clearSponsorPushRegistration, syncSponsorPushRegistration } from "../notifications/sponsorPushRegistration";
import type { AuthUser, MobileSession, PrivacyPolicyMeta } from "../types/domain";

type PendingConsent = {
  policy: PrivacyPolicyMeta;
  session: MobileSession;
};

type AuthContextValue = {
  booting: boolean;
  session: MobileSession | null;
  pendingConsent: PendingConsent | null;
  needsIntro: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signInSponsor: (email: string, password: string) => Promise<void>;
  signUpSponsor: (input: {
    full_name: string;
    account_type: "individual" | "organization";
    organization_name?: string | null;
    email: string;
    phone?: string | null;
    password: string;
    referred_by_code?: string | null;
  }) => Promise<void>;
  claimGuestSponsor: (sponsorId: number, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  acceptConsent: () => Promise<void>;
  declineConsent: () => Promise<void>;
  dismissIntro: () => Promise<void>;
  updateSessionUser: (patch: Partial<AuthUser>) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const isOrgSuspended = (session: MobileSession | null): boolean => {
  if (!session) return false;
  if (session.auth_mode === "sponsor_user") return false;
  if (session.auth_mode === "env_admin") return false;
  const user = session.user;
  if (user.organization_is_active === false) return true;
  const status = String(user.organization_status || "").toLowerCase();
  return status === "suspended" || status === "inactive";
};

const isSponsorSession = (session: MobileSession | null) => session?.auth_mode === "sponsor_user" || session?.appMode === "green_sponsor";

const defaultPolicy = (): PrivacyPolicyMeta => ({
  consent_version: "mobile-local-fallback",
  scopes: {
    green_field_data_capture: {
      title: "Green field data capture",
      summary: "Mobile capture includes GPS, photos, field notes, and operational audit data.",
    },
  },
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<MobileSession | null>(null);
  const [pendingConsent, setPendingConsent] = useState<PendingConsent | null>(null);
  const [needsIntro, setNeedsIntro] = useState(false);

  const updateSessionUser = async (patch: Partial<AuthUser>) => {
    if (!session) return;
    const next = {
      ...session,
      user: {
        ...session.user,
        ...patch,
      },
    };
    setSession(next);
    await saveSession(next);
  };

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      await bootstrapLocalDatabase();
      const restored = await loadSession();
      if (!active) return;
      if (restored) {
        if (isOrgSuspended(restored)) {
          await clearSession();
          if (active) setBooting(false);
          return;
        }
        setSession(restored);
        const introSeen = await hasSeenIntro();
        if (!introSeen && active) setNeedsIntro(true);
        if (isSponsorSession(restored)) {
          if (active) setPendingConsent(null);
          if (active) setBooting(false);
          return;
        }
        const consentExists = await hasStoredConsent("green", restored.user.id);
        if (!consentExists) {
          let policy = defaultPolicy();
          try {
            policy = await fetchPrivacyPolicy();
          } catch {
            // Keep local fallback when API metadata fetch is unavailable.
          }
          if (active) setPendingConsent({ policy, session: restored });
        }
      }
      if (active) setBooting(false);
    };
    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    if (isSponsorSession(session)) {
      void syncSponsorPushRegistration(session).catch(() => {});
      void scheduleSponsorEngagementNotifications(session, { force: true }).catch(() => {});
      return;
    }
    void syncGreenPushRegistration(session).catch(() => {});
    void ensureGreenBackgroundTasksRegistered(session).catch(() => {});
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") return;
      if (isSponsorSession(session)) {
        void syncSponsorPushRegistration(session).catch(() => {});
        void scheduleSponsorEngagementNotifications(session).catch(() => {});
      } else {
        void syncGreenPushRegistration(session).catch(() => {});
      }
    });
    return () => {
      subscription.remove();
    };
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      booting,
      session,
      pendingConsent,
      needsIntro,
      signIn: async (username, password) => {
        const signedIn = await loginMobile(username, password);
        if (isOrgSuspended(signedIn)) {
          throw new Error("Your organization account is suspended. Contact your administrator.");
        }
        setSession(signedIn);
        await saveSession(signedIn);
        const introSeen = await hasSeenIntro();
        if (!introSeen) setNeedsIntro(true);
        const consentExists = await hasStoredConsent("green", signedIn.user.id);
        if (consentExists) {
          setPendingConsent(null);
          return;
        }
        let policy = defaultPolicy();
        try {
          policy = await fetchPrivacyPolicy();
        } catch {
          // Offline fallback.
        }
        setPendingConsent({ policy, session: signedIn });
      },
      signInSponsor: async (email, password) => {
        const signedIn = await loginSponsorMobile(email, password);
        setSession(signedIn);
        await saveSession(signedIn);
        setPendingConsent(null);
        const introSeen = await hasSeenIntro();
        if (!introSeen) setNeedsIntro(true);
      },
      signUpSponsor: async (input) => {
        const signedIn = await signUpSponsorMobile(input);
        setSession(signedIn);
        await saveSession(signedIn);
        setPendingConsent(null);
        const introSeen = await hasSeenIntro();
        if (!introSeen) setNeedsIntro(true);
      },
      claimGuestSponsor: async (sponsorId, email, password) => {
        const signedIn = await claimGuestSponsorMobile(sponsorId, email, password);
        setSession(signedIn);
        await saveSession(signedIn);
        setPendingConsent(null);
        const introSeen = await hasSeenIntro();
        if (!introSeen) setNeedsIntro(true);
      },
      signOut: async () => {
        const accessToken = String(session?.access_token || "").trim();
        if (accessToken) {
          try {
            await api.post(
              "/green/auth/logout",
              {},
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
              },
            );
          } catch {
            // Best-effort revoke only; local sign-out must still complete.
          }
        }
        if (!isSponsorSession(session)) {
          await clearGreenPushRegistration(session);
          await unregisterGreenBackgroundTasks();
        } else {
          await clearSponsorPushRegistration(session);
          await clearSponsorEngagementNotifications();
        }
        setPendingConsent(null);
        setSession(null);
        await clearSession();
      },
      acceptConsent: async () => {
        if (!pendingConsent) return;
        await recordMobileConsent(pendingConsent.session, pendingConsent.policy);
        await saveStoredConsent("green", pendingConsent.session.user.id);
        setPendingConsent(null);
      },
      declineConsent: async () => {
        await clearGreenPushRegistration(session);
        await unregisterGreenBackgroundTasks();
        setPendingConsent(null);
        setSession(null);
        await clearSession();
      },
      dismissIntro: async () => {
        await markIntroSeen();
        setNeedsIntro(false);
      },
      updateSessionUser,
    }),
    [booting, needsIntro, pendingConsent, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
