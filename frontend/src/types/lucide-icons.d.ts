// Per-icon deep imports keep the client bundle to the icons actually used.
declare module "lucide-react/dist/esm/icons/*" {
  import type { LucideIcon } from "lucide-react";

  const icon: LucideIcon;
  export default icon;
}
