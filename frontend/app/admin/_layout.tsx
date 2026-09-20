import { Ionicons } from "@expo/vector-icons";
import { Redirect, Slot, useRouter, useSegments } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { User, getCurrentUser } from "@/src/api";
import { clearSession, loadSession } from "@/src/session";
import { makeStyles, useTheme } from "@/src/theme";

type AdminCtx = {
  token: string;
  user: User;
  refresh: () => Promise<void>;
};

const AdminContext = createContext<AdminCtx | null>(null);

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside AdminLayout");
  return ctx;
}

const TABS = [
  { key: "index", label: "Dashboard", icon: "grid-outline" as const, path: "/admin" },
  { key: "requests", label: "Requests", icon: "mail-unread-outline" as const, path: "/admin/requests" },
  { key: "users", label: "Users", icon: "people-outline" as const, path: "/admin/users" },
  { key: "models", label: "Models", icon: "cube-outline" as const, path: "/admin/models" },
];

export default function AdminLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const segments = useSegments();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "unauthenticated" }
    | { status: "ready"; token: string; user: User }
  >({ status: "loading" });

  const load = useCallback(async () => {
    const restored = await loadSession();
    if (!restored) {
      setState({ status: "unauthenticated" });
      return;
    }
    try {
      const fresh = await getCurrentUser(restored.token);
      if (fresh.role !== "admin") {
        setState({ status: "unauthenticated" });
        return;
      }
      setState({ status: "ready", token: restored.token, user: fresh });
    } catch {
      await clearSession();
      setState({ status: "unauthenticated" });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ctxValue = useMemo(() => {
    if (state.status !== "ready") return null;
    return { token: state.token, user: state.user, refresh: load };
  }, [state, load]);

  if (state.status === "loading") {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.brandPrimary} />
        <Text style={styles.loadingText}>Loading admin console…</Text>
      </View>
    );
  }
  if (state.status === "unauthenticated") {
    return <Redirect href="/" />;
  }

  const activeSegment = segments[segments.length - 1] ?? "index";
  const activeKey = TABS.find((t) => t.key === activeSegment)?.key ?? "index";

  return (
    <AdminContext.Provider value={ctxValue!}>
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <View style={styles.headerLeft}>
            <View style={styles.brandDot}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.onBrandPrimary} />
            </View>
            <View>
              <Text style={styles.eyebrow}>ADMIN CONSOLE</Text>
              <Text style={styles.headerTitle}>Anatomy Lab</Text>
            </View>
          </View>
          <Pressable
            testID="admin-sign-out"
            onPress={async () => {
              await clearSession();
              router.replace("/");
            }}
            style={styles.signOut}
          >
            <Ionicons name="log-out-outline" size={18} color={colors.error} />
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
          style={styles.tabsScroll}
        >
          {TABS.map((t) => {
            const active = activeKey === t.key;
            return (
              <Pressable
                key={t.key}
                testID={`admin-tab-${t.key}`}
                onPress={() => router.replace(t.path as any)}
                style={[styles.tabChip, active && styles.tabChipActive]}
              >
                <Ionicons
                  name={t.icon}
                  size={16}
                  color={active ? colors.onBrandPrimary : colors.onSurfaceSecondary}
                />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.content}>
          <Slot />
        </View>
      </View>
    </AdminContext.Provider>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: colors.surface,
  },
  loadingText: { color: colors.muted, fontSize: 13 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  brandDot: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    color: colors.brandPrimary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  headerTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surfaceTertiary,
  },
  signOutText: { color: colors.error, fontSize: 13, fontWeight: "700" },
  tabsScroll: { flexGrow: 0, flexShrink: 0 },
  tabsRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    alignItems: "center",
  },
  tabChip: {
    flexShrink: 0,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tabChipActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  tabText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "700" },
  tabTextActive: { color: colors.onBrandPrimary },
  content: { flex: 1 },
}));
