import {
  AlertCircle,
  Database,
  MessageCircle,
  Search,
  Settings,
  WandSparkles,
  Zap,
} from 'lucide-react';
import './SetupRequiredNotice.css';

const FEATURE_COPY = {
  chat: {
    Icon: MessageCircle,
    title: 'Chat is not ready yet',
    description: 'Finish the required provider setup before chatting with your knowledge base.',
  },
  search: {
    Icon: Search,
    title: 'Search is not ready yet',
    description: 'Finish the required provider setup before searching your knowledge base.',
  },
};

const SETTING_COPY = {
  'Embedding model': {
    Icon: Zap,
    label: 'Embedding model',
  },
  LLM: {
    Icon: WandSparkles,
    label: 'Generation model',
  },
  VectorDB: {
    Icon: Database,
    label: 'Vector database',
  },
};

export default function SetupRequiredNotice({ feature, missingSettings = [] }) {
  const { Icon, title, description } = FEATURE_COPY[feature] ?? FEATURE_COPY.search;
  const visibleMissingSettings = missingSettings.length > 0
    ? missingSettings
    : ['Embedding model', 'LLM', 'VectorDB'];

  return (
    <div className={`setup-required-notice setup-required-notice--${feature}`}>
      <div className="setup-required-notice__card" role="status">
        <div className="setup-required-notice__icon" aria-hidden="true">
          <Icon size={34} />
        </div>
        <h2>{title}</h2>
        <p>{description}</p>

        <ul className="setup-required-notice__list" aria-label="Missing settings">
          {visibleMissingSettings.map((setting) => {
            const settingCopy = SETTING_COPY[setting] ?? {
              Icon: AlertCircle,
              label: setting,
            };
            const SettingIcon = settingCopy.Icon;

            return (
              <li key={setting} className="setup-required-notice__item">
                <SettingIcon size={16} />
                <span>{settingCopy.label}</span>
              </li>
            );
          })}
        </ul>

        <a className="setup-required-notice__cta" href="#settings">
          <Settings size={18} />
          <span>Open Settings</span>
        </a>
      </div>
    </div>
  );
}
