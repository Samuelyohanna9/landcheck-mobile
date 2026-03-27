import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { colors, radii, spacing } from "../theme/tokens";

type DateFieldProps = {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

const toDateString = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateValue = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return new Date();
  const parsed = new Date(`${raw}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

export const DateField = ({ value, placeholder, onChange, disabled = false }: DateFieldProps) => {
  const [showIosPicker, setShowIosPicker] = useState(false);
  const selectedDate = useMemo(() => parseDateValue(value), [value]);

  const applyChange = (_event: DateTimePickerEvent, nextDate?: Date) => {
    if (!nextDate) {
      if (Platform.OS === "ios") setShowIosPicker(false);
      return;
    }
    onChange(toDateString(nextDate));
    if (Platform.OS === "ios") setShowIosPicker(false);
  };

  const openPicker = () => {
    if (disabled) return;
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: selectedDate,
        mode: "date",
        onChange: applyChange,
      });
      return;
    }
    setShowIosPicker((prev) => !prev);
  };

  return (
    <View style={styles.wrap}>
      <Pressable onPress={openPicker} style={[styles.field, disabled && styles.fieldDisabled]}>
        <Text style={[styles.value, !value && styles.placeholder]}>{value || placeholder}</Text>
        <Ionicons name="calendar-outline" size={18} color={colors.textSoft} />
      </Pressable>
      {value ? (
        <Pressable onPress={() => onChange("")} style={styles.clearButton} disabled={disabled}>
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
      ) : null}
      {Platform.OS === "ios" && showIosPicker ? (
        <View style={styles.iosPickerWrap}>
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="inline"
            onChange={applyChange}
          />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  field: {
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  fieldDisabled: {
    opacity: 0.7,
  },
  value: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  placeholder: {
    color: colors.textMuted,
  },
  clearButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
  },
  clearText: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "700",
  },
  iosPickerWrap: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
    overflow: "hidden",
  },
});
