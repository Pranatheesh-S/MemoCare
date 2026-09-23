import React from "react";
import { StyleSheet, Text as RNText, type TextProps as RNTextProps } from "react-native";
import { role } from "../theme/colors";
import { fontSize, fontWeight, lineHeight, scaleFont } from "../theme/tokens";
import { useAppStore } from "../store/appStore";

type Variant =
  | "caption"
  | "body"
  | "bodyLarge"
  | "button"
  | "title"
  | "subheading"
  | "heading"
  | "headingLarge"
  | "display";

type Props = RNTextProps & {
  variant?: Variant;
  weight?: keyof typeof fontWeight;
  color?: string;
  center?: boolean;
};

/**
 * Every piece of text goes through here so the "Bigger text" preference applies
 * everywhere at once, and so no screen can accidentally ship 14px type.
 */
export function Text({
  variant = "body",
  weight = "regular",
  color,
  center,
  style,
  ...rest
}: Props): React.ReactElement {
  const largeText = useAppStore((state) => state.largeText);

  return (
    <RNText
      maxFontSizeMultiplier={1.35}
      style={[
        styles.base,
        {
          fontSize: scaleFont(fontSize[variant], largeText),
          lineHeight: scaleFont(lineHeight[variant], largeText),
          fontWeight: fontWeight[weight],
          color: color ?? role.bodyText,
          textAlign: center ? "center" : "auto",
        },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    // Keep descenders (g, y, p) visible under large type.
    includeFontPadding: true,
    overflow: "visible",
  },
});
