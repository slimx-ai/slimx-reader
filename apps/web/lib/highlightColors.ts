// The highlight color palette, shared by the selection toolbar, the highlight recolor toolbar, and
// both renderers (markdown <mark> and the PDF overlay). Annotations store the color *key* in their
// `color` field (null = the default yellow); rendering resolves the key to concrete fills here so the
// exact shades live in one place.

export type HighlightColorKey = 'yellow' | 'green' | 'blue' | 'pink' | 'orange';

export type HighlightColor = {
  key: HighlightColorKey;
  label: string;
  swatch: string; // solid dot shown in the palette
  mark: string; // background for a markdown <mark>
  pdf: string; // background for a PDF overlay box
};

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { key: 'yellow', label: 'Yellow', swatch: '#f5c518', mark: 'rgba(250, 204, 21, 0.34)', pdf: 'rgba(250, 204, 21, 0.55)' },
  { key: 'green', label: 'Green', swatch: '#37b26b', mark: 'rgba(52, 199, 120, 0.32)', pdf: 'rgba(52, 199, 120, 0.5)' },
  { key: 'blue', label: 'Blue', swatch: '#3f8cff', mark: 'rgba(63, 140, 255, 0.28)', pdf: 'rgba(63, 140, 255, 0.5)' },
  { key: 'pink', label: 'Pink', swatch: '#f45d9c', mark: 'rgba(244, 93, 156, 0.28)', pdf: 'rgba(244, 93, 156, 0.5)' },
  { key: 'orange', label: 'Orange', swatch: '#f5843c', mark: 'rgba(245, 132, 60, 0.32)', pdf: 'rgba(245, 132, 60, 0.5)' },
];

export const DEFAULT_HIGHLIGHT_COLOR: HighlightColorKey = 'yellow';

const BY_KEY = new Map<string, HighlightColor>(HIGHLIGHT_COLORS.map((c) => [c.key, c]));

/** Resolve a stored color key (or null) to a palette entry, defaulting to the first (yellow). */
export function highlightColor(key: string | null | undefined): HighlightColor {
  return (key ? BY_KEY.get(key) : undefined) ?? HIGHLIGHT_COLORS[0];
}
