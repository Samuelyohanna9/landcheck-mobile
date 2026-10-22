import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { Image } from "expo-image";
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { requestFieldPasswordReset, requestSponsorPasswordReset } from "../../api/auth";
import { api, getErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type { AuthRoute, RootStackParamList } from "../../types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

const LANDCHECK_WORDMARK = require("../../../assets/landcheck-wordmark.png");

export const LoginScreen = ({ navigation, route }: Props) => {
  const { signIn, signInSponsor, signUpSponsor } = useAuth();
  const [authRoute, setAuthRoute] = useState<AuthRoute>(route.params?.authRoute ?? "field");
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
  const [fieldResetOpen, setFieldResetOpen] = useState(false);
  const [fieldResetEmail, setFieldResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [error, setError] = useState("");
  const [referredByCode, setReferredByCode] = useState("");

  const switchRoute = (nextRoute: AuthRoute) => {
    setError("");
    setShowPassword(false);
    setPassword("");
    setSponsorSignup(false);
    setFieldResetOpen(false);
    setResetMessage("");
    setAuthRoute(nextRoute);
  };

  useEffect(() => {
    const handleDeepLink = (url: string) => {
      try {
        const query = url.split("?")[1];
        if (!query) return;
        const parsed: Record<string, string> = {};
        for (const part of query.split("&")) {
          const [key, value] = part.split("=");
          if (key && value) parsed[key] = decodeURIComponent(value);
        }
        if (parsed.sponsor_id && parsed.email) {
          navigation.navigate("SponsorClaimAccount", {
            sponsorId: Number(parsed.sponsor_id),
            email: parsed.email,
          });
          return;
        }
        if (parsed.ref) {
          setAuthRoute("sponsor");
          setReferredByCode(parsed.ref);
          setSponsorSignup(true);
          setError("");
        }
      } catch (err) {
        console.error("Failed to parse deep link: ", err);
      }
    };

    void Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });
    const subscription = Linking.addEventListener("url", ({ url }) => handleDeepLink(url));
    return () => subscription.remove();
  }, [navigation]);

  const formTitle = useMemo(() => {
    if (authRoute === "field") return "Field work login";
    return sponsorSignup ? "Create sponsor account" : "Sponsor sign in";
  }, [authRoute, sponsorSignup]);

  const formSubtitle = useMemo(() => {
    if (authRoute === "field") {
      return "Use the username and password already assigned in LandCheck Work.";
    }
    return sponsorSignup
      ? "Create your sponsor profile first, then choose any public project and pay online."
      : "Sign in to track sponsored trees, verified field evidence, and live impact.";
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
            details: { email: sponsorEmail, account_type: sponsorAccountType, referral_code: referredByCode || null },
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
            message: "Sponsor logged in successfully via mobile app",
            details: { email: sponsorEmail },
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
    setResetMessage("");
    try {
      const message = await requestSponsorPasswordReset(sponsorEmail);
      Alert.alert("Reset email sent", message);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to send reset email."));
    } finally {
      setRequestingReset(false);
    }
  };

  const onRequestFieldReset = async () => {
    setRequestingReset(true);
    setError("");
    setResetMessage("");
    try {
      const message = await requestFieldPasswordReset(fieldResetEmail);
      setResetMessage(message);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to send reset email."));
    } finally {
      setRequestingReset(false);
    }
  };

  const isFieldRoute = authRoute === "field";

  return (
    <View style={styles.page}>
      <View style={styles.topAccent} />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.brandHeader}>
              <Image source={LANDCHECK_WORDMARK} contentFit="contain" style={styles.wordmark} accessibilityLabel="LandCheck" />
            </View>
            <View style={styles.brandDivider} />

            <View style={styles.loginCard}>
              <View style={styles.routeSwitcher} accessibilityRole="tablist">
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: !isFieldRoute }}
                  onPress={() => switchRoute("sponsor")}
                  style={({ pressed }) => [styles.routeOption, !isFieldRoute && styles.routeOptionActive, pressed && styles.pressed]}
                >
                  <View style={[styles.routeIcon, !isFieldRoute && styles.routeIconActive]}>
                    <Ionicons name="leaf-outline" size={15} color={!isFieldRoute ? "#ffffff" : "#1a8f5a"} />
                  </View>
                  <View style={styles.routeCopy}>
                    <Text style={[styles.routeTitle, !isFieldRoute && styles.routeTitleActive]}>Sponsor Portal</Text>
                    <Text style={[styles.routeBadge, !isFieldRoute && styles.routeBadgeActive]}>PUBLIC</Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isFieldRoute }}
                  onPress={() => switchRoute("field")}
                  style={({ pressed }) => [styles.routeOption, isFieldRoute && styles.routeOptionActive, pressed && styles.pressed]}
                >
                  <View style={[styles.routeIcon, isFieldRoute && styles.routeIconActive]}>
                    <Ionicons name="compass-outline" size={15} color={isFieldRoute ? "#ffffff" : "#1a8f5a"} />
                  </View>
                  <View style={styles.routeCopy}>
                    <Text style={[styles.routeTitle, isFieldRoute && styles.routeTitleActive]}>Field Agent Access</Text>
                    <Text style={[styles.routeBadge, isFieldRoute && styles.routeBadgeActive]}>PARTNER</Text>
                  </View>
                </Pressable>
              </View>

              <View style={styles.cardDivider} />

              <View style={styles.form}>
                <Text style={styles.eyebrow}>{isFieldRoute ? "FIELD AGENT ACCESS" : "SPONSOR PORTAL"}</Text>
                <Text style={styles.formTitle}>{formTitle}</Text>
                <Text style={styles.formSubtitle}>{formSubtitle}</Text>

                {isFieldRoute ? (
                  <InputField
                    label="USERNAME"
                    value={username}
                    onChangeText={setUsername}
                    placeholder="Enter username"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                ) : sponsorSignup ? (
                  <>
                    <InputField label="FULL NAME" value={sponsorName} onChangeText={setSponsorName} placeholder="Enter full name" />
                    <View style={styles.inputBlock}>
                      <Text style={styles.label}>ACCOUNT TYPE</Text>
                      <View style={styles.accountTypeRow}>
                        {(["individual", "organization"] as const).map((type) => (
                          <Pressable
                            key={type}
                            onPress={() => setSponsorAccountType(type)}
                            style={[styles.accountTypeButton, sponsorAccountType === type && styles.accountTypeButtonActive]}
                          >
                            <Text style={[styles.accountTypeText, sponsorAccountType === type && styles.accountTypeTextActive]}>
                              {type === "individual" ? "Individual" : "Organization"}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                    {sponsorAccountType === "organization" ? (
                      <InputField
                        label="ORGANIZATION NAME"
                        value={sponsorOrgName}
                        onChangeText={setSponsorOrgName}
                        placeholder="Enter organization name"
                      />
                    ) : null}
                    <InputField
                      label="EMAIL"
                      value={sponsorEmail}
                      onChangeText={setSponsorEmail}
                      placeholder="Enter email address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                    />
                    <InputField
                      label="PHONE"
                      value={sponsorPhone}
                      onChangeText={setSponsorPhone}
                      placeholder="Enter phone number"
                      keyboardType="phone-pad"
                    />
                    <InputField
                      label="REFERRAL CODE (OPTIONAL)"
                      value={referredByCode}
                      onChangeText={setReferredByCode}
                      placeholder="e.g. LC-REF-123-ABCD"
                      autoCapitalize="characters"
                    />
                  </>
                ) : (
                  <InputField
                    label="EMAIL"
                    value={sponsorEmail}
                    onChangeText={setSponsorEmail}
                    placeholder="Enter email address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                  />
                )}

                <View style={styles.inputBlock}>
                  <Text style={styles.label}>PASSWORD</Text>
                  <View style={styles.passwordWrap}>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      placeholder={isFieldRoute ? "Enter assigned password" : sponsorSignup ? "Create password" : "Enter password"}
                      placeholderTextColor="#8192a4"
                      style={styles.passwordInput}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                      onPress={() => setShowPassword((current) => !current)}
                      style={styles.eyeButton}
                    >
                      <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={19} color="#607b91" />
                    </Pressable>
                  </View>
                </View>

                {isFieldRoute ? (
                  <View style={styles.supportRow}>
                    <Pressable
                      onPress={() => {
                        setFieldResetOpen((current) => !current);
                        setError("");
                        setResetMessage("");
                      }}
                      disabled={submitting || requestingReset}
                    >
                      <Text style={styles.supportLink}>{fieldResetOpen ? "Close reset form" : "Forgot password?"}</Text>
                    </Pressable>
                    <Text style={styles.supportHint}>Use the email linked to your LandCheck Work account.</Text>
                    {fieldResetOpen ? (
                      <View style={styles.resetPanel}>
                        <InputField
                          label="EMAIL FOR RESET"
                          value={fieldResetEmail}
                          onChangeText={setFieldResetEmail}
                          placeholder="Enter your work email"
                          autoCapitalize="none"
                          autoCorrect={false}
                          keyboardType="email-address"
                        />
                        <Pressable
                          onPress={() => void onRequestFieldReset()}
                          disabled={requestingReset || submitting}
                          style={({ pressed }) => [styles.resetButton, pressed && styles.submitPressed]}
                        >
                          <Text style={styles.resetButtonText}>{requestingReset ? "SENDING..." : "SEND RESET LINK"}</Text>
                        </Pressable>
                        {resetMessage ? <Text style={styles.resetMessage}>{resetMessage}</Text> : null}
                      </View>
                    ) : null}
                  </View>
                ) : authRoute === "sponsor" && !sponsorSignup ? (
                  <View style={styles.supportRow}>
                    <Pressable onPress={() => void onRequestSponsorReset()} disabled={requestingReset || submitting}>
                      <Text style={styles.supportLink}>{requestingReset ? "Sending reset email..." : "Forgot password?"}</Text>
                    </Pressable>
                    <Text style={styles.supportHint}>Enter your email above first.</Text>
                  </View>
                ) : null}

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                  onPress={() => void onSubmit()}
                  disabled={submitting || requestingReset}
                  style={({ pressed }) => [styles.submit, (pressed || submitting || requestingReset) && styles.submitPressed]}
                >
                  <Text style={styles.submitText}>
                    {submitting ? (sponsorSignup ? "CREATING ACCOUNT..." : "SIGNING IN...") : sponsorSignup ? "CREATE ACCOUNT" : "LOGIN"}
                  </Text>
                </Pressable>

                {authRoute === "sponsor" ? (
                  <Pressable onPress={() => { setSponsorSignup((current) => !current); setError(""); }} style={styles.signupLinkWrap}>
                    <Text style={styles.signupText}>
                      {sponsorSignup ? "Already have an account? " : "Don't have an account? "}
                      <Text style={styles.signupHighlight}>{sponsorSignup ? "Sign in" : "Create sponsor account"}</Text>
                    </Text>
                  </Pressable>
                ) : null}

                <Text style={styles.privacyText}>
                  By continuing, you agree to handle project, GPS, photo, and field records only when authorized. <Text style={styles.privacyLink}>Privacy policy</Text>
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

type InputFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad";
};

const InputField = ({ label, value, onChangeText, placeholder, autoCapitalize, autoCorrect, keyboardType = "default" }: InputFieldProps) => (
  <View style={styles.inputBlock}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      keyboardType={keyboardType}
      placeholder={placeholder}
      placeholderTextColor="#8192a4"
      style={styles.input}
    />
  </View>
);

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#f6f7fb",
  },
  topAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 2,
    backgroundColor: "#0b686b",
  },
  safe: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 24,
  },
  brandHeader: {
    alignItems: "center",
    justifyContent: "center",
    height: 58,
  },
  wordmark: {
    width: 182,
    height: 58,
  },
  brandDivider: {
    height: 1,
    marginHorizontal: 0,
    backgroundColor: "#e1e5eb",
  },
  loginCard: {
    marginTop: 195,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e0e5eb",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    shadowColor: "#26384a",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  routeSwitcher: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderWidth: 1,
    borderColor: "#e6e9ef",
    borderRadius: 8,
    backgroundColor: "#f6f7fb",
  },
  routeOption: {
    flex: 1,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  routeOptionActive: {
    backgroundColor: "#1a8f5a",
  },
  routeIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: "#e3f4eb",
  },
  routeIconActive: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  routeCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  routeTitle: {
    color: "#526b82",
    fontSize: 11,
    fontWeight: "600",
  },
  routeTitleActive: {
    color: "#ffffff",
  },
  routeBadge: {
    color: "#7b95aa",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1,
  },
  routeBadgeActive: {
    color: "#d8f2e4",
  },
  cardDivider: {
    height: 1,
    marginVertical: 16,
    backgroundColor: "#edf0f3",
  },
  form: {
    gap: 8,
  },
  eyebrow: {
    color: "#0f6e44",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  formTitle: {
    marginTop: 1,
    color: "#323338",
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "500",
    letterSpacing: -0.35,
  },
  formSubtitle: {
    marginBottom: 8,
    color: "#526b82",
    fontSize: 13,
    lineHeight: 19,
  },
  inputBlock: {
    gap: 5,
  },
  label: {
    color: "#173f5f",
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.35,
  },
  input: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#c3c6d4",
    borderRadius: 4,
    backgroundColor: "#ffffff",
    color: "#173f5f",
    fontSize: 14,
  },
  passwordWrap: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#c3c6d4",
    borderRadius: 4,
    backgroundColor: "#ffffff",
  },
  passwordInput: {
    flex: 1,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 7,
    color: "#173f5f",
    fontSize: 14,
  },
  eyeButton: {
    width: 34,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
    borderRadius: 4,
    backgroundColor: "#eef3f7",
  },
  accountTypeRow: {
    flexDirection: "row",
    gap: 6,
  },
  accountTypeButton: {
    flex: 1,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d0d4e4",
    borderRadius: 4,
  },
  accountTypeButtonActive: {
    borderColor: "#1a8f5a",
    backgroundColor: "#edf6f1",
  },
  accountTypeText: {
    color: "#526b82",
    fontSize: 12,
    fontWeight: "500",
  },
  accountTypeTextActive: {
    color: "#0f6e44",
    fontWeight: "600",
  },
  supportRow: {
    gap: 2,
    marginTop: -1,
  },
  supportLink: {
    color: "#0f6e44",
    fontSize: 12,
    fontWeight: "600",
  },
  supportHint: {
    color: "#7b95aa",
    fontSize: 10,
  },
  resetPanel: {
    gap: 7,
    marginTop: 4,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e6e9ef",
    borderRadius: 4,
    backgroundColor: "#f8fafc",
  },
  resetButton: {
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1a8f5a",
    borderRadius: 4,
    backgroundColor: "#edf6f1",
  },
  resetButtonText: {
    color: "#0f6e44",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.25,
  },
  resetMessage: {
    color: "#1a6e37",
    fontSize: 11,
    lineHeight: 16,
  },
  error: {
    padding: 9,
    borderLeftWidth: 3,
    borderLeftColor: "#b3261e",
    borderRadius: 4,
    backgroundColor: "#fbeaea",
    color: "#8d211c",
    fontSize: 12,
    lineHeight: 17,
  },
  submit: {
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    borderWidth: 1,
    borderColor: "#1a8f5a",
    borderRadius: 4,
    backgroundColor: "#1a8f5a",
  },
  submitPressed: {
    opacity: 0.72,
  },
  submitText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.25,
  },
  signupLinkWrap: {
    alignItems: "center",
    paddingTop: 2,
  },
  signupText: {
    color: "#526b82",
    fontSize: 11,
  },
  signupHighlight: {
    color: "#0f6e44",
    fontWeight: "600",
  },
  privacyText: {
    marginTop: 3,
    color: "#7b95aa",
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center",
  },
  privacyLink: {
    color: "#0f6e44",
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.82,
  },
});
