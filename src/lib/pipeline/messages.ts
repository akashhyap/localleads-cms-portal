/**
 * Commit-message construction.
 *
 * Every write attributes the human editor and notes it came through the portal,
 * e.g.  `content: update homepage hero — by mike@client.com via portal`.
 */

export type WriteAction = "create" | "update" | "delete" | "rename";

export function buildCommitMessage(params: {
  action: WriteAction;
  contentLabel: string;
  actorEmail: string;
  detail?: string;
}): string {
  const { action, contentLabel, actorEmail, detail } = params;
  const subject = detail ? `${contentLabel} ${detail}` : contentLabel;
  return `content: ${action} ${subject} — by ${actorEmail} via portal`;
}

export function buildMediaCommitMessage(params: {
  action: "upload" | "replace" | "delete";
  filename: string;
  actorEmail: string;
}): string {
  return `media: ${params.action} ${params.filename} — by ${params.actorEmail} via portal`;
}
