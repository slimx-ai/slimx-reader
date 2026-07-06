// Ports pdf.js's TextLayerBuilder selection guard for text layers we build with the core `TextLayer`
// API. A pdf.js text layer is a set of absolutely-positioned transparent spans; without this guard,
// dragging slightly below a line (into the paragraph gap or the margin) makes the browser snap the
// selection across the rest of the page. The fix (from pdfjs-dist web/text_layer_builder.js —
// `#bindMouse` / `#enableGlobalSelectionListener`) adds an `.endOfContent` element per layer and,
// via a single global `selectionchange` listener, toggles a `selecting` class and reparents
// `.endOfContent` next to the selection anchor, so the browser hit-tests against a full-cover
// unselectable element and extends the selection only to the nearest real text boundary.

const textLayers = new Map<HTMLElement, HTMLElement>();
let listenersInstalled = false;
let isPointerDown = false;
let prevRange: Range | null = null;
let isFirefox: boolean | undefined;

function reset(end: HTMLElement, textLayer: HTMLElement): void {
  textLayer.append(end);
  end.style.width = '';
  end.style.height = '';
  textLayer.classList.remove('selecting');
}

function onSelectionChange(): void {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) {
    textLayers.forEach(reset);
    return;
  }

  const active = new Set<HTMLElement>();
  for (let i = 0; i < selection.rangeCount; i += 1) {
    const range = selection.getRangeAt(i);
    for (const div of textLayers.keys()) {
      if (!active.has(div) && range.intersectsNode(div)) active.add(div);
    }
  }
  for (const [div, end] of textLayers) {
    if (active.has(div)) div.classList.add('selecting');
    else reset(end, div);
  }

  const firstDiv = textLayers.keys().next().value;
  if (!firstDiv) return;
  isFirefox ??= getComputedStyle(firstDiv).getPropertyValue('-moz-user-select') === 'none';
  if (isFirefox) return;

  const range = selection.getRangeAt(0);
  const modifyStart =
    prevRange != null &&
    (range.compareBoundaryPoints(Range.END_TO_END, prevRange) === 0 ||
      range.compareBoundaryPoints(Range.START_TO_END, prevRange) === 0);
  let anchor: Node = modifyStart ? range.startContainer : range.endContainer;
  if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode as Node;
  const anchorEl = anchor as HTMLElement;
  const parentTextLayer = anchorEl.parentElement?.closest<HTMLElement>('.pdf-viewer-text-layer');
  const end = parentTextLayer ? textLayers.get(parentTextLayer) : undefined;
  if (end && parentTextLayer) {
    end.style.width = parentTextLayer.style.width;
    end.style.height = parentTextLayer.style.height;
    anchorEl.parentElement?.insertBefore(end, modifyStart ? anchorEl : anchorEl.nextSibling);
  }
  prevRange = range.cloneRange();
}

function installGlobalListeners(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;
  document.addEventListener('pointerdown', () => {
    isPointerDown = true;
  });
  document.addEventListener('pointerup', () => {
    isPointerDown = false;
    textLayers.forEach(reset);
  });
  window.addEventListener('blur', () => {
    isPointerDown = false;
    textLayers.forEach(reset);
  });
  document.addEventListener('keyup', () => {
    if (!isPointerDown) textLayers.forEach(reset);
  });
  document.addEventListener('selectionchange', onSelectionChange);
}

/**
 * Attach the selection guard to a freshly-rendered pdf.js text layer. Idempotent and self-pruning:
 * text layers torn down by a scale change or virtualization are dropped on the next call.
 */
export function attachTextLayerSelectionGuard(textLayer: HTMLElement): void {
  installGlobalListeners();
  for (const div of textLayers.keys()) {
    if (!div.isConnected) textLayers.delete(div);
  }
  const end = document.createElement('div');
  end.className = 'endOfContent';
  textLayer.append(end);
  textLayers.set(textLayer, end);
  textLayer.addEventListener('mousedown', () => textLayer.classList.add('selecting'));
}
