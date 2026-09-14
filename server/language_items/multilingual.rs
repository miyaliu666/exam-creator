//! Runtime language defaults; historical packages and Registry snapshots stay unchanged.
use super::domain::{CandidatePayload, TaskPackage};

pub fn language_name(language: &str) -> &'static str {
    match language {
        "en" => "English",
        "es" => "Spanish",
        _ => "Simplified Chinese",
    }
}

pub fn localize_new_scaffold(package: &mut TaskPackage) {
    let language = package.content.effective_language().to_string();
    if language == "zh" {
        return;
    }
    match &mut package.candidate_payload {
        CandidatePayload::RestrictedInput(payload) => {
            for field in &mut payload.response_fields {
                field.label = Some(
                    if language == "es" {
                        "Respuesta"
                    } else {
                        "Answer"
                    }
                    .into(),
                );
            }
        }
        CandidatePayload::FormEntry(payload) => {
            for field in &mut payload.fields {
                if field.input_type == "typedChinese" {
                    field.input_type = "shortText".into();
                }
            }
        }
        _ => {}
    }
    for point in &mut package.scoring_package.scoring_points {
        if point.scoring_point_id == "SP-CONVENTIONS" {
            point.description =
                format!("{} and basic writing conventions", language_name(&language));
        }
    }
}

pub fn populate_mock(package: &mut TaskPackage, index: u64) {
    let spanish = package.content.effective_language() == "es";
    let pick = |en: &str, es: &str| {
        if spanish {
            es.to_string()
        } else {
            en.to_string()
        }
    };
    let hour = index % 8 + 1;
    match &mut package.candidate_payload {
        CandidatePayload::SingleSelect(payload) => {
            payload.stimulus.text = Some(if spanish {
                format!("La tienda cierra hoy a las {hour} de la tarde.")
            } else {
                format!("The shop closes at {hour} p.m. today.")
            });
            payload.prompt = pick("When does the shop close?", "¿A qué hora cierra la tienda?");
            for (i, option) in payload.options.iter_mut().enumerate() {
                option.text = Some(if i == 0 {
                    if spanish {
                        format!("A las {hour} de la tarde")
                    } else {
                        format!("At {hour} p.m.")
                    }
                } else {
                    pick("At 9 a.m.", "A las 9 de la mañana")
                });
            }
        }
        CandidatePayload::Matching(payload) => {
            payload.stimulus.text = Some(pick(
                "Match each activity to a place.",
                "Relaciona cada actividad con un lugar.",
            ));
            payload.prompt = pick("Choose the correct place.", "Elige el lugar correcto.");
            for (i, item) in payload.left_items.iter_mut().enumerate() {
                item.text = Some(if i == 0 {
                    pick("Buy fruit", "Comprar fruta")
                } else {
                    pick("Read a book", "Leer un libro")
                });
            }
            for (i, item) in payload.right_items.iter_mut().enumerate() {
                item.text = Some(if i == 0 {
                    pick("Shop", "Tienda")
                } else {
                    pick("Library", "Biblioteca")
                });
            }
        }
        CandidatePayload::RestrictedInput(payload) => {
            payload.stimulus.text = Some(if spanish {
                format!("La tienda cierra a las {hour} de la tarde.")
            } else {
                format!("The shop closes at {hour} p.m.")
            });
            payload.prompt = pick("When does the shop close?", "¿A qué hora cierra la tienda?");
            for field in &mut payload.response_fields {
                field.label = Some(pick("Closing time", "Hora de cierre"));
                package.scoring_package.accepted_responses.insert(
                    field.response_id.clone(),
                    vec![if spanish {
                        format!("a las {hour} de la tarde")
                    } else {
                        format!("{hour} p.m.")
                    }],
                );
            }
        }
        CandidatePayload::FormEntry(payload) => {
            payload.situation = pick(
                "You want to join a language class.",
                "Quieres apuntarte a una clase de idiomas.",
            );
            payload.instructions = pick(
                "Complete the registration form.",
                "Completa el formulario de inscripción.",
            );
            for (i, field) in payload.fields.iter_mut().enumerate() {
                field.label = pick(
                    ["Name", "Age", "Phone number", "Date", "Class", "Notes"][i % 6],
                    ["Nombre", "Edad", "Teléfono", "Fecha", "Clase", "Notas"][i % 6],
                );
                if field.input_type == "typedChinese" {
                    field.input_type = "shortText".into();
                }
            }
        }
        CandidatePayload::TypedMessage(payload) => {
            payload.situation = pick(
                "You cannot come to class today.",
                "Hoy no puedes ir a clase.",
            );
            payload.instructions = pick(
                "Write a short message to your teacher.",
                "Escribe un mensaje corto a tu profesor.",
            );
            payload.recipient = pick("Your teacher", "Tu profesor");
            payload.purpose = pick("Explain your absence", "Explicar tu ausencia");
            for point in &mut payload.required_content_points {
                point.description = pick(
                    "Say that you cannot come today",
                    "Explica que hoy no puedes ir",
                );
            }
        }
        CandidatePayload::SpokenSingle(payload) => {
            payload.situation = pick(
                "Introduce yourself to your new class.",
                "Preséntate a tu nueva clase.",
            );
            payload.instructions = pick("Talk about yourself.", "Habla de ti.");
            payload.visible_prompt_text = Some(pick(
                "Say your name, your country and an activity you like.",
                "Di tu nombre, tu país y una actividad que te gusta.",
            ));
            for point in &mut payload.required_content_points {
                point.description = pick(
                    "Give your name and one thing you like",
                    "Di tu nombre y algo que te gusta",
                );
            }
        }
        CandidatePayload::SpokenMultiturn(payload) => {
            payload.roles.system_role = pick("Examiner", "Examinador");
            payload.roles.candidate_role = pick("Candidate", "Candidato");
            payload.situation = pick("You meet a new teacher.", "Conoces a un profesor nuevo.");
            payload.instructions = pick(
                "Listen to the question and answer.",
                "Escucha la pregunta y responde.",
            );
            for path in &mut payload.paths {
                for turn in &mut path.turns {
                    if turn.speaker == "system" {
                        turn.prompt_audio_ref =
                            Some(pick("What is your name?", "¿Cómo te llamas?"));
                    } else {
                        turn.required_function_ids = vec![pick("Give your name", "Di tu nombre")];
                    }
                }
            }
        }
        CandidatePayload::ExerciseTemplate(_) => {}
    }
}
