import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AnatomyModel,
  AnatomyModelInput,
  adminCreateModel,
  adminDeleteModel,
  adminListModels,
  adminUpdateModel,
  uploadImage,
} from "@/src/api";
import { resolveModelImage, absoluteImageUrl } from "@/src/model-image";
import { makeStyles, useTheme } from "@/src/theme";
import { useAdmin } from "./_layout";

const EMPTY_FORM: AnatomyModelInput = {
  name: "",
  category: "",
  description: "",
  function: "",
  fact: "",
  image_url: "",
  model_url: "",
  accent: "blue",
  display_order: 0,
  active: true,
};

export default function ModelsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const { token } = useAdmin();

  const [items, setItems] = useState<AnatomyModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AnatomyModel | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await adminListModels(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load models");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (m: AnatomyModel) => {
    setEditing(m);
    setEditorOpen(true);
  };

  const remove = async (m: AnatomyModel) => {
    setBusyId(m.id);
    try {
      await adminDeleteModel(token, m.id);
      setItems((prev) => prev.filter((x) => x.id !== m.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (m: AnatomyModel) => {
    setBusyId(m.id);
    try {
      const updated = await adminUpdateModel(token, m.id, {
        name: m.name,
        category: m.category,
        description: m.description,
        function: m.function,
        fact: m.fact,
        image_url: m.image_url ?? "",
        model_url: m.model_url ?? "",
        accent: m.accent,
        display_order: m.display_order,
        active: !m.active,
      });
      setItems((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />
        }
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Anatomy models</Text>
            <Text style={styles.subtitle}>Manage the organs shown in the user gallery.</Text>
          </View>
        </View>

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
            <Ionicons name="cube-outline" size={30} color={colors.muted} />
            <Text style={styles.emptyText}>No models yet. Add your first organ.</Text>
          </View>
        ) : (
          items.map((m) => {
            const image = resolveModelImage(m);
            return (
              <View key={m.id} style={styles.card} testID={`model-${m.id}`}>
                <View style={styles.rowTop}>
                  {image ? (
                    <Image source={{ uri: image }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbFallback]}>
                      <Ionicons name="body-outline" size={24} color={colors.brandPrimary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modelName}>{m.name}</Text>
                    <Text style={styles.modelCat}>{m.category}</Text>
                    <View style={styles.modelBadges}>
                      {m.model_url ? (
                        <View style={[styles.pill, { backgroundColor: colors.brandTertiary }]}>
                          <Ionicons
                            name="cube-outline"
                            size={11}
                            color={colors.onBrandTertiary}
                          />
                          <Text style={[styles.pillText, { color: colors.onBrandTertiary }]}>
                            3D linked
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.pill, { backgroundColor: colors.surfaceTertiary }]}>
                          <Text style={[styles.pillText, { color: colors.muted }]}>
                            No 3D URL
                          </Text>
                        </View>
                      )}
                      <View
                        style={[
                          styles.pill,
                          {
                            backgroundColor: m.active
                              ? "#D1FAE5"
                              : colors.surfaceTertiary,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            { color: m.active ? "#065F46" : colors.muted },
                          ]}
                        >
                          {m.active ? "Active" : "Hidden"}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View style={styles.actions}>
                  <Pressable
                    testID={`model-edit-${m.id}`}
                    onPress={() => openEdit(m)}
                    style={[styles.actionBtn, styles.primaryBtn]}
                  >
                    <Ionicons name="create-outline" size={15} color={colors.onBrandPrimary} />
                    <Text style={[styles.actionText, { color: colors.onBrandPrimary }]}>
                      Edit
                    </Text>
                  </Pressable>
                  <Pressable
                    testID={`model-toggle-${m.id}`}
                    disabled={busyId === m.id}
                    onPress={() => toggleActive(m)}
                    style={[styles.actionBtn, styles.mutedBtn]}
                  >
                    <Ionicons
                      name={m.active ? "eye-off-outline" : "eye-outline"}
                      size={15}
                      color={colors.onSurfaceSecondary}
                    />
                    <Text style={[styles.actionText, { color: colors.onSurfaceSecondary }]}>
                      {m.active ? "Hide" : "Show"}
                    </Text>
                  </Pressable>
                  <Pressable
                    testID={`model-delete-${m.id}`}
                    disabled={busyId === m.id}
                    onPress={() => remove(m)}
                    style={[styles.actionBtn, styles.mutedBtn]}
                  >
                    <Ionicons name="trash-outline" size={15} color={colors.error} />
                    <Text style={[styles.actionText, { color: colors.error }]}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Pressable
        testID="model-add-button"
        onPress={openCreate}
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
      >
        <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
        <Text style={styles.fabText}>New model</Text>
      </Pressable>

      <ModelEditor
        visible={editorOpen}
        editing={editing}
        token={token}
        onClose={() => setEditorOpen(false)}
        onSaved={(m) => {
          setEditorOpen(false);
          setItems((prev) => {
            const exists = prev.some((x) => x.id === m.id);
            return exists ? prev.map((x) => (x.id === m.id ? m : x)) : [...prev, m];
          });
        }}
      />
    </View>
  );
}

// ─── Editor Modal ───────────────────────────────────────────────────────────

function ModelEditor({
  visible,
  editing,
  token,
  onClose,
  onSaved,
}: {
  visible: boolean;
  editing: AnatomyModel | null;
  token: string;
  onClose: () => void;
  onSaved: (m: AnatomyModel) => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const [form, setForm] = useState<AnatomyModelInput>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      if (!visible) return;
      if (editing) {
        setForm({
          name: editing.name,
          category: editing.category,
          description: editing.description,
          function: editing.function,
          fact: editing.fact,
          image_url: editing.image_url ?? "",
          model_url: editing.model_url ?? "",
          accent: editing.accent,
          display_order: editing.display_order,
          active: editing.active,
        });
      } else {
        setForm(EMPTY_FORM);
      }
      setError("");
      setUploadError("");
    }, [visible, editing]),
  );

  const set = <K extends keyof AnatomyModelInput>(k: K, v: AnatomyModelInput[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const pickAndUpload = async () => {
    setUploadError("");
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!req.granted) {
            if (!req.canAskAgain) {
              setUploadError(
                "Photo access is blocked. Open Settings to enable it.",
              );
            } else {
              setUploadError("Photo access is needed to pick an image.");
            }
            return;
          }
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85,
        base64: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setUploading(true);
      const filename =
        asset.fileName ??
        `image-${Date.now()}.${(asset.mimeType?.split("/")[1] || "jpg").replace("jpeg", "jpg")}`;
      const type = asset.mimeType ?? (Platform.OS === "web" ? "image/jpeg" : "image/jpeg");
      const uploaded = await uploadImage(token, {
        uri: asset.uri,
        name: filename,
        type,
      });
      set("image_url", uploaded.url);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Could not upload image.");
    } finally {
      setUploading(false);
    }
  };

  const clearImage = () => {
    set("image_url", "");
    setUploadError("");
  };

  const save = async () => {
    setError("");
    if (!form.name.trim() || !form.category.trim() || !form.description.trim() ||
        !form.function.trim() || !form.fact.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    setBusy(true);
    try {
      const payload: AnatomyModelInput = {
        ...form,
        image_url: form.image_url?.trim() || null,
        model_url: form.model_url?.trim() || null,
      };
      const res = editing
        ? await adminUpdateModel(token, editing.id, payload)
        : await adminCreateModel(token, payload);
      onSaved(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.root}
      >
        <View style={[styles.modalHeader, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} style={styles.modalClose} testID="model-editor-close">
            <Ionicons name="close" size={22} color={colors.onSurface} />
          </Pressable>
          <View style={styles.modalTitleWrap}>
            <Text style={styles.modalKicker}>
              {editing ? "EDIT MODEL" : "NEW MODEL"}
            </Text>
            <Text style={styles.modalTitle}>{editing?.name ?? "Anatomy model"}</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 120, gap: 6 }}
          keyboardShouldPersistTaps="handled"
        >
          <FormField label="Name *" value={form.name} onChange={(v) => set("name", v)} testID="model-name" />
          <FormField label="Category *" value={form.category} onChange={(v) => set("category", v)} testID="model-category" />
          <FormField
            label="Short description *"
            value={form.description}
            onChange={(v) => set("description", v)}
            multiline
            testID="model-description"
          />
          <FormField
            label="Function *"
            value={form.function}
            onChange={(v) => set("function", v)}
            multiline
            testID="model-function"
          />
          <FormField label="Fun fact *" value={form.fact} onChange={(v) => set("fact", v)} multiline testID="model-fact" />

          <View style={{ marginTop: 16 }}>
            <Text style={styles.formLabel}>Model image</Text>
            <Text style={styles.helperText}>
              Used as the card thumbnail in the gallery and the banner on the detail
              screen.
            </Text>
            {form.image_url ? (
              <View style={styles.uploadPreviewWrap} testID="model-image-preview">
                <Image
                  source={{ uri: absoluteImageUrl(form.image_url) }}
                  style={styles.uploadPreview}
                />
                <View style={styles.uploadPreviewActions}>
                  <Pressable
                    onPress={pickAndUpload}
                    disabled={uploading}
                    style={[styles.uploadBtn, styles.uploadBtnSecondary]}
                    testID="model-image-replace"
                  >
                    {uploading ? (
                      <ActivityIndicator color={colors.brandPrimary} />
                    ) : (
                      <>
                        <Ionicons name="refresh" size={16} color={colors.brandPrimary} />
                        <Text style={[styles.uploadBtnText, { color: colors.brandPrimary }]}>
                          Replace
                        </Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={clearImage}
                    disabled={uploading}
                    style={[styles.uploadBtn, styles.uploadBtnGhost]}
                    testID="model-image-remove"
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                    <Text style={[styles.uploadBtnText, { color: colors.error }]}>
                      Remove
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={pickAndUpload}
                disabled={uploading}
                style={styles.uploadDropzone}
                testID="model-image-upload"
              >
                {uploading ? (
                  <>
                    <ActivityIndicator color={colors.brandPrimary} />
                    <Text style={styles.uploadHint}>Uploading…</Text>
                  </>
                ) : (
                  <>
                    <View style={styles.uploadIcon}>
                      <Ionicons
                        name="cloud-upload-outline"
                        size={26}
                        color={colors.brandPrimary}
                      />
                    </View>
                    <Text style={styles.uploadTitle}>Upload an image</Text>
                    <Text style={styles.uploadHint}>
                      Pick a JPG, PNG or WEBP from your device (up to 8 MB).
                    </Text>
                  </>
                )}
              </Pressable>
            )}
            {uploadError ? (
              <View style={styles.uploadErrorRow}>
                <Text style={styles.errorText}>{uploadError}</Text>
                {uploadError.includes("Settings") ? (
                  <Pressable
                    onPress={() => Linking.openSettings()}
                    style={styles.settingsBtn}
                    testID="open-settings"
                  >
                    <Text style={styles.settingsBtnText}>Open Settings</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          <FormField
            label="3D model URL"
            value={form.model_url ?? ""}
            onChange={(v) => set("model_url", v)}
            placeholder="https://…"
            autoCapitalize="none"
            testID="model-3d-url"
          />
          <FormField
            label="Accent color"
            value={form.accent}
            onChange={(v) => set("accent", v)}
            placeholder="blue, red, amber, pink…"
            autoCapitalize="none"
            testID="model-accent"
          />
          <FormField
            label="Display order"
            value={String(form.display_order)}
            onChange={(v) => set("display_order", Number(v.replace(/[^0-9]/g, "")) || 0)}
            keyboardType="number-pad"
            testID="model-display-order"
          />
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.formLabel}>Active</Text>
              <Text style={styles.helperText}>
                Hidden models are not shown to users in the gallery.
              </Text>
            </View>
            <Switch
              testID="model-active-toggle"
              value={form.active}
              onValueChange={(v) => set("active", v)}
              trackColor={{ true: colors.brandPrimary, false: colors.border }}
              thumbColor={colors.onBrandPrimary}
            />
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>
        <View style={[styles.modalFooter, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            testID="model-save"
            disabled={busy}
            onPress={save}
            style={({ pressed }) => [
              styles.saveBtn,
              pressed && { opacity: 0.85 },
              busy && { opacity: 0.5 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color={colors.onBrandPrimary} />
                <Text style={styles.saveText}>{editing ? "Save changes" : "Create model"}</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FormField({
  label,
  value,
  onChange,
  multiline,
  placeholder,
  keyboardType,
  autoCapitalize,
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "email-address";
  autoCapitalize?: "none" | "sentences";
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? "sentences"}
        style={[styles.input, multiline && { minHeight: 90, textAlignVertical: "top", paddingTop: 12 }]}
        testID={testID}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  container: { padding: 20, gap: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 13 },
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
  thumb: {
    width: 62,
    height: 62,
    borderRadius: 12,
    backgroundColor: colors.surfaceTertiary,
  },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  modelName: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  modelCat: { color: colors.muted, fontSize: 12, marginTop: 2 },
  modelBadges: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pillText: { fontSize: 10, fontWeight: "800" },
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
  primaryBtn: { backgroundColor: colors.brandPrimary },
  mutedBtn: {
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: { fontWeight: "800", fontSize: 12 },
  fab: {
    position: "absolute",
    right: 20,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: colors.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: colors.surfaceInverse,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  fabText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 14 },
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
  modalHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  modalClose: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitleWrap: { alignItems: "center", gap: 3, flex: 1 },
  modalKicker: {
    color: colors.brandPrimary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  modalTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  formLabel: {
    color: colors.onSurfaceSecondary,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  helperText: { color: colors.muted, fontSize: 12, marginTop: 2 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.onSurface,
    fontSize: 15,
  },
  toggleRow: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "800" },
  uploadDropzone: {
    marginTop: 10,
    minHeight: 160,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 8,
  },
  uploadIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  uploadTitle: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: "800",
  },
  uploadHint: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17,
  },
  uploadPreviewWrap: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    overflow: "hidden",
  },
  uploadPreview: {
    width: "100%",
    height: 180,
    backgroundColor: colors.surfaceTertiary,
  },
  uploadPreviewActions: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
  },
  uploadBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  uploadBtnSecondary: {
    backgroundColor: colors.brandTertiary,
  },
  uploadBtnGhost: {
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  uploadBtnText: { fontSize: 13, fontWeight: "800" },
  uploadErrorRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  settingsBtn: {
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  settingsBtnText: {
    color: colors.onBrandTertiary,
    fontSize: 12,
    fontWeight: "800",
  },
}));
