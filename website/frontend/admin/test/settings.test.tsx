import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SettingsPage from '../src/pages/settings';
import { emptyPage, forceDesktop } from './orderFixtures';
import { setSession } from '../src/auth/session';
import { json, stubFetch, TestApp, testQueryClient } from './helpers';

let restore: () => void = () => undefined;
beforeEach(() => forceDesktop());
afterEach(() => restore());

const AREA = { id: 3, name: 'Jounieh', feeCents: 500, estDays: 2, active: true };

const SETTINGS_FIXTURE = {
  business: {
    name: 'Stimpy',
    whatsappNumber: null,
    supportEmail: 'hello@stimpy.local',
    instagramUrl: null,
    timezone: 'Asia/Beirut',
  },
  orders: {
    numberPrefix: 'STP',
    firstNumber: 1001,
    stockHoldHours: 12,
    autoExpireUnconfirmed: false,
    lowStockThreshold: 10,
    hardwareCostCents: 100,
  },
  email: {
    enabled: true,
    senderName: 'Stimpy',
    senderAddress: 'orders@stimpy.local',
    replyTo: 'hello@stimpy.local',
    footerText: 'Stimpy hoodie',
    smtpHost: null,
    smtpPort: null,
    smtpUser: null,
    smtpPassword: null,
    smtpSecure: false,
    campaignRecipientCap: 200,
  },
  notifications: {
    founderEmail: null,
    onNewOrder: true,
    onLowStock: true,
  },
};

function renderSettings(entries = ['/settings'], extra: Record<string, (req: Request) => Response | Promise<Response>> = {}) {
  const qc = testQueryClient();
  setSession(qc, {
    user: { id: 1, email: 'admin@stimpy.local', role: 'OWNER', name: 'Admin' },
    expiresAt: null,
  });
  const stub = stubFetch({
    'GET /api/v1/admin/settings': () => json(SETTINGS_FIXTURE),
    'GET /api/v1/admin/settings/delivery': () => json({ defaultFeeCents: 300, estimateText: '2-3 working days' }),
    'GET /api/v1/admin/areas': () => json(emptyPage([AREA, { id: 4, name: 'Beirut', feeCents: null, estDays: null, active: true }], 100)),
    ...extra,
  });
  restore = stub.restore;
  render(<TestApp routes={[{ path: '/settings', element: <SettingsPage /> }]} entries={entries} client={qc} />);
  return stub;
}

describe('Settings page with Delivery fees tab', () => {
  it('renders all settings tabs including Delivery fees', async () => {
    renderSettings();
    expect(screen.getByRole('tab', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Business' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Delivery fees' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Customer email' })).toBeInTheDocument();
  });

  it('navigating to ?tab=delivery displays the delivery fees and areas', async () => {
    renderSettings(['/settings?tab=delivery']);
    expect(await screen.findByDisplayValue('3.00')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('2-3 working days')).toBeInTheDocument();
    expect(screen.getByText('Jounieh')).toBeInTheDocument();
    expect(screen.getByText('$5.00')).toBeInTheDocument();
    expect(screen.getByText('Beirut')).toBeInTheDocument();
    expect(screen.getByText('Uses default fee')).toBeInTheDocument();
  });

  it('clicking the Delivery fees tab switches tab and displays delivery settings', async () => {
    renderSettings();
    const deliveryTab = screen.getByRole('tab', { name: 'Delivery fees' });
    fireEvent.click(deliveryTab);
    expect(await screen.findByDisplayValue('3.00')).toBeInTheDocument();
    expect(screen.getByText('Jounieh')).toBeInTheDocument();
  });

  it('saves updated default delivery fee from settings', async () => {
    let savedBody: unknown = null;
    renderSettings(['/settings?tab=delivery'], {
      'PATCH /api/v1/admin/settings/delivery': async (req) => {
        savedBody = await req.json();
        return json({ defaultFeeCents: 450, estimateText: '1-2 working days' });
      },
    });

    const feeInput = await screen.findByDisplayValue('3.00');
    fireEvent.change(feeInput, { target: { value: '4.50' } });
    const estInput = screen.getByDisplayValue('2-3 working days');
    fireEvent.change(estInput, { target: { value: '1-2 working days' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save delivery settings' }));

    await waitFor(() => {
      expect(savedBody).toEqual({ defaultFeeCents: 450, estimateText: '1-2 working days' });
    });
  });

  it('customer email tab saves the SMTP connection (HANDOFF "Configurable Email SMTP": host, port, username, password, TLS)', async () => {
    let savedPatch: unknown = null;
    renderSettings(['/settings?tab=customer-email'], {
      'PATCH /api/v1/admin/settings': async (req) => {
        savedPatch = await req.json();
        return json({
          ...SETTINGS_FIXTURE,
          email: {
            ...SETTINGS_FIXTURE.email,
            senderAddress: 'founder@gmail.com',
            smtpHost: 'smtp.gmail.com',
            smtpPort: 587,
            smtpUser: 'founder@gmail.com',
            smtpPassword: 'abcd-efgh-ijkl',
            smtpSecure: false,
          },
        });
      },
    });

    expect(await screen.findByLabelText(/Sender display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Sender email/i)).toBeInTheDocument();
    // Unconfigured SMTP starts from the Gmail STARTTLS defaults.
    expect(screen.getByLabelText(/^SMTP server/i)).toHaveValue('smtp.gmail.com');
    expect(screen.getByLabelText(/^SMTP port/i)).toHaveValue(587);

    fireEvent.change(screen.getByLabelText(/Sender email/i), { target: { value: 'founder@gmail.com' } });
    fireEvent.change(screen.getByLabelText(/^SMTP username/i), { target: { value: 'founder@gmail.com' } });
    fireEvent.change(screen.getByLabelText(/^SMTP password/i), { target: { value: 'abcd-efgh-ijkl' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save email settings' }));

    await waitFor(() => {
      expect(savedPatch).toEqual({
        email: expect.objectContaining({
          senderAddress: 'founder@gmail.com',
          smtpHost: 'smtp.gmail.com',
          smtpPort: 587,
          smtpUser: 'founder@gmail.com',
          smtpPassword: 'abcd-efgh-ijkl',
          smtpSecure: false,
        }),
      });
    });
  });
});
