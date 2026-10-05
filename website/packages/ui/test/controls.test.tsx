import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Checkbox,
  ColorSwatches,
  ErrorSummary,
  FormField,
  Input,
  QuantityStepper,
  RadioGroup,
  SegmentedControl,
  Select,
  SizeSelector,
  Switch,
} from '../src';

describe('QuantityStepper', () => {
  it('increments and decrements within 1..10', () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={5} onChange={onChange} label="Quantity of Neon Koi" />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    expect(onChange).toHaveBeenLastCalledWith(6);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity' }));
    expect(onChange).toHaveBeenLastCalledWith(4);
  });

  it('cannot go below 1', () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={1} onChange={onChange} label="Qty" />);
    const minus = screen.getByRole('button', { name: 'Decrease quantity' });
    expect(minus).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(minus);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cannot go above 10', () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={10} onChange={onChange} label="Qty" />);
    const plus = screen.getByRole('button', { name: 'Increase quantity' });
    expect(plus).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(plus);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clamps a larger max to the contract and honours a smaller one (low stock)', () => {
    const onChange = vi.fn();
    const { rerender } = render(<QuantityStepper value={10} max={99} onChange={onChange} label="Qty" />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    expect(onChange).not.toHaveBeenCalled();
    rerender(<QuantityStepper value={3} max={3} onChange={onChange} label="Qty" />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    expect(onChange).not.toHaveBeenCalled();
    rerender(<QuantityStepper value={2} max={3} onChange={onChange} label="Qty" />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('shows an out-of-range value clamped, announces it politely, and names the group', () => {
    render(<QuantityStepper value={42} onChange={() => undefined} label="Quantity of Neon Koi" />);
    expect(screen.getByRole('group', { name: 'Quantity of Neon Koi' })).toBeInTheDocument();
    const out = screen.getByRole('status');
    expect(out).toHaveTextContent('10');
    expect(out).toHaveAttribute('aria-live', 'polite');
  });

  it('keeps focus on a bound button (aria-disabled instead of disabled)', () => {
    render(<QuantityStepper value={1} onChange={() => undefined} label="Qty" />);
    const minus = screen.getByRole('button', { name: 'Decrease quantity' });
    minus.focus();
    expect(document.activeElement).toBe(minus);
    expect(minus).not.toBeDisabled();
  });

  it('does nothing when disabled', () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={5} onChange={onChange} label="Qty" disabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

const COLORS = [
  { id: 1, name: 'Black', hex: '#111111' },
  { id: 2, name: 'Cream', hex: '#FFF4E6' },
  { id: 3, name: 'Coral', hex: '#FF7A59' },
];

describe('ColorSwatches accessibility', () => {
  it('is a named radiogroup whose radios are named by colour', () => {
    render(<ColorSwatches colors={COLORS} value={1} onChange={() => undefined} />);
    expect(screen.getByRole('radiogroup', { name: 'Colour' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Black' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Cream' })).not.toBeChecked();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('adds ", sold out" to the name of a struck-through colour, which stays selectable', () => {
    const onChange = vi.fn();
    render(<ColorSwatches colors={COLORS} value={1} onChange={onChange} soldOutIds={[2]} />);
    const radio = screen.getByRole('radio', { name: 'Cream, sold out' });
    expect(radio).not.toBeDisabled();
    fireEvent.click(radio);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('disables unavailable colours', () => {
    const onChange = vi.fn();
    render(<ColorSwatches colors={COLORS} value={1} onChange={onChange} disabledIds={[3]} />);
    const radio = screen.getByRole('radio', { name: 'Coral' });
    expect(radio).toBeDisabled();
  });

  it('shows the selected name as text next to the group', () => {
    render(<ColorSwatches colors={COLORS} value={3} onChange={() => undefined} />);
    expect(screen.getByTestId('swatch-caption')).toHaveTextContent('Colour: Coral');
  });

  it('swatches use the colour hex as background and have a 44px target', () => {
    const { container } = render(<ColorSwatches colors={COLORS} value={1} onChange={() => undefined} />);
    const dots = container.querySelectorAll<HTMLElement>('.swatch');
    expect(dots[0]?.style.backgroundColor).toBe('rgb(17, 17, 17)');
    expect(container.querySelector('label')?.className).toContain('h-11');
    expect(container.querySelector('label')?.className).toContain('w-11');
  });

  it('can be fully controlled by a parent', () => {
    function Harness() {
      const [v, setV] = useState<number | null>(1);
      return <ColorSwatches colors={COLORS} value={v} onChange={setV} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('radio', { name: 'Coral' }));
    expect(screen.getByRole('radio', { name: 'Coral' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Black' })).not.toBeChecked();
  });
});

describe('SizeSelector', () => {
  const sizes = [
    { id: 1, label: 'S' },
    { id: 2, label: 'M' },
    { id: 3, label: 'XL' },
  ];
  const variants = [
    { colorId: 1, sizeId: 1, inStock: true, remaining: null },
    { colorId: 1, sizeId: 2, inStock: true, remaining: 3 },
    { colorId: 1, sizeId: 3, inStock: false, remaining: null },
    { colorId: 2, sizeId: 1, inStock: false, remaining: null },
  ];

  it('marks sold-out sizes for the chosen colour and explains why in the name', () => {
    const onChange = vi.fn();
    render(<SizeSelector sizes={sizes} variants={variants} colorId={1} value={null} onChange={onChange} />);
    const xl = screen.getByRole('radio', { name: /^XL ?, sold out$/ });
    expect(xl).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(xl);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'S' }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('shows "{n} left" only when remaining is not null', () => {
    render(<SizeSelector sizes={sizes} variants={variants} colorId={1} value={2} onChange={() => undefined} />);
    expect(screen.getByText('3 left')).toBeInTheDocument();
    expect(screen.getAllByText(/left/)).toHaveLength(1);
    expect(screen.getByRole('radio', { name: /M/ })).toBeChecked();
  });

  it('recomputes availability when the colour changes', () => {
    render(<SizeSelector sizes={sizes} variants={variants} colorId={2} value={null} onChange={() => undefined} />);
    expect(screen.getByRole('radio', { name: /^S ?, sold out$/ })).toHaveAttribute('aria-disabled', 'true');
    // sizes with no variant row for that colour are unavailable
    expect(screen.getByRole('radio', { name: /^M ?, sold out$/ })).toBeInTheDocument();
  });
});

describe('FormField', () => {
  it('links label, hint and error to the control', () => {
    render(
      <FormField label="Phone" name="phone" hint="We call before delivery" error="Enter a valid number" required>
        <Input inputMode="tel" />
      </FormField>,
    );
    const input = screen.getByLabelText(/Phone/);
    expect(input).toHaveAttribute('id', 'field-phone');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-required', 'true');
    const described = (input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(described).toHaveLength(2);
    expect(document.getElementById(described[0] as string)).toHaveTextContent('Enter a valid number');
    expect(document.getElementById(described[1] as string)).toHaveTextContent('We call before delivery');
    expect(screen.getByText('(required)')).toBeInTheDocument();
  });

  it('is clean without an error', () => {
    render(
      <FormField label="Name" name="name">
        <Input />
      </FormField>,
    );
    const input = screen.getByLabelText('Name');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('supports a render prop for custom controls', () => {
    render(
      <FormField label="Notes" name="notes" error="Too long">
        {(a11y) => <textarea {...a11y} />}
      </FormField>,
    );
    expect(screen.getByLabelText('Notes')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('ErrorSummary', () => {
  it('lists errors with links that focus the field', () => {
    render(
      <>
        <ErrorSummary
          errors={[
            { fieldId: 'field-name', message: 'Enter your name' },
            { message: 'Your cart has a problem' },
          ]}
        />
        <input id="field-name" aria-label="Name" />
      </>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Please fix the following');
    fireEvent.click(screen.getByRole('link', { name: 'Enter your name' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));
    expect(screen.getByText('Your cart has a problem')).toBeInTheDocument();
  });

  it('renders nothing without errors', () => {
    const { container } = render(<ErrorSummary errors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Checkbox, Switch, RadioGroup, SegmentedControl', () => {
  it('Checkbox is a native checkbox with a label and supports indeterminate', () => {
    const onChange = vi.fn();
    render(<Checkbox label="Same as my phone number" indeterminate onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Same as my phone number' });
    expect((box as HTMLInputElement).indeterminate).toBe(true);
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalled();
  });

  it('Switch toggles, shows On/Off text and ignores clicks while loading', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Switch checked={false} onChange={onChange} label="Order emails" />);
    const sw = screen.getByRole('switch', { name: 'Order emails' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Off')).toBeInTheDocument();
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
    onChange.mockClear();
    rerender(<Switch checked onChange={onChange} label="Order emails" loading />);
    expect(screen.getByText('On')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-busy', 'true');
  });

  it('RadioGroup is a labelled radiogroup (card variant too)', () => {
    const onChange = vi.fn();
    render(
      <RadioGroup
        name="pack"
        legend="Pack"
        value="a"
        onChange={onChange}
        variant="card"
        options={[
          { value: 'a', label: 'Hoodie + 1', meta: '$45' },
          { value: 'b', label: 'Hoodie + 2', meta: '$80', description: 'Best value' },
          { value: 'c', label: 'Hoodie only', disabled: true },
        ]}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Pack' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Hoodie \+ 1/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Hoodie \+ 2/ }));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.getByRole('radio', { name: /Hoodie only/ })).toBeDisabled();
  });

  it('SegmentedControl is a radiogroup', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="View"
        value="2d"
        onChange={onChange}
        options={[
          { value: '2d', label: '2D' },
          { value: '3d', label: '3D' },
        ]}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '2D' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: '3D' }));
    expect(onChange).toHaveBeenCalledWith('3d');
  });
});

describe('Select', () => {
  const options = [
    { value: 'void', label: 'The Void', image: 'https://example.com/void.png' },
    { value: 'koi', label: 'Neon Koi', image: 'https://example.com/koi.png', hint: 'Popular' },
    { value: 'sold', label: 'Sold Out', disabled: true },
  ];

  it('renders custom trigger button with label and supports thumbnail picture', () => {
    render(<Select options={options} value="void" aria-label="Stimpie" onChange={() => {}} />);
    const button = screen.getByRole('button', { name: 'Stimpie' });
    expect(button).toBeInTheDocument();
    expect(within(button).getByText('The Void')).toBeInTheDocument();
    const img = button.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://example.com/void.png');
  });

  it('opens custom popover list on click, shows thumbnails and hints, selects option', () => {
    const onChange = vi.fn();
    render(<Select options={options} value="void" onChange={onChange} aria-label="Stimpie" />);
    const button = screen.getByRole('button', { name: 'Stimpie' });
    
    // Closed initially
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    
    // Open on click
    fireEvent.click(button);
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();
    expect(within(listbox).getByText('Popular')).toBeInTheDocument();

    // Click Neon Koi
    const koiOption = within(listbox).getByText('Neon Koi').closest('[role="option"]')!;
    expect(koiOption.querySelector('img')).toHaveAttribute('src', 'https://example.com/koi.png');
    fireEvent.click(koiOption);

    expect(onChange).toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('supports keyboard navigation: Enter opens and selects, Escape closes', () => {
    const onChange = vi.fn();
    render(<Select options={options} defaultValue="void" onChange={onChange} aria-label="Stimpie" />);
    const button = screen.getByRole('button', { name: 'Stimpie' });

    // Press ArrowDown to open
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    // Press Escape to close
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // Reopen with Enter and move down to koi
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onChange).toHaveBeenCalled();
  });

  it('does not select disabled options', () => {
    const onChange = vi.fn();
    render(<Select options={options} value="void" onChange={onChange} aria-label="Stimpie" />);
    fireEvent.click(screen.getByRole('button', { name: 'Stimpie' }));
    const listbox = screen.getByRole('listbox');
    const disabledOpt = within(listbox).getByText('Sold Out').closest('[role="option"]')!;
    fireEvent.click(disabledOpt);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('extracts options from children and works with placeholder', () => {
    render(
      <Select placeholder="Choose one" defaultValue="">
        <option value="1">One</option>
        <option value="2">Two</option>
      </Select>,
    );
    expect(screen.getByRole('button', { name: /Choose one/ })).toBeInTheDocument();
  });
});

