import { apiClient } from './client';
import { WorkItem, CreateWorkItemRequest } from '@/types/workItems';

export const workItemsApi = {
  list: async (): Promise<WorkItem[]> => {
    return apiClient<WorkItem[]>('/work-items');
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

  getHealth: async (): Promise<{ status: string }> => {
    return apiClient<{ status: string }>('/health');
  },
};
