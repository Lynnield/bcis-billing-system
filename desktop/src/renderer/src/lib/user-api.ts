/**
 * User management API integration via IPC. Owner-only for writes.
 */

import type {
  UserListResponse,
  RoleListResponse,
  CreateUserRequest,
  UpdateUserRequest,
  UpdateUserRolesRequest,
  ResetPasswordRequest,
  UserDetailResponse,
} from "@/shared/types";

export async function getUsers(): Promise<UserListResponse> {
  return window.bcis.users.getList();
}

export async function getRoles(): Promise<RoleListResponse> {
  return window.bcis.users.getRoles();
}

export async function createUser(data: CreateUserRequest): Promise<UserDetailResponse> {
  return window.bcis.users.create(data);
}

export async function updateUser(id: number, data: UpdateUserRequest): Promise<UserDetailResponse> {
  return window.bcis.users.update(id, data);
}

export async function updateUserRoles(id: number, data: UpdateUserRolesRequest): Promise<UserDetailResponse> {
  return window.bcis.users.updateRoles(id, data);
}

export async function resetUserPassword(id: number, data: ResetPasswordRequest): Promise<{ data: { userId: number } }> {
  return window.bcis.users.resetPassword(id, data);
}
