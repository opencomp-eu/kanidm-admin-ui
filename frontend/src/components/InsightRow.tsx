import { Link } from "react-router-dom";
import type { Insight } from "../insights";
import Icon from "./Icon";

const PREVIEW_LIMIT = 8;

export default function InsightRow({ insight }: { insight: Insight }) {
  const shown = insight.items.slice(0, PREVIEW_LIMIT);
  const hidden = insight.items.length - shown.length;
  return (
    <details className={`insight insight-${insight.tone}`}>
      <summary>
        <span className="insight-icon">
          <Icon name={insight.icon} size={18} />
        </span>
        <span className="insight-text">
          <span className="insight-title">{insight.title}</span>
          <span className="insight-description">{insight.description}</span>
        </span>
        <span className="insight-toggle">
          Review
          <Icon name="chevronRight" size={16} />
        </span>
      </summary>
      <ul className="insight-items">
        {shown.map((item) => (
          <li key={item.key}>
            <Link to={item.to}>
              <span>{item.label}</span>
              {item.sublabel && <span className="muted">{item.sublabel}</span>}
              <Icon name="chevronRight" size={14} />
            </Link>
          </li>
        ))}
        {hidden > 0 && <li className="insight-more muted">and {hidden} more</li>}
      </ul>
    </details>
  );
}
