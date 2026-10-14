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
export const DIALOG_TITLE =
  "font-sans text-[20px] leading-tight font-extrabold tracking-normal normal-case"

/** The shadcn Input in Riven's field look (sunken, stroked, mono). Add sizes after it: `${RV_INPUT} h-11 px-3`. */
export const RV_INPUT =
  "rounded-[10px] border border-[color:var(--rv-stroke)] bg-[var(--rv-sunken)] font-mono text-[var(--rv-ink)] placeholder:text-[var(--rv-ink-3)] focus-visible:border-[color:var(--rv-blue)] focus-visible:ring-0"

/** The shadcn Slider in `rv-blue` (the default colour is the theme's primary). */
export const RV_SLIDER =
  "py-2 [&_[data-slot=slider-range]]:bg-[var(--rv-blue)] [&_[data-slot=slider-thumb]]:bg-[var(--rv-blue)] [&_[data-slot=slider-track]]:bg-white/15"

/** The shadcn Checkbox in Riven's look; `rv-blue` when checked. */
export const RV_CHECK =
  "size-4 rounded-[4px] border-[color:var(--rv-stroke-strong)] data-checked:border-[color:var(--rv-blue)] data-checked:bg-[var(--rv-blue)] data-checked:text-[var(--rv-on-blue)]"

/** A segmented control on the shadcn ToggleGroup: a sunken tray with one filled choice. Use `SEG` on the group, `SEG_ITEM` on items. */
export const SEG =
  "inline-flex w-fit shrink-0 items-center gap-0.5 rounded-lg border border-[color:var(--rv-stroke)] bg-[var(--rv-sunken)] p-0.5"
export const SEG_ITEM =
  "h-auto min-w-0 gap-1 rounded-md px-2.5 py-[5px] text-[12px] font-semibold tracking-normal normal-case text-[var(--rv-ink-2)] hover:bg-transparent hover:text-[var(--rv-ink)] data-[pressed]:bg-[var(--rv-blue)] data-[pressed]:text-[var(--rv-on-blue)] data-[pressed]:hover:bg-[var(--rv-blue)] data-[pressed]:hover:text-[var(--rv-on-blue)]"
