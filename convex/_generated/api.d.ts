/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as announcements from "../announcements.js";
import type * as crons from "../crons.js";
import type * as diary from "../diary.js";
import type * as groups from "../groups.js";
import type * as invites from "../invites.js";
import type * as messages from "../messages.js";
import type * as nightly from "../nightly.js";
import type * as profile from "../profile.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as uiStrings from "../uiStrings.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  announcements: typeof announcements;
  crons: typeof crons;
  diary: typeof diary;
  groups: typeof groups;
  invites: typeof invites;
  messages: typeof messages;
  nightly: typeof nightly;
  profile: typeof profile;
  seed: typeof seed;
  settings: typeof settings;
  uiStrings: typeof uiStrings;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
