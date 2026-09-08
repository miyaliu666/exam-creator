import { createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";

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

export const queryClient = new QueryClient();

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
]);

export const router = createRouter({ routeTree, context: { queryClient } });
