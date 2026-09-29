import { apiClient } from './client';
import { WorkItem } from '@/types/workItems';

export const workItemsApi = {
  list: async (): Promise<WorkItem[]> => {
    return apiClient<WorkItem[]>('/work-items');
  },

  getById: async (id: string): Promise<WorkItem> => {
    return apiClient<WorkItem>(`/work-items/${id}`);
  },

  getHealth: async (): Promise<{ status: string }> => {
    return apiClient<{ status: string }>('/health');
  },
};
