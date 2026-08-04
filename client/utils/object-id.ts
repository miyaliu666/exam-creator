import { ObjectId } from "bson";

/// Derive a record's creation `Date` from its MongoDB ObjectId string (the first 4
/// bytes encode the creation timestamp). Returns null for a malformed id.
export function objectIdToDate(id: string): Date | null {
  try {
    return new ObjectId(id).getTimestamp();
  } catch {
    return null;
  }
}
