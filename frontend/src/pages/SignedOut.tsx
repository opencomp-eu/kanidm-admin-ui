import Icon from "../components/Icon";
import { usePageTitle } from "../hooks";

export default function SignedOut() {
  usePageTitle("Signed out");
  return (
    <div className="fullscreen-center">
      <div className="signed-out-card">
        <span className="brand-mark brand-mark-lg">
          <Icon name="shield" size={26} />
        </span>
        <h1>You're signed out</h1>
        <p>Thanks for keeping your organisation's accounts tidy. See you next time!</p>
        <a className="btn btn-primary" href="/api/auth/login">
          Sign in again
        </a>
      </div>
    </div>
  );
}
