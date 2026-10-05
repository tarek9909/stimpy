import { useRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BottomSheet, ConfirmModal, Drawer, Modal, TabPanel, Tabs, type UrlParamAdapter } from '../src';

const TABS = [
  { id: 'hoodies', label: 'Hoodies' },
  { id: 'stimpies', label: 'Stimpies', count: 12 },
  { id: 'packs', label: 'Packs', disabled: true },
  { id: 'drops', label: 'Drops' },
];

function TabsHarness({ initial = 'hoodies', onChange }: { initial?: string; onChange?: (id: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <Tabs
      aria-label="Shop sections"
      tabs={TABS}
      value={value}
      onChange={(id) => {
        setValue(id);
        onChange?.(id);
      }}
    >
      <TabPanel tabId="hoodies">Hoodie list</TabPanel>
      <TabPanel tabId="stimpies">Stimpie list</TabPanel>
      <TabPanel tabId="drops">Drop list</TabPanel>
    </Tabs>
  );
}

describe('Tabs ARIA and keyboard', () => {
  it('exposes tablist, tabs, selected state and a linked panel', () => {
    render(<TabsHarness />);
    expect(screen.getByRole('tablist', { name: 'Shop sections' })).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    const selected = screen.getByRole('tab', { name: 'Hoodies' });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(selected).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: /Stimpies/ })).toHaveAttribute('tabindex', '-1');
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Hoodie list');
    expect(selected.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(selected.id);
  });

  it('ArrowRight and ArrowLeft move focus and selection, skipping disabled tabs and wrapping', () => {
    const onChange = vi.fn();
    render(<TabsHarness onChange={onChange} />);
    const hoodies = screen.getByRole('tab', { name: 'Hoodies' });
    hoodies.focus();
    fireEvent.keyDown(hoodies, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('stimpies');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Stimpies/ }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Stimpie list');

    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('drops'); // "Packs" is disabled
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('hoodies'); // wraps
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('drops'); // wraps backwards
  });

  it('Home and End jump to the first and last enabled tab', () => {
    const onChange = vi.fn();
    render(<TabsHarness initial="stimpies" onChange={onChange} />);
    const current = screen.getByRole('tab', { name: /Stimpies/ });
    fireEvent.keyDown(current, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('drops');
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('hoodies');
  });

  it('ignores unrelated keys and does not select disabled tabs by click', () => {
    const onChange = vi.fn();
    render(<TabsHarness onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Hoodies' }), { key: 'a' });
    fireEvent.click(screen.getByRole('tab', { name: 'Packs' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the count badge as text', () => {
    render(<TabsHarness />);
    expect(screen.getByRole('tab', { name: /Stimpies/ })).toHaveTextContent('12');
  });

  it('keeps the active tab in the URL via the adapter and adopts a valid URL tab on mount', () => {
    const store = new Map<string, string>([['tab', 'drops']]);
    const adapter: UrlParamAdapter = {
      get: (n) => store.get(n) ?? null,
      set: (n, v) => void store.set(n, v),
    };
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState('hoodies');
      return (
        <Tabs
          aria-label="Shop"
          tabs={TABS}
          value={value}
          urlParam="tab"
          urlAdapter={adapter}
          onChange={(id) => {
            setValue(id);
            onChange(id);
          }}
        />
      );
    }
    render(<Harness />);
    expect(onChange).toHaveBeenCalledWith('drops');
    expect(screen.getByRole('tab', { name: 'Drops' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Hoodies' }));
    expect(store.get('tab')).toBe('hoodies');
  });

  it('ignores an invalid or disabled tab id in the URL', () => {
    const adapter: UrlParamAdapter = { get: () => 'packs', set: () => undefined };
    const onChange = vi.fn();
    render(<Tabs aria-label="x" tabs={TABS} value="hoodies" onChange={onChange} urlParam="tab" urlAdapter={adapter} />);
    expect(onChange).not.toHaveBeenCalled();
  });
});

function ModalHarness({
  onClose,
  closeOnEsc,
  extra,
}: {
  onClose?: () => void;
  closeOnEsc?: boolean;
  extra?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      <a href="#outside">Outside link</a>
      <Modal
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        title="Edit address"
        closeOnEsc={closeOnEsc}
      >
        <input aria-label="Street" />
        <button>Save</button>
        {extra ? <a href="#x">Docs</a> : null}
      </Modal>
    </div>
  );
}

function AsyncTriggerModalHarness() {
  const [open, setOpen] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <div>
      <button
        ref={triggerRef}
        disabled={disabled}
        onClick={() => {
          setDisabled(true);
          setOpen(true);
        }}
      >
        Open after refresh
      </button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setDisabled(false);
        }}
        title="Choose size"
        returnFocusRef={triggerRef}
      >
        <button>Small</button>
      </Modal>
    </div>
  );
}

describe('Modal', () => {
  afterEach(() => {
    document.body.removeAttribute('style');
  });

  it('is a labelled modal dialog, focuses the first control (not the close button), and locks scroll', () => {
    render(<ModalHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit address' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(document.activeElement).toBe(screen.getByLabelText('Street'));
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('traps Tab inside: last wraps to first, Shift+Tab from first wraps to last', () => {
    render(<ModalHarness />);
    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    trigger.focus();
    fireEvent.click(trigger);
    const street = screen.getByLabelText('Street');
    const save = screen.getByRole('button', { name: 'Save' });
    const close = screen.getByRole('button', { name: 'Close' });

    // focus order in DOM: Close, Street, Save
    save.focus();
    fireEvent.keyDown(save, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(save);

    street.focus();
    fireEvent.keyDown(street, { key: 'Tab' }); // middle: browser default, not intercepted
    expect(document.activeElement).toBe(street);
  });

  it('pulls focus back in when it has escaped the dialog', () => {
    render(<ModalHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    (document.body as HTMLElement).focus();
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: 'Tab' });
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape and returns focus to the trigger', () => {
    const onClose = vi.fn();
    render(<ModalHarness onClose={onClose} />);
    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe('');
  });

  it('returns focus to its explicit trigger when opening disabled that trigger', () => {
    render(<AsyncTriggerModalHarness />);
    const trigger = screen.getByRole('button', { name: 'Open after refresh' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(trigger).toBeDisabled();
    expect(screen.getByRole('dialog', { name: 'Choose size' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(trigger).toBeEnabled();
    expect(document.activeElement).toBe(trigger);
  });

  it('does not close on Escape when closeOnEsc is false (destructive action in flight)', () => {
    const onClose = vi.fn();
    render(<ModalHarness onClose={onClose} closeOnEsc={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes from the X button and from the scrim', () => {
    const onClose = vi.fn();
    render(<ModalHarness onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    const scrim = document.querySelector('[data-stimpy-overlay] [aria-hidden="true"].bg-ink\\/40') as HTMLElement;
    fireEvent.mouseDown(scrim);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('makes the rest of the page inert while open and restores it afterwards', () => {
    render(<ModalHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    const appRoot = screen.getByRole('link', { name: 'Outside link', hidden: true }).closest('div')?.parentElement;
    expect(appRoot).toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(appRoot).not.toHaveAttribute('inert');
  });

  it('removes its portal when closed', () => {
    render(<ModalHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    expect(document.querySelector('[data-stimpy-overlay]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.querySelector('[data-stimpy-overlay]')).toBeNull();
  });
});

describe('Drawer, BottomSheet, ConfirmModal', () => {
  it('Drawer and BottomSheet are dialogs with the same rules', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Drawer open onClose={onClose} title="Cart">
        <button>Checkout</button>
      </Drawer>,
    );
    expect(screen.getByRole('dialog', { name: 'Cart' })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Checkout' }));
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    rerender(
      <BottomSheet open onClose={onClose} title="Choose size">
        <button>M</button>
      </BottomSheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Choose size' })).toBeInTheDocument();
  });

  it('ConfirmModal destructive focuses Cancel first and locks while busy', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <ConfirmModal open title="Delete Neon Koi?" text="This cannot be undone." confirmLabel="Delete" tone="destructive" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    expect(screen.getByRole('alertdialog', { name: 'Delete Neon Koi?' })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    rerender(
      <ConfirmModal open busy title="Delete Neon Koi?" confirmLabel="Delete" tone="destructive" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('aria-busy', 'true');
    // clicking Delete while busy does nothing
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('stacked modals: Escape closes only the top one', () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    render(
      <>
        <Modal open onClose={closeA} title="A">
          <button>a</button>
        </Modal>
        <Modal open onClose={closeB} title="B">
          <button>b</button>
        </Modal>
      </>,
    );
    act(() => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });
    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).not.toHaveBeenCalled();
  });
});
