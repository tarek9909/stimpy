import { authModule } from './auth/routes';
import { catalogModule } from './catalog/routes';
import { commsModule } from './comms/routes';
import { contentModule } from './content/routes';
import { customersModule } from './customers/routes';
import { deliveriesModule } from './deliveries/routes';
import { dropsModule } from './drops/routes';
import { financeModule } from './finance/routes';
import { healthModule } from './health/routes';
import { insightsModule } from './insights/routes';
import { optionsModule } from './options/routes';
import { ordersModule } from './orders/routes';
import { overviewModule } from './overview/routes';
import { settingsModule } from './settings/routes';
import { stockModule } from './stock/routes';
import { uploadsModule } from './uploads/routes';
import type { ModuleDef } from './module';

/**
 * THE module registry. To add endpoints to a module, edit its routes.ts: it is already listed here.
 * To add a new module, create modules/<name>/routes.ts exporting a ModuleDef and add it to this array.
 */
export const modules: ModuleDef[] = [
  healthModule,
  authModule,
  optionsModule,
  catalogModule,
  uploadsModule,
  dropsModule,
  ordersModule,
  stockModule,
  deliveriesModule,
  customersModule,
  financeModule,
  insightsModule,
  contentModule,
  commsModule,
  settingsModule,
  overviewModule,
];
