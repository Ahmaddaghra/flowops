import React from 'react';
import { Link } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-4">
        <FileQuestion className="h-8 w-8" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">
        404 - Page Not Found
      </h1>
      <p className="text-sm text-slate-500 max-w-md mb-6 leading-relaxed">
        The page or resource you requested does not exist or has been moved.
      </p>
      <Link
        to="/work-items"
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-transparent bg-slate-900 px-4 text-sm font-medium text-white shadow-sm transition-colors duration-150 hover:bg-slate-800 active:bg-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 focus-visible:ring-offset-2 select-none"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Return to Work Items
      </Link>
    </div>
  );
};
