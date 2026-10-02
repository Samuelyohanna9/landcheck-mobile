export type AuthRoute = "field" | "sponsor";

export type RootStackParamList = {
  AuthRouteSelect: undefined;
  Login: { authRoute?: AuthRoute } | undefined;
  SponsorClaimAccount: { sponsorId: number; email: string };
  PrivacyConsent: undefined;
  Intro: undefined;
  GreenApp: undefined;
  SponsorApp: undefined;
};

export type GreenAppStackParamList = {
  GreenTabs: undefined;
  GreenTasks: { mode?: "maintenance" | "review" } | undefined;
  GreenTaskDetail: { taskId: number; mode: "maintenance" | "review" };
  GreenField: undefined;
  GreenRecords: undefined;
  TreeDetail: { treeId: number; projectId: number };
  ChangePassword: undefined;
  DonorReport: undefined;
};

export type GreenTabParamList = {
  GreenHome: undefined;
  GreenQuickCapture: undefined;
  GreenAgentPayouts: undefined;
  GreenProfile: undefined;
};

export type SponsorAppStackParamList = {
  SponsorTabs: undefined;
  SponsorCheckout: { projectId: number };
  SponsorTreeDetail: { unitId: number };
  GameGrowTree: undefined;
  GameSaveForest: undefined;
  GameForestBuilder: undefined;
  GameWildlife: undefined;
  GameClimateDefender: undefined;
  GameFruitHarvest: undefined;
  GameDailySpin: undefined;
  GameForestQuest: undefined;
  GameSchoolGreening: undefined;
};

export type SponsorTabParamList = {
  SponsorProjects: undefined;
  SponsorTrees: undefined;
  SponsorLeaderboard: undefined;
  SponsorGrove: undefined;
  SponsorProfile: undefined;
};
