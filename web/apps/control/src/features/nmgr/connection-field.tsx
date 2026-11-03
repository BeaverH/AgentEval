import { useState, type CSSProperties, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

export function ConnectionField({
  field,
  label,
  hint,
  value,
  configured,
  disabled,
  loading,
  multiline,
  onChange,
  children,
}: {
  field: string;
  label: string;
  hint: string;
  value: string;
  configured?: boolean | undefined;
  disabled: boolean;
  loading: boolean;
  multiline?: boolean;
  onChange: (value: string) => void;
  children?: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const id = `nm-connection-${field}`;
  const common = {
    id,
    "aria-label": label,
    value,
    autoComplete: "off",
    spellCheck: false,
    disabled,
    placeholder: configured ? "•••••••• · Leave blank to keep" : "Enter value",
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => onChange(event.target.value),
  };
  return (
    <div className="nm-connection-field">
      <div className="nm-connection-field-label">
        <label htmlFor={id}>{label}</label>
        <span className={configured ? "nm-connection-configured" : "nm-muted"}>
          {loading ? "Checking…" : configured ? "Configured" : "Not configured"}
        </span>
      </div>
      <div className="nm-connection-input">
        {multiline ? (
          <textarea
            {...common}
            rows={4}
            className="nm-connection-certificate"
            style={
              { WebkitTextSecurity: shown ? "none" : "disc" } as CSSProperties
            }
          />
        ) : (
          <Input {...common} type={shown ? "text" : "password"} />
        )}
        <button
          type="button"
          aria-label={`${shown ? "Hide" : "Show"} ${label}`}
          aria-pressed={shown}
          disabled={disabled}
          onClick={() => setShown(!shown)}
        >
          {shown ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      <p className="nm-muted">{hint}</p>
      {children}
    </div>
  );
}
