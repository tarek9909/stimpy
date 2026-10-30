import type { AppContext } from '../context';
import type { Db } from '../lib/db';
import { now } from '../lib/clock';
import { AppError } from '../lib/errors';
import { purchaseBlockReason, type PurchaseReason } from './drops';
import type { ProblemRef, StockNeed, StockRef } from './stock';
import { mergeNeeds } from './stock';
import { promotionPriceKey, promotionPriceMap } from './promotions';
import { packAllowsStimpie, stimpiePriceMap } from './stimpie-offers';

/**
 * PRICING SERVICE (work package B). Turns cart items into priced, validated lines (business-rules section 1),
 * computes the cost snapshot and looks up the delivery fee. Pure reads; no stock is touched.
 *
 * Two kinds of "can't do that" are kept apart on purpose:
 *  - malformed carts (unknown ids, wrong `stimpieIds` count, duplicates) THROW `VALIDATION_ERROR` with `items.N...` paths;
 *  - "can't buy it right now" (hidden item, drop not started / ended) is RETURNED as `PurchaseProblem`s, because
 *    `POST /cart/validate` reports it per line while `POST /orders` turns it into `NOT_PURCHASABLE`.
 */

export type CartItemInput =
  | { kind: 'pack'; packId: number; hoodieId: number; colorId: number; sizeId: number; stimpieIds: number[]; qty: number }
  | { kind: 'stimpie_pack'; packId: number; stimpies: { stimpieId: number; qty: number }[]; qty: number }
  | { kind: 'hoodie'; hoodieId: number; colorId: number; sizeId: number; qty: number }
  | { kind: 'stimpie'; stimpieId: number; qty: number };

export type PurchaseProblem = ProblemRef & { itemIndex: number; name: string; reason: PurchaseReason };

export type OrderItemDetail = {
  hoodie: string | null;
  color: string | null;
  size: string | null;
  stimpies: string[];
  stimpieQuantities: { name: string; qty: number }[];
};

export type PricedLine = {
  itemIndex: number;
  item: CartItemInput;
  kind: 'PACK' | 'STIMPIE_PACK' | 'HOODIE' | 'STIMPIE';
  qty: number;
  name: string;
  unitPriceCents: number;
  unitCostCents: number;
  lineTotalCents: number;
  detail: OrderItemDetail;
  /** Physical things this line holds, already multiplied by `qty`. */
  needs: (StockRef & { qty: number })[];
  /** Why this line cannot be bought right now (empty when purchasable). */
  problems: PurchaseProblem[];
};

export type PricedCart = {
  lines: PricedLine[];
  /** Sum over ALL lines (an order is only placed when every line is purchasable). */
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  estimateText: string;
  purchaseProblems: PurchaseProblem[];
  /** Merged stock needs across lines (summed per thing, first line index kept), in lock order. */
  needs: StockNeed[];
};

export const MAX_CART_ITEMS = 20;
export const MAX_ITEM_QTY = 10;
const MAX_DATABASE_INT = 2_147_483_647;

// ---------------------------------------------------------------- delivery

export type ResolvedDelivery = { feeCents: number; estimateText: string };

/** Looks up the area (active only) and returns its fee and estimate text. `areaPath` names the field in VALIDATION_ERROR. */
export async function resolveDelivery(ctx: AppContext, db: Db, areaId: number | null | undefined, areaPath = 'delivery.areaId'): Promise<ResolvedDelivery> {
  const delivery = await ctx.settings.get('delivery');
  if (areaId == null) return { feeCents: delivery.defaultFeeCents, estimateText: delivery.estimateText };
  const area = await db.area.findUnique({ where: { id: areaId } });
  if (!area || !area.active) throw AppError.validation({ [areaPath]: 'That delivery area is not available.' });
  return {
    feeCents: area.feeCents ?? delivery.defaultFeeCents,
    estimateText: area.estDays != null ? `${area.estDays} working days` : delivery.estimateText,
  };
}

/** `area.feeCents ?? settings.delivery.defaultFeeCents`; default fee when no area. */
export async function deliveryFeeFor(ctx: AppContext, areaId: number | null | undefined, db: Db = ctx.prisma): Promise<number> {
  return (await resolveDelivery(ctx, db, areaId)).feeCents;
}

/** `"<N> working days"` when the area has estDays, otherwise `settings.delivery.estimateText`. */
export async function estimateTextFor(ctx: AppContext, areaId: number | null | undefined, db: Db = ctx.prisma): Promise<string> {
  return (await resolveDelivery(ctx, db, areaId)).estimateText;
}

// ---------------------------------------------------------------- pricing

const uniq = (ids: number[]): number[] => [...new Set(ids)];

/**
 * Prices a cart from the database. Throws VALIDATION_ERROR (unknown ids, wrong stimpieIds count, duplicates),
 * never trusts client prices, and RETURNS purchase problems (see the file header).
 */
export async function priceCart(ctx: AppContext, db: Db, input: { items: CartItemInput[]; areaId?: number | null; areaPath?: string }): Promise<PricedCart> {
  const { items } = input;
  if (items.length === 0) throw AppError.validation({ items: 'Add at least one item.' });
  if (items.length > MAX_CART_ITEMS) throw AppError.validation({ items: `A cart can hold at most ${MAX_CART_ITEMS} items.` });

  const hoodieIds: number[] = [];
  const colorIds: number[] = [];
  const sizeIds: number[] = [];
  const packIds: number[] = [];
  const stimpieIds: number[] = [];
  for (const it of items) {
    if (it.kind === 'stimpie') stimpieIds.push(it.stimpieId);
    else if (it.kind === 'stimpie_pack') {
      packIds.push(it.packId);
      stimpieIds.push(...it.stimpies.map((entry) => entry.stimpieId));
    } else {
      hoodieIds.push(it.hoodieId);
      colorIds.push(it.colorId);
      sizeIds.push(it.sizeId);
      if (it.kind === 'pack') {
        packIds.push(it.packId);
        stimpieIds.push(...it.stimpieIds);
      }
    }
  }

  const [hoodies, colors, sizes, packs, stimpies, variants, settings, delivery] = await Promise.all([
    hoodieIds.length ? db.hoodie.findMany({ where: { id: { in: uniq(hoodieIds) } } }) : Promise.resolve([]),
    colorIds.length ? db.color.findMany({ where: { id: { in: uniq(colorIds) } } }) : Promise.resolve([]),
    sizeIds.length ? db.size.findMany({ where: { id: { in: uniq(sizeIds) } } }) : Promise.resolve([]),
    packIds.length ? db.pack.findMany({ where: { id: { in: uniq(packIds) } } }) : Promise.resolve([]),
    stimpieIds.length ? db.stimpie.findMany({ where: { id: { in: uniq(stimpieIds) } }, include: { drop: true } }) : Promise.resolve([]),
    hoodieIds.length
      ? db.hoodieVariant.findMany({ where: { hoodieId: { in: uniq(hoodieIds) }, colorId: { in: uniq(colorIds) }, sizeId: { in: uniq(sizeIds) }, active: true } })
      : Promise.resolve([]),
    ctx.settings.get('orders'),
    resolveDelivery(ctx, db, input.areaId, input.areaPath ?? 'delivery.areaId'),
  ]);
  const hoodieBy = new Map(hoodies.map((h) => [h.id, h]));
  const colorBy = new Map(colors.map((c) => [c.id, c]));
  const sizeBy = new Map(sizes.map((s) => [s.id, s]));
  const packBy = new Map(packs.map((p) => [p.id, p]));
  const stimpieBy = new Map(stimpies.map((s) => [s.id, s]));
  const variantBy = new Map(variants.map((v) => [`${v.hoodieId}-${v.colorId}-${v.sizeId}`, v]));

  const at = now();
  const [promotionPrices, stimpiePrices] = await Promise.all([promotionPriceMap(db, [
    ...hoodies.map((h) => ({ productType: 'HOODIE' as const, productId: h.id, priceCents: h.priceCents })),
    ...packs.filter((p) => p.type !== 'STIMPIE_ONLY').map((p) => ({ productType: 'PACK' as const, productId: p.id, priceCents: p.priceCents })),
  ], at), stimpiePriceMap(db, stimpies, at)]);
  const fields: Record<string, string> = {};
  const lines: PricedLine[] = [];
  const allProblems: PurchaseProblem[] = [];

  items.forEach((item, i) => {
    const p = `items.${i}`;
    const problems: PurchaseProblem[] = [];
    const needs: (StockRef & { qty: number })[] = [];
    const stimpieNames: string[] = [];
    let price = 0;
    let cost = 0;
    let name = '';
    let detail: OrderItemDetail = { hoodie: null, color: null, size: null, stimpies: [], stimpieQuantities: [] };
    let ok = true;

    const checkStimpie = (id: number, path: string, selectedQty = 1): void => {
      const s = stimpieBy.get(id);
      if (!s) {
        fields[path] = 'That Stimpie does not exist.';
        ok = false;
        return;
      }
      stimpieNames.push(s.name);
      cost += s.costCents * selectedQty;
      needs.push({ itemType: 'STIMPIE', stimpieId: s.id, qty: item.qty * selectedQty });
      const reason = purchaseBlockReason({ active: s.active, drop: s.drop ? { startsAt: s.drop.startsAt, endsAt: s.drop.endsAt, endedAt: s.drop.endedAt } : null }, at);
      if (reason) problems.push({ kind: 'STIMPIE', stimpieId: s.id, itemIndex: i, name: s.name, reason });
    };

    if (item.kind === 'stimpie') {
      const s = stimpieBy.get(item.stimpieId);
      if (!s) {
        fields[`${p}.stimpieId`] = 'That Stimpie does not exist.';
        ok = false;
      } else {
        checkStimpie(item.stimpieId, `${p}.stimpieId`);
        price = stimpiePrices.get(s.id)?.priceCents ?? s.priceCents;
        name = s.name;
        detail = { hoodie: null, color: null, size: null, stimpies: [s.name], stimpieQuantities: [{ name: s.name, qty: 1 }] };
        cost = s.costCents;
      }
    } else if (item.kind === 'stimpie_pack') {
      const pack = packBy.get(item.packId);
      if (!pack || pack.type !== 'STIMPIE_ONLY') {
        fields[`${p}.packId`] = 'That Stimpie-only offer does not exist.';
        ok = false;
        item.stimpies.forEach((entry, n) => {
          if (!stimpieBy.has(entry.stimpieId)) fields[`${p}.stimpies.${n}.stimpieId`] = 'That Stimpie does not exist.';
        });
      } else {
        const count = item.stimpies.reduce((sum, entry) => sum + entry.qty, 0);
        if (count !== pack.stimpieCount) {
          fields[`${p}.stimpies`] = `Choose Stimpie quantities that total ${pack.stimpieCount}.`;
          ok = false;
        }
        const seen = new Set<number>();
        item.stimpies.forEach((entry, n) => {
          if (seen.has(entry.stimpieId)) {
            fields[`${p}.stimpies.${n}.stimpieId`] = 'Each Stimpie design must appear only once; use its qty for repeats.';
            ok = false;
          }
          seen.add(entry.stimpieId);
          const stimpie = stimpieBy.get(entry.stimpieId);
          if (stimpie && !packAllowsStimpie(pack, entry.stimpieId)) {
            fields[`${p}.stimpies.${n}.stimpieId`] = 'That Stimpie is not eligible for this offer.';
            ok = false;
          }
          checkStimpie(entry.stimpieId, `${p}.stimpies.${n}.stimpieId`, entry.qty);
        });
        if (!pack.active) {
          const first = item.stimpies[0];
          const s = first ? stimpieBy.get(first.stimpieId) : undefined;
          if (s) problems.push({ kind: 'STIMPIE', stimpieId: s.id, itemIndex: i, name: pack.name, reason: 'INACTIVE' });
        }
        price = pack.priceCents;
        name = pack.name;
        detail = {
          hoodie: null,
          color: null,
          size: null,
          stimpies: item.stimpies.flatMap(({ stimpieId }) => {
            const stimpie = stimpieBy.get(stimpieId);
            return stimpie ? [stimpie.name] : [];
          }),
          stimpieQuantities: item.stimpies.flatMap(({ stimpieId, qty }) => {
            const stimpie = stimpieBy.get(stimpieId);
            return stimpie ? [{ name: stimpie.name, qty }] : [];
          }),
        };
      }
    } else {
      const hoodie = hoodieBy.get(item.hoodieId);
      const color = colorBy.get(item.colorId);
      const size = sizeBy.get(item.sizeId);
      if (!hoodie) {
        fields[`${p}.hoodieId`] = 'That hoodie does not exist.';
        ok = false;
      }
      if (!color) {
        fields[`${p}.colorId`] = 'That colour does not exist.';
        ok = false;
      }
      if (!size) {
        fields[`${p}.sizeId`] = 'That size does not exist.';
        ok = false;
      }
      const variant = hoodie && color && size ? variantBy.get(`${hoodie.id}-${color.id}-${size.id}`) : undefined;
      if (hoodie && color && size && !variant) {
        fields[`${p}.sizeId`] = 'That colour and size is not offered for this hoodie.';
        ok = false;
      }
      let pack: (typeof packs)[number] | undefined;
      if (item.kind === 'pack') {
        pack = packBy.get(item.packId);
        if (!pack) {
          fields[`${p}.packId`] = 'That pack does not exist.';
          ok = false;
        } else if (pack.type !== 'HOODIE_SET') {
          fields[`${p}.packId`] = 'That offer does not include a hoodie.';
          ok = false;
        } else if (item.stimpieIds.length !== pack.stimpieCount) {
          fields[`${p}.stimpieIds`] = `Choose exactly ${pack.stimpieCount} Stimpie${pack.stimpieCount === 1 ? '' : 's'} for this pack.`;
          ok = false;
        } else {
          const seen = new Set<number>();
          item.stimpieIds.forEach((sid, m) => {
            if (seen.has(sid)) {
              fields[`${p}.stimpieIds.${m}`] = 'Each Stimpie in a pack must be different.';
              ok = false;
            }
            seen.add(sid);
            const stimpie = stimpieBy.get(sid);
            if (pack && stimpie && !packAllowsStimpie(pack, sid)) {
              fields[`${p}.stimpieIds.${m}`] = 'That Stimpie is not eligible for this offer.';
              ok = false;
            }
          });
        }
      }
      if (ok && hoodie && color && size && variant) {
        needs.push({ itemType: 'HOODIE_VARIANT', variantId: variant.id, qty: item.qty });
        cost = hoodie.costCents + settings.hardwareCostCents;
        if (item.kind === 'pack' && pack) {
          item.stimpieIds.forEach((sid, m) => checkStimpie(sid, `${p}.stimpieIds.${m}`));
          price = promotionPrices.get(promotionPriceKey('PACK', pack.id))?.priceCents ?? pack.priceCents;
          name = pack.name;
          detail = { hoodie: hoodie.name, color: color.name, size: size.label, stimpies: stimpieNames, stimpieQuantities: stimpieNames.map((name) => ({ name, qty: 1 })) };
        } else {
          price = promotionPrices.get(promotionPriceKey('HOODIE', hoodie.id))?.priceCents ?? hoodie.priceCents;
          name = hoodie.name;
          detail = { hoodie: hoodie.name, color: color.name, size: size.label, stimpies: [], stimpieQuantities: [] };
        }
        const inactive = !hoodie.active || !color.active || !size.active || (pack ? !pack.active : false);
        if (inactive) {
          problems.push({
            kind: 'HOODIE_VARIANT',
            hoodieId: hoodie.id,
            colorId: color.id,
            sizeId: size.id,
            itemIndex: i,
            name: pack && !pack.active ? pack.name : `${hoodie.name}, ${color.name}, ${size.label}`,
            reason: 'INACTIVE',
          });
        }
      } else if (item.kind === 'pack') {
        // keep checking the Stimpie ids so every malformed id is reported in one response
        item.stimpieIds.forEach((sid, m) => {
          if (!stimpieBy.has(sid)) fields[`${p}.stimpieIds.${m}`] = 'That Stimpie does not exist.';
        });
      }
    }

    if (cost > MAX_DATABASE_INT) {
      fields[`${p}.stimpies`] = 'The selected Stimpie quantities exceed the maximum supported order cost.';
      ok = false;
    } else if (cost * item.qty > MAX_DATABASE_INT) {
      fields[`${p}.qty`] = 'This quantity exceeds the maximum supported order cost.';
      ok = false;
    }
    if (!ok) return;
    allProblems.push(...problems);
    lines.push({
      itemIndex: i,
      item,
      kind: item.kind === 'pack' ? 'PACK' : item.kind === 'stimpie_pack' ? 'STIMPIE_PACK' : item.kind === 'hoodie' ? 'HOODIE' : 'STIMPIE',
      qty: item.qty,
      name,
      unitPriceCents: price,
      unitCostCents: cost,
      lineTotalCents: price * item.qty,
      detail,
      needs,
      problems,
    });
  });

  if (Object.keys(fields).length) throw AppError.validation(fields);

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  if (subtotalCents > MAX_DATABASE_INT) throw AppError.validation({ items: 'The order subtotal exceeds the maximum supported amount.' });
  if (subtotalCents + delivery.feeCents > MAX_DATABASE_INT) throw AppError.validation({ items: 'The order total exceeds the maximum supported amount.' });
  if (lines.reduce((sum, line) => sum + line.unitCostCents * line.qty, 0) > MAX_DATABASE_INT) {
    throw AppError.validation({ items: 'The order cost exceeds the maximum supported amount.' });
  }
  const needs = mergeNeeds(lines.flatMap((l) => l.needs.map((n) => ({ ...n, itemIndex: l.itemIndex }))));
  return {
    lines,
    subtotalCents,
    deliveryFeeCents: delivery.feeCents,
    totalCents: subtotalCents + delivery.feeCents,
    estimateText: delivery.estimateText,
    purchaseProblems: allProblems,
    needs,
  };
}
