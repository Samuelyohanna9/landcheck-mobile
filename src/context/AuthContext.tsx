import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { bootstrapLocalDatabase } from "../storage/database";
import { clearSession, loadSession, saveSession } from "../storage/session";
import { hasStoredConsent, hasSeenIntro, markIntroSeen, saveStoredConsent } from "../storage/privacy";
import { loginMobile } from "../api/auth";
import { fetchPrivacyPolicy, recordMobileConsent } from "../api/privacy";
import type { MobileSession, PrivacyPolicyMeta } from "../types/domain";

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
  signOut: () => Promise<void>;
  acceptConsent: () => Promise<void>;
  declineConsent: () => Promise<void>;
  dismissIntro: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const isOrgSuspended = (session: MobileSession | null): boolean => {
  if (!session) return false;
  if (session.auth_mode === "env_admin") return false;
  const user = session.user;
  if (user.organization_is_active === false) return true;
  const status = String(user.organization_status || "").toLowerCase();
  return status === "suspended" || status === "inactive";
};

const defaultPolicy = (): PrivacyPolicyMeta => ({
  consent_version: "mobile-local-fallback",
  scopes: {
    green_field_data_capture: {
      title: "Green field data capture",
      summary: "Mobile capture includes GPS, tree photos, maintenance notes, and operational audit data.",
    },
  },
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<MobileSession | null>(null);
  const [pendingConsent, setPendingConsent] = useState<PendingConsent | null>(null);
  const [needsIntro, setNeedsIntro] = useState(false);

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
      signOut: async () => {
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
        setPendingConsent(null);
        setSession(null);
        await clearSession();
      },
      dismissIntro: async () => {
        await markIntroSeen();
        setNeedsIntro(false);
      },
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
