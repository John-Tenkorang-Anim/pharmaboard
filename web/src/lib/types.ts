// Hand-written to match the backend's actual response shapes (verified live
// against the running API — see docs/workspace.md's OpenAPI gap note). Two response
// conventions coexist server-side and both are reflected exactly here:
// most handlers build an explicit snake_case map, but a few (DeliveryReport,
// AuditEvent, the sync Entry) serialize a bare Go struct and therefore come
// back PascalCase. That inconsistency is a documented backend simplification,
// not a frontend bug — do not "fix" it here without fixing the handler.

export type AccountKind = "pharmacist" | "student" | "organisation" | "professional" | "educator";
export type VerificationState = "unverified" | "pending" | "verified" | "revoked";

export interface User {
  id: string;
  account_kind: AccountKind;
  display_name: string;
  verification_state: VerificationState;
  region_code: string | null;
  practice_area: string | null;
  institution?: string | null;
  created_at: string;
  version: number;
}

export interface OtpRequestResult {
  user_id: string;
  expires_at: string;
  dev_only_code?: string;
}

export interface Session {
  access_token: string;
  token_type: string;
  expires_at: string;
}

// --- notices ---------------------------------------------------------------

export type NoticeSeverity = "info" | "advisory" | "urgent" | "critical";
export type NoticeState = "draft" | "in_review" | "approved" | "published" | "withdrawn";

export interface AudienceRule {
  all_verified?: boolean;
  account_kind?: string;
  region_code?: string;
  practice_area?: string;
}

export interface Notice {
  id: string;
  publisher_id: string;
  title: string;
  body_markdown: string;
  severity: NoticeSeverity;
  state: NoticeState;
  audience_rule: AudienceRule;
  audience_size: number | null;
  approved_by: string | null;
  published_at: string | null;
  withdrawn_at: string | null;
  created_at: string;
  version: number;
}

export interface NoticeListResponse {
  items: Notice[];
  next_cursor?: string;
}

// Bare struct response (PascalCase) — see file header note.
export interface DeliveryReport {
  NoticeID: string;
  AudienceSize: number;
  Delivered: number;
  Read: number;
  Acknowledged: number;
  AttemptsFailed: number;
}

// --- admin -------------------------------------------------------------------

export type PublisherRole = "author" | "approver" | "publisher_admin" | "auditor";

// Bare struct response (PascalCase) — see file header note.
export interface AuditEvent {
  ID: number;
  ActorID: string | null;
  Action: string;
  SubjectType: string;
  SubjectID: string | null;
  Metadata: Record<string, unknown>;
  OccurredAt: string;
}

// --- messaging -----------------------------------------------------------

export type ConversationKind = "direct" | "group";
export type MessageKind = "text" | "system";

export interface Conversation {
  can_message?: boolean;
  members?: { id: string; name: string }[];
  id: string;
  kind: ConversationKind;
  title: string | null;
  created_by: string;
  created_at: string;
  last_message_at: string | null;
  encryption_notice: string;
}

export interface ConversationListResponse {
  items: Conversation[];
  next_cursor?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  kind: MessageKind;
  body: string;
  created_at: string;
}

export interface MessageListResponse {
  items: Message[];
  next_cursor: number;
}

export interface CallSession {
  id: string;
  conversation_id: string;
  started_by: string;
  provider: string;
  room_url: string;
  started_at: string;
  provider_notice: string;
}

// --- problem details (RFC 9457) -------------------------------------------

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code?: string;
}

// --- community -------------------------------------------------------------

export interface PublicProfile {
  id: string;
  display_name: string;
  account_kind: AccountKind;
  verification_state: VerificationState;
  practice_area: string | null;
  institution?: string | null;
  region_code: string | null;
  council_reg_no?: string | null;
}

export interface FeedPost {
  reply_count: number;
  id: string;
  channel_id: string | null;
  body: string;
  author: PublicProfile;
  reaction_count: number;
  viewer_reacted: boolean;
  viewer_follows: boolean;
  created_at: string;
}

export interface FeedResponse {
  items: FeedPost[];
  next_cursor?: string;
}

export interface ProfileStats {
  posts: number;
  followers: number;
  following: number;
}

export interface ProfileView {
  profile: PublicProfile;
  stats: ProfileStats;
  viewer_follows: boolean;
  is_self: boolean;
  posts: FeedPost[];
}

export interface ForumThreadSummary {
  id: string;
  channel_id: string | null;
  title: string;
  body: string;
  tags: string[];
  author: PublicProfile;
  reply_count: number;
  reaction_count: number;
  viewer_reacted: boolean;
  has_accepted: boolean;
  created_at: string;
  last_activity_at: string;
}

// Community is the shared topic taxonomy behind both RxForum's channels and
// the main feed's "communities" — one list of topics, two surfaces to post
// into (a discussion thread, or an ordinary post).
export interface Community {
  id: string;
  slug: string;
  name: string;
  description: string;
  thread_count: number;
  post_count: number;
  member_count: number;
  viewer_member: boolean;
  official: boolean;
  created_at: string;
}

export interface ForumReply {
  id: string;
  body: string;
  author: PublicProfile;
  reaction_count: number;
  viewer_reacted: boolean;
  accepted: boolean;
  created_at: string;
}

export interface ThreadDetail {
  thread: ForumThreadSummary;
  replies: ForumReply[];
}

export interface DirectoryResponse {
  items: PublicProfile[];
  next_cursor?: string;
}
