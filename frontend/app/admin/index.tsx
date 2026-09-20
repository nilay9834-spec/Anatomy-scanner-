import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AdminStats, adminGetStats } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { useAdmin } from "./_layout";

export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const { token, user } = useAdmin();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStats(await adminGetStats(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load stats");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 32 }]}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />
      }
    >
      <Text style={styles.greeting}>Welcome back</Text>
      <Text style={styles.email} testID="admin-current-email">{user.email}</Text>

      {loading && !stats ? (
        <View style={styles.centerBlock}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : error ? (
        <View style={styles.errorBlock}>
          <Ionicons name="cloud-offline-outline" size={22} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : stats ? (
        <>
          <Text style={styles.sectionTitle}>Access requests</Text>
          <View style={styles.grid}>
            <StatCard label="Pending" value={stats.users.pending} color={colors.warning} icon="hourglass-outline" testID="stat-pending" />
            <StatCard label="Approved" value={stats.users.approved} color={colors.success} icon="checkmark-done-outline" testID="stat-approved" />
            <StatCard label="Rejected" value={stats.users.rejected} color={colors.error} icon="close-circle-outline" testID="stat-rejected" />
            <StatCard label="All users" value={stats.users.total} color={colors.brandPrimary} icon="people-outline" testID="stat-total" />
          </View>
          <Text style={styles.sectionTitle}>Anatomy library</Text>
          <View style={styles.grid}>
            <StatCard label="Models" value={stats.models.total} color={colors.brandPrimary} icon="cube-outline" testID="stat-models" />
            <StatCard label="Active" value={stats.models.active} color={colors.success} icon="eye-outline" testID="stat-active-models" />
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
  testID,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.card} testID={testID}>
      <View style={[styles.cardIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.cardValue}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { padding: 20, gap: 8 },
  greeting: { color: colors.muted, fontSize: 13 },
  email: { color: colors.onSurface, fontSize: 20, fontWeight: "800" },
  sectionTitle: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 20,
    marginBottom: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    flexGrow: 1,
    flexBasis: "45%",
    borderRadius: 16,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardValue: { color: colors.onSurface, fontSize: 26, fontWeight: "800" },
  cardLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  centerBlock: { alignItems: "center", padding: 30 },
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
}));
