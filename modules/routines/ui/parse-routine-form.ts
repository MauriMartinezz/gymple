/** What the routine form submits, as strings, so it can be shown again on error. */
export interface RoutineItemFormValues {
  exerciseId: string;
  targetSets: string;
  targetRepsMin: string;
  targetRepsMax: string;
  restSeconds: string;
  notes: string;
}

export interface RoutineFormValues {
  name: string;
  description: string;
  items: RoutineItemFormValues[];
}

export const ITEM_FIELDS = [
  "exerciseId",
  "targetSets",
  "targetRepsMin",
  "targetRepsMax",
  "restSeconds",
  "notes",
] as const satisfies ReadonlyArray<keyof RoutineItemFormValues>;

type ItemField = (typeof ITEM_FIELDS)[number];

/** Only `items.<index>.<known field>`; no leading zeros, so two keys never alias one item. */
const ITEM_KEY = new RegExp(`^items\\.(0|[1-9]\\d{0,8})\\.(${ITEM_FIELDS.join("|")})$`);

export function emptyItemValues(): RoutineItemFormValues {
  return { exerciseId: "", targetSets: "", targetRepsMin: "", targetRepsMax: "", restSeconds: "", notes: "" };
}

/** The form name of one item control, e.g. `items.2.targetSets`. */
export function itemFieldName(index: number, field: ItemField): string {
  return `items.${index}.${field}`;
}

/**
 * Reads indexed `items.N.field` entries into an ordered list. Items are sorted
 * by index and gaps are closed; malformed keys and unknown fields are ignored.
 */
export function readRoutineForm(formData: FormData): RoutineFormValues {
  const byIndex = new Map<number, RoutineItemFormValues>();
  for (const [key, value] of formData.entries()) {
    const match = ITEM_KEY.exec(key);
    if (!match) continue;
    const index = Number(match[1]);
    const item = byIndex.get(index) ?? emptyItemValues();
    item[match[2] as ItemField] = typeof value === "string" ? value : "";
    byIndex.set(index, item);
  }

  const items = [...byIndex.entries()].sort(([a], [b]) => a - b).map(([, item]) => item);
  return { name: text(formData, "name"), description: text(formData, "description"), items };
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
