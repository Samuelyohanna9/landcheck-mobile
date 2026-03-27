export type RootStackParamList = {
  Login: undefined;
  PrivacyConsent: undefined;
  Intro: undefined;
  GreenApp: undefined;
};

export type GreenAppStackParamList = {
  GreenTabs: undefined;
  GreenTasks: undefined;
  GreenField: undefined;
  GreenRecords: undefined;
  TreeDetail: { treeId: number; projectId: number };
  ChangePassword: undefined;
  DonorReport: undefined;
};

export type GreenTabParamList = {
  GreenHome: undefined;
  GreenQuickCapture: undefined;
  GreenProfile: undefined;
};
