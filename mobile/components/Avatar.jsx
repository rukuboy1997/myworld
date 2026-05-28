import React from "react";
import { View, Image, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

export default function Avatar({ uri, username, size = 40, online }) {
  const colors = useColors();
  const initials = username ? username.slice(0, 2).toUpperCase() : "?";
  const borderRadius = size / 2;
  const dotSize = Math.max(10, size * 0.25);

  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[
            styles.img,
            {
              width: size,
              height: size,
              borderRadius,
              borderColor: colors.cardBorder,
            },
          ]}
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            {
              width: size,
              height: size,
              borderRadius,
              backgroundColor: colors.primary + "25",
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <Text
            style={[
              styles.initials,
              { fontSize: size * 0.36, color: colors.primary },
            ]}
          >
            {initials}
          </Text>
        </View>
      )}
      {online !== undefined && (
        <View
          style={[
            styles.dot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: online ? "#10b981" : colors.border,
              borderColor: colors.background,
              bottom: 0,
              right: 0,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  img: { borderWidth: 1 },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  initials: { fontWeight: "700" },
  dot: { position: "absolute", borderWidth: 2 },
});
