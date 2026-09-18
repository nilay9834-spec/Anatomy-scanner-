import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, useTheme } from "@/src/theme";

export default function ModelScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string; title?: string }>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const url = typeof params.url === "string" ? params.url : "";
  const title = typeof params.title === "string" ? params.title : "3D Model";

  return (
    <View style={styles.root}>
      <View style={[styles.toolbar, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.toolbarButton}>
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={styles.toolbarTitle}><Text style={styles.toolbarKicker}>INTERACTIVE MODEL</Text><Text style={styles.title}>{title}</Text></View>
        <View style={styles.toolbarButton}><Ionicons name="cube-outline" size={21} color={colors.brandPrimary} /></View>
      </View>
      {url && Platform.OS !== "web" && !failed ? (
        <View style={styles.webViewWrap}>
          <WebView
            onError={() => {
              setFailed(true);
              setLoading(false);
            }}
            onLoadEnd={() => setLoading(false)}
            originWhitelist={["*"]}
            source={{ uri: url }}
            style={styles.webView}
          />
          {loading ? <View style={styles.loadingOverlay}><ActivityIndicator color={colors.brandPrimary} /><Text style={styles.loadingText}>Loading 3D interactive environment…</Text></View> : null}
        </View>
      ) : url && Platform.OS === "web" ? (
        <View style={styles.emptyState}><Ionicons name="cube-outline" size={40} color={colors.brandPrimary} /><Text style={styles.emptyTitle}>Interactive model ready</Text><Text style={styles.emptyText}>The native app opens this model in the in-app viewer. Use the button below in web preview.</Text><Pressable onPress={() => Linking.openURL(url)} style={styles.backCta}><Text style={styles.backCtaText}>Open 3D model</Text></Pressable></View>
      ) : (
        <View style={styles.emptyState}><Ionicons name="cube-outline" size={40} color={colors.brandPrimary} /><Text style={styles.emptyTitle}>{failed ? "The model could not load" : "3D model source unavailable"}</Text><Text style={styles.emptyText}>Check your connection and try again.</Text><Pressable onPress={() => router.back()} style={styles.backCta}><Text style={styles.backCtaText}>Return to organ</Text></Pressable></View>
      )}
      <View style={[styles.hint, { bottom: insets.bottom + 16 }]}><Ionicons name="hand-left-outline" size={16} color={colors.onSurfaceSecondary} /><Text style={styles.hintText}>Drag to rotate · Pinch to zoom</Text></View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  toolbar: { paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceSecondary },
  toolbarButton: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  toolbarTitle: { alignItems: "center", gap: 3 },
  toolbarKicker: { color: colors.brandPrimary, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  webViewWrap: { flex: 1, position: "relative" },
  webView: { flex: 1, backgroundColor: colors.surface },
  loadingOverlay: { position: "absolute", left: 22, right: 22, top: 22, borderRadius: 14, padding: 14, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 10 },
  loadingText: { color: colors.onSurfaceSecondary, fontSize: 13, flex: 1 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 12 },
  emptyTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "800", textAlign: "center" },
  emptyText: { color: colors.muted, fontSize: 14, textAlign: "center" },
  backCta: { backgroundColor: colors.brandTertiary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 13, marginTop: 6 },
  backCtaText: { color: colors.onBrandTertiary, fontSize: 14, fontWeight: "800" },
  hint: { position: "absolute", alignSelf: "center", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 7, shadowColor: colors.surfaceInverse, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  hintText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700" },
}));