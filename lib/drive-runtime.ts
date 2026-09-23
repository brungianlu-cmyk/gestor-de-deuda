import { env } from "cloudflare:workers";
import { DriveHistory } from "./drive-history";

export function createDriveHistory(): Promise<DriveHistory> {
  return DriveHistory.create({
    clientId: env.GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
    refreshToken: env.GOOGLE_DRIVE_REFRESH_TOKEN,
  });
}
