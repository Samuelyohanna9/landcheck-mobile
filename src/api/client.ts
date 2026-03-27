import axios from "axios";
import { API_URL } from "../config/env";

export const api = axios.create({
  baseURL: API_URL,
  timeout: 20000,
});

export const getErrorMessage = (error: unknown, fallback = "Request failed") => {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail) && detail.length) return String(detail[0]?.msg || fallback);
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
};
