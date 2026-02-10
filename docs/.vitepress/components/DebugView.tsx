import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Copy, Check } from 'lucide-react';
import type { CooklangRecipe } from '../../../src/types';

interface DebugViewProps {
  recipe: CooklangRecipe | null;
}

export function DebugView({ recipe }: DebugViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (recipe) {
      navigator.clipboard.writeText(JSON.stringify(recipe, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!recipe) {
    return (
      <div className="h-full min-h-[400px] flex items-center justify-center p-8 text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <p className="mb-2">No recipe to display</p>
          <p className="text-sm">Enter a valid Cooklang recipe to see the parsed AST</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-[400px] flex flex-col bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Parsed AST
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-vp-orange dark:hover:text-vp-orange transition-colors"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy JSON'}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <JsonTree data={recipe} />
      </div>
    </div>
  );
}

interface JsonTreeProps {
  data: unknown;
  level?: number;
  keyName?: string;
}

function JsonTree({ data, level = 0, keyName }: JsonTreeProps) {
  const [isExpanded, setIsExpanded] = useState(level < 2);

  const indent = level * 16;

  if (data === null) {
    return (
      <span className="text-gray-500 dark:text-gray-400">
        {keyName && <span className="text-gray-700 dark:text-gray-300">"{keyName}": </span>}
        null
      </span>
    );
  }

  if (typeof data === 'boolean') {
    return (
      <span className="text-purple-600 dark:text-purple-400">
        {keyName && <span className="text-gray-700 dark:text-gray-300">"{keyName}": </span>}
        {data.toString()}
      </span>
    );
  }

  if (typeof data === 'number') {
    return (
      <span className="text-blue-600 dark:text-blue-400">
        {keyName && <span className="text-gray-700 dark:text-gray-300">"{keyName}": </span>}
        {data}
      </span>
    );
  }

  if (typeof data === 'string') {
    return (
      <span>
        {keyName && <span className="text-gray-700 dark:text-gray-300">"{keyName}": </span>}
        <span className="text-green-600 dark:text-green-400">"{data}"</span>
      </span>
    );
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return (
        <span className="text-gray-500 dark:text-gray-400">
          {keyName && <span className="text-gray-700 dark:text-gray-300">"{keyName}": </span>}
          []
        </span>
      );
    }

    return (
      <div style={{ marginLeft: indent }}>
        <span
          className="inline-flex items-center gap-1 cursor-pointer text-gray-700 dark:text-gray-300 hover:text-vp-orange"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {keyName && <span>"{keyName}": </span>}
          <span className="text-gray-500 dark:text-gray-400">[{data.length} items]</span>
        </span>
        {isExpanded && (
          <div className="mt-1">
            {data.map((item, index) => (
              <div key={index} className="pl-4 border-l border-gray-200 dark:border-gray-700">
                <JsonTree data={item} level={level + 1} />
                {index < data.length - 1 && <span className="text-gray-400">,</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);

    if (entries.length === 0) {
      return (
        <span className="text-gray-500 dark:text-gray-400">
          {keyName && <span className="text-gray-700 dark:text-gray-300">"{keyName}": </span>}
          {'{}'}
        </span>
      );
    }

    return (
      <div style={{ marginLeft: indent }}>
        <span
          className="inline-flex items-center gap-1 cursor-pointer text-gray-700 dark:text-gray-300 hover:text-vp-orange"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {keyName && <span>"{keyName}": </span>}
          <span className="text-gray-500 dark:text-gray-400">{'{...}'}</span>
        </span>
        {isExpanded && (
          <div className="mt-1">
            {entries.map(([key, value], index) => (
              <div key={key} className="pl-4 border-l border-gray-200 dark:border-gray-700">
                <JsonTree data={value} level={level + 1} keyName={key} />
                {index < entries.length - 1 && <span className="text-gray-400">,</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}
