/**
 * Lucide icon map for every SPA route in lib/nav.ts _BASE_NAV.
 * Size 18 × 18, strokeWidth 1.75. Called by: AppShell.tsx navIcon(n.to).
 */
import {
  AlertTriangle, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Award,
  BadgeDollarSign, BadgePercent, BookMarked, BookOpen, Box, Bookmark,
  Briefcase, Building, Building2, Calendar, CalendarClock, ClipboardList,
  ClipboardPlus, CreditCard, FileDown, FileInput, FileMinus, FilePlus2,
  FileSearch, FileSymlink, FileText, FolderOpen, FolderTree, Globe, Grid2x2,
  Hammer, Hash, Landmark, Layers, LayoutDashboard, List, ListOrdered, MapPin,
  Minus, Network, Package, PackageCheck, PackageOpen, Percent, Phone, Printer,
  Receipt, Ruler, ScrollText, Settings, Shield, ShoppingBag, ShoppingCart,
  Star, Store, Tag, Target, Truck, UserCog, Users, Users2, UsersRound,
  Wallet, Warehouse, Zap,
  type LucideIcon,
} from "lucide-react";

import type { ReactNode } from "react";

const SZ = 18;
const SW = 1.75;

function ico(C: LucideIcon): ReactNode {
  return <C size={SZ} strokeWidth={SW} />;
}

/** Returns the Lucide icon node for a given route `to`. */
export function navIcon(to: string): ReactNode {
  switch (to) {
    case "/":                               return ico(LayoutDashboard);
    // Sales
    case "/customers":                      return ico(Users);
    case "/orders":                         return ico(ShoppingBag);
    case "/quotations":                     return ico(FileText);
    case "/delivery-notes":                 return ico(Truck);
    case "/invoices":                       return ico(Receipt);
    case "/payments":                       return ico(CreditCard);
    case "/receivables":                    return ico(ArrowDownLeft);
    case "/leads":                          return ico(Target);
    // Purchase
    case "/suppliers":                      return ico(Building2);
    case "/supplier-quotations":            return ico(FileInput);
    case "/purchase-orders":               return ico(ShoppingCart);
    case "/purchase-receipts":             return ico(PackageCheck);
    case "/incoming-invoices":             return ico(FileDown);
    case "/purchase-invoices":             return ico(FileMinus);
    case "/payables":                       return ico(ArrowUpRight);
    // Stock
    case "/stock-entries":                  return ico(PackageOpen);
    case "/stock-reconciliations":          return ico(ClipboardList);
    case "/material-requests":              return ico(ClipboardPlus);
    case "/serial-nos":                     return ico(Hash);
    case "/batches":                        return ico(Layers);
    case "/landed-cost-vouchers":           return ico(Package);
    case "/boms":                           return ico(List);
    case "/work-orders":                    return ico(Hammer);
    case "/pick-lists":                     return ico(ListOrdered);
    // Accounting
    case "/journals":                       return ico(BookOpen);
    case "/bank-accounts":                  return ico(Landmark);
    case "/modes-of-payment":              return ico(Wallet);
    case "/bank-reconciliation":            return ico(ArrowLeftRight);
    case "/fiscal-years":                   return ico(Calendar);
    case "/accounts":                       return ico(BookMarked);
    case "/currency-exchanges":             return ico(Globe);
    case "/reports":                        return ico(FileSearch);
    // Masters
    case "/catalogue/items":               return ico(Tag);
    case "/catalogue/item-groups":         return ico(Grid2x2);
    case "/catalogue/brands":              return ico(Bookmark);
    case "/catalogue/uoms":                return ico(Ruler);
    case "/warehouses":                     return ico(Warehouse);
    case "/price-lists":                    return ico(BadgeDollarSign);
    case "/payment-terms-templates":        return ico(CalendarClock);
    case "/tax-templates":                  return ico(FilePlus2);
    case "/tax-categories":                 return ico(FolderOpen);
    case "/item-tax-templates":             return ico(FileSymlink);
    case "/pricing-rules":                  return ico(Percent);
    case "/customer-groups":               return ico(UsersRound);
    case "/supplier-groups":               return ico(Building);
    case "/territories":                    return ico(Globe);
    case "/addresses":                      return ico(MapPin);
    case "/contacts":                       return ico(Phone);
    case "/terms-and-conditions":           return ico(ScrollText);
    // Compliance
    case "/vat-201":                        return ico(BadgePercent);
    case "/ct-filings":                     return ico(Shield);
    case "/esr":                            return ico(FileSearch);
    case "/ubo":                            return ico(UserCog);
    case "/late-filings":                   return ico(AlertTriangle);
    case "/e-invoice-log":                  return ico(Zap);
    case "/tax-settings":                   return ico(Settings);
    case "/uae-related-parties":            return ico(Network);
    case "/uae-vat-groups":                 return ico(Users2);
    case "/uae-bad-debt-relief":            return ico(Minus);
    case "/uae-customs-declarations":       return ico(Package);
    case "/uae-capital-goods-adjustments":  return ico(Briefcase);
    // POS
    case "/pos-invoices":                   return ico(Printer);
    case "/pos-profiles":                   return ico(Store);
    case "/loyalty-programs":               return ico(Star);
    case "/loyalty-point-entries":          return ico(Award);
    // Fixed assets
    case "/assets":                         return ico(Box);
    case "/asset-categories":              return ico(FolderTree);
    // Company
    case "/team":                           return ico(Users);
    default:                                return null;
  }
}
