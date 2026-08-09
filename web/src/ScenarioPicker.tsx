export type ScenarioOption = {
  id: string
  name: string
  description?: string
}

export function ScenarioPicker({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: ScenarioOption[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div className="scenario-picker" role="group" aria-label="Choose a scenario">
      {options.map((option, index) => {
        const selected = option.id === value
        return (
          <button
            className={`scenario-choice ${selected ? 'is-selected' : ''}`}
            type="button"
            key={option.id}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(option.id)}
          >
            <span className="scenario-choice-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="scenario-choice-copy">
              <strong>{option.name}</strong>
              {option.description && <small>{option.description}</small>}
            </span>
          </button>
        )
      })}
      {options.length === 0 && <span className="scenario-picker-empty">Loading scenarios…</span>}
    </div>
  )
}
