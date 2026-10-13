import type { Environment } from "../api/types";

const ENVIRONMENTS: { value: Environment; label: string }[] = [
  { value: "prod", label: "Prod" },
  { value: "qa", label: "QA" },
];

interface EnvironmentToggleProps {
  value: Environment;
  onChange: (value: Environment) => void;
}

export function EnvironmentToggle({ value, onChange }: EnvironmentToggleProps) {
  return (
    <div className="my-2 flex justify-center gap-4">
      {ENVIRONMENTS.map((env) => (
        <label key={env.value} className="flex cursor-pointer items-center gap-1">
          <input type="radio" name="environment" checked={value === env.value} onChange={() => onChange(env.value)} />
          {env.label}
        </label>
      ))}
    </div>
  );
}
