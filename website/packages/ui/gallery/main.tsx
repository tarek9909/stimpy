import { StrictMode, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './gallery.css';
import {
  Accordion,
  AnnouncementBar,
  Avatar,
  Badge,
  Banner,
  BottomSheet,
  Button,
  Checkbox,
  ColorSwatch,
  ColorSwatches,
  ConfirmModal,
  CopyButton,
  Countdown,
  Drawer,
  DropCard,
  EmptyState,
  ErrorState,
  ErrorSummary,
  FloatingWhatsApp,
  FormField,
  Input,
  Logo,
  Modal,
  PackCard,
  PriceTag,
  ProductCard,
  ProgressBar,
  QuantityStepper,
  RadioGroup,
  ReviewCard,
  RichText,
  Section,
  SegmentedControl,
  Select,
  ServerClockProvider,
  SizeSelector,
  SkipLink,
  Skeleton,
  SkeletonGroup,
  Spinner,
  StatCard,
  StatusPill,
  StatusTimeline,
  StimpieCard,
  Switch,
  TabPanel,
  Tabs,
  TextLink,
  Textarea,
  ToastProvider,
  TrustStrip,
  UIProvider,
  WhatsAppButton,
  ZipWipe,
  icons,
  useToast,
  type AccentColor,
  type OrderStatus,
  type StimpieLike,
  type ZipWipeHandle,
} from '../src';

const art = (n: number) => `./art/stimpie-${String(n).padStart(3, '0')}.webp`;
const inMs = (ms: number) => new Date(Date.now() + ms).toISOString();

const COLORS = [
  { id: 1, name: 'Black', hex: '#111111' },
  { id: 2, name: 'Cream', hex: '#EDE3D2' },
  { id: 3, name: 'Coral', hex: '#FF7A59' },
  { id: 4, name: 'White', hex: '#FFFFFF' },
  { id: 5, name: 'Sage', hex: '#9CAF88' },
];
const SIZES = [
  { id: 1, label: 'S' },
  { id: 2, label: 'M' },
  { id: 3, label: 'L' },
  { id: 4, label: 'XL' },
];
const VARIANTS = [
  { colorId: 1, sizeId: 1, inStock: true, remaining: null },
  { colorId: 1, sizeId: 2, inStock: true, remaining: 3 },
  { colorId: 1, sizeId: 3, inStock: true, remaining: null },
  { colorId: 1, sizeId: 4, inStock: false, remaining: null },
];

const base: Omit<StimpieLike, 'slug' | 'name' | 'status' | 'purchasable'> = {
  type: 'CORE',
  priceCents: 1500,
  images: [],
  artworkUrl: art(0),
  drop: null,
  remaining: null,
};
const STIMPIES: StimpieLike[] = [
  { ...base, slug: 'midnight-cedar', name: 'Midnight Cedar', artworkUrl: art(0), status: 'AVAILABLE', purchasable: true },
  { ...base, slug: 'neon-koi', name: 'Neon Koi', artworkUrl: art(1), type: 'LIMITED', priceCents: 1800, drop: { name: 'Drop 03', accentColor: 'SKY' }, status: 'LOW', remaining: 4, purchasable: true },
  { ...base, slug: 'paper-moon', name: 'Paper Moon', artworkUrl: art(2), type: 'LIMITED', priceCents: 1800, drop: { name: 'Drop 03', accentColor: 'SKY' }, status: 'SOLD_OUT', purchasable: false },
  { ...base, slug: 'soon', name: 'Slow Tide', artworkUrl: art(3), type: 'LIMITED', priceCents: 2000, drop: { name: 'Drop 04', accentColor: 'SKY' }, status: 'UPCOMING', purchasable: false },
];

function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`mb-12 ${className}`}>
      <h2 className="mb-4 border-b border-base pb-2 text-h3">{title}</h2>
      {children}
    </section>
  );
}
function Row({ label, children, className = '' }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`mb-6 ${className}`}>
      {label ? <p className="mb-2 text-caption uppercase tracking-[0.04em] text-fg-muted">{label}</p> : null}
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function ButtonsDemo() {
  const [loading, setLoading] = useState(false);
  return (
    <Panel title="Button and links">
      <Row label="variants (md)">
        <Button variant="cta">Add to cart</Button>
        <Button variant="primary">Primary blue</Button>
        <Button variant="dark">Dark</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="coral">Try the Builder</Button>
        <Button variant="danger">Delete</Button>
      </Row>
      <Row label="sizes sm 36 / md 44 / lg 52">
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large CTA</Button>
      </Row>
      <Row label="states: loading (click), disabled, icon, icon-only, full width">
        <Button
          variant="cta"
          loading={loading}
          onClick={() => {
            setLoading(true);
            setTimeout(() => setLoading(false), 1800);
          }}
        >
          Place order
        </Button>
        <Button disabled>Disabled</Button>
        <Button variant="secondary" disabled>
          Disabled outline
        </Button>
        <Button leftIcon={<icons.Plus width={20} height={20} aria-hidden />} variant="dark">
          With icon
        </Button>
        <Button iconOnly aria-label="Remove" variant="secondary">
          <icons.X width={20} height={20} aria-hidden />
        </Button>
        <Button loading variant="coral" leftIcon={<icons.Plus width={20} height={20} aria-hidden />}>
          Loading icon
        </Button>
      </Row>
      <div className="max-w-sm">
        <Button fullWidth variant="cta" size="lg">
          Checkout (full width, 52px)
        </Button>
      </div>
      <Row label="links" className="mt-6">
        <TextLink href="/shop">Inline link</TextLink>
        <TextLink href="/shop" variant="action">
          Action link
        </TextLink>
        <TextLink href="https://instagram.com" target="_blank">
          Instagram
        </TextLink>
      </Row>
    </Panel>
  );
}

function FormsDemo() {
  const [qty, setQty] = useState(2);
  const [pack, setPack] = useState('p2');
  const [view, setView] = useState('2d');
  const [sw, setSw] = useState(true);
  const [checked, setChecked] = useState(true);
  const [mode, setMode] = useState('a');
  return (
    <Panel title="Form controls">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <FormField label="Full name" name="name" required hint="As on your ID">
            <Input placeholder="Jane Doe" autoComplete="name" defaultValue="Rami Haddad" />
          </FormField>
          <FormField label="Phone" name="phone" required error="Enter a Lebanese phone number">
            <Input inputMode="tel" prefixText="+961" defaultValue="03 12" />
          </FormField>
          <FormField label="Email" name="email" optional>
            <Input type="email" placeholder="you@example.com" />
          </FormField>
          <FormField label="Disabled" name="dis">
            <Input disabled defaultValue="Locked" />
          </FormField>
          <FormField label="Weight" name="w">
            <Input suffixText="kg" inputMode="numeric" defaultValue="70" />
          </FormField>
          <FormField label="Area" name="area">
            <Select
              placeholder="Choose an area"
              defaultValue=""
              options={[
                { value: 'hamra', label: 'Hamra' },
                { value: 'achrafieh', label: 'Achrafieh' },
              ]}
            />
          </FormField>
          <FormField label="Notes" name="notes" hint="Optional delivery notes">
            <Textarea showCount maxLength={300} defaultValue="Ring twice." />
          </FormField>
        </div>
        <div className="flex flex-col gap-5">
          <Checkbox label="WhatsApp is the same as my phone number" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <Checkbox label="Indeterminate" description="Some selected" indeterminate defaultChecked />
          <Checkbox label="Error state" invalid />
          <Checkbox label="Disabled" disabled />
          <Switch label="Order confirmation emails" description="Sent on every new order" checked={sw} onChange={setSw} />
          <Switch label="Loading switch" checked={false} onChange={() => undefined} loading />
          <RadioGroup
            name="mode"
            legend="Lighting"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'a', label: 'Studio' },
              { value: 'b', label: 'Soft', description: 'Gentle shadows' },
              { value: 'c', label: 'Night', disabled: true },
            ]}
          />
          <RadioGroup
            name="pack"
            legend="Choose a pack"
            variant="card"
            value={pack}
            onChange={setPack}
            options={[
              { value: 'p0', label: 'Hoodie only', meta: '$35' },
              { value: 'p1', label: 'Hoodie + 1 Stimpie', meta: '$45' },
              { value: 'p2', label: 'Hoodie + 2 Stimpies', meta: '$60', description: 'Most popular' },
            ]}
          />
          <SegmentedControl aria-label="Builder view" value={view} onChange={setView} options={[{ value: '2d', label: '2D' }, { value: '3d', label: '3D' }]} />
          <div className="flex items-center gap-4">
            <QuantityStepper label="Quantity of Neon Koi" value={qty} onChange={setQty} />
            <QuantityStepper label="At the limit" value={10} onChange={() => undefined} />
          </div>
        </div>
      </div>
      <ErrorSummary
        className="mt-6 max-w-md"
        errors={[
          { fieldId: 'field-phone', message: 'Phone: enter a Lebanese phone number' },
          { message: 'Your cart has a problem' },
        ]}
      />
    </Panel>
  );
}

function SwatchesDemo() {
  const [color, setColor] = useState<number | null>(1);
  const [size, setSize] = useState<number | null>(2);
  return (
    <Panel title="Colour swatches and sizes">
      <div className="grid gap-6 md:grid-cols-2">
        <ColorSwatches colors={COLORS} value={color} onChange={setColor} soldOutIds={[3]} disabledIds={[5]} />
        <div className="flex flex-col gap-2">
          <p className="text-body-sm text-fg-muted">Size (colour Black: XL sold out, M low stock)</p>
          <SizeSelector sizes={SIZES} variants={VARIANTS} colorId={1} value={size} onChange={setSize} />
        </div>
      </div>
      <Row label="static swatches" className="mt-6">
        {COLORS.map((c) => (
          <ColorSwatch key={c.id} color={c} />
        ))}
      </Row>
    </Panel>
  );
}

function BadgesDemo() {
  const statuses: OrderStatus[] = ['NEW', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED'];
  return (
    <Panel title="Badge, StatusPill, PriceTag">
      <Row label="badges (one accent per view in real pages)">
        <Badge kind="CORE" />
        <Badge kind="LIMITED" />
        <Badge kind="LIMITED" accent="SKY" />
        <Badge kind="LOW" remaining={4} />
        <Badge kind="SOLD_OUT" />
        <Badge kind="UPCOMING" />
        <Badge kind="ENDED" />
        <Badge kind="POPULAR" label="Most popular" />
        <Badge kind="CUSTOM" label="Custom" />
      </Row>
      <Row label="status pills md">
        {statuses.map((s) => (
          <StatusPill key={s} status={s} />
        ))}
      </Row>
      <Row label="status pills sm">
        {statuses.map((s) => (
          <StatusPill key={s} status={s} size="sm" />
        ))}
      </Row>
      <Row label="prices">
        <PriceTag cents={4500} size="lg" />
        <PriceTag cents={4550} />
        <PriceTag cents={1000} prefix="from" size="sm" />
        <PriceTag cents={3500} compareAtCents={4500} />
        <PriceTag cents={0} zeroLabel="Free delivery" size="sm" />
        <PriceTag cents={125000} variant="compact" fixed />
      </Row>
    </Panel>
  );
}

function CardsDemo() {
  const [sel, setSel] = useState<string | null>('midnight-cedar');
  return (
    <Panel title="Cards">
      <h3 className="mb-3 text-h4">ProductCard (hoodie 4:5, no photo yet shows the cream tile)</h3>
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <ProductCard hoodie={{ slug: 'core', name: 'Core Hoodie', priceCents: 3500, images: [], colors: COLORS, inStock: true }} />
        <ProductCard hoodie={{ slug: 'heavy', name: 'Heavyweight', priceCents: 4000, images: [], colors: COLORS.slice(0, 2), inStock: false }} />
      </div>
      <h3 className="mb-3 text-h4">StimpieCard (0.64, real artwork)</h3>
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {STIMPIES.map((s) => (
          <StimpieCard key={s.slug} stimpie={s} onAdd={() => undefined} showDrop />
        ))}
      </div>
      <h3 className="mb-3 text-h4">StimpieCard picker mode (aria-pressed) and compact</h3>
      <div className="mb-8 grid grid-cols-3 gap-3 md:grid-cols-6">
        {STIMPIES.map((s) => (
          <StimpieCard key={s.slug} stimpie={s} variant="compact" selectable selected={sel === s.slug} onSelect={() => setSel(s.slug)} />
        ))}
      </div>
      <h3 className="mb-3 text-h4">PackCard</h3>
      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <PackCard pack={{ name: 'Hoodie + 1 Stimpie', description: 'Your hoodie with one swappable back panel.', priceCents: 4500, badge: null }} onChoose={() => undefined} />
        <PackCard highlight pack={{ name: 'Hoodie + 2 Stimpies', description: 'Two backs. Swap daily.', priceCents: 6000, badge: 'Most popular' }} effectiveExtraCents={1500} onChoose={() => undefined} />
        <PackCard selected pack={{ name: 'Hoodie only', description: 'Add Stimpies later.', priceCents: 3500, badge: null }} />
      </div>
      <h3 className="mb-3 text-h4">DropCard (accent surface, one accent per view)</h3>
      <div className="grid gap-4 md:grid-cols-3">
        <DropCard
          variant="live"
          drop={{ slug: 'drop-03', name: 'Drop 03: Tidepool', accentColor: 'SKY', startsAt: inMs(-3600_000), endsAt: inMs(2 * 86_400_000 + 4 * 3_600_000), state: 'LIVE', teaserImage: art(4), unitsRemaining: 37 }}
        />
        <DropCard
          variant="upcoming"
          drop={{ slug: 'drop-04', name: 'Drop 04: Dusk', accentColor: 'LILAC', startsAt: inMs(86_400_000 + 3_600_000 * 5), endsAt: null, state: 'UPCOMING', teaserImage: art(5), unitsRemaining: null }}
        />
        <DropCard
          variant="archive"
          drop={{ slug: 'drop-02', name: 'Drop 02: Butter Lane', accentColor: 'BUTTER', startsAt: inMs(-9e9), endsAt: inMs(-8e9), state: 'SOLD_OUT', teaserImage: null, unitsRemaining: null }}
        />
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <StatCard label="Orders today" value="12" delta={{ text: '+3 vs yesterday', tone: 'up' }} />
        <StatCard label="Revenue" value="$1,250.00" delta={{ text: '-$40.00', tone: 'down' }} hint="Cash collected" />
        <StatCard label="Delivery success" value="94%" />
      </div>
    </Panel>
  );
}

function CountdownDemo() {
  return (
    <Panel title="Countdown (server clock offset 0; ticking)">
      <div className="mb-4 overflow-hidden rounded-lg">
        <Countdown variant="strip" label="Drop 03 starts in" target={inMs(2 * 86_400_000 + 4 * 3_600_000 + 12 * 60_000 + 9_000)} />
      </div>
      <div className="mb-4 overflow-hidden rounded-lg">
        <Countdown variant="strip" accent="BUTTER" label="Drop 04 starts in" target={inMs(3_600_000 + 5000)} />
      </div>
      <Row label="inline">
        <Countdown variant="inline" label="Ends in" target={inMs(45 * 60_000)} />
        <Countdown variant="inline" label="Final minute" target={inMs(40_000)} />
        <Countdown variant="inline" label="Zero" target={inMs(-1000)} />
      </Row>
      <div className="rounded-lg bg-cream p-6">
        <Countdown variant="large" label="Drop 03 starts in" target={inMs(86_400_000 + 7 * 3_600_000)} />
      </div>
      <div className="surface-dark mt-4 rounded-lg p-6">
        <Countdown variant="large" label="On a dark band" target={inMs(5 * 3_600_000 + 33 * 60_000)} />
      </div>
    </Panel>
  );
}

function DisclosureDemo() {
  const [tab, setTab] = useState('hoodies');
  const [pill, setPill] = useState('new');
  return (
    <Panel title="Tabs, Accordion, RichText, StatusTimeline">
      <Tabs aria-label="Shop sections" value={tab} onChange={setTab} tabs={[{ id: 'hoodies', label: 'Hoodies' }, { id: 'stimpies', label: 'Stimpies' }, { id: 'packs', label: 'Packs', disabled: true }]}>
        <TabPanel tabId="hoodies" className="py-4 text-body-sm text-fg-muted">
          Hoodies panel (arrow keys move between tabs).
        </TabPanel>
        <TabPanel tabId="stimpies" className="py-4 text-body-sm text-fg-muted">
          Stimpies panel.
        </TabPanel>
      </Tabs>
      <div className="mt-4">
        <Tabs
          aria-label="Order status"
          variant="pill"
          value={pill}
          onChange={setPill}
          tabs={[{ id: 'new', label: 'New', count: 3 }, { id: 'confirmed', label: 'Confirmed', count: 12 }, { id: 'packed', label: 'Packed', count: 0 }]}
        />
      </div>
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <Accordion
          defaultOpenIds={['a']}
          items={[
            { id: 'a', question: 'How long does delivery take?', answer: 'Usually **2 to 3 working days** across Lebanon.\n\nWe confirm on WhatsApp first.' },
            { id: 'b', question: 'Can I swap a Stimpie?', answer: '- Yes, zip it off\n- Zip a new one on\n- Repeat tomorrow' },
            { id: 'c', question: 'Do you ship abroad?', answer: 'Not yet.' },
          ]}
        />
        <div className="rounded-lg border border-base p-4">
          <RichText text={'Paragraph with **bold** text.\n\n- First item\n- Second **bold** item\n\n<script>alert(1)</script> stays as text, and [links](javascript:x) are not links.'} />
        </div>
      </div>
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <StatusTimeline
          steps={[
            { status: 'NEW', label: 'Received' },
            { status: 'CONFIRMED', label: 'Confirmed' },
            { status: 'PACKED', label: 'Packed' },
            { status: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
            { status: 'DELIVERED', label: 'Delivered' },
          ]}
          timeline={[
            { status: 'NEW', at: '2026-10-14T09:30:00Z' },
            { status: 'CONFIRMED', at: '2026-10-14T10:05:00Z' },
          ]}
          current="CONFIRMED"
        />
        <StatusTimeline
          steps={[
            { status: 'NEW', label: 'Received' },
            { status: 'CONFIRMED', label: 'Confirmed' },
            { status: 'PACKED', label: 'Packed' },
            { status: 'DELIVERED', label: 'Delivered' },
          ]}
          timeline={[
            { status: 'NEW', at: '2026-10-14T09:30:00Z' },
            { status: 'CANCELLED', at: '2026-10-14T11:05:00Z' },
          ]}
          current="CANCELLED"
        />
      </div>
    </Panel>
  );
}

function OverlaysDemo() {
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <Panel title="Overlays and toasts (click to open)">
      <Row>
        <Button variant="secondary" onClick={() => setModal(true)}>Modal</Button>
        <Button variant="secondary" onClick={() => setDrawer(true)}>Drawer (cart)</Button>
        <Button variant="secondary" onClick={() => setSheet(true)}>Bottom sheet</Button>
        <Button variant="danger" onClick={() => setConfirm(true)}>Confirm dialog</Button>
        <Button variant="dark" onClick={() => toast.success('Link copied')}>Success toast</Button>
        <Button variant="dark" onClick={() => toast.info('Back online.')}>Info toast</Button>
        <Button variant="dark" onClick={() => toast.error('Not sent. Check your connection and try again.')}>Error toast</Button>
      </Row>
      <Modal open={modal} onClose={() => setModal(false)} title="Edit address" description="We deliver across Lebanon." footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button><Button variant="cta" onClick={() => setModal(false)}>Save</Button></>}>
        <FormField label="Address" name="addr"><Input defaultValue="Hamra, Bliss Street" /></FormField>
      </Modal>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Your cart" footer={<Button variant="cta" fullWidth size="lg">Checkout</Button>}>
        <p className="mb-4 text-body-sm text-fg-muted">2 items</p>
        <div className="flex items-center justify-between gap-3 border-b border-base pb-3">
          <span>Hoodie + 2 Stimpies</span>
          <QuantityStepper label="Quantity" value={1} onChange={() => undefined} />
        </div>
      </Drawer>
      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Choose your size">
        <SizeSelector sizes={SIZES} variants={VARIANTS} colorId={1} value={null} onChange={() => setSheet(false)} />
      </BottomSheet>
      <ConfirmModal
        open={confirm}
        busy={busy}
        tone="destructive"
        title="Delete Neon Koi?"
        text="Orders that include it keep their record. This cannot be undone."
        confirmLabel="Delete"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setBusy(true);
          setTimeout(() => {
            setBusy(false);
            setConfirm(false);
            toast.success('Deleted');
          }, 1200);
        }}
      />
    </Panel>
  );
}

function FeedbackDemo() {
  return (
    <Panel title="Banner, Skeleton, Spinner, Progress, EmptyState, ErrorState">
      <div className="mb-6 flex flex-col gap-3">
        <AnnouncementBar text="Drop 03 goes live Friday 21:00" linkUrl="/drops/drop-03" />
        <Banner variant="info" title="Delivery update">Orders placed before 14:00 go out today.</Banner>
        <Banner variant="warning" dismissible onDismiss={() => undefined}>Your hold expires in 30 minutes.</Banner>
        <Banner variant="error" title="Payment on delivery only">We could not reach the server.</Banner>
        <Banner variant="info" action={<Button size="sm" variant="secondary">Retry</Button>}>Showing saved data. Some information may be out of date.</Banner>
      </div>
      <div className="mb-8 grid gap-6 md:grid-cols-3">
        <SkeletonGroup>
          <Skeleton variant="card" />
        </SkeletonGroup>
        <div className="flex flex-col gap-6">
          <Skeleton variant="text" lines={4} />
          <Skeleton variant="stat" />
          <Skeleton variant="rect" ratio="4 / 5" className="max-w-40" />
        </div>
        <div>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} variant="table-row" />
          ))}
        </div>
      </div>
      <Row label="spinner and progress">
        <Spinner size="sm" label="Loading" />
        <Spinner size="md" />
        <div className="w-60"><ProgressBar value={62} aria-label="Uploading hoodie.glb" /></div>
        <div className="w-60"><ProgressBar aria-label="Preparing" /></div>
      </Row>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-base">
          <EmptyState icon={<icons.Inbox width={32} height={32} />} title="Your cart is empty" text="Add a hoodie and a Stimpie or two." action={<Button variant="dark">Shop</Button>} />
        </div>
        <div className="rounded-lg border border-base">
          <ErrorState onRetry={() => undefined} requestId="4c1f0a9e" />
        </div>
      </div>
    </Panel>
  );
}

function ActionsDemo() {
  return (
    <Panel title="CopyButton, WhatsAppButton, TrustStrip, ReviewCard, Avatar">
      <Row>
        <CopyButton text="STP-1042" label="Copy order number" />
        <CopyButton text="STP-1042" label="Copy order number" iconOnly variant="secondary" />
        <WhatsAppButton number="+96171123456" text="Hi Stimpy, order STP-1042" />
        <WhatsAppButton number="+96171123456" label="Message customer" variant="secondary" />
        <WhatsAppButton number={null} />
        <Avatar name="Rami Haddad" />
        <Avatar name="Lina" size="sm" />
      </Row>
      <div className="mb-8 rounded-lg bg-cream p-6">
        <TrustStrip />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <ReviewCard review={{ name: 'Maya, Beirut', text: 'Swapped the back panel in ten seconds. Everyone asks about it.', mediaUrl: art(1) }} />
        <ReviewCard review={{ name: 'Karim, Jounieh', text: 'The zip system is smart and the hoodie is heavy and soft.' }} />
      </div>
    </Panel>
  );
}

function ZipDemo() {
  const ref = useRef<ZipWipeHandle>(null);
  const [scene, setScene] = useState(0);
  const [outgoing, setOutgoing] = useState<number | null>(null);
  const scenes = useMemo(() => [art(0), art(1), art(2)], []);
  return (
    <Panel title="Section tones and ZipWipe">
      <div className="mb-8 grid gap-0 overflow-hidden rounded-lg md:grid-cols-3">
        <Section tone="white" heading="White" className="!py-8"><p>Black on white</p></Section>
        <Section tone="cream" heading="Cream" className="!py-8"><p>Black on cream</p><Button variant="secondary" size="sm" className="mt-3">Secondary</Button></Section>
        <Section tone="black" heading="Black" className="!py-8"><p className="text-fg-muted">Muted on black</p><Button variant="cta" size="sm" className="mt-3">Add to cart</Button></Section>
        <Section tone="coral" heading="Coral" className="!py-8"><p>Black on coral</p><Button variant="dark" size="sm" className="mt-3">Dark</Button></Section>
        {(['BUTTER', 'SKY', 'LILAC'] as AccentColor[]).map((a) => (
          <Section key={a} tone="accent" accentColor={a} heading={a[0] + a.slice(1).toLowerCase()} className="!py-8"><p className="text-fg-muted">Black on {a.toLowerCase()}</p></Section>
        ))}
      </div>
      <p className="mb-2 text-body-sm text-fg-muted">Manual zip (Builder swap, 450 ms, direction up): the old panel is the outgoing layer.</p>
      <div className="mb-3 w-40">
        <ZipWipe ref={ref} trigger="manual" direction="up" durationMs={450} color="cream" onDark outgoing={outgoing !== null ? <img className="h-full w-full object-cover" alt="" src={scenes[outgoing]} /> : undefined}>
          <div className="aspect-[16/25] bg-cream">
            <img className="h-full w-full object-cover" alt={`Stimpie ${scene + 1}`} src={scenes[scene]} />
          </div>
        </ZipWipe>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setOutgoing(scene);
          setScene((scene + 1) % scenes.length);
          requestAnimationFrame(() => void ref.current?.play());
        }}
      >
        Swap Stimpie
      </Button>
      <div className="mt-8" id="zip-section">
        <ZipWipe trigger="inView" color="coral" direction="down" durationMs={600} onDark>
          <div className="surface-dark rounded-lg p-8">
            <p className="text-h2">Section zip-in (600 ms, plays once in view)</p>
            <p className="mt-2 text-fg-muted">Content is in the DOM and readable from the start.</p>
          </div>
        </ZipWipe>
      </div>
    </Panel>
  );
}

function BrandDemo() {
  return (
    <Panel title="Logo, colour tokens, type">
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="overflow-hidden rounded-lg border border-base"><Logo variant="full" surface="white" width={200} /></div>
        <div className="overflow-hidden rounded-lg"><Logo variant="full" surface="black" width={200} /></div>
        <div className="rounded-lg"><Logo variant="full" surface="coral" width={200} /></div>
      </div>
      <div className="mb-8 flex flex-wrap items-center gap-6">
        <div className="rounded-lg border border-base bg-white p-4"><Logo variant="icon" surface="white" width={48} /></div>
        <div className="rounded-lg bg-ink p-4"><Logo variant="icon" surface="black" width={48} /></div>
        <div className="rounded-lg"><Logo variant="icon" surface="coral" width={48} /></div>
        <div className="rounded-lg border border-base bg-white p-4"><Logo variant="full" surface="white" width={96} clearSpace={false} alt="Stimpy (minimum 96px)" /></div>
        <div className="rounded-lg border border-base bg-white p-4"><Logo variant="icon" surface="white" width={20} clearSpace={false} alt="Stimpy" /></div>
        <UIProvider logoBaseUrl="./brand"><div className="rounded-lg border border-base bg-white p-2" title="served from public/brand via logoBaseUrl"><Logo variant="full" surface="white" width={120} /></div></UIProvider>
      </div>
      <div className="mb-8 grid grid-cols-3 gap-2 md:grid-cols-6">
        {[
          ['coral', 'bg-coral text-ink'], ['ink', 'bg-ink text-white'], ['action', 'bg-action text-white'], ['butter', 'bg-butter text-ink'], ['sky', 'bg-sky text-ink'], ['lilac', 'bg-lilac text-ink'],
          ['cream', 'bg-cream text-ink'], ['ink-70', 'bg-ink-70 text-white'], ['ink-55', 'bg-ink-55 text-white'], ['line', 'bg-line text-ink'], ['line-strong', 'bg-line-strong text-ink'], ['surface', 'bg-surface text-ink border border-base'],
          ['success', 'bg-success text-white'], ['danger', 'bg-danger text-white'], ['neutral', 'bg-neutral text-white'],
        ].map(([n, c]) => (
          <div key={n} className={`flex h-16 items-end rounded-md p-2 text-caption ${c}`}>{n}</div>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-display">Display headline</p>
        <p className="text-h1">H1 Page title</p>
        <p className="text-h2">H2 Section title</p>
        <p className="text-h3">H3 Card title</p>
        <p className="text-h4">H4 Small title (500)</p>
        <p className="text-lead">Lead paragraph under a heading.</p>
        <p className="text-body">Body text 16px regular. Prices tabular: <span className="tabular-nums">$1,250.50 $1,111.11</span></p>
        <p className="text-body-sm text-fg-muted">Body small 14px secondary.</p>
        <p className="text-caption uppercase tracking-[0.04em]">Caption 12px / 500</p>
      </div>
    </Panel>
  );
}

function DarkBand() {
  const [v, setV] = useState('a');
  return (
    <div className="surface-dark rounded-lg p-6">
      <h2 className="mb-4 text-h3">Dark band (semantic variables)</h2>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant="cta">Order now</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="dark">Dark (inverts)</Button>
        <Button variant="coral">Coral</Button>
        <TextLink href="/shop">Inline link</TextLink>
      </div>
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <FormField label="Email" name="demail" hint="We never share it"><Input placeholder="you@example.com" /></FormField>
        <FormField label="With error" name="derr" error="Enter a valid email"><Input defaultValue="nope" /></FormField>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <SegmentedControl aria-label="Dark segmented" value={v} onChange={setV} options={[{ value: 'a', label: 'Hoodies' }, { value: 'b', label: 'Stimpies' }]} />
        <QuantityStepper label="Qty" value={3} onChange={() => undefined} />
        <Checkbox label="Remember me" defaultChecked />
        <Switch label="Notify" checked onChange={() => undefined} />
        <ColorSwatches colors={COLORS.slice(0, 3)} value={1} onChange={() => undefined} />
      </div>
      <div className="flex items-center gap-4"><Logo variant="full" surface="black" width={160} /><Logo variant="icon" surface="black" width={32} /></div>
    </div>
  );
}

function App() {
  return (
    <ServerClockProvider offsetMs={0}>
      <ToastProvider>
        <SkipLink targetId="gallery-main" />
        <main id="gallery-main" className="container py-8">
          <header className="mb-10">
            <Logo variant="full" surface="white" width={160} />
            <h1 className="mt-4 text-h1">@stimpy/ui gallery</h1>
            <p className="mt-2 max-w-prose text-lead text-fg-muted">Every shared component, rendered with the real preset and tokens. Interact with controls, resize to 360px, tab through with the keyboard.</p>
          </header>
          <BrandDemo />
          <ButtonsDemo />
          <FormsDemo />
          <SwatchesDemo />
          <BadgesDemo />
          <CardsDemo />
          <CountdownDemo />
          <DisclosureDemo />
          <OverlaysDemo />
          <FeedbackDemo />
          <ActionsDemo />
          <ZipDemo />
          <DarkBand />
        </main>
        <FloatingWhatsApp number="+96171123456" />
      </ToastProvider>
    </ServerClockProvider>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
