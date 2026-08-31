import { useAppDispatch, useAppSelector } from '../app/hooks'
import { selectAllowedTabs } from '../features/roles/selectors'
import { setTab } from '../features/ui/uiSlice'
import Icon from './Icon'
import { TABS } from './tabs'

export default function TabRail() {
  const dispatch = useAppDispatch()
  const active = useAppSelector((s) => s.ui.activeTab)
  const allowed = useAppSelector(selectAllowedTabs)

  return (
    <nav className="tab-rail" aria-label="Screens">
      {/* Hidden rather than disabled: a rail full of screens the operator can
          never open is noise, and a greyed row invites a support call asking
          why. What the role cannot reach simply is not offered. */}
      {TABS.filter((t) => !t.offRail && allowed.has(t.id)).map((tab) => (
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
