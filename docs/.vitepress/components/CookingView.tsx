import React from 'react';
import { Clock, Users, ChefHat, Utensils, AlertTriangle } from 'lucide-react';
import type { CooklangRecipe, RecipeTimer, RecipeStepItem } from 'cooklang-parse';

// SectionContent is not exported from the package, so define it locally
type SectionContent =
  | { type: 'step'; items: RecipeStepItem[] }
  | { type: 'text'; value: string };

interface CookingViewProps {
  recipe: CooklangRecipe | null;
}

export function CookingView({ recipe }: CookingViewProps) {
  if (!recipe) {
    return (
      <div className="h-full min-h-[400px] flex items-center justify-center p-8 text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <ChefHat size={48} className="mx-auto mb-4 opacity-50" />
          <p className="mb-2">No recipe to display</p>
          <p className="text-sm">Enter a valid Cooklang recipe to see the cooking view</p>
        </div>
      </div>
    );
  }

  const { metadata, ingredients, cookware, timers, sections, warnings } = recipe;

  return (
    <div className="h-full min-h-[400px] overflow-auto bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {metadata?.title ? String(metadata.title) : 'Untitled Recipe'}
        </h1>
        <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
          {metadata?.servings && (
            <span className="flex items-center gap-1.5">
              <Users size={16} />
              {String(metadata.servings)} servings
            </span>
          )}
          {metadata?.prep_time && (
            <span className="flex items-center gap-1.5">
              <Clock size={16} />
              Prep: {String(metadata.prep_time)}
            </span>
          )}
          {metadata?.cook_time && (
            <span className="flex items-center gap-1.5">
              <Clock size={16} />
              Cook: {String(metadata.cook_time)}
            </span>
          )}
          {metadata?.source && (
            <span className="flex items-center gap-1.5">
              <Clock size={16} />
              Source: {String(metadata.source)}
            </span>
          )}
          {timers.length > 0 && (
            <span className="flex items-center gap-1.5">
              <Clock size={16} />
              {timers.length} timer{timers.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Warnings */}
      {warnings && warnings.length > 0 && (
        <div className="px-6 pt-4 space-y-2">
          {warnings.map((w, idx) => (
            <div
              key={idx}
              className="flex gap-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30"
            >
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-yellow-600 dark:text-yellow-400" />
              <div className="text-sm">
                <p className="text-yellow-800 dark:text-yellow-200">{w.message}</p>
                {w.help && (
                  <pre className="mt-1.5 text-xs text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-900/20 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                    {w.help}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Ingredients */}
        {ingredients.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <Utensils size={20} className="text-vp-orange" />
              Ingredients
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ingredients.map((ing, idx) => (
                <li
                  key={idx}
                  className="flex items-center gap-2 p-2 rounded-md bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/20"
                >
                  <span className="w-5 h-5 rounded border-2 border-vp-orange/50 flex-shrink-0" />
                  <span className="text-gray-800 dark:text-gray-200">
                    {ing.alias || ing.name}
                    {ing.quantity !== undefined && ing.quantity !== '' && (
                      <span className="text-gray-500 dark:text-gray-400 ml-1">
                        — {ing.quantity}{ing.units && ` ${ing.units}`}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Cookware */}
        {cookware.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <ChefHat size={20} className="text-blue-500" />
              Equipment
            </h2>
            <div className="flex flex-wrap gap-2">
              {cookware.map((cw, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm border border-blue-100 dark:border-blue-900/30"
                >
                  {cw.alias || cw.name}
                  {cw.quantity !== undefined && cw.quantity !== '' && (
                    <span className="text-blue-500 dark:text-blue-400 ml-1">
                      ({cw.quantity})
                    </span>
                  )}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Sections with Steps */}
        {sections.map((section, sectionIdx) => (
          <section key={sectionIdx}>
            {section.name ? (
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 pb-2 border-b-2 border-vp-orange/30">
                {section.name}
              </h2>
            ) : (
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Instructions
              </h2>
            )}

            <div className="space-y-4">
              {section.content.map((item, itemIdx) => (
                <SectionContentComponent
                  key={itemIdx}
                  content={item}
                  stepNumber={getStepNumber(sections, sectionIdx, itemIdx)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

interface SectionContentComponentProps {
  content: SectionContent;
  stepNumber: number;
}

function SectionContentComponent({ content, stepNumber }: SectionContentComponentProps) {
  if (content.type === 'step') {
    return <RecipeStepComponent items={content.items} stepNumber={stepNumber} />;
  }

  if (content.type === 'text') {
    return (
      <p className="text-gray-700 dark:text-gray-300">
        {content.value}
      </p>
    );
  }

  return null;
}

interface RecipeStepComponentProps {
  items: RecipeStepItem[];
  stepNumber: number;
}

function RecipeStepComponent({ items, stepNumber }: RecipeStepComponentProps) {
  const [isChecked, setIsChecked] = React.useState(false);

  const stepTimers = items.filter((item): item is RecipeTimer => item.type === 'timer');

  return (
    <div
      className={`flex gap-4 p-4 rounded-lg border transition-all ${
        isChecked
          ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-60'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      }`}
    >
      <button
        onClick={() => setIsChecked(!isChecked)}
        className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors ${
          isChecked
            ? 'bg-vp-orange border-vp-orange text-white'
            : 'border-gray-300 dark:border-gray-600 hover:border-vp-orange'
        }`}
      >
        {isChecked ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
            {stepNumber}
          </span>
        )}
      </button>

      <div className="flex-1">
        <p className={`text-gray-800 dark:text-gray-200 leading-relaxed ${isChecked ? 'line-through' : ''}`}>
          <StepItems items={items} />
        </p>

        {/* Timers in step */}
        {stepTimers.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {stepTimers.map((timer, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 text-xs font-medium border border-yellow-200 dark:border-yellow-900/30"
              >
                <Clock size={12} />
                {timer.name || 'Timer'}: {timer.quantity}{timer.units && ` ${timer.units}`}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface StepItemsProps {
  items: RecipeStepItem[];
}

function StepItems({ items }: StepItemsProps) {
  return (
    <>
      {items.map((item, idx) => {
        if (item.type === 'text') {
          return <span key={idx}>{item.value}</span>;
        }

        if (item.type === 'ingredient') {
          return (
            <span
              key={idx}
              className="font-medium text-vp-orange"
              title={`${item.name}${item.quantity !== undefined && item.quantity !== '' ? ` (${item.quantity}${item.units ? ` ${item.units}` : ''})` : ''}`}
            >
              {item.alias || item.name}
            </span>
          );
        }

        if (item.type === 'cookware') {
          return (
            <span
              key={idx}
              className="font-medium text-blue-600 dark:text-blue-400"
            >
              {item.alias || item.name}
            </span>
          );
        }

        if (item.type === 'timer') {
          return (
            <span
              key={idx}
              className="font-medium text-yellow-600 dark:text-yellow-400"
            >
              {item.name || `${item.quantity}${item.units ? ` ${item.units}` : ''}`}
            </span>
          );
        }

        return null;
      })}
    </>
  );
}

function getStepNumber(sections: { content: SectionContent[] }[], sectionIdx: number, itemIdx: number): number {
  let count = 0;
  for (let s = 0; s <= sectionIdx; s++) {
    for (let i = 0; i < sections[s].content.length; i++) {
      if (s === sectionIdx && i === itemIdx) {
        return count + 1;
      }
      if (sections[s].content[i].type === 'step') {
        count++;
      }
    }
  }
  return count + 1;
}
