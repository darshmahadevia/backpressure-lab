import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export type ScenarioOption = {
  id: string
  name: string
  description?: string
}

export function ScenarioMenu({
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
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selectedIndex = Math.max(0, options.findIndex((option) => option.id === value))
  const selected = options[selectedIndex]

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [open])

  useEffect(() => {
    if (open) setHighlighted(selectedIndex)
  }, [open, selectedIndex])

  const choose = (index: number) => {
    const option = options[index]
    if (!option) return
    onChange(option.id)
    setHighlighted(index)
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const move = (direction: 1 | -1) => {
    if (options.length === 0) return
    setOpen(true)
    setHighlighted((current) => (current + direction + options.length) % options.length)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setOpen(true)
      setHighlighted(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setOpen(true)
      setHighlighted(Math.max(0, options.length - 1))
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) choose(highlighted)
      else {
        setOpen(true)
        setHighlighted(selectedIndex)
      }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
    } else if (event.key === 'Tab' && open) {
      setOpen(false)
    }
  }

  return (
    <div className={`scenario-menu ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button
        className="scenario-trigger"
        type="button"
        ref={triggerRef}
        aria-label="Scenario"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="scenario-options"
        aria-activedescendant={open && options[highlighted] ? `scenario-option-${options[highlighted].id}` : undefined}
        disabled={disabled || options.length === 0}
        onClick={() => {
          setHighlighted(selectedIndex)
          setOpen((current) => !current)
        }}
        onKeyDown={handleKeyDown}
      >
        <span>
          <strong>{selected?.name ?? 'Loading scenarios…'}</strong>
          {selected?.description && <small>{selected.description}</small>}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && options.length > 0 && (
        <div className="scenario-options" id="scenario-options" role="listbox" aria-label="Available scenarios">
          {options.map((option, index) => (
            <div
              className={`scenario-option ${index === highlighted ? 'is-highlighted' : ''} ${option.id === value ? 'is-selected' : ''}`}
              id={`scenario-option-${option.id}`}
              key={option.id}
              role="option"
              aria-selected={option.id === value}
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => choose(index)}
            >
              <span>
                <strong>{option.name}</strong>
                {option.description && <small>{option.description}</small>}
              </span>
              {option.id === value && <Check size={16} aria-hidden="true" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
