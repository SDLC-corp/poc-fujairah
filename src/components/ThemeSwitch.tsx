import type { IconType } from 'react-icons'
import { FiMoon, FiSun, FiSunset } from 'react-icons/fi'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { setTheme, THEMES, type ThemeId } from '../features/ui/uiSlice'

const ICONS: Record<ThemeId, IconType> = {
  day: FiSun,
  dusk: FiSunset,
  night: FiMoon,
}

/**
 * Theme picker in the header.
 *
 * All three named and visible rather than one icon that cycles: which light the
 * console is in is something an operator sets once for the watch, and a control
 * that has to be clicked to discover its own options is the wrong shape for
 * that. The names are the light, not the colours — Day, Dusk, Night.
 *
 * Applying the choice is App's job — the attribute goes on the document root so
 * the login screen, which renders outside this header, is themed too.
 */
export default function ThemeSwitch() {
  const dispatch = useAppDispatch()
  const theme = useAppSelector((s) => s.ui.theme)

  return (
    <div className="theme-switch">
      <span className="theme-switch-label" id="theme-switch-label">
        Theme
      </span>
      <div className="theme-switch-options" role="radiogroup" aria-labelledby="theme-switch-label">
        {THEMES.map((t) => {
          const Icon = ICONS[t.id]
          const on = theme === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              title={t.hint}
              className={on ? 'active' : ''}
              onClick={() => dispatch(setTheme(t.id))}
            >
              <Icon size={14} />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
