export type ForgotPasswordInput = {
  email: string;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type ResetPasswordInput = {
  token: string;
  newPassword: string;
};

export type ChangePasswordInput = {
  // Absent for an account with no password yet (made with Google).
  currentPassword?: string;
  newPassword: string;
};
