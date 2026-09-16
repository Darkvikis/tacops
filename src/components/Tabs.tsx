import { useRef, useState, type MouseEvent, type PointerEvent, type WheelEvent } from "react";

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

const DRAG_THRESHOLD_PX = 6;

export function Tabs({ tabs, active, onChange }: TabsProps) {
  const navRef = useRef<HTMLElement>(null);
  const dragRef = useRef({ pointerId: -1, startX: 0, startScrollLeft: 0, dragging: false, moved: false });
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = (e: PointerEvent<HTMLElement>) => {
    const nav = navRef.current;
    if (!nav) return;
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startScrollLeft: nav.scrollLeft, dragging: false, moved: false };
  };

  const handlePointerMove = (e: PointerEvent<HTMLElement>) => {
    const nav = navRef.current;
    const drag = dragRef.current;
    if (!nav || drag.pointerId !== e.pointerId) return;
    const delta = e.clientX - drag.startX;
    if (!drag.dragging) {
      if (Math.abs(delta) < DRAG_THRESHOLD_PX) return;
      drag.dragging = true;
      drag.moved = true;
      setDragging(true);
      nav.setPointerCapture(e.pointerId);
    }
    nav.scrollLeft = drag.startScrollLeft - delta;
  };

  const handlePointerUp = (e: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (drag.pointerId !== e.pointerId) return;
    if (drag.dragging) navRef.current?.releasePointerCapture(e.pointerId);
    drag.dragging = false;
    drag.pointerId = -1;
    setDragging(false);
  };

  const handleClickCapture = (e: MouseEvent<HTMLElement>) => {
    if (dragRef.current.moved) {
      e.stopPropagation();
      e.preventDefault();
      dragRef.current.moved = false;
    }
  };

  const handleWheel = (e: WheelEvent<HTMLElement>) => {
    const nav = navRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      nav.scrollLeft += e.deltaY;
    }
  };

  return (
    <nav
      ref={navRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClickCapture={handleClickCapture}
      onWheel={handleWheel}
      className={`scrollbar-none mt-4 flex w-full select-none gap-1 overflow-x-auto border-b-2 border-black/10 dark:border-white/15 ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      }`}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`-mb-0.5 flex-shrink-0 whitespace-nowrap rounded-t-md border border-b-0 px-3 py-1.5 ${
            active === tab.id
              ? "border-black/10 bg-neutral-100 opacity-100 dark:border-white/15 dark:bg-neutral-800"
              : "border-transparent opacity-60"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
