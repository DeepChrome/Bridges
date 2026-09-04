/* Shared UI primitives, matching the web app's visual language.
 *
 * The web app leans on CSS classes; here the same shapes are components so the
 * spacing, radii and colours stay in one place instead of being retyped per screen.
 */

import React from "react";
import {
  View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, SvgXml } from "react-native-svg";
import { iconFor } from "@core/icons";
import { AV, AV_IDS } from "@core/avatars";
import { useTheme, radius, space } from "./theme";
import { say, hasRealAudio } from "./audio";

export function Screen({ children, scroll = true }) {
  const t = useTheme();
  const Body = scroll ? ScrollView : View;
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.bg }}>
      <Body
        style={{ flex: 1 }}
        contentContainerStyle={scroll ? { padding: space.pad, paddingBottom: 40 } : null}
      >
        {children}
      </Body>
    </SafeAreaView>
  );
}

export function Title({ children, sub }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: t.ink, fontSize: 26, fontWeight: "700",
                     letterSpacing: -0.4 }}>{children}</Text>
      {sub ? <Text style={{ color: t.ink3, fontSize: 14, marginTop: 2 }}>{sub}</Text> : null}
    </View>
  );
}

export function Card({ children, style }) {
  const t = useTheme();
  return (
    <View style={[{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1,
                    borderRadius: radius.lg, padding: 16 }, style]}>
      {children}
    </View>
  );
}

export function List({ children }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1,
                   borderRadius: radius.lg, overflow: "hidden" }}>
      {children}
    </View>
  );
}

export function Row({ children, onPress, disabled, last }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", gap: 12,
        paddingVertical: 13, paddingHorizontal: 15,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: t.lineSoft,
        backgroundColor: pressed && !disabled ? t.surface2 : "transparent",
        opacity: disabled ? 0.5 : 1,
        minHeight: 56,
      })}
    >
      {children}
    </Pressable>
  );
}

export function Btn({ label, onPress, kind = "plain", disabled, style }) {
  const t = useTheme();
  const tone = {
    plain: { bg: t.surface, border: t.line, fg: t.ink },
    pri: { bg: t.brand, border: t.brandDim, fg: "#1A1508" },
    good: { bg: t.good, border: t.goodDim, fg: "#fff" },
    bad: { bg: t.bad, border: t.badDim, fg: "#fff" },
    ghost: { bg: "transparent", border: "transparent", fg: t.ink2 },
  }[kind];
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [{
        backgroundColor: tone.bg, borderColor: tone.border,
        borderWidth: 1, borderBottomWidth: pressed ? 1 : 3,
        marginBottom: pressed ? 2 : 0,
        borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: 18,
        alignItems: "center", opacity: disabled ? 0.45 : 1, minHeight: 48,
        justifyContent: "center",
      }, style]}
    >
      <Text style={{ color: tone.fg, fontWeight: "600", fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function Pill({ children, tone }) {
  const t = useTheme();
  const c = tone === "good" ? { bg: t.goodBg, fg: t.good }
          : tone === "brand" ? { bg: t.brandBg, fg: t.brandInk }
          : { bg: t.surface2, fg: t.ink2 };
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: 99,
                   paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color: c.fg, fontSize: 11, fontWeight: "600" }}>{children}</Text>
    </View>
  );
}

export function Bar({ value }) {
  const t = useTheme();
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surface2,
                   borderWidth: 1, borderColor: t.lineSoft, overflow: "hidden" }}>
      <View style={{ width: `${Math.round(value * 100)}%`, height: "100%",
                     backgroundColor: t.good }} />
    </View>
  );
}

/* The same icon paths the web app draws, rendered through react-native-svg. */
export function UnitIcon({ id, size = 22, color }) {
  const t = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke={color || t.ink3} strokeWidth={1.6}
         strokeLinecap="round" strokeLinejoin="round">
      <Path d={iconFor(id)} />
    </Svg>
  );
}

export function Thumb({ id, done, locked, n }) {
  const t = useTheme();
  return (
    <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: "center",
                   justifyContent: "center",
                   backgroundColor: done ? t.goodBg : t.surface2,
                   borderWidth: done ? 2 : 0, borderColor: t.good }}>
      {locked ? (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={t.ink3}
             strokeWidth={1.8}>
          <Path d="M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3" />
        </Svg>
      ) : (
        <UnitIcon id={id} color={done ? t.good : t.ink3} />
      )}
      {n !== undefined ? (
        <View style={{ position: "absolute", right: -3, bottom: -3, minWidth: 17,
                       height: 17, borderRadius: 9, backgroundColor: t.surface,
                       borderWidth: 1, borderColor: t.line, alignItems: "center",
                       justifyContent: "center", paddingHorizontal: 3 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: t.ink2 }}>{n}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* The same ten characters the web app draws, from the same source. SvgXml renders the
   shared markup directly rather than each platform keeping its own copy of the art. */
export function Avatar({ id, size = 44 }) {
  const a = AV[id] || AV[AV_IDS[0]];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2,
                   backgroundColor: a.bg, overflow: "hidden" }}>
      <SvgXml
        width={size}
        height={size}
        xml={`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">${a.svg}</svg>`}
      />
    </View>
  );
}

export { AV, AV_IDS };

/* A speaker that stays live when the collection has a real recording, whether or not
   the device has a Russian voice. */
export function Speaker({ text, size = 40 }) {
  const t = useTheme();
  const real = hasRealAudio(text);
  return (
    <Pressable
      accessibilityLabel={real ? "Hear it" : "Hear it (device voice)"}
      onPress={() => say(text)}
      hitSlop={8}
      style={({ pressed }) => ({
        width: size, height: size, borderRadius: size / 2, borderWidth: 1,
        borderColor: real ? t.brand : t.line, alignItems: "center",
        justifyContent: "center", opacity: pressed ? 0.6 : 1,
      })}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
           stroke={real ? t.brandInk : t.ink3} strokeWidth={2}
           strokeLinecap="round" strokeLinejoin="round">
        <Path d="M11 5 6 9H3v6h3l5 4z" />
        <Path d="M15.5 8.5a5 5 0 0 1 0 7" />
      </Svg>
    </Pressable>
  );
}

export function Ru({ children, size = 19, style }) {
  const t = useTheme();
  return <Text style={[{ color: t.ink, fontSize: size }, style]}>{children}</Text>;
}

export function Muted({ children, size = 13, style }) {
  const t = useTheme();
  return <Text style={[{ color: t.ink3, fontSize: size }, style]}>{children}</Text>;
}

/* A header that says where you are: what this screen is, and what it belongs to.
   "Lesson 3" over "Around Town" beats a bar that just reads "Lesson" — the same
   generic-naming problem as the units had, one level up. */
export function HeaderTitle({ title, sub }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Text numberOfLines={1}
            style={{ color: t.ink, fontSize: 16, fontWeight: "700",
                     letterSpacing: -0.2 }}>
        {title}
      </Text>
      {sub ? (
        <Text numberOfLines={1}
              style={{ color: t.ink3, fontSize: 10, fontWeight: "700",
                       letterSpacing: 0.9, textTransform: "uppercase", marginTop: 1 }}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center",
                   backgroundColor: t.bg }}>
      <ActivityIndicator color={t.brand} />
    </View>
  );
}

export const styles = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 1,
                  textTransform: "uppercase", marginBottom: 9, marginLeft: 2 },
});
