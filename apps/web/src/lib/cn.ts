import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge must know our custom type scale (styles.css @theme). Otherwise it reads
 * `text-caption` as a colour and drops it when `text-ink-3` follows.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'display-xl',
        'display-l',
        'display-figure',
        'page-display',
        'panel-value',
        'panel-title',
        'lead',
        'eyebrow',
        'hero',
        'value-l',
        'value-m',
        'page-title',
        'value-s',
        'card-title',
        'body',
        'label',
        'caption',
        'mono',
      ],
    },
  },
})

/** Joins class names and resolves conflicting Tailwind utilities (shadcn/ui convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
