import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, spacing } from "../theme/tokens";

export type SelectOption = {
  label: string;
  value: string;
  description?: string | null;
  disabled?: boolean;
};

type SelectSheetProps = {
  visible: boolean;
  title: string;
  options: SelectOption[];
  selectedValue?: string | null;
  onClose: () => void;
  onSelect: (value: string) => void;
};

export const SelectSheet = ({ visible, title, options, selectedValue, onClose, onSelect }: SelectSheetProps) => {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: spacing.xl + Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <ScrollView
            style={styles.optionsScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.options}
          >
            {options.map((option) => {
              const active = String(selectedValue || "") === option.value;
              return (
                <Pressable
                  key={option.value}
                  disabled={option.disabled}
                  onPress={() => {
                    onSelect(option.value);
                    onClose();
                  }}
                  style={[styles.option, active && styles.optionActive, option.disabled && styles.optionDisabled]}
                >
                  <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{option.label}</Text>
                  {option.description ? <Text style={styles.optionDescription}>{option.description}</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(7, 24, 14, 0.32)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "84%",
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  optionsScroll: {
    flexGrow: 0,
  },
  handle: {
    alignSelf: "center",
    width: 52,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.borderStrong,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  options: {
    gap: spacing.sm,
  },
  option: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    padding: spacing.md,
    gap: 4,
  },
  optionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  optionLabelActive: {
    color: colors.primaryDark,
  },
  optionDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
