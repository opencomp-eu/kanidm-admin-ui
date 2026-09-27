import Icon from "./Icon";

export default function SearchInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  label = placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  label?: string;
}) {
  return (
    <div className="search-input">
      <Icon name="search" size={16} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoFocus={autoFocus}
      />
    </div>
  );
}
