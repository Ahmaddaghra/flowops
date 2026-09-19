export type WorkItemStatus = 'Todo' | 'InProgress' | 'Blocked' | 'Done';
export type WorkItemPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export interface WorkItem {
  id: string;
  title: string;
  description: string | null;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  assigneeName: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface CreateWorkItemRequest {
  title: string;
  description?: string | null;
  priority: WorkItemPriority;
  assigneeName?: string | null;
}
