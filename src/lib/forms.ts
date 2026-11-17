// Form schemas, shared by the browser (react-hook-form) and the server actions, so both check the same rules.
import { z } from 'zod';
import { PLATFORMS } from './seo';
import { isValidTime } from './slots';

const email = z.string().trim().toLowerCase().min(1, 'Enter your email').email('Enter a valid email, like you@gmail.com');
const newPassword = z.string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
  .regex(/[a-zA-Z]/, 'Add at least one letter')
  .regex(/[0-9]/, 'Add at least one number');
const sameAs = <T extends { password: string; confirm: string }>(v: T) => v.password === v.confirm;
const confirmError = { message: 'The passwords do not match', path: ['confirm'] };

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
});
export type LoginForm = z.infer<typeof loginSchema>;

export const setupSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80, 'Use at most 80 characters'),
  email,
  password: newPassword,
  confirm: z.string(),
  code: z.string().trim(),
}).refine(sameAs, confirmError);
export type SetupForm = z.infer<typeof setupSchema>;

export const forgotSchema = z.object({ email });
export type ForgotForm = z.infer<typeof forgotSchema>;

export const mfaCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Type the 6-digit code from your authenticator app'),
});
export type MfaCodeForm = z.infer<typeof mfaCodeSchema>;

export const newPasswordSchema = z.object({
  password: newPassword,
  confirm: z.string(),
}).refine(sameAs, confirmError);
export type NewPasswordForm = z.infer<typeof newPasswordSchema>;

export const changePasswordSchema = z.object({
  current: z.string().min(1, 'Enter your current password'),
  password: newPassword,
  confirm: z.string(),
}).refine(sameAs, confirmError).refine((v) => v.current !== v.password, { message: 'Choose a password you have not used here', path: ['password'] });
export type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

const link = z.string().trim().max(300).refine((v) => !v || /^https?:\/\/\S+\.\S+/.test(v), 'Paste the full link, starting with https://');

export const channelSchema = z.object({
  channel: z.string().trim().max(80, 'Use at most 80 characters'),
  niche: z.string().trim().max(200, 'Use at most 200 characters'),
  links: z.object(Object.fromEntries(PLATFORMS.map((p) => [p, link])) as Record<(typeof PLATFORMS)[number], typeof link>),
});
export type ChannelForm = z.infer<typeof channelSchema>;

export const timeSchema = z.object({
  time: z.string().refine(isValidTime, 'Pick a time on the quarter hour'),
});
export type TimeForm = z.infer<typeof timeSchema>;

export const tiktokSchema = z.object({
  apiKey: z.string().trim().min(10, 'Paste the API key from Upload-Post'),
  user: z.string().trim().min(1, 'Enter the profile name you used on Upload-Post').max(100),
});
export type TikTokForm = z.infer<typeof tiktokSchema>;

export const videoInfoSchema = z.object({
  name: z.string().trim().min(1, 'Give the video a name').max(200, 'Use at most 200 characters'),
  note: z.string().trim().max(500, 'Use at most 500 characters'),
});
export type VideoInfoForm = z.infer<typeof videoInfoSchema>;

/** What a form's server action returns: field errors go next to their fields, `error` above the form.
 *  `code` lets the page offer a next step, e.g. "send the confirmation email again". */
export type FormResult =
  | { ok: true; message?: string; code?: string }
  | { ok: false; error?: string; fields?: Record<string, string>; code?: string };

/** Field errors from a failed server check, keyed by field path, for react-hook-form's setError. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[issue.path.join('.')] ??= issue.message;
  return out;
}
