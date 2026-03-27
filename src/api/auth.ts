import { api } from "./client";
import type { AuthMode, MobileSession } from "../types/domain";

type LoginResponse = {
  auth_mode?: AuthMode;
  user?: MobileSession["user"];
};

const normalizeSession = (payload: LoginResponse): MobileSession => ({
  authed: true,
  appMode: "green",
  auth_mode: payload?.auth_mode === "partner_user" ? "partner_user" : "env_admin",
  logged_in_at: new Date().toISOString(),
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
});

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
  return normalizeSession(response.data || {});
};
