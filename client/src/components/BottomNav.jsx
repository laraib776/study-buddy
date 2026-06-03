import { assets } from '../utils/constants.js';
import SafeImage from './SafeImage.jsx';

export default function BottomNav({ items, activeScreen, onNavigate, icons, iconSize }) {
  return (
    <footer className="bottom-nav">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`bottom-item ${activeScreen === item.id ? 'active' : ''}`}
          onClick={() => onNavigate(item.id)}
        >
          <SafeImage src={icons?.[item.icon] || assets[item.icon]} alt={item.label} width={iconSize} height={iconSize} fallback={item.icon} />
          <span>{item.label}</span>
        </button>
      ))}
    </footer>
  );
}
