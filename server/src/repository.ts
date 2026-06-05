import { createRepo } from "./keyv.ts";
import type {
  AnnotationRecord,
  AuthRecord,
  BroadcastRecord,
  ChannelBlockRecord,
  ChatRecord,
  CommentRecord,
  DeploymentRecord,
  GameRecord,
  MatchRecord,
  MessageRecord,
  MigrationLogRecord,
  ModelRecord,
  PuzzleAttemptRecord,
  PuzzleRecord,
  RatingRecord,
  ThreadRecord,
  TrainingJobRecord,
  UserRecord,
} from "./models.ts";

/* Existing repos (starter code) */
export const AuthRepo = createRepo<AuthRecord>("auth");
export const ChatRepo = createRepo<ChatRecord>("chat");
export const CommentRepo = createRepo<CommentRecord>("comment");
export const GameRepo = createRepo<GameRecord>("game");
export const MessageRepo = createRepo<MessageRecord>("message");
export const ThreadRepo = createRepo<ThreadRecord>("thread");
export const UserRepo = createRepo<UserRecord>("user");

/* New repos for GameNite Arena (Sprint 1 baseline migration) */
export const AnnotationRepo = createRepo<AnnotationRecord>("annotation");
export const BroadcastRepo = createRepo<BroadcastRecord>("broadcast");
export const ChannelBlockRepo = createRepo<ChannelBlockRecord>("channelBlock");
export const DeploymentRepo = createRepo<DeploymentRecord>("deployment");
export const MatchRepo = createRepo<MatchRecord>("match");
export const ModelRepo = createRepo<ModelRecord>("model");
export const PuzzleRepo = createRepo<PuzzleRecord>("puzzle");
export const PuzzleAttemptRepo = createRepo<PuzzleAttemptRecord>("puzzleAttempt");
export const RatingRepo = createRepo<RatingRecord>("rating");
export const TrainingJobRepo = createRepo<TrainingJobRecord>("trainingJob");

/* Migration framework */
export const MigrationLogRepo = createRepo<MigrationLogRecord>("migrationLog");
