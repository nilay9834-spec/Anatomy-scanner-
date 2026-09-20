import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AnatomyModel,
  User,
  adminLogin,
  getAnatomyModels,
  getCurrentUser,
  requestAccess,
  verifyOtp,
} from "@/src/api";
import { resolveModelImage } from "@/src/model-image";
import { clearSession, loadSession, saveSession } from "@/src/session";
import { makeStyles, useTheme } from "@/src/theme";

type Screen = "auth" | "gallery" | "detail";

export default function Index() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();

  const [screen, setScreen] = useState<Screen>("auth");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [models, setModels] = useState<AnatomyModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<AnatomyModel | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");

  // Restore session on mount
  useEffect(() => {
    (async () => {
      const restored = await loadSession();
      if (restored) {
        try {
          const fresh = await getCurrentUser(restored.token);
          setToken(restored.token);
          setUser(fresh);
          if (fresh.role === "admin") {
            router.replace("/admin");
          } else {
            setScreen("gallery");
          }
        } catch {
          await clearSession();
        }
      }
      setLoadingSession(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadModels = useCallback(async (t: string) => {
    setModelsLoading(true);
    setModelsError("");
    try {
      setModels(await getAnatomyModels(t));
    } catch (error) {
      setModelsError(error instanceof Error ? error.message : "Unable to load models");
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (screen === "gallery" && token) {
      loadModels(token);
    }
  }, [screen, token, loadModels]);

  const openDetail = (m: AnatomyModel) => {
    setSelectedModel(m);
    setScreen("detail");
  };

  const handleAuthenticated = async (t: string, u: User) => {
    await saveSession(t, u);
    setToken(t);
    setUser(u);
    if (u.role === "admin") {
      router.replace("/admin");
    } else {
      setScreen("gallery");
    }
  };

  const signOut = async () => {
    await clearSession();
    setToken(null);
    setUser(null);
    setModels([]);
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
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  if (screen === "detail" && selectedModel) {
    return (
      <DetailScreen
        model={selectedModel}
        onBack={() => setScreen("gallery")}
        onLaunch={() =>
          router.push({
            pathname: "/model",
            params: { url: selectedModel.model_url ?? "", title: selectedModel.name },
          })
        }
      />
    );
  }

  return (
    <GalleryScreen
      user={user}
      models={models}
      loading={modelsLoading}
      error={modelsError}
      onRefresh={() => token && loadModels(token)}
      onSelect={openDetail}
      onSignOut={signOut}
    />
  );
}

// ─── Auth Screen ────────────────────────────────────────────────────────────

type AuthMode = "user" | "admin";
type UserStep = "request" | "verify" | "message";

function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (token: string, user: User) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();

  const [mode, setMode] = useState<AuthMode>("user");

  // User flow state
  const [userEmail, setUserEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<UserStep>("request");
  const [message, setMessage] = useState("");

  // Admin flow state
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const resetAll = () => {
    setError("");
    setMessage("");
  };

  const submitRequestAccess = async () => {
    resetAll();
    if (!userEmail.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setBusy(true);
    try {
      await requestAccess(userEmail.trim().toLowerCase());
      setStep("verify");
      setMessage("A 6-digit code was sent to your email. It expires in 10 minutes.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send verification code.");
    } finally {
      setBusy(false);
    }
  };

  const submitVerifyOtp = async () => {
    resetAll();
    if (otp.trim().length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    try {
      const res = await verifyOtp(userEmail.trim().toLowerCase(), otp.trim());
      if (res.status === "logged_in" && res.token && res.user) {
        await onAuthenticated(res.token, res.user);
        return;
      }
      setStep("message");
      setMessage(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify code.");
    } finally {
      setBusy(false);
    }
  };

  const submitAdminLogin = async () => {
    resetAll();
    if (!adminEmail.trim() || !adminPassword) {
      setError("Enter administrator email and password.");
      return;
    }
    setBusy(true);
    try {
      const res = await adminLogin(adminEmail.trim().toLowerCase(), adminPassword);
      await onAuthenticated(res.token, res.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed.");
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
        contentContainerStyle={[
          styles.authContent,
          { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.authTopline}>
          <View style={styles.brandMark}>
            <Ionicons name="body-outline" size={28} color={colors.onBrandPrimary} />
          </View>
          <Text style={styles.kicker}>ANATOMY LAB</Text>
        </View>
        <Text style={styles.authTitle}>See what makes you, you.</Text>
        <Text style={styles.authSubtitle}>
          Explore the human body in a clearer, more interactive way.
        </Text>

        <View style={styles.authPanel}>
          <View style={styles.segmented}>
            {(
              [
                { key: "user", label: "Request access" },
                { key: "admin", label: "Admin login" },
              ] as const
            ).map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                testID={`auth-${item.key}-toggle`}
                onPress={() => {
                  setMode(item.key);
                  setStep("request");
                  setOtp("");
                  resetAll();
                }}
                style={[styles.segment, mode === item.key && styles.segmentActive]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    mode === item.key && styles.segmentTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === "user" ? (
            <>
              {step === "request" && (
                <>
                  <Text style={styles.formLabel}>Email address</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons name="mail-outline" size={19} color={colors.muted} />
                    <TextInput
                      autoCapitalize="none"
                      autoComplete="email"
                      keyboardType="email-address"
                      onChangeText={setUserEmail}
                      placeholder="you@example.com"
                      placeholderTextColor={colors.muted}
                      style={styles.input}
                      value={userEmail}
                      testID="user-email-input"
                    />
                  </View>
                  <Text style={styles.helperNote}>
                    We&apos;ll email you a 6-digit code. New users get access after admin
                    approval.
                  </Text>
                  {error ? <Text style={styles.errorText}>{error}</Text> : null}
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={submitRequestAccess}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && styles.buttonPressed,
                      busy && styles.buttonDisabled,
                    ]}
                    testID="request-access-submit"
                  >
                    {busy ? (
                      <ActivityIndicator color={colors.onBrandPrimary} />
                    ) : (
                      <>
                        <Text style={styles.primaryButtonText}>Send verification code</Text>
                        <Ionicons
                          name="arrow-forward"
                          size={19}
                          color={colors.onBrandPrimary}
                        />
                      </>
                    )}
                  </Pressable>
                </>
              )}

              {step === "verify" && (
                <>
                  <Text style={styles.formLabel}>Verification code</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons name="key-outline" size={19} color={colors.muted} />
                    <TextInput
                      autoCapitalize="none"
                      keyboardType="number-pad"
                      maxLength={6}
                      onChangeText={setOtp}
                      placeholder="6-digit code"
                      placeholderTextColor={colors.muted}
                      style={[styles.input, { letterSpacing: 6 }]}
                      value={otp}
                      testID="otp-input"
                    />
                  </View>
                  {message ? <Text style={styles.helperNote}>{message}</Text> : null}
                  {error ? <Text style={styles.errorText}>{error}</Text> : null}
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={submitVerifyOtp}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && styles.buttonPressed,
                      busy && styles.buttonDisabled,
                    ]}
                    testID="verify-otp-submit"
                  >
                    {busy ? (
                      <ActivityIndicator color={colors.onBrandPrimary} />
                    ) : (
                      <>
                        <Text style={styles.primaryButtonText}>Verify & continue</Text>
                        <Ionicons
                          name="arrow-forward"
                          size={19}
                          color={colors.onBrandPrimary}
                        />
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setStep("request");
                      setOtp("");
                      resetAll();
                    }}
                    style={styles.guestButton}
                    testID="otp-change-email"
                  >
                    <Ionicons
                      name="arrow-back-outline"
                      size={16}
                      color={colors.brandPrimary}
                    />
                    <Text style={styles.guestText}>Use a different email</Text>
                  </Pressable>
                </>
              )}

              {step === "message" && (
                <View style={styles.messageBox} testID="access-message">
                  <View style={styles.messageIcon}>
                    <Ionicons name="time-outline" size={22} color={colors.brandPrimary} />
                  </View>
                  <Text style={styles.messageTitle}>You&apos;re on the list</Text>
                  <Text style={styles.messageText}>{message}</Text>
                  <Pressable
                    onPress={() => {
                      setStep("request");
                      setUserEmail("");
                      setOtp("");
                      resetAll();
                    }}
                    style={styles.retryButton}
                  >
                    <Text style={styles.retryText}>Return to sign in</Text>
                  </Pressable>
                </View>
              )}
            </>
          ) : (
            <>
              <Text style={styles.formLabel}>Administrator email</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="mail-outline" size={19} color={colors.muted} />
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  onChangeText={setAdminEmail}
                  placeholder="admin@example.com"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  value={adminEmail}
                  testID="admin-email-input"
                />
              </View>
              <Text style={styles.formLabel}>Password</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={19} color={colors.muted} />
                <TextInput
                  autoCapitalize="none"
                  autoComplete="password"
                  onChangeText={setAdminPassword}
                  placeholder="Admin password"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  style={styles.input}
                  value={adminPassword}
                  testID="admin-password-input"
                />
              </View>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={submitAdminLogin}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                  busy && styles.buttonDisabled,
                ]}
                testID="admin-login-submit"
              >
                {busy ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>Enter admin panel</Text>
                    <Ionicons
                      name="arrow-forward"
                      size={19}
                      color={colors.onBrandPrimary}
                    />
                  </>
                )}
              </Pressable>
            </>
          )}
        </View>
        <View style={styles.privacyNote}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.success} />
          <Text style={styles.privacyText}>
            {mode === "user"
              ? "No passwords — just a code sent to your email."
              : "Administrator access is restricted and audited."}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Gallery ────────────────────────────────────────────────────────────────

function GalleryScreen({
  user,
  models,
  loading,
  error,
  onRefresh,
  onSelect,
  onSignOut,
}: {
  user: User | null;
  models: AnatomyModel[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onSelect: (m: AnatomyModel) => void;
  onSignOut: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      models.filter((m) =>
        m.name.toLowerCase().includes(query.toLowerCase()) ||
        m.category.toLowerCase().includes(query.toLowerCase()),
      ),
    [models, query],
  );

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.galleryContent,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
        ]}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.brandPrimary} />
        }
      >
        <View style={styles.galleryHeader}>
          <View>
            <Text style={styles.eyebrow}>YOUR ANATOMY LAB</Text>
            <Text style={styles.galleryTitle}>Explore the body</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onSignOut}
            style={styles.profileButton}
            testID="sign-out-button"
          >
            <Text style={styles.profileInitial}>
              {user?.email?.[0]?.toUpperCase() ?? "U"}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.gallerySubtitle}>
          Pick an organ to uncover how it works.
        </Text>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={20} color={colors.muted} />
          <TextInput
            onChangeText={setQuery}
            placeholder="Search organs"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            testID="organ-search"
            value={query}
          />
        </View>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Core systems</Text>
          <Text style={styles.sectionCount}>{models.length} organs</Text>
        </View>
        {loading && !models.length ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={colors.brandPrimary} />
            <Text style={styles.stateText}>Loading anatomical database…</Text>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <Ionicons name="cloud-offline-outline" size={28} color={colors.error} />
            <Text style={styles.stateText}>{error}</Text>
            <Pressable onPress={onRefresh} style={styles.retryButton}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : filtered.length ? (
          filtered.map((m) => (
            <OrganCard key={m.id} model={m} onPress={() => onSelect(m)} />
          ))
        ) : (
          <View style={styles.stateCard}>
            <Ionicons name="search-outline" size={28} color={colors.muted} />
            <Text style={styles.stateText}>No organs match that search.</Text>
          </View>
        )}
        <View style={styles.galleryTip}>
          <Ionicons name="cube-outline" size={20} color={colors.brandPrimary} />
          <View style={styles.tipCopy}>
            <Text style={styles.tipTitle}>Interactive learning</Text>
            <Text style={styles.tipText}>
              Look for the 3D badge to step inside an organ.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function OrganCard({
  model,
  onPress,
}: {
  model: AnatomyModel;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const image = resolveModelImage(model);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.organCard, pressed && styles.cardPressed]}
      testID={`organ-card-${model.id}`}
    >
      {image ? (
        <Image source={{ uri: image }} style={styles.organImage} />
      ) : (
        <View style={[styles.organImage, styles.organImageFallback]}>
          <Ionicons name="body-outline" size={40} color={colors.brandPrimary} />
        </View>
      )}
      <View style={styles.organCopy}>
        <View style={styles.cardTopline}>
          <Text numberOfLines={1} style={styles.organCategory}>
            {model.category}
          </Text>
          {model.model_url ? (
            <View style={styles.modelBadge}>
              <Ionicons name="cube-outline" size={12} color={colors.onBrandTertiary} />
              <Text style={styles.modelBadgeText}>3D</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.organName}>{model.name}</Text>
        <Text numberOfLines={2} style={styles.organDescription}>
          {model.description}
        </Text>
        <View style={styles.exploreLine}>
          <Text style={styles.exploreText}>Explore details</Text>
          <Ionicons name="arrow-forward" size={15} color={colors.brandPrimary} />
        </View>
      </View>
    </Pressable>
  );
}

function DetailScreen({
  model,
  onBack,
  onLaunch,
}: {
  model: AnatomyModel;
  onBack: () => void;
  onLaunch: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const image = resolveModelImage(model);
  const hasModel = Boolean(model.model_url);
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 116 }}>
        <View style={styles.detailHero}>
          {image ? (
            <Image source={{ uri: image }} style={styles.detailImage} />
          ) : (
            <View style={[styles.detailImage, styles.detailImageFallback]}>
              <Ionicons name="body-outline" size={80} color={colors.brandPrimary} />
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={onBack}
            style={[styles.backButton, { top: insets.top + 12 }]}
            testID="detail-back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
          </Pressable>
        </View>
        <View style={styles.detailBody}>
          <Text style={styles.eyebrow}>{model.category.toUpperCase()}</Text>
          <Text style={styles.detailTitle}>{model.name}</Text>
          <Text style={styles.detailDescription}>{model.description}</Text>
          <View style={styles.factRow}>
            <View style={styles.factIcon}>
              <Ionicons name="sparkles-outline" size={18} color={colors.brandPrimary} />
            </View>
            <Text style={styles.factText}>{model.fact}</Text>
          </View>
          <Text style={styles.detailSectionTitle}>What it does</Text>
          <View style={styles.functionCard}>
            <Ionicons name="pulse-outline" size={22} color={colors.brandPrimary} />
            <Text style={styles.functionText}>{model.function}</Text>
          </View>
          <Text style={styles.detailSectionTitle}>Go deeper</Text>
          <Text style={styles.detailBodyCopy}>
            Rotate, zoom, and inspect this system from every angle with an interactive
            model.
          </Text>
        </View>
      </ScrollView>
      <View style={[styles.detailActionBar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          accessibilityRole="button"
          disabled={!hasModel}
          onPress={onLaunch}
          style={({ pressed }) => [
            styles.primaryButton,
            styles.detailButton,
            pressed && styles.buttonPressed,
            !hasModel && styles.buttonDisabled,
          ]}
          testID="detail-launch-3d"
        >
          <Ionicons name="cube-outline" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.primaryButtonText}>
            {hasModel ? "Launch 3D model" : "3D model coming soon"}
          </Text>
          <Ionicons name="arrow-forward" size={18} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    backgroundColor: colors.surface,
  },
  loadingText: { color: colors.muted, fontSize: 14 },
  brandMarkSmall: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  authContent: { flexGrow: 1, paddingHorizontal: 24, justifyContent: "center" },
  authTopline: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 28 },
  brandMark: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: { color: colors.brandPrimary, fontSize: 12, fontWeight: "800", letterSpacing: 1.7 },
  authTitle: {
    color: colors.onSurface,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
    letterSpacing: -1,
    maxWidth: 320,
  },
  authSubtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 12,
    maxWidth: 325,
  },
  authPanel: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 18,
    marginTop: 30,
    shadowColor: colors.surfaceInverse,
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  segmented: {
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 12,
    padding: 4,
    flexDirection: "row",
    marginBottom: 24,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  segmentActive: {
    backgroundColor: colors.surfaceSecondary,
    shadowColor: colors.surfaceInverse,
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  segmentText: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  segmentTextActive: { color: colors.onSurface, fontWeight: "700" },
  formLabel: {
    color: colors.onSurfaceSecondary,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 12,
  },
  inputWrap: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
  },
  input: { flex: 1, color: colors.onSurface, fontSize: 15, minHeight: 48 },
  helperNote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 20,
  },
  primaryButtonText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "800" },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  buttonDisabled: { opacity: 0.48 },
  guestButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  guestText: { color: colors.brandPrimary, fontSize: 14, fontWeight: "700" },
  messageBox: {
    alignItems: "center",
    padding: 8,
    gap: 8,
  },
  messageIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  messageTitle: {
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 6,
  },
  messageText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 8,
  },
  privacyNote: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 20,
  },
  privacyText: { color: colors.muted, fontSize: 12 },
  galleryContent: { paddingHorizontal: 20 },
  galleryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: { color: colors.brandPrimary, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  galleryTitle: {
    color: colors.onSurface,
    fontSize: 29,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.7,
    marginTop: 6,
  },
  gallerySubtitle: { color: colors.muted, fontSize: 15, marginTop: 8 },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInitial: { color: colors.onBrandTertiary, fontSize: 16, fontWeight: "800" },
  searchWrap: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
    marginTop: 24,
  },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 15, minHeight: 48 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 30,
    marginBottom: 14,
  },
  sectionTitle: { color: colors.onSurface, fontSize: 19, fontWeight: "800" },
  sectionCount: { color: colors.muted, fontSize: 13 },
  stateCard: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  stateText: { color: colors.muted, fontSize: 14, textAlign: "center" },
  retryButton: {
    backgroundColor: colors.brandTertiary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 4,
  },
  retryText: { color: colors.onBrandTertiary, fontSize: 13, fontWeight: "800" },
  organCard: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 12,
    minHeight: 144,
    shadowColor: colors.surfaceInverse,
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  cardPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  organImage: { width: 122, height: 122, borderRadius: 13, backgroundColor: colors.surfaceTertiary },
  organImageFallback: { alignItems: "center", justifyContent: "center" },
  organCopy: { flex: 1, paddingHorizontal: 12, paddingVertical: 4 },
  cardTopline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  organCategory: { color: colors.muted, fontSize: 11, fontWeight: "700", flexShrink: 1 },
  modelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
  },
  modelBadgeText: { color: colors.onBrandTertiary, fontSize: 10, fontWeight: "800" },
  organName: { color: colors.onSurface, fontSize: 22, fontWeight: "800", marginTop: 8 },
  organDescription: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  exploreLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  exploreText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "800" },
  galleryTip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brandTertiary,
    borderRadius: 16,
    padding: 15,
    marginTop: 16,
    gap: 12,
  },
  tipCopy: { flex: 1 },
  tipTitle: { color: colors.onBrandTertiary, fontSize: 13, fontWeight: "800" },
  tipText: { color: colors.onBrandTertiary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  detailHero: { height: 290, backgroundColor: colors.surfaceTertiary, position: "relative" },
  detailImage: { width: "100%", height: "100%", resizeMode: "cover" },
  detailImageFallback: { alignItems: "center", justifyContent: "center" },
  backButton: {
    position: "absolute",
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.surfaceInverse,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  detailBody: { padding: 24 },
  detailTitle: {
    color: colors.onSurface,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    marginTop: 7,
  },
  detailDescription: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 8,
  },
  factRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.brandTertiary,
    borderRadius: 14,
    padding: 14,
    marginTop: 24,
  },
  factIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  factText: { flex: 1, color: colors.onBrandTertiary, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  detailSectionTitle: {
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 30,
    marginBottom: 12,
  },
  functionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    padding: 16,
  },
  functionText: { color: colors.onSurfaceSecondary, fontSize: 15, fontWeight: "700", flex: 1 },
  detailBodyCopy: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  detailActionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.surface,
  },
  detailButton: { marginTop: 0 },
}));
