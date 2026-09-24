import { google } from "googleapis";
import { requireEnv } from "@/lib/env";

/**
 * OAuth2 client for reading a user's own calendars, built from the refresh
 * token captured at sign-in. googleapis transparently exchanges it for a
 * short-lived access token on each call.
 */
// One client per refresh token, kept for the life of the server instance: the
// client caches its access token, so repeat page loads skip the token exchange.
const userClients = new Map<string, InstanceType<typeof google.auth.OAuth2>>();

export function googleUserAuth(refreshToken: string) {
  let client = userClients.get(refreshToken);
  if (!client) {
    client = new google.auth.OAuth2(
      requireEnv("GOOGLE_CLIENT_ID"),
      requireEnv("GOOGLE_CLIENT_SECRET"),
    );
    client.setCredentials({ refresh_token: refreshToken });
    userClients.set(refreshToken, client);
  }
  return client;
}

/**
 * Service-account JWT auth for WRITING to the shared "Life" calendar only.
 * The Life calendar must be shared with the impersonated user with
 * "Make changes to events". Because writes go through the service account
 * (never a user's token), the app cannot write to anyone's personal calendar.
 *
 * GOOGLE_SERVICE_ACCOUNT_KEY is the service-account JSON, base64-encoded.
 * GOOGLE_IMPERSONATE_USER, when set, enables domain-wide delegation: the SA
 * acts on behalf of that Workspace user. Required when the Workspace policy
 * blocks granting external accounts write access on shared calendars.
 */
export function googleServiceAccountAuth() {
  const json = JSON.parse(
    Buffer.from(requireEnv("GOOGLE_SERVICE_ACCOUNT_KEY"), "base64").toString("utf8"),
  ) as { client_email: string; private_key: string };

  return new google.auth.JWT({
    email: json.client_email,
    key: json.private_key,
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
    subject: process.env.GOOGLE_IMPERSONATE_USER || undefined,
  });
}
