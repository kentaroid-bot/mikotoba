import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 23:55 JST every day (14:55 UTC) to summarize before 0:00 reset.
crons.cron("daily summary before midnight JST", "55 14 * * *", internal.nightly.summarizeAfterHours, {});
// 03:10 JST every day (18:10 UTC) to refresh member avatars from Clerk.
crons.cron(
  "daily avatar sync from Clerk",
  "10 18 * * *",
  internal.profile.syncAllMemberAvatarsFromClerkForAutomation,
  {}
);
// Hourly check for long silence during chat hours.
crons.interval("hourly silence nudge", { hours: 1 }, internal.nightly.nudgeIfSilent, {});

export default crons;
