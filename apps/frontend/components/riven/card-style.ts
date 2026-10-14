/** The Riven look for a shadcn Card: flat, with the page's own stroke and radius (the defaults are roomy and shadowed). */
export const CARD =
  "gap-0 rounded-[var(--rv-radius)] border-0 bg-[var(--rv-card)] py-0 shadow-none ring-1 ring-[var(--rv-stroke)]"

/** shadcn Tabs, `variant="line"`, in Riven's look: plain labels with a blue underline on the open one. */
export const TAB_LIST = "h-auto w-full justify-start gap-1 overflow-x-auto p-0"
export const TAB_TRIGGER =
  "h-11 flex-none px-3.5 text-[13.5px] font-semibold tracking-normal normal-case text-[var(--rv-ink-3)] after:bg-[var(--rv-blue)] data-active:text-[var(--rv-ink)] group-data-horizontal/tabs:after:inset-x-2 group-data-horizontal/tabs:after:bottom-0 hover:text-[var(--rv-ink)]"
/** The same, as filled blocks with an underline: the two-way switches on the perps pages. */
export const TAB_BLOCK =
  "rounded-none border-0 text-[var(--rv-ink-3)] tracking-wide data-active:bg-[rgba(124,196,232,0.16)] data-active:text-white group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-0 after:bg-[var(--rv-blue)] hover:text-[var(--rv-ink)]"

/** shadcn DialogContent in Riven's look: a flat card with a stroke, no padding (the dialog lays out its own sections). */
export const DIALOG =
  "block max-w-none gap-0 rounded-[var(--rv-radius)] border-0 bg-[var(--rv-card)] p-0 text-[var(--rv-ink)] shadow-none ring-1 ring-[var(--rv-stroke-strong)] sm:max-w-none"
/** A dialog title that is just a heading (the shadcn one is small caps). */
export const DIALOG_TITLE = "font-sans text-[20px] leading-tight font-extrabold tracking-normal normal-case"
