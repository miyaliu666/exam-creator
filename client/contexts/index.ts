import { createRouter } from "@tanstack/react-router";

import { queryClient } from "./query-client";
import { appBasePath } from "../utils/deployment";
import { captureBrowserLoginCallback } from "../utils/browser-session";

import { authCallbackGithubRoute } from "../pages/auth-callback-github";
import { attemptsRoute } from "../pages/attempts";
import { editAttemptRoute } from "../pages/edit-attempt";
import { editExamRoute } from "../pages/edit-exam";
import { examsRoute } from "../pages/exams";
import { landingRoute } from "../pages/landing";
import { loginRoute } from "../pages/login";
import { rootRoute } from "../pages/root";
import { metricsRoute } from "../pages/metrics";
import { usersRoute } from "../pages/users";
import { userDeduplicateRoute } from "../pages/user-deduplicate";
import { viewMetricsRoute } from "../pages/view-metrics";
import { languageItemsRoute } from "../pages/language-items";
import { languageAssessmentSettingsRoute } from "../pages/language-assessment-settings";
import { editLanguageItemRoute } from "../pages/edit-language-item";
import { newLanguageItemsRoute } from "../pages/new-language-items";
import { languageItemBatchesRoute } from "../pages/language-item-batches";
import { languageItemCoverageRoute } from "../pages/language-item-coverage";

export const routeTree = rootRoute.addChildren([
  authCallbackGithubRoute,
  attemptsRoute,
  editAttemptRoute,
  editExamRoute,
  metricsRoute,
  examsRoute,
  landingRoute,
  loginRoute,
  usersRoute,
  userDeduplicateRoute,
  viewMetricsRoute,
  languageItemsRoute,
  languageAssessmentSettingsRoute,
  editLanguageItemRoute,
  newLanguageItemsRoute,
  languageItemBatchesRoute,
  languageItemCoverageRoute,
]);

captureBrowserLoginCallback();
export const router = createRouter({ routeTree, context: { queryClient }, basepath: appBasePath });
