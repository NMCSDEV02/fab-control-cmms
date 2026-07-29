export type SessionPurpose = 'APPLICATION' | 'FIRST_ACCESS';

export interface AuthenticatedUser {
  readonly id: string;
  readonly tenantId: string;
  readonly employeeNumber: string;
  readonly name: string;
  readonly email: string | null;
  readonly profile: 'ADMIN' | 'GESTOR' | 'OPERADOR';
  readonly areaId: string | null;
  readonly technicalRoleId: string | null;
  readonly roles: readonly string[];
  readonly capabilities: readonly string[];
}

export interface AuthContext {
  readonly sessionId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly user: AuthenticatedUser;
}

export interface RequestMetadata {
  readonly ipAddress: string;
  readonly userAgent: string | null;
  readonly traceId: string;
}

export interface LoginInput {
  readonly employeeNumber: string;
  readonly password: string;
}

export interface FirstAccessInput {
  readonly changeToken: string;
  readonly currentPassword: string;
  readonly newPassword: string;
}
