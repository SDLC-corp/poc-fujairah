/**
 * One end of the replay window.
 *
 * A list, not a time input. `<input type="time">` cannot be relied on here: in
 * a 12-hour locale it carries a third segment for AM/PM, and until every
 * segment is filled the control reports an empty string — so an operator who
 * types 01 and 00 and moves on has, as far as the page is concerned, entered
 * nothing at all. There is no event that says "they meant 13:00"; the value is
 * simply never delivered.
 *
 * The data makes the list the better answer anyway. The recording is a fixed
 * span sampled at a fixed interval, so the times that can be chosen are a
 * short, known set — and offering exactly those means the operator can see what
 * the file covers, cannot enter a time outside it, and cannot half-enter one.
 */
export default function ReplayTimeField({
  label,
  /** `HH:MM` from the store, or null for "not chosen". */
  value,
  /** Every selectable time, in order, as `HH:MM`. */
  options,
  /** Shown for the null option — "Start" or "End" of the recording. */
  placeholder,
  onCommit,
}: {
  label: string
  value: string | null
  options: string[]
  placeholder: string
  onCommit: (value: string | null) => void
}) {
  return (
    <select
      className="pb-select pb-time"
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onCommit(e.target.value || null)}
    >
      <option value="">{placeholder}</option>
      {options.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
      {/* A stored time that is not on the list still has to be showable, or the
          control would silently misreport what is in force. */}
      {value && !options.includes(value) && <option value={value}>{value}</option>}
    </select>
  )
}
