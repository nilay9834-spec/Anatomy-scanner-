import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { User, UserStatus, adminDeleteUser, adminListUsers, adminUpdateUserStatus } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { useAdmin } from "./_layout";

const STATUS_STYLES: Record<UserStatus, { label: string; color: string; bg: string }> = {
  pending_verification: { label: "Awaiting code", color: "#B45309", bg: "#FEF3C7" },
  pending: { label: "Pending approval", color: "#92400E", bg: "#FEF3C7" },
  approved: { label: "Approved", color: "#065F46", bg: "#D1FAE5" },
  rejected: { label: "Rejected", color: "#991B1B", bg: "#FEE2E2" },
  disabled: { label: "Disabled", color: "#334155", bg: "#E2E8F0" },
};

const FILTERS: { key: "all" | UserStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "disabled", label: "Disabled" },
];

export default function UsersScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const { token } = useAdmin();

  const [items, setItems] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await adminListUsers(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const changeStatus = async (u: User, status: UserStatus) => {
    setBusyId(u.id);
    try {
      const updated = await adminUpdateUserStatus(token, u.id, status);
      setItems((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const removeUser = async (u: User) => {
    setBusyId(u.id);
    try {
      await adminDeleteUser(token, u.id);
      setItems((prev) => prev.filter((x) => x.id !== u.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const filtered = items.filter((u) => filter === "all" || u.status === filter);

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 32 }]}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />
      }
    >
      <Text style={styles.title}>Users</Text>
      <Text style={styles.subtitle}>Manage access for everyone in the lab.</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              testID={`user-filter-${f.key}`}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading && !items.length ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : error ? (
        <View style={styles.errorBlock}>
          <Ionicons name="alert-circle-outline" size={22} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Ionicons name="people-outline" size={30} color={colors.muted} />
          <Text style={styles.emptyText}>No users in this list.</Text>
        </View>
      ) : (
        filtered.map((u) => {
          const badge = STATUS_STYLES[u.status];
          const isAdmin = u.role === "admin";
          return (
            <View key={u.id} style={styles.card} testID={`user-${u.id}`}>
              <View style={styles.rowTop}>
                <View style={[styles.avatar, isAdmin && { backgroundColor: colors.brandPrimary }]}>
                  <Text
                    style={[
                      styles.avatarText,
                      isAdmin && { color: colors.onBrandPrimary },
                    ]}
                  >
                    {u.email[0]?.toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.email} numberOfLines={1}>
                    {u.email}
                  </Text>
                  <View style={styles.metaRow}>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.color }]}>
                        {isAdmin ? "Admin" : badge.label}
                      </Text>
                    </View>
                    <Text style={styles.meta}>
                      Joined {new Date(u.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              </View>

              {!isAdmin ? (
                <View style={styles.actions}>
                  {u.status !== "approved" ? (
                    <Pressable
                      testID={`user-approve-${u.id}`}
                      disabled={busyId === u.id}
                      onPress={() => changeStatus(u, "approved")}
                      style={[styles.actionBtn, styles.approveBtn]}
                    >
                      <Ionicons name="checkmark" size={15} color={colors.onBrandPrimary} />
                      <Text style={[styles.actionText, { color: colors.onBrandPrimary }]}>
                        Approve
                      </Text>
                    </Pressable>
                  ) : null}
                  {u.status !== "disabled" ? (
                    <Pressable
                      testID={`user-disable-${u.id}`}
                      disabled={busyId === u.id}
                      onPress={() => changeStatus(u, "disabled")}
                      style={[styles.actionBtn, styles.mutedBtn]}
                    >
                      <Ionicons name="pause-outline" size={15} color={colors.onSurfaceSecondary} />
                      <Text style={[styles.actionText, { color: colors.onSurfaceSecondary }]}>
                        Disable
                      </Text>
                    </Pressable>
                  ) : null}
                  {u.status !== "rejected" ? (
                    <Pressable
                      testID={`user-reject-${u.id}`}
                      disabled={busyId === u.id}
                      onPress={() => changeStatus(u, "rejected")}
                      style={[styles.actionBtn, styles.mutedBtn]}
                    >
                      <Ionicons name="close" size={15} color={colors.error} />
                      <Text style={[styles.actionText, { color: colors.error }]}>Reject</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    testID={`user-delete-${u.id}`}
                    disabled={busyId === u.id}
                    onPress={() => removeUser(u)}
                    style={[styles.actionBtn, styles.mutedBtn]}
                  >
                    <Ionicons name="trash-outline" size={15} color={colors.error} />
                    <Text style={[styles.actionText, { color: colors.error }]}>Delete</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { padding: 20, gap: 8 },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 13, marginBottom: 4 },
  filterRow: {
    gap: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  filterChip: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  filterText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "700" },
  filterTextActive: { color: colors.onBrandPrimary },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    padding: 14,
    gap: 12,
    marginBottom: 10,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.onBrandTertiary, fontWeight: "800", fontSize: 15 },
  email: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: { fontSize: 11, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 11 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  approveBtn: { backgroundColor: colors.brandPrimary },
  mutedBtn: {
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: { fontWeight: "800", fontSize: 12 },
  center: { padding: 30, alignItems: "center" },
  errorBlock: {
    flexDirection: "row",
    gap: 8,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
  emptyBlock: {
    padding: 30,
    alignItems: "center",
    gap: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
  },
  emptyText: { color: colors.muted, fontSize: 13 },
}));
