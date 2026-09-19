import React, { useState, useEffect } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { workItemsApi } from '@/lib/api/workItems';
import { Server, Shield, Cpu } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const [healthStatus, setHealthStatus] = useState<'checking' | 'healthy' | 'unhealthy'>(
    'checking'
  );

  useEffect(() => {
    let isMounted = true;
    workItemsApi
      .getHealth()
      .then(() => {
        if (isMounted) setHealthStatus('healthy');
      })
      .catch(() => {
        if (isMounted) setHealthStatus('unhealthy');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1 (Vite Dev Proxy)';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings & System Status"
        description="Configuration defaults, runtime environment parameters, and subsystem connectivity."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-base">Backend API Connectivity</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-slate-600">Health Endpoint Status</span>
              {healthStatus === 'checking' && (
                <Badge variant="neutral">Checking...</Badge>
              )}
              {healthStatus === 'healthy' && (
                <Badge variant="success">Operational (200 OK)</Badge>
              )}
              {healthStatus === 'unhealthy' && (
                <Badge variant="danger">Disconnected</Badge>
              )}
            </div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-slate-600">Configured API Base</span>
              <span className="font-mono text-xs text-slate-800 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                {apiBase}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">API Protocol</span>
              <span className="text-slate-700 font-medium">REST / JSON (RFC 7807)</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-base">Frontend Architecture</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-slate-600">Framework</span>
              <span className="text-slate-700 font-medium">React 19 + TypeScript 5</span>
            </div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-slate-600">Build Tooling</span>
              <span className="text-slate-700 font-medium">Vite 6</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Design System</span>
              <span className="text-slate-700 font-medium">
                Tailwind CSS 3 (B2B Slate Tokens)
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-base">Phase 2 Operational Scope</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 space-y-2">
            <p>
              FlowOps Phase 2 establishes the core frontend foundation, typed API
              communication, responsive application shell, and reusable UI primitives.
            </p>
            <p className="text-xs text-slate-500">
              User identity authentication, team management, and organization settings
              will be integrated in Phase 4.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
