import PropTypes from 'prop-types';
import './NotificationBanner.css';

export default function NotificationBanner({ message = '', visible = false }) {
  if (!visible || !message) {
    return null;
  }

  return (
    <div className="notification-banner" role="status" aria-live="polite">
      {message}
    </div>
  );
}

NotificationBanner.propTypes = {
  message: PropTypes.string,
  visible: PropTypes.bool,
};
