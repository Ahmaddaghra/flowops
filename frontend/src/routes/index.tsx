import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { WorkItemsPage } from '@/features/work-items/pages/WorkItemsPage';
import { WorkItemDetailPage } from '@/features/work-items/pages/WorkItemDetailPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';
import { ProtectedRoute, PublicAuthRoute } from '@/features/auth/components/AuthRoutes';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route element={<PublicAuthRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/work-items" replace />} />
          <Route path="work-items" element={<WorkItemsPage />} />
          <Route path="work-items/:id" element={<WorkItemDetailPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
};
