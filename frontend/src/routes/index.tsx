import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { WorkItemsPage } from '@/features/work-items/pages/WorkItemsPage';
import { WorkItemDetailPage } from '@/features/work-items/pages/WorkItemDetailPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/work-items" replace />} />
        <Route path="work-items" element={<WorkItemsPage />} />
        <Route path="work-items/:id" element={<WorkItemDetailPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
};
