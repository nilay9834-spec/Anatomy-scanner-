import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, Ellipse, Line, Path, Rect } from "react-native-svg";

import { AnatomyModel } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";

// Fixed body regions with normalized coordinates and a canonical name to match
// the models coming from the backend (matched by lowercase, stripping trailing 's').
export type BodyRegionKey =
  | "brain"
  | "eyes"
  | "ears"
  | "lungs"
  | "heart"
  | "liver"
  | "stomach"
  | "kidneys";

type RegionMeta = {
  key: BodyRegionKey;
  label: string;
  // Center point in SVG coords (240x360) for the label callout.
  labelAt: { x: number; y: number; anchor: "left" | "right" };
  // Where the callout leader line meets the organ.
  targetAt: { x: number; y: number };
};

const REGIONS: RegionMeta[] = [
  { key: "brain", label: "Brain", labelAt: { x: 205, y: 20, anchor: "right" }, targetAt: { x: 148, y: 30 } },
  { key: "eyes", label: "Eyes", labelAt: { x: 12, y: 58, anchor: "left" }, targetAt: { x: 108, y: 62 } },
  { key: "ears", label: "Ears", labelAt: { x: 205, y: 74, anchor: "right" }, targetAt: { x: 155, y: 74 } },
  { key: "lungs", label: "Lungs", labelAt: { x: 12, y: 138, anchor: "left" }, targetAt: { x: 92, y: 148 } },
  { key: "heart", label: "Heart", labelAt: { x: 205, y: 158, anchor: "right" }, targetAt: { x: 138, y: 158 } },
  { key: "liver", label: "Liver", labelAt: { x: 12, y: 208, anchor: "left" }, targetAt: { x: 96, y: 202 } },
  { key: "stomach", label: "Stomach", labelAt: { x: 205, y: 218, anchor: "right" }, targetAt: { x: 148, y: 214 } },
  { key: "kidneys", label: "Kidneys", labelAt: { x: 12, y: 268, anchor: "left" }, targetAt: { x: 96, y: 262 } },
];

function normalize(name: string): BodyRegionKey | null {
  const clean = name.trim().toLowerCase().replace(/s$/, "");
  const map: Record<string, BodyRegionKey> = {
    brain: "brain",
    eye: "eyes",
    ear: "ears",
    lung: "lungs",
    heart: "heart",
    liver: "liver",
    stomach: "stomach",
    kidney: "kidneys",
  };
  return map[clean] ?? null;
}

export function matchRegionModel(
  models: AnatomyModel[],
  key: BodyRegionKey,
): AnatomyModel | null {
  const m = models.find((mm) => normalize(mm.name) === key);
  return m ?? null;
}

export function HumanBody({
  models,
  onSelect,
}: {
  models: AnatomyModel[];
  onSelect: (region: RegionMeta, model: AnatomyModel | null) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [active, setActive] = useState<BodyRegionKey | null>(null);
  const available = useMemo(
    () => new Set(models.map((m) => normalize(m.name)).filter(Boolean) as BodyRegionKey[]),
    [models],
  );

  // Colors for the SVG anatomy — hex literals so light + dark render identically.
  const bodyFill = "#3B82F6"; // Body silhouette
  const bodyOutline = "#1E3A8A";
  const skin = "#60A5FA";
  const boundary = "#F59E0B";
  const activeBoundary = "#EF4444";
  const brainFill = "#F472B6";
  const lungsFill = "#F9A8D4";
  const heartFill = "#DC2626";
  const liverFill = "#B45309";
  const stomachFill = "#F97316";
  const kidneyFill = "#B91C1C";
  const eyeFill = "#93C5FD";

  const isSelectable = (k: BodyRegionKey) => available.has(k);
  const strokeFor = (k: BodyRegionKey) => (active === k ? activeBoundary : boundary);
  const strokeWidthFor = (k: BodyRegionKey) => (active === k ? 4 : 2.5);

  return (
    <View style={styles.wrap}>
      <View style={styles.svgWrap}>
        <Svg viewBox="0 0 240 360" width="100%" height={360}>
          {/* Body silhouette */}
          {/* Head */}
          <Ellipse cx="120" cy="52" rx="42" ry="46" fill={skin} stroke={bodyOutline} strokeWidth="2" />
          {/* Neck */}
          <Rect x="108" y="94" width="24" height="14" fill={skin} stroke={bodyOutline} strokeWidth="1.5" />
          {/* Torso */}
          <Path
            d="M60 120 C60 108, 84 106, 120 106 C156 106, 180 108, 180 120 L188 240 C188 260, 168 275, 140 278 L100 278 C72 275, 52 260, 52 240 Z"
            fill={bodyFill}
            stroke={bodyOutline}
            strokeWidth="2"
          />
          {/* Arms */}
          <Path d="M60 122 C40 130, 34 170, 32 220 C30 250, 34 275, 46 300 L60 296 C52 270, 50 240, 56 210 C60 180, 66 150, 74 130 Z"
            fill={bodyFill} stroke={bodyOutline} strokeWidth="2" />
          <Path d="M180 122 C200 130, 206 170, 208 220 C210 250, 206 275, 194 300 L180 296 C188 270, 190 240, 184 210 C180 180, 174 150, 166 130 Z"
            fill={bodyFill} stroke={bodyOutline} strokeWidth="2" />
          {/* Hips */}
          <Path d="M56 260 L60 320 L110 356 L130 356 L180 320 L184 260 Z" fill={bodyFill} stroke={bodyOutline} strokeWidth="2" />

          {/* Brain (inside head, click target) */}
          <Path
            d="M92 30 Q120 6, 148 30 Q158 42, 148 58 Q120 68, 92 58 Q82 42, 92 30 Z"
            fill={brainFill}
            stroke={strokeFor("brain")}
            strokeWidth={strokeWidthFor("brain")}
            opacity={isSelectable("brain") ? 1 : 0.4}
            onPressIn={() => setActive("brain")}
            onPressOut={() => setActive(null)}
            onPress={() => onSelect(REGIONS[0], matchRegionModel(models, "brain"))}
          />

          {/* Eyes */}
          <Circle cx="108" cy="62" r="6" fill={eyeFill} stroke={strokeFor("eyes")} strokeWidth={strokeWidthFor("eyes")}
            opacity={isSelectable("eyes") ? 1 : 0.4}
            onPressIn={() => setActive("eyes")} onPressOut={() => setActive(null)}
            onPress={() => onSelect(REGIONS[1], matchRegionModel(models, "eyes"))} />
          <Circle cx="132" cy="62" r="6" fill={eyeFill} stroke={strokeFor("eyes")} strokeWidth={strokeWidthFor("eyes")}
            opacity={isSelectable("eyes") ? 1 : 0.4}
            onPressIn={() => setActive("eyes")} onPressOut={() => setActive(null)}
            onPress={() => onSelect(REGIONS[1], matchRegionModel(models, "eyes"))} />

          {/* Ears */}
          <Ellipse cx="76" cy="60" rx="6" ry="10" fill={skin} stroke={strokeFor("ears")} strokeWidth={strokeWidthFor("ears")}
            opacity={isSelectable("ears") ? 1 : 0.4}
            onPressIn={() => setActive("ears")} onPressOut={() => setActive(null)}
            onPress={() => onSelect(REGIONS[2], matchRegionModel(models, "ears"))} />
          <Ellipse cx="164" cy="60" rx="6" ry="10" fill={skin} stroke={strokeFor("ears")} strokeWidth={strokeWidthFor("ears")}
            opacity={isSelectable("ears") ? 1 : 0.4}
            onPressIn={() => setActive("ears")} onPressOut={() => setActive(null)}
            onPress={() => onSelect(REGIONS[2], matchRegionModel(models, "ears"))} />

          {/* Lungs (two lobes) */}
          <Path
            d="M84 130 Q70 140, 74 175 Q80 200, 100 200 Q108 190, 106 165 Q102 138, 84 130 Z"
            fill={lungsFill}
            stroke={strokeFor("lungs")}
            strokeWidth={strokeWidthFor("lungs")}
            opacity={isSelectable("lungs") ? 1 : 0.4}
            onPressIn={() => setActive("lungs")} onPressOut={() => setActive(null)}
            onPress={() => onSelect(REGIONS[3], matchRegionModel(models, "lungs"))}
          />
          <Path
            d="M156 130 Q170 140, 166 175 Q160 200, 140 200 Q132 190, 134 165 Q138 138, 156 130 Z"
            fill={lungsFill}
            stroke={strokeFor("lungs")}
            strokeWidth={strokeWidthFor("lungs")}
            opacity={isSelectable("lungs") ? 1 : 0.4}
            onPressIn={() => setActive("lungs")} onPressOut={() => setActive(null)}
            onPress={() => onSelect(REGIONS[3], matchRegionModel(models, "lungs"))}
          />

          {/* Heart */}
          <Path
            d="M120 175 C110 158, 88 158, 88 178 C88 200, 120 218, 120 218 C120 218, 152 200, 152 178 C152 158, 130 158, 120 175 Z"
            fill={heartFill}
            stroke={strokeFor("heart")}
            strokeWidth={strokeWidthFor("heart")}
            opacity={isSelectable("heart") ? 1 : 0.4}
            onPressIn={() => setActive("heart")} onPressOut={() => setActive(null)}
            onPress={() => onSelect(REGIONS[4], matchRegionModel(models, "heart"))}
          />

          {/* Liver */}
          <Path
            d="M78 216 Q76 200, 100 200 Q130 200, 140 214 Q142 226, 120 232 Q90 234, 78 216 Z"
            fill={liverFill}
            stroke={strokeFor("liver")}
            strokeWidth={strokeWidthFor("liver")}
            opacity={isSelectable("liver") ? 1 : 0.4}
            onPressIn={() => setActive("liver")} onPressOut={() => setActive(null)}
            onPress={() => onSelect(REGIONS[5], matchRegionModel(models, "liver"))}
          />

          {/* Stomach */}
          <Path
            d="M132 208 Q158 210, 160 232 Q158 250, 140 252 Q124 252, 122 234 Q124 220, 132 208 Z"
            fill={stomachFill}
            stroke={strokeFor("stomach")}
            strokeWidth={strokeWidthFor("stomach")}
            opacity={isSelectable("stomach") ? 1 : 0.4}
            onPressIn={() => setActive("stomach")} onPressOut={() => setActive(null)}
            onPress={() => onSelect(REGIONS[6], matchRegionModel(models, "stomach"))}
          />

          {/* Kidneys */}
          <Path
            d="M84 258 Q78 244, 90 240 Q104 240, 108 260 Q108 276, 96 278 Q84 274, 84 258 Z"
            fill={kidneyFill}
            stroke={strokeFor("kidneys")}
            strokeWidth={strokeWidthFor("kidneys")}
            opacity={isSelectable("kidneys") ? 1 : 0.4}
            onPressIn={() => setActive("kidneys")} onPressOut={() => setActive(null)}
            onPress={() => onSelect(REGIONS[7], matchRegionModel(models, "kidneys"))}
          />
          <Path
            d="M156 258 Q162 244, 150 240 Q136 240, 132 260 Q132 276, 144 278 Q156 274, 156 258 Z"
            fill={kidneyFill}
            stroke={strokeFor("kidneys")}
            strokeWidth={strokeWidthFor("kidneys")}
            opacity={isSelectable("kidneys") ? 1 : 0.4}
            onPressIn={() => setActive("kidneys")} onPressOut={() => setActive(null)}
            onPress={() => onSelect(REGIONS[7], matchRegionModel(models, "kidneys"))}
          />

          {/* Callout lines */}
          {REGIONS.map((r) => {
            const startX = r.labelAt.anchor === "left" ? 44 : 196;
            return (
              <Line
                key={r.key}
                x1={startX}
                y1={r.labelAt.y + 8}
                x2={r.targetAt.x}
                y2={r.targetAt.y}
                stroke={active === r.key ? activeBoundary : boundary}
                strokeWidth={active === r.key ? 2.5 : 1.5}
                strokeLinecap="round"
                opacity={isSelectable(r.key) ? 0.85 : 0.35}
              />
            );
          })}
        </Svg>

        {/* Overlay label pills (Pressable so tapping the pill also selects). */}
        {REGIONS.map((r) => {
          const disabled = !isSelectable(r.key);
          const left = r.labelAt.anchor === "left";
          return (
            <Pressable
              key={r.key}
              testID={`body-region-${r.key}`}
              disabled={disabled}
              onPressIn={() => setActive(r.key)}
              onPressOut={() => setActive(null)}
              onPress={() => onSelect(r, matchRegionModel(models, r.key))}
              style={[
                styles.labelPill,
                {
                  left: left ? "3%" : undefined,
                  right: left ? undefined : "3%",
                  top: `${(r.labelAt.y / 360) * 100}%`,
                  borderColor: active === r.key ? activeBoundary : boundary,
                  backgroundColor:
                    active === r.key ? "#FEF3C7" : disabled ? colors.surfaceTertiary : "#FEF9C3",
                  opacity: disabled ? 0.55 : 1,
                },
              ]}
            >
              <Text style={[styles.labelText, disabled && { color: colors.muted }]}>
                {r.label}
              </Text>
              {disabled ? null : (
                <Ionicons name="chevron-forward" size={12} color="#78350F" />
              )}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.caption}>
        Tap a highlighted organ to see quick info about it.
      </Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: {
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  svgWrap: {
    position: "relative",
    width: "100%",
    height: 360,
  },
  labelPill: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 2,
    borderRadius: 8,
  },
  labelText: {
    color: "#78350F",
    fontSize: 12,
    fontWeight: "800",
  },
  caption: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
  },
}));
