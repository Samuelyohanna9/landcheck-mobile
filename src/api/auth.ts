import { api } from "./client";
import type { AuthMode, MobileSession, SponsorAccountType } from "../types/domain";

type LoginResponse = {
  auth_mode?: AuthMode;
  access_token?: string | null;
  session_uid?: string | null;
  expires_at?: string | null;
  idle_timeout_at?: string | null;
  mfa_enabled?: boolean;
  mfa_verified?: boolean;
  user?: MobileSession["user"];
};

type SponsorSignupInput = {
  full_name: string;
  account_type: SponsorAccountType;
  organization_name?: string | null;
  email: string;
  phone?: string | null;
  password: string;
  referred_by_code?: string | null;
};

const normalizeSession = (payload: LoginResponse, appMode: MobileSession["appMode"]): MobileSession => {
  const accessToken = String(payload?.access_token || "").trim();
  if (!accessToken) {
    throw new Error("Authenticated session token was not returned by the server.");
  }
  return {
    authed: true,
    appMode,
    auth_mode:
      payload?.auth_mode === "partner_user"
        ? "partner_user"
        : payload?.auth_mode === "sponsor_user"
          ? "sponsor_user"
          : "env_admin",
    logged_in_at: new Date().toISOString(),
    access_token: accessToken,
    session_uid: String(payload?.session_uid || "").trim() || null,
    expires_at: String(payload?.expires_at || "").trim() || null,
    idle_timeout_at: String(payload?.idle_timeout_at || "").trim() || null,
    mfa_enabled: Boolean(payload?.mfa_enabled),
    mfa_verified: Boolean(payload?.mfa_verified),
    user:
      payload?.user || {
        id: 0,
        user_uid: "SYS-ADMIN",
        full_name: "System Admin",
        role: "super_admin",
        role_key: "super_admin",
        role_name: "Super Admin",
        allow_green: true,
        allow_work: true,
        organization_is_active: true,
        organization_status: null,
      },
  };
};

export const loginMobile = async (username: string, password: string) => {
  const cleanUsername = username.trim();
  if (!cleanUsername || !password) {
    throw new Error("Username and password are required.");
  }
  const response = await api.post<LoginResponse>("/green/green-auth/login", {
    username: cleanUsername,
    password,
    organization_id: null,
  });
  return normalizeSession(response.data || {}, "green");
};

export const loginSponsorMobile = async (email: string, password: string) => {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password) {
    throw new Error("Email and password are required.");
  }
  const response = await api.post<LoginResponse>("/green/sponsor-auth/login", {
    email: cleanEmail,
    password,
  });
  return normalizeSession(response.data || {}, "green_sponsor");
};

export const signUpSponsorMobile = async (input: SponsorSignupInput) => {
  const payload = {
    full_name: input.full_name.trim(),
    account_type: input.account_type,
    organization_name: input.organization_name?.trim() || null,
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || null,
    password: input.password,
    referred_by_code: input.referred_by_code?.trim() || null,
  };
  if (!payload.full_name || !payload.email || !payload.password) {
    throw new Error("Full name, email, and password are required.");
  }
  const response = await api.post<LoginResponse>("/green/sponsor-auth/signup", payload);
  return normalizeSession(response.data || {}, "green_sponsor");
};

export const claimGuestSponsorMobile = async (sponsorId: number, email: string, password: string) => {
  const cleanEmail = email.trim().toLowerCase();
  if (!sponsorId || !cleanEmail || !password) {
    throw new Error("Sponsor id, email, and password are required.");
  }
  const response = await api.post<LoginResponse>("/green/sponsor/guest/claim", {
    sponsor_id: sponsorId,
    email: cleanEmail,
    password,
  });
  return normalizeSession(response.data || {}, "green_sponsor");
};

export const requestSponsorPasswordReset = async (email: string) => {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Email is required.");
  }
  const response = await api.post<{ ok?: boolean; message?: string }>("/green/sponsor-auth/forgot-password", {
    email: cleanEmail,
  });
  return String(response.data?.message || "If that sponsor email exists, a reset link has been sent.");
};

export const requestFieldPasswordReset = async (email: string) => {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Email is required.");
  }
  const response = await api.post<{ ok?: boolean; message?: string }>("/green/green-auth/forgot-password", {
    email: cleanEmail,
  });
  return String(response.data?.message || "If that email exists, a password reset link has been sent.");
};
