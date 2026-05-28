import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";

function SkeletonBox({ width, height, style }) {
  const colors = useColors();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1000 }), -1, true);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.skeleton, colors.skeletonHighlight],
    ),
  }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius: 8 }, animStyle, style]}
    />
  );
}

export function PostSkeleton() {
  const colors = useColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.cardBorder },
      ]}
    >
      <View style={styles.header}>
        <SkeletonBox width={44} height={44} style={{ borderRadius: 22 }} />
        <View style={styles.headerText}>
          <SkeletonBox width={120} height={14} />
          <SkeletonBox width={80} height={11} style={{ marginTop: 6 }} />
        </View>
      </View>
      <SkeletonBox width="100%" height={18} style={{ marginTop: 12 }} />
      <SkeletonBox width="70%" height={14} style={{ marginTop: 8 }} />
      <SkeletonBox
        width="100%"
        height={180}
        style={{ marginTop: 12, borderRadius: 12 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  header: { flexDirection: "row", alignItems: "center" },
  headerText: { marginLeft: 12, flex: 1, gap: 6 },
});
