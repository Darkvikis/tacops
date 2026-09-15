import { useEffect, type ReactNode } from "react";

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ onClose, children }: ModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-4 text-left shadow-lg dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
