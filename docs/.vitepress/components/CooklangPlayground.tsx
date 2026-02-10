import React, { useState, useCallback, useEffect } from 'react';
import { ChefHat, Bug, AlertCircle, PanelLeft } from 'lucide-react';
import { RecipeEditor } from './RecipeEditor';
import { DebugView } from './DebugView';
import { CookingView } from './CookingView';
import { EXAMPLE_RECIPE } from './exampleRecipe';
import { parseCooklang } from 'cooklang-parse';
import type { CooklangRecipe } from 'cooklang-parse';

interface ParseError {
  message: string;
  line?: number;
  column?: number;
}

export function CooklangPlayground() {
  const [source, setSource] = useState(EXAMPLE_RECIPE.trim());
  const [activeTab, setActiveTab] = useState<'cook' | 'debug'>('cook');
  const [recipe, setRecipe] = useState<CooklangRecipe | null>(null);
  const [error, setError] = useState<ParseError | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    const parseRecipe = () => {
      try {
        const result = parseCooklang(source);
        setRecipe(result);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown parsing error';
        setError({ message });
        setRecipe(null);
      }
    };

    parseRecipe();
  }, [source, isClient]);

  const handleSourceChange = useCallback((newSource: string) => {
    setSource(newSource);
  }, []);

  if (!isClient) {
    return (
      <div className="h-[600px] flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="text-gray-500 dark:text-gray-400">Loading playground...</div>
      </div>
    );
  }

  return (
    <div className="cooklang-playground rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Cooklang Playground
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isSidebarExpanded
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            title={isSidebarExpanded ? 'Collapse editor' : 'Expand editor'}
          >
            <PanelLeft size={16} />
          </button>
          <button
            onClick={() => setActiveTab('cook')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'cook'
                ? 'bg-vp-orange text-white'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <ChefHat size={16} />
            Cook
          </button>
          <button
            onClick={() => setActiveTab('debug')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'debug'
                ? 'bg-vp-orange text-white'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <Bug size={16} />
            Debug
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          <AlertCircle size={16} />
          <span>{error.message}</span>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row">
        {/* Editor */}
        <div
          className={`border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 transition-all duration-300 ${
            isSidebarExpanded
              ? 'w-full lg:w-[45%]'
              : 'w-full lg:w-0 overflow-hidden opacity-0'
          }`}
        >
          <RecipeEditor source={source} onChange={handleSourceChange} />
        </div>

        {/* Output */}
        <div
          className={`min-h-[400px] lg:min-h-[600px] transition-all duration-300 ${
            isSidebarExpanded ? 'w-full lg:w-[55%]' : 'w-full'
          }`}
        >
          {activeTab === 'cook' ? (
            <CookingView recipe={recipe} />
          ) : (
            <DebugView recipe={recipe} />
          )}
        </div>
      </div>
    </div>
  );
}
