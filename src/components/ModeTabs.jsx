import { MessageCircle, Search, Upload } from 'lucide-react';
import './ModeTabs.css';

const tabs = [
  { key: 'chat', label: 'Chat', icon: MessageCircle },
  { key: 'search', label: 'Search', icon: Search },
  { key: 'upload', label: 'Upload', icon: Upload },
];

export default function ModeTabs({
  activeMode,
  disabledModes = [],
  onModeChange,
  onNavigateToSettings,
}) {
  return (
    <nav className="mode-tabs" aria-label="Main modes">
      {tabs.map(({ key, label, icon: Icon }) => {
        const isActive = activeMode === key;
        const isDisabled = disabledModes.includes(key);
        return (
          <button
            key={key}
            className={`mode-tab${isActive ? ' is-active' : ''}${isDisabled ? ' is-disabled' : ''}`}
            aria-pressed={isActive}
            aria-disabled={isDisabled}
            title={isDisabled ? 'Finish setup in Settings' : undefined}
            onClick={() => {
              if (isDisabled) {
                onNavigateToSettings?.();
                return;
              }

              onModeChange(key);
            }}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
