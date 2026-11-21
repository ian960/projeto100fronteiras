// An account deleted while posts or files still pointed at it is not removed:
// it is anonymized (UsersRepository.anonymize) and its e-mail becomes
// excluida-<id>@contas.invalid. That address is the only mark it carries, so
// the list hides it and the admin actions refuse it by looking at the suffix.
export const DELETED_EMAIL_SUFFIX = '@contas.invalid';

export function deletedEmailFor(id: string): string {
  return `excluida-${id}${DELETED_EMAIL_SUFFIX}`;
}

export function isDeletedAccount(user: { email: string }): boolean {
  return user.email.endsWith(DELETED_EMAIL_SUFFIX);
}
