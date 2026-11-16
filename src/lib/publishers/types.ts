import type { Readable } from 'node:stream';
import type { PostRow, VideoRow } from '../db/schema';
import type { Links, Seo } from '../seo';

/** Everything one step of a post needs. */
export type PostJob = {
  video: VideoRow & { slotAt: number; seo: Seo };
  post: PostRow;
  links: Links;
  now: number;
  /** Public, time-limited link to the video file. */
  fileUrl(): Promise<string>;
  openFile(): Promise<Readable>;
  /** The owner's own thumbnail, when uploaded. */
  openThumb: (() => Promise<Readable>) | null;
};

export type AccountContext = {
  externalId: string;
  tokens: any; // decrypted; shape depends on the platform
  saveTokens(tokens: unknown): Promise<void>;
};

/** What the post becomes after a step. */
export type StepResult =
  | { state: 'scheduled' | 'staged'; runAt: number; externalId: string; url?: string | null }
  | { state: 'live'; externalId?: string | null; url: string | null }
  | { state: 'wait'; runAt: number }; // nothing changed yet (e.g. Instagram still processing)

export interface Publisher {
  step(job: PostJob, ctx: AccountContext): Promise<StepResult>;
}

/** The account must be reconnected. Never retried. */
export class AuthError extends Error {}

export class PublishError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}
