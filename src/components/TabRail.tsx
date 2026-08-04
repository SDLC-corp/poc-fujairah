import { useAppDispatch, useAppSelector } from '../app/hooks'
import { setTab } from '../features/ui/uiSlice'
import Icon from './Icon'
import { TABS } from './tabs'

export default function TabRail() {
  const dispatch = useAppDispatch()
  const active = useAppSelector((s) => s.ui.activeTab)

  return (
    <nav className="tab-rail" aria-label="Screens">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={active === tab.id ? 'active' : ''}
          title={tab.label}
          aria-label={tab.label}
          aria-current={active === tab.id}
          onClick={() => dispatch(setTab(tab.id))}
        >
          <Icon name={tab.icon} size={19} />
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
