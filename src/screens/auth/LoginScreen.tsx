import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BrandMark } from "../../components/BrandMark";
import { PrimaryButton } from "../../components/PrimaryButton";
import { StatusChip } from "../../components/StatusChip";
import { requestSponsorPasswordReset } from "../../api/auth";
import { useAuth } from "../../context/AuthContext";
import { api, getErrorMessage } from "../../api/client";
import { APP_NAME } from "../../config/env";
import { colors, radii, spacing } from "../../theme/tokens";
import type { AuthRoute, RootStackParamList } from "../../types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

type RouteCopy = {
  eyebrow: string;
  badge: string;
  title: string;
  subtitle: string;
  audienceTitle: string;
  audienceItems: string[];
  guidanceItems: string[];
  icon: keyof typeof Ionicons.glyphMap;
};

const ROUTE_COPY: Record<AuthRoute, RouteCopy> = {
  sponsor: {
    eyebrow: "Public sponsor route",
    badge: "Sponsor access",
    title: "Sponsor trees and follow verified impact",
    subtitle: "For individuals and organizations supporting approved public tree projects through secure online sponsorship.",
    audienceTitle: "Who this route is for",
    audienceItems: [
      "People or organizations sponsoring trees with their own account.",
      "Users who want project selection, payment, map evidence, and maintenance updates.",
      "Supporters who need a personal sponsor profile before any payment is made.",
    ],
    guidanceItems: [
      "Create an account first, then choose a public sponsor project.",
      "Use your email and password to return later and track sponsored trees.",
      "Payments and evidence may be reviewed by the LandCheck Green admin team.",
    ],
    icon: "leaf-outline",
  },
  field: {
    eyebrow: "Partner field route",
    badge: "Field access",
    title: "Sign in for field capture and assigned work",
    subtitle: "For verified agents, supervisors, and partner staff already onboarded in LandCheck Work by an organization admin.",
    audienceTitle: "Who this route is for",
    audienceItems: [
      "Agents or supervisors already issued a username and password in LandCheck Work.",
      "Users capturing field evidence, plot data, tree records, reviews, or assigned tasks.",
      "Partner staff working under an organization or sponsor project workflow.",
    ],
    guidanceItems: [
      "No sign up happens on this route.",
      "Use the exact username and password already assigned by your organization.",
      `By continuing, you confirm you are authorized to access ${APP_NAME} field data for your organization or project.`,
    ],
    icon: "compass-outline",
  },
};

export const LoginScreen = ({ navigation, route }: Props) => {
  const { signIn, signInSponsor, signUpSponsor } = useAuth();
  const authRoute = route.params?.authRoute ?? "sponsor";
  const routeCopy = ROUTE_COPY[authRoute];
  const [sponsorSignup, setSponsorSignup] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sponsorName, setSponsorName] = useState("");
  const [sponsorOrgName, setSponsorOrgName] = useState("");
  const [sponsorEmail, setSponsorEmail] = useState("");
  const [sponsorPhone, setSponsorPhone] = useState("");
  const [sponsorAccountType, setSponsorAccountType] = useState<"individual" | "organization">("individual");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestingReset, setRequestingReset] = useState(false);
  const [error, setError] = useState("");
  const [referredByCode, setReferredByCode] = useState("");

  const openSponsorRoute = () => {
    setError("");
    setShowPassword(false);
    setPassword("");
    navigation.replace("Login", { authRoute: "sponsor" });
  };

  const openFieldRoute = () => {
    setError("");
    setSponsorSignup(false);
    setShowPassword(false);
    setPassword("");
    navigation.replace("Login", { authRoute: "field" });
  };

  useEffect(() => {
    // Check initial url
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url);
      }
    });

    // Check incoming urls
    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (url) {
        handleDeepLink(url);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = (url: string) => {
    try {
      console.log("Deep link received: ", url);
      const query = url.split("?")[1];
      if (query) {
        const params = query.split("&");
        for (const p of params) {
          const [key, val] = p.split("=");
          if (key === "ref" && val) {
            setReferredByCode(decodeURIComponent(val));
            setSponsorSignup(true);
            setError("");
            break;
          }
        }
      }
    } catch (err) {
      console.error("Failed to parse deep link: ", err);
    }
  };

  const formTitle = useMemo(() => {
    if (authRoute === "field") return "Field work login";
    return sponsorSignup ? "Create sponsor account" : "Sponsor sign in";
  }, [authRoute, sponsorSignup]);

  const formSubtitle = useMemo(() => {
    if (authRoute === "field") {
      return "Use the same username and password already assigned in LandCheck Work.";
    }
    return sponsorSignup
      ? "Create your sponsor profile first, then choose any public project and pay online."
      : "Sign in to your sponsor account to track funded trees, map evidence, and verified updates.";
  }, [authRoute, sponsorSignup]);

  const onSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      if (authRoute === "field") {
        await signIn(username, password);
      } else if (sponsorSignup) {
        await signUpSponsor({
          full_name: sponsorName,
          account_type: sponsorAccountType,
          organization_name: sponsorOrgName,
          email: sponsorEmail,
          phone: sponsorPhone,
          password,
          referred_by_code: referredByCode,
        });
        try {
          await api.post("/green/public/logs", {
            source: "sponsor_app",
            event_type: "sponsor_signup",
            actor: sponsorName || sponsorEmail,
            message: `Sponsor ${sponsorName} (${sponsorEmail}) signed up successfully via mobile app`,
            details: { email: sponsorEmail, account_type: sponsorAccountType, referral_code: referredByCode || null }
          });
        } catch (logErr) {
          console.log("Failed to post public log:", logErr);
        }
      } else {
        await signInSponsor(sponsorEmail, password);
        try {
          await api.post("/green/public/logs", {
            source: "sponsor_app",
            event_type: "sponsor_login",
            actor: sponsorEmail,
            message: `Sponsor logged in successfully via mobile app`,
            details: { email: sponsorEmail }
          });
        } catch (logErr) {
          console.log("Failed to post public log:", logErr);
        }
      }
    } catch (err) {
      setError(getErrorMessage(err, authRoute === "field" ? "Login failed." : "Unable to continue."));
    } finally {
      setSubmitting(false);
    }
  };

  const onRequestSponsorReset = async () => {
    if (authRoute !== "sponsor" || sponsorSignup) return;
    setRequestingReset(true);
    setError("");
    try {
      const message = await requestSponsorPasswordReset(sponsorEmail);
      Alert.alert("Reset email sent", message);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to send reset email."));
    } finally {
      setRequestingReset(false);
    }
  };

  return (
    <LinearGradient colors={["#eef8ef", "#d9f0dc", "#f7fbf7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.topBar, authRoute === "sponsor" && styles.topBarSponsor]}>
              {authRoute === "field" ? (
                <Pressable onPress={openSponsorRoute} style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
                  <Ionicons name="arrow-back" size={18} color={colors.primaryDark} />
                  <Text style={styles.backText}>Sponsor access</Text>
                </Pressable>
              ) : (
                <View style={styles.publicRouteLabel}>
                  <Ionicons name="globe-outline" size={15} color="#a6813c" />
                  <Text style={styles.publicRouteLabelText}>Public sponsor route</Text>
                </View>
              )}
              <StatusChip label={routeCopy.badge} tone="online" />
            </View>

            {authRoute === "field" ? (
              <>
                <View style={styles.heroCard}>
                  <View style={styles.heroGlow} />
                  <View style={styles.heroHead}>
                    <View style={styles.brandTile}>
                      <BrandMark size={58} />
                    </View>
                    <View style={styles.heroText}>
                      <Text style={styles.heroEyebrow}>{routeCopy.eyebrow}</Text>
                      <Text style={styles.title}>{routeCopy.title}</Text>
                      <Text style={styles.subtitle}>{routeCopy.subtitle}</Text>
                    </View>
                    <View style={styles.heroOrb}>
                      <Ionicons name={routeCopy.icon} size={22} color={colors.primaryDark} />
                    </View>
                  </View>
                </View>

                <View style={styles.guidanceCard}>
                  <Text style={styles.guidanceTitle}>{routeCopy.audienceTitle}</Text>
                  <View style={styles.guidanceList}>
                    {routeCopy.audienceItems.map((item) => (
                      <View key={`audience-${item}`} style={styles.guidanceRow}>
                        <View style={styles.guidanceDot} />
                        <Text style={styles.guidanceText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.guidanceDivider} />
                  <Text style={styles.guidanceTitle}>Before you continue</Text>
                  <View style={styles.guidanceList}>
                    {routeCopy.guidanceItems.map((item) => (
                      <View key={`guide-${item}`} style={styles.guidanceRow}>
                        <Ionicons name="checkmark-circle-outline" size={16} color={colors.primaryDark} />
                        <Text style={styles.guidanceText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.brandHeader}>
                <BrandMark size={74} />
                <Text style={styles.brandHeaderTitle}>LandCheck Green</Text>
                <Text style={styles.brandHeaderSubtitle}>
                  {sponsorSignup
                    ? "Create your sponsor profile to support verified restoration."
                    : "Access your tree sponsorships and track live ecological impact."}
                </Text>
              </View>
            )}

            <View style={styles.formCard}>
              <Text style={styles.formEyebrow}>{authRoute === "field" ? "Secure partner access" : sponsorSignup ? "Sponsor onboarding" : "Sponsor account access"}</Text>
              <Text style={styles.formTitle}>{formTitle}</Text>
              <Text style={styles.formSubtitle}>{formSubtitle}</Text>

              {authRoute === "field" ? (
                <View style={styles.inputBlock}>
                  <Text style={styles.label}>Username</Text>
                  <TextInput
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Enter username"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                  />
                </View>
              ) : (
                <>
                  {sponsorSignup ? (
                    <>
                      <View style={styles.inputBlock}>
                        <Text style={styles.label}>Full name</Text>
                        <TextInput
                          value={sponsorName}
                          onChangeText={setSponsorName}
                          placeholder="Enter full name"
                          placeholderTextColor={colors.textMuted}
                          style={styles.input}
                        />
                      </View>

                      <View style={styles.inputBlock}>
                        <Text style={styles.label}>Account type</Text>
                        <View style={styles.segmentRow}>
                          <Pressable
                            onPress={() => setSponsorAccountType("individual")}
                            style={[styles.segmentButton, sponsorAccountType === "individual" && styles.segmentButtonActive]}
                          >
                            <Text style={[styles.segmentLabel, sponsorAccountType === "individual" && styles.segmentLabelActive]}>Individual</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setSponsorAccountType("organization")}
                            style={[styles.segmentButton, sponsorAccountType === "organization" && styles.segmentButtonActive]}
                          >
                            <Text style={[styles.segmentLabel, sponsorAccountType === "organization" && styles.segmentLabelActive]}>Organization</Text>
                          </Pressable>
                        </View>
                      </View>

                      {sponsorAccountType === "organization" ? (
                        <View style={styles.inputBlock}>
                          <Text style={styles.label}>Organization name</Text>
                          <TextInput
                            value={sponsorOrgName}
                            onChangeText={setSponsorOrgName}
                            placeholder="Enter organization name"
                            placeholderTextColor={colors.textMuted}
                            style={styles.input}
                          />
                        </View>
                      ) : null}
                    </>
                  ) : null}

                  <View style={styles.inputBlock}>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                      value={sponsorEmail}
                      onChangeText={setSponsorEmail}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      placeholder="Enter email address"
                      placeholderTextColor={colors.textMuted}
                      style={styles.input}
                    />
                  </View>

                  {sponsorSignup ? (
                    <>
                      <View style={styles.inputBlock}>
                        <Text style={styles.label}>Phone</Text>
                        <TextInput
                          value={sponsorPhone}
                          onChangeText={setSponsorPhone}
                          keyboardType="phone-pad"
                          placeholder="Enter phone number"
                          placeholderTextColor={colors.textMuted}
                          style={styles.input}
                        />
                      </View>

                      <View style={styles.inputBlock}>
                        <Text style={styles.label}>Referral Code (Optional)</Text>
                        <TextInput
                          value={referredByCode}
                          onChangeText={setReferredByCode}
                          autoCapitalize="characters"
                          placeholder="e.g. LC-REF-123-ABCD"
                          placeholderTextColor={colors.textMuted}
                          style={styles.input}
                        />
                      </View>
                    </>
                  ) : null}
                </>
              )}

              <View style={styles.inputBlock}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.passwordWrap}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    placeholder={authRoute === "field" ? "Enter assigned password" : "Create or enter password"}
                    placeholderTextColor={colors.textMuted}
                    style={styles.passwordInput}
                  />
                  <Pressable onPress={() => setShowPassword((prev) => !prev)} style={styles.eyeButton}>
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSoft} />
                  </Pressable>
                </View>
              </View>

              {authRoute === "sponsor" && !sponsorSignup ? (
                <View style={styles.supportRow}>
                  <Pressable
                    onPress={() => void onRequestSponsorReset()}
                    disabled={requestingReset || submitting}
                    style={({ pressed }) => [
                      styles.supportButton,
                      (pressed || requestingReset || submitting) && styles.supportButtonPressed,
                    ]}
                  >
                    <Ionicons name="mail-open-outline" size={16} color={colors.primaryDark} />
                    <Text style={styles.supportButtonText}>{requestingReset ? "Sending reset email..." : "Forgot password? Send reset email"}</Text>
                  </Pressable>
                  <Text style={styles.supportHint}>Enter your sponsor email above first.</Text>
                </View>
              ) : null}

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <PrimaryButton
                label={
                  submitting
                    ? authRoute === "field"
                      ? "Signing in..."
                      : sponsorSignup
                        ? "Creating sponsor account..."
                        : "Signing in..."
                    : authRoute === "field"
                      ? "Open Field Route"
                      : sponsorSignup
                        ? "Create Sponsor Account"
                        : "Sign In to Sponsor Route"
                }
                onPress={onSubmit}
                disabled={submitting || requestingReset}
              />

              {authRoute === "sponsor" ? (
                <View style={styles.toggleFooter}>
                  {sponsorSignup ? (
                    <Pressable onPress={() => { setSponsorSignup(false); setError(""); }} style={styles.toggleFooterLink}>
                      <Text style={styles.toggleFooterText}>
                        Already have an account? <Text style={styles.toggleFooterHighlight}>Sign in</Text>
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable onPress={() => { setSponsorSignup(true); setError(""); }} style={styles.toggleFooterLink}>
                      <Text style={styles.toggleFooterText}>
                        Don't have an account? <Text style={styles.toggleFooterHighlight}>Sign up</Text>
                      </Text>
                    </Pressable>
                  )}
                </View>
              ) : null}
            </View>

            {authRoute === "sponsor" ? (
              <View style={styles.altRouteCard}>
                <Text style={styles.altRouteEyebrow}>Partner staff only</Text>
                <Text style={styles.altRouteTitle}>Agent, NGO, or organization staff?</Text>
                <Text style={styles.altRouteBody}>
                  Use the field login issued by your organization to capture tasks, submit evidence, and work on assigned projects.
                </Text>
                <Pressable onPress={openFieldRoute} style={({ pressed }) => [styles.altRouteButton, pressed && styles.altRouteButtonPressed]}>
                  <Ionicons name="compass-outline" size={18} color={colors.primaryDark} />
                  <Text style={styles.altRouteButtonText}>Open field staff login</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.routeSwapInline}>
                <Text style={styles.routeSwapText}>Want to sponsor trees instead?</Text>
                <Pressable onPress={openSponsorRoute} style={styles.routeSwapLink}>
                  <Text style={styles.routeSwapLinkText}>Go to sponsor sign in</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  topBarSponsor: {
    justifyContent: "flex-end",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  backButtonPressed: {
    opacity: 0.9,
  },
  backText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: "800",
  },
  publicRouteLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: "#fbf7ee",
    borderWidth: 1,
    borderColor: "rgba(197,160,89,0.18)",
  },
  publicRouteLabelText: {
    color: "#a6813c",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  heroCard: {
    position: "relative",
    overflow: "hidden",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(16,91,44,0.08)",
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  heroGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(42,168,82,0.10)",
    right: -50,
    top: -65,
  },
  heroHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  brandTile: {
    width: 78,
    height: 78,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(16,91,44,0.10)",
  },
  heroText: {
    flex: 1,
    gap: 6,
  },
  heroEyebrow: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  heroOrb: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e4f6e8",
  },
  title: {
    color: colors.text,
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  guidanceCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  guidanceTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  guidanceList: {
    gap: 10,
  },
  guidanceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  guidanceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: colors.primary,
  },
  guidanceText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  guidanceDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: 4,
  },
  formCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  modeSwitch: {
    flexDirection: "row",
    gap: 10,
    padding: 6,
    borderRadius: radii.lg,
    backgroundColor: colors.panelElevated,
  },
  modeButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  modeButtonActive: {
    backgroundColor: colors.primaryDark,
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  modeButtonText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "900",
  },
  modeButtonTextActive: {
    color: colors.inverseText,
  },
  formEyebrow: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  formTitle: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
    letterSpacing: -0.45,
  },
  formSubtitle: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 4,
  },
  inputBlock: {
    gap: 6,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  input: {
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 15,
  },
  passwordWrap: {
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
  },
  passwordInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
  },
  eyeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  supportRow: {
    gap: 8,
    marginTop: -2,
  },
  supportButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: "rgba(16,91,44,0.10)",
  },
  supportButtonPressed: {
    opacity: 0.72,
  },
  supportButtonText: {
    color: colors.primaryDark,
    fontSize: 12.5,
    fontWeight: "800",
  },
  supportHint: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 10,
  },
  segmentButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentButtonActive: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  segmentLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  segmentLabelActive: {
    color: colors.inverseText,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  brandHeader: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    gap: spacing.xs,
  },
  brandHeaderTitle: {
    color: colors.primaryDark,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginTop: spacing.xs,
  },
  brandHeaderSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    paddingHorizontal: spacing.md,
  },
  toggleFooter: {
    alignItems: "center",
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  toggleFooterLink: {
    padding: spacing.xs,
  },
  toggleFooterText: {
    color: colors.textSoft,
    fontSize: 14,
  },
  toggleFooterHighlight: {
    color: colors.primary,
    fontWeight: "700",
  },
  altRouteCard: {
    gap: 10,
    padding: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(22,103,58,0.12)",
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  altRouteEyebrow: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  altRouteTitle: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
  },
  altRouteBody: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  altRouteButton: {
    minHeight: 50,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: "rgba(22,103,58,0.18)",
    backgroundColor: "#f4faf6",
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  altRouteButtonPressed: {
    opacity: 0.9,
  },
  altRouteButtonText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: "900",
  },
  routeSwapInline: {
    alignItems: "center",
    gap: 6,
    paddingVertical: spacing.xs,
  },
  routeSwapText: {
    color: colors.textSoft,
    fontSize: 13,
  },
  routeSwapLink: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  routeSwapLinkText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: "900",
  },
});
