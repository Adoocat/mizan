import { Money } from '@mizan/domain'
import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axeViolations, renderWithProviders, setLanguage } from '../../test/render'
import { CurrencyInput } from './CurrencyInput'

function Harness({
  initial = null,
  onChange,
  allowNegative,
  required,
}: {
  initial?: Money | null
  onChange?: (value: Money | null) => void
  allowNegative?: boolean
  required?: boolean
}) {
  const [value, setValue] = useState<Money | null>(initial)
  return (
    <>
      <CurrencyInput
        label="Amount"
        value={value}
        allowNegative={allowNegative}
        required={required}
        onChange={(next) => {
          setValue(next)
          onChange?.(next)
        }}
      />
      <output data-testid="value">{value ? value.toDto().amount : 'null'}</output>
      <button type="button" onClick={() => setValue(Money.of('99', 'TRY'))}>
        external
      </button>
    </>
  )
}

const input = () => screen.getByLabelText('Amount')
const current = () => screen.getByTestId('value').textContent

afterEach(async () => {
  await setLanguage('en')
})

describe('CurrencyInput', () => {
  it.each([
    ['en', '50,000.50', '50000.50'],
    ['en', '50.000,50', '50000.50'],
    ['tr', '50.000,50', '50000.50'],
    ['tr', '12,5', '12.50'],
    ['tr', '1.500', '1500.00'],
    ['en', '1.500', '1.50'],
  ] as const)('in %s parses %j as %s', async (language, typed, expected) => {
    await setLanguage(language)
    renderWithProviders(<Harness />)
    await userEvent.type(input(), typed)
    expect(current()).toBe(expected)
  })

  it('evaluates sums and previews the result while typing', async () => {
    renderWithProviders(<Harness />)
    await userEvent.type(input(), '1200+350')
    expect(current()).toBe('1550.00')
    expect(screen.getByText('= ₺1,550.00')).toBeInTheDocument()
  })

  it('normalizes the text on blur', async () => {
    await setLanguage('tr')
    renderWithProviders(<Harness />)
    await userEvent.type(input(), '1200+350,5')
    await userEvent.tab()
    expect(input()).toHaveValue('1.550,50')
  })

  it('emits null for invalid input and shows the error only after blur', async () => {
    const onChange = vi.fn()
    renderWithProviders(<Harness onChange={onChange} />)
    await userEvent.type(input(), '12abc')
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(input()).not.toHaveAttribute('aria-invalid')
    await userEvent.tab()
    expect(input()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Enter a number like 1.250,50 or 1,250.50.')).toBeInTheDocument()
    expect(input()).toHaveAccessibleDescription('Enter a number like 1.250,50 or 1,250.50.')
  })

  it('rejects more decimals than the currency has', async () => {
    renderWithProviders(<Harness />)
    await userEvent.type(input(), '1.005')
    await userEvent.tab()
    expect(current()).toBe('null')
    expect(screen.getByText('Use at most 2 decimal places.')).toBeInTheDocument()
  })

  it('rejects negative amounts unless allowed', async () => {
    const { unmount } = renderWithProviders(<Harness />)
    await userEvent.type(input(), '-50')
    await userEvent.tab()
    expect(current()).toBe('null')
    expect(screen.getByText("The amount can't be negative.")).toBeInTheDocument()
    unmount()

    renderWithProviders(<Harness allowNegative />)
    await userEvent.type(input(), '-50')
    expect(current()).toBe('-50.00')
  })

  it('treats an empty field as no value, and as an error only when required', async () => {
    const { unmount } = renderWithProviders(<Harness initial={Money.of('5', 'TRY')} />)
    await userEvent.clear(input())
    await userEvent.tab()
    expect(current()).toBe('null')
    expect(input()).not.toHaveAttribute('aria-invalid')
    unmount()

    renderWithProviders(<Harness required />)
    await userEvent.click(input())
    await userEvent.tab()
    expect(screen.getByText('Enter an amount.')).toBeInTheDocument()
  })

  it('shows the initial value and follows external changes', async () => {
    renderWithProviders(<Harness initial={Money.of('1250.5', 'TRY')} />)
    expect(input()).toHaveValue('1,250.50')
    await act(async () => {
      await userEvent.click(screen.getByText('external'))
    })
    expect(input()).toHaveValue('99.00')
  })

  it('uses a decimal keyboard on mobile and never a number input', () => {
    renderWithProviders(<Harness />)
    expect(input()).toHaveAttribute('type', 'text')
    expect(input()).toHaveAttribute('inputmode', 'decimal')
  })

  it('has no accessibility violations, valid or invalid', async () => {
    const { container } = renderWithProviders(<Harness />)
    expect(await axeViolations(container)).toEqual([])
    await userEvent.type(input(), 'abc')
    await userEvent.tab()
    expect(await axeViolations(container)).toEqual([])
  })
})
