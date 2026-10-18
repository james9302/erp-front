import { Routes } from '@angular/router';
import { permGuard, signedInGuard } from './core/guards';

const p = (perm: string | string[]) => ({ perm });

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login').then(m => m.LoginPage) },
  {
    path: '', canActivate: [signedInGuard], loadComponent: () => import('./shell/shell').then(m => m.Shell), canActivateChild: [permGuard],
    children: [
      { path: '', loadComponent: () => import('./pages/home').then(m => m.HomePage) },
      { path: 'forbidden', loadComponent: () => import('./pages/home').then(m => m.ForbiddenPage) },
      // setup
      { path: 'companies', data: p('company.view'), loadComponent: () => import('./pages/setup/companies').then(m => m.CompaniesPage) },
      { path: 'suppliers', data: p('supplier.view'), loadComponent: () => import('./pages/setup/suppliers').then(m => m.SuppliersPage) },
      { path: 'terms', data: p('term.view'), loadComponent: () => import('./pages/setup/terms').then(m => m.TermsPage) },
      { path: 'deals', data: p('deal.view'), loadComponent: () => import('./pages/setup/deals').then(m => m.DealsPage) },
      { path: 'parties', data: p('party.view'), loadComponent: () => import('./pages/setup/parties').then(m => m.PartiesPage) },
      // stock
      { path: 'purchase-orders', data: p('po.view'), loadComponent: () => import('./pages/stock/purchase-orders').then(m => m.PurchaseOrdersPage) },
      { path: 'purchase-orders/:id', data: p('po.view'), loadComponent: () => import('./pages/stock/purchase-order').then(m => m.PurchaseOrderPage) },
      { path: 'receiving', data: p(['po.view', 'gr.receive']), loadComponent: () => import('./pages/stock/receiving').then(m => m.ReceivingPage) },
      { path: 'receiving/:id', data: p(['po.view', 'gr.receive']), loadComponent: () => import('./pages/stock/receipt').then(m => m.ReceiptPage) },
      { path: 'invoices', data: p(['invoice.capture', 'po.view']), loadComponent: () => import('./pages/stock/invoices').then(m => m.InvoicesPage) },
      { path: 'stock', data: p('stock.view'), loadComponent: () => import('./pages/stock/stock-on-hand').then(m => m.StockOnHandPage) },
      { path: 'handover', data: p(['stock.allocate', 'stock.handover_own']), loadComponent: () => import('./pages/stock/handover').then(m => m.HandoverPage) },
      { path: 'sim', data: p('stock.view'), loadComponent: () => import('./pages/stock/sim').then(m => m.SimPage) },
      { path: 'sim/:serial', data: p('stock.view'), loadComponent: () => import('./pages/stock/sim').then(m => m.SimPage) },
      // network and money
      { path: 'network-files', data: p(['files.view', 'files.import']), loadComponent: () => import('./pages/money/network-files').then(m => m.NetworkFilesPage) },
      { path: 'earnings', data: p('earnings.view'), loadComponent: () => import('./pages/money/earnings').then(m => m.EarningsPage) },
      { path: 'earnings/:id', data: p('earnings.view'), loadComponent: () => import('./pages/money/earnings-run').then(m => m.EarningsRunPage) },
      { path: 'accounts', data: p('ledger.view'), loadComponent: () => import('./pages/money/accounts').then(m => m.AccountsPage) },
      { path: 'accounts/:id', data: p('ledger.view'), loadComponent: () => import('./pages/money/account').then(m => m.AccountPage) },
      { path: 'statements', data: p('ledger.view'), loadComponent: () => import('./pages/money/statements').then(m => m.StatementsPage) },
      { path: 'statements/runs/:id', data: p('ledger.view'), loadComponent: () => import('./pages/money/statement-run').then(m => m.StatementRunPage) },
      { path: 'statements/:id', data: p(['ledger.view', 'stock.handover_own']), loadComponent: () => import('./pages/money/statement').then(m => m.StatementPage) },
      // field
      { path: 'shops', data: p(['party.view', 'shop.visit']), loadComponent: () => import('./pages/field/shops').then(m => m.ShopsPage) },
      { path: 'route-plans', data: p(['route.view', 'route.plan']), loadComponent: () => import('./pages/field/route-plans').then(m => m.RoutePlansPage) },
      { path: 'route-plans/:id', data: p(['route.view', 'route.plan']), loadComponent: () => import('./pages/field/route-plan').then(m => m.RoutePlanPage) },
      { path: 'streets', data: p(['party.view', 'shop.visit']), loadComponent: () => import('./pages/field/streets').then(m => m.StreetsPage) },
      { path: 'vehicles', data: p(['vehicle.manage', 'fuel.approve', 'route.view']), loadComponent: () => import('./pages/field/vehicles').then(m => m.VehiclesPage) },
      { path: 'fuel-claims', data: p(['fuel.approve', 'vehicle.manage']), loadComponent: () => import('./pages/field/fuel-claims').then(m => m.FuelClaimsPage) },
      // dashboards
      { path: 'dash/coverage', data: p(['party.view', 'route.view']), loadComponent: () => import('./pages/dash/coverage').then(m => m.CoverageDashPage) },
      { path: 'dash/pnl', data: p('earnings.view'), loadComponent: () => import('./pages/dash/pnl').then(m => m.PnlDashPage) },
      { path: 'dash/earnings', data: p('earnings.view'), loadComponent: () => import('./pages/dash/earnings').then(m => m.EarningsDashPage) },
      { path: 'dash/stock', data: p(['stock.view', 'files.view']), loadComponent: () => import('./pages/dash/stock').then(m => m.StockDashPage) },
      // admin
      { path: 'users', data: p(['user.manage', 'role.manage']), loadComponent: () => import('./pages/admin/users').then(m => m.UsersPage) },
      { path: 'audit', data: p('audit.view'), loadComponent: () => import('./pages/admin/audit').then(m => m.AuditPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
