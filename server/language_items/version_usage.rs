use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UsageState {
    #[default]
    Unreleased,
    Pilot,
    Live,
    Suspended,
    Retired,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TimingBasis {
    Elapsed,
    Active,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PilotDecision {
    Retain,
    Revise,
    Retest,
    Release,
    Retire,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PilotSummary {
    pub source: String,
    pub sample_ref: String,
    pub cohort: String,
    pub sample_size: u64,
    pub correct_count: Option<u64>,
    pub omitted_count: Option<u64>,
    pub discrimination: Option<f64>,
    pub median_response_time_seconds: Option<f64>,
    pub timing_basis: TimingBasis,
    pub decision: PilotDecision,
    pub notes: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum UsageChange {
    State { state: UsageState, reason: String },
    Pilot { summary: PilotSummary },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveUsageEvent {
    pub request_id: String,
    pub expected_revision: u64,
    pub change: UsageChange,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageEvent {
    pub id: String,
    pub item_id: String,
    pub version_id: String,
    pub content_hash: String,
    pub registry_version: String,
    pub revision: u64,
    pub request_id: String,
    pub actor_email: String,
    pub created_at: String,
    pub state: UsageState,
    pub change: UsageChange,
}

pub fn request_matches(event: &UsageEvent, request: &SaveUsageEvent, actor: &str) -> bool {
    event.request_id == request.request_id
        && event.actor_email == actor
        && request.expected_revision.checked_add(1) == Some(event.revision)
        && event.change == request.change
}

fn required_text(value: &str, label: &str, max: usize) -> Result<(), String> {
    if value.trim().is_empty() || value.len() > max {
        Err(format!(
            "{label} is required and must be at most {max} bytes."
        ))
    } else {
        Ok(())
    }
}

pub fn validate_pilot(summary: &PilotSummary) -> Result<(), String> {
    required_text(&summary.source, "Result source", 500)?;
    required_text(&summary.sample_ref, "Sample reference", 500)?;
    required_text(&summary.cohort, "Cohort", 2000)?;
    required_text(&summary.notes, "Decision notes", 10000)?;
    if summary.sample_size == 0 || summary.sample_size > 10_000_000 {
        return Err("Sample size must be between 1 and 10000000.".into());
    }
    if summary
        .correct_count
        .is_some_and(|n| n > summary.sample_size)
        || summary
            .omitted_count
            .is_some_and(|n| n > summary.sample_size)
        || summary
            .correct_count
            .zip(summary.omitted_count)
            .is_some_and(|(correct, omitted)| {
                correct
                    .checked_add(omitted)
                    .is_none_or(|total| total > summary.sample_size)
            })
    {
        return Err("Correct and omitted counts must fit within the sample size.".into());
    }
    if summary
        .discrimination
        .is_some_and(|n| !n.is_finite() || !(-1.0..=1.0).contains(&n))
    {
        return Err("Discrimination correlation must be between -1 and 1.".into());
    }
    match summary.median_response_time_seconds {
        Some(n) if !n.is_finite() || n < 0.0 => {
            return Err(
                "Median response time must be a finite, nonnegative number of seconds.".into(),
            );
        }
        Some(_) if summary.timing_basis == TimingBasis::Unknown => {
            return Err("Choose elapsed or active timing when recording response time.".into());
        }
        None if summary.timing_basis != TimingBasis::Unknown => {
            return Err("Use unknown timing when response time is unavailable.".into());
        }
        _ => {}
    }
    Ok(())
}

pub fn transition_allowed(from: UsageState, to: UsageState) -> bool {
    use UsageState::*;
    matches!(
        (from, to),
        (Unreleased, Pilot | Suspended | Retired)
            | (Pilot, Live | Suspended | Retired)
            | (Live, Suspended | Retired)
            | (Suspended, Pilot | Live | Retired)
    )
}

pub fn validate_change(
    request: &SaveUsageEvent,
    state: UsageState,
    last_suspension_revision: u64,
    latest_pilot: Option<&UsageEvent>,
) -> Result<UsageState, String> {
    required_text(&request.request_id, "Request ID", 128)?;
    if request.expected_revision >= i64::MAX as u64 {
        return Err("The usage revision cannot be incremented.".into());
    }
    if state == UsageState::Retired {
        return Err("Retired versions retain their history and cannot be changed.".into());
    }
    match &request.change {
        UsageChange::Pilot { summary } => {
            validate_pilot(summary)?;
            Ok(state)
        }
        UsageChange::State {
            state: next,
            reason,
        } => {
            required_text(reason, "Status change reason", 4000)?;
            if !transition_allowed(state, *next) {
                return Err("This use status transition is not allowed.".into());
            }
            if *next == UsageState::Live {
                let has_release = latest_pilot.is_some_and(|event| {
                    matches!(&event.change, UsageChange::Pilot { summary } if summary.decision == PilotDecision::Release)
                        && event.revision > last_suspension_revision
                });
                if !has_release {
                    return Err("Record a pilot summary with a Release decision before marking this version live. After suspension, a new release decision is required.".into());
                }
            }
            Ok(*next)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pilot() -> PilotSummary {
        PilotSummary {
            source: "Manual report".into(),
            sample_ref: "September cohort".into(),
            cohort: "A1 learners".into(),
            sample_size: 30,
            correct_count: Some(20),
            omitted_count: Some(2),
            discrimination: Some(0.3),
            median_response_time_seconds: Some(40.0),
            timing_basis: TimingBasis::Active,
            decision: PilotDecision::Release,
            notes: "Ready for use in the intended cohort.".into(),
        }
    }

    fn event(summary: PilotSummary) -> UsageEvent {
        UsageEvent {
            id: "event".into(),
            item_id: "item".into(),
            version_id: "v1".into(),
            content_hash: "hash".into(),
            registry_version: "registry1".into(),
            revision: 2,
            request_id: "request".into(),
            actor_email: "owner".into(),
            created_at: "now".into(),
            state: UsageState::Pilot,
            change: UsageChange::Pilot { summary },
        }
    }

    fn live_request() -> SaveUsageEvent {
        SaveUsageEvent {
            request_id: "release".into(),
            expected_revision: 2,
            change: UsageChange::State {
                state: UsageState::Live,
                reason: "Release approved.".into(),
            },
        }
    }

    #[test]
    fn approval_is_not_automatic_release_and_retirement_is_terminal() {
        for state in [
            UsageState::Unreleased,
            UsageState::Pilot,
            UsageState::Live,
            UsageState::Suspended,
            UsageState::Retired,
        ] {
            assert!(!transition_allowed(state, state));
            assert!(!transition_allowed(UsageState::Retired, state));
        }
        assert!(!transition_allowed(
            UsageState::Unreleased,
            UsageState::Live
        ));
        assert!(transition_allowed(UsageState::Live, UsageState::Suspended));
        assert!(transition_allowed(UsageState::Suspended, UsageState::Pilot));
    }

    #[test]
    fn live_requires_latest_explicit_release_and_fresh_decision_after_suspension() {
        let release = event(pilot());
        assert!(validate_change(&live_request(), UsageState::Pilot, 1, None).is_err());
        assert!(validate_change(&live_request(), UsageState::Pilot, 1, Some(&release)).is_ok());
        assert!(
            validate_change(&live_request(), UsageState::Suspended, 3, Some(&release)).is_err()
        );
        assert!(validate_change(&live_request(), UsageState::Pilot, 3, Some(&release)).is_err());
        let mut fresh_release = release.clone();
        fresh_release.revision = 4;
        assert!(
            validate_change(
                &live_request(),
                UsageState::Suspended,
                3,
                Some(&fresh_release)
            )
            .is_ok()
        );
        let mut revise = pilot();
        revise.decision = PilotDecision::Revise;
        assert!(
            validate_change(&live_request(), UsageState::Pilot, 1, Some(&event(revise))).is_err()
        );
    }

    #[test]
    fn pilot_preserves_use_status_and_unknown_metrics() {
        let mut summary = pilot();
        summary.correct_count = None;
        summary.omitted_count = None;
        summary.discrimination = None;
        summary.median_response_time_seconds = None;
        summary.timing_basis = TimingBasis::Unknown;
        let request = SaveUsageEvent {
            request_id: "manual".into(),
            expected_revision: 0,
            change: UsageChange::Pilot { summary },
        };
        assert_eq!(
            validate_change(&request, UsageState::Unreleased, 0, None),
            Ok(UsageState::Unreleased)
        );
        assert!(validate_change(&request, UsageState::Retired, 0, None).is_err());
    }

    #[test]
    fn rejects_impossible_counts_and_ambiguous_timing() {
        let mut summary = pilot();
        summary.omitted_count = Some(11);
        assert!(validate_pilot(&summary).is_err());
        summary.omitted_count = Some(0);
        summary.timing_basis = TimingBasis::Unknown;
        assert!(validate_pilot(&summary).is_err());
        summary.timing_basis = TimingBasis::Active;
        summary.discrimination = Some(f64::NAN);
        assert!(validate_pilot(&summary).is_err());
        summary.discrimination = Some(-1.0);
        summary.median_response_time_seconds = Some(-0.1);
        assert!(validate_pilot(&summary).is_err());
        summary.median_response_time_seconds = Some(0.0);
        assert!(validate_pilot(&summary).is_ok());
        summary.sample_size = 0;
        assert!(validate_pilot(&summary).is_err());
    }

    #[test]
    fn idempotent_retry_requires_original_actor_payload_and_revision() {
        let recorded = event(pilot());
        let mut retry = SaveUsageEvent {
            request_id: "request".into(),
            expected_revision: 1,
            change: recorded.change.clone(),
        };
        assert!(request_matches(&recorded, &retry, "owner"));
        assert!(!request_matches(&recorded, &retry, "another"));
        retry.expected_revision = 2;
        assert!(!request_matches(&recorded, &retry, "owner"));
        retry.expected_revision = 1;
        retry.change = live_request().change;
        assert!(!request_matches(&recorded, &retry, "owner"));
    }
}
