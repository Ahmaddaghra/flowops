export type WorkItemStatus = 'Todo' | 'InProgress' | 'Blocked' | 'Done';
export type WorkItemPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type WorkItemActivityType =
  | 'Created'
  | 'TitleChanged'
  | 'DescriptionChanged'
  | 'PriorityChanged'
  | 'CategoryChanged'
  | 'StatusChanged'
  | 'AssignmentChanged';

export interface UserSummary {
  id: string;
  displayName: string;
}

export interface WorkItemPermissions {
  canEdit: boolean;
  canChangeStatus: boolean;
  canAssign: boolean;
  canSelfAssign: boolean;
  canUnassign: boolean;
  canAssignOthers: boolean;
}

export interface WorkItem {
  id: string;
  version: number;
  title: string;
  description: string | null;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  categoryId: string | null;
  categoryName: string | null;
  createdByUserId: string | null;
  assigneeUserId: string | null;
  createdBy: UserSummary | null;
  assignee: UserSummary | null;
  permissions: WorkItemPermissions | null;
  legacyAssigneeName: string | null;
  assigneeName: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface Category {
  id: string;
  name: string;
  isActive: boolean;
}

export interface WorkItemActivity {
  id: string;
  workItemId: string;
  eventType: WorkItemActivityType;
  description: string;
  createdAtUtc: string;
  actorUserId: string | null;
  actor: UserSummary | null;
  actorDisplayName: string;
}

export interface CreateWorkItemRequest {
  title: string;
  description: string | null;
  priority: WorkItemPriority;
  categoryId: string | null;
  assigneeUserId: string | null;
}

export type UpdateWorkItemRequest = Pick<
  CreateWorkItemRequest,
  'title' | 'description' | 'priority' | 'categoryId'
> & { expectedVersion: number };

export interface ChangeStatusRequest {
  status: WorkItemStatus;
  expectedVersion: number;
}

export interface AssignWorkItemRequest {
  assigneeUserId: string | null;
  expectedVersion: number;
}

export interface WorkItemQuery {
  search?: string;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  categoryId?: string;
  assignee?: string;
  page?: number;
  pageSize?: number;
  sort?: 'createdAt' | 'updatedAt' | 'title' | 'priority' | 'status';
  direction?: 'asc' | 'desc';
}
