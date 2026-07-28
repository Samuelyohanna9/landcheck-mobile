import type { ProjectSummary, WorkflowProfile } from "../types/domain";

export const getProjectWorkflowProfile = (project?: Pick<ProjectSummary, "workflow_profile"> | null): WorkflowProfile =>
  project?.workflow_profile === "agric"
    ? "agric"
    : project?.workflow_profile === "relief_recovery"
      ? "relief_recovery"
      : project?.workflow_profile === "csr"
        ? "csr"
        : "green";

export const isAgricProject = (project?: Pick<ProjectSummary, "workflow_profile"> | null) =>
  getProjectWorkflowProfile(project) === "agric";

export const isReliefRecoveryProject = (project?: Pick<ProjectSummary, "workflow_profile"> | null) =>
  getProjectWorkflowProfile(project) === "relief_recovery";

export const isCsrProject = (project?: Pick<ProjectSummary, "workflow_profile"> | null) =>
  getProjectWorkflowProfile(project) === "csr";

export const getWorkflowLabels = (project?: Pick<ProjectSummary, "workflow_profile"> | null) => {
  if (isAgricProject(project)) {
    return {
      appTitle: "LandCheck Agric",
      dashboardSubtitle: "Extension field dashboard",
      entitySingular: "Plot",
      entityPlural: "Plots",
      recordSingular: "Farm",
      recordPlural: "Farms",
      actionTitle: "Map & Add Plots",
      recordsTitle: "Plot Records",
      totalLabel: "Total Plots",
      healthyLabel: "Good",
      healthyHelper: "Healthy + active",
      attentionLabel: "Needs Support",
      attentionHelper: "Attention + damaged",
      deadLabel: "Inactive",
      deadHelper: "Removed + inactive",
      ownerLabel: "Farmer",
      cropLabel: "Primary Crop",
      cropDistributionTitle: "Crop Distribution",
      addActionLabel: "Add Plot",
      activityTitle: "Field Visits",
      activityTitleSingular: "Field Visit",
      noRecordsTitle: "No plot records yet",
      noRecordsSubtitle: "Save a farm plot record first and it will appear here.",
      latestRecordsTitle: "My latest plot records",
      latestRecordsSubtitle: "Recent plot records saved by this field user remain visible offline.",
      mapTitle: "Project plot map",
      projectCardMetricLabel: "My plots",
      impactMessage: "Your mapped farms and field visits are building trusted programme evidence for every farmer you support.",
    };
  }
  if (isReliefRecoveryProject(project)) {
    return {
      appTitle: "LandCheck Relief",
      dashboardSubtitle: "Relief field dashboard",
      entitySingular: "Site",
      entityPlural: "Sites",
      recordSingular: "Site",
      recordPlural: "Sites",
      actionTitle: "Map & Assess Sites",
      recordsTitle: "Site Records",
      totalLabel: "Total Sites",
      healthyLabel: "Stable",
      healthyHelper: "Stable + completed",
      attentionLabel: "Needs Action",
      attentionHelper: "Repair + urgent follow-up",
      deadLabel: "Closed",
      deadHelper: "Closed + inactive",
      ownerLabel: "Beneficiary",
      cropLabel: "Asset Type",
      cropDistributionTitle: "Asset Distribution",
      addActionLabel: "Add Site",
      activityTitle: "Relief Visits",
      activityTitleSingular: "Relief Visit",
      noRecordsTitle: "No site records yet",
      noRecordsSubtitle: "Save an assessed site record first and it will appear here.",
      latestRecordsTitle: "My latest site records",
      latestRecordsSubtitle: "Recent relief site records saved by this field user remain visible offline.",
      mapTitle: "Project site map",
      projectCardMetricLabel: "My sites",
      impactMessage: "Your mapped sites and relief visits are building trusted recovery evidence for every response area.",
    };
  }
  if (isCsrProject(project)) {
    return {
      appTitle: "LandCheck CSR",
      dashboardSubtitle: "CSR field dashboard",
      entitySingular: "Tree",
      entityPlural: "Trees",
      recordSingular: "Implementation Tree",
      recordPlural: "Implementation Trees",
      actionTitle: "Map & Plant Trees",
      recordsTitle: "Implementation Trees",
      totalLabel: "Total Trees",
      healthyLabel: "Healthy",
      healthyHelper: "Healthy + alive",
      attentionLabel: "Attention",
      attentionHelper: "Needs follow-up",
      deadLabel: "Dead",
      deadHelper: "Dead + removed",
      ownerLabel: "Community Partner",
      cropLabel: "Species",
      cropDistributionTitle: "Species Distribution",
      addActionLabel: "Add Tree",
      activityTitle: "Field Visits",
      activityTitleSingular: "Field Visit",
      noRecordsTitle: "No implementation records yet",
      noRecordsSubtitle: "Save a planted tree record first and it will appear here.",
      latestRecordsTitle: "My latest implementation records",
      latestRecordsSubtitle: "Recent CSR field records saved by this user remain visible offline.",
      mapTitle: "Project implementation map",
      projectCardMetricLabel: "My trees",
      impactMessage: "Your tree records, field photos, and care updates are building verified CSR implementation evidence for the programme.",
    };
  }
  return {
    appTitle: "LandCheck Green",
    dashboardSubtitle: "Field dashboard",
    entitySingular: "Tree",
    entityPlural: "Trees",
    recordSingular: "Tree",
    recordPlural: "Trees",
    actionTitle: "Map & Add Trees",
    recordsTitle: "Tree Records",
    totalLabel: "Total Trees",
    healthyLabel: "Healthy",
    healthyHelper: "Healthy + alive",
    attentionLabel: "Attention",
    attentionHelper: "Attention + damaged",
    deadLabel: "Dead",
    deadHelper: "Dead + removed",
    ownerLabel: "Custodian",
    cropLabel: "Species",
    cropDistributionTitle: "Species Distribution",
    addActionLabel: "Add Tree",
    activityTitle: "Maintenance",
    activityTitleSingular: "Maintenance",
    noRecordsTitle: "No tree records yet",
    noRecordsSubtitle: "Save a planting or existing-tree record first and it will appear here.",
    latestRecordsTitle: "My latest tree records",
    latestRecordsSubtitle: "Recent tree records saved by this Green mobile user remain visible offline.",
    mapTitle: "Project tree map",
    projectCardMetricLabel: "My trees",
    impactMessage: "Your tree records, field photos, and care updates are building a verified climate story.",
  };
};
