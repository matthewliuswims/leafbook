export function launchTarget(label) {
  return `gui/${process.getuid()}/${label}`;
}
