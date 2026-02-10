import React from 'react';

interface RecipeEditorProps {
  source: string;
  onChange: (source: string) => void;
}

export function RecipeEditor({ source, onChange }: RecipeEditorProps) {
  const lineCount = source.split('\n').length;

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="flex-1 flex overflow-hidden">
        {/* Line Numbers */}
        <div className="hidden sm:flex flex-col py-4 px-2 text-right text-gray-400 dark:text-gray-600 text-sm font-mono select-none bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          {Array.from({ length: Math.max(lineCount, 1) }, (_, i) => (
            <div key={i} className="leading-6">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          value={source}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 p-4 text-sm font-mono leading-6 resize-none border-0 outline-none bg-transparent text-gray-800 dark:text-gray-200"
          spellCheck={false}
          placeholder="Type your Cooklang recipe here...

Example:
>> title: My Recipe
>> servings: 4

@flour{2%cups}
@eggs{2}

Mix the @flour and @eggs."
        />
      </div>

      {/* Status Bar */}
      <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
        {source.length} characters · {lineCount} lines
      </div>
    </div>
  );
}
