export const SESSION_COOKIE_NAME = "__kairos_session";

export const SESSION_COOKIE_MAX_AGE_MS = 60 * 60 * 24 * 5 * 1000; // 5 dias

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
