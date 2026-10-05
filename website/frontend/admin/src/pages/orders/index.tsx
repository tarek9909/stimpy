import { Route, Routes } from 'react-router-dom';
import { NotFoundState } from '../../components/QueryBoundary';
import { NewOrder } from './NewOrder';
import { OrderDetail } from './OrderDetail';
import { OrdersList } from './OrdersList';
import { PrintInvoice, PrintLabel, PrintSheet } from './PrintViews';

/**
 * Orders area (dashboard-pages 5-6): list, `/orders/new`, `/orders/print?ids=` (delivery sheet),
 * `/orders/:id` (detail) and `/orders/:id/label` (print label), `/orders/:id/invoice`. Declared inside the area so
 * the app router only knows `orders/*`.
 */
export default function OrdersPage() {
  return (
    <Routes>
      <Route index element={<OrdersList />} />
      <Route path="new" element={<NewOrder />} />
      <Route path="print" element={<PrintSheet />} />
      <Route path=":id" element={<OrderDetail />} />
      <Route path=":id/label" element={<PrintLabel />} />
      <Route path=":id/invoice" element={<PrintInvoice />} />
      <Route path="*" element={<NotFoundState what="page" backTo="/orders" backLabel="Back to orders" />} />
    </Routes>
  );
}
