import type { TripwireCreateInput } from "@/lib/tripwires/types";

export const TEMPLATE_VAULT_APPROACHING: TripwireCreateInput = {
  label: "Vault approaching threshold",
  rationale:
    "Alert when vault reserve approaches activation so I can watch GI sustain before Fountain.",
  source: { kind: "terminal:vault.balance" },
  condition: { op: "gte", threshold: 45 },
  action: { journal: true, push: true },
  cooldown_seconds: 86400,
  status: "armed",
};

export const TEMPLATE_GI_DEGRADED: TripwireCreateInput = {
  label: "GI below yellow band",
  rationale:
    "GI below 0.70 indicates degraded substrate; investigate which lane drove it.",
  source: { kind: "terminal:integrity.gi" },
  condition: { op: "lt", threshold: 0.7 },
  action: { journal: true, push: true },
  cooldown_seconds: 3600,
  status: "armed",
};

export const TEMPLATE_DAEDALUS_SELF_PING: TripwireCreateInput = {
  label: "DAEDALUS-µ5 self-ping low",
  rationale:
    "Deployment health self-ping; below 0.8 suggests infra checks are partially blocked.",
  source: { kind: "terminal:micro-agent.value", param: "DAEDALUS-µ5" },
  condition: { op: "lt", threshold: 0.8 },
  action: { journal: true, push: false },
  cooldown_seconds: 21600,
  status: "armed",
};

export const STARTER_TEMPLATES: Array<{
  id: string;
  label: string;
  description: string;
  template: TripwireCreateInput;
}> = [
  {
    id: "vault-approaching",
    label: "Vault approaching threshold",
    description: "Fires when reserve ≥ 45 (tune threshold to your terminal vault scale).",
    template: TEMPLATE_VAULT_APPROACHING,
  },
  {
    id: "gi-degraded",
    label: "GI below yellow band",
    description: "Fires when global integrity &lt; 0.70. One-hour cooldown.",
    template: TEMPLATE_GI_DEGRADED,
  },
  {
    id: "daedalus-self-ping",
    label: "DAEDALUS-µ5 self-ping",
    description: "Fires when micro-agent signal &lt; 0.8. Journal only.",
    template: TEMPLATE_DAEDALUS_SELF_PING,
  },
];
