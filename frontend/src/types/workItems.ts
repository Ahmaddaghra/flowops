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

export interface WorkItem {
  id: string;
  title: string;
  description: string | null;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  categoryId: string | null;
  categoryName: string | null;
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
}

export interface CreateWorkItemRequest {
  title: string;
  description: string | null;
  priority: WorkItemPriority;
  categoryId: string | null;
  assigneeName: string | null;
}

export type UpdateWorkItemRequest = Pick<
  CreateWorkItemRequest,
  'title' | 'description' | 'priority' | 'categoryId'
>;

export interface ChangeStatusRequest {
  status: WorkItemStatus;
}

export interface AssignWorkItemRequest {
  assigneeName: string | null;
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
