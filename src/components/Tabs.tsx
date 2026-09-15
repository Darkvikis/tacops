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

export function Tabs({ tabs, active, onChange }: TabsProps) {
  const navRef = useRef<HTMLElement>(null);
  const dragRef = useRef({ startX: 0, startScrollLeft: 0, moved: false });
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = (e: PointerEvent<HTMLElement>) => {
    const nav = navRef.current;
    if (!nav) return;
    dragRef.current = { startX: e.clientX, startScrollLeft: nav.scrollLeft, moved: false };
    setDragging(true);
    nav.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent<HTMLElement>) => {
    const nav = navRef.current;
    if (!nav || !dragging) return;
    const delta = e.clientX - dragRef.current.startX;
    if (Math.abs(delta) > 3) dragRef.current.moved = true;
    nav.scrollLeft = dragRef.current.startScrollLeft - delta;
  };

  const handlePointerUp = (e: PointerEvent<HTMLElement>) => {
    navRef.current?.releasePointerCapture(e.pointerId);
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
