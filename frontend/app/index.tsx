import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getCurrentUser, getOrgans, logIn, Organ, signUp, User } from "@/src/api";
import { anatomyAssets } from "@/src/anatomy-assets";
import { makeStyles, useTheme } from "@/src/theme";

const TOKEN_KEY = "anatomy-session-token";
type Screen = "auth" | "gallery" | "detail";

export default function Index() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("auth");
  const [user, setUser] = useState<User | null>(null);
  const [organs, setOrgans] = useState<Organ[]>([]);
  const [selectedOrgan, setSelectedOrgan] = useState<Organ | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [organsLoading, setOrgansLoading] = useState(false);
  const [organError, setOrganError] = useState("");

  useEffect(() => {
    const restoreSession = async () => {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (token) {
        try {
          const restored = await getCurrentUser(token);
          setUser(restored);
          setScreen("gallery");
        } catch {
          await AsyncStorage.removeItem(TOKEN_KEY);
        }
      }
      setLoadingSession(false);
    };
    restoreSession();
  }, []);

  const loadOrgans = async () => {
    setOrgansLoading(true);
    setOrganError("");
    try {
      setOrgans(await getOrgans());
    } catch (error) {
      setOrganError(error instanceof Error ? error.message : "Unable to load organs");
    } finally {
      setOrgansLoading(false);
    }
  };

  useEffect(() => {
    if (screen !== "auth" && !organs.length) loadOrgans();
  }, [organs.length, screen]);

  const openDetail = (organ: Organ) => {
    setSelectedOrgan(organ);
    setScreen("detail");
  };

  const handleAuthenticated = async (response: { token: string; user: User }) => {
    await AsyncStorage.setItem(TOKEN_KEY, response.token);
    setUser(response.user);
    setScreen("gallery");
  };

  const signOut = async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setScreen("auth");
  };

  if (loadingSession) {
    return (
      <View style={[styles.loading, { paddingTop: insets.top }]} testID="session-loading">
        <View style={styles.brandMarkSmall}>
          <Ionicons name="body-outline" size={22} color={colors.onBrandPrimary} />
        </View>
        <ActivityIndicator color={colors.brandPrimary} />
        <Text style={styles.loadingText}>Preparing your anatomy lab</Text>
      </View>
    );
  }

  if (screen === "auth") {
    return <AuthScreen onAuthenticated={handleAuthenticated} onGuest={() => setScreen("gallery")} />;
  }

  if (screen === "detail" && selectedOrgan) {
    return (
      <DetailScreen
        organ={selectedOrgan}
        onBack={() => setScreen("gallery")}
        onLaunch={() =>
          router.push({ pathname: "/model", params: { url: selectedOrgan.model_url ?? "", title: selectedOrgan.name } })
        }
      />
    );
  }

  return (
    <GalleryScreen
      user={user}
      organs={organs}
      loading={organsLoading}
      error={organError}
      onRetry={loadOrgans}
      onSelect={openDetail}
      onSignOut={signOut}
    />
  );
}

function AuthScreen({
  onAuthenticated,
  onGuest,
}: {
  onAuthenticated: (response: { token: string; user: User }) => Promise<void>;
  onGuest: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email.trim() || password.length < 8) {
      setError("Enter a valid email and a password with 8+ characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = mode === "login" ? await logIn(email.trim(), password) : await signUp(email.trim(), password);
      await onAuthenticated(response);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We could not complete that request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={[styles.authContent, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.authTopline}>
          <View style={styles.brandMark}>
            <Ionicons name="body-outline" size={28} color={colors.onBrandPrimary} />
          </View>
          <Text style={styles.kicker}>ANATOMY LAB</Text>
        </View>
        <Text style={styles.authTitle}>See what makes you, you.</Text>
        <Text style={styles.authSubtitle}>Explore the human body in a clearer, more interactive way.</Text>

        <View style={styles.authPanel}>
          <View style={styles.segmented}>
            {(["login", "signup"] as const).map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                onPress={() => {
                  setMode(item);
                  setError("");
                }}
                style={[styles.segment, mode === item && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, mode === item && styles.segmentTextActive]}>
                  {item === "login" ? "Log in" : "Create account"}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.formLabel}>Email address</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={19} color={colors.muted} />
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={email}
            />
          </View>
          <Text style={styles.formLabel}>Password</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={19} color={colors.muted} />
            <TextInput
              autoCapitalize="none"
              autoComplete="password"
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              placeholderTextColor={colors.muted}
              secureTextEntry
              style={styles.input}
              value={password}
            />
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={submit}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed, busy && styles.buttonDisabled]}
            testID="auth-submit"
          >
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.primaryButtonText}>{mode === "login" ? "Enter the lab" : "Start exploring"}</Text>}
            {!busy ? <Ionicons name="arrow-forward" size={19} color={colors.onBrandPrimary} /> : null}
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onGuest} style={styles.guestButton}>
            <Text style={styles.guestText}>Continue as guest</Text>
            <Ionicons name="arrow-forward-outline" size={16} color={colors.brandPrimary} />
          </Pressable>
        </View>
        <View style={styles.privacyNote}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.success} />
          <Text style={styles.privacyText}>Your account keeps your learning journey private.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function GalleryScreen({
  user,
  organs,
  loading,
  error,
  onRetry,
  onSelect,
  onSignOut,
}: {
  user: User | null;
  organs: Organ[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onSelect: (organ: Organ) => void;
  onSignOut: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => organs.filter((organ) => organ.name.toLowerCase().includes(query.toLowerCase())), [organs, query]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.galleryContent, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.galleryHeader}>
          <View>
            <Text style={styles.eyebrow}>YOUR ANATOMY LAB</Text>
            <Text style={styles.galleryTitle}>Explore the body</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onSignOut} style={styles.profileButton}>
            <Text style={styles.profileInitial}>{user?.email?.[0]?.toUpperCase() ?? "G"}</Text>
          </Pressable>
        </View>
        <Text style={styles.gallerySubtitle}>Pick an organ to uncover how it works.</Text>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={20} color={colors.muted} />
          <TextInput onChangeText={setQuery} placeholder="Search organs" placeholderTextColor={colors.muted} style={styles.searchInput} value={query} />
        </View>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Core systems</Text>
          <Text style={styles.sectionCount}>{organs.length} organs</Text>
        </View>
        {loading ? (
          <View style={styles.stateCard}><ActivityIndicator color={colors.brandPrimary} /><Text style={styles.stateText}>Loading anatomical database…</Text></View>
        ) : error ? (
          <View style={styles.stateCard}><Ionicons name="cloud-offline-outline" size={28} color={colors.error} /><Text style={styles.stateText}>{error}</Text><Pressable onPress={onRetry} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable></View>
        ) : filtered.length ? (
          filtered.map((organ) => <OrganCard key={organ.id} organ={organ} onPress={() => onSelect(organ)} />)
        ) : (
          <View style={styles.stateCard}><Ionicons name="search-outline" size={28} color={colors.muted} /><Text style={styles.stateText}>No organs match that search.</Text></View>
        )}
        <View style={styles.galleryTip}>
          <Ionicons name="cube-outline" size={20} color={colors.brandPrimary} />
          <View style={styles.tipCopy}><Text style={styles.tipTitle}>Interactive learning</Text><Text style={styles.tipText}>Look for the 3D badge to step inside an organ.</Text></View>
        </View>
      </ScrollView>
    </View>
  );
}

function OrganCard({ organ, onPress }: { organ: Organ; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.organCard, pressed && styles.cardPressed]}>
      <Image source={{ uri: anatomyAssets[organ.id] }} style={styles.organImage} />
      <View style={styles.organCopy}>
        <View style={styles.cardTopline}><Text style={styles.organCategory}>{organ.category}</Text>{organ.model_url ? <View style={styles.modelBadge}><Ionicons name="cube-outline" size={12} color={colors.onBrandTertiary} /><Text style={styles.modelBadgeText}>3D</Text></View> : null}</View>
        <Text style={styles.organName}>{organ.name}</Text>
        <Text numberOfLines={2} style={styles.organDescription}>{organ.description}</Text>
        <View style={styles.exploreLine}><Text style={styles.exploreText}>Explore details</Text><Ionicons name="arrow-forward" size={15} color={colors.brandPrimary} /></View>
      </View>
    </Pressable>
  );
}

function DetailScreen({ organ, onBack, onLaunch }: { organ: Organ; onBack: () => void; onLaunch: () => void }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const hasModel = Boolean(organ.model_url);
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 116 }}>
        <View style={styles.detailHero}>
          <Image source={{ uri: anatomyAssets[organ.id] }} style={styles.detailImage} />
          <Pressable accessibilityRole="button" onPress={onBack} style={[styles.backButton, { top: insets.top + 12 }]}><Ionicons name="arrow-back" size={22} color={colors.onSurface} /></Pressable>
        </View>
        <View style={styles.detailBody}>
          <Text style={styles.eyebrow}>{organ.category.toUpperCase()}</Text>
          <Text style={styles.detailTitle}>{organ.name}</Text>
          <Text style={styles.detailDescription}>{organ.description}</Text>
          <View style={styles.factRow}><View style={styles.factIcon}><Ionicons name="sparkles-outline" size={18} color={colors.brandPrimary} /></View><Text style={styles.factText}>{organ.fact}</Text></View>
          <Text style={styles.detailSectionTitle}>What it does</Text>
          <View style={styles.functionCard}><Ionicons name="pulse-outline" size={22} color={colors.brandPrimary} /><Text style={styles.functionText}>{organ.function}</Text></View>
          <Text style={styles.detailSectionTitle}>Go deeper</Text>
          <Text style={styles.detailBodyCopy}>Rotate, zoom, and inspect this system from every angle with an interactive model.</Text>
        </View>
      </ScrollView>
      <View style={[styles.detailActionBar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable accessibilityRole="button" disabled={!hasModel} onPress={onLaunch} style={({ pressed }) => [styles.primaryButton, styles.detailButton, pressed && styles.buttonPressed, !hasModel && styles.buttonDisabled]}>
          <Ionicons name="cube-outline" size={20} color={colors.onBrandPrimary} /><Text style={styles.primaryButtonText}>{hasModel ? "Launch 3D model" : "3D model coming soon"}</Text><Ionicons name="arrow-forward" size={18} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, backgroundColor: colors.surface },
  loadingText: { color: colors.muted, fontSize: 14 },
  brandMarkSmall: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  authContent: { flexGrow: 1, paddingHorizontal: 24, justifyContent: "center" },
  authTopline: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 28 },
  brandMark: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  kicker: { color: colors.brandPrimary, fontSize: 12, fontWeight: "800", letterSpacing: 1.7 },
  authTitle: { color: colors.onSurface, fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -1, maxWidth: 320 },
  authSubtitle: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 12, maxWidth: 325 },
  authPanel: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 18, marginTop: 30, shadowColor: colors.surfaceInverse, shadowOpacity: 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  segmented: { backgroundColor: colors.surfaceTertiary, borderRadius: 12, padding: 4, flexDirection: "row", marginBottom: 24 },
  segment: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  segmentActive: { backgroundColor: colors.surfaceSecondary, shadowColor: colors.surfaceInverse, shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  segmentText: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  segmentTextActive: { color: colors.onSurface, fontWeight: "700" },
  formLabel: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "700", marginBottom: 8, marginTop: 12 },
  inputWrap: { minHeight: 50, borderRadius: 12, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 10 },
  input: { flex: 1, color: colors.onSurface, fontSize: 15, minHeight: 48 },
  errorText: { color: colors.error, fontSize: 13, lineHeight: 18, marginTop: 10 },
  primaryButton: { minHeight: 52, borderRadius: 14, backgroundColor: colors.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16, marginTop: 20 },
  primaryButtonText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "800" },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  buttonDisabled: { opacity: 0.48 },
  guestButton: { minHeight: 46, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 8 },
  guestText: { color: colors.brandPrimary, fontSize: 14, fontWeight: "700" },
  privacyNote: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 20 },
  privacyText: { color: colors.muted, fontSize: 12 },
  galleryContent: { paddingHorizontal: 20 },
  galleryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: colors.brandPrimary, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  galleryTitle: { color: colors.onSurface, fontSize: 29, lineHeight: 34, fontWeight: "800", letterSpacing: -0.7, marginTop: 6 },
  gallerySubtitle: { color: colors.muted, fontSize: 15, marginTop: 8 },
  profileButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  profileInitial: { color: colors.onBrandTertiary, fontSize: 16, fontWeight: "800" },
  searchWrap: { backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, minHeight: 50, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 10, marginTop: 24 },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 15, minHeight: 48 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 30, marginBottom: 14 },
  sectionTitle: { color: colors.onSurface, fontSize: 19, fontWeight: "800" },
  sectionCount: { color: colors.muted, fontSize: 13 },
  stateCard: { minHeight: 160, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.surfaceSecondary, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 20 },
  stateText: { color: colors.muted, fontSize: 14, textAlign: "center" },
  retryButton: { backgroundColor: colors.brandTertiary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, marginTop: 4 },
  retryText: { color: colors.onBrandTertiary, fontSize: 13, fontWeight: "800" },
  organCard: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 12, minHeight: 144, shadowColor: colors.surfaceInverse, shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 1 },
  cardPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  organImage: { width: 122, height: 122, borderRadius: 13, backgroundColor: colors.surfaceTertiary },
  organCopy: { flex: 1, paddingHorizontal: 12, paddingVertical: 4 },
  cardTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  organCategory: { color: colors.muted, fontSize: 11, fontWeight: "700", flexShrink: 1 },
  modelBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.brandTertiary, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7 },
  modelBadgeText: { color: colors.onBrandTertiary, fontSize: 10, fontWeight: "800" },
  organName: { color: colors.onSurface, fontSize: 22, fontWeight: "800", marginTop: 8 },
  organDescription: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  exploreLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  exploreText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "800" },
  galleryTip: { flexDirection: "row", alignItems: "center", backgroundColor: colors.brandTertiary, borderRadius: 16, padding: 15, marginTop: 16, gap: 12 },
  tipCopy: { flex: 1 },
  tipTitle: { color: colors.onBrandTertiary, fontSize: 13, fontWeight: "800" },
  tipText: { color: colors.onBrandTertiary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  detailHero: { height: 290, backgroundColor: colors.surfaceTertiary, position: "relative" },
  detailImage: { width: "100%", height: "100%", resizeMode: "cover" },
  backButton: { position: "absolute", left: 20, width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", shadowColor: colors.surfaceInverse, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  detailBody: { padding: 24 },
  detailTitle: { color: colors.onSurface, fontSize: 34, fontWeight: "800", letterSpacing: -0.8, marginTop: 7 },
  detailDescription: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 8 },
  factRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.brandTertiary, borderRadius: 14, padding: 14, marginTop: 24 },
  factIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  factText: { flex: 1, color: colors.onBrandTertiary, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  detailSectionTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800", marginTop: 30, marginBottom: 12 },
  functionCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, padding: 16 },
  functionText: { color: colors.onSurfaceSecondary, fontSize: 15, fontWeight: "700", flex: 1 },
  detailBodyCopy: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  detailActionBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface },
  detailButton: { marginTop: 0 },
}));
