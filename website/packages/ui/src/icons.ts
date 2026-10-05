/**
 * The only place lucide icons are imported (named imports: tree-shaken per icon).
 * Stroke 2px at 24px, `currentColor`, no filled variants (design-system section 8).
 * Re-exported so the apps use the same icon set without a second dependency.
 */
export {
  AlertCircle,
  AlertTriangle,
  Banknote,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock,
  Copy,
  ExternalLink,
  ImageOff,
  Inbox,
  Info,
  Loader2,
  MessageCircle,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Truck,
  Undo2,
  Video,
  X,
  XCircle,
} from 'lucide-react';
export type { LucideIcon, LucideProps } from 'lucide-react';
