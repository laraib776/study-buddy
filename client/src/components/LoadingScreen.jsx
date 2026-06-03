import { assets } from '../utils/constants.js';
import SafeImage from './SafeImage.jsx';

export default function LoadingScreen({ message }) {
  return (
    <div className="loading-screen">
      <SafeImage src={assets.girl} alt="Loading companion" className="loading-image" fallback="star" />
      <div className="loading-message">{message}</div>
      <div className="loading-dots">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
