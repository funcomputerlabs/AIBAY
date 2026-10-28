export const OWNER_EMAIL = "alvarosanjuandominguez813@gmail.com";

export function isOwnerEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() === OWNER_EMAIL;
}
