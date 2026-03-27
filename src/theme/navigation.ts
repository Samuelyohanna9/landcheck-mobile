import { DarkTheme, type Theme } from "@react-navigation/native";
import { colors } from "./tokens";

export const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.panel,
    border: colors.border,
    text: colors.text,
    primary: colors.primary,
    notification: colors.accent,
  },
};
