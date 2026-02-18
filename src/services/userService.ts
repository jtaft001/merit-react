import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "../firebase";
import type { UserDoc } from "../types/firestore";

export type UserRecord = {
  id: string;
  name?: string;
  email?: string;
  status?: string;
  className?: string;
  authUID?: string;
  [key: string]: unknown;
};

/**
 * Fetch all users ordered by name.
 */
export async function fetchUsers(): Promise<UserRecord[]> {
  const colRef = collection(db, "users");
  const q = query(colRef, orderBy("name"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as UserDoc),
  })) as UserRecord[];
}

/**
 * Fetch attempts for a specific user, newest first.
 */
export async function fetchUserAttempts(userId: string) {
  const colRef = collection(db, "attempts");
  const q = query(
    colRef,
    where("userId", "==", userId),
    orderBy("attemptedAt", "desc"),
    limit(50)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

/**
 * Find the user document whose authUID matches the given Firebase user.
 * Returns null if no linked user document exists.
 */
export async function getUserForUser(user: User | null): Promise<UserRecord | null> {
  if (!user || !user.uid) return null;

  const colRef = collection(db, "users");
  const q = query(colRef, where("authUID", "==", user.uid), limit(1));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...(doc.data() as UserDoc),
  } as UserRecord;
}
