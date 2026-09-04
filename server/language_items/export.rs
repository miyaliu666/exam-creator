use std::collections::{BTreeMap, HashSet};

use bson::oid::ObjectId;

use crate::{config, database::prisma};

use super::domain::LanguageItemVersion;

pub struct LegacyExportBundle {
    pub exam: prisma::ExamCreatorExam,
    pub exam_id: ObjectId,
    pub question_set_id: ObjectId,
    pub question_id: ObjectId,
    pub option_answer_ids: BTreeMap<String, String>,
}

#[derive(Debug)]
pub struct LegacyAssemblySource {
    pub item_id: String,
    pub version_id: String,
    pub question_set_id: ObjectId,
    pub question_id: ObjectId,
    pub option_answer_ids: BTreeMap<String, String>,
}

#[derive(Debug)]
pub struct LegacyAssemblyBundle {
    pub exam: prisma::ExamCreatorExam,
    pub exam_id: ObjectId,
    pub sources: Vec<LegacyAssemblySource>,
}

pub fn build_legacy_export(version: &LanguageItemVersion) -> Result<LegacyExportBundle, String> {
    let candidate_payload = version
        .package
        .candidate_payload
        .as_single_select()
        .ok_or_else(|| "legacy export only supports single-select items".to_string())?;
    let exam_id = stable_object_id(&format!("exam:{}", version.id));
    let source = build_legacy_question_set(version);
    let mut exam = prisma::ExamCreatorExam {
        id: exam_id,
        question_sets: vec![source.0],
        ..Default::default()
    };
    exam.config.name = format!("Language Item Smoke Test · {}", version.item_id);
    exam.config.note = format!("Generated from frozen Workbench version {}", version.id);
    exam.config.total_time_in_s = 300;
    exam.config.retake_time_in_s = 0;
    exam.config.passing_percent = 100.0;
    exam.config.question_sets = vec![prisma::ExamEnvironmentQuestionSetConfig {
        _type: prisma::ExamEnvironmentQuestionType::MultipleChoice,
        number_of_set: 1,
        number_of_questions: 1,
        number_of_correct_answers: 1,
        number_of_incorrect_answers: candidate_payload.options.len() as i64 - 1,
    }];
    config::validate_config(&exam)?;

    Ok(LegacyExportBundle {
        exam,
        exam_id,
        question_set_id: source.1,
        question_id: source.2,
        option_answer_ids: source.3,
    })
}

pub fn assembly_id(title: &str, versions: &[LanguageItemVersion]) -> String {
    let version_key = versions
        .iter()
        .map(|version| version.id.as_str())
        .collect::<Vec<_>>()
        .join("|");
    format!(
        "LIA-{:016x}",
        fnv1a(format!("{}|{version_key}", title.trim()).as_bytes())
    )
}

pub fn assembly_source_content_hash(versions: &[LanguageItemVersion]) -> String {
    let hashes = versions
        .iter()
        .map(|version| format!("{}:{}", version.id, version.content_hash))
        .collect::<Vec<_>>()
        .join("|");
    format!("fnv1a64:{:016x}", fnv1a(hashes.as_bytes()))
}

pub fn build_legacy_assembly(
    id: &str,
    title: &str,
    versions: &[LanguageItemVersion],
) -> Result<LegacyAssemblyBundle, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("assembly title cannot be empty".to_string());
    }
    if !(5..=6).contains(&versions.len()) {
        return Err("R-A1-1 assembly requires exactly 5 or 6 versions".to_string());
    }
    let unique_version_ids: HashSet<&str> =
        versions.iter().map(|version| version.id.as_str()).collect();
    let unique_item_ids: HashSet<&str> = versions
        .iter()
        .map(|version| version.item_id.as_str())
        .collect();
    if unique_version_ids.len() != versions.len() || unique_item_ids.len() != versions.len() {
        return Err("assembly versions and source items must be unique".to_string());
    }
    if versions.iter().any(|version| {
        version.package.blueprint_slot_id != "R-A1-1"
            || version.package.task_family_id != "TF-SIGNS-NOTICES"
            || version.package.item_format_id != "IF-SINGLE-SELECT"
            || version.package.renderer.renderer_id != "REN-SINGLE-SELECT"
    }) {
        return Err(
            "assembly only supports the implemented R-A1-1 single-select chain".to_string(),
        );
    }
    let option_count = versions[0]
        .package
        .candidate_payload
        .as_single_select()
        .expect("assembly format was checked")
        .options
        .len();
    if versions.iter().any(|version| {
        version
            .package
            .candidate_payload
            .as_single_select()
            .is_none_or(|payload| payload.options.len() != option_count)
    }) {
        return Err(
            "legacy assembly requires every source version to have the same option count"
                .to_string(),
        );
    }

    let mut sources = Vec::with_capacity(versions.len());
    let mut question_sets = Vec::with_capacity(versions.len());
    for version in versions {
        let (question_set, question_set_id, question_id, option_answer_ids) =
            build_legacy_question_set(version);
        question_sets.push(question_set);
        sources.push(LegacyAssemblySource {
            item_id: version.item_id.clone(),
            version_id: version.id.clone(),
            question_set_id,
            question_id,
            option_answer_ids,
        });
    }

    let exam_id = stable_object_id(&format!("assembly:{id}"));
    let mut exam = prisma::ExamCreatorExam {
        id: exam_id,
        question_sets,
        ..Default::default()
    };
    exam.config.name = title.to_string();
    exam.config.note = format!(
        "Generated from Workbench R-A1-1 assembly {id}: {}",
        versions
            .iter()
            .map(|version| version.id.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    );
    exam.config.total_time_in_s = versions.len() as i64 * 60;
    exam.config.retake_time_in_s = 0;
    exam.config.passing_percent = 100.0;
    exam.config.question_sets = vec![prisma::ExamEnvironmentQuestionSetConfig {
        _type: prisma::ExamEnvironmentQuestionType::MultipleChoice,
        number_of_set: versions.len() as i64,
        number_of_questions: 1,
        number_of_correct_answers: 1,
        number_of_incorrect_answers: option_count as i64 - 1,
    }];
    config::validate_config(&exam)?;

    Ok(LegacyAssemblyBundle {
        exam,
        exam_id,
        sources,
    })
}

fn build_legacy_question_set(
    version: &LanguageItemVersion,
) -> (
    prisma::ExamEnvironmentQuestionSet,
    ObjectId,
    ObjectId,
    BTreeMap<String, String>,
) {
    let package = &version.package;
    let candidate_payload = package
        .candidate_payload
        .as_single_select()
        .expect("legacy export receives a validated single-select package");
    let question_set_id = stable_object_id(&format!("question-set:{}", version.id));
    let question_id = stable_object_id(&format!("question:{}", version.id));
    let mut option_answer_ids = BTreeMap::new();
    let answers = candidate_payload
        .options
        .iter()
        .map(|option| {
            let answer_id =
                stable_object_id(&format!("answer:{}:{}", version.id, option.option_id));
            option_answer_ids.insert(option.option_id.clone(), answer_id.to_hex());
            prisma::ExamEnvironmentAnswer {
                id: answer_id,
                is_correct: package.scoring_package.correct_option_id.as_deref()
                    == Some(option.option_id.as_str()),
                text: option.text.clone().unwrap_or_default(),
            }
        })
        .collect();
    let question_set = prisma::ExamEnvironmentQuestionSet {
        id: question_set_id,
        _type: prisma::ExamEnvironmentQuestionType::MultipleChoice,
        context: candidate_payload.stimulus.text.clone(),
        questions: vec![prisma::ExamEnvironmentMultipleChoiceQuestion {
            id: question_id,
            text: candidate_payload.prompt.clone(),
            tags: vec![
                package.blueprint_slot_id.clone(),
                package.content.primary_domain.clone(),
                package.content.context_id.clone(),
                package.content.difficulty_band.clone(),
                version.item_id.clone(),
                version.id.clone(),
            ],
            audio: None,
            answers,
            deprecated: false,
        }],
    };
    (
        question_set,
        question_set_id,
        question_id,
        option_answer_ids,
    )
}

fn stable_object_id(key: &str) -> ObjectId {
    let first = fnv1a(format!("first:{key}").as_bytes());
    let second = fnv1a(format!("second:{key}").as_bytes());
    let hex = format!("{first:016x}{:08x}", second as u32);
    ObjectId::parse_str(hex).expect("stable hash is valid ObjectId hex")
}

fn fnv1a(input: &[u8]) -> u64 {
    input.iter().fold(0xcbf29ce484222325, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        generate::{self, ExamInput},
        language_items::{
            domain::{LanguageItemVersion, TaskPackage},
            validation::validate_task_package,
        },
    };

    fn version() -> LanguageItemVersion {
        let mut package = TaskPackage::new("LI-TEST".to_string());
        let payload = package
            .candidate_payload
            .as_single_select_mut()
            .expect("default is single select");
        payload.stimulus.text = Some("星期一不开门".to_string());
        payload.prompt = "哪一天不能来？".to_string();
        payload.options[0].text = Some("星期一".to_string());
        payload.options[1].text = Some("星期二".to_string());
        let content_hash = crate::language_items::domain::task_package_hash(&package);
        LanguageItemVersion {
            id: "LIV-TEST".to_string(),
            item_id: "LI-TEST".to_string(),
            version_number: 1,
            created_from_draft_revision: 1,
            author_email: "author@example.com".to_string(),
            submitted_by: "author@example.com".to_string(),
            frozen: true,
            content_hash,
            lifecycle_status: "submitted".to_string(),
            validation: validate_task_package(&package),
            package,
            created_at: "2026-09-03T00:00:00Z".to_string(),
        }
    }

    fn version_named(index: usize) -> LanguageItemVersion {
        let mut version = version();
        version.id = format!("LIV-TEST-{index}");
        version.item_id = format!("LI-TEST-{index}");
        version.package.task_id = version.item_id.clone();
        version
            .package
            .candidate_payload
            .as_single_select_mut()
            .expect("default is single select")
            .stimulus
            .text = Some(format!("通知 {index}"));
        version.content_hash = crate::language_items::domain::task_package_hash(&version.package);
        version
    }

    #[test]
    fn legacy_mapping_is_stable_and_generatable() {
        let version = version();
        let first = build_legacy_export(&version).expect("valid legacy mapping");
        let second = build_legacy_export(&version).expect("valid legacy mapping");
        assert_eq!(first.exam_id, second.exam_id);
        assert_eq!(first.question_id, second.question_id);
        let generated = generate::generate_exam(ExamInput {
            id: first.exam.id,
            question_sets: first.exam.question_sets,
            config: first.exam.config,
        })
        .expect("legacy exam should generate");
        assert_eq!(generated.question_sets.len(), 1);
        assert_eq!(generated.question_sets[0].questions.len(), 1);
    }

    #[test]
    fn five_item_assembly_is_stable_and_generatable() {
        let versions = (1..=5).map(version_named).collect::<Vec<_>>();
        let id = assembly_id("R-A1-1 smoke", &versions);
        let first =
            build_legacy_assembly(&id, "R-A1-1 smoke", &versions).expect("valid slot assembly");
        let second =
            build_legacy_assembly(&id, "R-A1-1 smoke", &versions).expect("valid slot assembly");

        assert_eq!(first.exam_id, second.exam_id);
        assert_eq!(first.sources.len(), 5);
        assert_eq!(assembly_id("R-A1-1 smoke", &versions), id);
        assert_eq!(
            assembly_source_content_hash(&versions),
            assembly_source_content_hash(&versions)
        );

        let generated = generate::generate_exam(ExamInput {
            id: first.exam.id,
            question_sets: first.exam.question_sets,
            config: first.exam.config,
        })
        .expect("slot assembly should generate");
        assert_eq!(generated.question_sets.len(), 5);
        assert!(
            generated
                .question_sets
                .iter()
                .all(|question_set| question_set.questions.len() == 1)
        );

        let six_versions = (1..=6).map(version_named).collect::<Vec<_>>();
        let six_id = assembly_id("R-A1-1 six", &six_versions);
        let six = build_legacy_assembly(&six_id, "R-A1-1 six", &six_versions)
            .expect("valid six-item slot assembly");
        let six_generated = generate::generate_exam(ExamInput {
            id: six.exam.id,
            question_sets: six.exam.question_sets,
            config: six.exam.config,
        })
        .expect("six-item slot assembly should generate");
        assert_eq!(six_generated.question_sets.len(), 6);
    }

    #[test]
    fn assembly_rejects_duplicate_source_items_and_inconsistent_options() {
        let mut duplicate_versions = (1..=5).map(version_named).collect::<Vec<_>>();
        duplicate_versions[1].item_id = duplicate_versions[0].item_id.clone();
        assert!(
            build_legacy_assembly("LIA-DUPLICATE", "duplicate", &duplicate_versions)
                .expect_err("duplicate source items must be rejected")
                .contains("unique")
        );

        let mut inconsistent_versions = (1..=5).map(version_named).collect::<Vec<_>>();
        let mut extra = inconsistent_versions[0]
            .package
            .candidate_payload
            .as_single_select()
            .expect("default is single select")
            .options[0]
            .clone();
        extra.option_id = "C".to_string();
        extra.text = Some("星期三".to_string());
        inconsistent_versions[0]
            .package
            .candidate_payload
            .as_single_select_mut()
            .expect("default is single select")
            .options
            .push(extra);
        assert!(
            build_legacy_assembly("LIA-OPTIONS", "options", &inconsistent_versions)
                .expect_err("inconsistent option counts must be rejected")
                .contains("same option count")
        );
    }
}
