export function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(1, Math.floor((now - then) / 1000)); // seconds
  const map: [number,string][] = [
    [60, "s"], [60, "m"], [24, "h"], [7, "d"], [4.345, "w"], [12, "mo"], [Number.POSITIVE_INFINITY, "y"],
  ];
  let val = diff; let unit = "s";
  const steps = [60,60,24,7,4.345,12];
  for (let i=0;i<steps.length;i++) {
    if (val < steps[i]) break;
    val = Math.floor(val / steps[i]); unit = map[i+1][1];
  }
  return `${val}${unit} ago`;
}
