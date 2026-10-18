/** Focuses (and optionally selects) an element as soon as it mounts. */
export function autofocus(node: HTMLInputElement | HTMLTextAreaElement, select: boolean = false) {
  node.focus();
  if (select) node.select();
}
