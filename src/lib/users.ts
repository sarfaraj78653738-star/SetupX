import { v4 as uuid } from "uuid";

// ---------------------------------------------------------------------------
// User management — backed by Vercel KV (works across serverless invocations)
// ---------------------------------------------------------------------------

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  subscriptionTier: "free" | "pro" | "premium" | null;
  subscriptionStatus: "active" | "canceled" | "past_due" | null;
  subscriptionEndsAt: string | null;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const data = await kvGetUser(email.toLowerCase());
  if (!data) return null;
  return data as UserRecord;
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const data = await kvGetUser(id);
  if (!data) return null;
  return data as UserRecord;
}

export async function createUser(email: string, password: string, name?: string): Promise<UserRecord> {
  const existing = await getUserByEmail(email);
  if (existing) {
    throw new Error("User already exists");
  }

  const passwordHash = await hash(password, 12);
  const now = new Date().toISOString();
  const user: UserRecord = {
    id: uuid(),
    email: email.toLowerCase(),
    name: name ?? null,
    passwordHash,
    subscriptionTier: "free",
    subscriptionStatus: null,
    subscriptionEndsAt: null,
    isAdmin: false,
    createdAt: now,
    updatedAt: now,
  };

  await kvSetUser(user.id, user);
  return user;
}

export async function updateUser(id: string, updates: Partial<UserRecord>): Promise<UserRecord | null> {
  const existing = await getUserById(id);
  if (!existing) return null;

  const updated: UserRecord = {
    ...existing,
    ...updates,
    id: existing.id,
    email: existing.email,
    passwordHash: existing.passwordHash,
    updatedAt: new Date().toISOString(),
  };

  await kvSetUser(id, updated);
  return updated;
}

export async function updateSubscription(
  id: string,
  tier: "free" | "pro" | "premium",
  status: "active" | "canceled" | "past_due" | null,
  endsAt: Date | null,
): Promise<UserRecord | null> {
  return updateUser(id, {
    subscriptionTier: tier,
    subscriptionStatus: status,
    subscriptionEndsAt: endsAt?.toISOString() ?? null,
  });
}

export async function grantAdmin(id: string): Promise<UserRecord | null> {
  return updateUser(id, { isAdmin: true });
}

export async function changePassword(id: string, newPassword: string): Promise<UserRecord | null> {
  const passwordHash = await hash(newPassword, 12);
  return updateUser(id, { passwordHash });
}

export async function deleteUser(id: string): Promise<void> {
  await kvDeleteUser(id);
}

export async function seedAdminUser(email: string, password: string, name?: string): Promise<UserRecord> {
  const existing = await getUserByEmail(email);
  if (existing) {
    if (!existing.isAdmin) {
      await grantAdmin(existing.id);
      return getUserById(existing.id) as Promise<UserRecord>;
    }
    return existing as UserRecord;
  }

  const user = await createUser(email, password, name);
  await grantAdmin(user.id);
  return user;
}
