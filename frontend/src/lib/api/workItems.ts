import { apiClient } from './client';
import {
  AssignWorkItemRequest,
  Category,
  ChangeStatusRequest,
  CreateWorkItemRequest,
  PagedResult,
  UpdateWorkItemRequest,
  WorkItem,
  WorkItemActivity,
  WorkItemQuery,
} from '@/types/workItems';

const queryString = (query: WorkItemQuery = {}): string => {
  const params = new URLSearchParams();
  const values = {
    page: 1,
    pageSize: 20,
    sort: 'createdAt',
    direction: 'desc',
    ...query,
  };

  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.set(key, String(value));
    }
  });

  return params.toString();
};

export const workItemsApi = {
  list: async (query: WorkItemQuery = {}): Promise<PagedResult<WorkItem>> => {
    return apiClient<PagedResult<WorkItem>>(`/work-items?${queryString(query)}`);
  },

  getById: async (id: string): Promise<WorkItem> => {
    return apiClient<WorkItem>(`/work-items/${id}`);
  },

  create: async (data: CreateWorkItemRequest): Promise<WorkItem> => {
    return apiClient<WorkItem>('/work-items', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: UpdateWorkItemRequest): Promise<WorkItem> => {
    return apiClient<WorkItem>(`/work-items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  changeStatus: async (id: string, request: ChangeStatusRequest): Promise<WorkItem> => {
    return apiClient<WorkItem>(`/work-items/${id}/status`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  assign: async (id: string, request: AssignWorkItemRequest): Promise<WorkItem> => {
    return apiClient<WorkItem>(`/work-items/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  getActivity: async (id: string): Promise<WorkItemActivity[]> => {
    return apiClient<WorkItemActivity[]>(`/work-items/${id}/activity`);
  },

  getHealth: async (): Promise<{ status: string }> => {
    return apiClient<{ status: string }>('/health', { auth: false });
  },
};

export const categoriesApi = {
  list: async (): Promise<Category[]> => apiClient<Category[]>('/categories'),
};
