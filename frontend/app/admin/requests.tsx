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

import { User, adminListRequests, adminUpdateUserStatus } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { useAdmin } from "./_layout";

export default function AccessRequestsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const { token } = useAdmin();

  const [items, setItems] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await adminListRequests(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const decide = async (userId: string, status: "approved" | "rejected") => {
    setBusyId(userId);
    try {
      await adminUpdateUserStatus(token, userId, status);
      setItems((prev) => prev.filter((u) => u.id !== userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 32 }]}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />
      }
    >
      <Text style={styles.title}>Access requests</Text>
      <Text style={styles.subtitle}>
        People who verified their email and are waiting to explore the lab.
      </Text>

      {loading && !items.length ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : error ? (
        <View style={styles.errorBlock}>
          <Ionicons name="alert-circle-outline" size={22} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Ionicons name="checkmark-done-outline" size={30} color={colors.success} />
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptyText}>No pending requests right now.</Text>
        </View>
      ) : (
        items.map((u) => (
          <View key={u.id} style={styles.card} testID={`request-${u.id}`}>
            <View style={styles.rowTop}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{u.email[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.email} numberOfLines={1}>
                  {u.email}
                </Text>
                <Text style={styles.meta}>
                  Requested {new Date(u.created_at).toLocaleString()}
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable
                testID={`reject-${u.id}`}
                disabled={busyId === u.id}
                onPress={() => decide(u.id, "rejected")}
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.rejectBtn,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="close" size={16} color={colors.error} />
                <Text style={[styles.actionText, { color: colors.error }]}>Reject</Text>
              </Pressable>
              <Pressable
                testID={`approve-${u.id}`}
                disabled={busyId === u.id}
                onPress={() => decide(u.id, "approved")}
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.approveBtn,
                  pressed && { opacity: 0.85 },
                ]}
              >
                {busyId === u.id ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={16} color={colors.onBrandPrimary} />
                    <Text style={[styles.actionText, { color: colors.onBrandPrimary }]}>
                      Approve
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { padding: 20, gap: 8 },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 13, marginBottom: 12 },
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
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  rejectBtn: { backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  approveBtn: { backgroundColor: colors.brandPrimary },
  actionText: { fontWeight: "800", fontSize: 13 },
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
  emptyTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  emptyText: { color: colors.muted, fontSize: 13 },
}));
