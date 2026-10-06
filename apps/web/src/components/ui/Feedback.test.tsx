import { decimal, Money } from '@mizan/domain'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { BudgetProgress, ProgressBar } from '../finance/Progress'
import { ConfirmDialog } from './ConfirmDialog'

function ConfirmHarness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Delete…
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this transaction?"
        description="You can undo this."
        confirmLabel="Delete"
        destructive
        onConfirm={onConfirm}
      />
    </>
  )
}

describe('ConfirmDialog', () => {
  it('confirms and closes', async () => {
    const onConfirm = vi.fn()
    renderWithProviders(<ConfirmHarness onConfirm={onConfirm} />)
    await userEvent.click(screen.getByText('Delete…'))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this transaction?' })
    expect(dialog).toHaveAccessibleDescription('You can undo this.')
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cancels with Escape without confirming', async () => {
    const onConfirm = vi.fn()
    renderWithProviders(<ConfirmHarness onConfirm={onConfirm} />)
    await userEvent.click(screen.getByText('Delete…'))
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})

describe('Progress', () => {
  it('clamps and reports progress without floats', () => {
    renderWithProviders(
      <>
        <ProgressBar value={decimal('0.3333')} label="A" />
        <ProgressBar value={decimal('1.5')} label="B" />
        <ProgressBar value={decimal('-1')} label="C" />
      </>,
    )
    expect(screen.getByRole('progressbar', { name: 'A' })).toHaveAttribute('aria-valuenow', '33')
    expect(screen.getByRole('progressbar', { name: 'B' })).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByRole('progressbar', { name: 'C' })).toHaveAttribute('aria-valuenow', '0')
  })

  it('shows budget status from props and the pace marker', () => {
    renderWithProviders(
      <BudgetProgress
        name="Personal care"
        spent={Money.of('610', 'TRY')}
        limit={Money.of('500', 'TRY')}
        status="over"
        expectedPace={decimal('0.71')}
        note="₺110 over"
      />,
    )
    expect(screen.getByRole('progressbar', { name: 'Personal care: over budget' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    )
    expect(screen.getByTestId('pace-marker')).toHaveStyle({ left: '71%' })
    expect(screen.getByText('₺110 over')).toHaveClass('text-negative')
  })

  it('handles a zero limit', () => {
    renderWithProviders(
      <BudgetProgress
        name="Gifts"
        spent={Money.of('0', 'TRY')}
        limit={Money.of('0', 'TRY')}
        status="onPace"
        expectedPace={decimal('0.5')}
        note="—"
      />,
    )
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })
})
