import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

/** Touch and pen: press and hold this long to pick a tile up, so a swipe still scrolls the page. */
const HOLD_MS = 300;
/** Mouse: how far it moves before a press becomes a drag (a shorter move is still a click). */
const SLOP_PX = 6;
/** If the saved order never shows up (the save failed and was rolled back), stop showing the dragged one. */
const SETTLE_MS = 3000;

/** `keys` with `key` moved to where `target` is. */
export function moveKey(keys: string[], key: string, target: string): string[] {
  const out = keys.filter((k) => k !== key);
  out.splice(out.indexOf(target) + (keys.indexOf(target) > keys.indexOf(key) ? 1 : 0), 0, key);
  return out;
}

interface Drag {
  key: string;
  /** The live order of the dragged tile's group. */
  order: string[];
  /** Dropped and waiting for the new order to come back in `groups`. */
  dropped?: boolean;
}

/**
 * Drag to reorder with pointer events (mouse, touch and pen). The tiles move while dragging;
 * `onSort` is called once, on drop, with the group's new order.
 * `groups`: the keys of each set of tiles that can be reordered among themselves, in their current order.
 */
export function useDragSort(groups: string[][], onSort: (keys: string[]) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  // The click that ends a mouse drag shouldn't also open the tile.
  const swallowClick = useRef(false);

  // Once dropped, keep showing the new order until the data has it (a save can take a moment to land).
  const current = drag?.dropped ? groups.some((g) => g.join() === drag.order.join()) : false;
  useEffect(() => {
    if (!drag?.dropped) return;
    if (current) return setDrag(null);
    const timer = setTimeout(() => setDrag(null), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [drag, current]);

  function start(e: ReactPointerEvent, key: string) {
    const group = groups.find((g) => g.includes(key));
    if (!group || group.length < 2 || !e.isPrimary || e.button !== 0) return;
    const { pointerId, clientX: x0, clientY: y0 } = e;
    const hold = e.pointerType !== 'mouse';
    let order: string[] | null = null; // set once the tile is picked up

    const pickUp = () => {
      order = group;
      setDrag({ key, order });
    };
    const timer = hold ? setTimeout(pickUp, HOLD_MS) : undefined;

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!order) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) <= SLOP_PX) return;
        if (hold) return end(); // moved before the hold: a scroll, not a drag
        pickUp();
      }
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-sort-key]')?.dataset.sortKey;
      if (over && over !== key && order!.includes(over)) {
        order = moveKey(order!, key, over);
        setDrag({ key, order });
      }
    };
    // While a tile is held on a touch screen, the finger moves it instead of scrolling the page.
    const noScroll = (ev: TouchEvent) => order && ev.preventDefault();
    const drop = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const moved = order && order.join() !== group.join() ? order : null;
      if (order) {
        swallowClick.current = true;
        setTimeout(() => (swallowClick.current = false));
      }
      end(moved);
    };
    const cancel = (ev: PointerEvent) => ev.pointerId === pointerId && end();

    function end(moved: string[] | null = null) {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', drop);
      window.removeEventListener('pointercancel', cancel);
      document.removeEventListener('touchmove', noScroll);
      if (moved) {
        setDrag({ key, order: moved, dropped: true });
        onSort(moved);
      } else setDrag(null);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', drop);
    window.addEventListener('pointercancel', cancel);
    document.addEventListener('touchmove', noScroll, { passive: false });
  }

  /** `items` in the order they are being dragged into. */
  function arrange<T>(items: T[], keyOf: (item: T) => string): T[] {
    if (!drag) return items;
    const byKey = new Map(items.map((i) => [keyOf(i), i]));
    let next = 0;
    return items.map((i) => (drag.order.includes(keyOf(i)) ? (byKey.get(drag.order[next++]) ?? i) : i));
  }

  /** Props for a tile. */
  const handle = (key: string) => ({
    'data-sort-key': key,
    onPointerDown: (e: ReactPointerEvent) => start(e, key),
    onClickCapture: (e: MouseEvent) => {
      if (!swallowClick.current) return;
      e.preventDefault();
      e.stopPropagation();
    },
    // No native drag of the thumbnail image, and no long-press menu while holding a tile.
    onDragStart: (e: MouseEvent) => e.preventDefault(),
    onContextMenu: (e: MouseEvent) => drag && e.preventDefault(),
  });

  return { dragging: drag && !drag.dropped ? drag.key : null, arrange, handle };
}
