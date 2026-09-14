import type { ComponentType } from 'react';
import type { ExerciseType } from './schema';
import type { TemplateProps } from '../templates/types';

import FillInBlanks from '../templates/FillInBlanks';
import SentenceCompletion from '../templates/SentenceCompletion';
import MultipleChoice from '../templates/MultipleChoice';
import MatchColumns from '../templates/MatchColumns';
import ImageLabel from '../templates/ImageLabel';
import Listening from '../templates/Listening';
import Dictation from '../templates/Dictation';
import Writing from '../templates/Writing';
import PictureSentence from '../templates/PictureSentence';
import PictureStory from '../templates/PictureStory';
import TwoTextEssay from '../templates/TwoTextEssay';
import SituationalWriting from '../templates/SituationalWriting';
import DescribePicture from '../templates/DescribePicture';
import ReportWriting from '../templates/ReportWriting';
import OpinionEssay from '../templates/OpinionEssay';
import AnswerAnEmail from '../templates/AnswerAnEmail';
import SummarizeText from '../templates/SummarizeText';
import GuidedWriting from '../templates/GuidedWriting';
import Speaking from '../templates/Speaking';
import Ordering from '../templates/Ordering';
import VocabularyRecognition from '../templates/VocabularyRecognition';
import IdentifyIdea from '../templates/IdentifyIdea';
import TitleThePassage from '../templates/TitleThePassage';
import CompleteThePassage from '../templates/CompleteThePassage';
import ChooseTheWord from '../templates/ChooseTheWord';
import MissingLetters from '../templates/MissingLetters';
import DragToComplete from '../templates/DragToComplete';
import PassageReconstruction from '../templates/PassageReconstruction';
import ShortAnswerQuestions from '../templates/ShortAnswerQuestions';
import ListeningShortAnswerQuestions from '../templates/ListeningShortAnswerQuestions';
import DiagramLabel from '../templates/DiagramLabel';
import ListeningDiagramLabel from '../templates/ListeningDiagramLabel';
import MultipleChoiceSingleAnswer from '../templates/MultipleChoiceSingleAnswer';
import MatchingHeadings from '../templates/MatchingHeadings';
import IdentifyInformation from '../templates/IdentifyInformation';
import MatchingSentenceEndings from '../templates/MatchingSentenceEndings';
import ReadingSentenceCompletion from '../templates/ReadingSentenceCompletion';
import WordFormation from '../templates/WordFormation';
import HighlightTheAnswer from '../templates/HighlightTheAnswer';
import ListenAndChoosePicture from '../templates/ListenAndChoosePicture';
import ListeningFillInBlanks from '../templates/ListeningFillInBlanks';
import HighlightCorrectSummary from '../templates/HighlightCorrectSummary';
import SelectMissingWord from '../templates/SelectMissingWord';
import HighlightIncorrectWords from '../templates/HighlightIncorrectWords';
import ListeningMatching from '../templates/ListeningMatching';
import ListenAndRespond from '../templates/ListenAndRespond';
import BuildASentence from '../templates/BuildASentence';
import Categorize from '../templates/Categorize';
import Pronunciation from '../templates/Pronunciation';
import ReadAloud from '../templates/ReadAloud';
import DescribeImage from '../templates/DescribeImage';
import Summary from '../templates/Summary';
import ListenAndSpeak from '../templates/ListenAndSpeak';
import SentenceBuilds from '../templates/SentenceBuilds';
import AnswerShortQuestion from '../templates/AnswerShortQuestion';
import Conversations from '../templates/Conversations';
import ExpressOpinion from '../templates/ExpressOpinion';
import ReadAndSpeak from '../templates/ReadAndSpeak';
import RespondUsingInformation from '../templates/RespondUsingInformation';
import ArgumentEvaluation from '../templates/ArgumentEvaluation';

/**
 * Maps the markdown `type` field to the component that renders it.
 * Adding a template = add a schema in schema.ts, a component in templates/,
 * and one line here.
 */
export const registry: { [K in ExerciseType]: ComponentType<TemplateProps<K>> } = {
  'fill-in-blanks': FillInBlanks,
  'sentence-completion': SentenceCompletion,
  'multiple-choice': MultipleChoice,
  'match-columns': MatchColumns,
  'image-label': ImageLabel,
  listening: Listening,
  dictation: Dictation,
  writing: Writing,
  'picture-sentence': PictureSentence,
  'picture-story': PictureStory,
  'two-text-essay': TwoTextEssay,
  'situational-writing': SituationalWriting,
  'describe-picture': DescribePicture,
  'report-writing': ReportWriting,
  'opinion-essay': OpinionEssay,
  'answer-an-email': AnswerAnEmail,
  'summarize-text': SummarizeText,
  'guided-writing': GuidedWriting,
  speaking: Speaking,
  ordering: Ordering,
  'vocabulary-recognition': VocabularyRecognition,
  'identify-idea': IdentifyIdea,
  'title-the-passage': TitleThePassage,
  'complete-the-passage': CompleteThePassage,
  'choose-the-word': ChooseTheWord,
  'missing-letters': MissingLetters,
  'drag-to-complete': DragToComplete,
  'passage-reconstruction': PassageReconstruction,
  'short-answer-questions': ShortAnswerQuestions,
  'listening-short-answer-questions': ListeningShortAnswerQuestions,
  'matching-headings': MatchingHeadings,
  'identify-information': IdentifyInformation,
  'matching-sentence-endings': MatchingSentenceEndings,
  'reading-sentence-completion': ReadingSentenceCompletion,
  'word-formation': WordFormation,
  'highlight-the-answer': HighlightTheAnswer,
  'listen-and-choose-picture': ListenAndChoosePicture,
  'listening-fill-in-blanks': ListeningFillInBlanks,
  'highlight-correct-summary': HighlightCorrectSummary,
  'select-missing-word': SelectMissingWord,
  'highlight-incorrect-words': HighlightIncorrectWords,
  'listening-matching': ListeningMatching,
  'listen-and-respond': ListenAndRespond,
  'diagram-label': DiagramLabel,
  'listening-diagram-label': ListeningDiagramLabel,
  'multiple-choice-single-answer': MultipleChoiceSingleAnswer,
  'build-a-sentence': BuildASentence,
  categorize: Categorize,
  pronunciation: Pronunciation,
  'read-aloud': ReadAloud,
  'describe-image': DescribeImage,
  summary: Summary,
  'listen-and-speak': ListenAndSpeak,
  'sentence-builds': SentenceBuilds,
  'answer-short-question': AnswerShortQuestion,
  conversations: Conversations,
  'express-opinion': ExpressOpinion,
  'read-and-speak': ReadAndSpeak,
  'respond-using-information': RespondUsingInformation,
  'argument-evaluation': ArgumentEvaluation,
};
