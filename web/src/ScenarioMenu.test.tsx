import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ScenarioMenu } from './ScenarioMenu'

const options = [
  { id: 'traffic-spike', name: 'Sudden traffic spike', description: 'Traffic jumps above capacity.' },
  { id: 'slow-dependency', name: 'Slow dependency', description: 'Capacity drops underneath steady traffic.' },
]

describe('ScenarioMenu', () => {
  it('supports keyboard selection with a native-feeling listbox interaction', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ScenarioMenu options={options} value="traffic-spike" onChange={onChange} />)

    const trigger = screen.getByRole('button', { name: 'Scenario' })
    await user.click(trigger)
    expect(screen.getByRole('listbox', { name: 'Available scenarios' })).toBeInTheDocument()

    await user.keyboard('{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenCalledWith('slow-dependency')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
