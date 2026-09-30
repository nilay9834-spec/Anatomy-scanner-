import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";

import { makeStyles, useTheme } from "@/src/theme";

export type ScannerProps = {
  onMarker: (markerId: number) => void;
};

export function MarkerScanner({ onMarker }: ScannerProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const lockedRef = useRef(false);

  const handleScan = useCallback(
    (data: string) => {
      if (lockedRef.current) return;
      const parsed = parseMarker(data);
      if (parsed == null) return;
      lockedRef.current = true;
      setBusy(true);
      onMarker(parsed);
      // Release lock after a short delay so a new scan can happen if user returns.
      setTimeout(() => {
        lockedRef.current = false;
        setBusy(false);
      }, 2000);
    },
    [onMarker],
  );

  if (Platform.OS === "web") {
    return (
      <View style={styles.web} testID="scanner-web-fallback">
        <View style={styles.frameIcon}>
          <Ionicons name="qr-code-outline" size={44} color={colors.brandPrimary} />
        </View>
        <Text style={styles.title}>Scan here to open the 3D model</Text>
        <Text style={styles.hint}>
          Live scanning runs on the mobile app. Open the Expo Go build to point
          your camera at a marker card.
        </Text>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.frame}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionBox} testID="scanner-permission">
        <View style={styles.frameIcon}>
          <Ionicons name="camera-outline" size={40} color={colors.brandPrimary} />
        </View>
        <Text style={styles.title}>Scan here to open the 3D model</Text>
        <Text style={styles.hint}>
          {permission.canAskAgain
            ? "Give the app access to your camera to scan marker cards."
            : "Camera access is blocked. Open Settings to enable it."}
        </Text>
        {permission.canAskAgain ? (
          <Pressable
            onPress={requestPermission}
            style={styles.grantBtn}
            testID="scanner-grant"
          >
            <Ionicons name="camera" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.grantText}>Allow camera access</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => Linking.openSettings()}
            style={styles.grantBtn}
            testID="scanner-open-settings"
          >
            <Ionicons name="settings-outline" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.grantText}>Open Settings</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.frame} testID="scanner-frame">
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["qr", "ean13", "code128", "code39", "datamatrix"],
        }}
        onBarcodeScanned={(event) => handleScan(event.data)}
      />
      {/* Overlay corners */}
      <View pointerEvents="none" style={styles.overlay}>
        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />
        <View style={styles.overlayCaption}>
          <Ionicons name="scan-outline" size={16} color={colors.onSurface} />
          <Text style={styles.overlayText}>
            {busy ? "Reading marker…" : "Scan here to open the 3D model"}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Accept multiple encodings on the marker card:
 *   - plain integer:            "101"
 *   - "marker:101" / "marker=101"
 *   - "marker id: 101"
 *   - a URL with ?marker=101
 */
export function parseMarker(raw: string): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const bareNumber = /^\d{1,6}$/.exec(trimmed);
  if (bareNumber) return Number(bareNumber[0]);
  const kv = /marker[^\d]*(\d{1,6})/i.exec(trimmed);
  if (kv) return Number(kv[1]);
  try {
    const url = new URL(trimmed);
    const q = url.searchParams.get("marker") || url.searchParams.get("id");
    if (q && /^\d{1,6}$/.test(q)) return Number(q);
  } catch {
    // not a URL, ignore
  }
  return null;
}

const useStyles = makeStyles((colors) => ({
  frame: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: colors.surfaceInverse,
    position: "relative",
  },
  camera: { flex: 1 },
  permissionBox: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  web: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  frameIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    color: colors.onSurface,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 320,
  },
  grantBtn: {
    marginTop: 10,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  grantText: { color: colors.onBrandPrimary, fontSize: 14, fontWeight: "800" },
  overlay: {
    ...(Platform.OS === "web" ? { position: "absolute" as const } : { position: "absolute" as const }),
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "flex-end",
    padding: 18,
  },
  corner: {
    position: "absolute",
    width: 34,
    height: 34,
    borderColor: "#38BDF8",
    borderWidth: 4,
  },
  cornerTL: { top: 18, left: 18, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 12 },
  cornerTR: { top: 18, right: 18, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 12 },
  cornerBL: { bottom: 64, left: 18, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 64, right: 18, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 12 },
  overlayCaption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(248,250,252,0.95)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  overlayText: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: "800",
  },
}));
