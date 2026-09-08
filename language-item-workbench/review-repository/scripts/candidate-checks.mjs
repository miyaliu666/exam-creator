import { requireRule, unique } from './registry-checks.mjs';

const hiddenKeys = new Set(['answer', 'answers', 'answerkey', 'answerkeyref', 'correctanswer',
  'correctoptionid', 'correctmatches', 'acceptedresponses', 'iscorrect', 'scoring', 'scoringpackage',
  'scoringpoints', 'maxrawscore', 'rubric', 'rubricid', 'benchmarksetversion', 'review', 'reviewpackage',
  'reviewgates', 'gates', 'authoringpackage', 'authornotes', 'internalnotes', 'explanation', 'rationale',
  'englishtranslations']);

export function preventCandidateLeaks(value, path = 'candidatePayload') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    requireRule(!hiddenKeys.has(normalized), `${path}: candidate-visible scoring/review metadata is forbidden`);
    preventCandidateLeaks(child, `${path}.${key}`);
  }
}

export function validateCandidate(pkg) {
  const candidate = pkg.candidatePayload;
  const scoring = pkg.scoringPackage;
  preventCandidateLeaks(candidate);
  const points = scoring.scoringPoints;
  unique(points.map(point => point.scoringPointId), 'Scoring points');
  requireRule(points.every(point => point.description.trim() && Number.isInteger(point.points) && point.points > 0),
    'Scoring points need a description and positive integer value');
  requireRule(points.reduce((total, point) => total + point.points, 0) === scoring.maxRawScore,
    'Maximum score must equal the sum of scoring points');
  requireRule(scoring.answerKeyRef?.trim(), 'Answer key reference is required');
  requireRule(!scoring.rubricId || scoring.benchmarkSetVersion?.trim(), 'Rubric scoring needs a benchmark version');
  let responseIds = [];
  if (['IF-SINGLE-SELECT', 'IF-MATCHING', 'IF-RESTRICTED-INPUT'].includes(pkg.itemFormatId)) {
    const stimulus = candidate.stimulus;
    requireRule(stimulus.text?.trim() || stimulus.imageRefs?.length || stimulus.audioRef?.trim(), 'Stimulus must contain text, image, or audio');
    requireRule(candidate.prompt.trim(), 'Candidate prompt must not be blank');
  }
  switch (pkg.itemFormatId) {
    case 'IF-SINGLE-SELECT': {
      const ids = candidate.options.map(option => option.optionId);
      unique(ids, 'Options');
      requireRule(ids.length >= 2 && candidate.options.every(option => option.text?.trim() || option.imageRef?.trim()), 'At least two nonempty options are required');
      requireRule(ids.includes(scoring.correctOptionId), 'Correct answer must reference an existing option');
      responseIds = ['ITEM'];
      break;
    }
    case 'IF-MATCHING': {
      responseIds = candidate.leftItems.map(item => item.itemId);
      const right = candidate.rightItems.map(item => item.itemId);
      unique(responseIds, 'Left matching items'); unique(right, 'Right matching items');
      requireRule([...candidate.leftItems, ...candidate.rightItems].every(item => item.text?.trim() || item.imageRef?.trim()), 'Matching items must not be blank');
      requireRule(Object.keys(scoring.correctMatches ?? {}).length === responseIds.length
        && responseIds.every(id => right.includes(scoring.correctMatches?.[id])), 'Each left item needs one existing right-item answer');
      if (!candidate.allowRightItemReuse) unique(Object.values(scoring.correctMatches), 'Matching answers');
      break;
    }
    case 'IF-RESTRICTED-INPUT':
      responseIds = candidate.responseFields.map(field => field.responseId);
      break;
    case 'IF-FORM-ENTRY':
      responseIds = candidate.fields.map(field => field.fieldId);
      requireRule(candidate.situation.trim() && candidate.instructions.trim(), 'Form situation and instructions are required');
      requireRule(candidate.fields.every(field => field.label.trim()), 'Form field labels must not be blank');
      break;
    case 'IF-TYPED-MESSAGE':
    case 'IF-SPOKEN-SINGLE':
      requireRule(candidate.situation.trim() && candidate.instructions.trim(), 'Situation and instructions are required');
      unique(candidate.requiredContentPoints.map(point => point.contentPointId), 'Required content points');
      requireRule(candidate.requiredContentPoints.every(point => point.description.trim()), 'Content points must not be blank');
      if (pkg.itemFormatId === 'IF-TYPED-MESSAGE') {
        requireRule(candidate.recipient.trim() && candidate.purpose.trim(), 'Recipient and purpose are required');
        requireRule(candidate.lengthGuidance.minimum > 0 && candidate.lengthGuidance.minimum <= candidate.lengthGuidance.maximum, 'Response length must be positive and minimum cannot exceed maximum');
      } else {
        requireRule(candidate.visiblePromptText?.trim() || candidate.promptAudioRef?.trim(), 'Spoken response needs a visible or audio prompt');
        requireRule(candidate.responseTimeSeconds > 0, 'Spoken response time must be positive');
      }
      break;
    case 'IF-SPOKEN-MULTITURN': {
      requireRule(candidate.situation.trim() && candidate.instructions.trim()
        && candidate.roles.systemRole.trim() && candidate.roles.candidateRole.trim(), 'Interaction situation, instructions and roles are required');
      const paths = candidate.paths.map(path => path.pathId);
      unique(paths, 'Interaction paths');
      requireRule(paths.includes(candidate.startPathId), 'Start path must exist');
      for (const path of candidate.paths) {
        unique(path.turns.map(turn => turn.turnId), 'Interaction turns');
        unique(path.turns.filter(turn => turn.responseId).map(turn => turn.responseId), 'Interaction responses');
        requireRule(path.turns.some(turn => turn.speaker === 'candidate') && path.turns.some(turn => turn.speaker === 'system'), 'Each path must contain a system prompt and candidate response');
        for (const turn of path.turns) requireRule(turn.speaker === 'system' ? turn.promptAudioRef?.trim()
          : turn.responseId?.trim(), 'Interaction turn is missing its prompt or response reference');
      }
      break;
    }
    default: throw new Error('Unsupported item format');
  }
  unique(responseIds, 'Response units');
  for (const id of responseIds) requireRule(points.some(point => point.scoringPointId === `SP-${id}`), 'Response unit is missing its scoring point');
  if (['IF-RESTRICTED-INPUT', 'IF-FORM-ENTRY'].includes(pkg.itemFormatId)) {
    const answers = scoring.acceptedResponses ?? {};
    requireRule(Object.keys(answers).every(id => responseIds.includes(id)), 'Answer key contains an unknown response unit');
    for (const id of responseIds) requireRule(answers[id]?.some(answer => answer.trim()), 'Each response field requires a nonempty accepted answer');
  }
}
