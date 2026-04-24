import React, { useEffect, useId, useRef } from "react";

/**
 * Accessible modal dialog primitive (WCAG SC 1.3.1, 2.1.2, 2.4.3, 4.1.2).
 *
 * - role="dialog" + aria-modal="true" + aria-labelledby/aria-describedby
 * - Focus trap: Tab/Shift-Tab cycle within the dialog
 * - Escape key closes (unless `disableEscape`)
 * - Focus restore to the opener on close
 * - Initial focus to the first tabbable element or `initialFocusRef`
 */
export interface DialogProps {
  /** Controls visibility. */
  open: boolean;
  /** Called when the user dismisses via backdrop, Escape, or close action. */
  onClose: () => void;
  /** Required — the accessible name of the dialog (rendered as <h2>). */
  title: string;
  /** Optional secondary text; if provided, wired via aria-describedby. */
  description?: string;
  /** Disable Escape-to-close (e.g., modal has unsaved work). */
  disableEscape?: boolean;
  /** Disable backdrop-click-to-close. */
  disableBackdropClose?: boolean;
  /** Optional ref for the element to focus on open. */
  initialFocusRef?: React.RefObject<HTMLElement>;
  /** Tailwind class override for the panel wrapper. */
  panelClassName?: string;
  children: React.ReactNode;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function Dialog({
  open,
  onClose,
  title,
  description,
  disableEscape,
  disableBackdropClose,
  initialFocusRef,
  panelClassName = "bg-card rounded-2xl max-w-md w-full p-4 shadow-2xl max-h-[90vh] overflow-y-auto",
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  // Focus management + keyboard trap
  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    if (!panel) return;

    // Initial focus
    const target =
      initialFocusRef?.current ??
      panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      panel;
    // Ensure the panel itself can receive focus as a last resort.
    if (target === panel && !panel.hasAttribute("tabindex")) {
      panel.setAttribute("tabindex", "-1");
    }
    target.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !disableEscape) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusables = panel!.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Restore focus to the element that opened the dialog.
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open, onClose, disableEscape, initialFocusRef]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
      onClick={disableBackdropClose ? undefined : (e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={panelClassName}
      >
        <h2 id={titleId} className="text-base font-extrabold text-fg mb-2">
          {title}
        </h2>
        {description && (
          <p id={descId} className="text-sm text-muted-fg mb-3">
            {description}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
