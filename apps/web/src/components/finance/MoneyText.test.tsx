import { decimal, Money } from '@mizan/domain'
import { act, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { usePrivacy } from '../../lib/privacy'
import { renderWithProviders, setLanguage } from '../../test/render'
import { MoneyText } from './MoneyText'
import { DeltaText, PercentText } from './PercentText'

const tl = (amount: string) => Money.of(amount, 'TRY')

afterEach(async () => {
  await setLanguage('en')
  localStorage.clear()
})

describe('MoneyText', () => {
  it('formats for the UI language', async () => {
    const { rerender } = renderWithProviders(<MoneyText value={tl('50000.5')} />)
    expect(screen.getByText('₺50,000.50')).toBeInTheDocument()
    await act(() => setLanguage('tr'))
    rerender(<MoneyText value={tl('50000.5')} />)
    expect(screen.getByText('₺50.000,50')).toBeInTheDocument()
  })

  it('supports whole units and explicit signs', () => {
    renderWithProviders(
      <>
        <MoneyText value={tl('1060200.4')} fractionDigits="none" />
        <MoneyText value={tl('4000')} signDisplay="always" />
      </>,
    )
    expect(screen.getByText('₺1,060,200')).toBeInTheDocument()
    expect(screen.getByText('+₺4,000.00')).toBeInTheDocument()
  })

  it('colours by tone only when the tone asks for it', () => {
    renderWithProviders(
      <>
        <MoneyText value={tl('-5')} />
        <MoneyText value={tl('-6')} tone="overspent" />
        <MoneyText value={tl('7')} tone="overspent" />
        <MoneyText value={tl('8')} tone="signed" />
        <MoneyText value={tl('0')} tone="signed" />
      </>,
    )
    expect(screen.getByText('−₺5.00')).not.toHaveClass('text-negative')
    expect(screen.getByText('−₺6.00')).toHaveClass('text-negative')
    expect(screen.getByText('₺7.00')).not.toHaveClass('text-positive')
    expect(screen.getByText('₺8.00')).toHaveClass('text-positive')
    expect(screen.getByText('₺0.00')).toHaveAttribute('data-sign', 'zero')
  })

  it('masks amounts in privacy mode with an accessible label', async () => {
    let setHide: (hide: boolean) => void = () => {}
    function Capture() {
      setHide = usePrivacy().setHideAmounts
      return null
    }
    renderWithProviders(
      <>
        <Capture />
        <MoneyText value={tl('50000')} />
      </>,
    )
    act(() => setHide(true))
    expect(screen.queryByText('₺50,000.00')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Amount hidden')).toBeInTheDocument()
    expect(localStorage.getItem('mizan.hideAmounts')).toBe('true')
  })
})

describe('PercentText and DeltaText', () => {
  it('formats percentages per locale', async () => {
    renderWithProviders(<PercentText value={decimal('0.125')} fractionDigits={1} />)
    expect(screen.getByText('12.5%')).toBeInTheDocument()
  })

  it('colours deltas, flipping for spending', () => {
    renderWithProviders(
      <>
        <DeltaText value={decimal('0.035')} />
        <DeltaText value={decimal('0.12')} invert />
        <DeltaText value={decimal('0')} />
      </>,
    )
    expect(screen.getByText('+3.5%')).toHaveClass('text-positive')
    expect(screen.getByText('+12.0%')).toHaveClass('text-negative')
    expect(screen.getByText('0.0%')).not.toHaveClass('text-positive')
  })
})
