import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ScenarioPicker } from './ScenarioPicker'

const options = [
  { id: 'traffic-spike', name: 'Sudden traffic spike', description: 'Traffic jumps above capacity.' },
  { id: 'slow-dependency', name: 'Slow dependency', description: 'Capacity drops underneath steady traffic.' },
]

describe('ScenarioPicker', () => {
  it('selects a preset as a button instead of opening a dropdown', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ScenarioPicker options={options} value="traffic-spike" onChange={onChange} />)

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Slow dependency/ }))

    expect(onChange).toHaveBeenCalledWith('slow-dependency')
  })
})
