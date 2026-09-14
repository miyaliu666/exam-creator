use axum::{
    Json,
    extract::{Path, Query, State},
};
use axum_extra::extract::PrivateCookieJar;
use bson::{Bson, Document, oid::ObjectId};
use futures_util::TryStreamExt;
use http::StatusCode;
use mongodb::bson::doc;
use oauth2::CsrfToken;
use serde::{Deserialize, Serialize};
use tower_sessions::Session;
use tracing::instrument;

use crate::{
    config,
    database::{database_environment, prisma},
    errors::Error,
    routes::attempts::construct_attempts,
    state::{ServerState, SessionUser, User},
};

/// Get all users online (in state)
#[instrument(skip_all, err(Debug), level = "debug")]
pub async fn get_users(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
) -> Result<Json<Vec<User>>, Error> {
    let users = &state.client_sync.lock().unwrap().users;

    Ok(Json(users.clone()))
}

/// Get current session user
#[instrument(skip_all, err(Debug), level = "debug")]
pub async fn get_session_user(
    exam_creator_user: prisma::ExamCreatorUser,
    session: Session,
    jar: PrivateCookieJar,
    State(server_state): State<ServerState>,
) -> Result<Json<SessionUser>, Error> {
    let web_socket_token = CsrfToken::new_random().into_secret();

    let cookie = jar
        .get("sid")
        .map(|cookie| cookie.value().to_owned())
        .ok_or(Error::Server(
            StatusCode::UNAUTHORIZED,
            format!("invalid sid in cookie jar"),
        ))?;

    session.insert(&web_socket_token, &cookie).await?;

    let users = &server_state
        .client_sync
        .lock()
        .expect("unable to lock client_sync mutex")
        .users;
    let User {
        name,
        email,
        picture,
        activity,
        settings,
    } = exam_creator_user.to_session(&users);

    let session_user = SessionUser {
        name,
        email,
        picture,
        activity,
        web_socket_token,
        settings,
    };

    Ok(Json(session_user))
}

pub async fn put_user_settings(
    exam_creator_user: prisma::ExamCreatorUser,
    State(server_state): State<ServerState>,
    Json(new_settings): Json<prisma::ExamCreatorUserSettings>,
) -> Result<Json<prisma::ExamCreatorUserSettings>, Error> {
    let new_settings = mongodb::bson::serialize_to_bson(&new_settings)?;
    let _update_result = server_state
        .production_database
        .exam_creator_user
        .update_one(
            doc! { "_id": exam_creator_user.id },
            doc! { "$set": { "settings": new_settings } },
        )
        .await?;

    let updated_user = server_state
        .production_database
        .exam_creator_user
        .find_one(doc! { "_id": exam_creator_user.id })
        .await?
        .ok_or(Error::Server(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("could not find user after update: {}", exam_creator_user.id),
        ))?;

    let settings = updated_user.settings;

    // Update state
    let client_sync = &mut server_state.client_sync.lock().unwrap();
    if let Some(user) = client_sync
        .users
        .iter_mut()
        .find(|u| u.email == updated_user.email)
    {
        user.settings = settings.clone();
    }

    Ok(Json(settings))
}

#[derive(Deserialize)]
pub struct GetUserSearchQuery {
    pub user_id: Option<ObjectId>,
    pub attempt_id: Option<ObjectId>,
    pub moderation_id: Option<ObjectId>,
    pub username: Option<String>,
    pub email: Option<String>,
}

#[derive(Serialize)]
pub struct GetUserSearchResponse {
    pub user: Document,
    pub attempts: Vec<config::Attempt>,
    pub moderations: Vec<prisma::ExamEnvironmentExamModeration>,
}

/// Look up a user by one of `user_id`, `attempt_id`, `moderation_id`, `username`, or `email`,
/// and return the user with all their attempts and moderations.
#[instrument(skip_all, err(Debug), level = "info")]
pub async fn get_user_search(
    exam_creator_user: prisma::ExamCreatorUser,
    State(server_state): State<ServerState>,
    Query(params): Query<GetUserSearchQuery>,
) -> Result<Json<GetUserSearchResponse>, Error> {
    let database = database_environment(&server_state, &exam_creator_user);

    let user_id = if let Some(user_id) = params.user_id {
        user_id
    } else if let Some(attempt_id) = params.attempt_id {
        let attempt = database
            .exam_attempt
            .find_one(doc! {"_id": attempt_id})
            .await?
            .ok_or(Error::Server(
                StatusCode::BAD_REQUEST,
                format!("attempt non-existent: {attempt_id}"),
            ))?;
        attempt.user_id
    } else if let Some(moderation_id) = params.moderation_id {
        let moderation = database
            .exam_environment_exam_moderation
            .find_one(doc! {"_id": moderation_id})
            .await?
            .ok_or(Error::Server(
                StatusCode::BAD_REQUEST,
                format!("moderation non-existent: {moderation_id}"),
            ))?;
        let attempt = database
            .exam_attempt
            .find_one(doc! {"_id": moderation.exam_attempt_id})
            .await?
            .ok_or(Error::Server(
                StatusCode::BAD_REQUEST,
                format!(
                    "attempt non-existent for moderation: {}",
                    moderation.exam_attempt_id
                ),
            ))?;
        attempt.user_id
    } else if let Some(username) = params.username {
        let user = database
            .user
            .find_one(doc! {"username": &username})
            .projection(doc! {"_id": 1})
            .await?
            .ok_or(Error::Server(
                StatusCode::BAD_REQUEST,
                format!("user non-existent for username: {username}"),
            ))?;
        user.get_object_id("_id")?
    } else if let Some(email) = params.email {
        let user = database
            .user
            .find_one(doc! {"email": &email})
            .projection(doc! {"_id": 1})
            .await?
            .ok_or(Error::Server(
                StatusCode::BAD_REQUEST,
                format!("user non-existent for email: {email}"),
            ))?;
        user.get_object_id("_id")?
    } else {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            "one of user_id, attempt_id, moderation_id, username, or email must be provided"
                .to_string(),
        ));
    };

    // Only project fields useful to the client to avoid sending the full user document
    let user = database
        .user
        .find_one(doc! {"_id": user_id})
        .projection(doc! {"_id": 1, "username": 1, "email": 1, "name": 1, "picture": 1})
        .await?
        .ok_or(Error::Server(
            StatusCode::BAD_REQUEST,
            format!("user non-existent for id: {user_id}"),
        ))?;

    let exam_attempts: Vec<prisma::ExamEnvironmentExamAttempt> = database
        .exam_attempt
        .find(doc! {"userId": user_id})
        .await?
        .try_collect()
        .await?;

    let attempt_ids: Vec<ObjectId> = exam_attempts.iter().map(|a| a.id).collect();
    let moderations: Vec<prisma::ExamEnvironmentExamModeration> = database
        .exam_environment_exam_moderation
        .find(doc! {"examAttemptId": {"$in": attempt_ids}})
        .await?
        .try_collect()
        .await?;

    let attempts = construct_attempts(database, &exam_attempts).await?;

    Ok(Json(GetUserSearchResponse {
        user,
        attempts,
        moderations,
    }))
}

#[derive(Deserialize)]
pub struct GetUserDuplicatesQuery {
    pub email: String,
}

/// List every `user` document sharing a given email, oldest first, with each record's
/// attempt count. Powers the User Accounts card and the deduplicate page: a length > 1
/// means the email has duplicate accounts to consolidate.
#[instrument(skip_all, err(Debug), level = "info")]
pub async fn get_user_duplicates(
    exam_creator_user: prisma::ExamCreatorUser,
    State(server_state): State<ServerState>,
    Query(params): Query<GetUserDuplicatesQuery>,
) -> Result<Json<Vec<Document>>, Error> {
    let database = database_environment(&server_state, &exam_creator_user);

    // Full documents (no projection): the deduplicate view merges over the entire `user`
    // model, so every field must be available to compare and select.
    let users: Vec<Document> = database
        .user
        .find(doc! {"email": &params.email})
        .await?
        .try_collect()
        .await?;

    let mut duplicates = Vec::with_capacity(users.len());
    for mut user in users {
        let id = user.get_object_id("_id")?;
        let attempt_count = database
            .exam_attempt
            .count_documents(doc! {"userId": id})
            .await?;
        // Derived, not a `user` field; the client derives "created" from `_id`'s timestamp.
        user.insert("attemptCount", attempt_count as i64);
        duplicates.push(user);
    }

    // Oldest first: ObjectId ordering is monotonic in creation time.
    duplicates.sort_by_key(|d| d.get_object_id("_id").ok());

    Ok(Json(duplicates))
}

/// Grace period before a scheduled user merge is executed, allowing an undo.
const MERGE_GRACE_SECONDS: u64 = 10;

/// Monotonic tag distinguishing successive merge schedules for the same survivor id.
static MERGE_GENERATION: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Fields never written by a merge: identity and derived, non-stored values.
const NON_MERGEABLE_FIELDS: [&str; 3] = ["_id", "id", "attemptCount"];

/// A recursive spec for how one value (a field, or any nested value) is assembled from the
/// candidate "sources" available at its position. Sources are identified by string ids: at the
/// top level they are record ids; when recursing into an array group they become the ids of the
/// records contributing an item to that group. Every leaf value is copied verbatim as BSON, so
/// all model types (ObjectId, Date, arrays, nested objects) round-trip with their type intact.
#[derive(Deserialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Selection {
    /// Take the whole value from one source.
    Pick {
        #[serde(rename = "sourceId")]
        source_id: String,
    },
    /// Build an object, sourcing each sub-key with its own (recursive) selection.
    Object {
        fields: std::collections::HashMap<String, Selection>,
    },
    /// Build an array from a set of item groups, in order; each group merges the matching items
    /// contributed by one or more sources via its own (recursive) selection.
    Array { groups: Vec<ArrayGroup> },
}

/// One output array item, assembled from the items its `members` contribute (matched across
/// sources) using `selection`. Members carry the array index of the item within each source.
#[derive(Deserialize, Clone, Debug)]
pub struct ArrayGroup {
    pub members: Vec<GroupMember>,
    pub selection: Selection,
}

#[derive(Deserialize, Clone, Debug)]
pub struct GroupMember {
    #[serde(rename = "sourceId")]
    pub source_id: String,
    pub index: usize,
}

#[derive(Deserialize, Clone, Debug)]
pub struct PostUserMergeBody {
    /// The record to keep; its `_id` is retained (attempts reference it).
    pub survivor_id: String,
    /// Records to delete once their data is merged into the survivor.
    pub discarded_ids: Vec<String>,
    /// Per-field selection spec covering every mergeable `user` field.
    pub selections: std::collections::HashMap<String, Selection>,
}

/// Resolve a [`Selection`] against the candidate values available at its position, returning the
/// assembled BSON (or `None` if nothing resolves - e.g. a `Pick` of an absent source).
fn resolve_selection(
    selection: &Selection,
    candidates: &std::collections::HashMap<String, &Bson>,
) -> Option<Bson> {
    match selection {
        Selection::Pick { source_id } => candidates.get(source_id).map(|b| (*b).clone()),
        Selection::Object { fields } => {
            let mut doc = Document::new();
            for (key, sub) in fields {
                // Sub-candidates: each source whose value is a document containing this key.
                let sub_candidates: std::collections::HashMap<String, &Bson> = candidates
                    .iter()
                    .filter_map(|(sid, b)| match b {
                        Bson::Document(d) => d.get(key).map(|v| (sid.clone(), v)),
                        _ => None,
                    })
                    .collect();
                if let Some(value) = resolve_selection(sub, &sub_candidates) {
                    doc.insert(key.clone(), value);
                }
            }
            Some(Bson::Document(doc))
        }
        Selection::Array { groups } => {
            let mut out: Vec<Bson> = Vec::new();
            for group in groups {
                // Group candidates: each member's item value, read from that source's array.
                let group_candidates: std::collections::HashMap<String, &Bson> = group
                    .members
                    .iter()
                    .filter_map(|m| {
                        candidates
                            .get(&m.source_id)
                            .and_then(|b| match b {
                                Bson::Array(arr) => arr.get(m.index),
                                _ => None,
                            })
                            .map(|v| (m.source_id.clone(), v))
                    })
                    .collect();
                if let Some(value) = resolve_selection(&group.selection, &group_candidates) {
                    out.push(value);
                }
            }
            Some(Bson::Array(out))
        }
    }
}

/// Schedule a merge of duplicate `user` records after a grace period.
///
/// Spawns a cancellable task that waits  `MERGE_GRACE_SECONDS` before executing, so client can offer an undo that survives navigation.
/// Cancel via [`delete_user_merge`].
#[instrument(skip_all, err(Debug), level = "info")]
pub async fn post_user_merge(
    exam_creator_user: prisma::ExamCreatorUser,
    State(server_state): State<ServerState>,
    Json(body): Json<PostUserMergeBody>,
) -> Result<(), Error> {
    let database = database_environment(&server_state, &exam_creator_user).clone();

    let survivor_id = ObjectId::parse_str(&body.survivor_id).map_err(|_| {
        Error::Server(
            StatusCode::BAD_REQUEST,
            format!("invalid survivor_id: {}", body.survivor_id),
        )
    })?;
    let discarded_ids: Vec<ObjectId> = body
        .discarded_ids
        .iter()
        .map(|id| {
            ObjectId::parse_str(id).map_err(|_| {
                Error::Server(
                    StatusCode::BAD_REQUEST,
                    format!("invalid discarded id: {id}"),
                )
            })
        })
        .collect::<Result<_, _>>()?;

    if discarded_ids.is_empty() {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            "at least one discarded id is required".to_string(),
        ));
    }
    if discarded_ids.contains(&survivor_id) {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            "survivor_id must not appear in discarded_ids".to_string(),
        ));
    }

    // Guard against a stale request: every record involved must exist and share one email.
    // Fetch full docs now and merge from these snapshots so field values keep their BSON types.
    let survivor = database
        .user
        .find_one(doc! {"_id": survivor_id})
        .await?
        .ok_or(Error::Server(
            StatusCode::BAD_REQUEST,
            format!("survivor non-existent: {survivor_id}"),
        ))?;
    let survivor_email = survivor.get_str("email").ok().map(str::to_owned);
    // All involved docs, oldest first (ObjectId order), so array unions concatenate deterministically.
    let mut all_docs = vec![survivor];
    for id in &discarded_ids {
        let discarded = database
            .user
            .find_one(doc! {"_id": id})
            .await?
            .ok_or(Error::Server(
                StatusCode::BAD_REQUEST,
                format!("discarded record non-existent: {id}"),
            ))?;
        if discarded.get_str("email").ok().map(str::to_owned) != survivor_email {
            return Err(Error::Server(
                StatusCode::BAD_REQUEST,
                "all merged records must share the same email".to_string(),
            ));
        }
        all_docs.push(discarded);
    }
    all_docs.sort_by_key(|d| d.get_object_id("_id").ok());

    let selections = body.selections.clone();
    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    let generation = MERGE_GENERATION.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

    // Replace any existing schedule for this survivor (dropping the old sender cancels it).
    server_state
        .pending_merges
        .lock()
        .unwrap()
        .insert(survivor_id, (generation, tx));

    let database_environment = exam_creator_user.settings.database_environment.to_string();
    sentry::metrics::counter("exam.user.merge", 1)
        .attribute("outcome", "scheduled")
        .attribute("database_environment", database_environment.clone())
        .capture();

    let pending_merges = server_state.pending_merges.clone();
    tokio::spawn(async move {
        tokio::select! {
            _ = tokio::time::sleep(std::time::Duration::from_secs(MERGE_GRACE_SECONDS)) => {
                let outcome = match perform_user_merge(&database, survivor_id, &discarded_ids, &all_docs, &selections).await {
                    Ok(()) => "executed",
                    Err(e) => {
                        tracing::error!("scheduled merge failed for survivor {survivor_id}: {e}");
                        "failed"
                    }
                };
                sentry::metrics::counter("exam.user.merge", 1)
                    .attribute("outcome", outcome)
                    .attribute("database_environment", database_environment.clone())
                    .capture();
                // Only drop own entry, not a newer reschedule that replaced it.
                let mut pending = pending_merges.lock().unwrap();
                if pending.get(&survivor_id).is_some_and(|(g, _)| *g == generation) {
                    pending.remove(&survivor_id);
                }
            }
            _ = rx => {
                tracing::info!(%survivor_id, "scheduled merge cancelled");
                sentry::metrics::counter("exam.user.merge", 1)
                    .attribute("outcome", "cancelled")
                    .attribute("database_environment", database_environment.clone())
                    .capture();
            }
        }
    });

    Ok(())
}

/// Cancel a pending user merge, restoring the duplicate records.
///
/// Idempotent: cancelling when nothing is pending (e.g. the grace period already elapsed) is a no-op, not an error.
#[instrument(skip_all, err(Debug), level = "debug")]
pub async fn delete_user_merge(
    _exam_creator_user: prisma::ExamCreatorUser,
    State(server_state): State<ServerState>,
    Path(survivor_id): Path<ObjectId>,
) -> Result<(), Error> {
    // Removing the sender drops it, waking the task's `rx` branch and aborting the merge.
    let removed = server_state
        .pending_merges
        .lock()
        .unwrap()
        .remove(&survivor_id);

    if removed.is_none() {
        tracing::info!(%survivor_id, "no pending merge to cancel");
    }

    Ok(())
}

/// Build the survivor's merged field set by resolving each field's [`Selection`] against the source
/// records, re-point discarded records' attempts to it, then delete the discarded records. Every
/// value is copied verbatim (as BSON) via [`resolve_selection`], so all `user` model fields -
/// scalars, objects, and arrays, nested to any depth (objects within arrays, arrays within objects)
/// - round-trip with their type intact and nothing is hard-coded. Attempts are re-pointed before
/// deletion so a mid-failure never orphans them. Note: only `exam_attempt.userId` is re-pointed;
/// other freeCodeCamp collections keyed on the old user id are out of scope for this tool.
async fn perform_user_merge(
    database: &crate::database::Database,
    survivor_id: ObjectId,
    discarded_ids: &[ObjectId],
    all_docs: &[Document],
    selections: &std::collections::HashMap<String, Selection>,
) -> Result<(), Error> {
    // Index the source docs by their hex id for O(1) lookup during field selection.
    let by_id: std::collections::HashMap<String, &Document> = all_docs
        .iter()
        .filter_map(|d| d.get_object_id("_id").ok().map(|o| (o.to_hex(), d)))
        .collect();

    let mut fields = Document::new();

    for (field, selection) in selections {
        if NON_MERGEABLE_FIELDS.contains(&field.as_str()) {
            continue;
        }
        // Top-level candidates: each record's value for this field.
        let candidates: std::collections::HashMap<String, &Bson> = by_id
            .iter()
            .filter_map(|(sid, d)| d.get(field).map(|v| (sid.clone(), v)))
            .collect();
        if let Some(value) = resolve_selection(selection, &candidates) {
            fields.insert(field.clone(), value);
        }
    }

    if !fields.is_empty() {
        database
            .user
            .update_one(doc! {"_id": survivor_id}, doc! {"$set": fields})
            .await?;
    }

    database
        .exam_attempt
        .update_many(
            doc! {"userId": {"$in": discarded_ids}},
            doc! {"$set": {"userId": survivor_id}},
        )
        .await?;

    database
        .user
        .delete_many(doc! {"_id": {"$in": discarded_ids}})
        .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{ArrayGroup, GroupMember, Selection, resolve_selection};
    use bson::{Bson, Document, doc, oid::ObjectId};
    use std::collections::HashMap;

    // Bson helpers for terse, order-independent assertions on resolved documents.
    fn as_doc(b: Option<Bson>) -> Document {
        match b {
            Some(Bson::Document(d)) => d,
            other => panic!("expected a document, got {other:?}"),
        }
    }
    fn as_array(b: Option<Bson>) -> Vec<Bson> {
        match b {
            Some(Bson::Array(a)) => a,
            other => panic!("expected an array, got {other:?}"),
        }
    }

    #[test]
    fn pick_takes_whole_value_from_its_source() {
        let a = Bson::String("alpha".to_string());
        let b = Bson::Int32(7);
        let candidates: HashMap<String, &Bson> =
            HashMap::from([("a".to_string(), &a), ("b".to_string(), &b)]);

        assert_eq!(
            resolve_selection(
                &Selection::Pick {
                    source_id: "a".into()
                },
                &candidates
            ),
            Some(Bson::String("alpha".to_string()))
        );
        assert_eq!(
            resolve_selection(
                &Selection::Pick {
                    source_id: "b".into()
                },
                &candidates
            ),
            Some(Bson::Int32(7))
        );
    }

    #[test]
    fn pick_of_absent_source_resolves_to_none() {
        let a = Bson::Boolean(true);
        let candidates: HashMap<String, &Bson> = HashMap::from([("a".to_string(), &a)]);

        assert_eq!(
            resolve_selection(
                &Selection::Pick {
                    source_id: "missing".into()
                },
                &candidates,
            ),
            None
        );
    }

    #[test]
    fn pick_preserves_bson_type_fidelity() {
        let oid = ObjectId::new();
        let a = Bson::ObjectId(oid);
        let candidates: HashMap<String, &Bson> = HashMap::from([("a".to_string(), &a)]);

        assert_eq!(
            resolve_selection(
                &Selection::Pick {
                    source_id: "a".into()
                },
                &candidates
            ),
            Some(Bson::ObjectId(oid))
        );
    }

    #[test]
    fn object_sources_each_subkey_independently() {
        let a = Bson::Document(doc! {"name": "A", "note": "na"});
        let b = Bson::Document(doc! {"name": "B", "note": "nb"});
        let candidates: HashMap<String, &Bson> =
            HashMap::from([("a".to_string(), &a), ("b".to_string(), &b)]);

        let sel = Selection::Object {
            fields: HashMap::from([
                (
                    "name".to_string(),
                    Selection::Pick {
                        source_id: "a".into(),
                    },
                ),
                (
                    "note".to_string(),
                    Selection::Pick {
                        source_id: "b".into(),
                    },
                ),
            ]),
        };

        let d = as_doc(resolve_selection(&sel, &candidates));
        assert_eq!(d.len(), 2);
        assert_eq!(d.get_str("name").unwrap(), "A"); // from source a
        assert_eq!(d.get_str("note").unwrap(), "nb"); // from source b
    }

    #[test]
    fn object_omits_subkey_absent_on_its_chosen_source() {
        let a = Bson::Document(doc! {"name": "A"});
        let candidates: HashMap<String, &Bson> = HashMap::from([("a".to_string(), &a)]);

        // `missing` is sourced from `a`, which lacks it, so it is dropped from the result.
        let sel = Selection::Object {
            fields: HashMap::from([
                (
                    "name".to_string(),
                    Selection::Pick {
                        source_id: "a".into(),
                    },
                ),
                (
                    "missing".to_string(),
                    Selection::Pick {
                        source_id: "a".into(),
                    },
                ),
            ]),
        };

        let d = as_doc(resolve_selection(&sel, &candidates));
        assert_eq!(d.len(), 1);
        assert_eq!(d.get_str("name").unwrap(), "A");
        assert!(d.get("missing").is_none());
    }

    #[test]
    fn array_unions_selected_items_in_group_order() {
        let a = Bson::Array(vec![Bson::String("x".into()), Bson::String("y".into())]);
        let b = Bson::Array(vec![Bson::String("z".into())]);
        let candidates: HashMap<String, &Bson> =
            HashMap::from([("a".to_string(), &a), ("b".to_string(), &b)]);

        // Keep a[1] then b[0]; a[0] is dropped.
        let sel = Selection::Array {
            groups: vec![
                ArrayGroup {
                    members: vec![GroupMember {
                        source_id: "a".into(),
                        index: 1,
                    }],
                    selection: Selection::Pick {
                        source_id: "a".into(),
                    },
                },
                ArrayGroup {
                    members: vec![GroupMember {
                        source_id: "b".into(),
                        index: 0,
                    }],
                    selection: Selection::Pick {
                        source_id: "b".into(),
                    },
                },
            ],
        };

        assert_eq!(
            resolve_selection(&sel, &candidates),
            Some(Bson::Array(vec![
                Bson::String("y".into()),
                Bson::String("z".into()),
            ]))
        );
    }

    #[test]
    fn array_merges_object_items_across_members() {
        // objects-within-arrays: one output item, its sub-fields sourced from different records.
        let a = Bson::Array(vec![Bson::Document(doc! {"id": "1", "val": "a1"})]);
        let b = Bson::Array(vec![Bson::Document(doc! {"id": "1", "val": "b1"})]);
        let candidates: HashMap<String, &Bson> =
            HashMap::from([("a".to_string(), &a), ("b".to_string(), &b)]);

        let sel = Selection::Array {
            groups: vec![ArrayGroup {
                members: vec![
                    GroupMember {
                        source_id: "a".into(),
                        index: 0,
                    },
                    GroupMember {
                        source_id: "b".into(),
                        index: 0,
                    },
                ],
                selection: Selection::Object {
                    fields: HashMap::from([
                        (
                            "id".to_string(),
                            Selection::Pick {
                                source_id: "a".into(),
                            },
                        ),
                        (
                            "val".to_string(),
                            Selection::Pick {
                                source_id: "b".into(),
                            },
                        ),
                    ]),
                },
            }],
        };

        let arr = as_array(resolve_selection(&sel, &candidates));
        assert_eq!(arr.len(), 1);
        let item = arr[0].as_document().unwrap();
        assert_eq!(item.len(), 2);
        assert_eq!(item.get_str("id").unwrap(), "1"); // from a
        assert_eq!(item.get_str("val").unwrap(), "b1"); // from b
    }

    #[test]
    fn array_group_skips_out_of_range_and_non_array_members() {
        let a = Bson::Array(vec![Bson::String("only".into())]);
        let b = Bson::Int32(5); // not an array
        let candidates: HashMap<String, &Bson> =
            HashMap::from([("a".to_string(), &a), ("b".to_string(), &b)]);

        // Neither member resolves (index out of range; source not an array), so the group's
        // Pick finds no candidate and the item is skipped entirely.
        let sel = Selection::Array {
            groups: vec![ArrayGroup {
                members: vec![
                    GroupMember {
                        source_id: "a".into(),
                        index: 9,
                    },
                    GroupMember {
                        source_id: "b".into(),
                        index: 0,
                    },
                ],
                selection: Selection::Pick {
                    source_id: "a".into(),
                },
            }],
        };

        assert_eq!(
            resolve_selection(&sel, &candidates),
            Some(Bson::Array(vec![]))
        );
    }

    #[test]
    fn resolves_array_nested_within_object() {
        // arrays-within-objects: an object field whose value is itself an array to merge.
        let a = Bson::Document(doc! {
            "tag": "a",
            "files": Bson::Array(vec![Bson::Document(doc! {"name": "f1"})]),
        });
        let b = Bson::Document(doc! {
            "tag": "b",
            "files": Bson::Array(vec![Bson::Document(doc! {"name": "f2"})]),
        });
        let candidates: HashMap<String, &Bson> =
            HashMap::from([("a".to_string(), &a), ("b".to_string(), &b)]);

        let sel = Selection::Object {
            fields: HashMap::from([
                (
                    "tag".to_string(),
                    Selection::Pick {
                        source_id: "a".into(),
                    },
                ),
                (
                    "files".to_string(),
                    Selection::Array {
                        groups: vec![
                            ArrayGroup {
                                members: vec![GroupMember {
                                    source_id: "a".into(),
                                    index: 0,
                                }],
                                selection: Selection::Pick {
                                    source_id: "a".into(),
                                },
                            },
                            ArrayGroup {
                                members: vec![GroupMember {
                                    source_id: "b".into(),
                                    index: 0,
                                }],
                                selection: Selection::Pick {
                                    source_id: "b".into(),
                                },
                            },
                        ],
                    },
                ),
            ]),
        };

        let d = as_doc(resolve_selection(&sel, &candidates));
        assert_eq!(d.get_str("tag").unwrap(), "a");
        let files = d.get_array("files").unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(
            files[0].as_document().unwrap().get_str("name").unwrap(),
            "f1"
        );
        assert_eq!(
            files[1].as_document().unwrap().get_str("name").unwrap(),
            "f2"
        );
    }
}
