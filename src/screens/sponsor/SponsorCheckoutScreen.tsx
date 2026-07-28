import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenHero } from "../../components/ScreenHero";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SectionCard } from "../../components/SectionCard";
import { SelectSheet, type SelectOption } from "../../components/SelectSheet";
import { StatusChip } from "../../components/StatusChip";
import {
  buildSponsorPrivacyUrl,
  buildSponsorTermsUrl,
  createSponsorOrder,
  fetchPublicSponsorshipProject,
  fetchSponsorOrderPaymentStatus,
  fetchSponsorOrders,
  SPONSOR_TERMS_VERSION,
} from "../../api/sponsor";
import { getErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { getSponsorProjectAvailability } from "../../sponsor/presentation";
import { colors, radii, spacing } from "../../theme/tokens";
import { formatCurrencyAmount } from "../../utils/currency";
import type { ProjectSummary, SponsorOrderSummary } from "../../types/domain";
import type { SponsorAppStackParamList } from "../../types/navigation";

type Props = NativeStackScreenProps<SponsorAppStackParamList, "SponsorCheckout">;

const dedicationOptions: SelectOption[] = [
  { value: "self", label: "For myself", description: "Support trees in your own name." },
  { value: "memorial", label: "In memory", description: "Dedicate trees to someone being remembered." },
  { value: "birthday", label: "Birthday", description: "Mark a birthday with living impact." },
  { value: "celebration", label: "Celebration", description: "Use trees for milestones, anniversaries, or achievements." },
  { value: "honor", label: "In honor", description: "Recognize someone important with a lasting dedication." },
  { value: "organization", label: "Organization", description: "Sponsor as a company, church, school, or team." },
  { value: "other", label: "Another reason", description: "Choose your own reason for the dedication." },
];

const parseSponsorPaymentReturnUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const protocol = String(parsed.protocol || "").toLowerCase();
    const host = String(parsed.host || "").toLowerCase();
    const path = String(parsed.pathname || "").toLowerCase();
    if (protocol !== "landcheckmobile:" || host !== "sponsor" || path !== "/payment-result") return null;
    return {
      orderUid: String(parsed.searchParams.get("order_uid") || "").trim(),
      status: String(parsed.searchParams.get("status") || "").trim().toLowerCase(),
      message: String(parsed.searchParams.get("message") || "").trim(),
    };
  } catch {
    return null;
  }
};

const normalizeCheckoutText = (value?: string | null) => String(value || "").trim().toLowerCase();

const buildSponsorCheckoutDraftKey = (input: {
  quantity?: number | string | null;
  checkoutCurrency?: string | null;
  dedicationType?: string | null;
  dedicationName?: string | null;
  purchaserNote?: string | null;
}) =>
  [
    Math.max(1, Number(input.quantity || 1)),
    normalizeCheckoutText(input.checkoutCurrency || "ngn"),
    normalizeCheckoutText(input.dedicationType || "self"),
    normalizeCheckoutText(input.dedicationName),
    normalizeCheckoutText(input.purchaserNote),
  ].join("|");

const buildPendingOrderDraftKey = (order?: SponsorOrderSummary | null) => {
  if (!order) return null;
  return buildSponsorCheckoutDraftKey({
    quantity: order.quantity,
    checkoutCurrency: order.currency,
    dedicationType: order.dedication_type,
    dedicationName: order.dedication_name,
    purchaserNote: order.purchaser_note,
  });
};

const getSponsorPriceEntries = (project?: ProjectSummary | null) => {
  const entries: Array<{ currency: string; amount: number }> = [];
  const push = (currency: string | null | undefined, amount: number | null | undefined) => {
    const code = String(currency || "").trim().toUpperCase();
    const numeric = Number(amount || 0);
    if (code.length !== 3 || !Number.isFinite(numeric) || numeric <= 0 || entries.some((item) => item.currency === code)) {
      return;
    }
    entries.push({ currency: code, amount: numeric });
  };
  push("NGN", project?.sponsor_price_per_tree_ngn);
  push("USD", project?.sponsor_price_per_tree_usd);
  if (entries.length === 0) {
    push(project?.sponsor_currency || "NGN", project?.sponsor_price_per_tree);
  }
  return entries;
};

export const SponsorCheckoutScreen = ({ navigation, route }: Props) => {
  const { session } = useAuth();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [error, setError] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [checkoutCurrency, setCheckoutCurrency] = useState("NGN");
  const [dedicationType, setDedicationType] = useState("self");
  const [dedicationName, setDedicationName] = useState("");
  const [purchaserNote, setPurchaserNote] = useState("");
  const [dedicationPickerOpen, setDedicationPickerOpen] = useState(false);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [pendingOrderUid, setPendingOrderUid] = useState<string | null>(null);
  const [pendingPaymentLink, setPendingPaymentLink] = useState<string | null>(null);
  const [pendingOrderDraftKey, setPendingOrderDraftKey] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);

  useEffect(() => {
    let active = true;
    const loadProject = async () => {
      setLoading(true);
      setError("");
      try {
        const [nextProject, orderRows] = await Promise.all([
          fetchPublicSponsorshipProject(route.params.projectId),
          session ? fetchSponsorOrders(session) : Promise.resolve([]),
        ]);
        if (!active) return;
        setProject(nextProject);
        const pendingOrder = orderRows.find(
          (item) =>
            Number(item.project_id || 0) === route.params.projectId &&
            String(item.payment_method || "").trim().toLowerCase() === "flutterwave_standard" &&
            String(item.payment_status || "").trim().toLowerCase() !== "verified" &&
            !["failed", "cancelled", "canceled"].includes(String(item.payment_status || "").trim().toLowerCase()) &&
            !["failed", "cancelled", "canceled"].includes(String(item.payment_gateway_status || "").trim().toLowerCase()) &&
            String(item.order_uid || "").trim(),
        );
        if (pendingOrder?.order_uid) {
          setPendingOrderUid(String(pendingOrder.order_uid));
          setPendingPaymentLink(pendingOrder.payment_link || null);
          setPendingOrderDraftKey(buildPendingOrderDraftKey(pendingOrder));
        } else {
          setPendingOrderUid(null);
          setPendingPaymentLink(null);
          setPendingOrderDraftKey(null);
        }
        if ((nextProject.sponsor_max_per_order || 0) > 0 && Number(quantity || 1) > Number(nextProject.sponsor_max_per_order || 1)) {
          setQuantity(String(nextProject.sponsor_max_per_order || 1));
        }
      } catch (err) {
        if (!active) return;
        setError(getErrorMessage(err, "Failed to load this sponsor project."));
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadProject();
    return () => { active = false; };
  }, [route.params.projectId, session]);

  const parsedQuantity = Math.max(1, Number(quantity || 1));
  const sponsorPriceEntries = useMemo(() => getSponsorPriceEntries(project), [project]);
  const selectedPriceEntry = useMemo(
    () => sponsorPriceEntries.find((entry) => entry.currency === checkoutCurrency) || sponsorPriceEntries[0] || null,
    [checkoutCurrency, sponsorPriceEntries],
  );
  const amountTotal = useMemo(
    () => parsedQuantity * Number(selectedPriceEntry?.amount || 0),
    [parsedQuantity, selectedPriceEntry],
  );
  const currentDraftKey = useMemo(
    () =>
      buildSponsorCheckoutDraftKey({
        quantity: parsedQuantity,
        checkoutCurrency,
        dedicationType,
        dedicationName,
        purchaserNote,
      }),
    [checkoutCurrency, dedicationName, dedicationType, parsedQuantity, purchaserNote],
  );
  const shouldReusePendingCheckout = useMemo(
    () => Boolean(pendingPaymentLink && pendingOrderUid && pendingOrderDraftKey && pendingOrderDraftKey === currentDraftKey),
    [currentDraftKey, pendingOrderDraftKey, pendingOrderUid, pendingPaymentLink],
  );
  const availability = useMemo(() => getSponsorProjectAvailability(project), [project]);
  const dedicationLabel = useMemo(
    () => dedicationOptions.find((option) => option.value === dedicationType)?.label || "For myself",
    [dedicationType],
  );
  const checkoutCurrencyOptions = useMemo<SelectOption[]>(
    () =>
      sponsorPriceEntries.map((entry) => ({
        value: entry.currency,
        label: `${entry.currency} · ${formatCurrencyAmount(entry.amount, entry.currency)} / tree`,
        description: entry.currency === "NGN" ? "Best for sponsors paying in Nigerian naira." : "Best for sponsors paying in US dollars.",
      })),
    [sponsorPriceEntries],
  );

  useEffect(() => {
    if (selectedPriceEntry && selectedPriceEntry.currency !== checkoutCurrency) {
      setCheckoutCurrency(selectedPriceEntry.currency);
    }
  }, [checkoutCurrency, selectedPriceEntry]);

  const openPaymentLink = useCallback(async (link?: string | null) => {
    const nextLink = String(link || "").trim();
    if (!nextLink) {
      setError("The secure payment link is not available yet. Please try again.");
      return;
    }
    setError("");
    try {
      await Linking.openURL(nextLink);
    } catch {
      setError("Could not open the secure payment page. Tap the button again to retry.");
    }
  }, []);

  const refreshPaymentStatus = useCallback(
    async (orderUidOverride?: string | null) => {
      if (!session) return;
      const resolvedOrderUid = String(orderUidOverride || pendingOrderUid || "").trim();
      if (!resolvedOrderUid) return;
      setCheckingPayment(true);
      setError("");
      try {
        const latest = await fetchSponsorOrderPaymentStatus(session, resolvedOrderUid, true);
        setPendingOrderUid(latest.order_uid || resolvedOrderUid);
        setPendingPaymentLink(latest.payment_link || null);
        setPendingOrderDraftKey(buildPendingOrderDraftKey(latest));
        const paymentStatus = String(latest.payment_status || "").trim().toLowerCase();
        const gatewayStatus = String(latest.payment_gateway_status || "").trim().toLowerCase();
        if (paymentStatus === "verified") {
          setPendingOrderUid(null);
          setPendingPaymentLink(null);
          setPendingOrderDraftKey(null);
          Alert.alert(
            "Payment received",
            "Your sponsorship payment has been confirmed. Your trees are now queued for verified field allocation and live updates.",
            [
              {
                text: "Open my trees",
                onPress: () => navigation.replace("SponsorTabs"),
              },
            ],
          );
          return;
        }
        if (gatewayStatus === "failed" || gatewayStatus === "cancelled" || gatewayStatus === "canceled") {
          setPendingPaymentLink(null);
          setPendingOrderDraftKey(null);
          setError("Payment was not completed. Start a fresh secure checkout to try again.");
          return;
        }
        setError("Payment is still being confirmed. If you already paid, wait a moment and check the status again.");
      } catch (err) {
        setError(getErrorMessage(err, "We could not confirm the payment yet. Try again shortly."));
      } finally {
        setCheckingPayment(false);
      }
    },
    [navigation, pendingOrderUid, session],
  );

  const handlePaymentReturn = useCallback(
    async (url: string) => {
      const payload = parseSponsorPaymentReturnUrl(url);
      if (!payload?.orderUid) return;
      setPendingOrderUid(payload.orderUid);
      if (payload.message) setError(payload.message);
      await refreshPaymentStatus(payload.orderUid);
    },
    [refreshPaymentStatus],
  );

  useEffect(() => {
    const subscription = Linking.addEventListener("url", (event) => {
      void handlePaymentReturn(event.url);
    });
    Linking.getInitialURL()
      .then((url) => {
        if (url) void handlePaymentReturn(url);
      })
      .catch(() => undefined);
    return () => {
      subscription.remove();
    };
  }, [handlePaymentReturn]);

  const onSubmit = async () => {
    if (!session || !project) return;
    if (!availability.ready) {
      setError(availability.note);
      return;
    }
    if (!selectedPriceEntry) {
      setError("This project does not have sponsor pricing configured yet.");
      return;
    }
    if (project.sponsor_dedication_enabled && dedicationType !== "self" && !dedicationName.trim()) {
      setError("Add the person, family, or organization this dedication is for.");
      return;
    }
    if (!acceptedTerms || !acceptedPrivacy) {
      setError("Review and accept the sponsor terms and privacy policy before checkout.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await createSponsorOrder(session, {
        project_id: project.id,
        quantity: parsedQuantity,
        checkout_currency: selectedPriceEntry.currency,
        dedication_type: dedicationType,
        dedication_name: dedicationName.trim() || null,
        purchaser_note: purchaserNote.trim() || null,
        payment_method: "flutterwave_standard",
        accepted_terms: acceptedTerms,
        accepted_policy: acceptedPrivacy,
        consent_version: SPONSOR_TERMS_VERSION,
      });
      if (!response.order_uid || !response.payment_link) {
        throw new Error("Secure payment link was not returned.");
      }
      setPendingOrderUid(response.order_uid);
      setPendingPaymentLink(response.payment_link);
      setPendingOrderDraftKey(currentDraftKey);
      await openPaymentLink(response.payment_link);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to start your secure sponsorship payment."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) return null;

  return (
    <ScreenSurface>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScreenHero
          title={project?.public_title || project?.name || "Sponsor this project"}
          subtitle={project?.location_text || "Verified tree restoration project"}
          badge={<StatusChip label={availability.label} tone={availability.tone} />}
          rightSlot={
            <View style={styles.heroBadge}>
              <Ionicons name="card-outline" size={18} color={colors.primaryDark} />
            </View>
          }
        />

        <LinearGradient colors={["#0f5b2f", "#217f45", "#63bf71"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.introBanner}>
          <Text style={styles.bannerEyebrow}>Secure sponsorship checkout</Text>
          <Text style={styles.bannerTitle}>Pay online, then follow real planting evidence as your trees move into the field.</Text>
          <Text style={styles.bannerBody}>
            Your payment goes through Flutterwave secure checkout. Once confirmed, the order is activated automatically for field allocation and live sponsor updates.
          </Text>
        </LinearGradient>

        <SectionCard title="Project overview" subtitle="A public Green project prepared for supporters who want clear, verified impact.">
          {loading ? (
            <Text style={styles.note}>Loading project...</Text>
          ) : project ? (
            <>
              <Text style={styles.bodyText}>
                {project.public_description ||
                  "Choose how many trees you want to support in this verified planting project."}
              </Text>
              <View style={styles.chipRow}>
                <StatusChip
                  label={
                    sponsorPriceEntries.length > 0
                      ? sponsorPriceEntries.map((entry) => `${formatCurrencyAmount(entry.amount, entry.currency)} / tree`).join(" · ")
                      : "Pricing coming soon"
                  }
                  tone={sponsorPriceEntries.length > 0 ? "online" : "warning"}
                />
                <StatusChip
                  label={
                    project.slots_available === null || project.slots_available === undefined
                      ? "Open capacity"
                      : `${project.slots_available} trees available`
                  }
                  tone="neutral"
                />
                <StatusChip label={project.organization_name || "LandCheck Green"} tone="neutral" />
              </View>
              <Text style={styles.instructions}>{availability.note}</Text>
              {project.sponsor_payment_instructions ? (
                <View style={styles.paymentBox}>
                  <Text style={styles.paymentTitle}>Sponsor note</Text>
                  <Text style={styles.paymentText}>{project.sponsor_payment_instructions}</Text>
                </View>
              ) : null}
            </>
          ) : (
            <Text style={styles.error}>{error || "Project not found."}</Text>
          )}
        </SectionCard>

        {project ? (
          <SectionCard title="Reserve your trees" subtitle="Choose how many trees to sponsor and continue to secure online payment.">
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Number of trees</Text>
              <TextInput
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="number-pad"
                placeholder="1"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
              <Text style={styles.note}>
                Max per order: {project.sponsor_max_per_order || "No set limit"} | Total: {formatCurrencyAmount(amountTotal, selectedPriceEntry?.currency || checkoutCurrency)}
              </Text>
            </View>

            {checkoutCurrencyOptions.length > 1 ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Pay in</Text>
                <Pressable style={styles.selectTrigger} onPress={() => setCurrencyPickerOpen(true)}>
                  <Text style={styles.selectValue}>
                    {selectedPriceEntry
                      ? `${selectedPriceEntry.currency} · ${formatCurrencyAmount(selectedPriceEntry.amount, selectedPriceEntry.currency)} / tree`
                      : checkoutCurrency}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : null}

            {project.sponsor_dedication_enabled ? (
              <>
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Dedication type</Text>
                  <Pressable style={styles.selectTrigger} onPress={() => setDedicationPickerOpen(true)}>
                    <Text style={styles.selectValue}>{dedicationLabel}</Text>
                    <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Dedicated to</Text>
                  <TextInput
                    value={dedicationName}
                    onChangeText={setDedicationName}
                    placeholder="Name, family, organization, or occasion"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                  />
                </View>
              </>
            ) : null}

            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Message to the team</Text>
              <TextInput
                value={purchaserNote}
                onChangeText={setPurchaserNote}
                placeholder="Optional note for the LandCheck team"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.multiline]}
                multiline
              />
            </View>

            <View style={styles.consentPanel}>
              <Text style={styles.consentTitle}>Sponsor consent</Text>
              <Text style={styles.consentBody}>
                Before checkout, confirm that you have reviewed the public sponsor terms and the LandCheck privacy policy.
              </Text>
              <Pressable onPress={() => setAcceptedTerms((prev) => !prev)} style={styles.toggleRow}>
                <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
                  {acceptedTerms ? <Text style={styles.checkboxTick}>✓</Text> : null}
                </View>
                <View style={styles.toggleTextBlock}>
                  <Text style={styles.toggleTitle}>I accept the public sponsor terms</Text>
                  <Pressable onPress={() => void Linking.openURL(buildSponsorTermsUrl())}>
                    <Text style={styles.toggleLink}>Open sponsor terms</Text>
                  </Pressable>
                </View>
              </Pressable>
              <Pressable onPress={() => setAcceptedPrivacy((prev) => !prev)} style={styles.toggleRow}>
                <View style={[styles.checkbox, acceptedPrivacy && styles.checkboxChecked]}>
                  {acceptedPrivacy ? <Text style={styles.checkboxTick}>✓</Text> : null}
                </View>
                <View style={styles.toggleTextBlock}>
                  <Text style={styles.toggleTitle}>I accept the LandCheck privacy policy</Text>
                  <Pressable onPress={() => void Linking.openURL(buildSponsorPrivacyUrl())}>
                    <Text style={styles.toggleLink}>Open privacy policy</Text>
                  </Pressable>
                </View>
              </Pressable>
            </View>

            {pendingOrderUid ? (
              <View style={styles.pendingBox}>
                <Text style={styles.pendingTitle}>Secure payment in progress</Text>
                <Text style={styles.pendingText}>
                  {shouldReusePendingCheckout
                    ? "Complete payment in Flutterwave checkout. When you return to the app, this screen will confirm the latest order status."
                    : "You changed the number of trees or checkout details. Starting payment now will create a fresh Flutterwave checkout with the updated total."}
                </Text>
                <Text style={styles.pendingMeta}>Order: {pendingOrderUid}</Text>
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.actionStack}>
              <PrimaryButton
                label={
                  submitting
                    ? "Opening secure checkout..."
                    : shouldReusePendingCheckout
                      ? "Open secure checkout again"
                      : pendingOrderUid
                        ? "Create updated secure checkout"
                      : availability.ready
                        ? "Continue to secure payment"
                        : "Project not open yet"
                }
                onPress={() => (shouldReusePendingCheckout ? void openPaymentLink(pendingPaymentLink) : void onSubmit())}
                disabled={submitting || loading || checkingPayment || !availability.ready}
                variant={availability.ready ? "primary" : "secondary"}
              />
              {pendingOrderUid && pendingPaymentLink && !shouldReusePendingCheckout ? (
                <PrimaryButton
                  label="Reopen previous checkout"
                  onPress={() => void openPaymentLink(pendingPaymentLink)}
                  disabled={submitting || loading || checkingPayment}
                  variant="secondary"
                />
              ) : null}
              {pendingOrderUid ? (
                <PrimaryButton
                  label={checkingPayment ? "Checking payment..." : "Check payment status"}
                  onPress={() => void refreshPaymentStatus(pendingOrderUid)}
                  disabled={submitting || loading || checkingPayment}
                  variant="secondary"
                />
              ) : null}
            </View>
          </SectionCard>
        ) : null}
      </KeyboardAvoidingView>

      <SelectSheet
        visible={dedicationPickerOpen}
        title="Choose dedication type"
        options={dedicationOptions}
        selectedValue={dedicationType}
        onClose={() => setDedicationPickerOpen(false)}
        onSelect={setDedicationType}
      />
      <SelectSheet
        visible={currencyPickerOpen}
        title="Choose checkout currency"
        options={checkoutCurrencyOptions}
        selectedValue={checkoutCurrency}
        onClose={() => setCurrencyPickerOpen(false)}
        onSelect={setCheckoutCurrency}
      />
    </ScreenSurface>
  );
};

const styles = StyleSheet.create({
  heroBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  introBanner: {
    borderRadius: radii.xl,
    padding: spacing.md,
    gap: 8,
  },
  bannerEyebrow: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.25,
  },
  bannerTitle: {
    color: "#ffffff",
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "900",
    letterSpacing: -0.35,
  },
  bannerBody: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    lineHeight: 20,
  },
  fieldBlock: {
    gap: 6,
  },
  label: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: "600",
  },
  selectTrigger: {
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  bodyText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  instructions: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
    backgroundColor: colors.panelSoft,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  paymentBox: {
    gap: 6,
    backgroundColor: "#f7fbf7",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  paymentTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  paymentText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  consentPanel: {
    gap: 10,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#f8fcf9",
    padding: spacing.md,
  },
  consentTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  consentBody: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  checkboxTick: {
    color: colors.inverseText,
    fontSize: 14,
    fontWeight: "900",
  },
  toggleTextBlock: {
    flex: 1,
    gap: 4,
  },
  toggleTitle: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  toggleLink: {
    color: colors.primaryDark,
    fontSize: 12.5,
    fontWeight: "800",
  },
  pendingBox: {
    gap: 6,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#b7dfc3",
    backgroundColor: "#f2fbf4",
    padding: spacing.md,
  },
  pendingTitle: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: "900",
  },
  pendingText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  pendingMeta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  actionStack: {
    gap: spacing.sm,
  },
  note: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
});
