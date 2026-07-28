import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { EmptyState } from "../../components/EmptyState";
import { MetricTile } from "../../components/MetricTile";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenHero } from "../../components/ScreenHero";
import { ScreenSurface } from "../../components/ScreenSurface";
import { SectionCard } from "../../components/SectionCard";
import { SelectSheet } from "../../components/SelectSheet";
import { StatusChip } from "../../components/StatusChip";
import {
  createSponsorAgentPayoutRequest,
  fetchSponsorAgentBankOptions,
  fetchSponsorAgentPayoutDashboard,
  saveSponsorAgentBankAccount,
} from "../../api/green";
import { getErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useGreenSync } from "../../context/GreenSyncContext";
import type { SponsorAgentBankOption, SponsorAgentPayoutDashboard } from "../../types/domain";
import { colors, radii, spacing } from "../../theme/tokens";
import { formatCurrencyAmount } from "../../utils/currency";
import { formatDateTime, toTitle } from "../../utils/format";

const payoutTone = (status?: string | null) => {
  const key = String(status || "").trim().toLowerCase();
  if (key === "paid") return "online" as const;
  if (key === "requested" || key === "approved" || key === "processing") return "warning" as const;
  if (key === "rejected" || key === "failed" || key === "cancelled") return "offline" as const;
  return "neutral" as const;
};

export const GreenAgentPayoutScreen = () => {
  const { session } = useAuth();
  const { selectedProject } = useGreenSync();
  const [dashboard, setDashboard] = useState<SponsorAgentPayoutDashboard | null>(null);
  const [banks, setBanks] = useState<SponsorAgentBankOption[]>([]);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [editingBankDetails, setEditingBankDetails] = useState(false);
  const [error, setError] = useState("");
  const selectedProjectId = Number(selectedProject?.id || 0);

  const applyBankAccountFields = useCallback((bankAccount?: SponsorAgentPayoutDashboard["bank_account"] | null) => {
    if (bankAccount) {
      setBankCode(String(bankAccount.bank_code || ""));
      setBankName(String(bankAccount.bank_name || ""));
      setAccountNumber(String(bankAccount.account_number || ""));
      setAccountName(String(bankAccount.account_name || ""));
      setEditingBankDetails(!Boolean(bankAccount.verified));
      return;
    }
    setBankCode("");
    setBankName("");
    setAccountNumber("");
    setAccountName("");
    setEditingBankDetails(true);
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!session?.user.id) return;
    setRefreshing(true);
    setError("");
    try {
      const [nextDashboard, nextBanks] = await Promise.all([
        fetchSponsorAgentPayoutDashboard(session.user.id, session.user.organization_id, selectedProjectId || null),
        fetchSponsorAgentBankOptions("NG").catch(() => []),
      ]);
      setDashboard(nextDashboard);
      setBanks(nextBanks);
      applyBankAccountFields(nextDashboard.bank_account);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load sponsor agent earnings."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyBankAccountFields, selectedProjectId, session?.user.id, session?.user.organization_id]);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
    }, [loadDashboard]),
  );

  useEffect(() => {
    if (!banks.length || !bankCode) return;
    const match = banks.find((item) => item.code === bankCode);
    if (match) setBankName(match.name);
  }, [bankCode, banks]);

  const summary = dashboard?.summary;
  const bankAccountRecord = dashboard?.bank_account || null;
  const availableAmount = Number(summary?.available_amount || 0);
  const minimumAmount = Number(dashboard?.minimum_payout_amount || 0);
  const payoutEligible = Boolean(summary?.payout_eligible);
  const bankVerified = Boolean(summary?.bank_verified);
  const bankDetailsLocked = bankVerified && !editingBankDetails;

  const onSaveBankAccount = useCallback(async () => {
    if (!session?.user.id) return;
    setSavingAccount(true);
    setError("");
    try {
      await saveSponsorAgentBankAccount({
        userId: session.user.id,
        organizationId: session.user.organization_id,
        bankCode,
        bankName,
        accountNumber,
        accountName,
      });
      await loadDashboard();
      setEditingBankDetails(false);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to verify and save bank account."));
    } finally {
      setSavingAccount(false);
    }
  }, [accountName, accountNumber, bankCode, bankName, loadDashboard, session?.user.id, session?.user.organization_id]);

  const onRequestPayout = useCallback(async () => {
    if (!session?.user.id) return;
    setRequestingPayout(true);
    setError("");
    try {
      await createSponsorAgentPayoutRequest({
        userId: session.user.id,
        organizationId: session.user.organization_id,
        projectId: selectedProjectId || null,
      });
      await loadDashboard();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to request payout."));
    } finally {
      setRequestingPayout(false);
    }
  }, [loadDashboard, selectedProjectId, session?.user.id, session?.user.organization_id]);

  const bankOptions = useMemo(
    () =>
      banks.map((item) => ({
        label: item.name,
        value: item.code,
        description: item.code,
      })),
    [banks],
  );

  const latestRequests = useMemo(() => (dashboard?.requests || []).slice(0, 4), [dashboard?.requests]);
  const latestEarnings = useMemo(() => (dashboard?.earnings || []).slice(0, 8), [dashboard?.earnings]);
  const selectedProjectIsSponsor = useMemo(() => {
    const accessModel = String(selectedProject?.access_model || "").trim().toLowerCase();
    return accessModel === "public_sponsorship" || Boolean(selectedProject?.public_sponsor_enabled);
  }, [selectedProject?.access_model, selectedProject?.public_sponsor_enabled]);
  const selectedProjectRate = useMemo(
    () => (dashboard?.projects || []).find((project) => Number(project.project_id || 0) === selectedProjectId) || null,
    [dashboard?.projects, selectedProjectId],
  );
  const selectedProjectSummary = useMemo(
    () => (dashboard?.project_summaries || []).find((project) => Number(project.project_id || 0) === selectedProjectId) || null,
    [dashboard?.project_summaries, selectedProjectId],
  );
  const selectedProjectEarnings = useMemo(
    () => (dashboard?.earnings || []).filter((item) => Number(item.project_id || 0) === selectedProjectId),
    [dashboard?.earnings, selectedProjectId],
  );
  const selectedProjectRequests = useMemo(
    () =>
      (dashboard?.requests || []).filter((item) =>
        Array.isArray(item.project_ids) ? item.project_ids.map((value) => Number(value || 0)).includes(selectedProjectId) : false,
      ),
    [dashboard?.requests, selectedProjectId],
  );
  const selectedProjectCurrency =
    selectedProjectRate?.currency || selectedProjectSummary?.currency || dashboard?.currency || "NGN";
  const selectedProjectAvailableAmount = Number(selectedProjectSummary?.available_amount || 0);
  const selectedProjectRequestedAmount = Number(selectedProjectSummary?.requested_amount || 0);
  const selectedProjectPaidAmount = Number(selectedProjectSummary?.paid_amount || 0);
  const selectedProjectPlantingCount = Number(selectedProjectSummary?.planting_count || 0);
  const selectedProjectMaintenanceCount = Number(selectedProjectSummary?.maintenance_count || 0);
  const selectedProjectLocation = String(selectedProjectRate?.location_text || selectedProject?.location_text || "").trim() || "Selected sponsor project";
  const walletStateLabel = !bankVerified ? "Bank setup needed" : payoutEligible ? "Ready for payout" : "Building balance";
  const walletStateTone = !bankVerified ? "warning" : payoutEligible ? "online" : "neutral";

  if (!session) return null;

  return (
    <ScreenSurface refreshing={refreshing} onRefresh={() => void loadDashboard()}>
      <ScreenHero
        title="Sponsor Agent Wallet"
        subtitle={selectedProjectIsSponsor ? selectedProject?.name || "Selected sponsor project" : "Sponsor-funded earnings and payout setup"}
        badge={<StatusChip label={bankVerified ? "Bank verified" : "Bank setup needed"} tone={bankVerified ? "online" : "warning"} />}
        rightSlot={
          <View style={styles.heroBadge}>
            <Ionicons name="wallet-outline" size={18} color={colors.primaryDark} />
          </View>
        }
      />

      <View style={styles.spotlight}>
        <View style={styles.spotlightHeader}>
          <View style={styles.spotlightTag}>
            <Ionicons name="leaf-outline" size={14} color={colors.primaryDark} />
            <Text style={styles.spotlightTagText}>Selected Sponsor Project</Text>
          </View>
          <StatusChip label={walletStateLabel} tone={walletStateTone} />
        </View>
        <Text style={styles.spotlightTitle}>{selectedProject?.name || "Sponsor project wallet"}</Text>
        <Text style={styles.spotlightBody}>
          {selectedProjectLocation}
          {selectedProjectIsSponsor
            ? ". Track verified planting income, approved maintenance income, and payout readiness for this project."
            : ". Switch to a sponsor project to view sponsor-funded earnings and payout controls."}
        </Text>
        <View style={styles.spotlightSplit}>
          <View style={styles.spotlightAmountCard}>
            <Text style={styles.spotlightAmountLabel}>Available now</Text>
            <Text style={styles.spotlightAmountValue}>
              {formatCurrencyAmount(selectedProjectAvailableAmount || availableAmount, selectedProjectCurrency)}
            </Text>
            <Text style={styles.spotlightAmountHint}>
              Minimum payout: {formatCurrencyAmount(minimumAmount, selectedProjectCurrency)}
            </Text>
          </View>
          <View style={styles.spotlightRateStack}>
            <View style={styles.spotlightRateCard}>
              <Text style={styles.spotlightRateLabel}>Planting rate</Text>
              <Text style={styles.spotlightRateValue}>
                {formatCurrencyAmount(Number(selectedProjectRate?.planting_fee || 0), selectedProjectCurrency)}
              </Text>
            </View>
            <View style={styles.spotlightRateCard}>
              <Text style={styles.spotlightRateLabel}>Maintenance rate</Text>
              <Text style={styles.spotlightRateValue}>
                {formatCurrencyAmount(Number(selectedProjectRate?.maintenance_fee || 0), selectedProjectCurrency)}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.spotlightPills}>
          <View style={styles.spotlightPill}>
            <Ionicons name="shield-checkmark-outline" size={14} color={colors.primaryDark} />
            <Text style={styles.spotlightPillText}>{bankVerified ? "Bank verified" : "Verify bank to request payout"}</Text>
          </View>
          <View style={styles.spotlightPill}>
            <Ionicons name="git-branch-outline" size={14} color={colors.primaryDark} />
            <Text style={styles.spotlightPillText}>{selectedProjectPlantingCount} planting item{selectedProjectPlantingCount === 1 ? "" : "s"}</Text>
          </View>
          <View style={styles.spotlightPill}>
            <Ionicons name="construct-outline" size={14} color={colors.primaryDark} />
            <Text style={styles.spotlightPillText}>{selectedProjectMaintenanceCount} maintenance item{selectedProjectMaintenanceCount === 1 ? "" : "s"}</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <SectionCard title="Loading" subtitle="Checking your sponsor-funded work and payout status.">
          <ActivityIndicator color={colors.primary} />
        </SectionCard>
      ) : !selectedProjectIsSponsor ? (
        <SectionCard title="Wallet locked to sponsor projects" subtitle="This tool only appears for the currently selected public sponsor project.">
          <EmptyState
            title="Switch to a sponsor project"
            subtitle="Select one of your public sponsor projects from the project dropdown to see sponsor-funded earnings, rates, and payout details."
          />
        </SectionCard>
      ) : !dashboard?.eligible ? (
        <SectionCard title="Wallet access still syncing" subtitle="This project is sponsor-enabled, but this user is not yet coming back from the payout access check as an approved sponsor agent.">
          <EmptyState
            title="Sponsor agent access not confirmed yet"
            subtitle="The user is on a sponsor project, but Wallet access is still waiting for sponsor-agent assignment confirmation from LandCheck Work."
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </SectionCard>
      ) : (
        <>
          <SectionCard
            title={selectedProject?.name ? `${selectedProject.name} Wallet` : "Current Sponsor Project"}
            subtitle="This is the live payout and rate snapshot for the sponsor project you currently selected in the app."
            rightSlot={<StatusChip label={selectedProjectCurrency} tone="neutral" />}
          >
            <View style={styles.metricRow}>
              <MetricTile
                label="Available"
                value={formatCurrencyAmount(selectedProjectAvailableAmount, selectedProjectCurrency)}
                tone={selectedProjectAvailableAmount > 0 ? "success" : "default"}
                helper="Current project"
              />
              <MetricTile
                label="Requested"
                value={formatCurrencyAmount(selectedProjectRequestedAmount, selectedProjectCurrency)}
                helper="In review"
              />
            </View>
            <View style={styles.metricRow}>
              <MetricTile
                label="Paid out"
                value={formatCurrencyAmount(selectedProjectPaidAmount, selectedProjectCurrency)}
                tone="success"
                helper="Completed"
              />
              <MetricTile
                label="Minimum"
                value={formatCurrencyAmount(minimumAmount, selectedProjectCurrency)}
                helper="Payout threshold"
              />
            </View>
            <View style={styles.metricRow}>
              <MetricTile label="Planting jobs" value={selectedProjectPlantingCount} helper="Linked trees" />
              <MetricTile label="Maintenance jobs" value={selectedProjectMaintenanceCount} helper="Approved visits" />
            </View>
            <View style={styles.listCard}>
              <View style={styles.listHead}>
                <Text style={styles.listTitle}>Project rates</Text>
                <StatusChip label={selectedProjectLocation} tone="neutral" />
              </View>
              <Text style={styles.listMeta}>
                Planting: {formatCurrencyAmount(Number(selectedProjectRate?.planting_fee || 0), selectedProjectCurrency)} per linked tree
              </Text>
              <Text style={styles.listMeta}>
                Maintenance: {formatCurrencyAmount(Number(selectedProjectRate?.maintenance_fee || 0), selectedProjectCurrency)} per approved visit
              </Text>
            </View>
          </SectionCard>

          <SectionCard title="Wallet Summary" subtitle="Live totals across every public sponsor project where you are an approved agent.">
            <View style={styles.metricRow}>
              <MetricTile label="Available" value={formatCurrencyAmount(availableAmount, dashboard?.currency || "NGN")} tone={payoutEligible ? "success" : "default"} helper="Ready for payout" />
              <MetricTile label="Requested" value={formatCurrencyAmount(Number(summary?.requested_amount || 0), dashboard?.currency || "NGN")} helper="Pending admin review" />
            </View>
            <View style={styles.metricRow}>
              <MetricTile label="Paid out" value={formatCurrencyAmount(Number(summary?.paid_amount || 0), dashboard?.currency || "NGN")} tone="success" helper="Completed payouts" />
              <MetricTile label="Minimum" value={formatCurrencyAmount(minimumAmount, dashboard?.currency || "NGN")} helper="Required before request" />
            </View>
            <View style={styles.metricRow}>
              <MetricTile label="Trees planted" value={Number(summary?.planting_count || 0)} helper="Sponsor-linked trees" />
              <MetricTile label="Maintenance" value={Number(summary?.maintenance_count || 0)} helper="Approved field tasks" />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </SectionCard>

          <SectionCard
            title="Bank Details"
            subtitle="Payout requests require a verified Nigerian bank account. The account name is checked before saving."
            rightSlot={<StatusChip label={bankVerified ? "Verified" : "Pending"} tone={bankVerified ? "online" : "warning"} />}
          >
            <Text style={styles.fieldLabel}>Bank</Text>
            <Pressable onPress={() => !bankDetailsLocked && setBankPickerOpen(true)} style={[styles.selectField, bankDetailsLocked && styles.fieldLocked]}>
              <Text style={[styles.selectValue, !bankName && styles.selectPlaceholder]}>{bankName || "Select bank"}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </Pressable>

            <Text style={styles.fieldLabel}>Account number</Text>
            <TextInput
              value={accountNumber}
              onChangeText={(value) => setAccountNumber(value.replace(/[^\d]/g, "").slice(0, 10))}
              keyboardType="number-pad"
              placeholder="Enter 10-digit account number"
              placeholderTextColor={colors.textMuted}
              editable={!bankDetailsLocked}
              style={[styles.input, bankDetailsLocked && styles.fieldLocked]}
            />

            <Text style={styles.fieldLabel}>Account name</Text>
            <TextInput
              value={accountName}
              onChangeText={setAccountName}
              placeholder="Verified account name"
              placeholderTextColor={colors.textMuted}
              editable={!bankDetailsLocked}
              style={[styles.input, bankDetailsLocked && styles.fieldLocked]}
            />

            {bankVerified && !editingBankDetails ? (
              <Text style={styles.helperText}>
                Verified on {bankAccountRecord?.verified_at ? formatDateTime(bankAccountRecord.verified_at) : "recorded date unavailable"}.
                Use Change Bank Details only when the agent wants to replace this payout account.
              </Text>
            ) : bankVerified && editingBankDetails ? (
              <Text style={styles.helperText}>Changing this bank will trigger a fresh verification before future payout requests.</Text>
            ) : null}

            <View style={styles.buttonStack}>
              <PrimaryButton
                label={bankDetailsLocked ? "Bank Details Verified" : savingAccount ? "Verifying..." : "Verify & Save Bank Details"}
                onPress={() => void onSaveBankAccount()}
                disabled={savingAccount || bankDetailsLocked || !bankCode || accountNumber.length < 10}
              />
              {bankVerified ? (
                <PrimaryButton
                  label={editingBankDetails ? "Keep Current Verified Details" : "Change Bank Details"}
                  variant={editingBankDetails ? "ghost" : "secondary"}
                  onPress={() => {
                    if (editingBankDetails) {
                      applyBankAccountFields(bankAccountRecord);
                      setEditingBankDetails(false);
                      setError("");
                      return;
                    }
                    setEditingBankDetails(true);
                  }}
                />
              ) : null}
            </View>
          </SectionCard>

          <SectionCard title="Request Payout" subtitle="Requests open once your available sponsor-funded earnings reach the minimum amount.">
            <View style={styles.requestRow}>
              <View style={styles.requestMeta}>
                <StatusChip label={payoutEligible ? "Eligible now" : "Below minimum"} tone={payoutEligible ? "online" : "warning"} />
                <Text style={styles.requestText}>
                  Available balance: {formatCurrencyAmount(availableAmount, dashboard?.currency || "NGN")} | Minimum:{" "}
                  {formatCurrencyAmount(minimumAmount, dashboard?.currency || "NGN")}
                </Text>
                <Text style={styles.requestSubtext}>
                  {bankVerified
                    ? "Your verified bank details are ready for payout review."
                    : "Save and verify your bank details before requesting payout."}
                </Text>
              </View>
              <PrimaryButton
                label={requestingPayout ? "Requesting..." : "Request Payout"}
                onPress={() => void onRequestPayout()}
                disabled={requestingPayout || !payoutEligible || !bankVerified}
              />
            </View>
          </SectionCard>

          <SectionCard title="Project Rates" subtitle="These are the current sponsor-agent rates set by your administrators for each public sponsor project.">
            {(dashboard?.projects || []).length === 0 ? (
              <EmptyState title="No sponsor projects yet" subtitle="Public sponsor projects will appear here once you are assigned." />
            ) : (
              <View style={styles.list}>
                {(dashboard?.projects || []).map((project) => (
                  <View key={`agent-project-${project.project_id}`} style={styles.listCard}>
                    <View style={styles.listHead}>
                      <Text style={styles.listTitle}>{project.project_name || "Public sponsor project"}</Text>
                      <StatusChip label={project.currency || "NGN"} tone="neutral" />
                    </View>
                    <Text style={styles.listMeta}>{project.location_text || "Organization-wide public sponsor assignment"}</Text>
                    <Text style={styles.listMeta}>
                      Planting: {formatCurrencyAmount(Number(project.planting_fee || 0), project.currency || "NGN")} per linked tree
                    </Text>
                    <Text style={styles.listMeta}>
                      Maintenance: {formatCurrencyAmount(Number(project.maintenance_fee || 0), project.currency || "NGN")} per approved visit
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </SectionCard>

          <SectionCard
            title="Selected Project Earnings"
            subtitle="Every sponsor-funded planting and maintenance item already recorded for the project you currently selected."
          >
            {selectedProjectEarnings.length === 0 ? (
              <EmptyState title="No earnings yet" subtitle="Sponsor-funded trees and approved maintenance for this project will appear here once verified." />
            ) : (
              <View style={styles.list}>
                {selectedProjectEarnings.map((item) => (
                  <View key={item.earning_key} style={styles.listCard}>
                    <View style={styles.listHead}>
                      <Text style={styles.listTitle}>{item.task_label || toTitle(item.work_type)}</Text>
                      <StatusChip label={toTitle(item.payout_status || "available")} tone={payoutTone(item.payout_status)} />
                    </View>
                    <Text style={styles.listMeta}>{item.project_name || "Public sponsor project"}</Text>
                    <Text style={styles.listMeta}>
                      {item.tree_label || "Tree record"}{item.species ? ` | ${item.species}` : ""}{item.sponsor_name ? ` | Sponsor: ${item.sponsor_name}` : ""}
                    </Text>
                    <Text style={styles.listMeta}>
                      {formatCurrencyAmount(Number(item.amount || 0), item.currency || "NGN")} | {formatDateTime(item.earned_at)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </SectionCard>

          <SectionCard title="Selected Project Payout History" subtitle="Payout requests that include earnings from the project you currently selected.">
            {selectedProjectRequests.length === 0 ? (
              <EmptyState title="No payout requests yet" subtitle="When this project contributes to a payout request, the latest approvals and payment status will appear here." />
            ) : (
              <View style={styles.list}>
                {selectedProjectRequests.map((item) => {
                  const isPaid = String(item.status || "").trim().toLowerCase() === "paid";
                  return (
                    <View key={`agent-payout-${item.id}`} style={styles.listCard}>
                      <View style={styles.listHead}>
                        <Text style={styles.listTitle}>{item.request_uid || `Request #${item.id}`}</Text>
                        <StatusChip label={toTitle(item.status || "requested")} tone={payoutTone(item.status)} checkmark={isPaid} />
                      </View>
                      <Text style={styles.listMeta}>
                        {formatCurrencyAmount(Number(item.amount_total || 0), item.currency || "NGN")} | Applied {formatDateTime(item.created_at)}
                      </Text>
                      <Text style={styles.listMeta}>
                        Account: {item.bank_name || "-"} | {item.account_number_masked || item.account_number || "-"} | {item.account_name || "-"}
                      </Text>
                      {isPaid ? (
                        <Text style={styles.listMeta}>
                          Paid {formatDateTime(item.paid_at)} via {toTitle(item.settlement_channel || "manual")}
                          {item.settlement_reference ? ` | Ref: ${item.settlement_reference}` : ""}
                        </Text>
                      ) : null}
                      {item.review_notes ? <Text style={styles.listMeta}>Note: {item.review_notes}</Text> : null}
                    </View>
                  );
                })}
              </View>
            )}
          </SectionCard>

          <SectionCard title="All Sponsor Project Activity" subtitle="Your latest sponsor-funded items across every sponsor project where you are an approved agent.">
            {latestEarnings.length === 0 ? (
              <EmptyState title="No sponsor activity yet" subtitle="Approved sponsor-funded planting and maintenance from any sponsor project will appear here." />
            ) : (
              <View style={styles.list}>
                {latestEarnings.map((item) => (
                  <View key={`all-${item.earning_key}`} style={styles.listCard}>
                    <View style={styles.listHead}>
                      <Text style={styles.listTitle}>{item.task_label || toTitle(item.work_type)}</Text>
                      <StatusChip label={toTitle(item.payout_status || "available")} tone={payoutTone(item.payout_status)} />
                    </View>
                    <Text style={styles.listMeta}>{item.project_name || "Public sponsor project"}</Text>
                    <Text style={styles.listMeta}>
                      {item.tree_label || "Tree record"}{item.species ? ` | ${item.species}` : ""}{item.sponsor_name ? ` | Sponsor: ${item.sponsor_name}` : ""}
                    </Text>
                    <Text style={styles.listMeta}>
                      {formatCurrencyAmount(Number(item.amount || 0), item.currency || "NGN")} | {formatDateTime(item.earned_at)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </SectionCard>
        </>
      )}

      <SelectSheet
        visible={bankPickerOpen}
        title="Select bank"
        options={bankOptions}
        selectedValue={bankCode}
        searchable
        searchPlaceholder="Search bank name"
        emptyMessage="No bank matches that name."
        onClose={() => setBankPickerOpen(false)}
        onSelect={(value) => {
          setBankPickerOpen(false);
          setBankCode(value);
        }}
      />
    </ScreenSurface>
  );
};

const styles = StyleSheet.create({
  heroBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  spotlight: {
    position: "relative",
    overflow: "hidden",
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: "rgba(30, 138, 66, 0.16)",
    backgroundColor: "#ffffff",
    padding: spacing.md,
    gap: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  spotlightHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  spotlightTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: "rgba(30, 138, 66, 0.12)",
  },
  spotlightTagText: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.25,
  },
  spotlightTitle: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  spotlightBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  spotlightSplit: {
    gap: spacing.sm,
  },
  spotlightAmountCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(30, 138, 66, 0.14)",
    backgroundColor: "#155f31",
    padding: spacing.md,
    gap: 4,
  },
  spotlightAmountLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  spotlightAmountValue: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
  },
  spotlightAmountHint: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    lineHeight: 16,
  },
  spotlightRateStack: {
    gap: spacing.sm,
  },
  spotlightRateCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  spotlightRateLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  spotlightRateValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
  },
  spotlightPills: {
    gap: spacing.sm,
  },
  spotlightPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  spotlightPillText: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  metricRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  selectField: {
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  fieldLocked: {
    backgroundColor: colors.panelSoft,
    opacity: 0.92,
  },
  selectValue: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  selectPlaceholder: {
    color: colors.textMuted,
    fontWeight: "600",
  },
  input: {
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  helperText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  buttonStack: {
    gap: spacing.sm,
  },
  requestRow: {
    gap: spacing.md,
  },
  requestMeta: {
    gap: 8,
  },
  requestText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  requestSubtext: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  list: {
    gap: spacing.sm,
  },
  listCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    padding: spacing.md,
    gap: 6,
  },
  listHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  listTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  listMeta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
