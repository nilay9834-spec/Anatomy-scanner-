import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
  scanMarker,
  verifyOtp,
} from "@/src/api";
import { HumanBody } from "@/src/components/human-body";
import { MarkerScanner } from "@/src/components/marker-scanner";
import { clearSession, loadSession, saveSession } from "@/src/session";
import { makeStyles, useTheme } from "@/src/theme";

export default function Index() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

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
          }
        } catch {
          await clearSession();
        }
      }
      setLoadingSession(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAuthenticated = async (t: string, u: User) => {
    await saveSession(t, u);
    setToken(t);
    setUser(u);
    if (u.role === "admin") router.replace("/admin");
  };

  const signOut = async () => {
    await clearSession();
    setToken(null);
    setUser(null);
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

  if (!token || !user || user.role === "admin") {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  return <HomeScreen token={token} user={user} onSignOut={signOut} />;
}

// ─── Home (Scanner + Body diagram) ─────────────────────────────────────────

function HomeScreen({
  token,
  user,
  onSignOut,
}: {
  token: string;
  user: User;
  onSignOut: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();

  const [models, setModels] = useState<AnatomyModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState("");
  const [infoModel, setInfoModel] = useState<AnatomyModel | null>(null);
  const [infoRegion, setInfoRegion] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setModels(await getAnatomyModels(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load anatomy library");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const openModel = useCallback(
    (m: AnatomyModel) => {
      if (!m.model_url) {
        setScanError(`${m.name} has no 3D model linked yet.`);
        return;
      }
      router.push({ pathname: "/model", params: { url: m.model_url, title: m.name } });
    },
    [router],
  );

  const onMarker = useCallback(
    async (markerId: number) => {
      setScanBusy(true);
      setScanError("");
      try {
        const m = await scanMarker(token, markerId);
        openModel(m);
      } catch (e) {
        setScanError(e instanceof Error ? e.message : "Scan failed");
      } finally {
        setScanBusy(false);
      }
    },
    [token, openModel],
  );

  const onRegionSelect = useCallback(
    (region: { key: string; label: string }, model: AnatomyModel | null) => {
      setInfoRegion(region.label);
      setInfoModel(model);
    },
    [],
  );

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.homeContent,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 },
        ]}
      >
        <View style={styles.homeHeader}>
          <View>
            <Text style={styles.eyebrow}>YOUR ANATOMY LAB</Text>
            <Text style={styles.homeTitle}>Explore the body</Text>
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
        <Text style={styles.homeSubtitle}>
          Scan a marker card to open its 3D model, or explore organs on the body
          below.
        </Text>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Live scanner</Text>
            <Text style={styles.sectionHint}>Point your camera at a marker card</Text>
          </View>
          {scanBusy ? <ActivityIndicator color={colors.brandPrimary} /> : null}
        </View>
        <MarkerScanner onMarker={onMarker} />
        {scanError ? (
          <View style={styles.scanErrorRow} testID="scan-error">
            <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
            <Text style={styles.scanErrorText}>{scanError}</Text>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Body diagram</Text>
            <Text style={styles.sectionHint}>Tap any highlighted organ</Text>
          </View>
          <Text style={styles.sectionCount}>{models.length} organs</Text>
        </View>
        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={colors.brandPrimary} />
            <Text style={styles.stateText}>Loading anatomical database…</Text>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <Ionicons name="cloud-offline-outline" size={28} color={colors.error} />
            <Text style={styles.stateText}>{error}</Text>
            <Pressable onPress={load} style={styles.retryButton}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <HumanBody
            models={models}
            onSelect={(region, model) => onRegionSelect(region, model)}
          />
        )}

        <View style={styles.tipCard}>
          <Ionicons name="scan-outline" size={20} color={colors.brandPrimary} />
          <View style={styles.tipCopy}>
            <Text style={styles.tipTitle}>How marker cards work</Text>
            <Text style={styles.tipText}>
              Each printed anatomy card has a unique QR-style marker. When the
              scanner sees it, the matching 3D model opens automatically.
            </Text>
          </View>
        </View>
      </ScrollView>

      <OrganInfoSheet
        model={infoModel}
        regionLabel={infoRegion}
        onClose={() => {
          setInfoModel(null);
          setInfoRegion(null);
        }}
      />
    </View>
  );
}

// ─── Info Sheet (from body diagram tap) ────────────────────────────────────

function OrganInfoSheet({
  model,
  regionLabel,
  onClose,
}: {
  model: AnatomyModel | null;
  regionLabel: string | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const visible = Boolean(regionLabel);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.sheetGrabber} />
        <View style={styles.sheetHeader}>
          <View style={styles.sheetIcon}>
            <Ionicons name="body-outline" size={22} color={colors.onBrandPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetKicker}>ORGAN INFO</Text>
            <Text style={styles.sheetTitle}>{model?.name ?? regionLabel}</Text>
          </View>
          <Pressable onPress={onClose} style={styles.sheetClose} testID="organ-info-close">
            <Ionicons name="close" size={20} color={colors.onSurface} />
          </Pressable>
        </View>
        {model ? (
          <View style={{ gap: 14 }}>
            <Text style={styles.sheetCategory}>{model.category}</Text>
            <Text style={styles.sheetBody}>{model.description}</Text>
            <View style={styles.sheetInlineRow}>
              <View style={styles.sheetInlineIcon}>
                <Ionicons name="pulse-outline" size={16} color={colors.brandPrimary} />
              </View>
              <Text style={styles.sheetInlineText}>{model.function}</Text>
            </View>
            <View style={styles.sheetInlineRow}>
              <View style={styles.sheetInlineIcon}>
                <Ionicons name="sparkles-outline" size={16} color={colors.brandPrimary} />
              </View>
              <Text style={styles.sheetInlineText}>{model.fact}</Text>
            </View>
            {model.marker_id != null ? (
              <Text style={styles.sheetHint}>
                Marker ID: <Text style={{ fontWeight: "800" }}>{model.marker_id}</Text>
                {"  ·  "}Scan the printed card to launch the 3D model.
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={styles.sheetBody}>
            The admin has not added a record for {regionLabel} yet. Once added,
            it will appear here with a full description.
          </Text>
        )}
      </View>
    </Modal>
  );
}

// ─── Auth Screen (kept as-is, only imported here) ───────────────────────────

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
  const [userEmail, setUserEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<UserStep>("request");
  const [message, setMessage] = useState("");
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
                        <Ionicons name="arrow-forward" size={19} color={colors.onBrandPrimary} />
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
                        <Ionicons name="arrow-forward" size={19} color={colors.onBrandPrimary} />
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
                    <Ionicons name="arrow-back-outline" size={16} color={colors.brandPrimary} />
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
                    <Ionicons name="arrow-forward" size={19} color={colors.onBrandPrimary} />
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

  homeContent: { paddingHorizontal: 20, gap: 12 },
  homeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: { color: colors.brandPrimary, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  homeTitle: {
    color: colors.onSurface,
    fontSize: 29,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.7,
    marginTop: 6,
  },
  homeSubtitle: { color: colors.muted, fontSize: 15, marginTop: 4, lineHeight: 21 },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInitial: { color: colors.onBrandTertiary, fontSize: 16, fontWeight: "800" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    marginBottom: 8,
  },
  sectionTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  sectionHint: { color: colors.muted, fontSize: 12, marginTop: 2 },
  sectionCount: { color: colors.muted, fontSize: 13 },
  scanErrorRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scanErrorText: { color: colors.error, fontSize: 13, flex: 1 },
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
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.brandTertiary,
    borderRadius: 16,
    padding: 15,
    marginTop: 18,
    gap: 12,
  },
  tipCopy: { flex: 1 },
  tipTitle: { color: colors.onBrandTertiary, fontSize: 13, fontWeight: "800" },
  tipText: { color: colors.onBrandTertiary, fontSize: 12, lineHeight: 17, marginTop: 3 },

  // Info sheet
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.4)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 12,
  },
  sheetGrabber: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: 6,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  sheetIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetKicker: { color: colors.brandPrimary, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  sheetTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "800" },
  sheetClose: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetCategory: {
    color: colors.brandPrimary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sheetBody: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21 },
  sheetInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetInlineIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetInlineText: { color: colors.onSurface, fontSize: 13, flex: 1, fontWeight: "600" },
  sheetHint: { color: colors.muted, fontSize: 12, marginTop: 4 },

  // Auth (unchanged from previous file)
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
  helperNote: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 10 },
  errorText: { color: colors.error, fontSize: 13, lineHeight: 18, marginTop: 10 },
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
  messageBox: { alignItems: "center", padding: 8, gap: 8 },
  messageIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  messageTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800", marginTop: 6 },
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
}));
