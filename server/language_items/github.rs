use std::collections::HashMap;

use base64::{Engine, engine::general_purpose::STANDARD};
use http::StatusCode;
use reqwest::{Client, Method, Response};
use serde::{Deserialize, de::DeserializeOwned};
use serde_json::{Value, json};

use crate::{config::GithubReviewConfig, errors::Error};

use super::domain::GithubReviewState;

const API_VERSION: &str = "2022-11-28";
const USER_AGENT: &str = "exam-creator-language-item-review";

#[derive(Clone, Debug)]
pub struct RepositoryFile {
    pub path: String,
    pub content: String,
}

#[derive(Clone, Debug)]
pub struct CreatedPullRequest {
    pub number: u64,
    pub html_url: String,
    pub head_ref: String,
    pub head_sha: String,
    pub base_ref: String,
}

#[derive(Clone, Debug)]
pub struct RemotePullRequestSummary {
    pub number: u64,
    pub html_url: String,
    pub state: GithubReviewState,
    pub head_ref: String,
    pub head_sha: String,
    pub base_ref: String,
    pub approval_count: usize,
    pub changes_requested_count: usize,
    pub merge_commit_sha: Option<String>,
    pub merged_by: Option<String>,
}

pub struct GithubClient<'a> {
    http: &'a Client,
    config: &'a GithubReviewConfig,
}

impl<'a> GithubClient<'a> {
    pub fn new(http: &'a Client, config: &'a GithubReviewConfig) -> Self {
        Self { http, config }
    }

    pub async fn create_review_pull_request(
        &self,
        batch_id: &str,
        title: &str,
        body: &str,
        files: &[RepositoryFile],
    ) -> Result<CreatedPullRequest, Error> {
        if files.is_empty() {
            return Err(Error::Server(
                StatusCode::BAD_REQUEST,
                "GitHub review batch must contain at least one file".to_string(),
            ));
        }
        let base_ref: GitRef = self
            .request(
                Method::GET,
                &format!("git/ref/heads/{}", self.config.base_branch),
                None,
            )
            .await?;
        let base_commit: GitCommit = self
            .request(
                Method::GET,
                &format!("git/commits/{}", base_ref.object.sha),
                None,
            )
            .await?;

        let mut entries = Vec::with_capacity(files.len());
        for file in files {
            let blob: GitBlob = self
                .request(
                    Method::POST,
                    "git/blobs",
                    Some(json!({ "content": file.content, "encoding": "utf-8" })),
                )
                .await?;
            entries.push(json!({
                "path": file.path,
                "mode": "100644",
                "type": "blob",
                "sha": blob.sha,
            }));
        }
        let tree: GitTree = self
            .request(
                Method::POST,
                "git/trees",
                Some(json!({
                    "base_tree": base_commit.tree.sha,
                    "tree": entries,
                })),
            )
            .await?;
        let commit: GitCommit = self
            .request(
                Method::POST,
                "git/commits",
                Some(json!({
                    "message": format!("提交题项审核批次 {batch_id}"),
                    "tree": tree.sha,
                    "parents": [base_ref.object.sha],
                })),
            )
            .await?;
        let head_ref = format!("item-review/{batch_id}");
        let _: GitRef = self
            .request(
                Method::POST,
                "git/refs",
                Some(json!({
                    "ref": format!("refs/heads/{head_ref}"),
                    "sha": commit.sha,
                })),
            )
            .await?;
        let pull: PullRequest = self
            .request(
                Method::POST,
                "pulls",
                Some(json!({
                    "title": title,
                    "body": body,
                    "head": head_ref,
                    "base": self.config.base_branch,
                })),
            )
            .await?;
        Ok(CreatedPullRequest {
            number: pull.number,
            html_url: pull.html_url,
            head_ref: pull.head.reference,
            head_sha: pull.head.sha,
            base_ref: pull.base.reference,
        })
    }

    pub async fn pull_request_summary(
        &self,
        number: u64,
    ) -> Result<RemotePullRequestSummary, Error> {
        let pull: PullRequest = self
            .request(Method::GET, &format!("pulls/{number}"), None)
            .await?;
        let reviews: Vec<PullRequestReview> = self
            .request(Method::GET, &format!("pulls/{number}/reviews"), None)
            .await?;
        let (state, approval_count, changes_requested_count) = review_state(&pull, &reviews);
        Ok(RemotePullRequestSummary {
            number: pull.number,
            html_url: pull.html_url,
            state,
            head_ref: pull.head.reference,
            head_sha: pull.head.sha,
            base_ref: pull.base.reference,
            approval_count,
            changes_requested_count,
            merge_commit_sha: pull.merge_commit_sha,
            merged_by: pull.merged_by.map(|user| user.login),
        })
    }

    pub async fn repository_file_at(&self, path: &str, revision: &str) -> Result<Vec<u8>, Error> {
        let content: RepositoryContent = self
            .request(
                Method::GET,
                &format!("contents/{path}?ref={revision}"),
                None,
            )
            .await?;
        if content.encoding != "base64" {
            return Err(Error::Server(
                StatusCode::BAD_GATEWAY,
                format!("GitHub returned unsupported content encoding for {path}"),
            ));
        }
        STANDARD
            .decode(content.content.replace(['\r', '\n'], ""))
            .map_err(|_| {
                Error::Server(
                    StatusCode::BAD_GATEWAY,
                    format!("GitHub returned invalid base64 content for {path}"),
                )
            })
    }

    async fn request<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Option<Value>,
    ) -> Result<T, Error> {
        let url = format!(
            "{}/repos/{}/{}",
            self.config.api_base_url,
            self.config.repository,
            path.trim_start_matches('/')
        );
        let mut request = self
            .http
            .request(method, url)
            .bearer_auth(&self.config.token)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", API_VERSION)
            .header("User-Agent", USER_AGENT);
        if let Some(body) = body {
            request = request.json(&body);
        }
        let response = request.send().await.map_err(github_request_error)?;
        read_json(response).await
    }
}

async fn read_json<T: DeserializeOwned>(response: Response) -> Result<T, Error> {
    let status = response.status();
    if !status.is_success() {
        let detail: String = response
            .text()
            .await
            .unwrap_or_default()
            .chars()
            .take(500)
            .collect();
        return Err(Error::Server(
            StatusCode::BAD_GATEWAY,
            format!("GitHub returned {status}: {detail}"),
        ));
    }
    response.json().await.map_err(|error| {
        Error::Server(
            StatusCode::BAD_GATEWAY,
            format!("GitHub returned unreadable JSON: {error}"),
        )
    })
}

fn github_request_error(error: reqwest::Error) -> Error {
    let message = if error.is_timeout() {
        "GitHub request timed out"
    } else if error.is_connect() {
        "Unable to connect to GitHub"
    } else {
        "GitHub request failed"
    };
    Error::Server(StatusCode::BAD_GATEWAY, message.to_string())
}

fn review_state(
    pull: &PullRequest,
    reviews: &[PullRequestReview],
) -> (GithubReviewState, usize, usize) {
    let mut latest_by_reviewer = HashMap::new();
    for review in reviews {
        if matches!(review.state.as_str(), "APPROVED" | "CHANGES_REQUESTED") {
            latest_by_reviewer.insert(review.user.login.clone(), review.state.as_str());
        }
    }
    let approval_count = latest_by_reviewer
        .values()
        .filter(|state| **state == "APPROVED")
        .count();
    let changes_requested_count = latest_by_reviewer
        .values()
        .filter(|state| **state == "CHANGES_REQUESTED")
        .count();
    let state = if pull.merged_at.is_some() {
        GithubReviewState::Merged
    } else if pull.state == "closed" {
        GithubReviewState::Closed
    } else if changes_requested_count > 0 {
        GithubReviewState::ChangesRequested
    } else if approval_count > 0 {
        GithubReviewState::Approved
    } else {
        GithubReviewState::Open
    };
    (state, approval_count, changes_requested_count)
}

#[derive(Deserialize)]
struct GitRef {
    object: GitObject,
}

#[derive(Deserialize)]
struct GitObject {
    sha: String,
}

#[derive(Deserialize)]
struct GitCommit {
    sha: String,
    tree: GitObject,
}

#[derive(Deserialize)]
struct GitBlob {
    sha: String,
}

#[derive(Deserialize)]
struct GitTree {
    sha: String,
}

#[derive(Deserialize)]
struct PullRef {
    #[serde(rename = "ref")]
    reference: String,
    sha: String,
}

#[derive(Deserialize)]
struct GithubUser {
    login: String,
}

#[derive(Deserialize)]
struct PullRequest {
    number: u64,
    html_url: String,
    state: String,
    head: PullRef,
    base: PullRef,
    merge_commit_sha: Option<String>,
    merged_at: Option<String>,
    merged_by: Option<GithubUser>,
}

#[derive(Deserialize)]
struct PullRequestReview {
    user: GithubUser,
    state: String,
}

#[derive(Deserialize)]
struct RepositoryContent {
    content: String,
    encoding: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pull(state: &str, merged: bool) -> PullRequest {
        PullRequest {
            number: 7,
            html_url: "https://github.test/pull/7".to_string(),
            state: state.to_string(),
            head: PullRef {
                reference: "item-review/batch".to_string(),
                sha: "head".to_string(),
            },
            base: PullRef {
                reference: "main".to_string(),
                sha: "base".to_string(),
            },
            merge_commit_sha: merged.then(|| "merge".to_string()),
            merged_at: merged.then(|| "2026-01-01T00:00:00Z".to_string()),
            merged_by: None,
        }
    }

    fn review(user: &str, state: &str) -> PullRequestReview {
        PullRequestReview {
            user: GithubUser {
                login: user.to_string(),
            },
            state: state.to_string(),
        }
    }

    #[test]
    fn derives_latest_review_state_per_reviewer() {
        let reviews = vec![
            review("a", "CHANGES_REQUESTED"),
            review("a", "APPROVED"),
            review("b", "APPROVED"),
        ];
        assert_eq!(
            review_state(&pull("open", false), &reviews).0,
            GithubReviewState::Approved
        );
        assert_eq!(review_state(&pull("open", false), &reviews).1, 2);
        assert_eq!(
            review_state(&pull("closed", true), &reviews).0,
            GithubReviewState::Merged
        );
    }
}
