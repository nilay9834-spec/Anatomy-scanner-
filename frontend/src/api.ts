import Constants from "expo-constants";

const baseUrl =
  Constants.expoConfig?.extra?.backendUrl ??
  process.env.EXPO_PUBLIC_BACKEND_URL ??
  process.env.EXPO_BACKEND_URL ??
  "";

export type UserRole = "admin" | "user";
export type UserStatus =
  | "pending_verification"
  | "pending"
  | "approved"
  | "rejected"
  | "disabled";

export type User = {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at?: string | null;
  last_login_at?: string | null;
};

export type AnatomyModel = {
  id: string;
  name: string;
  category: string;
  description: string;
  function: string;
  fact: string;
  image_url?: string | null;
  model_url?: string | null;
  accent: string;
  display_order: number;
  active: boolean;
  created_at: string;
  updated_at?: string | null;
};

export type AuthResponse = { token: string; user: User };

export type VerifyOtpResponse = {
  status: "awaiting_approval" | "logged_in" | "rejected" | "disabled";
  message: string;
  token?: string | null;
  user?: User | null;
};

export type AdminStats = {
  users: { total: number; pending: number; approved: number; rejected: number };
  models: { total: number; active: number };
};

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const text = await response.text();
  const body = text ? safeJson(text) : {};
  if (!response.ok) {
    const detail =
      (body && (body.detail || body.message)) || `Request failed (${response.status})`;
    throw new Error(typeof detail === "string" ? detail : "Request failed");
  }
  return body as T;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export function adminLogin(email: string, password: string) {
  return request<AuthResponse>("/api/auth/admin-login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function requestAccess(email: string) {
  return request<{ message: string; email: string }>("/api/auth/request-access", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function verifyOtp(email: string, otp: string) {
  return request<VerifyOtpResponse>("/api/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ email, otp }),
  });
}

export function getCurrentUser(token: string) {
  return request<User>("/api/auth/me", {}, token);
}

// ─── Public ────────────────────────────────────────────────────────────────

export function getAnatomyModels(token: string) {
  return request<AnatomyModel[]>("/api/anatomy-models", {}, token);
}

// ─── Admin ─────────────────────────────────────────────────────────────────

export function adminGetStats(token: string) {
  return request<AdminStats>("/api/admin/stats", {}, token);
}

export function adminListRequests(token: string) {
  return request<User[]>("/api/admin/requests", {}, token);
}

export function adminListUsers(token: string) {
  return request<User[]>("/api/admin/users", {}, token);
}

export function adminUpdateUserStatus(token: string, userId: string, status: UserStatus) {
  return request<User>(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  }, token);
}

export function adminDeleteUser(token: string, userId: string) {
  return request<void>(`/api/admin/users/${userId}`, { method: "DELETE" }, token);
}

export function adminListModels(token: string) {
  return request<AnatomyModel[]>("/api/admin/anatomy-models", {}, token);
}

export type AnatomyModelInput = {
  name: string;
  category: string;
  description: string;
  function: string;
  fact: string;
  image_url?: string | null;
  model_url?: string | null;
  accent: string;
  display_order: number;
  active: boolean;
};

export function adminCreateModel(token: string, data: AnatomyModelInput) {
  return request<AnatomyModel>("/api/admin/anatomy-models", {
    method: "POST",
    body: JSON.stringify(data),
  }, token);
}

export function adminUpdateModel(token: string, id: string, data: AnatomyModelInput) {
  return request<AnatomyModel>(`/api/admin/anatomy-models/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }, token);
}

export function adminDeleteModel(token: string, id: string) {
  return request<void>(`/api/admin/anatomy-models/${id}`, { method: "DELETE" }, token);
}

// ─── Uploads ───────────────────────────────────────────────────────────────

export type UploadResult = {
  storage_path: string;
  url: string;
  size: number;
  content_type: string;
};

export async function uploadImage(
  token: string,
  file: { uri: string; name: string; type: string },
): Promise<UploadResult> {
  const { Platform } = await import("react-native");
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(file.uri)).blob();
    form.append("file", blob, file.name);
  } else {
    // React Native native shape — cast keeps TS happy.
    form.append("file", { uri: file.uri, name: file.name, type: file.type } as any);
  }
  const response = await fetch(`${baseUrl}/api/uploads/images`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await response.text();
  const body = text ? safeJson(text) : {};
  if (!response.ok) {
    const detail = (body && (body.detail || body.message)) || `Upload failed (${response.status})`;
    throw new Error(typeof detail === "string" ? detail : "Upload failed");
  }
  return body as UploadResult;
}
