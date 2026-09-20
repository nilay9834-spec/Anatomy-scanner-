import { storage } from "@/src/utils/storage";
import type { User } from "@/src/api";

const TOKEN_KEY = "anatomy.session.token.v2";
const USER_KEY = "anatomy.session.user.v2";

export async function saveSession(token: string, user: User) {
  await storage.secureSet(TOKEN_KEY, token);
  await storage.setItem(USER_KEY, JSON.stringify(user));
}

export async function loadSession(): Promise<{ token: string; user: User } | null> {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  const rawUser = await storage.getItem<string>(USER_KEY, "");
  if (!token || !rawUser) return null;
  try {
    const user = JSON.parse(rawUser as string) as User;
    return { token: token as string, user };
  } catch {
    return null;
  }
}

export async function clearSession() {
  await storage.secureRemove(TOKEN_KEY);
  await storage.removeItem(USER_KEY);
}
