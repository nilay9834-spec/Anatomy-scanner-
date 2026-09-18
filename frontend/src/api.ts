import Constants from "expo-constants";

const baseUrl =
  Constants.expoConfig?.extra?.backendUrl ?? process.env.EXPO_PUBLIC_BACKEND_URL ?? "";

export type User = { id: string; email: string; created_at: string };
export type Organ = {
  id: string;
  name: string;
  category: string;
  description: string;
  function: string;
  fact: string;
  model_url?: string | null;
  accent: string;
};

type AuthResponse = { token: string; user: User };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail ?? "Something went wrong");
  return body as T;
}

export function signUp(email: string, password: string) {
  return request<AuthResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logIn(email: string, password: string) {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function getOrgans() {
  return request<Organ[]>("/api/organs");
}

export function getCurrentUser(token: string) {
  return request<User>("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
}