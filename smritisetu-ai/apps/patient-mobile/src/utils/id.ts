import * as Crypto from "expo-crypto";

/** RFC 4122 v4 identifier, used for every event id. */
export function newEventId(): string {
  return Crypto.randomUUID();
}
